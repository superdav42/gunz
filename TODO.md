# GUNZ - Task Tracker

Full plan: [todo/PLANS.md](todo/PLANS.md) | Vision: [VISION.md](VISION.md)

## In Progress

## M1 — Solid Tank Combat ~8h

- [ ] t001 Extract CollisionSystem from Game.js, add tank-vs-obstacle blocking (rocks, trees) ~2h logged:2026-04-16
- [ ] t002 Track trees as entities with HP, destructible by tank shells, spawn debris ~1.5h blocked-by:t005,t003 logged:2026-04-16
- [ ] t003 ParticleSystem: pool-based emitter for explosions, muzzle flash, dust trails ~2h logged:2026-04-16
- [ ] t004 Tank wrecks: demolished tanks become indestructible cover props on field ~1.5h blocked-by:t001,t003 logged:2026-04-16
- [ ] t005 Expose obstacle positions/radii from Terrain for CollisionSystem queries ~1h logged:2026-04-16

## M2 — 6v6 Teams and Match System ~16h

- [ ] t006 TeamManager: create 2 teams of 6, spawn opposite sides, track alive/dead ~3h blocked-by:t001 logged:2026-04-16
- [ ] t007 Rewrite EnemySystem → AIController: drives all 10 AI tanks (allies + enemies), target selection by team ~3h blocked-by:t006 logged:2026-04-16
- [ ] t008 MatchManager: best-of-3 state machine (PRE_ROUND → ACTIVE → ROUND_END → MATCH_END) ~3h blocked-by:t006 logged:2026-04-16
- [ ] t009 Round reset: respawn all 12 tanks, full HP/ammo, clear wrecks/projectiles, keep loadout ~1h blocked-by:t008 logged:2026-04-16
- [ ] t010 StatsTracker: per-round damage dealt, kills, assists, survival tracking ~2h blocked-by:t006 logged:2026-04-16
- [ ] t011 Performance rewards calculator from StatsTracker output (VISION.md reward table) ~1h blocked-by:t010 logged:2026-04-16
- [ ] t012 KillFeed UI: top-right destruction messages, auto-fade, stack limit ~1h blocked-by:t006 logged:2026-04-16
- [ ] t013 Scoreboard UI: hold Tab shows all 12 tanks with HP/kills/damage/status ~2h blocked-by:t006 logged:2026-04-16

## M3 — Economy and Shop ~10h

- [ ] t014 EconomySystem: money balance, earn/spend with validation ~1h blocked-by:t011 logged:2026-04-16
- [ ] t015 SaveSystem: localStorage persistence for full player profile, schema-versioned ~2h blocked-by:t014 logged:2026-04-16
- [ ] t016 Data definitions: TankDefs, WeaponDefs, UpgradeDefs with all VISION.md stats ~2h blocked-by:t011 logged:2026-04-16
- [ ] t017 ShopMenu UI: 4 tabs (tanks, weapons, upgrades, skins), buy flow, league checks ~3h blocked-by:t014,t015,t016 logged:2026-04-16
- [ ] t018 LoadoutScreen UI: pre-match tank + weapon selection from owned items ~2h blocked-by:t016,t015 logged:2026-04-16

## M4 — League Progression ~8h

- [ ] t019 LeagueDefs data: 6 leagues with LP thresholds, AI difficulty multipliers, tier caps ~1h blocked-by:t016 logged:2026-04-16
- [ ] t020 LeagueSystem: LP tracking, promote/demote logic on match result ~2h blocked-by:t019,t014 logged:2026-04-16
- [ ] t021 AI difficulty scaling: AIController reads league multipliers for accuracy/reaction/HP/damage ~2h blocked-by:t019,t007 logged:2026-04-16
- [ ] t022 League-gated shop: items locked by league, upgrade tier caps enforced ~1h blocked-by:t020,t017 logged:2026-04-16
- [ ] t023 LeagueDisplay UI: main menu badge + LP bar, promotion/demotion animation ~2h blocked-by:t020 logged:2026-04-16

## M5 — On-Foot Mode ~12h

- [ ] t024 Soldier entity: capsule mesh, movement, gun, low HP ~3h blocked-by:t006 logged:2026-04-16
- [ ] t025 PlayerController: mode switching (E key), auto-bail on tank death, re-enter tank ~3h blocked-by:t024 logged:2026-04-16
- [ ] t026 Melee attack system: short-range, high damage, raycast/sphere overlap ~1.5h blocked-by:t024 logged:2026-04-16
- [ ] t027 Camera adaptation: switch between tank follow and soldier follow on mode change ~1h blocked-by:t025 logged:2026-04-16
- [ ] t028 On-foot AI: bailed soldiers run toward enemies, shoot, use cover ~2h blocked-by:t024,t007 logged:2026-04-16
- [ ] t029 Round end with soldiers: round over only when all tanks AND soldiers on a team dead ~1.5h blocked-by:t025,t008 logged:2026-04-16

## M6 — Weapon Arsenal ~10h

- [ ] t030 Weapon stat system: per-weapon damage/fireRate/range/reload/clipSize/spread in WeaponDefs ~2h blocked-by:t024,t016 logged:2026-04-16
- [ ] t031 Firearm variety: Pistol, SMG, Assault Rifle, Sniper, Shotgun with distinct behaviors ~3h blocked-by:t030 logged:2026-04-16
- [ ] t032 Explosive weapons: Grenade Launcher (arc, splash), Rocket Launcher (fast, splash) ~2h blocked-by:t030 logged:2026-04-16
- [ ] t033 Melee weapon variety: Knife, Machete, War Hammer, Energy Blade with different stats ~1.5h blocked-by:t026,t030 logged:2026-04-16
- [ ] t034 Weapon equip/switch system: primary gun + melee, number keys or buttons ~1.5h blocked-by:t030,t018 logged:2026-04-16

## M7 — Tank Variety ~12h

- [ ] t035 Tank class data: all 8 classes in TankDefs with distinct HP/speed/armor/weapon stats ~1.5h blocked-by:t016 logged:2026-04-16
- [ ] t036 Tank visual differentiation: distinct mesh per class (Scout smaller, Heavy larger, etc.) ~3h blocked-by:t035 logged:2026-04-16
- [ ] t037 Tank behavior differences: class stats feed into movement/fire/damage/HP ~2h blocked-by:t035,t007 logged:2026-04-16
- [ ] t038 TeamCompositions data: per-league team roster for auto-filling AI slots ~1h blocked-by:t035,t019 logged:2026-04-16
- [ ] t039 Flame Tank weapon: continuous cone damage + fire particles ~2h blocked-by:t036,t003 logged:2026-04-16
- [ ] t040 Tank selection in loadout: show owned tanks with stat comparison ~1.5h blocked-by:t036,t018 logged:2026-04-16
- [ ] t041 Per-class upgrade tracking: upgrades apply per tank class, saved separately ~1h blocked-by:t035,t015 logged:2026-04-16

## M8 — Abilities ~14h

- [ ] t042 AbilitySystem: cooldown management, input binding (Q key), max 2 active abilities ~3h blocked-by:t035,t030 logged:2026-04-16
- [ ] t043 Tank abilities: Inferno Burst, Energy Shield, Rocket Jump, Lockdown Mode, Barrage, Reactive Armor ~5h blocked-by:t042,t036 logged:2026-04-16
- [ ] t044 Weapon abilities: Cluster Bomb, Lock-On, Overcharge, Nova Blast, Dash Strike ~3h blocked-by:t042,t031,t032 logged:2026-04-16
- [ ] t045 AbilityBar UI: icon with radial cooldown fill for tank + weapon ability ~1.5h blocked-by:t042 logged:2026-04-16
- [ ] t046 AI ability usage: Platinum+ AI uses abilities tactically ~1.5h blocked-by:t043,t021 logged:2026-04-16

## M9 — Environment and Structures ~10h

- [ ] t047 Building/house geometry: stacked boxes, destructible walls break into debris ~2.5h blocked-by:t001 logged:2026-04-16
- [ ] t048 VillageGenerator: procedural clusters of 3-8 buildings with dirt paths ~2h blocked-by:t047 logged:2026-04-16
- [ ] t049 Bridges and walls: destructible bridge, low walls/fences tanks drive through ~1.5h blocked-by:t047 logged:2026-04-16
- [ ] t050 Rivers/mud zones: visual planes + movement penalty (40% tank, 60% soldier) ~2h blocked-by:t001 logged:2026-04-16
- [ ] t051 Pre-placed wrecked tank props as indestructible cover ~1h blocked-by:t004 logged:2026-04-16
- [ ] t052 Map layout: balanced 6v6 design with spawn zones, center village, river lanes ~1h blocked-by:t048,t050 logged:2026-04-16

## M10 — Skins and Polish ~12h

- [ ] t053 Skin system: SkinDefs data + material swap rendering ~2h blocked-by:t036 logged:2026-04-16
- [ ] t054 Skin shop tab with rotating preview model ~1.5h blocked-by:t053,t017 logged:2026-04-16
- [ ] t055 Main menu: title screen, Play/Shop/Loadout buttons, league + money display ~2h blocked-by:t023,t017 logged:2026-04-16
- [ ] t056 Sound effects: Howler.js integration, cannon/explosion/engine/UI sounds ~3h blocked-by:t008 logged:2026-04-16
- [ ] t057 Music: menu and combat loops, victory/defeat stings, volume control ~1.5h blocked-by:t056 logged:2026-04-16
- [ ] t058 Visual polish: screen shake, damage flash, smooth health bars, better particles ~2h blocked-by:t003,t008 logged:2026-04-16

## Completed
