import Phaser from 'phaser';
import { FxParticles } from '../../fx/FxParticles';
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
    const left = x - width / 2;
    const top = y - height / 2;
    const wobble = attack
      ? 0
      : isMoving
        ? Math.sin((x + this.graphics.scene.time.now * 0.012) * 0.09) *
          (this.balance.archetype === 'colossus' ? 0.45 : 0.75)
        : 0;
    const bodyTop = top + wobble;

    const blink = hurt && Math.floor(this.graphics.scene.time.now / 60) % 2 === 0;
    this.graphics.fillStyle(toHex(blink ? '#FFFFFF' : this.colors.body), 1);
    this.graphics.fillRect(left, bodyTop, width, height);
    this.graphics.lineStyle(2, toHex(this.colors.outline), 1);
    this.graphics.strokeRect(left, bodyTop, width, height);

    this.graphics.fillStyle(toHex(this.colors.bodyDark), 0.55);
    this.graphics.fillRect(left + 2, bodyTop + height - 6, width - 4, 4);

    if (attack) {
      this.drawAttack(x, y, facing, attack);
    }

    this.drawEyes(x, bodyTop + height * 0.42, facing, attack);

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
    const p = Phaser.Math.Clamp(attack.progress, 0, 1);
    const attackColor = this.colors.swingSpark;

    if (attack.kind === 'slam') {
      if (attack.preparing) {
        const pulse = 0.18 + Math.sin(this.graphics.scene.time.now * 0.03) * 0.12;
        this.graphics.lineStyle(3, toHex(attackColor), pulse);
        this.graphics.strokeRect(
          x - attack.range * 1.15,
          y + this.balance.height / 2 - 10,
          attack.range * 2.3,
          14,
        );
      } else {
        const alpha = 0.45 * (1 - p);
        this.graphics.fillStyle(toHex(attackColor), alpha);
        this.graphics.fillRect(
          x - attack.range * 1.2,
          y + this.balance.height / 2 - 8,
          attack.range * 2.4,
          12,
        );
      }
      return;
    }

    if (attack.kind === 'ranged') {
      const alpha = attack.preparing ? 0.2 + p * 0.2 : 0.5 * (1 - p);
      this.graphics.fillStyle(toHex(this.colors.projectile ?? attackColor), alpha);
      const lx = x + facing * (this.balance.width / 2 + 4);
      this.graphics.fillRect(lx, y - 2, facing * (10 + p * 8), 4);
      return;
    }

    const swing = Phaser.Math.Linear(-0.5, 0.65, p);
    const reach = attack.range;
    const centerX = x + facing * (this.balance.width / 2 + reach / 2);
    const baseAngle = Math.atan2(0, facing) + swing;
    const handX = centerX - Math.cos(baseAngle) * (reach * 0.45);
    const handY = y - Math.sin(baseAngle) * (reach * 0.45);
    const tipX = centerX + Math.cos(baseAngle) * (reach * 0.45);
    const tipY = y + Math.sin(baseAngle) * (reach * 0.45);
    this.graphics.lineStyle(3, toHex(attackColor), 0.9);
    this.graphics.beginPath();
    this.graphics.moveTo(handX, handY);
    this.graphics.lineTo(tipX, tipY);
    this.graphics.strokePath();
  }

  public renderDeathEffect(deltaMs: number): void {
    this.graphics.clear();
    this.fx.update(deltaMs);
  }

  public emitDeathBurst(x: number, y: number, floorY?: number): void {
    if (this.deathBurstEmitted) {
      return;
    }
    this.deathBurstEmitted = true;
    const arch = this.balance.archetype;
    const count = arch === 'colossus' ? 110 : arch === 'brute' ? 84 : arch === 'ranger' ? 68 : 74;
    const power =
      arch === 'colossus' ? 1.35 : arch === 'brute' ? 1.12 : arch === 'ranger' ? 0.96 : 1;
    this.fx.emitDeathBurst(x, y, this.colors.death, this.colors.swingSpark, {
      count,
      power,
      floorY,
    });
  }

  public isDeathEffectFinished(): boolean {
    return this.deathBurstEmitted && this.fx.isIdle();
  }

  public hide(): void {
    this.graphics.clear();
  }

  public destroy(): void {
    this.fx.destroy();
    this.graphics.destroy();
  }
}
