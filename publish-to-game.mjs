// Publish unboxy-intro's dist/ into an existing Unboxy game record so it
// can be loaded through the real home-ui flow. Mirrors what the session
// server's uploadDistToS3 + finalizePublish does.
//
// Usage: node publish-to-game.mjs <gameId> [--base-url http://localhost:8080]

import { readFileSync, readdirSync, statSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const gameId = args.find((a) => !a.startsWith('--'));
if (!gameId) {
  console.error('usage: node publish-to-game.mjs <gameId> [--base-url http://localhost:8080]');
  process.exit(1);
}
const baseUrlIdx = args.indexOf('--base-url');
const BASE_URL = baseUrlIdx >= 0 ? args[baseUrlIdx + 1] : 'http://localhost:8080';
const DIST_DIR = path.resolve('dist');

function contentTypeFor(ext) {
  return ext === '.html' ? 'text/html'
    : ext === '.js' ? 'application/javascript'
    : ext === '.css' ? 'text/css'
    : ext === '.png' ? 'image/png'
    : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
    : ext === '.gif' ? 'image/gif'
    : ext === '.svg' ? 'image/svg+xml'
    : ext === '.woff' || ext === '.woff2' ? 'font/woff2'
    : 'application/octet-stream';
}

function collectFiles(dir, base) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const rel = base ? `${base}/${entry}` : entry;
    if (statSync(full).isDirectory()) out.push(...collectFiles(full, rel));
    else out.push({ relativePath: rel, fullPath: full, contentType: contentTypeFor(path.extname(entry).toLowerCase()) });
  }
  return out;
}

const files = collectFiles(DIST_DIR, '');
console.log(`uploading ${files.length} file(s) to game ${gameId}`);

for (const f of files) {
  const presignRes = await fetch(
    `${BASE_URL}/internal/games/${gameId}/presign?path=${encodeURIComponent(f.relativePath)}&prefix=games`,
  );
  if (!presignRes.ok) {
    console.error(`presign failed for ${f.relativePath}: ${presignRes.status}`);
    process.exit(1);
  }
  const { uploadUrl } = await presignRes.json();

  const bytes = readFileSync(f.fullPath);
  const s3Res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': f.contentType },
    body: bytes,
  });
  if (!s3Res.ok) {
    console.error(`S3 upload failed for ${f.relativePath}: ${s3Res.status}`);
    process.exit(1);
  }
  console.log(`  ${f.relativePath} (${bytes.length} bytes, ${f.contentType})`);
}

const publishRes = await fetch(`${BASE_URL}/internal/games/${gameId}/publish`, { method: 'POST' });
if (!publishRes.ok) {
  console.error(`finalize publish failed: ${publishRes.status} ${await publishRes.text()}`);
  process.exit(1);
}
const meta = await publishRes.json();
console.log('\npublished:', meta.publicGameUrl);

// Clean up the session server's workspace dist/ if one exists. Otherwise
// the session server may try to upload that stale dist as a preview and
// the home-ui editor iframe ends up pointing at previews/{gameId}/ which
// no longer reflects what we just published.
const workspacesDir = process.env.WORKSPACES_DIR || '/tmp/unboxy-sessions';
const staleDist = path.join(workspacesDir, gameId, 'dist');
if (existsSync(staleDist)) {
  rmSync(staleDist, { recursive: true, force: true });
  console.log(`cleaned session workspace dist: ${staleDist}`);
}

console.log('\nNote: if you had the game open in home-ui before publishing,');
console.log('the session server may be holding stale state. Reload the page');
console.log('(or restart the session server) to pick up the new publicGameUrl.');
console.log('\nopen home-ui and navigate to the game to test');
