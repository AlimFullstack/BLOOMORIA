import type { UpgradeDefinition } from './upgrade.types';

export const UPGRADE_CATALOG: readonly UpgradeDefinition[] = [
  {
    id: 'max_hp',
    name: 'Vital Core',
    description: 'Increase Max HP (calculated at pick) and restore gained HP',
  },
  {
    id: 'damage',
    name: 'Sharp Edge',
    description: '+10% Attack Damage',
  },
  {
    id: 'move_speed',
    name: 'Swift Step',
    description: '+10% Move Speed',
  },
  {
    id: 'attack_speed',
    name: 'Quick Strike',
    description: '+10% Attack Speed',
  },
  {
    id: 'heal',
    name: 'Mend',
    description: 'Restore 10% HP (up to max)',
  },
] as const;

export function pickRandomUpgrades(count: number): UpgradeDefinition[] {
  const pool = [...UPGRADE_CATALOG];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = pool[i];
    pool[i] = pool[j];
    pool[j] = t;
  }
  return pool.slice(0, Math.min(count, pool.length));
}
