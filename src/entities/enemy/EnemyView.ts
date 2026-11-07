import Phaser from 'phaser';
import { FxParticles, type CollisionSurface } from '../../fx/FxParticles';
import type { EnemyBalance } from '../../data/balance/enemy.balance';

export type EnemyFacing = -1 | 1;
export type AttackKind = 'melee' | 'ranged' | 'slam';
export interface AttackVisual {
  progress: number;
  directionX: EnemyFacing;
  range: number;
  height: number;
  preparing?: boolean;
  kind?: AttackKind;
}

const toHex = (hex: string): number => Phaser.Display.Color.HexStringToColor(hex).color;

export class EnemyView {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly fx: FxParticles;
  private readonly colors: EnemyBalance['view'];
  private readonly balance: EnemyBalance;
  private deathBurstEmitted = false;

  constructor(scene: Phaser.Scene, balance: EnemyBalance) {
    this.balance = balance;
    this.colors = balance.view;
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(balance.archetype === 'colossus' ? 9 : 8);
    const max = balance.archetype === 'colossus' ? 220 : 140;
    this.fx = new FxParticles(scene, this.graphics.depth - 1, max);
  }

  public render(
    x: number,
    y: number,
    facing: EnemyFacing,
    isMoving: boolean,
    onGround: boolean,
    velocityY: number,
    hp: number,
    maxHp: number,
    deltaMs: number,
    attack: AttackVisual | null = null,
    hurt = false,
  ): void {
    this.graphics.clear();

    const width = this.balance.width;
    const height = this.balance.height;
    const blink = hurt && Math.floor(this.graphics.scene.time.now / 60) % 2 === 0;
    const telegraphing = !!attack?.preparing;
    const telegraphPulse = telegraphing
      ? 0.55 + 0.45 * Math.abs(Math.sin(this.graphics.scene.time.now * 0.03))
      : 0;
    // Telegraph: slight squash down (no hitbox warning, no border darkening/beige).
    const squash = telegraphing ? 0.05 + 0.04 * telegraphPulse : 0;
    const drawH = height * (1 - squash);
    const drawW = width * (1 + squash * 0.35);
    const left = x - drawW / 2;
    const top = y - height / 2;
    const wobble = attack
      ? 0
      : isMoving
        ? Math.sin((x + this.graphics.scene.time.now * 0.012) * 0.09) *
          (this.balance.archetype === 'colossus' ? 0.45 : 0.75)
        : 0;
    const bodyTop = top + wobble + (height - drawH); // keep feet anchored down

    this.graphics.fillStyle(toHex(blink ? '#FFFFFF' : this.colors.body), 1);
    this.graphics.fillRect(left, bodyTop, drawW, drawH);
    const baseBorderW = this.balance.archetype === 'colossus' ? 4 : 3;
    this.graphics.lineStyle(baseBorderW, toHex(this.colors.outline), 1);
    this.graphics.strokeRect(left, bodyTop, drawW, drawH);
    this.graphics.lineStyle(1, toHex(this.colors.swingSpark), 0.22);
    this.graphics.strokeRect(left - 1, bodyTop - 1, drawW + 2, drawH + 2);

    this.graphics.fillStyle(toHex(this.colors.bodyDark), 0.55);
    this.graphics.fillRect(left + 2, bodyTop + drawH - 6, drawW - 4, 4);

    // Telegraph: only squash down warning (handled in render). Draw active attack visuals after telegraph.
    if (attack && !attack.preparing) {
      this.drawAttack(x, y, facing, attack);
    }

    this.drawEyes(x, bodyTop + drawH * 0.42, facing, attack);

    if (hp < maxHp) {
      const bw = Math.max(width, this.balance.archetype === 'colossus' ? 110 : width);
      const bh = this.balance.archetype === 'colossus' ? 8 : 4;
      const bx = x - bw / 2;
      const by = top - (this.balance.archetype === 'colossus' ? 18 : 10);
      this.graphics.fillStyle(toHex(this.colors.hpEmpty), 0.9);
      this.graphics.fillRect(bx, by, bw, bh);
      this.graphics.fillStyle(toHex(this.colors.hpFill), 1);
      this.graphics.fillRect(bx, by, bw * Phaser.Math.Clamp(hp / maxHp, 0, 1), bh);
      this.graphics.lineStyle(1, toHex(this.colors.outline), 0.6);
      this.graphics.strokeRect(bx, by, bw, bh);
    }

    if (onGround && isMoving && !attack) {
      const stride = Math.abs(Math.sin((x + this.graphics.scene.time.now * 0.014) * 0.12));
      this.graphics.fillStyle(toHex(this.colors.outline), 0.35);
      this.graphics.fillRect(x - 7 - stride * 2, top + height + wobble - 1, 5, 3);
      this.graphics.fillRect(x + 2 + stride * 2, top + height + wobble - 1, 5, 3);
    }
    if (!onGround && velocityY > 120) {
      this.graphics.fillStyle(toHex(this.colors.outline), 0.18);
      this.graphics.fillRect(x - 3, top + wobble - 4, 6, 4);
    }
    this.fx.update(deltaMs);
  }

  private drawEyes(
    x: number,
    eyeY: number,
    facing: EnemyFacing,
    attack: AttackVisual | null,
  ): void {
    const eyeColor = this.colors.core;
    const focusX = facing * (attack ? 1 : 0);
    const offsetX = this.balance.archetype === 'colossus' ? 14 : 6;
    const size = this.balance.archetype === 'colossus' ? 8 : 4;

    if (this.balance.archetype === 'ranger') {
      this.graphics.fillStyle(toHex(this.colors.swingSpark), 1);
      this.graphics.fillRect(x - 6 + focusX, eyeY - 2, 4, 4);
      this.graphics.fillRect(x + 2 + focusX, eyeY - 2, 4, 4);
      return;
    }
    if (this.balance.archetype === 'brute') {
      this.graphics.fillStyle(toHex(eyeColor), 1);
      this.graphics.fillRect(x - 10, eyeY - 2, 8, 3);
      this.graphics.fillRect(x + 2, eyeY - 2, 8, 3);
      return;
    }

    this.graphics.fillStyle(toHex(eyeColor), 1);
    this.graphics.fillRect(x - offsetX + focusX, eyeY - size / 2, size, size);
    this.graphics.fillRect(x + offsetX - size + focusX, eyeY - size / 2, size, size);
    if (this.balance.archetype === 'colossus') {
      this.graphics.fillStyle(toHex(this.colors.outline), 0.85);
      this.graphics.fillRect(x - offsetX + focusX + 2, eyeY - 1, 3, 3);
      this.graphics.fillRect(x + offsetX - size + focusX + 2, eyeY - 1, 3, 3);
    }
  }

  private drawAttack(x: number, y: number, facing: EnemyFacing, attack: AttackVisual): void {
    if (attack.preparing) return; // warning is border intensification only
    const p = Phaser.Math.Clamp(attack.progress, 0, 1);
    const attackColor = this.colors.swingSpark;

    if (attack.kind === 'slam') {
      const alpha = 0.45 * (1 - p);
      this.graphics.fillStyle(toHex(attackColor), alpha);
      this.graphics.fillRect(
        x - attack.range * 1.2,
        y + this.balance.height / 2 - 8,
        attack.range * 2.4,
        12,
      );
      return;
    }

    if (attack.kind === 'ranged') {
      const alpha = 0.5 * (1 - p);
      this.graphics.fillStyle(toHex(this.colors.projectile ?? attackColor), alpha);
      const lx = x + facing * (this.balance.width / 2 + 4);
      this.graphics.fillRect(lx, y - 2, facing * (10 + p * 8), 4);
      return;
    }

    // Active melee swing (telegraph handled by border intensification).
    if (attack.preparing) return;
    const reach = Math.max(8, attack.range);
    const anchorX = x + facing * (this.balance.width * 0.34);
    const anchorY = y - this.balance.height * 0.06;
    const sweepStart = facing > 0 ? -1.05 : Math.PI + 1.05;
    const sweepEnd = facing > 0 ? 0.78 : Math.PI - 0.78;
    const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    const angle = Phaser.Math.Linear(sweepStart, sweepEnd, eased);
    const tipX = anchorX + Math.cos(angle) * reach;
    const tipY = anchorY + Math.sin(angle) * reach;
    this.graphics.lineStyle(2, toHex(attackColor), 0.22);
    this.graphics.beginPath();
    this.graphics.arc(
      anchorX,
      anchorY,
      reach * 0.92,
      Math.min(sweepStart, angle),
      Math.max(sweepStart, angle),
      false,
    );
    this.graphics.strokePath();
    this.graphics.lineStyle(4, toHex(attackColor), 0.95);
    this.graphics.beginPath();
    this.graphics.moveTo(anchorX, anchorY);
    this.graphics.lineTo(tipX, tipY);
    this.graphics.strokePath();
    this.graphics.fillStyle(toHex(attackColor), 0.95);
    this.graphics.fillCircle(anchorX, anchorY, 2.5);
    this.graphics.fillCircle(tipX, tipY, 2.5);
  }

  public renderDeathEffect(deltaMs: number): void {
    this.graphics.clear();
    this.fx.update(deltaMs);
  }

  public emitDeathBurst(x: number, y: number, surfaces: readonly CollisionSurface[]): void {
    if (this.deathBurstEmitted) {
      return;
    }
    this.deathBurstEmitted = true;
    const arch = this.balance.archetype;
    const count = arch === 'colossus' ? 110 : arch === 'brute' ? 84 : arch === 'ranger' ? 68 : 74;
    const power =
      arch === 'colossus' ? 1.35 : arch === 'brute' ? 1.12 : arch === 'ranger' ? 0.96 : 1;
    this.fx.emitDeathBurst(x, y, this.colors.body, this.colors.hit, {
      count,
      power,
      surfaces,
      palette: this.colors.death,
    });
  }

  public isDeathEffectFinished(): boolean {
    return this.deathBurstEmitted && this.fx.isIdle();
  }

  public emitHitImpact(x: number, y: number, dirX: number, dirY: number): void {
    this.fx.emitHitImpact(x, y, this.colors.hit, this.colors.body, dirX, dirY);
  }

  public hide(): void {
    this.graphics.clear();
  }

  public destroy(): void {
    this.fx.destroy();
    this.graphics.destroy();
  }
}
