export type UpgradeId = 'max_hp' | 'damage' | 'move_speed' | 'attack_speed' | 'heal';

export interface UpgradeDefinition {
  id: UpgradeId;
  name: string;
  description: string;
}
