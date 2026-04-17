# GUNZ — Agent Context

## Project

Browser-based 3D tank combat game. Two teams of 6 tanks, best-of-3 matches, league progression, economy, on-foot mode.

## Key Documents

- **[VISION.md](VISION.md)** — Complete game design: mechanics, data tables (tank classes, weapons, upgrades, leagues, AI scaling), milestones M1–M10, file structure plan.
- **[TODO.md](TODO.md)** — All 58 tasks (t001–t058) with `blocked-by:` dependencies and estimates.
- **[todo/PLANS.md](todo/PLANS.md)** — Execution plan: milestone breakdown, dependency graph, architecture notes, tech decisions.

Read VISION.md before implementing any game system — it contains the authoritative stats tables, reward formulas, and behavior specs.

## Stack

- **Three.js** — 3D rendering (low-poly flat-shaded)
- **Vite** — dev server and bundler
- **Vanilla JS** — no framework (TypeScript migration planned at M2)
- **No physics engine** — custom AABB/sphere collision (Rapier evaluated at M5 if needed)
- **localStorage** — persistence (no backend)

## Architecture

Game loop with system modules. Each system has an `update(dt)` function. No ECS — plain classes.

```
src/
  core/       — Game.js (main loop), MatchManager, TeamManager, PlayerController
  data/       — Static definitions: TankDefs, WeaponDefs, UpgradeDefs, LeagueDefs
  entities/   — Tank, Soldier, Projectile, Obstacle, Terrain
  systems/    — InputSystem, AIController, CollisionSystem, ProjectileSystem, etc.
  ui/         — HUD, ShopMenu, Scoreboard, KillFeed (HTML/CSS overlays)
```

## Conventions

- Flat-shaded `MeshStandardMaterial` with solid colors, no textures
- Tank meshes: `BoxGeometry` hull, `CylinderGeometry` turret, cylinder barrel
- Terrain height: `Terrain.getHeightAt(x, z)` — sine-wave function
- Mobile-first: touch joystick (left=move, right=aim), desktop keyboard+mouse
- All game data (stats, prices, league thresholds) defined in `src/data/` files, not hardcoded in entities
