export type EnemyArchetype = 'grunt' | 'brute' | 'ranger' | 'colossus';

export interface EnemyViewConfig {
  body: string;
  bodyDark: string;
  outline: string;
  core: string;
  weaponBlade: string;
  weaponEdge: string;
  weaponHandle: string;
  swingSpark: string;
  hpFill: string;
  hpEmpty: string;
  death: string;
  projectile?: string;
  shape: 'grunt' | 'brute' | 'ranger' | 'colossus';
}

export interface EnemyBalance {
  archetype: EnemyArchetype;
  width: number;
  height: number;
  moveSpeed: number;
  stopDistance: number;
  spawnY: number;
  maxHp: number;
  attackDamage: number;
  invulnerabilityMs: number;
  attackCooldownMs: number;
  attackDurationMs: number;
  attackRange: number;
  attackHeight: number;
  jumpSpeed: number;
  jumpCooldownMs: number;
  jumpHeightThreshold: number;
  jumpHorizontalThreshold: number;
  projectileSpeed: number;
  projectileLifetimeMs: number;
  projectileSize: number;
  preferredDistance: number;
  retreatDistance: number;
  slamDamage: number;
  slamTelegraphMs: number;
  slamCooldownMs: number;
  shockwaveSpeed: number;
  shockwaveWidth: number;
  shockwaveHeight: number;
  shockwaveLifetimeMs: number;
  knockbackHorizontal: number;
  knockbackVertical: number;
  knockbackDurationMs: number;
  knockbackMaxSpeed: number;
  view: EnemyViewConfig;
}

export const ENEMY_AI_CONFIG = {
  patrolDetectDistance: 500,
} as const;

const BASE_COMBAT = {
  slamDamage: 0,
  slamTelegraphMs: 0,
  slamCooldownMs: 0,
  shockwaveSpeed: 0,
  shockwaveWidth: 0,
  shockwaveHeight: 0,
  shockwaveLifetimeMs: 0,
};

export const MIN_ENEMY_ATTACK_COOLDOWN_MS = 180;
export const MIN_ENEMY_MOVEMENT_SPEED = 10;

export function getProgressionAttackFrequencyMultiplier(bossesKilled: number): number {
  return 1 + Math.max(0, bossesKilled) * 0.5;
}

export function getProgressionMaxHp(baseMaxHp: number, multiplier: number): number {
  return Math.max(1, Math.round(baseMaxHp * multiplier * 10) / 10);
}

export function getProgressionAttackDamage(baseDamage: number, multiplier: number): number {
  if (baseDamage <= 0) return 0;
  return Math.max(0.1, Math.round(baseDamage * multiplier * 10) / 10);
}

export function getProgressionMoveSpeed(baseSpeed: number, multiplier: number): number {
  if (baseSpeed <= 0) return 0;
  return Math.max(MIN_ENEMY_MOVEMENT_SPEED, Math.round(baseSpeed * multiplier));
}

export function getProgressionProjectileSpeed(baseSpeed: number, multiplier: number): number {
  if (baseSpeed <= 0) return 0;
  return Math.max(1, Math.round(baseSpeed * multiplier));
}

export function getProgressionAttackCooldownMs(
  baseCooldownMs: number,
  multiplier: number,
  minMs = MIN_ENEMY_ATTACK_COOLDOWN_MS,
): number {
  if (baseCooldownMs <= 0) return 0;
  return Math.max(minMs, Math.round(baseCooldownMs / multiplier));
}

export function scaleEnemyBalance(base: EnemyBalance, bossesKilled: number): EnemyBalance {
  const multiplier = getProgressionAttackFrequencyMultiplier(bossesKilled);
  return {
    ...base,
    maxHp: getProgressionMaxHp(base.maxHp, multiplier),
    attackDamage: getProgressionAttackDamage(base.attackDamage, multiplier),
    slamDamage: getProgressionAttackDamage(base.slamDamage, multiplier),
    // Enemy movement speed does not scale with boss-kill progression.
    moveSpeed: base.moveSpeed,
    attackCooldownMs: getProgressionAttackCooldownMs(base.attackCooldownMs, multiplier),
    slamCooldownMs: getProgressionAttackCooldownMs(base.slamCooldownMs, multiplier, 500),
    projectileSpeed: getProgressionProjectileSpeed(base.projectileSpeed, multiplier),
    shockwaveSpeed: getProgressionProjectileSpeed(base.shockwaveSpeed, multiplier),
  };
}

export const GRUNT_BALANCE: EnemyBalance = {
  archetype: 'grunt',
  width: 42,
  height: 34,
  moveSpeed: 120,
  stopDistance: 28,
  spawnY: 645,
  maxHp: 2,
  attackDamage: 1,
  invulnerabilityMs: 200,
  attackCooldownMs: 1500,
  attackDurationMs: 180,
  attackRange: 54,
  attackHeight: 40,
  jumpSpeed: 730,
  jumpCooldownMs: 650,
  jumpHeightThreshold: 38,
  jumpHorizontalThreshold: 260,
  projectileSpeed: 0,
  projectileLifetimeMs: 0,
  projectileSize: 0,
  preferredDistance: 0,
  retreatDistance: 0,
  knockbackHorizontal: 220,
  knockbackVertical: 90,
  knockbackDurationMs: 140,
  knockbackMaxSpeed: 260,
  ...BASE_COMBAT,
  view: {
    shape: 'grunt',
    body: '#E06A7A',
    bodyDark: '#B94E5F',
    outline: '#6A2734',
    core: '#FFD8DE',
    weaponBlade: '#F3DCE0',
    weaponEdge: '#FFFFFF',
    weaponHandle: '#6A2734',
    swingSpark: '#FFE2E6',
    hpFill: '#FF4D5A',
    hpEmpty: '#3A2230',
    death: '#E06A7A',
  },
};

export const BRUTE_BALANCE: EnemyBalance = {
  ...GRUNT_BALANCE,
  archetype: 'brute',
  width: 60,
  height: 48,
  moveSpeed: 78,
  stopDistance: 34,
  maxHp: 5,
  attackDamage: 2,
  attackCooldownMs: 2250,
  attackDurationMs: 220,
  attackRange: 66,
  attackHeight: 52,
  jumpSpeed: 690,
  jumpHorizontalThreshold: 240,
  knockbackHorizontal: 120,
  knockbackVertical: 55,
  knockbackDurationMs: 120,
  knockbackMaxSpeed: 150,
  view: {
    shape: 'brute',
    body: '#7C5A44',
    bodyDark: '#5A3E2F',
    outline: '#2D1E17',
    core: '#FFD39A',
    weaponBlade: '#D8C3A5',
    weaponEdge: '#FFF4D8',
    weaponHandle: '#3B2A20',
    swingSpark: '#FFD39A',
    hpFill: '#FF8A3D',
    hpEmpty: '#3A2418',
    death: '#A56A44',
  },
};

export const RANGER_BALANCE: EnemyBalance = {
  ...GRUNT_BALANCE,
  archetype: 'ranger',
  width: 38,
  height: 32,
  moveSpeed: 96,
  stopDistance: 0,
  maxHp: 2,
  attackDamage: 1,
  attackCooldownMs: 2000,
  attackDurationMs: 420,
  attackRange: 520,
  attackHeight: 44,
  jumpSpeed: 700,
  jumpHorizontalThreshold: 220,
  projectileSpeed: 360,
  projectileLifetimeMs: 1800,
  projectileSize: 8,
  preferredDistance: 280,
  retreatDistance: 190,
  knockbackHorizontal: 190,
  knockbackVertical: 75,
  knockbackDurationMs: 130,
  knockbackMaxSpeed: 220,
  view: {
    shape: 'ranger',
    body: '#5FA8A0',
    bodyDark: '#3E7A74',
    outline: '#1E3F3B',
    core: '#D9FFF7',
    weaponBlade: '#CFF7FF',
    weaponEdge: '#FFFFFF',
    weaponHandle: '#2B5E59',
    swingSpark: '#A8FFF0',
    hpFill: '#4FE3C2',
    hpEmpty: '#1E3532',
    death: '#5FA8A0',
    projectile: '#8FFFF0',
  },
};

export const COLOSSUS_BASE_BALANCE: EnemyBalance = {
  ...GRUNT_BALANCE,
  archetype: 'colossus',
  width: 112,
  height: 86,
  moveSpeed: 48,
  stopDistance: 52,
  spawnY: 619,
  maxHp: 18,
  attackDamage: 2,
  invulnerabilityMs: 120,
  attackCooldownMs: 2600,
  attackDurationMs: 320,
  attackRange: 92,
  attackHeight: 74,
  jumpSpeed: 620,
  jumpCooldownMs: 1200,
  jumpHeightThreshold: 46,
  jumpHorizontalThreshold: 180,
  projectileSpeed: 0,
  projectileLifetimeMs: 0,
  projectileSize: 0,
  preferredDistance: 0,
  retreatDistance: 0,
  slamDamage: 1,
  slamTelegraphMs: 700,
  slamCooldownMs: 4200,
  shockwaveSpeed: 260,
  shockwaveWidth: 34,
  shockwaveHeight: 20,
  shockwaveLifetimeMs: 1800,
  knockbackHorizontal: 0,
  knockbackVertical: 0,
  knockbackDurationMs: 0,
  knockbackMaxSpeed: 0,
  view: {
    shape: 'colossus',
    body: '#6E768C',
    bodyDark: '#4A5163',
    outline: '#222833',
    core: '#FFE2A8',
    weaponBlade: '#C9D2E3',
    weaponEdge: '#FFFFFF',
    weaponHandle: '#343B49',
    swingSpark: '#FFD27A',
    hpFill: '#FFB347',
    hpEmpty: '#2B3040',
    death: '#8C95AA',
    projectile: '#FFD27A',
  },
};

export const ENEMY_BALANCE = GRUNT_BALANCE;

export function getEnemyBalance(archetype: EnemyArchetype): EnemyBalance {
  switch (archetype) {
    case 'brute':
      return BRUTE_BALANCE;
    case 'ranger':
      return RANGER_BALANCE;
    case 'colossus':
      return COLOSSUS_BASE_BALANCE;
    case 'grunt':
    default:
      return GRUNT_BALANCE;
  }
}

/**
 * Base Colossus balance. Boss-wave index is used only for spawn scheduling/counting,
 * not for stat scaling. All archetypes scale via scaleEnemyBalance(..., bossesKilled).
 */
export function getColossusBalance(_bossWaveIndex: number): EnemyBalance {
  return { ...COLOSSUS_BASE_BALANCE };
}
