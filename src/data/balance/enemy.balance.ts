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
  contactDamage: number;
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

// Back-compat exports (used by Enemy). Unified progression lives in progression.balance.ts.
export function getProgressionAttackFrequencyMultiplier(bossesKilled: number): number {
  const b = Math.max(0, Math.floor(bossesKilled));
  return 1 + b * 0.03;
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

export function scaleEnemyBalance(
  base: EnemyBalance,
  bossesKilled: number,
  wave = 1,
): EnemyBalance {
  // Lazy import avoided to keep module simple; mirror unified formula via progression helper logic inline? No - use centralized function through require pattern not possible in ESM. Instead keep API and implement unified here? Better: import from progression in this file if no cycle. progression imports type/constants only? It imports EnemyArchetype/EnemyBalance/constants from this file - cycle. So implement unified scaling here and have progression.balance.ts as documentation/alt? Or refactor. To avoid cycle, inline unified scaling here (single source) and make progression.balance.ts re-export? Simpler: keep this as source of truth.
  const ctx = {
    wave: Math.max(1, Math.floor(wave)),
    bossesKilled: Math.max(0, Math.floor(bossesKilled)),
  };
  const w = 1 + Math.min(0.55, (ctx.wave - 1) * 0.012);
  const b = Math.max(0, Math.min(12, ctx.bossesKilled));
  const clamp = (n: number, min: number, max: number) =>
    Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const a = base.archetype;
  let hpM = w,
    dmgM = 1,
    cadM = 1,
    projM = 1;
  if (a === 'grunt') {
    hpM = Math.min(2.35, w * (1 + b * 0.07));
    dmgM = Math.min(1.45, 1 + (ctx.wave - 1) * 0.006 + b * 0.03);
    cadM = Math.min(1.22, 1 + b * 0.03 + Math.max(0, ctx.wave - 1) * 0.003);
  } else if (a === 'brute') {
    hpM = Math.min(2.1, w * (1 + b * 0.06));
    dmgM = Math.min(1.4, 1 + (ctx.wave - 1) * 0.005 + b * 0.025);
    cadM = Math.min(1.18, 1 + b * 0.025 + Math.max(0, ctx.wave - 1) * 0.0025);
  } else if (a === 'ranger') {
    hpM = Math.min(2.15, w * (1 + b * 0.065));
    dmgM = Math.min(1.35, 1 + (ctx.wave - 1) * 0.005 + b * 0.025);
    cadM = Math.min(1.2, 1 + b * 0.028 + Math.max(0, ctx.wave - 1) * 0.003);
    projM = Math.min(1.22, 1 + b * 0.03 + (ctx.wave - 1) * 0.003);
  } else if (a === 'colossus') {
    hpM = Math.min(2.0, 1 + b * 0.1 + Math.max(0, ctx.wave - 5) * 0.006);
    dmgM = Math.min(1.55, 1 + b * 0.055 + Math.max(0, ctx.wave - 5) * 0.004);
    cadM = Math.min(1.18, 1 + b * 0.03);
    projM = Math.min(1.15, 1 + b * 0.025);
  }
  return {
    ...base,
    maxHp: clamp(r1(base.maxHp * hpM), 1, 999),
    attackDamage: base.attackDamage > 0 ? clamp(r1(base.attackDamage * dmgM), 0.1, 99) : 0,
    contactDamage: base.contactDamage > 0 ? clamp(r1(base.contactDamage * dmgM), 0.1, 99) : 0,
    slamDamage: base.slamDamage > 0 ? clamp(r1(base.slamDamage * dmgM), 0.1, 99) : 0,
    moveSpeed:
      base.moveSpeed > 0 ? clamp(Math.round(base.moveSpeed), MIN_ENEMY_MOVEMENT_SPEED, 999) : 0,
    attackCooldownMs:
      base.attackCooldownMs > 0
        ? clamp(Math.round(base.attackCooldownMs / cadM), MIN_ENEMY_ATTACK_COOLDOWN_MS, 60000)
        : 0,
    slamCooldownMs:
      base.slamCooldownMs > 0 ? clamp(Math.round(base.slamCooldownMs / cadM), 500, 60000) : 0,
    projectileSpeed:
      base.projectileSpeed > 0 ? clamp(Math.round(base.projectileSpeed * projM), 1, 9999) : 0,
    shockwaveSpeed:
      base.shockwaveSpeed > 0 ? clamp(Math.round(base.shockwaveSpeed * projM), 1, 9999) : 0,
  };
}

export const GRUNT_BALANCE: EnemyBalance = {
  archetype: 'grunt',
  width: 34,
  height: 34,
  moveSpeed: 108,
  stopDistance: 30,
  spawnY: 551, // Phase 11.15: low platform top 568 (Y_LOW 580) - 34/2
  maxHp: 3,
  attackDamage: 1,
  contactDamage: 1,
  invulnerabilityMs: 180,
  attackCooldownMs: 1450,
  attackDurationMs: 220,
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
  knockbackHorizontal: 210,
  knockbackVertical: 85,
  knockbackDurationMs: 140,
  knockbackMaxSpeed: 250,
  ...BASE_COMBAT,
  view: {
    shape: 'grunt',
    // Grunt РІР‚вЂќ red (Phase 11.15: slightly reduced brightness, identity preserved)
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
  moveSpeed: 74,
  stopDistance: 38,
  maxHp: 7,
  attackDamage: 1, // readable heavy hit; threat comes from commitment/windup and presence
  contactDamage: 2,
  attackCooldownMs: 2400,
  attackDurationMs: 260,
  attackRange: 70,
  attackHeight: 54,
  jumpSpeed: 680,
  jumpHorizontalThreshold: 240,
  knockbackHorizontal: 105,
  knockbackVertical: 45,
  knockbackDurationMs: 110,
  knockbackMaxSpeed: 140,

  view: {
    shape: 'brute',
    // Brute РІР‚вЂќ brown/bronze (Phase 11.15: slightly reduced brightness)
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
  moveSpeed: 92,
  stopDistance: 0,
  maxHp: 3,
  attackDamage: 1,
  contactDamage: 1,
  attackCooldownMs: 2100,
  attackDurationMs: 420,
  attackRange: 520,
  attackHeight: 44,
  jumpSpeed: 700,
  jumpHorizontalThreshold: 220,
  projectileSpeed: 320,
  projectileLifetimeMs: 2200,
  projectileSize: 8,
  preferredDistance: 300,
  retreatDistance: 190,
  knockbackHorizontal: 180,
  knockbackVertical: 70,
  knockbackDurationMs: 130,
  knockbackMaxSpeed: 210,

  view: {
    shape: 'ranger',
    // Ranger РІР‚вЂќ turquoise (Phase 11.15: slightly reduced brightness)
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
  moveSpeed: 46,
  stopDistance: 54,
  spawnY: 525, // Phase 11.15: low platform top 568 (Y_LOW 580) - 86/2
  maxHp: 28,
  attackDamage: 1,
  contactDamage: 3,
  invulnerabilityMs: 120,
  attackCooldownMs: 2700,
  attackDurationMs: 340,
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
  slamDamage: 2,
  slamTelegraphMs: 760,
  slamCooldownMs: 4700,
  shockwaveSpeed: 240,
  shockwaveWidth: 34,
  shockwaveHeight: 20,
  shockwaveLifetimeMs: 1800,
  knockbackHorizontal: 0,
  knockbackVertical: 0,
  knockbackDurationMs: 0,
  knockbackMaxSpeed: 0,

  view: {
    shape: 'colossus',
    // Colossus РІР‚вЂќ gray/metallic (Phase 11.15: slightly reduced brightness, remains gray)
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
