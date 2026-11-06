export function getHealthUpgradeBonusHp(currentMaxHp: number): number {
  return Math.max(1, Math.floor(currentMaxHp * 0.1));
}

/** Sharp Edge / damage upgrade: +10% of current attack damage, minimum +1 (fixed at pick time). */
export function getDamageUpgradeBonus(currentAttackDamage: number): number {
  return Math.max(1, Math.floor(currentAttackDamage * 0.1));
}

/** Mend/heal upgrade: restores 10% of current max HP (integer, min 1), capped by caller. */
export function getHealAmountTenPercent(currentMaxHp: number): number {
  return getHealthUpgradeBonusHp(currentMaxHp);
}
