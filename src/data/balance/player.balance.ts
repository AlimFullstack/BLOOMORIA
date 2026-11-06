export const PLAYER_BALANCE = {
  width: 54,
  height: 54,
  moveSpeed: 300,
  jumpSpeed: 700,
  spawnX: 640,
  spawnY: 635,
  maxHp: 3,
  attackDamage: 1,
  invulnerabilityMs: 1000,
  attackCooldownMs: 700,
  attackDurationMs: 180,
  attackRange: 62,
  attackHeight: 46,
  dashSpeed: 760,
  dashDurationMs: 200,
  dashCooldownMs: 1500,
} as const;

export type PlayerBalance = typeof PLAYER_BALANCE;
