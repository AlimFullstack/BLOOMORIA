import Phaser from 'phaser';

const toHex = (hex: string): number => Phaser.Display.Color.HexStringToColor(hex).color;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  alpha: number;
  gravity: number;
  drag: number;
  core?: boolean;
  floorY?: number;
  settleMs?: number;
  bounce?: number;
}

export class FxParticles {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly particles: Particle[] = [];
  private readonly maxParticles: number;

  constructor(scene: Phaser.Scene, depth: number, maxParticles = 320) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(depth);
    this.graphics.setScrollFactor(1);
    this.maxParticles = maxParticles;
  }

  public emitWalk(x: number, bottomY: number, facing: -1 | 1, floorColor: string): void {
    const count = 3 + (Math.random() < 0.7 ? 1 : 0);
    for (let i = 0; i < count; i += 1) {
      this.spawn({
        x: x - facing * (8 + Math.random() * 14),
        y: bottomY - 2 - Math.random() * 4,
        vx: -facing * (30 + Math.random() * 58),
        vy: -18 - Math.random() * 38,
        life: 360 + Math.random() * 240,
        maxLife: 620,
        size: 4.5 + Math.random() * 3,
        color: floorColor,
        alpha: 0.86,
        gravity: 210,
        drag: 0.011,
      });
    }
  }

  public emitJump(x: number, bottomY: number, facing: -1 | 1, color: string): void {
    for (let i = 0; i < 12; i += 1) {
      const dir = i % 2 === 0 ? -1 : 1;
      this.spawn({
        x: x + dir * (2 + Math.random() * 12) - facing * (Math.random() * 5),
        y: bottomY - 2 - Math.random() * 3,
        vx: dir * (24 + Math.random() * 62),
        vy: -32 - Math.random() * 52,
        life: 280 + Math.random() * 200,
        maxLife: 500,
        size: 3.5 + Math.random() * 3.5,
        color,
        alpha: 0.82,
        gravity: 200,
        drag: 0.013,
      });
    }
  }

  public emitFall(x: number, bottomY: number, color: string): void {
    for (let i = 0; i < 5; i += 1) {
      this.spawn({
        x: x + (Math.random() - 0.5) * (16 + Math.random() * 10),
        y: bottomY - 8 - Math.random() * 14,
        vx: (Math.random() - 0.5) * 38,
        vy: -10 - Math.random() * 28,
        life: 240 + Math.random() * 170,
        maxLife: 430,
        size: 3.5 + Math.random() * 2.5,
        color,
        alpha: 0.68,
        gravity: 145,
        drag: 0.017,
      });
    }
  }

  public emitLanding(x: number, bottomY: number, floorColor: string): void {
    for (let i = 0; i < 22; i += 1) {
      const dir = i % 2 === 0 ? -1 : 1;
      const heavy = i < 7;
      this.spawn({
        x: x + dir * (2 + Math.random() * 18),
        y: bottomY - 2,
        vx: dir * (50 + Math.random() * (heavy ? 145 : 105)),
        vy: -(heavy ? 48 : 34) - Math.random() * (heavy ? 84 : 62),
        life: 440 + Math.random() * 320,
        maxLife: 780,
        size: (heavy ? 4.5 : 3.5) + Math.random() * 4.5,
        color: floorColor,
        alpha: heavy ? 0.95 : 0.86,
        gravity: 255,
        drag: 0.009,
      });
    }
  }

  public emitSwordSwing(
    pivotX: number,
    pivotY: number,
    angle: number,
    progress: number,
    facing: -1 | 1,
    color: string,
  ): void {
    const spread = 0.38;
    for (let i = 0; i < 7; i += 1) {
      const a = angle + (Math.random() - 0.5) * spread;
      const dist = 16 + progress * 40 + Math.random() * 15;
      this.spawn({
        x: pivotX + Math.cos(a) * dist,
        y: pivotY + Math.sin(a) * dist,
        vx: Math.cos(a + facing * 0.45) * (32 + Math.random() * 50),
        vy: Math.sin(a + facing * 0.45) * (32 + Math.random() * 50) - 14,
        life: 250 + Math.random() * 210,
        maxLife: 480,
        size: 4.5 + Math.random() * 3,
        color,
        alpha: 0.9,
        gravity: 125,
        drag: 0.016,
      });
    }
  }

  public emitHitImpact(x: number, y: number, color: string): void {
    for (let i = 0; i < 16; i += 1) {
      const a = (Math.PI * 2 * i) / 16 + (Math.random() - 0.5) * 0.5;
      const speed = 75 + Math.random() * 165;
      this.spawn({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 20,
        life: 230 + Math.random() * 170,
        maxLife: 420,
        size: 4.5 + Math.random() * 3.5,
        color,
        alpha: 0.98,
        gravity: 185,
        drag: 0.012,
        core: i < 5,
      });
    }
  }

  public emitDeathBurst(
    x: number,
    y: number,
    color: string,
    accent = '#FFFFFF',
    options?: { count?: number; power?: number; floorY?: number },
  ): void {
    const count = options?.count ?? 72;
    const power = options?.power ?? 1;
    const floorY = options?.floorY;
    for (let i = 0; i < count; i += 1) {
      const a = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.45;
      const speed = (75 + Math.random() * 275) * power;
      const core = i % 6 === 0;
      this.spawn({
        x: x + (Math.random() - 0.5) * 14,
        y: y + (Math.random() - 0.5) * 14,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - (45 + Math.random() * 95) * power,
        life: 1400 + Math.random() * 700,
        maxLife: 2100,
        size: (core ? 5.5 : 4.5) + Math.random() * 5.5,
        color: core ? accent : color,
        alpha: core ? 1 : 0.94,
        gravity: 520,
        drag: 0.0038,
        core,
        floorY,
        settleMs: 1000 + Math.random() * 1000,
        bounce: 0.06 + Math.random() * 0.12,
      });
    }
    for (let i = 0; i < Math.floor(count * 0.24); i += 1) {
      const a = Math.random() * Math.PI * 2;
      this.spawn({
        x,
        y,
        vx: Math.cos(a) * (35 + Math.random() * 95) * power,
        vy: Math.sin(a) * (35 + Math.random() * 95) * power - 22,
        life: 1200 + Math.random() * 800,
        maxLife: 2000,
        size: 3.5 + Math.random() * 3.5,
        color: accent,
        alpha: 0.9,
        gravity: 480,
        drag: 0.006,
        floorY,
        settleMs: 1000 + Math.random() * 1000,
        bounce: 0.04 + Math.random() * 0.08,
      });
    }
  }

  public emitDashBurst(
    x: number,
    bottomY: number,
    facing: -1 | 1,
    color: string,
    onGround = true,
  ): void {
    for (let i = 0; i < 14; i += 1) {
      this.spawn({
        x: x - facing * (4 + Math.random() * 10),
        y: bottomY - (onGround ? 2 : 8) - Math.random() * (onGround ? 12 : 36),
        vx: -facing * (75 + Math.random() * 145),
        vy: onGround ? -18 - Math.random() * 28 : (Math.random() - 0.5) * 48,
        life: 190 + Math.random() * 160,
        maxLife: 370,
        size: 4.5 + Math.random() * 4.5,
        color,
        alpha: 0.82,
        gravity: onGround ? 160 : 28,
        drag: 0.024,
        core: i < 3,
      });
    }
  }

  public emitDashTrail(
    x: number,
    bottomY: number,
    facing: -1 | 1,
    color: string,
    onGround = true,
  ): void {
    for (let i = 0; i < 7; i += 1) {
      this.spawn({
        x: x - facing * (6 + Math.random() * 16),
        y: bottomY - (onGround ? 2 : 10) - Math.random() * (onGround ? 10 : 36),
        vx: -facing * (65 + Math.random() * 125),
        vy: onGround ? -10 - Math.random() * 20 : (Math.random() - 0.5) * 38,
        life: 180 + Math.random() * 170,
        maxLife: 370,
        size: 4.5 + Math.random() * 4.5,
        color,
        alpha: 0.72,
        gravity: onGround ? 140 : 22,
        drag: 0.027,
      });
    }
  }

  public emitHealPickup(x: number, y: number, color: string): void {
    for (let i = 0; i < 18; i += 1) {
      const a = (Math.PI * 2 * i) / 18 + Math.random() * 0.3;
      const speed = 40 + Math.random() * 110;
      this.spawn({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 35,
        life: 320 + Math.random() * 260,
        maxLife: 600,
        size: 4 + Math.random() * 3,
        color: i % 3 === 0 ? '#FFFFFF' : color,
        alpha: 0.95,
        gravity: 120,
        drag: 0.014,
      });
    }
  }

  public update(deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      p.life -= deltaMs;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.vx *= Math.pow(p.drag, dt);
      p.vy *= Math.pow(Math.max(0.001, p.drag + 0.001), dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (typeof p.floorY === 'number') {
        const groundY = p.floorY - p.size / 2;
        if (p.y >= groundY) {
          p.y = groundY;
          if (typeof p.settleMs === 'number' && p.settleMs > 0) {
            p.settleMs -= deltaMs;
            if (p.settleMs <= 0) {
              this.particles.splice(i, 1);
              continue;
            }
            p.vx *= 0.72;
            p.vy = 0;
            p.gravity = 0;
            p.life = Math.max(p.life, p.settleMs);
            p.maxLife = Math.max(p.maxLife, p.life);
          } else if (Math.abs(p.vy) < 32) {
            p.vx *= 0.78;
            p.vy = 0;
            p.gravity = 0;
          } else {
            p.vy = -p.vy * (p.bounce ?? 0.08);
            p.vx *= 0.62;
          }
        }
      }
    }

    this.graphics.clear();
    for (const p of this.particles) {
      let alpha = p.alpha;
      if (typeof p.floorY === 'number' && p.gravity === 0 && typeof p.settleMs === 'number') {
        alpha *= Phaser.Math.Clamp(p.settleMs / 500, 0.25, 1);
      } else {
        const t = Phaser.Math.Clamp(p.life / p.maxLife, 0, 1);
        alpha *= Math.sqrt(t);
      }
      this.graphics.fillStyle(toHex(p.color), alpha);
      this.graphics.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      if (p.core || p.size >= 6) {
        this.graphics.fillStyle(toHex('#FFFFFF'), alpha * 0.3);
        this.graphics.fillRect(
          p.x - p.size * 0.18,
          p.y - p.size * 0.18,
          p.size * 0.36,
          p.size * 0.36,
        );
      }
    }
  }

  public isIdle(): boolean {
    return this.particles.length === 0;
  }

  public destroy(): void {
    this.particles.length = 0;
    this.graphics.destroy();
  }

  private spawn(particle: Particle): void {
    if (this.particles.length >= this.maxParticles) {
      this.particles.shift();
    }
    this.particles.push(particle);
  }
}
