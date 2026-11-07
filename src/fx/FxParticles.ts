import Phaser from 'phaser';

const toHex = (hex: string): number => Phaser.Display.Color.HexStringToColor(hex).color;

export interface CollisionSurface {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Particle {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  sizeW: number;
  sizeH: number;
  color: string;
  glow: string;
  alpha: number;
  gravity: number;
  drag: number;
  core?: boolean;
  settleMs?: number;
  stickMs: number;
  stuck: boolean;
  stuckOn?: 'top' | 'bottom' | 'left' | 'right';
  bright?: number;
}

export class FxParticles {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly particles: Particle[] = [];
  private readonly maxParticles: number;
  private deathSurfaces: readonly CollisionSurface[] = [];

  constructor(scene: Phaser.Scene, depth: number, maxParticles = 360) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(depth);
    this.graphics.setScrollFactor(1);
    this.maxParticles = maxParticles;
  }

  public emitWalk(x: number, bottomY: number, facing: -1 | 1, floorColor: string): void {
    const count = 3 + (Math.random() < 0.7 ? 1 : 0);
    for (let i = 0; i < count; i += 1) {
      this.spawn(
        this.makeSimple({
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
        }),
      );
    }
  }

  public emitJump(x: number, bottomY: number, facing: -1 | 1, color: string): void {
    for (let i = 0; i < 12; i += 1) {
      const dir = i % 2 === 0 ? -1 : 1;
      this.spawn(
        this.makeSimple({
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
        }),
      );
    }
  }

  public emitFall(x: number, bottomY: number, color: string): void {
    for (let i = 0; i < 5; i += 1) {
      this.spawn(
        this.makeSimple({
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
        }),
      );
    }
  }

  public emitLanding(x: number, bottomY: number, floorColor: string): void {
    for (let i = 0; i < 22; i += 1) {
      const dir = i % 2 === 0 ? -1 : 1;
      const heavy = i < 7;
      this.spawn(
        this.makeSimple({
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
        }),
      );
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
      this.spawn(
        this.makeSimple({
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
        }),
      );
    }
  }

  public emitHitImpact(
    x: number,
    y: number,
    color: string,
    accent = '#FFFFFF',
    dirX = 0,
    dirY = 0,
  ): void {
    // Combat hit: short, directional fragments. Use enemy palette; beige accent kept minimal, no orange dominance.
    const nx = dirX === 0 && dirY === 0 ? 1 : dirX;
    const ny = dirX === 0 && dirY === 0 ? 0 : dirY;
    const nlen = Math.max(1, Math.hypot(nx, ny) || 1);
    const ux = nx / nlen;
    const uy = ny / nlen;
    for (let i = 0; i < 14; i += 1) {
      const spread = (Math.random() - 0.5) * 1.35;
      const ca = Math.cos(spread);
      const sa = Math.sin(spread);
      const rx = ux * ca - uy * sa;
      const ry = ux * sa + uy * ca;
      const back = Math.random() < 0.22 ? -1 : 1;
      const speed = (55 + Math.random() * 145) * (back < 0 ? 0.45 : 1);
      const life = Math.round((115 + Math.random() * 85) / 2);
      this.spawn(
        this.makeSimple({
          x: x + rx * (2 + Math.random() * 5),
          y: y + ry * (2 + Math.random() * 5),
          vx: rx * speed * back + (Math.random() - 0.5) * 35,
          vy: ry * speed * back - 12 + (Math.random() - 0.5) * 45,
          life,
          maxLife: life,
          size: 3.5 + Math.random() * 3.5,
          color: this.combatColor(color, accent, i % 7 === 0),
          alpha: 0.98,
          gravity: 185,
          drag: 0.012,
          core: i < 3,
        }),
      );
    }
  }

  public emitDeathBurst(
    x: number,
    y: number,
    color: string,
    _accent = '#FFFFFF',
    options?: {
      count?: number;
      power?: number;
      surfaces?: readonly CollisionSurface[];
      palette?: readonly string[];
    },
  ): void {
    const count = options?.count ?? 72;
    const power = options?.power ?? 1;
    this.deathSurfaces = options?.surfaces ?? [];
    // Phase 11.15: scatter impulse reduced 2x again (1.875 -> 0.9375), applied once at spawn. Mechanics/count/size/life/stick/collide unchanged.
    const impulse = 0.9375;
    // Phase 11.15: ALL death particle colors come from enemy BODY palette only (no border/accent/white/beige/random).
    const bodyPalette: readonly string[] =
      options?.palette && options.palette.length > 0 ? options.palette : [color];
    const pickBody = (i: number): string =>
      this.varyColor(bodyPalette[i % bodyPalette.length] ?? color, 0.06);
    const lifeMul = 0.5;
    const bright = 1.5;
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const speed = (120 + Math.random() * 380) * power * impulse;
      const core = i % 5 === 0;
      const sw = 4 + Math.random() * 9;
      const sh = 3 + Math.random() * Math.max(2.5, sw * (0.4 + Math.random() * 0.95));
      const bodyCol = pickBody(i);
      const stickMs = Math.round((900 + Math.random() * 1100) * lifeMul);
      const life = Math.round((1400 + Math.random() * 1200) * lifeMul);
      this.spawn({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 20,
        prevX: x,
        prevY: y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - (15 + Math.random() * 150) * power * impulse,
        life,
        maxLife: Math.max(life, Math.round(2700 * lifeMul)),
        sizeW: sw,
        sizeH: sh,
        color: bodyCol,
        glow: pickBody(i + 1),
        alpha: core ? 1 : 0.97,
        gravity: 760,
        drag: 0.992,
        core,
        settleMs: Math.round((1400 + Math.random() * 1200) * lifeMul),
        stickMs,
        stuck: false,
        bright,
      });
    }
    for (let i = 0; i < Math.floor(count * 0.3); i += 1) {
      const a = Math.random() * Math.PI * 2;
      const speed = (70 + Math.random() * 200) * power * impulse;
      const sw = 2.5 + Math.random() * 5;
      const bodyCol = pickBody(i + 2);
      const stickMs = Math.round((800 + Math.random() * 1000) * lifeMul);
      const life = Math.round((1300 + Math.random() * 1100) * lifeMul);
      this.spawn({
        x,
        y,
        prevX: x,
        prevY: y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 8 * impulse,
        life,
        maxLife: Math.max(life, Math.round(2500 * lifeMul)),
        sizeW: sw,
        sizeH: 2 + Math.random() * sw * 0.75,
        color: bodyCol,
        glow: pickBody(i + 3),
        alpha: 0.94,
        gravity: 720,
        drag: 0.991,
        settleMs: Math.round((1300 + Math.random() * 1100) * lifeMul),
        stickMs,
        stuck: false,
        bright,
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
      this.spawn(
        this.makeSimple({
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
        }),
      );
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
      this.spawn(
        this.makeSimple({
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
        }),
      );
    }
  }

  public emitHealPickup(x: number, y: number, color: string): void {
    for (let i = 0; i < 18; i += 1) {
      const a = (Math.PI * 2 * i) / 18 + Math.random() * 0.3;
      const speed = 40 + Math.random() * 110;
      this.spawn(
        this.makeSimple({
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
        }),
      );
    }
  }

  public emitGroundSlam(x: number, bottomY: number, color: string, accent = '#FFFFFF'): void {
    // Combat AOE impact: short radial burst; per-enemy/player palette with sparse beige accent.
    for (let i = 0; i < 26; i += 1) {
      const dir = i % 2 === 0 ? -1 : 1;
      const lift = i < 10;
      const life = Math.round((120 + Math.random() * 90) / 2);
      this.spawn(
        this.makeSimple({
          x: x + dir * (2 + Math.random() * 18),
          y: bottomY - 2 - Math.random() * 6,
          vx: dir * (90 + Math.random() * 240),
          vy: lift ? -(70 + Math.random() * 120) : -(18 + Math.random() * 48),
          life,
          maxLife: life,
          size: 4 + Math.random() * 5,
          color: this.combatColor(color, accent, i % 8 === 0),
          alpha: 0.96,
          gravity: 320,
          drag: 0.01,
          core: i < 4,
        }),
      );
    }
  }

  public update(deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;
    const surfaces = this.deathSurfaces;
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      p.life -= deltaMs;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      if (p.stuck) {
        // Stuck fragments: no physics, timed fade/removal only.
        p.stickMs -= deltaMs;
        if (p.stickMs <= 0) {
          this.particles.splice(i, 1);
          continue;
        }
        p.life = Math.min(p.life, p.stickMs + 1);
        continue;
      }
      p.prevX = p.x;
      p.prevY = p.y;
      p.vy += p.gravity * dt;
      if (p.drag <= 0.05) {
        const d = Math.pow(p.drag, dt);
        p.vx *= d;
        p.vy *= Math.pow(Math.max(0.001, p.drag + 0.001), dt);
      } else {
        const d = Math.pow(p.drag, dt * 60);
        p.vx *= d;
        p.vy *= d;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (surfaces.length > 0) {
        this.collideAndStick(p, surfaces);
      }
    }

    this.graphics.clear();
    for (const p of this.particles) {
      let alpha = p.alpha;
      if (p.stuck) {
        alpha *= Phaser.Math.Clamp(p.stickMs / 750, 0.1, 1);
      } else {
        const t = Phaser.Math.Clamp(p.life / p.maxLife, 0, 1);
        alpha *= Math.sqrt(t);
      }
      const b = Phaser.Math.Clamp(p.bright ?? 1, 0.5, 2.2);
      if (b > 1.01) {
        // Phase 11.15: entire particle in BODY color family (no white). Border semi-transparent; core fill opaque.
        const fillA = p.core ? 1 : Phaser.Math.Clamp(alpha * (0.7 + 0.2 * (b - 1)), 0, 1);
        const borderA = Phaser.Math.Clamp(alpha * 0.55, 0, 0.85);
        const fillColor = this.boostColor(p.color, b, 200);
        const borderColor = this.boostColor(p.color, b * 1.22, 238);
        this.graphics.fillStyle(toHex(fillColor), fillA);
        this.graphics.fillRect(p.x - p.sizeW / 2, p.y - p.sizeH / 2, p.sizeW, p.sizeH);
        this.graphics.lineStyle(p.core ? 2 : 1.5, toHex(borderColor), borderA);
        this.graphics.strokeRect(p.x - p.sizeW / 2, p.y - p.sizeH / 2, p.sizeW, p.sizeH);
      } else {
        this.graphics.fillStyle(toHex(p.color), alpha);
        this.graphics.fillRect(p.x - p.sizeW / 2, p.y - p.sizeH / 2, p.sizeW, p.sizeH);
        if (p.core || p.sizeW + p.sizeH >= 12) {
          this.graphics.fillStyle(toHex(p.glow), alpha * (p.stuck ? 0.16 : 0.45));
          this.graphics.fillRect(
            p.x - p.sizeW * 0.22,
            p.y - p.sizeH * 0.22,
            Math.max(1, p.sizeW * 0.44),
            Math.max(1, p.sizeH * 0.44),
          );
        }
        if (!p.stuck && p.sizeW > 5) {
          this.graphics.fillStyle(toHex('#FFFFFF'), alpha * 0.14);
          this.graphics.fillRect(
            p.x - p.sizeW * 0.1,
            p.y - p.sizeH * 0.28,
            Math.max(1, p.sizeW * 0.18),
            Math.max(1, p.sizeH * 0.16),
          );
        }
      }
    }
  }

  private collideAndStick(p: Particle, surfaces: readonly CollisionSurface[]): void {
    const hw = p.sizeW / 2;
    const hh = p.sizeH / 2;
    for (const s of surfaces) {
      const left = s.x - s.width / 2;
      const right = s.x + s.width / 2;
      const top = s.y - s.height / 2;
      const bottom = s.y + s.height / 2;
      if (p.x + hw < left || p.x - hw > right || p.y + hh < top || p.y - hh > bottom) {
        continue;
      }
      const penLeft = p.x + hw - left;
      const penRight = right - (p.x - hw);
      const penTop = p.y + hh - top;
      const penBottom = bottom - (p.y - hh);
      const cameFromTop = p.prevY + hh <= top + 3 || p.vy > 0;
      const cameFromBottom = p.prevY - hh >= bottom - 3 || p.vy < 0;
      const cameFromLeft = p.prevX + hw <= left + 3 || p.vx > 0;
      const cameFromRight = p.prevX - hw >= right - 3 || p.vx < 0;
      let face: 'top' | 'bottom' | 'left' | 'right';
      if (cameFromTop && penTop <= penLeft && penTop <= penRight) face = 'top';
      else if (cameFromBottom && penBottom <= penLeft && penBottom <= penRight) face = 'bottom';
      else if (cameFromLeft && penLeft <= penTop && penLeft <= penBottom) face = 'left';
      else if (cameFromRight && penRight <= penTop && penRight <= penBottom) face = 'right';
      else {
        const minPen = Math.min(penLeft, penRight, penTop, penBottom);
        if (minPen === penTop) face = 'top';
        else if (minPen === penBottom) face = 'bottom';
        else if (minPen === penLeft) face = 'left';
        else face = 'right';
      }
      if (face === 'top') p.y = top - hh - 0.25;
      else if (face === 'bottom') p.y = bottom + hh + 0.25;
      else if (face === 'left') p.x = left - hw - 0.25;
      else p.x = right + hw + 0.25;
      p.vx = 0;
      p.vy = 0;
      p.gravity = 0;
      p.stuck = true;
      p.stuckOn = face;
      p.life = Math.max(p.life, p.stickMs);
      p.maxLife = Math.max(p.maxLife, p.life);
      if (face === 'top' || face === 'bottom') {
        p.sizeW *= 1.18;
        p.sizeH *= 0.68;
      } else {
        p.sizeW *= 0.68;
        p.sizeH *= 1.18;
      }
      return;
    }
  }

  private combatColor(baseColor: string, accent: string, useAccent = false): string {
    // Splatter should mostly read as border/outline color; keep beige accent minimal.
    if (useAccent) {
      return Math.random() < 0.7 ? this.varyColor(accent, 0.08) : this.varyColor('#F3E6C8', 0.05);
    }
    return Math.random() < 0.2 ? this.varyColor(accent, 0.1) : this.varyColor(baseColor, 0.1);
  }

  private boostColor(hex: string, factor: number, cap = 210): string {
    try {
      const c = Phaser.Display.Color.HexStringToColor(hex);
      // Phase 11.15: keep body hue (no white blowout) — gently lift, never push to white.
      const f = Phaser.Math.Clamp(factor, 0.8, 2.2);
      const amt = 0.06 + 0.1 * (f - 1);
      const r = Phaser.Math.Clamp(Math.round(c.red * (1 + amt)), 0, cap);
      const g = Phaser.Math.Clamp(Math.round(c.green * (1 + amt)), 0, cap);
      const b = Phaser.Math.Clamp(Math.round(c.blue * (1 + amt)), 0, cap);
      return Phaser.Display.Color.RGBToString(r, g, b, 0, '#');
    } catch {
      return hex;
    }
  }

  private varyColor(hex: string, amount: number): string {
    try {
      const c = Phaser.Display.Color.HexStringToColor(hex);
      const j = () => Math.round((Math.random() - 0.5) * 255 * amount);
      const r = Phaser.Math.Clamp(c.red + j(), 40, 255);
      const g = Phaser.Math.Clamp(c.green + j(), 20, 255);
      const b = Phaser.Math.Clamp(c.blue + j(), 20, 255);
      return Phaser.Display.Color.RGBToString(r, g, b, 0, '#');
    } catch {
      return hex;
    }
  }

  public isIdle(): boolean {
    return this.particles.length === 0;
  }

  public destroy(): void {
    this.particles.length = 0;
    this.deathSurfaces = [];
    this.graphics.destroy();
  }

  private makeSimple(o: {
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
  }): Particle {
    const s = o.size;
    return {
      x: o.x,
      y: o.y,
      prevX: o.x,
      prevY: o.y,
      vx: o.vx,
      vy: o.vy,
      life: o.life,
      maxLife: o.maxLife,
      sizeW: s,
      sizeH: s * (0.8 + Math.random() * 0.5),
      color: o.color,
      glow: '#FFFFFF',
      alpha: o.alpha,
      gravity: o.gravity,
      drag: o.drag,
      core: o.core,
      settleMs: undefined,
      stickMs: 0,
      stuck: false,
    };
  }

  private spawn(particle: Particle): void {
    if (this.particles.length >= this.maxParticles) {
      this.particles.shift();
    }
    this.particles.push(particle);
  }
}
