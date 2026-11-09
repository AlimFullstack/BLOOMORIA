import {
  UPGRADE_BALANCE,
  HEAL_PERCENT,
  MAX_HP_UPGRADE_BONUS,
  getDamageUpgradeDisplayBonus,
} from '../balance/playerUpgrades.balance';
import { PLAYER_BALANCE } from '../balance/player.balance';

export function getHealthUpgradeBonusHp(_currentMaxHp: number): number {
  return MAX_HP_UPGRADE_BONUS;
}

/** Sharp Edge / damage upgrade: display per-pick bonus (stable, from base). */
export function getDamageUpgradeBonus(_currentAttackDamage: number): number {
  return getDamageUpgradeDisplayBonus(PLAYER_BALANCE.attackDamage);
}

/** Mend/heal upgrade: restores percent of current max HP (integer, min 1), capped by caller. */
export function getHealAmountTenPercent(currentMaxHp: number): number {
  return Math.max(1, Math.floor(Math.max(1, currentMaxHp) * HEAL_PERCENT));
}

export { UPGRADE_BALANCE };
