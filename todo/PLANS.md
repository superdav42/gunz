# GUNZ - Execution Plan

Full execution plan derived from [VISION.md](../VISION.md). 10 milestones, ordered by dependency.

**Stack:** Three.js + Vite + vanilla JS (TypeScript migration at M2 when data layer arrives).
**Dependencies added:** Rapier (M5, if needed), Howler.js (M10).

---

## Current State Assessment

**What exists (750 lines across 8 files):**

| File | State | Notes |
|------|-------|-------|
| `Game.js` | Working | Main loop, scene, player movement, projectile collision, game over |
| `Tank.js` | Working | Single tank class, hull+turret+barrel mesh, fire, damage |
| `Terrain.js` | Working | Flat-shaded terrain, sine-wave hills, 40 rocks + 30 trees |
| `Projectile.js` | Working | Sphere projectile with velocity, gravity, lifetime |
| `InputSystem.js` | Working | Keyboard + touch joystick + mouse aim, unified state |
| `CameraController.js` | Working | Smooth follow behind player tank |
| `EnemySystem.js` | Working | Spawns up to 6 enemies at arena edges, basic chase/fire AI |
| `ProjectileSystem.js` | Working | Manages active projectiles |
| `HUD.js` | Working | Health bar, score, ammo counter, game over overlay |

**Key gaps:**

- No obstacle collision — tanks drive through rocks and trees
- Enemies spawn randomly from edges (not team-based, not from fixed sides)
- No concept of teams, rounds, or matches
- No data layer (tank stats, weapon stats, league scaling are all hardcoded)
- No persistence (no save/load)
- No on-foot mode
- No shop, economy, leagues, upgrades, abilities, or skins

---

## Milestone Dependency Graph

```
M1 (combat polish)
 └──> M2 (6v6 teams + match system)
       ├──> M3 (economy + shop)
       │     └──> M4 (league progression)
       │           ├──> M7 (tank variety) ──> M8 (abilities)
       │           └──> M6 (weapon arsenal)
       └──> M5 (on-foot mode) ──> M6 (weapon arsenal)
M9 (environment) — can start after M1, parallel to M2-M4
M10 (skins + polish) — final, after all gameplay milestones
```

---

## M1 — Solid Tank Combat (Polish Current State)

**Status:** In progress (5/9 items done per VISION.md)
**Estimate:** ~8h (ai:6h test:1.5h read:0.5h)
**Depends on:** Nothing (current codebase)

### What needs to happen

The current game is a single player vs randomly spawning enemies with no obstacle collision. M1 makes combat feel right before adding teams.

### Tasks

1. **CollisionSystem** — Extract collision from `Game.js` into `src/systems/CollisionSystem.js`. Add tank-vs-obstacle (rocks, trees) blocking using bounding-sphere checks. Rocks: indestructible, push tank away. Trees: block movement. ~2h

2. **Destructible trees** — Trees have HP (1 tank shell destroys them). Remove tree from scene on destruction, spawn wood debris particles. Need to track trees as entities with positions (currently anonymous children of terrain mesh). ~1.5h

3. **ParticleSystem** — `src/systems/ParticleSystem.js`. Pool-based particle emitter using Three.js `Points` + `BufferGeometry`. Effects needed: explosion burst (tank destroy), muzzle flash (on fire), dust trail (tank movement). No library — custom ~200 lines. ~2h

4. **Tank wrecks** — When a tank reaches 0 HP, replace its mesh with a darkened/burning wreck prop. Wreck stays on field as indestructible cover (other tanks collide with it). Add to CollisionSystem obstacle list dynamically. ~1.5h

5. **Terrain height for obstacles** — Rocks and trees currently placed at terrain height but tanks don't interact with them. Ensure CollisionSystem queries the obstacle list built during `Terrain._addProps()`. Expose obstacle positions/radii from Terrain. ~1h

### Architecture changes

- `Terrain.js` must expose `obstacles[]` array with `{ position, radius, type, destructible, mesh }` for each rock/tree so CollisionSystem can query them
- Trees become tracked entities (not just decorative meshes) so they can take damage
- `Game._checkCollisions()` splits into `CollisionSystem.update()` handling both projectile-vs-tank AND tank-vs-obstacle

### Verification

- Drive a tank into a rock — tank stops, doesn't pass through
- Shoot a tree — it breaks, debris particles spawn
- Destroy an enemy tank — explosion particles, wreck stays, other tanks collide with wreck
- Fire main cannon — muzzle flash visible at barrel tip

---

## M2 — 6v6 Teams and Match System

**Status:** Not started
**Estimate:** ~16h (ai:12h test:3h read:1h)
**Depends on:** M1 (collision, wrecks needed for team combat to work)

### What needs to happen

Rewrite EnemySystem from "spawn from edges" to two fixed teams of 6. Add MatchManager for best-of-3. Add StatsTracker for per-round performance. Add scoreboard + kill feed UI.

### Tasks

1. **TeamManager** — `src/core/TeamManager.js`. Creates 2 teams of 6 tanks. Team 1 (player + 5 AI) spawns south. Team 2 (6 AI enemies) spawns north. Tracks alive/dead per team. Exposes `isRoundOver()` → true when all 6 on one side are dead. ~3h

2. **Rewrite EnemySystem → AIController** — Replace `EnemySystem.js` with `AIController.js`. Same AI logic (chase, aim, fire) but drives ALL AI tanks (both teams). AI teammates fight enemies, not the player. Each AI tank has a target-selection function: pick nearest visible enemy team tank. ~3h

3. **MatchManager** — `src/core/MatchManager.js`. State machine: `PRE_ROUND → ACTIVE → ROUND_END → (repeat or MATCH_END)`. Handles best-of-3 flow: round start countdown, round reset (full HP, positions), round result, match result. Calls TeamManager.reset() between rounds. ~3h

4. **Round reset logic** — On new round: all 12 tanks respawn at starting positions with full HP/ammo. Remove all wrecks. Reset projectiles. Keep player loadout. ~1h

5. **StatsTracker** — `src/systems/StatsTracker.js`. Per-round: damage dealt, damage taken, kills (last hit), assists (30%+ damage), survival (was tank alive at round end). Feeds into EconomySystem in M3. Accumulate across rounds for match totals. ~2h

6. **Performance rewards calculator** — Function that takes StatsTracker output and returns money earned using the table from VISION.md (damage dealt, tank kills, assists, survival bonus, round win, match win, MVP, flawless). ~1h

7. **Kill feed UI** — `src/ui/KillFeed.js`. Top-right corner. Shows "Player destroyed Enemy #3" messages. Auto-fades after 3s. Stacks up to 5 messages. ~1h

8. **Scoreboard UI** — `src/ui/Scoreboard.js`. Hold Tab: overlay showing all 12 tanks with name, HP bar, kills, damage dealt, alive/dead status. Two columns (your team vs enemy team). ~2h

### Architecture changes

- `Game.js` orchestration changes: `MatchManager` drives the loop state, `Game._loop()` only runs combat when state is `ACTIVE`
- `EnemySystem.js` is deleted/renamed to `AIController.js` — now drives 10 AI tanks (5 allies + 5 enemies), not 6 spawning enemies
- Player tank is part of Team 1's roster (index 0)
- `Game._checkCollisions()` (now CollisionSystem) must handle friendly fire rules: projectiles only damage enemy team tanks

### Verification

- Match starts with 6 tanks on each side, proper spawn positions
- AI teammates engage enemies (not the player)
- Round ends when all 6 tanks on one side destroyed
- Best-of-3 works: 2-0, 0-2, and 2-1 scenarios
- Tab shows scoreboard with all 12 tanks
- Kill feed shows destruction messages

---

## M3 — Economy and Shop

**Status:** Not started
**Estimate:** ~10h (ai:8h test:1.5h read:0.5h)
**Depends on:** M2 (rewards need StatsTracker, shop needs match flow)

### Tasks

1. **EconomySystem** — `src/systems/EconomySystem.js`. Money balance. `earn(amount, reason)` and `spend(amount)` with validation. Receives match rewards from StatsTracker after each match. ~1h

2. **SaveSystem** — `src/systems/SaveSystem.js`. Serialize player profile to localStorage: money, league, LP, owned tanks, owned weapons, upgrades, equipped loadout, skins. Load on startup, save after each match and purchase. Schema-versioned for future migration. ~2h

3. **Data definitions** — `src/data/TankDefs.js`, `WeaponDefs.js`, `UpgradeDefs.js`. Static objects with all stats from VISION.md tables (8 tank classes, 13 weapons, 6 tank upgrades, 8 weapon upgrades). Each entry has: name, stats, price, league requirement, description. ~2h

4. **ShopMenu UI** — `src/ui/ShopMenu.js`. HTML overlay between matches. 4 tabs: Tanks, Weapons, Upgrades, Skins. Each item shows name, price, stats, league requirement (locked/unlocked). Buy button deducts money. Owned items shown differently. ~3h

5. **LoadoutScreen UI** — `src/ui/LoadoutScreen.js`. Pre-match: pick tank class from owned tanks, pick primary weapon, pick melee weapon. Selected loadout saved via SaveSystem. ~2h

### Architecture changes

- Main menu flow: `MainMenu → LoadoutScreen → Match → MatchResult → Shop → MainMenu`
- `Game.js` needs a `GameStateManager` or the MatchManager expands to handle menu/shop/match states
- All tank/weapon stats now come from `TankDefs`/`WeaponDefs` data files, not hardcoded in `Tank.js`

### Verification

- Earn money from match performance, see balance update
- Open shop, buy a weapon, money deducted, weapon appears in loadout
- Close browser, reopen — all progress persisted
- Can't buy league-locked items (disabled/grayed)

---

## M4 — League Progression

**Status:** Not started
**Estimate:** ~8h (ai:6h test:1.5h read:0.5h)
**Depends on:** M3 (needs economy + shop + save system)

### Tasks

1. **LeagueDefs data** — `src/data/LeagueDefs.js`. 6 leagues (Bronze→Champion) with LP thresholds, AI difficulty multipliers (HP, damage, accuracy, reaction time), upgrade tier caps. From VISION.md tables. ~1h

2. **LeagueSystem** — `src/systems/LeagueSystem.js`. Track LP. Add/subtract LP on match result (+40 sweep win, +25 close win, -10 close loss, -20 sweep loss). Promote when LP crosses threshold. Demote when LP drops below previous league threshold. ~2h

3. **AI difficulty scaling** — Modify AIController to read difficulty multipliers from LeagueDefs based on current league. Scale: aim accuracy, reaction time, HP multiplier, damage multiplier, cover usage, ability usage, focus fire coordination. ~2h

4. **League-gated shop items** — ShopMenu checks `LeagueDefs` for each item. Items above current league shown but grayed/locked. Upgrade tier caps enforced by league. ~1h

5. **League display UI** — `src/ui/LeagueDisplay.js`. Main menu: league badge icon + LP progress bar. Post-match: LP change animation, promotion/demotion notification. ~2h

### Architecture changes

- `AIController` reads difficulty from `LeagueDefs[currentLeague]` instead of hardcoded values
- `ShopMenu` filters items by `player.league >= item.leagueRequired`
- `UpgradeSystem` caps at `LeagueDefs[currentLeague].maxUpgradeTier`

### Verification

- Win matches → gain LP → promote to Silver → new items appear in shop
- Lose matches → lose LP → demote back to Bronze
- Silver enemies are noticeably harder (better aim, faster, more HP)
- Can't buy Gold-locked items while in Bronze

---

## M5 — On-Foot Mode

**Status:** Not started
**Estimate:** ~12h (ai:9h test:2h read:1h)
**Depends on:** M2 (needs team system, round flow)

### Tasks

1. **Soldier entity** — `src/entities/Soldier.js`. Capsule body + blocky limbs mesh. Movement (WASD, faster than tank). Low HP (one tank shell kills). Gun (fires faster, less damage than tank). ~3h

2. **Mode switching** — `src/core/PlayerController.js`. Press E near tank → enter tank mode. Tank at 0 HP → auto-bail to on-foot mode. Player becomes Soldier entity at tank wreck position. Press E near own/captured tank → re-enter. ~3h

3. **Melee system** — Soldier melee attack (F key / button). Short range, high damage. Raycast or sphere overlap in front of soldier. Useful for finishing damaged tanks or killing on-foot enemies. ~1.5h

4. **Camera adaptation** — `CameraController` switches between tank follow (current) and soldier follow (closer, lower angle). Smooth transition on mode switch. ~1h

5. **On-foot AI** — AI soldiers bail from destroyed tanks. Simple behavior: run toward nearest enemy, shoot, use cover. Less sophisticated than tank AI — keep it basic. ~2h

6. **Round end with soldiers** — Round doesn't end until all tanks AND all on-foot soldiers on one team are dead. TeamManager tracks both tank alive/dead and soldier alive/dead. ~1.5h

### Architecture changes

- `PlayerController` is the new hub: delegates input to either Tank or Soldier based on current mode
- `Game._updatePlayer()` replaced by `PlayerController.update(dt, input)`
- `CameraController` takes a generic `target` (tank or soldier) and switches dynamically
- Team roster tracks `{ tank: Tank|null, soldier: Soldier|null, alive: bool }` per slot

### Verification

- Tank destroyed → player appears on foot at wreck location
- On-foot: can move, shoot gun, melee attack
- Walk to tank → press E → re-enter tank mode
- Round ends only when all tanks AND soldiers on one team eliminated
- AI soldiers bail from destroyed tanks and continue fighting

---

## M6 — Weapon Arsenal

**Status:** Not started
**Estimate:** ~10h (ai:8h test:1.5h read:0.5h)
**Depends on:** M5 (on-foot mode needed for weapons), M4 (league gates)

### Tasks

1. **Weapon stat system** — Extend `WeaponDefs.js` with per-weapon: damage, fireRate, range, reloadTime, clipSize, projectileSpeed, spread, type (gun/explosive/melee). Soldier reads equipped weapon stats. ~2h

2. **Firearm variety** — Pistol (starter), SMG (fast/inaccurate), Assault Rifle (balanced), Sniper (slow/powerful/zoom), Shotgun (close range, multi-pellet). Each has distinct fire behavior. ~3h

3. **Explosive weapons** — Grenade Launcher (arc trajectory, splash radius), Rocket Launcher (faster, less arc, splash). New projectile types with area damage on impact. ~2h

4. **Melee weapon variety** — Combat Knife (fast), Machete (wider), War Hammer (slow/heavy/knockback), Energy Blade (fast/high damage/glow). Different damage/speed/range per weapon. ~1.5h

5. **Weapon equip system** — Player equips one primary gun + one melee weapon. Switching between them (number keys or buttons). LoadoutScreen updated with weapon selection. ~1.5h

### Verification

- Each gun type feels distinct (SMG sprays, Sniper is slow but powerful)
- Explosive weapons deal splash damage
- Melee weapons have different speed/range
- Can equip and switch weapons in loadout

---

## M7 — Tank Variety

**Status:** Not started
**Estimate:** ~12h (ai:9h test:2h read:1h)
**Depends on:** M4 (league gates for tank unlocks)

### Tasks

1. **Tank class data** — Finalize `TankDefs.js` with all 8 classes: Standard, Scout, Heavy, Artillery, Flame, Shield, Jump, Siege. Each has: HP, speed, turnRate, armor, weaponDamage, weaponReload, weaponRange, price, league. ~1.5h

2. **Tank visual differentiation** — Each class has a distinct mesh variation. Scout: smaller, sleeker. Heavy: larger hull, thicker tracks. Artillery: long barrel. Flame: short wide barrel. Shield: dome shape. Keep low-poly style. ~3h

3. **Tank behavior differences** — Tank class stats feed into movement speed, fire rate, damage, HP. Scout is fast/fragile. Heavy is slow/tough. Artillery has long range but slow traverse. ~2h

4. **TeamCompositions data** — `src/data/TeamCompositions.js`. Per-league team roster (from VISION.md table). TeamManager reads this to auto-fill the 5 AI teammate slots and 6 enemy slots. ~1h

5. **Flame Tank weapon** — Short-range flamethrower: continuous damage in a cone, particle-based visuals. Different from projectile-based weapons. ~2h

6. **Tank selection in loadout** — LoadoutScreen shows owned tanks with stats comparison. Player picks before each match. ~1.5h

7. **Per-class upgrade tracking** — UpgradeSystem tracks upgrades per tank class. Upgrading Standard doesn't affect Heavy. SaveSystem stores per-class upgrade state. ~1h

### Verification

- Each tank class looks and plays distinctly different
- Scout zooms around, Heavy lumbers but tanks damage
- Team composition changes per league (more variety at higher leagues)
- Can buy and switch between tank classes

---

## M8 — Abilities (Gold+ League Content)

**Status:** Not started
**Estimate:** ~14h (ai:10h test:3h read:1h)
**Depends on:** M7 (tank classes needed), M6 (weapon abilities need weapon system)

### Tasks

1. **AbilitySystem** — `src/systems/AbilitySystem.js`. Cooldown-based abilities. Max 2 active: one from tank, one from weapon. Input: Q key / ability button. Tracks cooldown per ability, triggers effect + VFX. ~3h

2. **Tank abilities** — Implement 6 abilities:
   - Inferno Burst (Flame Tank): 360-degree damage ring, 20s cooldown
   - Energy Shield (Shield Tank): bubble blocks incoming fire 5s, 25s cooldown
   - Rocket Jump (Jump Tank): launch + area damage on landing, 15s cooldown
   - Lockdown Mode (Siege Tank): immobile, 2x fire rate + range 8s, 20s cooldown
   - Barrage (Artillery): 5 rapid shells at target area, 30s cooldown
   - Reactive Armor (Heavy): next 3 hits at 50% damage, 20s cooldown
   ~5h total

3. **Weapon abilities** — Implement 5 abilities:
   - Cluster Bomb (Grenade Launcher): splits into 5 mini-grenades, 18s cooldown
   - Lock-On (Rocket Launcher): tracking rocket 3s, 15s cooldown
   - Overcharge (Railgun): 3x damage + wider beam, 20s cooldown
   - Nova Blast (Plasma Cannon): AoE centered on player, 25s cooldown
   - Dash Strike (Energy Blade): 10m lunge + slash, 12s cooldown
   ~3h total

4. **Ability cooldown UI** — `src/ui/AbilityBar.js`. Icon with radial cooldown fill. Shows both tank and weapon ability. Grayed when on cooldown. ~1.5h

5. **AI ability usage** — At Platinum+, AI tanks use abilities tactically: shields when taking fire, jumps to reposition, barrages on clusters. Add ability decision-making to AIController. ~1.5h

### Verification

- Each ability activates with Q, shows cooldown, has visual effect
- Shield blocks shots, Jump launches tank, Lockdown doubles fire rate
- AI enemies use abilities at Platinum+ leagues
- Abilities feel powerful but balanced (cooldowns prevent spam)

---

## M9 — Environment and Structures

**Status:** Not started
**Estimate:** ~10h (ai:8h test:1.5h read:0.5h)
**Depends on:** M1 (collision system), parallel to M2-M4

### Tasks

1. **House/building geometry** — `src/entities/Obstacle.js` base class. Houses: stacked boxes with flat roofs. Destructible walls: break into smaller boxes when hit. Tank shells punch through walls. ~2.5h

2. **VillageGenerator** — `src/entities/Village.js`. Procedurally place clusters of 3-8 buildings with dirt-path ground planes between them. Parameters: cluster count, spacing, randomization. ~2h

3. **Bridges and walls** — Bridge: flat box spanning a gap, destructible. Walls/fences: low cover for infantry, tanks drive through (auto-destroy). Add to CollisionSystem. ~1.5h

4. **Rivers/mud zones** — Visual: blue/brown plane sections on terrain. Gameplay: movement penalty zones (tanks move at 40% speed, soldiers at 60%). Applied in movement update when position is inside a zone. ~2h

5. **Wrecked tank props** — Pre-placed destroyed tank meshes as cover. Darkened/burned versions of tank models. Indestructible. 5-10 scattered per map. ~1h

6. **Map layout** — Design one balanced map layout for 6v6: spawn zones at north/south, cover distributed fairly, villages near center, rivers as lane dividers. ~1h

### Verification

- Drive tank into building wall — wall breaks
- Walk infantry through village — buildings provide cover
- Cross river — movement slows noticeably
- Map feels balanced (neither team has a cover advantage)

---

## M10 — Skins and Polish

**Status:** Not started
**Estimate:** ~12h (ai:8h test:2h read:2h)
**Depends on:** All gameplay milestones (M1-M9)

### Tasks

1. **Skin system** — `SkinDefs.js` data + rendering. Skins change tank material colors/patterns. Cosmetic only. Apply via material swap on the tank mesh. ~2h

2. **Skin shop tab** — Add to ShopMenu. Preview skin on a rotating tank model before buying. ~1.5h

3. **Main menu** — Title screen, Play/Shop/Loadout buttons, league badge display, money display. Clean UI with the game's color scheme. ~2h

4. **Sound effects (Howler.js)** — Add `howler` dependency. Sounds: cannon fire, explosion, engine hum, bullet impact, UI clicks, round start horn, victory/defeat fanfare. Sprite sheet for efficiency. ~3h

5. **Music** — Menu theme (looping), combat theme (looping, more intense), victory/defeat stings. Source or generate. Volume controls. ~1.5h

6. **Visual polish** — Screen shake on hit, damage flash on tank, smooth health bar transitions, better muzzle flash effect, dust particles on movement. ~2h

### Verification

- Skins visible in-game and shop
- All actions have sound feedback
- Music plays and transitions between menu/combat
- Game feels polished: screen shake, particles, sound make combat satisfying

---

## Total Estimate

| Milestone | Estimate | Cumulative |
|-----------|----------|------------|
| M1 — Combat Polish | ~8h | 8h |
| M2 — 6v6 Teams | ~16h | 24h |
| M3 — Economy + Shop | ~10h | 34h |
| M4 — League Progression | ~8h | 42h |
| M5 — On-Foot Mode | ~12h | 54h |
| M6 — Weapon Arsenal | ~10h | 64h |
| M7 — Tank Variety | ~12h | 76h |
| M8 — Abilities | ~14h | 90h |
| M9 — Environment | ~10h | 100h |
| M10 — Polish | ~12h | 112h |

**Total: ~112h of development.** M9 can run in parallel with M2-M4 since it only depends on M1's collision system.

---

## Tech Decisions Log

| Decision | Chosen | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Physics | Custom AABB/sphere (M1-M4), evaluate Rapier at M5 | cannon-es, Rapier from start | Entity count is tiny (12 tanks, ~50 obstacles). Full physics engine is overhead until on-foot mode adds character-terrain interaction. |
| Audio | Howler.js (M10) | Web Audio API direct | Howler normalizes browser/mobile quirks for ~10KB. Not needed until polish phase. |
| Language | Vanilla JS now, TypeScript at M2 | TS from start | Working code exists in JS. TS migration is mechanical (rename + annotate). M2 introduces data tables where types prevent bugs. |
| UI | HTML/CSS overlays | React, Canvas UI | Game UI is mode-based, not reactive. DOM manipulation is simpler for menus/shop/HUD. |
| ECS | No (plain classes) | bitECS, miniplex | 12 tanks + ~50 obstacles doesn't justify ECS overhead. Classes with update(dt) are clearer. |
| State management | Plain objects | Zustand, Redux | Single-player game with one state owner. No need for pub/sub or immutability. |
