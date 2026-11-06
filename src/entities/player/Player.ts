import Phaser from 'phaser';
import { AudioManager } from '../../audio/AudioManager';
import { PLAYER_BALANCE } from '../../data/balance/player.balance';
import type { MovementIntent } from '../../input/KeyboardInput';
import {
  PlayerView,
  type AttackVisual,
  type FacingDirection,
  type LookTarget,
  type PlayerVisualState,
} from './PlayerView';

import {
  getHealthUpgradeBonusHp,
  getHealAmountTenPercent,
} from '../../data/upgrades/healthUpgrade';

type UpgradeId = 'max_hp' | 'damage' | 'move_speed' | 'attack_speed' | 'heal';

const MIN_ATTACK_COOLDOWN_MS = 120;

export class Player {
  private readonly bodyObject: Phaser.GameObjects.Rectangle;
  private readonly body: Phaser.Physics.Arcade.Body;
  private readonly view: PlayerView;
  private facing: FacingDirection = 1;
  private state: PlayerVisualState = 'FALLING';
  private maxHp: number = PLAYER_BALANCE.maxHp;
  private hp: number = PLAYER_BALANCE.maxHp;
  private attackDamage: number = PLAYER_BALANCE.attackDamage;
  private moveSpeed: number = PLAYER_BALANCE.moveSpeed;
  private attackCooldownMs: number = PLAYER_BALANCE.attackCooldownMs;
  private damageSteps = 0;
  private moveSpeedSteps = 0;
  private attackSpeedSteps = 0;
  private readonly jumpSpeed: number = PLAYER_BALANCE.jumpSpeed;
  private readonly invulnerabilityMs: number = PLAYER_BALANCE.invulnerabilityMs;
  private readonly attackDurationMs: number = PLAYER_BALANCE.attackDurationMs;
  private readonly attackRange: number = PLAYER_BALANCE.attackRange;
  private readonly attackHeight: number = PLAYER_BALANCE.attackHeight;
  private readonly dashSpeed: number = PLAYER_BALANCE.dashSpeed;
  private readonly dashDurationMs: number = PLAYER_BALANCE.dashDurationMs;
  private readonly dashCooldownMs: number = PLAYER_BALANCE.dashCooldownMs;
  private dead = false;
  private deathBurstStarted = false;
  private deathEffectFinished = false;
  private invulnerabilityRemainingMs = 0;
  private attackCooldownRemainingMs = 0;
  private attackRemainingMs = 0;
  private dashRemainingMs = 0;
  private dashCooldownRemainingMs = 0;
  private dashDirection: FacingDirection = 1;
  private dashTrailMs = 0;
  private attackDirectionX = 1;
  private attackDirectionY = 0;
  private attackTargets = new Set<object>();
  private wasOnGround = false;
  private footstepMs = 0;
  private damageFlashPending = false;

  constructor(
    private readonly scene: Phaser.Scene,
    x = PLAYER_BALANCE.spawnX,
    y = PLAYER_BALANCE.spawnY,
  ) {
    this.bodyObject = this.scene.add.rectangle(x, y, PLAYER_BALANCE.width, PLAYER_BALANCE.height);
    this.bodyObject.setVisible(false);

    this.scene.physics.add.existing(this.bodyObject);
    this.body = this.bodyObject.body as Phaser.Physics.Arcade.Body;
    this.body.setSize(PLAYER_BALANCE.width, PLAYER_BALANCE.height);
    this.body.setCollideWorldBounds(true);
    this.body.setMaxVelocity(Math.max(this.moveSpeed, this.dashSpeed), 1600);

    this.view = new PlayerView(this.scene);
    this.wasOnGround = false;
    this.render(0, null);
  }

  public getBodyObject(): Phaser.GameObjects.Rectangle {
    return this.bodyObject;
  }

  public getHp(): number {
    return this.hp;
  }

  public getMaxHp(): number {
    return this.maxHp;
  }

  public getAttackDamage(): number {
    return this.attackDamage;
  }

  public consumeDamageFlash(): boolean {
    if (!this.damageFlashPending) return false;
    this.damageFlashPending = false;
    return true;
  }

  public isDead(): boolean {
    return this.dead;
  }

  public heal(amount: number): void {
    if (this.dead || amount <= 0) {
      return;
    }
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  public restoreFullHealth(): void {
    if (this.dead) return;
    this.hp = this.maxHp;
  }

  public applyUpgrade(upgradeId: string): void {
    if (this.dead) {
      return;
    }
    const id = upgradeId as UpgradeId;
    switch (id) {
      case 'max_hp': {
        // Calculated once at selection time from current max HP (integer, min 1). Not percent-stacked.
        const bonusHp = getHealthUpgradeBonusHp(this.maxHp);
        this.maxHp += bonusHp;
        // Preserve existing heal-on-pick intent by restoring the gained capacity (capped to new max).
        this.hp = Math.min(this.maxHp, this.hp + bonusHp);
        this.body.setMaxVelocity(Math.max(this.moveSpeed, this.dashSpeed), 1600);
        break;
      }
      case 'damage':
        this.damageSteps += 1;
        this.recalcStatsFromBase();
        break;
      case 'move_speed':
        this.moveSpeedSteps += 1;
        this.recalcStatsFromBase();
        break;
      case 'attack_speed':
        this.attackSpeedSteps += 1;
        this.recalcStatsFromBase();
        break;
      case 'heal':
        this.hp = Math.min(this.maxHp, this.hp + this.healAmountForTenPercent());
        break;
      default:
        break;
    }
  }

  private healAmountForTenPercent(): number {
    // Integer heal: 10% of current max HP, minimum 1 (consistent with percent-of-max rounding).
    return getHealAmountTenPercent(this.maxHp);
  }

  private recalcStatsFromBase(): void {
    // max HP is handled exclusively by the max_hp upgrade (fixed bonus at pick time). Other upgrades
    // recalculate from PLAYER_BALANCE base values and their own step counts only.
    this.attackDamage = Math.max(
      0.1,
      Math.round(PLAYER_BALANCE.attackDamage * (1 + 0.1 * this.damageSteps) * 10) / 10,
    );
    this.moveSpeed = Math.max(
      1,
      Math.round(PLAYER_BALANCE.moveSpeed * (1 + 0.1 * this.moveSpeedSteps)),
    );
    this.attackCooldownMs = Math.max(
      MIN_ATTACK_COOLDOWN_MS,
      Math.round(PLAYER_BALANCE.attackCooldownMs / (1 + 0.1 * this.attackSpeedSteps)),
    );
    this.body.setMaxVelocity(Math.max(this.moveSpeed, this.dashSpeed), 1600);
    this.hp = Math.min(this.hp, this.maxHp);
  }

  public isDeathEffectFinished(): boolean {
    return this.deathEffectFinished;
  }

  public isInvulnerable(): boolean {
    return this.invulnerabilityRemainingMs > 0 || this.isDashing();
  }

  public isDashing(): boolean {
    return this.dashRemainingMs > 0;
  }

  public getAttackHitbox(): Phaser.Geom.Rectangle | null {
    if (this.dead || this.attackRemainingMs <= 0) {
      return null;
    }
    return this.createAttackHitbox();
  }

  public hasHitTarget(target: object): boolean {
    return this.attackTargets.has(target);
  }

  public markHitTarget(target: object): void {
    this.attackTargets.add(target);
  }

  public update(intent: MovementIntent, delta: number, lookTarget: LookTarget = null): void {
    if (this.dead) {
      this.updateDeathEffect(delta);
      return;
    }

    this.tickTimers(delta);

    const horizontal = (intent.right ? 1 : 0) - (intent.left ? 1 : 0);
    if (intent.dashPressed) {
      this.tryDash(horizontal);
    }

    if (this.isDashing()) {
      this.body.setVelocityX(this.dashDirection * this.dashSpeed);
      this.facing = this.dashDirection;
      this.dashTrailMs -= delta;
      if (this.dashTrailMs <= 0) {
        const dashOnGround = this.body.blocked.down || this.body.touching.down;
        const trailBottomY = dashOnGround
          ? this.body.bottom
          : this.bodyObject.y + PLAYER_BALANCE.height * 0.35;
        this.view.emitDashTrail(this.bodyObject.x, trailBottomY, this.dashDirection, dashOnGround);
        this.dashTrailMs = 35;
      }
    } else {
      this.body.setVelocityX(horizontal * this.moveSpeed);
      if (horizontal !== 0) {
        this.facing = horizontal > 0 ? 1 : -1;
      }
    }

    const onGround = this.body.blocked.down || this.body.touching.down;
    if (onGround && !this.wasOnGround) {
      AudioManager.playerLand();
    }
    if (!this.isDashing() && intent.jumpPressed && onGround) {
      this.body.setVelocityY(-this.jumpSpeed);
      AudioManager.playerJump();
    }
    if (!this.isDashing() && onGround && horizontal !== 0) {
      this.footstepMs -= delta;
      if (this.footstepMs <= 0) {
        AudioManager.playerFootstep();
        this.footstepMs = 320;
      }
    } else {
      this.footstepMs = 0;
    }
    this.wasOnGround = onGround;

    if (intent.attackHeld) {
      this.tryAttack(intent.attackByPointer, lookTarget);
    }

    this.state = this.resolveState(this.isDashing() ? this.dashDirection : horizontal, onGround);
    this.render(delta, lookTarget);
  }

  public takeDamage(amount: number): boolean {
    if (this.dead || this.isInvulnerable()) {
      return false;
    }

    this.hp = Math.max(0, this.hp - amount);
    this.invulnerabilityRemainingMs = this.invulnerabilityMs;
    this.damageFlashPending = true;
    AudioManager.playerDamage();
    if (this.hp <= 0) {
      this.die();
    }
    return true;
  }

  public destroy(): void {
    this.view.destroy();
    this.body.destroy();
    this.bodyObject.destroy();
  }

  private tryDash(horizontal: number): void {
    if (this.dead || this.isDashing() || this.dashCooldownRemainingMs > 0) {
      return;
    }
    this.dashDirection = horizontal !== 0 ? (horizontal > 0 ? 1 : -1) : this.facing;
    this.facing = this.dashDirection;
    this.dashRemainingMs = this.dashDurationMs;
    this.dashCooldownRemainingMs = this.dashCooldownMs;
    this.dashTrailMs = 0;
    const onGround = this.body.blocked.down || this.body.touching.down;
    this.view.emitDashBurst(
      this.bodyObject.x,
      onGround ? this.body.bottom : this.bodyObject.y + PLAYER_BALANCE.height * 0.35,
      this.dashDirection,
      onGround,
    );
    AudioManager.playerDash();
  }

  private tryAttack(byPointer: boolean, lookTarget: LookTarget): void {
    if (this.attackCooldownRemainingMs > 0 || this.attackRemainingMs > 0) {
      return;
    }

    if (byPointer && lookTarget) {
      const dx = lookTarget.x - this.bodyObject.x;
      const dy = lookTarget.y - this.bodyObject.y;
      const len = Math.hypot(dx, dy);
      if (len > 0.001) {
        this.attackDirectionX = dx / len;
        this.attackDirectionY = dy / len;
        if (Math.abs(this.attackDirectionX) > 0.01) {
          this.facing = this.attackDirectionX > 0 ? 1 : -1;
        }
      } else {
        this.attackDirectionX = this.facing;
        this.attackDirectionY = 0;
      }
    } else {
      this.attackDirectionX = this.facing;
      this.attackDirectionY = 0;
    }

    this.attackTargets.clear();
    this.attackRemainingMs = this.attackDurationMs;
    this.attackCooldownRemainingMs = this.attackCooldownMs;
    AudioManager.playerAttack();
  }

  private tickTimers(delta: number): void {
    this.invulnerabilityRemainingMs = Math.max(0, this.invulnerabilityRemainingMs - delta);
    this.attackCooldownRemainingMs = Math.max(0, this.attackCooldownRemainingMs - delta);
    this.dashCooldownRemainingMs = Math.max(0, this.dashCooldownRemainingMs - delta);
    if (this.dashRemainingMs > 0) {
      this.dashRemainingMs = Math.max(0, this.dashRemainingMs - delta);
    }
    if (this.attackRemainingMs > 0) {
      this.attackRemainingMs = Math.max(0, this.attackRemainingMs - delta);
      if (this.attackRemainingMs <= 0) {
        this.attackTargets.clear();
      }
    }
  }

  private createAttackHitbox(): Phaser.Geom.Rectangle {
    const reach = this.attackRange;
    const height = this.attackHeight;
    const dirX = this.attackDirectionX;
    const centerX = this.bodyObject.x + dirX * (PLAYER_BALANCE.width / 2 + reach / 2);
    const centerY = this.bodyObject.y + this.attackDirectionY * 8;
    return new Phaser.Geom.Rectangle(centerX - reach / 2, centerY - height / 2, reach, height);
  }

  private getAttackVisual(): AttackVisual | null {
    if (this.attackRemainingMs <= 0) {
      return null;
    }
    return {
      progress: 1 - this.attackRemainingMs / this.attackDurationMs,
      directionX: this.attackDirectionX,
      directionY: this.attackDirectionY,
      range: this.attackRange,
      height: this.attackHeight,
    };
  }

  private render(delta: number, lookTarget: LookTarget): void {
    this.view.render(
      this.bodyObject.x,
      this.bodyObject.y,
      this.state,
      this.facing,
      this.body.velocity.x === 0 ? 0 : this.facing,
      delta,
      lookTarget,
      this.getAttackVisual(),
      this.invulnerabilityRemainingMs > 0,
      this.isDashing(),
      this.body.bottom,
    );
  }

  private die(): void {
    if (this.dead) {
      return;
    }
    this.dead = true;
    this.dashRemainingMs = 0;
    this.dashCooldownRemainingMs = 0;
    this.attackRemainingMs = 0;
    this.attackTargets.clear();
    this.body.setVelocity(0, 0);
    this.body.enable = false;
    this.body.checkCollision.none = true;
    this.bodyObject.setActive(false);
    this.view.hide();
    AudioManager.playerDeath();
    if (!this.deathBurstStarted) {
      this.deathBurstStarted = true;
      this.view.emitDeathBurst(this.bodyObject.x, this.bodyObject.y);
    }
  }

  private updateDeathEffect(delta: number): void {
    this.view.renderDeathEffect(delta);
    if (!this.deathEffectFinished && this.view.isDeathEffectFinished()) {
      this.deathEffectFinished = true;
    }
  }

  private resolveState(horizontal: number, onGround: boolean): PlayerVisualState {
    if (!onGround) {
      return this.body.velocity.y < 0 ? 'JUMPING' : 'FALLING';
    }
    return horizontal !== 0 ? 'MOVING' : 'IDLE';
  }
}
