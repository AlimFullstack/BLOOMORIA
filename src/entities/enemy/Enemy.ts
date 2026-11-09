import Phaser from 'phaser';
import { AudioManager } from '../../audio/AudioManager';
import type { ArenaPlatformBounds } from '../arena/Arena';
import {
  ENEMY_AI_CONFIG,
  MIN_ENEMY_ATTACK_COOLDOWN_MS,
  getColossusBalance,
  getEnemyBalance,
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
  private static readonly ATTACK_TELEGRAPH_MS = 300;
  private static readonly SPAWN_LAND_TIMEOUT_MS = 5000;

  private readonly bodyObject: Phaser.GameObjects.Rectangle;
  private readonly body: Phaser.Physics.Arcade.Body;
  private readonly view: EnemyView;
  private readonly balance: EnemyBalance;
  private readonly audioKey: string;
  private readonly onLanded?: (x: number, bottomY: number, color: string) => void;
  private facing: EnemyFacing = -1;
  private hp: number;
  private dead = false;
  private deathBurstStarted = false;
  private deathEffectFinished = false;
  private deathRewardConsumed = false;
  private spawning = false;
  private spawnMs = 0;
  private spawnLandTimeoutWarned = false;
  private invulnerabilityRemainingMs = 0;
  private attackCooldownRemainingMs = 0;
  private attackTelegraphRemainingMs = 0;
  private attackTelegraphTotalMs = Enemy.ATTACK_TELEGRAPH_MS;
  private attackTelegraphKind: 'melee' | 'ranged' | null = null;
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
    wave = 1,
    options?: { skyDrop?: boolean; onLanded?: (x: number, bottomY: number, color: string) => void },
  ) {
    const baseBalance =
      archetype === 'colossus' ? getColossusBalance(bossWaveIndex) : getEnemyBalance(archetype);
    this.balance = scaleEnemyBalance(baseBalance, bossesKilled, wave);
    this.hp = this.balance.maxHp;
    this.arenaPlatforms = arenaPlatforms;
    this.onLanded = options?.onLanded;
    this.spawning = options?.skyDrop === true;
    enemyAudioSeq += 1;
    this.audioKey = `${this.balance.archetype}-${enemyAudioSeq}`;
    this.bodyObject = this.scene.add.rectangle(x, y, this.balance.width, this.balance.height);
    this.bodyObject.setVisible(false);

    this.scene.physics.add.existing(this.bodyObject);
    this.body = this.bodyObject.body as Phaser.Physics.Arcade.Body;
    this.body.setSize(this.balance.width, this.balance.height);
    this.body.setCollideWorldBounds(true);
    if (this.spawning) {
      this.body.setVelocity(0, 0);
    }

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

  public getViewColor(): string {
    return this.balance.view.border;
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

  public getContactDamage(): number {
    return this.balance.contactDamage;
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

  public isSpawning(): boolean {
    return this.spawning;
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

    if (this.spawning) {
      this.updateSpawnLanding(delta);
      return;
    }

    this.tickTimers(delta);
    const dx = targetX - this.bodyObject.x;
    const dy = targetY - this.bodyObject.y;
    const absDx = Math.abs(dx);
    // Complete 300ms telegraphs before behavior; no damage/projectile/shockwave emission here.
    this.tickAttackTelegraph(dx, dy, absDx);
    if (this.dead) {
      this.updateDeathEffect(delta);
      return;
    }
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

    const playerDistance = Math.hypot(dx, dy);
    const playerFar = !this.isBoss() && playerDistance > ENEMY_AI_CONFIG.patrolDetectDistance;
    if (playerFar) {
      this.clearRecovery();
      this.stuckMs = 0;
    }
    const canPatrol = playerFar && this.attackRemainingMs <= 0 && !this.isAttackTelegraphing();

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
    this.wasOnGround = onGround;
  }

  private updateSpawnLanding(delta: number): void {
    // Real physics fall: gravity/colliders handled by Phaser; no AI, no horizontal movement, no attacks.
    this.body.setVelocityX(0);
    this.spawnMs += Math.max(0, delta);
    const onGround = this.body.blocked.down || this.body.touching.down;
    if (onGround) {
      this.spawning = false;
      this.body.setVelocityX(0);
      this.lastStuckCheckX = this.bodyObject.x;
      this.wasOnGround = true;
      AudioManager.enemyLand(this.audioKey);
      const bottomY = this.bodyObject.y + this.balance.height / 2;
      this.onLanded?.(this.bodyObject.x, bottomY, this.balance.view.border);
      this.render(delta);
      return;
    }
    if (!this.spawnLandTimeoutWarned && this.spawnMs >= Enemy.SPAWN_LAND_TIMEOUT_MS) {
      this.spawnLandTimeoutWarned = true;
      console.warn('[BLOOMORIA][spawn] enemy failed to land in time', {
        archetype: this.balance.archetype,
        x: Math.round(this.bodyObject.x),
        y: Math.round(this.bodyObject.y),
        vy: Math.round(this.body.velocity.y),
        spawnMs: Math.round(this.spawnMs),
      });
    }
    this.render(delta);
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

    if (this.isAttackTelegraphing()) {
      this.body.setVelocityX(0);
      this.updateFacingTowardTarget(dx); // visual tracking only; commit uses locked direction
      this.clearRecovery();
      return;
    }
    if (this.attackRemainingMs > 0) {
      this.body.setVelocityX(0);
      this.clearRecoveryIfProgressPossible(dx, dy, absDx, onGround);
      return;
    }
    if (inAttackRange) {
      this.body.setVelocityX(0);
      this.updateFacingTowardTarget(dx);
      this.tryAttack();
      if (this.isAttackTelegraphing()) {
        this.clearRecovery();
        return;
      }
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
          AudioManager.enemyAttack('boss', this.audioKey);
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
      // Phase 11.11: mandatory 300ms telegraph before damage/shockwave emission.
      this.bossPhaseMs = Enemy.ATTACK_TELEGRAPH_MS;
      this.attackRemainingMs = this.bossPhaseMs;
      this.bossSlamCooldownMs = Math.max(500, Math.round(this.balance.slamCooldownMs));
    } else {
      this.bossPhaseMs = Enemy.ATTACK_TELEGRAPH_MS;
      this.attackRemainingMs = this.bossPhaseMs;
      this.bossMeleeCooldownMs = Math.max(
        MIN_ENEMY_ATTACK_COOLDOWN_MS,
        Math.round(this.balance.attackCooldownMs),
      );
      // Audio delayed to active transition (after 300ms telegraph) for fairness.
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

    if (this.isAttackTelegraphing()) {
      this.body.setVelocityX(0);
      return;
    }

    if (this.attackRemainingMs > 0) {
      this.body.setVelocityX(0);
      const total =
        this.attackDurationTotalMs > 0 ? this.attackDurationTotalMs : this.balance.attackDurationMs;
      const progress = 1 - this.attackRemainingMs / Math.max(1, total);
      // Projectile launched only after telegraph completed (commit); firing delayed within active window.
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
    this.cancelAttackTelegraph();
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

  public applyGroundSlamKnockback(
    fromX: number,
    fromY: number,
    horizontal: number,
    vertical: number,
    durationMs: number,
    maxSpeed: number,
  ): void {
    // Boss respects knockback immunity; regular enemies are pushed away from impact.
    if (this.dead || this.isBoss() || !this.body.enable) {
      return;
    }
    const dx = this.bodyObject.x - fromX;
    const dy = this.bodyObject.y - fromY;
    const len = Math.hypot(dx, dy);
    const dirX = len > 0.001 ? dx / len : this.bodyObject.x >= fromX ? 1 : -1;
    const dirY = len > 0.001 ? dy / len : -0.35;
    const impulseX = Phaser.Math.Clamp(horizontal, 0, Math.max(0, maxSpeed));
    const impulseY = Phaser.Math.Clamp(vertical, 0, Math.max(0, maxSpeed));
    if (impulseX <= 0 && impulseY <= 0) {
      return;
    }
    this.knockbackDirX = (dirX >= 0 ? 1 : -1) as -1 | 1;
    this.knockbackRemainingMs = Math.max(0, durationMs);
    this.clearRecovery();
    this.cancelAttackTelegraph();
    this.jumpAttemptMs = 0;
    if (this.bossPhase === 'idle') {
      this.attackRemainingMs = 0;
      this.attackTargets.clear();
      this.rangedShotFired = false;
    }
    this.body.setVelocityX(dirX * impulseX);
    const up = Math.min(-impulseY * 0.45, dirY * impulseY * 0.25);
    if (up < 0) {
      this.body.setVelocityY(Math.min(this.body.velocity.y, up));
    }
    const maxVx = Math.max(this.balance.moveSpeed, impulseX, maxSpeed);
    this.body.velocity.x = Phaser.Math.Clamp(this.body.velocity.x, -maxVx, maxVx);
  }

  public emitHitImpact(x: number, y: number, dirX: number, dirY: number): void {
    this.view.emitHitImpact(x, y, dirX, dirY);
  }

  public destroy(): void {
    this.view.destroy();
    this.body.destroy();
    this.bodyObject.destroy();
  }

  private isAttackTelegraphing(): boolean {
    return this.attackTelegraphRemainingMs > 0 && this.attackTelegraphKind !== null;
  }

  private cancelAttackTelegraph(): void {
    this.attackTelegraphRemainingMs = 0;
    this.attackTelegraphKind = null;
    this.attackTelegraphTotalMs = Enemy.ATTACK_TELEGRAPH_MS;
  }

  private tryAttack(): void {
    if (
      this.attackCooldownRemainingMs > 0 ||
      this.attackRemainingMs > 0 ||
      this.attackTelegraphRemainingMs > 0
    ) {
      return;
    }
    // Phase 11.11: telegraph starts on attack decision; direction locks for the telegraphed attack.
    this.attackDirectionX = this.facing;
    this.attackTargets.clear();
    this.rangedShotFired = false;
    this.attackTelegraphKind = this.balance.archetype === 'ranger' ? 'ranged' : 'melee';
    // Regular enemies: half warning time (boss/colossus keeps full telegraph in startBossAttack).
    const telegraphMs = Math.round(Enemy.ATTACK_TELEGRAPH_MS / 2);
    this.attackTelegraphTotalMs = telegraphMs;
    this.attackTelegraphRemainingMs = telegraphMs;
  }

  private commitAttackAfterTelegraph(_dx: number, dy: number, absDx: number): void {
    const kind = this.attackTelegraphKind;
    this.cancelAttackTelegraph();
    if (this.dead) return;
    if (kind === 'ranged') {
      const inRange =
        absDx <= this.balance.attackRange && Math.abs(dy) <= this.balance.attackHeight * 2.2;
      if (!inRange) return;
      this.attackDirectionX = this.facing;
      this.attackTargets.clear();
      this.rangedShotFired = false;
      this.attackDurationTotalMs = Math.max(80, Math.round(this.balance.attackDurationMs));
      this.attackRemainingMs = this.attackDurationTotalMs;
      this.attackCooldownRemainingMs = Math.max(
        MIN_ENEMY_ATTACK_COOLDOWN_MS,
        Math.round(this.balance.attackCooldownMs),
      );
      return;
    }
    const inAttackRange =
      absDx <= this.balance.attackRange && Math.abs(dy) <= this.balance.attackHeight;
    if (!inAttackRange) return;
    this.attackDirectionX = this.facing;
    this.attackTargets.clear();
    this.rangedShotFired = false;
    this.attackDurationTotalMs = Math.max(80, Math.round(this.balance.attackDurationMs));
    this.attackRemainingMs = this.attackDurationTotalMs;
    this.attackCooldownRemainingMs = Math.max(
      MIN_ENEMY_ATTACK_COOLDOWN_MS,
      Math.round(this.balance.attackCooldownMs),
    );
    AudioManager.enemyAttack(
      this.balance.archetype as 'grunt' | 'brute' | 'ranger' | 'boss',
      this.audioKey,
    );
  }

  private tickAttackTelegraph(dx: number, dy: number, absDx: number): void {
    if (this.dead || !this.attackTelegraphKind) return;
    // Pause-safe: timer decremented in tickTimers only while update() runs.
    if (this.attackTelegraphRemainingMs <= 0) {
      this.commitAttackAfterTelegraph(dx, dy, absDx);
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
    if (this.attackTelegraphRemainingMs > 0 && this.balance.archetype !== 'colossus') {
      this.attackTelegraphRemainingMs = Math.max(0, this.attackTelegraphRemainingMs - delta);
      if (this.attackTelegraphRemainingMs <= 0) {
        // Commit occurs in update() after recheck; keep kind/total for commit.
      }
    }
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
            ? Enemy.ATTACK_TELEGRAPH_MS
            : 260
          : this.bossPhase === 'telegraph'
            ? Enemy.ATTACK_TELEGRAPH_MS
            : this.balance.attackDurationMs;
      attack = {
        progress: totalMs > 0 ? 1 - this.bossPhaseMs / totalMs : 1,
        directionX: this.attackDirectionX,
        range: this.balance.attackRange,
        height: this.balance.attackHeight,
        preparing: this.bossPhase === 'telegraph',
        kind: this.bossAttack === 'slam' ? 'slam' : 'melee',
      };
    } else if (this.attackTelegraphRemainingMs > 0 && this.attackTelegraphKind) {
      attack = {
        progress: 1 - this.attackTelegraphRemainingMs / Math.max(1, this.attackTelegraphTotalMs),
        directionX: this.attackDirectionX,
        range: this.balance.attackRange,
        height: this.balance.attackHeight,
        preparing: true,
        kind: this.attackTelegraphKind,
      };
    } else if (this.attackRemainingMs > 0) {
      const total =
        this.attackDurationTotalMs > 0 ? this.attackDurationTotalMs : this.balance.attackDurationMs;
      attack = {
        progress: 1 - this.attackRemainingMs / Math.max(1, total),
        directionX: this.attackDirectionX,
        range: this.balance.attackRange,
        height: this.balance.attackHeight,
        preparing: false,
        kind: this.balance.archetype === 'ranger' ? 'ranged' : 'melee',
      };
    }

    const onGround = this.body.blocked.down || this.body.touching.down;
    const moving =
      Math.abs(this.body.velocity.x) > 0.1 &&
      this.bossPhase === 'idle' &&
      this.attackRemainingMs <= 0 &&
      this.attackTelegraphRemainingMs <= 0;
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
    this.cancelAttackTelegraph();
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
      this.view.emitDeathBurst(this.bodyObject.x, this.bodyObject.y, this.arenaPlatforms);
    }
  }

  private updateDeathEffect(delta: number): void {
    this.view.renderDeathEffect(delta);
    if (!this.deathEffectFinished && this.view.isDeathEffectFinished()) {
      this.deathEffectFinished = true;
    }
  }
}
