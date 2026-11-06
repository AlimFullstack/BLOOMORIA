import Phaser from 'phaser';
import type { ArenaPlatformBounds } from '../entities/arena/Arena';
import { Enemy, type EnemyArchetype } from '../entities/enemy/Enemy';
import { getColossusBalance, getEnemyBalance } from '../data/balance/enemy.balance';
import { Projectile } from '../entities/enemy/Projectile';
import { Shockwave } from '../entities/enemy/Shockwave';
import { HealthCubePickup } from '../entities/pickup/HealthCubePickup';

const SPAWN_X_MARGIN = 70;
const SPAWN_PLAYER_SAFE_DISTANCE = 122;
const SPAWN_ENTITY_CLEARANCE = 56;
const BOSS_WAVE_INTERVAL = 5;

interface SpawnSpec {
  type: EnemyArchetype;
  width: number;
  height: number;
  spawnY: number;
  bossWaveIndex: number;
}

export interface WaveState {
  wave: number;
  alive: number;
  pending: number;
  isBossWave: boolean;
}

export class WaveController {
  private readonly enemies: Enemy[] = [];
  private readonly projectiles: Projectile[] = [];
  private readonly shockwaves: Shockwave[] = [];
  private readonly pickups: HealthCubePickup[] = [];
  private wave = 0;
  private pendingSpawns = 0;
  private spawnTimerMs = 0;
  private intermissionMs = 0;
  private spawnOnRight = true;
  private started = false;
  private waveClearedPending = false;
  private totalKills = 0;
  private bossWave = false;
  private bossSpawnPending = false;
  private bossesKilled = 0;
  private bossDeathProcessed = new Set<Enemy>();
  private announcedWave = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly platforms: Phaser.Physics.Arcade.StaticGroup,
    private readonly arenaPlatforms: readonly ArenaPlatformBounds[],
  ) {}

  public start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.beginNextWave(0);
  }

  public consumeWaveAnnouncement(): { wave: number; isBossWave: boolean } | null {
    if (!this.started || this.wave <= 0 || this.announcedWave === this.wave) {
      return null;
    }
    this.announcedWave = this.wave;
    return { wave: this.wave, isBossWave: this.bossWave };
  }

  public getBossesKilled(): number {
    return this.bossesKilled;
  }

  public update(
    delta: number,
    playerX: number,
    playerY: number,
    playerAlive: boolean,
    paused: boolean,
  ): boolean {
    if (!this.started) {
      return false;
    }

    if (paused || !playerAlive) {
      const deathDelta = paused ? 0 : delta;
      this.updateEnemies(deathDelta, playerX, playerY);
      this.updateShockwaves(deathDelta);
      if (!playerAlive) {
        this.intermissionMs = 0;
        this.spawnTimerMs = 0;
        this.waveClearedPending = false;
      }
      return false;
    }

    this.updateEnemies(delta, playerX, playerY);
    this.updateProjectiles(delta);
    this.updateShockwaves(delta);
    this.updatePickups(delta);

    if (this.intermissionMs > 0) {
      this.intermissionMs = Math.max(0, this.intermissionMs - delta);
      if (this.intermissionMs <= 0) {
        this.beginNextWave(0);
      }
      return false;
    }

    if (this.hasPendingSpawns()) {
      this.spawnTimerMs -= delta;
      if (this.spawnTimerMs <= 0) {
        this.spawnOne(playerX, playerY);
        if (this.hasPendingSpawns()) {
          this.spawnTimerMs = this.nextSpawnDelayMs();
        }
      }
      return false;
    }

    if (this.isWaveCleared() && !this.waveClearedPending) {
      this.waveClearedPending = true;
      return true;
    }

    return false;
  }

  public beginIntermission(delayMs = 2000): void {
    if (!this.waveClearedPending) {
      return;
    }
    this.waveClearedPending = false;
    this.intermissionMs = delayMs;
  }

  public isWaitingForUpgrade(): boolean {
    return this.waveClearedPending;
  }

  public getEnemies(): readonly Enemy[] {
    return this.enemies;
  }

  public getProjectiles(): readonly Projectile[] {
    return this.projectiles;
  }

  public getShockwaves(): readonly Shockwave[] {
    return this.shockwaves;
  }

  public getPickups(): readonly HealthCubePickup[] {
    return this.pickups;
  }

  public getActiveBoss(): Enemy | null {
    for (const enemy of this.enemies) {
      if (enemy.isBoss() && !enemy.isDead()) {
        return enemy;
      }
    }
    return null;
  }

  public getState(): WaveState {
    return {
      wave: this.wave,
      alive: this.countAlive(),
      pending: this.countPendingSpawns(),
      isBossWave: this.bossWave,
    };
  }

  public getTotalKills(): number {
    return this.totalKills;
  }

  public halt(delta: number): void {
    for (const enemy of this.enemies) {
      enemy.halt(delta);
    }
  }

  public reset(): void {
    this.destroy();
    this.wave = 0;
    this.spawnOnRight = true;
    this.started = false;
    this.totalKills = 0;
    this.bossWave = false;
    this.bossSpawnPending = false;
    this.bossesKilled = 0;
    this.bossDeathProcessed.clear();
    this.announcedWave = 0;
  }

  public destroy(): void {
    for (const enemy of this.enemies) {
      enemy.destroy();
    }
    for (const projectile of this.projectiles) {
      projectile.destroy();
    }
    for (const shockwave of this.shockwaves) {
      shockwave.destroy();
    }
    for (const pickup of this.pickups) {
      pickup.destroy();
    }
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.shockwaves.length = 0;
    this.pickups.length = 0;
    this.bossDeathProcessed.clear();
    this.pendingSpawns = 0;
    this.bossSpawnPending = false;
    this.intermissionMs = 0;
    this.spawnTimerMs = 0;
    this.waveClearedPending = false;
  }

  private beginNextWave(intermissionMs: number): void {
    this.wave += 1;
    this.bossWave = this.wave % BOSS_WAVE_INTERVAL === 0;
    // Ordinary wave formula: 2 + wave regular enemies. Boss waves have half as many regular enemies (integer, floor).
    const basePendingSpawns = 2 + this.wave;
    this.pendingSpawns = this.bossWave ? Math.floor(basePendingSpawns / 2) : basePendingSpawns;
    this.bossSpawnPending = this.bossWave;
    this.intermissionMs = intermissionMs;
    this.spawnTimerMs = intermissionMs <= 0 ? 250 : 0;
  }

  private nextSpawnDelayMs(): number {
    // Preserve normal spawn timing; boss waves remain staggered via the same interval.
    return 1000 + Math.random() * 500;
  }

  private hasPendingSpawns(): boolean {
    return this.pendingSpawns > 0 || this.bossSpawnPending;
  }

  private countPendingSpawns(): number {
    return this.pendingSpawns + (this.bossSpawnPending ? 1 : 0);
  }

  private chooseArchetype(): EnemyArchetype {
    const wave = this.wave;
    if (wave <= 1) {
      return 'grunt';
    }
    let bruteChance = 0;
    let rangerChance = 0;
    if (wave >= 3) {
      bruteChance = Math.min(0.28, 0.12 + (wave - 3) * 0.04);
    }
    if (wave >= 4) {
      rangerChance = Math.min(0.22, 0.1 + (wave - 4) * 0.03);
    }
    const roll = Math.random();
    if (roll < bruteChance) {
      return 'brute';
    }
    if (roll < bruteChance + rangerChance) {
      return 'ranger';
    }
    return 'grunt';
  }

  private spawnOne(playerX: number, playerY: number): void {
    if (!this.hasPendingSpawns()) {
      return;
    }
    // Spawn the boss first on boss waves, then regular enemies via the shared system.
    const type = this.bossSpawnPending ? 'colossus' : this.chooseArchetype();
    const spec = this.createSpawnSpec(type);
    this.spawnEnemy(spec, playerX, playerY);
  }

  private createSpawnSpec(type: EnemyArchetype): SpawnSpec {
    const bossWaveIndex = Math.max(1, Math.floor(this.wave / BOSS_WAVE_INTERVAL));
    const balance = type === 'colossus' ? getColossusBalance(bossWaveIndex) : getEnemyBalance(type);
    return {
      type,
      width: balance.width,
      height: balance.height,
      spawnY: balance.spawnY,
      bossWaveIndex,
    };
  }

  private spawnEnemy(spec: SpawnSpec, playerX: number, playerY: number): void {
    const position = this.findSpawnPosition(playerX, playerY, spec);
    if (!position) {
      // Do not drop pending spawns: crowded/edge cases would lose enemies (1-2 total, one-sided).
      // Defer and retry on the next spawn tick while keeping wave count intact.
      this.spawnTimerMs = 220;
      return;
    }

    const enemy = new Enemy(
      this.scene,
      position.x,
      position.y,
      this.arenaPlatforms,
      spec.type,
      spec.bossWaveIndex,
      this.bossesKilled,
    );
    this.scene.physics.add.collider(enemy.getBodyObject(), this.platforms);
    this.enemies.push(enemy);
    // Alternate side preference after a successful spawn to avoid one-sided clustering.
    this.spawnOnRight = position.x < this.scene.scale.width / 2;
    if (spec.type === 'colossus') {
      this.bossSpawnPending = false;
    } else {
      this.pendingSpawns = Math.max(0, this.pendingSpawns - 1);
    }
  }

  private findSpawnPosition(
    playerX: number,
    playerY: number,
    spec: SpawnSpec,
  ): { x: number; y: number } | null {
    const worldWidth = this.scene.scale.width;
    const rightX = this.getSpawnX(true, spec.width);
    const leftX = this.getSpawnX(false, spec.width);
    // Strict pass respects player distance and enemy clearance; relaxed pass keeps player distance
    // but ignores crowding to avoid silently dropping pending spawns (cause of 1-2 enemy waves).
    const candidates = [
      { x: this.spawnOnRight ? rightX : leftX, y: spec.spawnY, strict: true },
      { x: this.spawnOnRight ? leftX : rightX, y: spec.spawnY, strict: true },
      { x: this.spawnOnRight ? rightX : leftX, y: spec.spawnY, strict: false },
      { x: this.spawnOnRight ? leftX : rightX, y: spec.spawnY, strict: false },
      { x: worldWidth * 0.2, y: spec.spawnY, strict: false },
      { x: worldWidth * 0.8, y: spec.spawnY, strict: false },
    ];
    for (const candidate of candidates) {
      if (
        this.isSpawnPositionValid(
          candidate.x,
          candidate.y,
          playerX,
          playerY,
          spec,
          candidate.strict,
        )
      ) {
        return { x: candidate.x, y: candidate.y };
      }
    }
    return null;
  }

  private isSpawnPositionValid(
    x: number,
    y: number,
    playerX: number,
    playerY: number,
    spec: SpawnSpec,
    strictEnemyClearance = true,
  ): boolean {
    const worldWidth = this.scene.scale.width;
    const worldHeight = this.scene.scale.height;
    const margin = SPAWN_X_MARGIN / 2 + spec.width / 2;
    if (x < margin || x > worldWidth - margin) {
      return false;
    }
    if (y < spec.height / 2 || y > worldHeight - spec.height / 2) {
      return false;
    }
    const safeDistance = SPAWN_PLAYER_SAFE_DISTANCE + spec.width * 0.35;
    if (Math.hypot(x - playerX, y - playerY) < safeDistance) {
      return false;
    }
    if (!strictEnemyClearance) {
      return true;
    }
    for (const enemy of this.enemies) {
      if (enemy.isDead()) {
        continue;
      }
      const body = enemy.getBodyObject();
      const clearance = SPAWN_ENTITY_CLEARANCE + spec.width * 0.4;
      if (Math.hypot(x - body.x, y - body.y) < clearance) {
        return false;
      }
    }
    return true;
  }

  private getSpawnX(right: boolean, width: number): number {
    const inset = SPAWN_X_MARGIN + Math.max(0, width / 2 - 20);
    return right ? this.scene.scale.width - inset : inset;
  }

  private updateEnemies(delta: number, playerX: number, playerY: number): void {
    const emitProjectile = (projectile: Projectile): void => {
      this.projectiles.push(projectile);
    };
    const emitShockwave = (shockwave: Shockwave): void => {
      this.shockwaves.push(shockwave);
    };
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = this.enemies[i];
      if (!enemy.isDead()) {
        enemy.update(playerX, playerY, delta, emitProjectile, emitShockwave);
        continue;
      }

      // Progression increments exactly once per boss death; processed set prevents duplicates.
      if (enemy.isBoss() && !this.bossDeathProcessed.has(enemy)) {
        this.bossDeathProcessed.add(enemy);
        this.bossesKilled += 1;
      }

      const reward = enemy.consumeDeathReward();
      if (reward?.isBoss) {
        this.pickups.push(new HealthCubePickup(this.scene, this.platforms, reward.x, reward.y));
      }

      enemy.update(enemy.getBodyObject().x, enemy.getBodyObject().y, delta);
      if (enemy.isDeathEffectFinished()) {
        this.bossDeathProcessed.delete(enemy);
        this.totalKills += 1;
        enemy.destroy();
        this.enemies.splice(i, 1);
      }
    }
  }

  private updateProjectiles(delta: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = this.projectiles[i];
      projectile.update(delta);
      if (
        !projectile.isActive() ||
        projectile.hasHit() ||
        this.projectileHitsPlatform(projectile)
      ) {
        projectile.destroy();
        this.projectiles.splice(i, 1);
      }
    }
  }

  private projectileHitsPlatform(projectile: Projectile): boolean {
    const bounds = projectile.getBounds();
    for (const platform of this.arenaPlatforms) {
      const left = platform.x - platform.width / 2;
      const top = platform.y - platform.height / 2;
      if (
        bounds.right > left &&
        bounds.left < left + platform.width &&
        bounds.bottom > top &&
        bounds.top < top + platform.height
      ) {
        return true;
      }
    }
    return false;
  }

  private updateShockwaves(delta: number): void {
    for (let i = this.shockwaves.length - 1; i >= 0; i -= 1) {
      const shockwave = this.shockwaves[i];
      shockwave.update(delta);
      if (!shockwave.isActive() || shockwave.hasHit()) {
        shockwave.destroy();
        this.shockwaves.splice(i, 1);
      }
    }
  }

  private updatePickups(delta: number): void {
    for (let i = this.pickups.length - 1; i >= 0; i -= 1) {
      const pickup = this.pickups[i];
      pickup.update(delta);
      if (!pickup.isActive() && !pickup.isCollected()) {
        pickup.destroy();
        this.pickups.splice(i, 1);
      } else if (!pickup.bodyObject.active) {
        this.pickups.splice(i, 1);
      }
    }
  }

  private countAlive(): number {
    let count = 0;
    for (const enemy of this.enemies) {
      if (!enemy.isDead()) {
        count += 1;
      }
    }
    return count;
  }

  private isWaveCleared(): boolean {
    // Completion requires all pending spawns done and no enemies remaining (boss + regulars).
    return !this.hasPendingSpawns() && this.enemies.length === 0;
  }
}
