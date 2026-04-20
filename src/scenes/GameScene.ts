import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';

interface EnemyData {
  gridX: number;
  gridY: number;
  homeX: number;
  homeY: number;
  type: string;
  diving: boolean;
  divePhase: number;
  diveStartX: number;
  diveStartY: number;
  diveTime: number;
  points: number;
}

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private stars: Phaser.GameObjects.Image[] = [];
  private lastFired = 0;
  private lives = 3;
  private score = 0;
  private wave = 1;
  private gameOver = false;
  private formationX = 0;
  private formationDir = 1;
  private formationSpeed = 20;
  private diveTimer = 0;
  private diveInterval = 2000;
  private playerDead = false;
  private respawnTimer = 0;

  // Touch controls
  private isTouchDevice = false;
  private joyStick: any = null;
  private joystickKeys: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private fireButtonDown = false;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    this.score = 0;
    this.lives = 3;
    this.wave = 1;
    this.gameOver = false;
    this.formationX = 0;
    this.formationDir = 1;
    this.playerDead = false;
    this.fireButtonDown = false;

    // Detect touch device
    this.isTouchDevice = !this.sys.game.device.os.desktop;

    // Starfield background
    this.stars = [];
    for (let i = 0; i < 80; i++) {
      const star = this.add.image(
        Phaser.Math.Between(0, GAME_WIDTH),
        Phaser.Math.Between(0, GAME_HEIGHT),
        'star'
      );
      star.setAlpha(Phaser.Math.FloatBetween(0.3, 1));
      (star as any).speed = Phaser.Math.FloatBetween(20, 60);
      this.stars.push(star);
    }

    // Player
    this.player = this.physics.add.sprite(GAME_WIDTH / 2, GAME_HEIGHT - 50, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.setScale(1.5);
    // Scale the physics body to match the visual size
    (this.player.body as Phaser.Physics.Arcade.Body).setSize(32, 28).setOffset(0, 0);

    // Bullets
    this.bullets = this.physics.add.group({ maxSize: 5 });
    this.enemyBullets = this.physics.add.group({ maxSize: 20 });

    // Enemies
    this.enemies = this.physics.add.group();
    this.spawnWave();

    // Keyboard input
    this.cursors = this.input.keyboard!.createCursorKeys();

    // Touch controls (only on mobile)
    if (this.isTouchDevice) {
      this.setupTouchControls();
    }

    // Collisions
    this.physics.add.overlap(this.bullets, this.enemies, this.hitEnemy, undefined, this);
    this.physics.add.overlap(this.enemyBullets, this.player, this.hitPlayer, undefined, this);
    this.physics.add.overlap(this.enemies, this.player, this.enemyCollidePlayer, undefined, this);

    // Start UI
    this.scene.launch('UIScene');
    this.events.emit('score', 0);
    this.events.emit('lives', this.lives);
    this.events.emit('wave', this.wave);
  }

  private setupTouchControls(): void {
    // --- Virtual Joystick (left side) ---
    const joyX = 140;
    const joyY = GAME_HEIGHT - 100;
    const baseRadius = 60;
    const thumbRadius = 30;

    const base = this.add.circle(joyX, joyY, baseRadius, 0x888888, 0.3)
      .setStrokeStyle(2, 0xaaaaaa, 0.5)
      .setDepth(1000);

    const thumb = this.add.circle(joyX, joyY, thumbRadius, 0xcccccc, 0.6)
      .setDepth(1001);

    this.joyStick = (this.plugins.get('rexVirtualJoystick') as any).add(this, {
      x: joyX,
      y: joyY,
      radius: baseRadius,
      base,
      thumb,
      dir: 'left&right', // Only horizontal movement for Galaxian
    });

    this.joystickKeys = this.joyStick.createCursorKeys();

    // --- Fire Button (right side) ---
    const btnX = GAME_WIDTH - 120;
    const btnY = GAME_HEIGHT - 100;
    const btnRadius = 45;

    const fireCircle = this.add.circle(btnX, btnY, btnRadius, 0xff4444, 0.4)
      .setStrokeStyle(3, 0xff6666, 0.6)
      .setDepth(1000)
      .setInteractive();

    const fireLabel = this.add.text(btnX, btnY, 'FIRE', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(1001);

    // Track fire button press state
    fireCircle.on('pointerdown', () => {
      this.fireButtonDown = true;
      fireCircle.setFillStyle(0xff6666, 0.7);
      fireLabel.setScale(0.9);
    });

    fireCircle.on('pointerup', () => {
      this.fireButtonDown = false;
      fireCircle.setFillStyle(0xff4444, 0.4);
      fireLabel.setScale(1);
    });

    fireCircle.on('pointerout', () => {
      this.fireButtonDown = false;
      fireCircle.setFillStyle(0xff4444, 0.4);
      fireLabel.setScale(1);
    });

    // Label under joystick
    this.add.text(joyX, joyY + baseRadius + 16, '← MOVE →', {
      fontSize: '12px',
      color: '#888888',
      fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(1000);
  }

  private spawnWave(): void {
    this.enemies.clear(true, true);
    this.formationX = 0;
    this.formationDir = 1;
    this.diveTimer = 0;
    this.diveInterval = Math.max(800, 2000 - this.wave * 150);
    this.formationSpeed = 20 + this.wave * 5;

    const rows = [
      { y: 0, type: 'enemy_flagship', count: 2, spacing: 60, points: 150 },
      { y: 1, type: 'enemy_red', count: 8, spacing: 40, points: 80 },
      { y: 2, type: 'enemy_purple', count: 10, spacing: 36, points: 50 },
      { y: 3, type: 'enemy_purple', count: 10, spacing: 36, points: 50 },
      { y: 4, type: 'enemy_blue', count: 10, spacing: 36, points: 30 },
      { y: 5, type: 'enemy_blue', count: 10, spacing: 36, points: 30 },
    ];

    for (const row of rows) {
      const totalWidth = (row.count - 1) * row.spacing;
      const startX = (GAME_WIDTH - totalWidth) / 2;
      const homeY = 70 + row.y * 36;

      for (let i = 0; i < row.count; i++) {
        const homeX = startX + i * row.spacing;
        const enemy = this.enemies.create(homeX, homeY, row.type) as Phaser.Physics.Arcade.Sprite;
        enemy.setScale(1.2);

        const data: EnemyData = {
          gridX: i,
          gridY: row.y,
          homeX,
          homeY,
          type: row.type,
          diving: false,
          divePhase: 0,
          diveStartX: 0,
          diveStartY: 0,
          diveTime: 0,
          points: row.points,
        };
        enemy.setData('d', data);
      }
    }
  }

  private fire(): void {
    if (this.playerDead || this.gameOver) return;
    const now = this.time.now;
    if (now - this.lastFired < 300) return;

    const bullet = this.bullets.get(this.player.x, this.player.y - 20, 'bullet') as Phaser.Physics.Arcade.Sprite;
    if (!bullet) return;

    bullet.setActive(true).setVisible(true);
    bullet.body!.enable = true;
    bullet.setVelocityY(-400);
    this.lastFired = now;
  }

  private enemyFire(enemy: Phaser.Physics.Arcade.Sprite): void {
    const bullet = this.enemyBullets.get(enemy.x, enemy.y + 12, 'enemy_bullet') as Phaser.Physics.Arcade.Sprite;
    if (!bullet) return;
    bullet.setActive(true).setVisible(true);
    bullet.body!.enable = true;

    // Aim toward player
    const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
    const speed = 200 + this.wave * 20;
    bullet.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  private hitEnemy(obj1: any, obj2: any): void {
    const bullet = obj1 as Phaser.Physics.Arcade.Sprite;
    const enemy = obj2 as Phaser.Physics.Arcade.Sprite;

    if (!bullet.active || !enemy.active) return;

    this.deactivateSprite(bullet);

    const data = enemy.getData('d') as EnemyData;
    const points = data?.points ?? 30;
    const ex = enemy.x, ey = enemy.y;

    this.deactivateSprite(enemy);
    enemy.destroy();

    this.score += points;
    this.events.emit('score', this.score);
    this.spawnExplosion(ex, ey);

    // Check wave clear
    if (this.enemies.countActive() === 0) {
      this.wave++;
      this.events.emit('wave', this.wave);
      this.time.delayedCall(1500, () => {
        if (!this.gameOver) this.spawnWave();
      });
    }
  }

  private spawnExplosion(x: number, y: number): void {
    const colors = [0xffffff, 0xffff00, 0xff8800, 0xff4400];
    for (let i = 0; i < 12; i++) {
      const p = this.add.image(x, y, 'particle');
      p.setTint(Phaser.Utils.Array.GetRandom(colors));
      p.setScale(Phaser.Math.FloatBetween(0.5, 1.5));
      this.tweens.add({
        targets: p,
        x: x + Phaser.Math.Between(-40, 40),
        y: y + Phaser.Math.Between(-40, 40),
        alpha: 0,
        scale: 0,
        duration: Phaser.Math.Between(200, 500),
        onComplete: () => p.destroy(),
      });
    }
  }

  private hitPlayer(obj1: any, obj2: any): void {
    if (this.playerDead) return;
    // overlap(enemyBullets, player) → obj1=bullet, obj2=player
    const bullet = obj1 as Phaser.Physics.Arcade.Sprite;
    if (!bullet.active) return;
    this.deactivateSprite(bullet);
    this.killPlayer();
  }

  private enemyCollidePlayer(obj1: any, obj2: any): void {
    if (this.playerDead) return;
    // overlap(enemies, player) → obj1=enemy, obj2=player
    const enemy = obj1 as Phaser.Physics.Arcade.Sprite;
    if (!enemy.active) return;
    const ex = enemy.x, ey = enemy.y;
    this.deactivateSprite(enemy);
    enemy.destroy();
    this.spawnExplosion(ex, ey);
    this.killPlayer();
  }

  private updateStars(delta: number): void {
    for (const star of this.stars) {
      star.y += (star as any).speed * (delta / 1000);
      if (star.y > GAME_HEIGHT) {
        star.y = 0;
        star.x = Phaser.Math.Between(0, GAME_WIDTH);
      }
    }
  }

  private deactivateSprite(sprite: Phaser.Physics.Arcade.Sprite): void {
    sprite.setActive(false).setVisible(false);
    try {
      if (sprite.body) (sprite.body as Phaser.Physics.Arcade.Body).enable = false;
    } catch { /* already destroyed */ }
  }

  private killPlayer(): void {
    if (this.playerDead) return; // prevent double-kill
    this.playerDead = true;
    this.spawnExplosion(this.player.x, this.player.y);
    this.player.setVisible(false);
    this.player.setActive(false);
    const body = this.player.body as Phaser.Physics.Arcade.Body | null;
    if (body) body.enable = false;

    this.lives--;
    this.events.emit('lives', this.lives);

    if (this.lives <= 0) {
      this.gameOver = true;
      this.events.emit('gameover', this.score);
    } else {
      this.respawnTimer = 1500;
    }
  }

  private respawnPlayer(): void {
    this.playerDead = false;
    this.player.setPosition(GAME_WIDTH / 2, GAME_HEIGHT - 50);
    this.player.setActive(true);
    this.player.setVisible(true);
    const body = this.player.body as Phaser.Physics.Arcade.Body | null;
    if (body) body.enable = true;

    // Brief invincibility flash
    this.tweens.add({
      targets: this.player,
      alpha: { from: 0.3, to: 1 },
      duration: 100,
      repeat: 10,
    });
  }

  private startDive(enemy: Phaser.Physics.Arcade.Sprite): void {
    const data = enemy.getData('d') as EnemyData;
    if (data.diving) return;
    data.diving = true;
    data.divePhase = 0;
    data.diveStartX = enemy.x;
    data.diveStartY = enemy.y;
    data.diveTime = 0;
    // Lock target at dive start so the curve doesn't jitter
    (data as any).diveTargetX = this.playerDead ? enemy.x : this.player.x;

    // Fire when starting dive
    this.enemyFire(enemy);
  }

  update(_time: number, delta: number): void {
    // Always scroll stars (even during game over)
    this.updateStars(delta);

    // Player movement (skip if dead or game over)
    if (!this.playerDead && !this.gameOver && this.player.body) {
      const speed = 300;
      const kbLeft = this.cursors.left.isDown;
      const kbRight = this.cursors.right.isDown;
      const jsLeft = this.joystickKeys?.left.isDown ?? false;
      const jsRight = this.joystickKeys?.right.isDown ?? false;

      if (kbLeft || jsLeft) {
        this.player.setVelocityX(-speed);
      } else if (kbRight || jsRight) {
        this.player.setVelocityX(speed);
      } else {
        this.player.setVelocityX(0);
      }

      if (this.cursors.space.isDown || this.cursors.up.isDown || this.fireButtonDown) {
        this.fire();
      }
    }

    // Respawn timer (not during game over)
    if (this.playerDead && !this.gameOver && this.respawnTimer > 0) {
      this.respawnTimer -= delta;
      if (this.respawnTimer <= 0) {
        this.respawnPlayer();
      }
    }

    // Formation movement (side to side)
    this.formationX += this.formationDir * this.formationSpeed * (delta / 1000);
    if (Math.abs(this.formationX) > 50) {
      this.formationDir *= -1;
    }

    // Update enemies
    const activeEnemies = this.enemies.getChildren().filter(e => e.active) as Phaser.Physics.Arcade.Sprite[];

    for (const enemy of activeEnemies) {
      const data = enemy.getData('d') as EnemyData;

      if (!data.diving) {
        // Follow formation
        enemy.setPosition(data.homeX + this.formationX, data.homeY);
      } else {
        // Dive attack
        data.diveTime += delta;
        const t = data.diveTime / 3000; // 3 seconds for full dive

        if (t < 0.5) {
          // Phase 1: Swoop down toward player (0 → 0.5)
          const st = t / 0.5; // normalize to 0-1
          const targetX = (data as any).diveTargetX;
          const midX = data.diveStartX + (targetX > data.diveStartX ? 120 : -120);

          // Bezier curve: start → curve out → swoop toward player
          const p0x = data.diveStartX;
          const p0y = data.diveStartY;
          const p1x = midX;
          const p1y = (data.diveStartY + GAME_HEIGHT) / 2;
          const p2x = targetX;
          const p2y = GAME_HEIGHT - 30;

          const mt = 1 - st;
          const x = mt * mt * p0x + 2 * mt * st * p1x + st * st * p2x;
          const y = mt * mt * p0y + 2 * mt * st * p1y + st * st * p2y;
          enemy.setPosition(x, y);

          // Fire mid-dive
          if (data.divePhase === 0 && st > 0.5) {
            data.divePhase = 1;
            this.enemyFire(enemy);
          }
        } else if (t < 1) {
          // Phase 2: Loop back up to formation (0.5 → 1)
          const st = (t - 0.5) / 0.5; // normalize to 0-1
          const targetX = (data as any).diveTargetX;
          const homeX = data.homeX + this.formationX;

          // Curve from bottom back up to formation
          const x = targetX + (homeX - targetX) * st;
          const startY = GAME_HEIGHT - 30;
          // Go off bottom, wrap to top, come back down to home
          const y = startY + (GAME_HEIGHT + 50 - startY) * st * 0.3 // go slightly below
            + (data.homeY - startY) * st * st; // ease into home position

          // Simpler: just lerp with easing
          const easedT = st * st; // ease in
          const lerpX = targetX + (homeX - targetX) * easedT;
          const lerpY = (GAME_HEIGHT - 30) + (data.homeY - (GAME_HEIGHT - 30)) * easedT;
          enemy.setPosition(lerpX, lerpY);
        } else {
          // Done diving, snap to formation
          data.diving = false;
          enemy.setPosition(data.homeX + this.formationX, data.homeY);
        }
      }
    }

    // Trigger dives (not during game over)
    if (!this.gameOver) this.diveTimer += delta;
    if (!this.gameOver && this.diveTimer >= this.diveInterval && activeEnemies.length > 0) {
      this.diveTimer = 0;
      // Pick a random non-diving enemy
      const available = activeEnemies.filter(e => !(e.getData('d') as EnemyData).diving);
      if (available.length > 0) {
        const diver = Phaser.Utils.Array.GetRandom(available);
        this.startDive(diver);
      }
    }

    // Clean up off-screen bullets
    this.bullets.getChildren().forEach(b => {
      const bullet = b as Phaser.Physics.Arcade.Sprite;
      if (bullet.active && bullet.y < -10) {
        bullet.setActive(false).setVisible(false);
        bullet.body!.enable = false;
      }
    });
    this.enemyBullets.getChildren().forEach(b => {
      const bullet = b as Phaser.Physics.Arcade.Sprite;
      if (bullet.active && (bullet.y > GAME_HEIGHT + 10 || bullet.y < -10 || bullet.x < -10 || bullet.x > GAME_WIDTH + 10)) {
        bullet.setActive(false).setVisible(false);
        bullet.body!.enable = false;
      }
    });
  }
}
