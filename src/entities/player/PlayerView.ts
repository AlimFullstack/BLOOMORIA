import Phaser from 'phaser';
import { PLAYER_BALANCE } from '../../data/balance/player.balance';
import { FxParticles } from '../../fx/FxParticles';

export type PlayerVisualState = 'IDLE' | 'MOVING' | 'JUMPING' | 'FALLING';
export type FacingDirection = -1 | 1;
export type LookTarget = { x: number; y: number } | null;
export interface AttackVisual {
  progress: number;
  directionX: number;
  directionY: number;
  range: number;
  height: number;
}

const toHex = (hex: string): number => Phaser.Display.Color.HexStringToColor(hex).color;

export const PLAYER_VIEW_COLORS = {
  body: '#D4E6F8',
  bodyShade: '#B1B3FF',
  outline: '#8589E9',
  eyeOutline: '#FFFFFF',
  highlight: '#FFFFFF',
  shadow: '#0D1526',
  eye: '#12151F',
  swordBlade: '#EAF2FF',
  swordEdge: '#FFFFFF',
  swordHandle: '#6A2734',
  floorDust: '#8FA6C4',
  swingSpark: '#FFF4C4',
  death: '#FFFFFF',
  dash: '#9EEBFF',
} as const;

const COLORS = PLAYER_VIEW_COLORS;

const RATES = {
  form: 70,
  eye: 50,
  land: 70,
  walk: 2,
  eyePresence: 70,
  eyeLift: 70,
  idleBreath: 2.4,
};

const VISUAL_SIZE = PLAYER_BALANCE.width;

export class PlayerView {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly fx: FxParticles;
  private state: PlayerVisualState = 'FALLING';
  private facing: FacingDirection = 1;
  private horizontalMotion: -1 | 0 | 1 = 0;
  private scaleX = 1;
  private scaleY = 1;
  private offsetX = 0;
  private offsetY = 0;
  private walkPhase = 0;
  private idlePhase = 0;
  private landSquash = 0;
  private eyeOffsetX = 0;
  private eyeOffsetY = 0;
  private eyeLift = 0;
  private leftEyePresence = 1;
  private rightEyePresence = 1;
  private wasOnGround = false;
  private blinkVisible = true;
  private walkDustMs = 0;
  private swingDustMs = 0;
  private fallDustMs = 0;
  private deathBurstEmitted = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.graphics = this.scene.add.graphics();
    this.graphics.setDepth(10);
    this.fx = new FxParticles(scene, 9, 240);
  }

  public render(
    x: number,
    y: number,
    state: PlayerVisualState,
    facing: FacingDirection,
    horizontalMotion: number,
    deltaMs: number,
    lookTarget: LookTarget,
    attack: AttackVisual | null = null,
    invulnerable = false,
    dashing = false,
    bodyBottomY?: number,
  ): void {
    const dt = Phaser.Math.Clamp(deltaMs, 0, 50) / 1000;
    const onGround = state === 'IDLE' || state === 'MOVING';
    const bottomY = bodyBottomY ?? y + PLAYER_BALANCE.height / 2;
    const wasOnGround = this.wasOnGround;
    const prevState = this.state;
    if (onGround && !wasOnGround) {
      this.landSquash = 1;
      this.fx.emitLanding(x, bottomY, COLORS.floorDust);
      this.fallDustMs = 0;
    }
    if (wasOnGround && !onGround && state === 'JUMPING') {
      this.fx.emitJump(x, bottomY, facing, COLORS.bodyShade);
    }
    if (!onGround && state === 'FALLING' && prevState !== 'FALLING') {
      this.fallDustMs = 0;
    }
    this.wasOnGround = onGround;
    this.state = state;
    this.facing = facing;
    this.horizontalMotion = horizontalMotion < 0 ? -1 : horizontalMotion > 0 ? 1 : 0;
    const invulnBlink = !invulnerable || Math.floor(this.scene.time.now / 70) % 2 === 0;
    this.blinkVisible = dashing ? true : invulnBlink;

    this.updateDeformation(dt);
    this.updateEyePresence(dt);
    this.updateFx(x, bottomY, onGround, deltaMs, attack);
    const metrics = this.getMetrics(x, y);
    this.updateEyes(metrics, lookTarget, dt);
    this.draw(metrics, attack, dashing, invulnerable);
  }

  public renderDeathEffect(deltaMs: number): void {
    this.graphics.clear();
    this.fx.update(deltaMs);
  }

  public emitDeathBurst(x: number, y: number): void {
    if (this.deathBurstEmitted) {
      return;
    }
    this.deathBurstEmitted = true;
    this.fx.emitDeathBurst(x, y, COLORS.death);
  }

  public isDeathEffectFinished(): boolean {
    return this.deathBurstEmitted && this.fx.isIdle();
  }

  public emitDashTrail(x: number, bottomY: number, facing: FacingDirection, onGround = true): void {
    this.fx.emitDashTrail(x, bottomY, facing, COLORS.dash, onGround);
  }

  public emitDashBurst(x: number, bottomY: number, facing: FacingDirection, onGround = true): void {
    this.fx.emitDashBurst(x, bottomY, facing, COLORS.dash, onGround);
  }

  public emitGroundSlam(x: number, bottomY: number): void {
    this.fx.emitGroundSlam(x, bottomY, '#C62828', '#FF5A3A');
  }

  public emitHitImpact(x: number, y: number, dirX: number, dirY: number): void {
    this.fx.emitHitImpact(x, y, COLORS.death, COLORS.swingSpark, dirX, dirY);
  }

  public hide(): void {
    this.graphics.clear();
  }

  public destroy(): void {
    this.fx.destroy();
    this.graphics.destroy();
  }

  private updateDeformation(dt: number): void {
    this.landSquash = this.approach(this.landSquash, 0, RATES.land, dt);

    let targetScaleX = 1;
    let targetScaleY = 1;
    let targetOffsetX = 0;
    let targetOffsetY = 0;

    if (this.state === 'MOVING') {
      this.walkPhase += dt * RATES.walk;
      const wobble = Math.sin(this.walkPhase * Math.PI * 2);
      targetScaleX = 1.08 + wobble * 0.1;
      targetScaleY = 0.92 - wobble * 0.1;
      targetOffsetX = this.facing * (2.2 + wobble * 0.8);
      targetOffsetY = Math.abs(wobble) * 1.4;
    } else if (this.state === 'JUMPING') {
      targetScaleX = 0.9;
      targetScaleY = 1.12;
      targetOffsetY = -1.2;
    } else if (this.state === 'FALLING') {
      targetScaleX = 0.94;
      targetScaleY = 1.08;
      targetOffsetY = 0.4;
    } else {
      this.idlePhase += dt * RATES.idleBreath;
      const breath = Math.sin(this.idlePhase * Math.PI * 2);
      targetScaleX = 1.015 + breath * 0.018;
      targetScaleY = 0.985 - breath * 0.018;
      this.walkPhase = this.approach(this.walkPhase, Math.round(this.walkPhase), RATES.form, dt);
    }

    if (this.landSquash > 0.001) {
      targetScaleX += 0.16 * this.landSquash;
      targetScaleY -= 0.18 * this.landSquash;
      targetOffsetY += 3 * this.landSquash;
    }

    this.scaleX = this.approach(this.scaleX, targetScaleX, RATES.form, dt);
    this.scaleY = this.approach(this.scaleY, targetScaleY, RATES.form, dt);
    this.offsetX = this.approach(this.offsetX, targetOffsetX, RATES.form, dt);
    this.offsetY = this.approach(this.offsetY, targetOffsetY, RATES.form, dt);
  }

  private updateFx(
    x: number,
    bottomY: number,
    onGround: boolean,
    deltaMs: number,
    attack: AttackVisual | null,
  ): void {
    this.walkDustMs -= deltaMs;
    this.swingDustMs -= deltaMs;
    this.fallDustMs -= deltaMs;

    if (onGround && this.state === 'MOVING' && this.walkDustMs <= 0) {
      this.fx.emitWalk(x, bottomY, this.facing, COLORS.floorDust);
      this.walkDustMs = 65;
    }

    if (!onGround && this.state === 'FALLING' && this.fallDustMs <= 0) {
      this.fx.emitFall(x, bottomY, COLORS.bodyShade);
      this.fallDustMs = 85;
    }

    if (attack && this.swingDustMs <= 0) {
      // Phase 11.12: player attack VFX is enemy-style arc/slash drawn in render (no particle burst).
      void attack;
      this.swingDustMs = Number.MAX_SAFE_INTEGER;
    } else if (!attack) {
      this.swingDustMs = 0;
    }

    this.fx.update(deltaMs);
  }

  private updateEyePresence(dt: number): void {
    let leftTarget = 1;
    let rightTarget = 1;
    if (this.horizontalMotion < 0) {
      leftTarget = 1;
      rightTarget = 0;
    } else if (this.horizontalMotion > 0) {
      leftTarget = 0;
      rightTarget = 1;
    }

    this.leftEyePresence = this.approach(this.leftEyePresence, leftTarget, RATES.eyePresence, dt);
    this.rightEyePresence = this.approach(
      this.rightEyePresence,
      rightTarget,
      RATES.eyePresence,
      dt,
    );
  }

  private getMetrics(
    x: number,
    y: number,
  ): {
    centerX: number;
    centerY: number;
    width: number;
    height: number;
    bottomY: number;
  } {
    const base = VISUAL_SIZE;
    const width = base * this.scaleX;
    const height = base * this.scaleY;
    const bottomY = y + PLAYER_BALANCE.height / 2;
    const centerX = x + this.offsetX;
    const centerY = bottomY - height / 2 + this.offsetY * 0.12;
    return { centerX, centerY, width, height, bottomY };
  }

  private updateEyes(
    metrics: { centerX: number; centerY: number; width: number; height: number },
    lookTarget: LookTarget,
    dt: number,
  ): void {
    const separation = metrics.width * 0.2;
    const eyeBaseY = metrics.centerY - metrics.height * 0.08;
    const eyeSize = Phaser.Math.Clamp(metrics.width * 0.16, 6, 9);
    const visibleCount =
      this.leftEyePresence > 0.5 && this.rightEyePresence > 0.5
        ? 2
        : this.leftEyePresence > this.rightEyePresence
          ? -1
          : this.rightEyePresence > this.leftEyePresence
            ? 1
            : 0;

    let anchorX = metrics.centerX;
    if (visibleCount === -1) {
      anchorX = metrics.centerX - separation;
    } else if (visibleCount === 1) {
      anchorX = metrics.centerX + separation;
    }

    let targetX = 0;
    let targetY = 0;
    let liftTarget = 0;
    if (lookTarget) {
      const dx = lookTarget.x - anchorX;
      const dy = lookTarget.y - eyeBaseY;
      const angle = Math.atan2(dy, dx);
      const limit = Math.max(0.6, eyeSize * 0.22);
      targetX = Math.cos(angle) * limit;
      targetY = Math.sin(angle) * limit;
      liftTarget = Phaser.Math.Clamp((-dy / 180) * 2.2, 0, 2.2);
    } else {
      targetX = this.facing * Math.max(0.5, eyeSize * 0.12);
      targetY = 0;
      liftTarget = 0;
    }

    this.eyeLift = this.approach(this.eyeLift, liftTarget, RATES.eyeLift, dt);
    this.eyeOffsetX = this.approach(this.eyeOffsetX, targetX, RATES.eye, dt);
    this.eyeOffsetY = this.approach(this.eyeOffsetY, targetY, RATES.eye, dt);
  }

  private draw(
    metrics: {
      centerX: number;
      centerY: number;
      width: number;
      height: number;
      bottomY: number;
    },
    attack: AttackVisual | null,
    dashing = false,
    invulnerable = false,
  ): void {
    this.graphics.clear();
    if (!this.blinkVisible) {
      return;
    }

    const { centerX, centerY, width, height, bottomY } = metrics;
    const halfW = width / 2;
    const halfH = height / 2;

    if (dashing) {
      this.graphics.lineStyle(3, toHex(COLORS.dash), 0.55);
      this.graphics.strokeRect(centerX - halfW - 5, centerY - halfH - 3, width + 10, height + 6);
    } else if (invulnerable) {
      this.graphics.lineStyle(2, toHex(COLORS.highlight), 0.22);
      this.graphics.strokeRect(centerX - halfW - 3, centerY - halfH - 2, width + 6, height + 4);
    }

    if (attack) {
      this.drawAttack(centerX, centerY, attack);
    }

    this.graphics.fillStyle(toHex(COLORS.shadow), 0.16);
    this.graphics.fillRect(centerX - (width * 0.78) / 2, bottomY - 1, width * 0.78, 5);

    this.graphics.fillStyle(toHex(COLORS.bodyShade), 1);
    this.graphics.fillRect(centerX - width / 2, centerY - height / 2 + 1.2, width, height);

    this.graphics.fillStyle(toHex(COLORS.body), 1);
    this.graphics.fillRect(
      centerX - (width * 0.99) / 2,
      centerY - (height * 0.99) / 2,
      width * 0.99,
      height * 0.99,
    );

    this.graphics.fillStyle(toHex(COLORS.highlight), 0.26);
    this.graphics.fillRect(
      centerX - width * 0.16 - (width * 0.3) / 2,
      centerY - height * 0.22 - (height * 0.2) / 2,
      width * 0.3,
      height * 0.2,
    );

    this.graphics.lineStyle(4, toHex(COLORS.outline), 1);
    this.graphics.strokeRect(centerX - width / 2, centerY - height / 2, width, height);

    this.drawEyes(centerX, centerY, width, height);
  }

  private drawAttack(centerX: number, centerY: number, attack: AttackVisual): void {
    // Phase 11.12: enemy-style arc/slash VFX aligned to facing/attack trajectory (visual only, no hitbox impact).
    const p = Phaser.Math.Clamp(attack.progress, 0, 1);
    const dirX = attack.directionX || this.facing;
    const dirY = attack.directionY || 0;
    const angle = Math.atan2(dirY, dirX);
    const reach = Math.max(16, attack.range);
    const anchorX = centerX + dirX * (PLAYER_BALANCE.width * 0.34);
    const anchorY = centerY - PLAYER_BALANCE.height * 0.06 + dirY * 8;
    const sweepStart = angle - 1.05;
    const sweepEnd = angle + 0.78;
    const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    const a = Phaser.Math.Linear(sweepStart, sweepEnd, eased);
    const tipX = anchorX + Math.cos(a) * reach;
    const tipY = anchorY + Math.sin(a) * reach;
    this.graphics.lineStyle(4, toHex(COLORS.swingSpark), 0.24 * (1 - p * 0.35));
    this.graphics.beginPath();
    this.graphics.arc(
      anchorX,
      anchorY,
      reach * 0.92,
      Math.min(sweepStart, a),
      Math.max(sweepStart, a),
      false,
    );
    this.graphics.strokePath();
    // Phase 11.14: visually wider/thicker blade; length/reach/anchor/pivot/trajectory/hitbox unchanged.
    this.graphics.lineStyle(8, toHex(COLORS.swordBlade), 0.98);
    this.graphics.beginPath();
    this.graphics.moveTo(anchorX, anchorY);
    this.graphics.lineTo(tipX, tipY);
    this.graphics.strokePath();
    this.graphics.lineStyle(3, toHex(COLORS.swordEdge), 0.72);
    this.graphics.beginPath();
    this.graphics.moveTo(anchorX, anchorY);
    this.graphics.lineTo(tipX, tipY);
    this.graphics.strokePath();
    this.graphics.fillStyle(toHex(COLORS.swordEdge), 0.95);
    this.graphics.fillCircle(anchorX, anchorY, 3.2);
    this.graphics.fillCircle(tipX, tipY, 3.4);
  }

  private drawEyes(centerX: number, centerY: number, width: number, height: number): void {
    const separation = width * 0.2;
    const eyeY = centerY - height * 0.08 - this.eyeLift;
    const eyeSize = Phaser.Math.Clamp(width * 0.16, 6, 9);

    this.drawEye(centerX - separation, eyeY, eyeSize, eyeSize, this.leftEyePresence);
    this.drawEye(centerX + separation, eyeY, eyeSize, eyeSize, this.rightEyePresence);
  }

  private drawEye(x: number, y: number, width: number, height: number, presence: number): void {
    if (presence <= 0.01) {
      return;
    }

    const scaleY = Phaser.Math.Clamp(presence, 0.06, 1);
    const alpha = Phaser.Math.Clamp(presence, 0, 1);
    const maxX = Math.max(0, (width - width * 0.42) / 2);
    const maxY = Math.max(0, (height * scaleY - height * 0.42) / 2);
    const pupilX = x + Phaser.Math.Clamp(this.eyeOffsetX, -maxX, maxX);
    const pupilY = y + Phaser.Math.Clamp(this.eyeOffsetY * scaleY, -maxY, maxY);
    const outerHalfW = width / 2;
    const outerHalfH = (height * scaleY) / 2;
    const pupilSize = Math.min(width, height) * 0.42;
    const pupilHalf = pupilSize / 2;

    this.graphics.fillStyle(toHex(COLORS.eye), alpha);
    this.graphics.fillRect(x - outerHalfW, y - outerHalfH, width, height * scaleY);

    this.graphics.fillStyle(toHex(COLORS.highlight), 0.85 * alpha);
    this.graphics.fillRect(
      pupilX - pupilHalf,
      pupilY - pupilHalf * scaleY,
      pupilSize,
      pupilSize * scaleY,
    );

    this.graphics.lineStyle(2, toHex(COLORS.eyeOutline), alpha);
    this.graphics.strokeRect(x - outerHalfW, y - outerHalfH, width, height * scaleY);
  }

  private approach(current: number, target: number, rate: number, dt: number): number {
    if (dt <= 0) {
      return current;
    }
    const alpha = 1 - Math.exp(-rate * dt);
    return Phaser.Math.Linear(current, target, alpha);
  }
}
