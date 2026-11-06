import Phaser from 'phaser';
import { AudioManager } from '../../audio/AudioManager';
import type { ArenaPlatformBounds } from '../arena/Arena';
import {
  ENEMY_AI_CONFIG,
  getColossusBalance,
  getEnemyBalance,
  getProgressionAttackCooldownMs,
  getProgressionAttackFrequencyMultiplier,
  scaleEnemyBalance,
  type EnemyArchetype,
  type EnemyBalance,
} from '../../data/balance/enemy.balance';
import { EnemyView, type AttackVisual, type EnemyFacing } from './EnemyView';
import { Projectile } from './Projectile';
import { Shockwave } from './Shockwave';

export type { EnemyArchetype };

type BossAttack = 'melee' | 'slam';
type BossPhase = 'idle' | 'telegraph' | 'active';

let enemyAudioSeq = 0;

export interface EnemyDeathInfo {
  x: number;
  y: number;
  archetype: EnemyArchetype;
  isBoss: boolean;
}

export class Enemy {
  private readonly bodyObject: Phaser.GameObjects.Rectangle;
  private readonly body: Phaser.Physics.Arcade.Body;
  private readonly view: EnemyView;
  private readonly balance: EnemyBalance;
  private readonly audioKey: string;
  private readonly attackFrequencyMultiplier: number;
  private facing: EnemyFacing = -1;
  private hp: number;
  private dead = false;
  private deathBurstStarted = false;
  private deathEffectFinished = false;
  private deathRewardConsumed = false;
  private invulnerabilityRemainingMs = 0;
  private attackCooldownRemainingMs = 0;
  private attackRemainingMs = 0;
  private knockbackRemainingMs = 0;
  private knockbackDirX: -1 | 0 | 1 = 0;
  private jumpCooldownRemainingMs = 0;
  private jumpAttemptMs = 0;
  private attackDirectionX: EnemyFacing = -1;
  private attackDurationTotalMs = 0;
  private attackTargets = new Set<object>();
  private arenaPlatforms: readonly ArenaPlatformBounds[] = [];
  private stuckMs = 0;
  private lastStuckCheckX = 0;
  private recoveryEdgeX: number | null = null;
  private recoveryDir: -1 | 0 | 1 = 0;
  private rangedShotFired = false;
  private bossMeleeCooldownMs = 0;
  private bossSlamCooldownMs = 0;
  private bossAttack: BossAttack | null = null;
  private bossPhase: BossPhase = 'idle';
  private bossPhaseMs = 0;
  private bossShockwaveEmitted = false;
  private wasOnGround = false;
  private footstepMs = 0;
  private patrolDir: -1 | 1 = 1;
  private patrolTurnCooldownMs = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    arenaPlatforms: readonly ArenaPlatformBounds[] = [],
    archetype: EnemyArchetype = 'grunt',
    bossWaveIndex = 1,
    bossesKilled = 0,
  ) {
    const baseBalance =
      archetype === 'colossus' ? getColossusBalance(bossWaveIndex) : getEnemyBalance(archetype);
    this.balance = scaleEnemyBalance(baseBalance, bossesKilled);
    this.hp = this.balance.maxHp;
    this.attackFrequencyMultiplier = getProgressionAttackFrequencyMultiplier(bossesKilled);
    this.arenaPlatforms = arenaPlatforms;
    enemyAudioSeq += 1;
    this.audioKey = `${this.balance.archetype}-${enemyAudioSeq}`;
    this.bodyObject = this.scene.add.rectangle(x, y, this.balance.width, this.balance.height);
    this.bodyObject.setVisible(false);

    this.scene.physics.add.existing(this.bodyObject);
    this.body = this.bodyObject.body as Phaser.Physics.Arcade.Body;
    this.body.setSize(this.balance.width, this.balance.height);
    this.body.setCollideWorldBounds(true);

    this.view = new EnemyView(this.scene, this.balance);
    this.lastStuckCheckX = x;
    this.render(0);
  }

  public getBodyObject(): Phaser.GameObjects.Rectangle {
    return this.bodyObject;
  }

  public getArchetype(): EnemyArchetype {
    return this.balance.archetype;
  }

  public isBoss(): boolean {
    return this.balance.archetype === 'colossus';
  }

  public getDisplayName(): string {
    return this.isBoss() ? 'THE COLOSSUS' : this.balance.archetype;
  }

  public isDead(): boolean {
    return this.dead;
  }

  public isDeathEffectFinished(): boolean {
    return this.deathEffectFinished;
  }

  public consumeDeathReward(): EnemyDeathInfo | null {
    if (!this.dead || this.deathRewardConsumed) {
      return null;
    }
    this.deathRewardConsumed = true;
    return {
      x: this.bodyObject.x,
      y: this.bodyObject.y + this.balance.height / 2 - 2,
      archetype: this.balance.archetype,
      isBoss: this.isBoss(),
    };
  }

  public getAttackDamage(): number {
    if (
      this.balance.archetype === 'colossus' &&
      this.bossAttack === 'slam' &&
      this.bossPhase === 'active'
    ) {
      return this.balance.slamDamage;
    }
    return this.balance.attackDamage;
  }

  public getHp(): number {
    return this.hp;
  }

  public getMaxHp(): number {
    return this.balance.maxHp;
  }

  public getAttackHitbox(): Phaser.Geom.Rectangle | null {
    if (this.dead || this.attackRemainingMs <= 0) {
      return null;
    }
    if (this.balance.archetype === 'ranger') {
      return null;
    }
    if (this.balance.archetype === 'colossus') {
      if (this.bossPhase !== 'active' || this.bossAttack !== 'melee') {
        return null;
      }
    }
    return this.createAttackHitbox();
  }

  public hasHitTarget(target: object): boolean {
    return this.attackTargets.has(target);
  }

  public markHitTarget(target: object): void {
    this.attackTargets.add(target);
  }

  public halt(delta: number): void {
    if (this.dead) {
      this.updateDeathEffect(delta);
      return;
    }
    this.body.setVelocityX(0);
    this.render(delta);
  }

  public update(
    targetX: number,
    targetY: number,
    delta: number,
    emitProjectile?: (p: Projectile) => void,
    emitShockwave?: (s: Shockwave) => void,
  ): void {
    if (this.dead) {
      this.updateDeathEffect(delta);
      return;
    }

    this.tickTimers(delta);
    const onGround = this.body.blocked.down || this.body.touching.down;

    if (this.knockbackRemainingMs > 0) {
      this.knockbackRemainingMs = Math.max(0, this.knockbackRemainingMs - delta);
      this.facing = this.knockbackDirX !== 0 ? this.knockbackDirX : this.facing;
      const maxVx = Math.max(this.balance.knockbackMaxSpeed, this.balance.moveSpeed);
      this.body.velocity.x = Phaser.Math.Clamp(this.body.velocity.x, -maxVx, maxVx);
      if (this.knockbackRemainingMs <= 0) {
        this.knockbackDirX = 0;
        this.body.setVelocityX(0);
      }
      this.render(delta);
      this.updateMovementAudio(delta, onGround);
      this.wasOnGround = onGround;
      return;
    }

    const dx = targetX - this.bodyObject.x;
    const dy = targetY - this.bodyObject.y;
    const absDx = Math.abs(dx);
    const playerDistance = Math.hypot(dx, dy);
    const playerFar = !this.isBoss() && playerDistance > ENEMY_AI_CONFIG.patrolDetectDistance;
    if (playerFar) {
      // Far player: stop chase/navigation intent; patrol stays on the current platform.
      this.clearRecovery();
      this.stuckMs = 0;
    }
    // Higher-priority combat states (knockback handled above, boss phases, active attacks)
    // must not be overwritten by patrol movement.
    const canPatrol = playerFar && this.attackRemainingMs <= 0;

    if (this.balance.archetype === 'colossus') {
      this.updateColossus(dx, dy, absDx, onGround, targetX, delta, emitShockwave);
    } else if (canPatrol) {
      this.updatePatrol(onGround);
    } else if (this.balance.archetype === 'ranger') {
      this.updateRanger(dx, dy, absDx, onGround, targetX, targetY, delta, emitProjectile);
    } else {
      this.updateMelee(dx, dy, absDx, onGround, delta);
    }

    if (onGround && this.jumpCooldownRemainingMs <= 0) {
      this.jumpAttemptMs = Math.max(0, this.jumpAttemptMs - delta);
    }
    if (!playerFar && !this.isRecoveryActive() && onGround) {
      this.stuckMs = Math.max(0, this.stuckMs - delta * 0.5);
    }

    this.render(delta);
    this.updateMovementAudio(delta, onGround);
  }

  private updateMovementAudio(delta: number, onGround: boolean): void {
    if (this.dead) return;
    if (onGround && !this.wasOnGround) {
      AudioManager.enemyLand(this.audioKey);
    }
    const moving = Math.abs(this.body.velocity.x) > 0.1 && this.attackRemainingMs <= 0;
    if (onGround && moving) {
      this.footstepMs -= delta;
      if (this.footstepMs <= 0) {
        AudioManager.enemyFootstep(this.audioKey);
        this.footstepMs = this.isBoss() ? 520 : 380;
      }
    } else {
      this.footstepMs = Math.min(this.footstepMs, 120);
    }
    this.wasOnGround = onGround;
  }

  private updateMelee(
    dx: number,
    dy: number,
    absDx: number,
    onGround: boolean,
    delta: number,
  ): void {
    const inAttackRange =
      absDx <= this.balance.attackRange && Math.abs(dy) <= this.balance.attackHeight;

    if (this.attackRemainingMs > 0) {
      this.body.setVelocityX(0);
      this.clearRecoveryIfProgressPossible(dx, dy, absDx, onGround);
      return;
    }
    if (inAttackRange) {
      this.body.setVelocityX(0);
      this.updateFacingTowardTarget(dx);
      this.tryAttack();
      this.clearRecovery();
      return;
    }
    if (absDx <= this.balance.stopDistance && Math.abs(dy) <= this.balance.jumpHeightThreshold) {
      this.body.setVelocityX(0);
      this.updateFacingTowardTarget(dx);
      this.clearRecovery();
      return;
    }

    const blockedAhead = this.facing > 0 ? this.body.blocked.right : this.body.blocked.left;
    this.updateStuckState(blockedAhead, onGround, delta);
    if (!this.isRecoveryActive()) {
      this.maybeStartRecovery(dx, dy, onGround, blockedAhead);
    }
    if (this.isRecoveryActive()) {
      this.updateRecovery(this.bodyObject.x + dx, dy, onGround);
    } else {
      this.updateFacingTowardTarget(dx);
      this.body.setVelocityX(this.facing * this.balance.moveSpeed);
      this.tryJump(dx, dy, onGround, blockedAhead);
    }
  }

  private updateColossus(
    dx: number,
    dy: number,
    absDx: number,
    onGround: boolean,
    targetX: number,
    delta: number,
    emitShockwave?: (s: Shockwave) => void,
  ): void {
    this.updateFacingTowardTarget(dx);
    if (this.bossPhase !== 'idle') {
      this.body.setVelocityX(0);
      this.bossPhaseMs = Math.max(0, this.bossPhaseMs - delta);
      if (this.bossAttack === 'slam') {
        this.attackRemainingMs = this.bossPhaseMs;
        this.attackDirectionX = this.facing;
        if (this.bossPhase === 'telegraph' && this.bossPhaseMs <= 0) {
          this.bossPhase = 'active';
          this.bossPhaseMs = 260;
          this.attackRemainingMs = this.bossPhaseMs;
          this.attackTargets.clear();
          if (!this.bossShockwaveEmitted && emitShockwave) {
            this.bossShockwaveEmitted = true;
            this.emitSlamShockwaves(emitShockwave);
          }
        } else if (this.bossPhase === 'active' && this.bossPhaseMs <= 0) {
          this.finishBossAttack();
        }
      } else if (this.bossAttack === 'melee') {
        this.attackRemainingMs = this.bossPhaseMs;
        this.attackDirectionX = this.facing;
        if (this.bossPhase === 'telegraph' && this.bossPhaseMs <= 0) {
          this.bossPhase = 'active';
          this.bossPhaseMs = this.balance.attackDurationMs;
          this.attackRemainingMs = this.bossPhaseMs;
          this.attackTargets.clear();
        } else if (this.bossPhase === 'active' && this.bossPhaseMs <= 0) {
          this.finishBossAttack();
        }
      }
      return;
    }

    const inMeleeRange =
      absDx <= this.balance.attackRange && Math.abs(dy) <= this.balance.attackHeight;
    const inSlamRange = absDx <= 220 && Math.abs(dy) <= 90 && onGround;

    if (inSlamRange && this.bossSlamCooldownMs <= 0) {
      this.startBossAttack('slam');
      return;
    }
    if (inMeleeRange && this.bossMeleeCooldownMs <= 0) {
      this.startBossAttack('melee');
      return;
    }
    if (absDx <= this.balance.stopDistance && Math.abs(dy) <= this.balance.jumpHeightThreshold) {
      this.body.setVelocityX(0);
      this.clearRecovery();
      return;
    }

    const blockedAhead = this.facing > 0 ? this.body.blocked.right : this.body.blocked.left;
    this.updateStuckState(blockedAhead, onGround, delta);
    if (!this.isRecoveryActive()) {
      this.maybeStartRecovery(dx, dy, onGround, blockedAhead);
    }
    if (this.isRecoveryActive()) {
      this.updateRecovery(targetX, dy, onGround);
    } else {
      this.body.setVelocityX(this.facing * this.balance.moveSpeed);
      this.tryJump(dx, dy, onGround, blockedAhead);
    }
  }

  private startBossAttack(kind: BossAttack): void {
    if (this.dead || this.bossPhase !== 'idle') {
      return;
    }
    this.bossAttack = kind;
    this.bossPhase = 'telegraph';
    this.bossShockwaveEmitted = false;
    this.attackTargets.clear();
    this.attackDirectionX = this.facing;
    if (kind === 'slam') {
      this.bossPhaseMs = getProgressionAttackCooldownMs(
        this.balance.slamTelegraphMs,
        this.attackFrequencyMultiplier,
        300,
      );
      this.attackRemainingMs = this.bossPhaseMs;
      this.bossSlamCooldownMs = getProgressionAttackCooldownMs(
        this.balance.slamCooldownMs,
        this.attackFrequencyMultiplier,
      );
    } else {
      this.bossPhaseMs = getProgressionAttackCooldownMs(360, this.attackFrequencyMultiplier, 140);
      this.attackRemainingMs = this.bossPhaseMs;
      this.bossMeleeCooldownMs = getProgressionAttackCooldownMs(
        this.balance.attackCooldownMs,
        this.attackFrequencyMultiplier,
      );
      AudioManager.enemyAttack('boss', this.audioKey);
    }
  }

  private finishBossAttack(): void {
    this.bossPhase = 'idle';
    this.bossAttack = null;
    this.bossPhaseMs = 0;
    this.attackRemainingMs = 0;
    this.attackTargets.clear();
  }

  private emitSlamShockwaves(emitShockwave: (s: Shockwave) => void): void {
    AudioManager.bossSlam(this.audioKey);
    const floorY = this.bodyObject.y + this.balance.height / 2;
    const ox = this.balance.width * 0.45;
    const color = this.balance.view.projectile ?? this.balance.view.swingSpark;
    emitShockwave(
      new Shockwave(
        this.scene,
        this.bodyObject.x - ox,
        floorY,
        -1,
        this.balance.shockwaveSpeed,
        this.balance.shockwaveLifetimeMs,
        this.balance.shockwaveWidth,
        this.balance.shockwaveHeight,
        color,
        this.balance.slamDamage,
      ),
    );
    emitShockwave(
      new Shockwave(
        this.scene,
        this.bodyObject.x + ox,
        floorY,
        1,
        this.balance.shockwaveSpeed,
        this.balance.shockwaveLifetimeMs,
        this.balance.shockwaveWidth,
        this.balance.shockwaveHeight,
        color,
        this.balance.slamDamage,
      ),
    );
  }

  private updateRanger(
    dx: number,
    dy: number,
    absDx: number,
    onGround: boolean,
    targetX: number,
    targetY: number,
    delta: number,
    emitProjectile?: (p: Projectile) => void,
  ): void {
    this.updateFacingTowardTarget(dx);
    const inRange =
      absDx <= this.balance.attackRange && Math.abs(dy) <= this.balance.attackHeight * 2.2;
    const blockedAhead = this.facing > 0 ? this.body.blocked.right : this.body.blocked.left;

    if (this.attackRemainingMs > 0) {
      this.body.setVelocityX(0);
      const total =
        this.attackDurationTotalMs > 0 ? this.attackDurationTotalMs : this.balance.attackDurationMs;
      const progress = 1 - this.attackRemainingMs / Math.max(1, total);
      if (!this.rangedShotFired && progress >= 0.55 && emitProjectile) {
        this.rangedShotFired = true;
        this.fireProjectile(targetX, targetY, emitProjectile);
      }
      return;
    }

    if (absDx < this.balance.retreatDistance && onGround) {
      const away: EnemyFacing = dx >= 0 ? -1 : 1;
      this.facing = away;
      this.body.setVelocityX(away * this.balance.moveSpeed);
      this.updateStuckState(
        away > 0 ? this.body.blocked.right : this.body.blocked.left,
        onGround,
        delta,
      );
      if (
        (away > 0 ? this.body.blocked.right : this.body.blocked.left) &&
        this.jumpCooldownRemainingMs <= 0
      ) {
        this.performJump();
      }
      return;
    }

    if (absDx > this.balance.preferredDistance + 40) {
      this.updateStuckState(blockedAhead, onGround, delta);
      if (!this.isRecoveryActive()) {
        this.maybeStartRecovery(dx, dy, onGround, blockedAhead);
      }
      if (this.isRecoveryActive()) {
        this.updateRecovery(targetX, dy, onGround);
      } else {
        this.body.setVelocityX(this.facing * this.balance.moveSpeed);
        this.tryJump(dx, dy, onGround, blockedAhead);
      }
      return;
    }

    this.body.setVelocityX(0);
    if (inRange) {
      this.tryAttack();
    }
  }

  private fireProjectile(
    targetX: number,
    targetY: number,
    emitProjectile: (p: Projectile) => void,
  ): void {
    AudioManager.enemyAttack('ranger', this.audioKey);
    const ox = this.bodyObject.x + this.facing * (this.balance.width * 0.5 + 4);
    const oy = this.bodyObject.y - 2;
    const dx = targetX - ox;
    const dy = targetY - oy;
    const len = Math.max(1, Math.hypot(dx, dy));
    const speed = this.balance.projectileSpeed;
    emitProjectile(
      new Projectile(
        this.scene,
        ox,
        oy,
        (dx / len) * speed,
        (dy / len) * speed,
        this.balance.projectileLifetimeMs,
        this.balance.projectileSize,
        this.balance.view.projectile ?? this.balance.view.swingSpark,
        this.balance.attackDamage,
      ),
    );
  }

  public takeDamage(amount: number): boolean {
    if (this.dead || this.invulnerabilityRemainingMs > 0) {
      return false;
    }
    this.hp = Math.max(0, this.hp - amount);
    this.invulnerabilityRemainingMs = this.balance.invulnerabilityMs;
    AudioManager.enemyDamage(this.audioKey);
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return true;
  }

  public applyKnockback(fromX: number): void {
    if (this.dead || this.isBoss() || !this.body.enable) {
      return;
    }
    const dirX = this.bodyObject.x >= fromX ? 1 : -1;
    const kb = this.balance;
    const impulseX = Phaser.Math.Clamp(
      kb.knockbackHorizontal,
      0,
      Math.max(0, kb.knockbackMaxSpeed),
    );
    const impulseY = Phaser.Math.Clamp(kb.knockbackVertical, 0, 220);
    if (impulseX <= 0 && impulseY <= 0) {
      return;
    }
    this.knockbackDirX = dirX as -1 | 1;
    this.knockbackRemainingMs = Math.max(0, kb.knockbackDurationMs);
    this.clearRecovery();
    this.jumpAttemptMs = 0;
    if (this.bossPhase === 'idle') {
      this.attackRemainingMs = 0;
      this.attackTargets.clear();
      this.rangedShotFired = false;
    }
    this.body.setVelocityX(dirX * impulseX);
    if (impulseY > 0) {
      const nextVy = Math.min(this.body.velocity.y, -impulseY);
      this.body.setVelocityY(nextVy);
    }
    const maxVx = Math.max(this.balance.moveSpeed, impulseX, kb.knockbackMaxSpeed);
    this.body.velocity.x = Phaser.Math.Clamp(this.body.velocity.x, -maxVx, maxVx);
  }

  public destroy(): void {
    this.view.destroy();
    this.body.destroy();
    this.bodyObject.destroy();
  }

  private tryAttack(): void {
    if (this.attackCooldownRemainingMs > 0 || this.attackRemainingMs > 0) {
      return;
    }
    this.attackDirectionX = this.facing;
    this.attackTargets.clear();
    this.rangedShotFired = false;
    this.attackDurationTotalMs = getProgressionAttackCooldownMs(
      this.balance.attackDurationMs,
      this.attackFrequencyMultiplier,
      80,
    );
    this.attackRemainingMs = this.attackDurationTotalMs;
    this.attackCooldownRemainingMs = getProgressionAttackCooldownMs(
      this.balance.attackCooldownMs,
      this.attackFrequencyMultiplier,
    );
    if (this.balance.archetype !== 'ranger') {
      AudioManager.enemyAttack(
        this.balance.archetype as 'grunt' | 'brute' | 'ranger' | 'boss',
        this.audioKey,
      );
    }
  }

  private updateFacingTowardTarget(dx: number): void {
    if (dx > 2) {
      this.facing = 1;
    } else if (dx < -2) {
      this.facing = -1;
    }
  }

  private isRecoveryActive(): boolean {
    return this.recoveryDir !== 0 && this.recoveryEdgeX !== null;
  }

  private clearRecovery(): void {
    this.recoveryDir = 0;
    this.recoveryEdgeX = null;
  }

  private clearRecoveryIfProgressPossible(
    dx: number,
    dy: number,
    absDx: number,
    onGround: boolean,
  ): void {
    if (!this.isRecoveryActive() || !onGround) {
      return;
    }
    const playerAbove = dy < -this.balance.jumpHeightThreshold;
    if (!playerAbove || absDx <= this.balance.stopDistance) {
      this.clearRecovery();
    } else if (Math.abs(dx) < this.balance.jumpHorizontalThreshold * 0.35) {
      this.clearRecovery();
    }
  }

  private updateStuckState(blockedAhead: boolean, onGround: boolean, delta: number): void {
    if (!onGround) {
      return;
    }
    this.stuckMs = Math.max(0, this.stuckMs - delta * 0.15);
    if (blockedAhead) {
      const moved = Math.abs(this.bodyObject.x - this.lastStuckCheckX);
      if (moved < 1.2) {
        this.stuckMs = Math.min(900, this.stuckMs + delta);
      } else {
        this.stuckMs = Math.max(0, this.stuckMs - delta * 0.8);
      }
    }
    this.lastStuckCheckX = this.bodyObject.x;
  }

  private maybeStartRecovery(
    dx: number,
    dy: number,
    onGround: boolean,
    blockedAhead: boolean,
  ): void {
    if (!onGround || this.jumpCooldownRemainingMs > 0) {
      return;
    }
    const playerAbove = dy < -this.balance.jumpHeightThreshold;
    if (!playerAbove || !(blockedAhead || this.stuckMs >= 220)) {
      return;
    }
    const blocking = this.findBlockingPlatformAbove(dx, dy);
    if (!blocking) {
      return;
    }
    const margin = this.balance.width / 2 + 8;
    const leftEdge = blocking.x - blocking.width / 2 - margin;
    const rightEdge = blocking.x + blocking.width / 2 + margin;
    const worldWidth = this.scene.scale.width;
    const leftDist = Math.abs(this.bodyObject.x - Math.max(0, leftEdge));
    const rightDist = Math.abs(this.bodyObject.x - Math.min(worldWidth, rightEdge));
    const chooseLeft =
      leftDist <= rightDist
        ? Math.max(0, leftEdge) >= 0
        : Math.min(worldWidth, rightEdge) > worldWidth;
    if (chooseLeft) {
      this.recoveryDir = -1;
      this.recoveryEdgeX = Math.max(this.balance.width / 2, leftEdge);
    } else {
      this.recoveryDir = 1;
      this.recoveryEdgeX = Math.min(worldWidth - this.balance.width / 2, rightEdge);
    }
    this.stuckMs = 0;
  }

  private findBlockingPlatformAbove(dx: number, dy: number): ArenaPlatformBounds | null {
    if (this.arenaPlatforms.length === 0) {
      return null;
    }
    const enemyX = this.bodyObject.x;
    const enemyBottom = this.bodyObject.y + this.balance.height / 2;
    const targetX = enemyX + dx;
    const targetY = enemyBottom + dy;
    const dir = dx >= 0 ? 1 : -1;
    let best: ArenaPlatformBounds | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const p of this.arenaPlatforms) {
      const top = p.y - p.height / 2;
      const left = p.x - p.width / 2;
      const right = p.x + p.width / 2;
      const aboveEnemy = top < enemyBottom - 8;
      const belowOrNearTarget = top >= targetY - this.balance.height * 0.5;
      if (!aboveEnemy || !belowOrNearTarget) {
        continue;
      }
      const horizontalOverlap = targetX >= left - 24 && targetX <= right + 24;
      const inPath = dir > 0 ? right >= enemyX - 10 : left <= enemyX + 10;
      const spansTowardTarget =
        (dir > 0 && right > enemyX && left < targetX + 30) ||
        (dir < 0 && left < enemyX && right > targetX - 30);
      if (!(horizontalOverlap || inPath || spansTowardTarget)) {
        continue;
      }
      const score = enemyBottom - top + Math.abs(p.x - targetX) * 0.05;
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  private updateRecovery(targetX: number, dy: number, onGround: boolean): void {
    if (!this.isRecoveryActive() || this.recoveryEdgeX === null) {
      return;
    }
    if (dy > this.balance.jumpHeightThreshold) {
      this.clearRecovery();
      this.updateFacingTowardTarget(targetX - this.bodyObject.x);
      this.body.setVelocityX(this.facing * this.balance.moveSpeed);
      return;
    }
    const edgeX = this.recoveryEdgeX;
    const toEdge = edgeX - this.bodyObject.x;
    if (Math.abs(toEdge) <= 10) {
      this.facing = targetX >= this.bodyObject.x ? 1 : -1;
      this.body.setVelocityX(this.facing * this.balance.moveSpeed);
      if (onGround && this.jumpCooldownRemainingMs <= 0) {
        this.performJump();
        this.clearRecovery();
      } else if (onGround) {
        this.body.setVelocityX(0);
      }
      return;
    }
    this.recoveryDir = toEdge >= 0 ? 1 : -1;
    this.facing = this.recoveryDir;
    this.body.setVelocityX(this.recoveryDir * this.balance.moveSpeed);
    const blocked = this.recoveryDir > 0 ? this.body.blocked.right : this.body.blocked.left;
    if (blocked && onGround && this.jumpCooldownRemainingMs <= 0) {
      this.facing = targetX >= this.bodyObject.x ? 1 : -1;
      this.performJump();
      this.clearRecovery();
    }
  }

  private tryJump(dx: number, dy: number, onGround: boolean, blockedAhead: boolean): void {
    if (!onGround || this.jumpCooldownRemainingMs > 0) {
      return;
    }
    const absDx = Math.abs(dx);
    const playerAbove = dy < -this.balance.jumpHeightThreshold;
    const withinHorizontalReach =
      absDx <= this.balance.jumpHorizontalThreshold &&
      absDx > Math.max(10, this.balance.stopDistance);
    if (playerAbove && (withinHorizontalReach || blockedAhead)) {
      this.performJump();
      return;
    }
    if (blockedAhead && absDx > this.balance.attackRange && this.jumpAttemptMs <= 0) {
      this.performJump();
    }
  }

  private performJump(): void {
    this.body.setVelocityY(-this.balance.jumpSpeed);
    this.jumpCooldownRemainingMs = this.balance.jumpCooldownMs;
    this.jumpAttemptMs = 260;
    AudioManager.enemyJump(this.audioKey);
  }

  private tickTimers(delta: number): void {
    this.invulnerabilityRemainingMs = Math.max(0, this.invulnerabilityRemainingMs - delta);
    this.attackCooldownRemainingMs = Math.max(0, this.attackCooldownRemainingMs - delta);
    this.jumpCooldownRemainingMs = Math.max(0, this.jumpCooldownRemainingMs - delta);
    this.patrolTurnCooldownMs = Math.max(0, this.patrolTurnCooldownMs - delta);
    this.bossMeleeCooldownMs = Math.max(0, this.bossMeleeCooldownMs - delta);
    this.bossSlamCooldownMs = Math.max(0, this.bossSlamCooldownMs - delta);
    if (this.attackRemainingMs > 0 && this.balance.archetype !== 'colossus') {
      this.attackRemainingMs = Math.max(0, this.attackRemainingMs - delta);
      if (this.attackRemainingMs <= 0) {
        this.attackTargets.clear();
        this.rangedShotFired = false;
      }
    }
  }

  private createAttackHitbox(): Phaser.Geom.Rectangle {
    const reach = this.balance.attackRange;
    const height = this.balance.attackHeight;
    const centerX =
      this.bodyObject.x + this.attackDirectionX * (this.balance.width / 2 + reach / 2);
    const centerY = this.bodyObject.y;
    return new Phaser.Geom.Rectangle(centerX - reach / 2, centerY - height / 2, reach, height);
  }

  private render(delta = 0): void {
    let attack: AttackVisual | null = null;
    if (this.balance.archetype === 'colossus' && this.bossPhase !== 'idle') {
      const totalMs =
        this.bossAttack === 'slam'
          ? this.bossPhase === 'telegraph'
            ? this.balance.slamTelegraphMs
            : 260
          : this.bossPhase === 'telegraph'
            ? 360
            : this.balance.attackDurationMs;
      attack = {
        progress: totalMs > 0 ? 1 - this.bossPhaseMs / totalMs : 1,
        directionX: this.attackDirectionX,
        range: this.balance.attackRange,
        height: this.balance.attackHeight,
        preparing: this.bossPhase === 'telegraph',
        kind: this.bossAttack === 'slam' ? 'slam' : 'melee',
      };
    } else if (this.attackRemainingMs > 0) {
      const total =
        this.attackDurationTotalMs > 0 ? this.attackDurationTotalMs : this.balance.attackDurationMs;
      attack = {
        progress: 1 - this.attackRemainingMs / Math.max(1, total),
        directionX: this.attackDirectionX,
        range: this.balance.attackRange,
        height: this.balance.attackHeight,
        preparing: this.balance.archetype === 'ranger',
        kind: this.balance.archetype === 'ranger' ? 'ranged' : 'melee',
      };
    }

    const onGround = this.body.blocked.down || this.body.touching.down;
    const moving =
      Math.abs(this.body.velocity.x) > 0.1 &&
      this.bossPhase === 'idle' &&
      this.attackRemainingMs <= 0;
    this.view.render(
      this.bodyObject.x,
      this.bodyObject.y,
      this.facing,
      moving,
      onGround,
      this.body.velocity.y,
      this.hp,
      this.balance.maxHp,
      delta,
      attack,
      this.invulnerabilityRemainingMs > 0,
    );
  }

  private updatePatrol(onGround: boolean): void {
    if (this.isBoss() || this.dead) {
      return;
    }
    // Preserve combat identities by not triggering attacks/chase; patrol is horizontal only.
    if (!onGround) {
      this.body.setVelocityX(0);
      return;
    }
    if (this.patrolDir !== -1 && this.patrolDir !== 1) {
      this.patrolDir = this.facing >= 0 ? 1 : -1;
    }
    const blockedAhead = this.patrolDir > 0 ? this.body.blocked.right : this.body.blocked.left;
    if (this.patrolTurnCooldownMs <= 0 && (blockedAhead || !this.hasGroundAhead(this.patrolDir))) {
      this.patrolDir = this.patrolDir > 0 ? -1 : 1;
      this.patrolTurnCooldownMs = 180;
    }
    this.facing = this.patrolDir;
    this.body.setVelocityX(this.patrolDir * this.balance.moveSpeed);
  }

  private hasGroundAhead(dir: -1 | 1): boolean {
    if (this.arenaPlatforms.length === 0) {
      return true;
    }
    const bodyW = this.balance.width;
    const bodyH = this.balance.height;
    const x = this.bodyObject.x;
    const bottomY = this.bodyObject.y + bodyH / 2;
    // Probe ahead before the body crosses the edge; account for body width and a small margin.
    const lookAhead = bodyW * 0.55 + 6;
    const probeX = x + dir * lookAhead;
    const worldW = this.scene.scale.width;
    if (probeX <= bodyW * 0.5 || probeX >= worldW - bodyW * 0.5) {
      return false;
    }
    const support = this.findSupportPlatform(probeX, bottomY);
    if (!support) {
      return false;
    }
    // Stay on the current platform level; do not intentionally step onto a very different level.
    const supportTop = support.y - support.height / 2;
    return Math.abs(supportTop - bottomY) <= Math.max(14, bodyH * 0.45);
  }

  private findSupportPlatform(probeX: number, bottomY: number): ArenaPlatformBounds | null {
    let best: ArenaPlatformBounds | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const platform of this.arenaPlatforms) {
      const left = platform.x - platform.width / 2;
      const right = platform.x + platform.width / 2;
      if (probeX < left + 1 || probeX > right - 1) {
        continue;
      }
      const top = platform.y - platform.height / 2;
      // Support must be near the current feet level (below or slightly above due to float/tolerance).
      if (top < bottomY - 12 || top > bottomY + 18) {
        continue;
      }
      const dist = Math.abs(top - bottomY);
      if (dist < bestDist) {
        bestDist = dist;
        best = platform;
      }
    }
    return best;
  }

  private die(): void {
    if (this.dead) {
      return;
    }
    this.dead = true;
    this.attackRemainingMs = 0;
    this.bossPhase = 'idle';
    this.bossAttack = null;
    this.attackTargets.clear();
    this.body.setVelocity(0, 0);
    this.body.enable = false;
    this.body.checkCollision.none = true;
    this.bodyObject.setActive(false);
    this.view.hide();
    AudioManager.enemyDeath(
      this.balance.archetype as 'grunt' | 'brute' | 'ranger' | 'boss',
      this.audioKey,
    );
    if (!this.deathBurstStarted) {
      this.deathBurstStarted = true;
      const floorY = this.getSupportingSurfaceTop(
        this.bodyObject.x,
        this.bodyObject.y + this.balance.height / 2,
      );
      this.view.emitDeathBurst(this.bodyObject.x, this.bodyObject.y, floorY);
    }
  }

  private getSupportingSurfaceTop(x: number, bottomY: number): number {
    let best: number | null = null;
    for (const platform of this.arenaPlatforms) {
      const left = platform.x - platform.width / 2;
      const right = platform.x + platform.width / 2;
      if (x < left - 4 || x > right + 4) {
        continue;
      }
      const top = platform.y - platform.height / 2;
      if (
        top >= bottomY - 18 &&
        (best === null || Math.abs(top - bottomY) < Math.abs(best - bottomY))
      ) {
        best = top;
      }
    }
    return best ?? bottomY;
  }

  private updateDeathEffect(delta: number): void {
    this.view.renderDeathEffect(delta);
    if (!this.deathEffectFinished && this.view.isDeathEffectFinished()) {
      this.deathEffectFinished = true;
    }
  }
}
