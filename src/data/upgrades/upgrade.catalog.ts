import type { UpgradeDefinition } from './upgrade.types';
import { UPGRADE_BALANCE, type UpgradeId } from '../balance/playerUpgrades.balance';

export const UPGRADE_CATALOG: readonly UpgradeDefinition[] = [
  { id: 'max_hp', name: 'Vital Core', description: '+Max HP' },
  { id: 'damage', name: 'Sharp Edge', description: '+Attack Damage' },
  { id: 'move_speed', name: 'Swift Step', description: '+Move Speed' },
  { id: 'attack_speed', name: 'Quick Strike', description: '+Attack Speed' },
  { id: 'heal', name: 'Mend', description: '+HP (Heal)' },
] as const;

export interface UpgradePickState {
  counts: Partial<Record<UpgradeId, number>>;
  currentHp: number;
  currentMaxHp: number;
}

function isAvailable(id: UpgradeId, state: UpgradePickState): boolean {
  const rule = UPGRADE_BALANCE[id];
  const count = state.counts[id] ?? 0;
  if (count >= rule.maxStacks) return false;
  if (id === 'heal' && state.currentHp >= state.currentMaxHp) return false;
  return true;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

export function pickRandomUpgrades(count: number, state?: UpgradePickState): UpgradeDefinition[] {
  if (!state) {
    const pool = shuffle([...UPGRADE_CATALOG]);
    return pool.slice(0, Math.min(count, pool.length));
  }
  const available = UPGRADE_CATALOG.filter((u) => isAvailable(u.id as UpgradeId, state));
  if (available.length === 0) return [];

  // Prefer variety: try to include different categories when possible.
  const byCat = new Map<string, UpgradeDefinition[]>();
  for (const u of available) {
    const cat = UPGRADE_BALANCE[u.id as UpgradeId].category;
    const list = byCat.get(cat) ?? [];
    list.push(u);
    byCat.set(cat, list);
  }
  const cats = shuffle([...byCat.keys()]);
  const picked: UpgradeDefinition[] = [];
  for (const cat of cats) {
    if (picked.length >= count) break;
    const list = shuffle([...(byCat.get(cat) ?? [])]);
    // weighted-ish random by rule weight
    list.sort(
      (a, b) =>
        (UPGRADE_BALANCE[b.id as UpgradeId].weight ?? 1) -
        (UPGRADE_BALANCE[a.id as UpgradeId].weight ?? 1) +
        (Math.random() - 0.5) * 0.25,
    );
    if (list[0]) picked.push(list[0]);
  }
  const remaining = shuffle(available.filter((u) => !picked.includes(u)));
  for (const u of remaining) {
    if (picked.length >= count) break;
    picked.push(u);
  }
  return shuffle(picked).slice(0, Math.min(count, picked.length, available.length));
}
