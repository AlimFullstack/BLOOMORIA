export type UpgradeId = 'max_hp' | 'damage' | 'move_speed' | 'attack_speed' | 'heal';

export type UpgradeCategory = 'offense' | 'mobility' | 'survival';

export interface UpgradeBalanceRule {
  id: UpgradeId;
  category: UpgradeCategory;
  maxStacks: number; // Infinity-like not used; 999 means effectively uncapped but finite
  weight: number;
}

export const UPGRADE_BALANCE: Record<UpgradeId, UpgradeBalanceRule> = {
  damage: { id: 'damage', category: 'offense', maxStacks: 8, weight: 1 },
  attack_speed: { id: 'attack_speed', category: 'offense', maxStacks: 6, weight: 1 },
  move_speed: { id: 'move_speed', category: 'mobility', maxStacks: 5, weight: 1 },
  max_hp: { id: 'max_hp', category: 'survival', maxStacks: 6, weight: 1 },
  heal: { id: 'heal', category: 'survival', maxStacks: 999, weight: 0.85 },
};

export const DAMAGE_UPGRADE_STEP = 0.2; // +20% of base attack damage per stack (additive from base)
export const ATTACK_SPEED_UPGRADE_STEP = 0.12; // +12% attack rate per stack
export const MOVE_SPEED_UPGRADE_STEP = 0.08; // +8% move speed per stack
export const MAX_HP_UPGRADE_BONUS = 1; // flat, stable
export const HEAL_PERCENT = 0.25;

export function clampStat(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function getPlayerAttackDamage(base: number, damageSteps: number): number {
  const steps = clampStat(Math.floor(damageSteps), 0, UPGRADE_BALANCE.damage.maxStacks);
  return clampStat(round1(base * (1 + DAMAGE_UPGRADE_STEP * steps)), 0.1, 99);
}

export function getPlayerAttackCooldownMs(baseMs: number, attackSpeedSteps: number): number {
  const steps = clampStat(Math.floor(attackSpeedSteps), 0, UPGRADE_BALANCE.attack_speed.maxStacks);
  const rate = 1 + ATTACK_SPEED_UPGRADE_STEP * steps;
  return clampStat(Math.round(baseMs / rate), 260, 5000);
}

export function getPlayerMoveSpeed(base: number, moveSpeedSteps: number): number {
  const steps = clampStat(Math.floor(moveSpeedSteps), 0, UPGRADE_BALANCE.move_speed.maxStacks);
  return clampStat(Math.round(base * (1 + MOVE_SPEED_UPGRADE_STEP * steps)), 1, 460);
}

export function getMaxHpUpgradeBonus(_currentMaxHp: number): number {
  return MAX_HP_UPGRADE_BONUS;
}

export function getHealAmount(currentMaxHp: number): number {
  return Math.max(1, Math.floor(Math.max(1, currentMaxHp) * HEAL_PERCENT));
}

export function getDamageUpgradeDisplayBonus(baseAttackDamage: number): number {
  // display per-pick bonus at base reference (stable, understandable)
  return round1(baseAttackDamage * DAMAGE_UPGRADE_STEP);
}
