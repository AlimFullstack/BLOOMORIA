import Phaser from 'phaser';
import { AudioManager } from '../../audio/AudioManager';

import { PLAYER_BALANCE } from '../../data/balance/player.balance';
import {
  UPGRADE_BALANCE,
  type UpgradeId,
  getPlayerAttackCooldownMs,
  getPlayerAttackDamage,
  getPlayerMoveSpeed,
  clampStat,
} from '../../data/balance/playerUpgrades.balance';
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

export type UpgradeCounts = Partial<Record<UpgradeId, number>>;

export class Player {
  private readonly bodyObject: Phaser.GameObjects.Rectangle;
  private readonly body: Phaser.Physics.Arcade.Body;
  private readonly view: PlayerView;
  private facing: FacingDirection = 1;
  private state: PlayerVisualState = 'FALLING';
  private maxHp: number = PLAYER_BALANCE.maxHp;
  private hp: number = PLAYER_BALANCE.maxHp;
  private upgradeCounts: UpgradeCounts = {};
  private readonly jumpSpeed: number = PLAYER_BALANCE.jumpSpeed;
  private readonly invulnerabilityMs: number = PLAYER_BALANCE.invulnerabilityMs;
  private readonly attackDurationMs: number = PLAYER_BALANCE.attackDurationMs;
  private readonly attackRange: number = PLAYER_BALANCE.attackRange;
  private readonly attackHeight: number = PLAYER_BALANCE.attackHeight;
  private readonly dashSpeed: number = PLAYER_BALANCE.dashSpeed;
  private readonly dashDurationMs: number = PLAYER_BALANCE.dashDurationMs;
  private readonly dashCooldownMs: number = PLAYER_BALANCE.dashCooldownMs;
  private readonly groundSlamCooldownMs: number = PLAYER_BALANCE.groundSlamCooldownMs;
  private dead = false;
  private deathBurstStarted = false;
  private deathEffectFinished = false;
  private invulnerabilityRemainingMs = 0;
  private attackCooldownRemainingMs = 0;
  private attackRemainingMs = 0;
  private dashRemainingMs = 0;
  private dashCooldownRemainingMs = 0;
  private groundSlamCooldownRemainingMs = 0;
  private dashDirection: FacingDirection = 1;
  private dashTrailMs = 0;
  private attackDirectionX = 1;
  private attackDirectionY = 0;
  private attackTargets = new Set<object>();
  private groundSlamPending = false;
  private groundSlamImpact: { x: number; bottomY: number; damage: number } | null = null;
  private groundSlamHitTargets = new Set<object>();
  private wasOnGround = false;
  private footstepMs = 0;
  private damageFlashPending = false;
  private _wasDashing = false;
  private _wasGroundSlamming = false;

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
    this.syncBodyLimits();
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
    return getPlayerAttackDamage(PLAYER_BALANCE.attackDamage, this.upgradeCounts.damage ?? 0);
  }
  public getMoveSpeed(): number {
    return getPlayerMoveSpeed(PLAYER_BALANCE.moveSpeed, this.upgradeCounts.move_speed ?? 0);
  }
  public getAttackCooldownMs(): number {
    return getPlayerAttackCooldownMs(
      PLAYER_BALANCE.attackCooldownMs,
      this.upgradeCounts.attack_speed ?? 0,
    );
  }
  public getUpgradeCounts(): UpgradeCounts {
    return { ...this.upgradeCounts };
  }

  public getAttackCooldownState(): { remainingMs: number; durationMs: number } {
    return {
      remainingMs: Math.max(0, this.attackCooldownRemainingMs),
      durationMs: Math.max(1, this.getAttackCooldownMs()),
    };
  }
  public getDashCooldownState(): { remainingMs: number; durationMs: number } {
    return {
      remainingMs: Math.max(0, this.dashCooldownRemainingMs),
      durationMs: Math.max(1, this.dashCooldownMs),
    };
  }
  public getGroundSlamCooldownState(): { remainingMs: number; durationMs: number } {
    return {
      remainingMs: Math.max(0, this.groundSlamCooldownRemainingMs),
      durationMs: Math.max(1, this.groundSlamCooldownMs),
    };
  }
  public getInvulnerabilityRemainingMs(): number {
    return this.invulnerabilityRemainingMs;
  }

  public consumeDamageFlash(): boolean {
    if (!this.damageFlashPending) return false;
    this.damageFlashPending = false;
    return true;
  }
  public consumeGroundSlamImpact(): {
    x: number;
    bottomY: number;
    damage: number;
    radius: number;
  } | null {
    if (!this.groundSlamImpact) return null;
    const impact = this.groundSlamImpact;
    this.groundSlamImpact = null;
    return { ...impact, radius: PLAYER_BALANCE.groundSlamRadius };
  }
  public hasGroundSlamHitTarget(target: object): boolean {
    return this.groundSlamHitTargets.has(target);
  }
  public markGroundSlamHitTarget(target: object): void {
    this.groundSlamHitTargets.add(target);
  }
  public isDead(): boolean {
    return this.dead;
  }

  public heal(amount: number): void {
    if (this.dead || !Number.isFinite(amount) || amount <= 0) return;
    this.hp = clampStat(this.hp + amount, 0, this.maxHp);
  }
  public restoreFullHealth(): void {
    if (!this.dead) this.hp = this.maxHp;
  }

  public applyUpgrade(upgradeId: string): void {
    if (this.dead) return;
    const id = upgradeId as UpgradeId;
    const rule = UPGRADE_BALANCE[id];
    if (!rule) return;
    const current = this.upgradeCounts[id] ?? 0;
    if (current >= rule.maxStacks) return; // safety; UI should filter
    this.upgradeCounts[id] = current + 1;

    switch (id) {
      case 'max_hp': {
        const bonusHp = getHealthUpgradeBonusHp(this.maxHp);
        this.maxHp = clampStat(this.maxHp + bonusHp, 1, 99);
        this.hp = clampStat(this.hp + bonusHp, 0, this.maxHp);
        break;
      }
      case 'heal':
        this.hp = clampStat(this.hp + getHealAmountTenPercent(this.maxHp), 0, this.maxHp);
        break;
      case 'damage':
      case 'move_speed':
      case 'attack_speed':
        // derived from base + counts in getters; no direct mutation of base stats
        break;
      default:
        break;
    }
    this.syncBodyLimits();
  }

  private syncBodyLimits(): void {
    this.body.setMaxVelocity(Math.max(this.getMoveSpeed(), this.dashSpeed), 1600);
  }

  public isDeathEffectFinished(): boolean {
    return this.deathEffectFinished;
  }
  public isInvulnerable(): boolean {
    return this.invulnerabilityRemainingMs > 0 || this.isDashing() || this.groundSlamPending;
  }
  public isDashing(): boolean {
    return this.dashRemainingMs > 0;
  }
  public isGroundSlamming(): boolean {
    return this.groundSlamPending;
  }
  public wasDashingThisFrame(): boolean {
    return this._wasDashing;
  }
  public wasGroundSlammingThisFrame(): boolean {
    return this._wasGroundSlamming;
  }
  public getAttackHitbox(): Phaser.Geom.Rectangle | null {
    if (this.dead || this.attackRemainingMs <= 0) return null;
    return this.createAttackHitbox();
  }
  public hasHitTarget(target: object): boolean {
    return this.attackTargets.has(target);
  }
  public markHitTarget(target: object): void {
    this.attackTargets.add(target);
  }

  public update(
    intent: MovementIntent,
    delta: number,
    lookTarget: LookTarget = null,
    aimTarget: LookTarget = null,
  ): void {
    if (this.dead) {
      this.updateDeathEffect(delta);
      return;
    }
    // Capture dash/slam state BEFORE tickTimers decrements timers
    this._wasDashing = this.isDashing();
    this._wasGroundSlamming = this.isGroundSlamming();
    this.tickTimers(delta);
    if (intent.downPressed) this.tryGroundSlam();

    const horizontal = (intent.right ? 1 : 0) - (intent.left ? 1 : 0);
    if (intent.dashPressed) this.tryDash(horizontal);

    const moveSpeed = this.getMoveSpeed();
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
      this.body.setVelocityX(horizontal * moveSpeed);
      if (horizontal !== 0) this.facing = horizontal > 0 ? 1 : -1;
    }

    const onGround = this.body.blocked.down || this.body.touching.down;
    if (this.groundSlamPending && !onGround) {
      this.body.setVelocityY(Math.max(this.body.velocity.y, PLAYER_BALANCE.groundSlamDownVelocity));
    }
    if (onGround && !this.wasOnGround) {
      AudioManager.playerLand();
      if (this.groundSlamPending) {
        this.groundSlamPending = false;
        this.groundSlamHitTargets.clear();
        this.groundSlamImpact = {
          x: this.bodyObject.x,
          bottomY: this.body.bottom,
          damage: this.getAttackDamage(),
        };
        this.view.emitGroundSlam(this.bodyObject.x, this.body.bottom);
      }
    }
    if (!this.isDashing() && !this.groundSlamPending && intent.jumpPressed && onGround) {
      this.body.setVelocityY(-this.jumpSpeed);
      AudioManager.playerJump();
    }
    if (!this.isDashing() && !this.groundSlamPending && onGround && horizontal !== 0) {
      this.footstepMs -= delta;
      if (this.footstepMs <= 0) {
        AudioManager.playerFootstep();
        this.footstepMs = 320;
      }
    } else {
      this.footstepMs = 0;
    }
    this.wasOnGround = onGround;

    if (intent.attackHeld) this.tryAttack(intent.attackByPointer, lookTarget, aimTarget);
    this.state = this.resolveState(this.isDashing() ? this.dashDirection : horizontal, onGround);
    this.render(delta, lookTarget);
  }

  public applyKnockback(fromX: number, _fromY: number, horizontal: number, vertical: number): void {
    if (this.dead || this.isDashing()) return;
    const dx = this.bodyObject.x - fromX;
    const dirX = Math.abs(dx) > 0.001 ? Math.sign(dx) : 1;
    const h = Phaser.Math.Clamp(horizontal, 0, 900);
    const v = Phaser.Math.Clamp(vertical, 0, 700);
    if (h <= 0 && v <= 0) return;
    this.body.setVelocityX(dirX * h);
    if (v > 0) this.body.setVelocityY(Math.min(this.body.velocity.y, -v));
  }

  public takeDamage(amount: number): boolean {
    if (this.dead || this.isInvulnerable()) return false;
    const dealt = Math.max(0, Math.floor(Number(amount) || 0));
    if (dealt <= 0) return false;
    this.hp = clampStat(this.hp - dealt, 0, this.maxHp);
    this.invulnerabilityRemainingMs = this.invulnerabilityMs;
    this.damageFlashPending = true;
    AudioManager.playerDamage();
    if (this.hp <= 0) this.die();
    return true;
  }

  public emitHitImpact(x: number, y: number, dirX: number, dirY: number): void {
    this.view.emitHitImpact(x, y, dirX, dirY);
  }
  public destroy(): void {
    this.view.destroy();
    this.body.destroy();
    this.bodyObject.destroy();
  }

  private tryDash(horizontal: number): void {
    if (this.dead || this.isDashing() || this.dashCooldownRemainingMs > 0) return;
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

  private tryGroundSlam(): void {
    if (this.dead || this.groundSlamPending || this.groundSlamImpact) return;
    if (this.groundSlamCooldownRemainingMs > 0 || this.isDashing() || this.isInvulnerable()) return;
    const onGround = this.body.blocked.down || this.body.touching.down;
    if (onGround) return;
    this.groundSlamPending = true;
    this.groundSlamHitTargets.clear();
    this.groundSlamCooldownRemainingMs = this.groundSlamCooldownMs;
    this.body.setVelocityY(PLAYER_BALANCE.groundSlamDownVelocity);
  }

  private tryAttack(
    byPointer: boolean,
    lookTarget: LookTarget,
    aimTarget: LookTarget = null,
  ): void {
    if (this.attackCooldownRemainingMs > 0 || this.attackRemainingMs > 0) return;
    void byPointer;
    void lookTarget;
    void aimTarget;
    this.attackDirectionX = this.facing;
    this.attackDirectionY = 0;
    this.attackTargets.clear();
    // Keep attackDurationMs stable for readability; attack speed increases rate via cooldown (DPS/feel).
    this.attackRemainingMs = Math.min(
      this.attackDurationMs,
      Math.max(80, this.getAttackCooldownMs() - 20),
    );
    this.attackCooldownRemainingMs = this.getAttackCooldownMs();
    AudioManager.playerAttack();
  }

  private tickTimers(delta: number): void {
    this.invulnerabilityRemainingMs = Math.max(0, this.invulnerabilityRemainingMs - delta);
    this.attackCooldownRemainingMs = Math.max(0, this.attackCooldownRemainingMs - delta);
    this.dashCooldownRemainingMs = Math.max(0, this.dashCooldownRemainingMs - delta);
    this.groundSlamCooldownRemainingMs = Math.max(0, this.groundSlamCooldownRemainingMs - delta);
    if (this.dashRemainingMs > 0) this.dashRemainingMs = Math.max(0, this.dashRemainingMs - delta);
    if (this.attackRemainingMs > 0) {
      this.attackRemainingMs = Math.max(0, this.attackRemainingMs - delta);
      if (this.attackRemainingMs <= 0) this.attackTargets.clear();
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
    if (this.attackRemainingMs <= 0) return null;
    const dur = Math.min(this.attackDurationMs, Math.max(80, this.getAttackCooldownMs() - 20));
    return {
      progress: 1 - this.attackRemainingMs / Math.max(1, dur),
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
    if (this.dead) return;
    this.dead = true;
    this.groundSlamPending = false;
    this.groundSlamImpact = null;
    this.groundSlamHitTargets.clear();
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
    if (!this.deathEffectFinished && this.view.isDeathEffectFinished())
      this.deathEffectFinished = true;
  }

  private resolveState(horizontal: number, onGround: boolean): PlayerVisualState {
    if (!onGround) return this.body.velocity.y < 0 ? 'JUMPING' : 'FALLING';
    return horizontal !== 0 ? 'MOVING' : 'IDLE';
  }
}
