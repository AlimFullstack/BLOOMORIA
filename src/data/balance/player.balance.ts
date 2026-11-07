export const PLAYER_BALANCE = {
  width: 54,
  height: 54,
  moveSpeed: 300,
  jumpSpeed: 700,
  spawnX: 640,
  spawnY: 541, // Phase 11.15: on low platform top (580 - 24/2 - 54/2)
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
  // Ground Slam (new ability): centralized tuning, no change to base combat stats above.
  get groundSlamCooldownMs(): number {
    return this.dashCooldownMs * 2;
  },
  groundSlamDownVelocity: 1450,
  groundSlamRadius: 132,
  groundSlamKnockbackHorizontal: 360,
  groundSlamKnockbackVertical: 170,
  groundSlamKnockbackDurationMs: 170,
  groundSlamKnockbackMaxSpeed: 420,
} as const;

export type PlayerBalance = typeof PLAYER_BALANCE;
