import Phaser from 'phaser';
import { GAME_WIDTH } from '../config';
import { unboxyReady } from '../main';

const HIGH_SCORE_KEY = 'highScore';

export class UIScene extends Phaser.Scene {
  private scoreText!: Phaser.GameObjects.Text;
  private highScoreText!: Phaser.GameObjects.Text;
  private livesIcons: Phaser.GameObjects.Image[] = [];
  private waveText!: Phaser.GameObjects.Text;
  private gameOverContainer!: Phaser.GameObjects.Container;
  private highScore = 0;
  private authText?: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'UIScene' });
  }

  create(): void {
    const game = this.scene.get('GameScene');

    // Score
    this.scoreText = this.add.text(20, 12, '0', {
      fontSize: '24px',
      color: '#ff4444',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    });

    // High score label
    this.add.text(GAME_WIDTH / 2, 4, 'HIGH SCORE', {
      fontSize: '14px',
      color: '#ff4444',
      fontFamily: 'monospace',
    }).setOrigin(0.5, 0);

    this.highScoreText = this.add.text(GAME_WIDTH / 2, 20, '0', {
      fontSize: '24px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    // Wave indicator
    this.waveText = this.add.text(GAME_WIDTH - 20, 12, 'WAVE 1', {
      fontSize: '18px',
      color: '#44aaff',
      fontFamily: 'monospace',
    }).setOrigin(1, 0);

    // Game over overlay (hidden)
    this.gameOverContainer = this.add.container(GAME_WIDTH / 2, 300);
    this.gameOverContainer.setVisible(false);

    const goText = this.add.text(0, 0, 'GAME OVER', {
      fontSize: '48px',
      color: '#ff4444',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const restartText = this.add.text(0, 60, 'PRESS SPACE TO RESTART', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    const finalScoreText = this.add.text(0, 100, '', {
      fontSize: '22px',
      color: '#ffff44',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.gameOverContainer.add([goText, restartText, finalScoreText]);

    // Auth-state indicator (bottom-left), populated once Unboxy.init settles.
    this.authText = this.add.text(10, this.scale.height - 22, '', {
      fontSize: '11px',
      color: '#666666',
      fontFamily: 'monospace',
    });

    // Load the persisted high score. Works identically whether we're inside
    // unboxy-home-ui (backend-backed) or standalone (localStorage fallback).
    unboxyReady
      .then(async (unboxy) => {
        if (!unboxy) return;
        this.authText?.setText(
          unboxy.isAuthenticated
            ? `unboxy · ${unboxy.host} · ${unboxy.user!.name}`
            : `unboxy · ${unboxy.host} · anonymous`,
        );
        const stored = await unboxy.saves.get<number>(HIGH_SCORE_KEY);
        if (typeof stored === 'number' && stored > this.highScore) {
          this.highScore = stored;
          this.highScoreText.setText(stored.toString());
        }
      })
      .catch((err) => console.warn('[unboxy] load highScore failed', err));

    // Listen for events from GameScene
    game.events.on('score', (points: number) => {
      this.scoreText.setText(points.toString());
      if (points > this.highScore) {
        this.highScore = points;
        this.highScoreText.setText(points.toString());
        // Fire-and-forget — a failed save should not block gameplay.
        unboxyReady
          .then((u) => { if (u) return u.saves.set(HIGH_SCORE_KEY, points); })
          .catch((err) => console.warn('[unboxy] save highScore failed', err));
      }
    });

    game.events.on('lives', (lives: number) => {
      this.updateLives(lives);
    });

    game.events.on('wave', (wave: number) => {
      this.waveText.setText(`WAVE ${wave}`);
      // Flash wave text
      this.tweens.add({
        targets: this.waveText,
        scale: { from: 1.5, to: 1 },
        alpha: { from: 0.5, to: 1 },
        duration: 500,
      });
    });

    game.events.on('gameover', (finalScore: number) => {
      (this.gameOverContainer.getAt(2) as Phaser.GameObjects.Text)
        .setText(`FINAL SCORE: ${finalScore}`);

      // Update restart text for mobile
      const isMobile = !this.sys.game.device.os.desktop;
      (this.gameOverContainer.getAt(1) as Phaser.GameObjects.Text)
        .setText(isMobile ? 'TAP TO RESTART' : 'PRESS SPACE TO RESTART');

      this.gameOverContainer.setVisible(true);
      this.gameOverContainer.setAlpha(0);
      this.tweens.add({
        targets: this.gameOverContainer,
        alpha: 1,
        duration: 1000,
      });

      const restart = () => {
        this.gameOverContainer.setVisible(false);
        this.scene.stop('UIScene');
        this.scene.stop('GameScene');
        this.scene.start('GameScene');
      };

      // Listen for restart — keyboard or tap (with delay to prevent accidental restart)
      this.time.delayedCall(1000, () => {
        this.input.keyboard!.once('keydown-SPACE', restart);
        this.input.once('pointerdown', restart);
      });
    });
  }

  private updateLives(lives: number): void {
    this.livesIcons.forEach(i => i.destroy());
    this.livesIcons = [];
    for (let i = 0; i < lives - 1; i++) {
      const icon = this.add.image(30 + i * 30, 690, 'player');
      icon.setScale(0.8);
      this.livesIcons.push(icon);
    }
  }
}
