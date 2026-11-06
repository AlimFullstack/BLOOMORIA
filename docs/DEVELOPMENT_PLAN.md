# BLOOMORIA — Development Plan

> **Status:** Planning only. Execute phases only after explicit approval to start implementation.

## Planning Rules

- Implement in small, verifiable increments.
- Do not install dependencies or write game code until Phase 0 is approved.
- Keep balance/data in `src/data/*`; keep logic in systems/entities.
- After each phase: run the project (when applicable), verify criteria, and fix regressions before moving on.
- Prefer the simplest working solution that preserves the architecture boundaries.

## Phase 0 — Approved Bootstrap (prerequisite)

**Goal:** Create the minimal technical foundation after explicit user approval.

**Touches:** `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/app/*`, `.gitignore`, optional lint/format configs.

**Implement:**

- Initialize npm project and install approved dependencies (Phaser 3, Vite, TypeScript, tooling).
- Configure Vite + TS for browser ES2022 output.
- Create a minimal Phaser bootstrap that renders an empty/procedural scene.
- Add scripts: `dev`, `build`, `preview`, and lint/typecheck if configured.

**Completion criteria:**

- `npm run dev` starts; browser shows the game canvas without errors.
- `npm run build` succeeds.
- No game mechanics implemented yet.

**Depends on:** explicit approval to begin implementation.

## Phase 1 — Core Skeleton and Scenes

**Goal:** Establish app composition and scene flow.

**Touches:** `src/core/*`, `src/scenes/BootScene.ts`, `PreloadScene.ts`, `MenuScene.ts`, `GameScene.ts`, optional `UIScene.ts`, `src/app/*`.

**Implement:**

- Shared types/enums and a lightweight typed event channel.
- Minimal reusable FSM helper (generic).
- Scene transitions: Boot → Preload → Menu → Game.
- Procedural placeholder visuals only (no assets).

**Completion criteria:**

- Scene flow works reliably.
- No runtime errors in console during transitions.
- Code contains no balance values outside `data/` (except temporary dev placeholders removed before Phase 2 end).

**Depends on:** Phase 0.

## Phase 2 — Fixed Arena and Player Foundation

**Goal:** Playable movement on a fixed arena.

**Touches:** `src/entities/arena/Arena.ts`, `src/entities/player/*`, `src/data/arena/arena.layout.ts`, `src/data/balance/player.balance.ts`, `src/systems/InputSystem.ts`, `src/input/*`.

**Implement:**

- Fixed arena geometry, platforms, bounds, spawn markers.
- Player procedural silhouette.
- Keyboard input (A/D/arrows, Space/W/Up, Shift, Esc placeholders) with simultaneous key support.
- Player states: idle/move/jump/fall.
- Delta-time-safe movement using configured stats.

**Completion criteria:**

- Player moves/jumps on fixed platforms with stable collisions.
- Arena does not regenerate between actions.
- Base player stats come from `player.balance.ts`.

**Depends on:** Phase 1.

## Phase 3 — Core Combat

**Goal:** Manual melee combat with correct hit rules.

**Touches:** `src/systems/CombatSystem.ts`, `src/entities/player/*`, `src/effects/*`, `src/core/events.ts`.

**Implement:**

- Attack input, cooldown, attack animation window.
- Temporary melee hitbox/hit detection.
- Damage calculation with crit chance/multiplier.
- “One damage application per target per swing” rule.
- Dodge dash with limited invulnerability window and cooldown.
- Hit feedback via procedural effects.

**Completion criteria:**

- Attacks only damage valid targets during active hit window.
- No multi-hit bug from a single swing.
- Dodge grants intended i-frames; cooldowns enforced.

**Depends on:** Phase 2.

## Phase 4 — Enemies and AI

**Goal:** Four enemy types with readable behavior.

**Touches:** `src/entities/enemies/*`, `src/data/balance/enemies.balance.ts`, `src/core/ObjectPool.ts` (if needed), `src/systems/CombatSystem.ts`.

**Implement:**

- Grunt, Runner, Tank, Elite configs and procedural views.
- Enemy FSM: spawning/approaching/attacking/cooldown/dead.
- Enemy attacks, damage to player, hurt/i-frame handling, death/cleanup.
- Factory/pooling strategy for spawned enemies.

**Completion criteria:**

- All four enemy types behave distinctly using data-driven base stats.
- Enemies can pursue/attack the player and be defeated.
- No memory leaks or orphaned objects after repeated spawns/deaths.

**Depends on:** Phase 3.

## Phase 5 — Endless Wave System

**Goal:** Complete wave loop with scaling and caps.

**Touches:** `src/systems/WaveSystem.ts`, `src/data/balance/waves.balance.ts`, `src/scenes/GameScene.ts`, `src/systems/ProgressionSystem.ts` (basic counters).

**Implement:**

- Wave number, enemy count formula `N(w)=3+floor(1.2*(w-1))`.
- HP/DMG scaling formulas with safety caps.
- Spawn pacing, max simultaneous enemies.
- Wave completion detection (all enemies dead).
- Transition to wave-clear state; block next wave until upgrade chosen (hooked in Phase 6).

**Completion criteria:**

- Waves progress endlessly; difficulty increases predictably.
- Caps prevent runaway entity counts/stat growth.
- Wave never advances early.

**Depends on:** Phase 4.

## Phase 6 — Upgrade System

**Goal:** Mandatory post-wave upgrade choice.

**Touches:** `src/systems/UpgradeSystem.ts`, `src/data/upgrades/upgrades.catalog.ts`, `src/ui/dom/UpgradeView.ts` (or minimal UI), `src/entities/player/*`.

**Implement:**

- Initial upgrade catalog (all MVP upgrades listed in concept).
- Rarity-aware roll of 3 options; compatibility/stack/repeat rules.
- Mandatory selection flow; simulation paused.
- Data-driven effect application to player/run modifiers.
- Recovery/regeneration effects where specified (e.g., post-wave heal / Second Wind behavior as defined).

**Completion criteria:**

- Exactly 3 options shown; player must choose 1.
- Choice applies correctly and persists for the run.
- Next wave starts only after valid selection.
- Adding a new upgrade requires mainly catalog/data changes.

**Depends on:** Phase 5.

## Phase 7 — UI/UX, HUD, Menus, Settings

**Goal:** Complete, usable player-facing interface.

**Touches:** `src/ui/*`, `src/ui/styles/ui.css`, scenes/UI manager integration.

**Implement:**

- Main menu (Play, best result, settings, Guest/profile stub).
- HUD (HP, wave, kills, survival time, ability cooldown placeholders if shown, pause).
- Pause overlay/settings (music, SFX, fullscreen, controls, quality).
- Game over screen (wave, kills, survival time, damage dealt, best, restart/menu).
- Responsive layout and interaction states (hover/active/disabled/focus as applicable).

**Completion criteria:**

- All required screens present and navigable.
- UI reflects real game state via events/state.
- No conflicting states (pause/upgrade/game over).

**Depends on:** Phases 5–6 (game flow available).

## Phase 8 — Persistence and Platform Seams

**Goal:** Reliable local saves and future-proof boundaries.

**Touches:** `src/storage/*`, `src/platform/*`, `src/data/settings/defaults.ts`, progression/menu integration.

**Implement:**

- `SaveManager` + `LocalStorageAdapter`.
- `SaveData` schema versioning, validation, migrations, corruption fallback.
- Save/load settings, guest profile, best results.
- `PlatformAdapter` contract + `WebPlatformAdapter` no-op.

**Completion criteria:**

- Settings and best results persist across reloads.
- Corrupted/invalid storage does not crash the game; defaults restore safely.
- No ad SDK/backend/auth implementation added.

**Depends on:** Phase 7.

## Phase 9 — Mobile Controls, Performance, and QA

**Goal:** MVP quality bar.

**Touches:** `src/input/TouchInput.ts`, effects/pools/systems, build/config as needed.

**Implement:**

- Virtual joystick + action buttons for mobile.
- Responsive/fullscreen behavior.
- Object pooling/caps/particle budgets.
- Performance profiling and leak checks.
- Cross-device smoke tests.

**Completion criteria:**

- Playable on desktop and mobile browsers.
- 60 FPS target where feasible; acceptable behavior on weaker devices.
- No critical bugs in core loop (move/attack/dodge/waves/upgrades/save).

**Depends on:** Phase 8.

## Risks / Watch Items

- **Scope creep:** abilities (Q/E) and XP can expand quickly; keep MVP hooks minimal.
- **State conflicts:** pause + upgrade + game over transitions need explicit guards.
- **Procedural visuals:** can become noisy; enforce shared palette/size/FX rules early.
- **Performance:** enemy counts + particles + physics checks; use caps and pools from the start.
- **Input parity:** mobile touch must map to the same `InputActions` contract as keyboard.
