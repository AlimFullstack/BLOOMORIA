export type EnemyArchetype = 'grunt' | 'brute' | 'ranger' | 'colossus';

export interface EnemyViewConfig {
  shape: 'grunt' | 'brute' | 'ranger' | 'colossus';
  // Core palette (Phase 11.14: full per-archetype identity, centralized)
  primary: string; // main body
  secondary: string; // secondary body/detail
  shadow: string; // dark depth/facets
  highlight: string; // light facets
  border: string; // expressive outline
  accent: string; // characteristic details/eyes/weapon accents
  attack: string; // attack VFX
  projectile: string; // projectile/shockwave color (fallback to attack when unused)
  hit: string; // hit impact/sparks
  death: string[]; // death particle palette (2-3 tones, archetype-specific)
  // Back-compat aliases consumed by existing renderers (kept in sync with palette above)
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

export function projectileTelegraphHalfHeight(balance: EnemyBalance): number {
  return Math.max(4, balance.projectileSize / 2 + 2);
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
  return 1 + Math.max(0, bossesKilled) * 0.05;
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
  spawnY: 551, // Phase 11.15: low platform top 568 (Y_LOW 580) - 34/2
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
    // Grunt — red (Phase 11.15: slightly reduced brightness, identity preserved)
    primary: '#BE2235',
    secondary: '#9E1624',
    shadow: '#5A0D16',
    highlight: '#E85B72',
    border: '#30060D',
    accent: '#E39AA8',
    attack: '#D83F5A',
    projectile: '#D83F5A',
    hit: '#E8B4BE',
    death: ['#BE2235', '#D83F5A', '#7A0E1B'],
    body: '#BE2235',
    bodyDark: '#7A0E1B',
    outline: '#30060D',
    core: '#F2D7DC',
    weaponBlade: '#D97A8C',
    weaponEdge: '#EBC7CF',
    weaponHandle: '#3E0811',
    swingSpark: '#D83F5A',
    hpFill: '#BE2235',
    hpEmpty: '#30060D',
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
    // Brute — brown/bronze (Phase 11.15: slightly reduced brightness)
    primary: '#7A4F26',
    secondary: '#916341',
    shadow: '#3F2710',
    highlight: '#B2885E',
    border: '#241609',
    accent: '#BA8E63',
    attack: '#B06C26',
    projectile: '#B06C26',
    hit: '#D8BE98',
    death: ['#7A4F26', '#996D45', '#503315'],
    body: '#7A4F26',
    bodyDark: '#503315',
    outline: '#241609',
    core: '#EADBC8',
    weaponBlade: '#A2662D',
    weaponEdge: '#DCC0A0',
    weaponHandle: '#241609',
    swingSpark: '#BA8E63',
    hpFill: '#7A4F26',
    hpEmpty: '#241609',
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
    // Ranger — turquoise (Phase 11.15: slightly reduced brightness)
    primary: '#139FA5',
    secondary: '#0D8995',
    shadow: '#094354',
    highlight: '#67CFE0',
    border: '#062A38',
    accent: '#84DEE8',
    attack: '#26B8A6',
    projectile: '#2BC6CC',
    hit: '#B4E7EC',
    death: ['#139FA5', '#2BC6CC', '#09616F'],
    body: '#139FA5',
    bodyDark: '#09616F',
    outline: '#062A38',
    core: '#D8F5F2',
    weaponBlade: '#4FCDBB',
    weaponEdge: '#B6EDE5',
    weaponHandle: '#062A38',
    swingSpark: '#26B8A6',
    hpFill: '#139FA5',
    hpEmpty: '#062A38',
  },
};

export const COLOSSUS_BASE_BALANCE: EnemyBalance = {
  ...GRUNT_BALANCE,
  archetype: 'colossus',
  width: 112,
  height: 86,
  moveSpeed: 48,
  stopDistance: 52,
  spawnY: 525, // Phase 11.15: low platform top 568 (Y_LOW 580) - 86/2
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
    // Colossus — gray/metallic (Phase 11.15: slightly reduced brightness, remains gray)
    primary: '#777D86',
    secondary: '#606873',
    shadow: '#323840',
    highlight: '#AEB6C1',
    border: '#191E24',
    accent: '#919DAB',
    attack: '#98A2AE',
    projectile: '#8893A0',
    hit: '#C0C7D1',
    death: ['#777D86', '#9EA7B2', '#40474F'],
    body: '#777D86',
    bodyDark: '#40474F',
    outline: '#191E24',
    core: '#DEE4EC',
    weaponBlade: '#A2ACB8',
    weaponEdge: '#D1D8E2',
    weaponHandle: '#20262D',
    swingSpark: '#98A2AE',
    hpFill: '#777D86',
    hpEmpty: '#20262D',
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
