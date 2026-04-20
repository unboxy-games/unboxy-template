import Phaser from 'phaser';
import { Unboxy } from '@unboxy/phaser-sdk';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { GAME_WIDTH, GAME_HEIGHT } from './config';
import VirtualJoystickPlugin from 'phaser3-rex-plugins/plugins/virtualjoystick-plugin.js';

// Connect to the Unboxy platform (identity + save data) in parallel with
// game startup. Scenes read from this promise so they can cold-start
// immediately and hydrate save state once the handshake completes.
export const unboxyReady = Unboxy.init({ standaloneGameId: 'unboxy-intro' })
  .then((u) => {
    console.log('[unboxy] connected', { host: u.host, user: u.user, gameId: u.gameId });
    return u;
  })
  .catch((err) => {
    console.warn('[unboxy] init failed', err);
    return null;
  });

// Use Phaser directly (not createUnboxyGame) so we can register rex plugins
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  backgroundColor: '#1a1a2e',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  render: {
    preserveDrawingBuffer: true,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  plugins: {
    global: [
      {
        key: 'rexVirtualJoystick',
        plugin: VirtualJoystickPlugin,
        start: true,
      },
    ],
  },
  scene: [BootScene, GameScene, UIScene],
};

const game = new Phaser.Game(config);
(window as any).__PHASER_GAME__ = game;
