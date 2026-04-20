import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    // Generate player ship texture
    const playerGfx = this.add.graphics();
    // Main body (white/blue)
    playerGfx.fillStyle(0x00aaff);
    playerGfx.fillRect(8, 4, 16, 20);
    // Nose
    playerGfx.fillStyle(0xffffff);
    playerGfx.fillTriangle(16, 0, 10, 8, 22, 8);
    // Wings
    playerGfx.fillStyle(0x0066cc);
    playerGfx.fillRect(2, 16, 8, 8);
    playerGfx.fillRect(22, 16, 8, 8);
    // Wing tips (red)
    playerGfx.fillStyle(0xff4444);
    playerGfx.fillRect(0, 20, 4, 4);
    playerGfx.fillRect(28, 20, 4, 4);
    // Engine glow
    playerGfx.fillStyle(0xffaa00);
    playerGfx.fillRect(12, 24, 8, 4);
    playerGfx.generateTexture('player', 32, 28);
    playerGfx.destroy();

    // Generate enemy textures (3 types with different colors)
    const enemyColors = [
      { main: 0xff4444, wing: 0xcc0000, name: 'enemy_red' },    // top row
      { main: 0xaa44ff, wing: 0x7700cc, name: 'enemy_purple' }, // middle rows
      { main: 0x4488ff, wing: 0x0044cc, name: 'enemy_blue' },   // bottom rows
    ];

    for (const ec of enemyColors) {
      const g = this.add.graphics();
      // Body
      g.fillStyle(ec.main);
      g.fillRect(8, 4, 12, 14);
      // Head/top
      g.fillStyle(0xffff44);
      g.fillRect(11, 0, 6, 6);
      // Wings (spread out like bug wings)
      g.fillStyle(ec.wing);
      g.fillTriangle(0, 18, 8, 6, 8, 18);
      g.fillTriangle(28, 18, 20, 6, 20, 18);
      // Eyes
      g.fillStyle(0xffffff);
      g.fillRect(10, 6, 3, 3);
      g.fillRect(15, 6, 3, 3);
      // Antennae
      g.fillStyle(ec.main);
      g.fillRect(6, 0, 2, 4);
      g.fillRect(20, 0, 2, 4);
      g.generateTexture(ec.name, 28, 20);
      g.destroy();
    }

    // Flagship (commander) — bigger, more detailed
    const fg = this.add.graphics();
    fg.fillStyle(0xff6600);
    fg.fillRect(10, 4, 16, 18);
    fg.fillStyle(0xffcc00);
    fg.fillTriangle(18, 0, 12, 8, 24, 8);
    fg.fillStyle(0xff4400);
    fg.fillTriangle(0, 22, 10, 8, 10, 22);
    fg.fillTriangle(36, 22, 26, 8, 26, 22);
    fg.fillStyle(0xffffff);
    fg.fillRect(13, 8, 4, 4);
    fg.fillRect(19, 8, 4, 4);
    fg.fillStyle(0xff0000);
    fg.fillRect(14, 9, 2, 2);
    fg.fillRect(20, 9, 2, 2);
    fg.generateTexture('enemy_flagship', 36, 24);
    fg.destroy();

    // Bullet texture (player)
    const bulletGfx = this.add.graphics();
    bulletGfx.fillStyle(0xffff00);
    bulletGfx.fillRect(0, 0, 3, 10);
    bulletGfx.fillStyle(0xffffff);
    bulletGfx.fillRect(1, 0, 1, 4);
    bulletGfx.generateTexture('bullet', 3, 10);
    bulletGfx.destroy();

    // Enemy bullet
    const eBulletGfx = this.add.graphics();
    eBulletGfx.fillStyle(0xff4444);
    eBulletGfx.fillRect(0, 0, 3, 8);
    eBulletGfx.fillStyle(0xffaa00);
    eBulletGfx.fillRect(1, 0, 1, 3);
    eBulletGfx.generateTexture('enemy_bullet', 3, 8);
    eBulletGfx.destroy();

    // Explosion particles
    const expGfx = this.add.graphics();
    expGfx.fillStyle(0xffffff);
    expGfx.fillRect(0, 0, 4, 4);
    expGfx.generateTexture('particle', 4, 4);
    expGfx.destroy();

    // Star particle
    const starGfx = this.add.graphics();
    starGfx.fillStyle(0xffffff);
    starGfx.fillRect(0, 0, 2, 2);
    starGfx.generateTexture('star', 2, 2);
    starGfx.destroy();

    this.scene.start('GameScene');
  }
}
