# GUNZ - Game Vision Document

## One-Line Pitch

A low-poly 3D tank combat game where two teams of 6 tanks battle in best-of-3 matches. Climb leagues, earn money from performance, buy better weapons and tanks, unlock powerful abilities at higher leagues, and bail out on foot with a gun and melee when your tank gets demolished.

---

## Core Concept

Two teams of **6 tanks each** clash on a battlefield scattered with trees, rocks, villages, and ruins. The player controls one tank on their team --- the other 5 are AI teammates. The enemy team is 6 AI tanks. A round ends when one team has all 6 of its tanks destroyed. Each match is **best-of-3 rounds** --- win 2 rounds to win the match.

Winning earns **money** based on how well you personally performed --- damage dealt, kills scored, survival time. Spend money on new weapons, tanks, skins, and upgrades between matches. Climb through a **league system** where each league makes the enemy team harder but unlocks access to stronger weapons and tanks with special abilities (shields, jump jets, etc.).

The twist: when your tank is destroyed you're not out --- you **bail out on foot** with a firearm and melee weapon. You're fragile but mobile, and you can still contribute damage to finish off wounded enemy tanks or harass on-foot enemies. If you die on foot too, you're out for the round.

---

## Art Direction

**Style:** Low-poly / flat-shaded. Think *Totally Accurate Battle Simulator* or *Ravenfield* --- geometric shapes, bold solid colors, minimal textures. No photorealism.

**Why:** Keeps the scope manageable for a small team / solo dev, runs well in the browser (Three.js / WebGL), and gives the game a distinct visual identity.

| Element | Approach |
|---------|----------|
| Tanks | Box hulls, cylinder turrets, chunky barrels. Color-coded by faction / tier. |
| Player on foot | Simple capsule body, blocky limbs, no facial detail. |
| Terrain | Flat-shaded plane with sine-wave hills (already implemented). |
| Trees | Cylinder trunk + cone canopy (already implemented). |
| Rocks | Dodecahedron geometry, scaled flat (already implemented). |
| Buildings | Stacked boxes with flat-color roofs. Destructible walls = smaller boxes. |
| Villages | Clusters of 3-8 buildings with dirt-path ground planes. |
| Effects | Particle bursts for explosions, simple muzzle flash planes, dust trails. |

---

## Player Modes

### 1. Tank Mode (default)

The player controls a tank with hull movement and independent turret aim.

- **Movement:** WASD / left joystick for hull drive and turn.
- **Aiming:** Mouse / right joystick aims the turret independently of the hull.
- **Firing:** Click / fire button shoots the main cannon.
- **Switching:** Press a key (E / dedicated button) to exit the tank. The tank stays where it is and can be re-entered.

### 2. On-Foot Mode

The player is a small soldier character. Faster than a tank but much more fragile.

- **Movement:** WASD / left joystick. Faster turn speed than a tank.
- **Gun:** Fires faster than a tank cannon but deals less damage. Upgradeable.
- **Melee:** Close-range attack (knife / wrench / bayonet). High damage, very short range. Useful for finishing damaged enemies or breaking obstacles.
- **Re-enter tank:** Walk up to your (or a captured) tank and press E to climb back in.
- **Vulnerability:** On-foot health is much lower. One tank shell can kill you. Encourages smart use of cover.

---

## Upgrade System

Upgrades are bought with **money** in the shop between matches. They are **permanent** --- once purchased, an upgrade stays forever. Upgrade tiers are **league-gated**: higher leagues unlock higher tiers with bigger stat boosts.

### League-Gated Upgrade Tiers

| Tier | League Required | Stat Boost per Tier |
|------|-----------------|---------------------|
| Tier 1 | Bronze | Small (+10-15%) |
| Tier 2 | Bronze | Moderate (+15-20%) |
| Tier 3 | Silver | Significant (+20-25%) |
| Tier 4 | Gold | Large (+25-30%) |
| Tier 5 | Platinum | Maximum (+30-35%) |

This means a Platinum player's tier 5 armor gives roughly 2x the HP of a Bronze player's tier 2 armor. Climbing leagues is the only way to reach full power.

### Tank Upgrades

| Upgrade | Effect | Max Tier | Price per Tier |
|---------|--------|----------|----------------|
| Armor Plating | +Max HP | 5 | $500 / $1,000 / $2,000 / $4,000 / $8,000 |
| Engine | +Speed, +turn rate | 5 | $500 / $1,000 / $2,000 / $4,000 / $8,000 |
| Main Gun | +Damage, -reload time | 5 | $750 / $1,500 / $3,000 / $6,000 / $12,000 |
| Ammo Capacity | +Max ammo per resupply | 3 | $300 / $600 / $1,200 |
| Tracks | Better hill climbing, less slowdown on rough terrain | 3 | $400 / $800 / $1,600 |
| Hull Reinforcement | +Resistance to explosive damage | 3 | $600 / $1,200 / $2,400 |

Upgrades apply **per tank class**. Upgrading the Standard tank does not upgrade the Heavy.

### On-Foot Weapon Upgrades

| Upgrade | Effect | Max Tier | Price per Tier |
|---------|--------|----------|----------------|
| Firearm Damage | +Bullet damage | 5 | $400 / $800 / $1,600 / $3,200 / $6,400 |
| Fire Rate | -Time between shots | 5 | $400 / $800 / $1,600 / $3,200 / $6,400 |
| Clip Size | +Ammo before reload | 3 | $300 / $600 / $1,200 |
| Reload Speed | -Reload time | 3 | $300 / $600 / $1,200 |
| Melee Damage | +Melee hit damage | 4 | $300 / $600 / $1,200 / $2,400 |
| Melee Reach | +Melee range | 3 | $250 / $500 / $1,000 |
| Sprint Speed | +On-foot movement speed | 3 | $400 / $800 / $1,600 |
| Body Armor | +On-foot max HP | 4 | $500 / $1,000 / $2,000 / $4,000 |

Weapon upgrades apply **per weapon**. Upgrading the Assault Rifle does not upgrade the Sniper.

### Tank Classes

| Tank | Description | Trade-off | League |
|------|-------------|-----------|--------|
| Standard | Balanced all-rounder (starter tank). | No extreme stats | Bronze |
| Scout | Light, fast, weak armor. Rapid-fire small cannon. | Speed vs survivability | Bronze |
| Heavy | Slow, thick armor, big cannon. High damage, long reload. | Power vs mobility | Silver |
| Artillery | Very long range, arc shots. Paper-thin armor. | Range vs close-combat | Silver |
| Flame Tank | Short-range flamethrower. Strong vs groups. Has Inferno Burst ability. | Range vs area damage | Gold |
| Shield Tank | Medium speed, medium armor. Has Energy Shield ability. | Defense vs offense | Platinum |
| Jump Tank | Light-medium armor. Has Rocket Jump ability. | Mobility vs durability | Platinum |
| Siege Tank | Heavy armor, powerful cannon. Has Lockdown Mode ability. | Firepower vs mobility | Diamond |

The player picks a tank class before each match in the loadout screen. Buy once, own forever.

---

## AI (Teammates and Enemies)

Both teams are made of AI-controlled tanks (plus you). The AI runs the same behavior system on both sides --- your teammates and enemies use the same logic. The difference is that the **enemy team scales with your league** (better aim, faster reactions, smarter tactics at higher leagues).

### Team Composition per League

Each team's 6 tanks are composed differently depending on the league:

| League | Your Team Composition | Enemy Team Composition |
|--------|----------------------|----------------------|
| **Bronze** | 4 Standard, 1 Scout, 1 Heavy | 5 Standard, 1 Scout |
| **Silver** | 3 Standard, 1 Scout, 1 Heavy, 1 Artillery | 3 Standard, 1 Scout, 1 Heavy, 1 Artillery |
| **Gold** | 2 Standard, 1 Scout, 1 Heavy, 1 Artillery, 1 Flame | Same as your team + ability usage |
| **Platinum** | Mixed roster from all unlocked classes | Full mixed roster with abilities |
| **Diamond+** | Full mixed roster | Full mixed roster, max-tier stats, aggressive AI |

The player always picks their own tank class. The remaining 5 teammate slots are auto-filled based on league composition tables.

### AI Behavior

- **Advance:** Move toward enemy positions as a loose group. Don't all rush one target.
- **Engage:** Pick a target and fire. Different tank classes prefer different engagement ranges.
- **Flank:** Scout tanks try to circle behind the enemy formation.
- **Hold position:** Artillery and heavies anchor and fire from range.
- **Use cover:** Tanks use rocks, buildings, and hills to block line of sight when reloading or damaged.
- **Retreat:** Damaged tanks pull back toward teammates for protection.
- **Focus fire:** At higher leagues, multiple AI tanks coordinate to focus on one target.
- **Ability usage:** At Gold+ leagues, AI tanks use their abilities tactically (shields when taking fire, jumps to reposition, barrages on clusters).

### AI Difficulty Scaling per League

| Stat | Bronze | Silver | Gold | Platinum | Diamond | Champion |
|------|--------|--------|------|----------|---------|----------|
| Aim accuracy | 40% | 55% | 70% | 80% | 90% | 95% |
| Reaction time | 1.5s | 1.0s | 0.7s | 0.5s | 0.3s | 0.2s |
| HP multiplier | 0.6x | 0.8x | 1.0x | 1.2x | 1.4x | 1.6x |
| Damage multiplier | 0.6x | 0.8x | 1.0x | 1.1x | 1.3x | 1.5x |
| Uses cover | Rarely | Sometimes | Often | Always | Always | Always |
| Uses abilities | No | No | Yes (slow) | Yes | Yes (smart) | Yes (instant) |
| Coordinates focus fire | No | No | No | Sometimes | Often | Always |

---

## Obstacles and Environment

### Terrain Features

| Feature | Gameplay Role |
|---------|---------------|
| Trees | Light cover. Destructible by tank shells. Block line of sight. |
| Rocks / boulders | Hard cover. Indestructible. Block movement and shots. |
| Hills | Elevation advantage. Tanks slow on steep slopes. |
| Rivers / mud | Movement penalty zones. Tanks crawl, infantry slows. |

### Structures

| Feature | Gameplay Role |
|---------|---------------|
| Houses | Destructible cover. On-foot players can use doorways. Tanks smash through walls. |
| Villages | Clusters of houses. Good infantry fighting zones. |
| Bridges | Chokepoints over rivers. Destructible. |
| Walls / fences | Low cover for infantry. Tanks drive through. |
| Supply depot | Mid-map structure. Cover and a landmark for navigation. |
| Wrecked tanks | Indestructible cover. Scattered across the battlefield as props. |

---

## Teams and Combat

### Team Structure

- **Your team:** You (player-controlled) + 5 AI teammates = **6 tanks**.
- **Enemy team:** 6 AI tanks.
- **Total on the field:** 12 tanks at round start.

Both teams spawn on opposite sides of the battlefield. AI teammates fight alongside you --- they pick targets, use cover, and follow basic squad tactics. You can't give them orders (keeps it simple), but they respond to the flow of battle.

### Health, Armor, and Destruction

Every tank has **health (HP)**. Damage reduces HP. When HP reaches 0, the tank is **demolished** --- it explodes, becomes a wreck prop on the field, and the crew bails out on foot (if the on-foot system is implemented; otherwise the tank is simply eliminated).

| Stat | Description |
|------|-------------|
| **Health (HP)** | Total hit points. Base value depends on tank class. Upgradeable with Armor Plating. |
| **Armor** | Damage reduction percentage. Reduces incoming damage before it hits HP. Higher-tier tanks have more base armor. |
| **Damage** | How much HP your shots remove from the target (after their armor reduction). |

**Damage formula:** `actual_damage = shot_damage * (1 - target_armor_percent)`

Example: You fire a shot that deals 30 base damage at a tank with 20% armor. The tank loses `30 * 0.8 = 24 HP`.

### Win Condition

A round ends when **all 6 tanks on one team are destroyed** (and their on-foot crew are dead or the on-foot system isn't active yet). No timer --- fight until one team is wiped out.

---

## Match Structure (Best of 3)

Every game is a **match** made up of up to 3 rounds. First to win 2 rounds wins the match.

```
[ Main Menu / Loadout ]
       |
[ Match Start ]
       |
[ Round 1 ] --> 6v6 --> one team eliminated
       |                |
       |          [ Round Result: Win or Lose ]
       |
[ Round 2 ] --> all 12 tanks reset --> 6v6 again
       |                |
       |          [ Round Result: Win or Lose ]
       |
[ If tied 1-1: Round 3 ] --> final decider
       |
[ Match Result ]
       |
[ Rewards Screen ] --> earn money based on YOUR performance
       |
[ Shop / Loadout ] --> spend money, change gear
       |
[ Next Match or League Promotion ]
```

### Round Rules

- Each round starts **fresh** --- all 12 tanks at full HP, full ammo, starting positions.
- Your **loadout persists** across rounds (tank class, equipped weapons, upgrades). No buying mid-match.
- A round ends when all 6 tanks (and on-foot crew) on one team are destroyed.
- Between rounds: a brief **5-second countdown** with a round score summary. No shopping.
- After the match: the full **rewards screen** with money earned, then access to the **shop**.

### Performance-Based Rewards

You earn money based on **your personal performance**, not just win/loss. The better you play, the more you earn --- even in a loss.

| Action | Money Earned |
|--------|-------------|
| **Damage dealt** | +$1 per 5 HP of damage dealt to enemy tanks |
| **Tank kill** (last hit) | +$100-$300 (varies by enemy tank class) |
| **Assist** (dealt 30%+ damage to a tank someone else killed) | +$50-$150 |
| **On-foot kill** (kill enemy soldier) | +$40 |
| **Survived the round** (your tank was still alive) | +$150 bonus |
| **Win a round** | +$500 bonus |
| **Win the match** | +$1,000 bonus |
| **MVP** (most damage dealt in the match) | +$400 bonus |
| **Flawless round** (your tank took no damage) | +$300 bonus |
| **Lose the match** | Keep all earnings from damage/kills (no win/MVP bonus) |

This means a player who dealt massive damage but lost still walks away with decent money. Encourages aggressive play over hiding.

---

## League System

Leagues are the long-term progression spine. Winning matches earns **league points (LP)**. Accumulate enough LP to promote to the next league. Lose matches and you lose LP --- drop too low and you demote.

### League Tiers

| League | LP Required | Enemy Difficulty | Unlock Theme |
|--------|-------------|-----------------|--------------|
| **Bronze** | 0 | Easy. Slow enemies, poor aim, small groups. | Starter weapons and tanks. |
| **Silver** | 500 | Medium. Faster enemies, better aim, mixed types. | Snipers, explosives, Scout/Heavy tanks. |
| **Gold** | 1200 | Hard. Aggressive AI, flanking, artillery. | Advanced weapons, Flame Tank, first abilities. |
| **Platinum** | 2200 | Very hard. Coordinated squads, fast heavies. | Big guns with abilities (shield, jump). |
| **Diamond** | 3500 | Extreme. Boss-tier regulars, instant aggro. | Best tanks and weapons in the game. |
| **Champion** | 5000+ | Brutal. Max stats, all enemy types every round. | Cosmetic prestige skins. Bragging rights. |

### LP Gains and Losses

| Result | LP Change |
|--------|-----------|
| Win match (2-0 sweep) | +40 LP |
| Win match (2-1 close) | +25 LP |
| Lose match (1-2 close) | -10 LP |
| Lose match (0-2 sweep) | -20 LP |

### What Leagues Change

**Enemies get harder:**

- Bronze: enemies have 50% base HP and damage, slow reaction time.
- Each league increases enemy HP, damage, accuracy, and reaction speed by roughly 20%.
- Diamond/Champion: enemies have 120-150% base stats, aggressive flanking AI, and use abilities.

**Better gear becomes available in the shop:**

- Higher league = access to stronger weapons with higher base damage, better tanks with higher base HP.
- Ability weapons and ability tanks only unlock at Gold and above.
- The best gear in the game is Diamond-locked --- you literally cannot buy it until you climb there.

**Upgrade ceilings increase:**

- In Bronze, tank upgrades cap at tier 2. Weapon upgrades cap at tier 2.
- In Silver, everything caps at tier 3.
- In Gold+, tier 4 upgrades unlock.
- In Platinum+, tier 5 (max) upgrades unlock.
- This means a Diamond player's fully-upgraded basic tank is stronger than a Bronze player's fully-upgraded basic tank.

---

## Economy and Shop

### Currency: Money ($)

Earned from match performance (see Round Scoring above). Persistent across matches --- your bank balance carries over. Spent in the shop between matches.

### The Shop

Accessible from the main menu between matches. Four tabs:

**1. Tanks Tab**

Buy new tank classes. Each has a league-minimum requirement.

| Tank | Price | League Required |
|------|-------|-----------------|
| Standard | Free | Bronze |
| Scout | $2,000 | Bronze |
| Heavy | $5,000 | Silver |
| Artillery | $5,000 | Silver |
| Flame Tank | $8,000 | Gold |
| Shield Tank | $15,000 | Platinum |
| Jump Tank | $15,000 | Platinum |
| Siege Tank | $25,000 | Diamond |

**2. Weapons Tab**

Buy on-foot weapons. You equip one primary gun + one melee weapon.

| Weapon | Type | Price | League | Description |
|--------|------|-------|--------|-------------|
| Pistol | Gun | Free | Bronze | Starter. Low damage, decent fire rate. |
| SMG | Gun | $1,500 | Bronze | Fast fire rate, low accuracy at range. |
| Assault Rifle | Gun | $3,000 | Silver | Balanced damage and rate. |
| Sniper Rifle | Gun | $4,500 | Silver | High damage, slow fire, long range. |
| Shotgun | Gun | $3,500 | Silver | Devastating up close, useless at range. |
| Grenade Launcher | Explosive | $6,000 | Gold | Area damage, arc trajectory, slow reload. |
| Rocket Launcher | Explosive | $8,000 | Gold | High single-target damage, splash. |
| Railgun | Gun | $12,000 | Platinum | Pierces through multiple enemies. Charge time. |
| Plasma Cannon | Gun | $18,000 | Diamond | Massive damage, energy projectile, slow. |
| Combat Knife | Melee | Free | Bronze | Starter melee. Quick, low damage. |
| Machete | Melee | $1,000 | Bronze | Wider swing, more damage. |
| War Hammer | Melee | $3,000 | Silver | Slow, heavy damage, small knockback. |
| Energy Blade | Melee | $10,000 | Gold | Fast, high damage, glowing visual. |

**3. Upgrades Tab**

Spend money to permanently upgrade your tanks and weapons (see Upgrade System below). Tier caps are league-gated.

**4. Skins Tab**

Cosmetic-only. Alternate colors, camo patterns, decals for tanks and soldiers. No gameplay effect. Priced $500-$5,000.

---

## Weapon and Tank Abilities (Gold+ Leagues)

Starting at Gold league, the shop begins offering gear with **active abilities** --- special moves on a cooldown. These are the "big guns" that make high-league play feel distinct from Bronze/Silver.

### Tank Abilities

| Tank | Ability | Cooldown | League |
|------|---------|----------|--------|
| Flame Tank | **Inferno Burst** --- 360-degree flame ring, damages all nearby enemies | 20s | Gold |
| Shield Tank | **Energy Shield** --- projects a bubble shield that blocks all incoming fire for 5s | 25s | Platinum |
| Jump Tank | **Rocket Jump** --- launches the tank into the air, lands with area damage | 15s | Platinum |
| Siege Tank | **Lockdown Mode** --- becomes stationary, doubles fire rate and range for 8s | 20s | Diamond |
| Artillery | **Barrage** --- fires 5 shells in rapid succession at a target area | 30s | Gold (upgrade) |
| Heavy | **Reactive Armor** --- next 3 hits deal 50% reduced damage | 20s | Gold (upgrade) |

### Weapon Abilities (on-foot)

| Weapon | Ability | Cooldown | League |
|--------|---------|----------|--------|
| Grenade Launcher | **Cluster Bomb** --- grenade splits into 5 mini-grenades on impact | 18s | Gold |
| Rocket Launcher | **Lock-On** --- next rocket tracks the nearest enemy for 3s | 15s | Gold |
| Railgun | **Overcharge** --- next shot deals 3x damage with a wider beam | 20s | Platinum |
| Plasma Cannon | **Nova Blast** --- charged AoE explosion centered on player | 25s | Diamond |
| Energy Blade | **Dash Strike** --- lunge forward 10m and slash everything in path | 12s | Gold |

### How Abilities Work

- Each ability has a **dedicated button** (Q on desktop, ability button on mobile).
- One ability per equipped tank, one ability per equipped weapon. Max 2 active abilities at once.
- Abilities recharge on a timer. No ammo cost.
- Visual and audio cues signal ability activation (shield glow, jump trail, etc.).
- Enemies in Platinum+ leagues also use abilities. The AI mirrors the player's available power level.

---

## Game Flow (Full Loop)

```
[ Title Screen ]
       |
[ Main Menu ]
  |         |          |
[ Play ]  [ Shop ]  [ Loadout ]
  |
[ Pick Tank Class ] --> choose from owned tanks
  |
[ Match Starts ] --> AI difficulty set by current league
  |
[ Round 1: 6v6 ] --> fight until one team is wiped
  |
[ Round 1 Result ] --> your stats shown (damage, kills, assists)
  |
[ Round 2: 6v6 ] --> positions reset, full HP
  |
[ Round 2 Result ]
  |
[ Round 3 (if tied 1-1): 6v6 ] --> decider round
  |
[ Match Result + Rewards ] --> money earned from performance
  |
[ LP Update + League Check ]
  |           |
[ Promote? ] [ Demote? ]
  |
[ Back to Main Menu --> Shop / Loadout / Play Again ]
```

### Round Flow (inside a match)

```
[ Round Start ]
       |
  Both teams spawn on opposite sides (6 tanks each)
       |
[ Combat ] --> all 12 tanks fight simultaneously
       |
  Tanks destroyed become wrecks (crew bails out on foot)
       |
[ Round End ] --> triggered when all 6 tanks on one side are demolished
       |
[ Round Scoreboard ] --> damage dealt, kills, assists, survival
       |
[ Next Round or Match End ]
```

### What a Typical Round Looks Like

1. **Spawn phase (3s):** Both teams appear on their side. Brief countdown.
2. **Opening push:** Teams advance toward the center. Scouts rush ahead, heavies hold back.
3. **Engagement:** First shots fired. Players jockey for cover behind rocks, buildings, hills.
4. **Attrition:** Tanks start getting demolished. Wrecks litter the field and become new cover.
5. **Endgame:** Outnumbered team tries to survive. Remaining on-foot soldiers can still turn it around with flanking or lucky shots on damaged tanks.
6. **Round end:** Last tank or soldier on one team is destroyed. Scoreboard appears.

---

## Controls

### Desktop

| Action | Tank Mode | On-Foot Mode |
|--------|-----------|--------------|
| Move | WASD | WASD |
| Aim | Mouse | Mouse |
| Fire | Left Click | Left Click |
| Melee | --- | F or Middle Click |
| Ability | Q | Q |
| Exit / Enter Tank | E | E (near tank) |
| Scoreboard | Tab (hold) | Tab (hold) |

### Mobile (touch)

| Action | Tank Mode | On-Foot Mode |
|--------|-----------|--------------|
| Move | Left joystick | Left joystick |
| Aim | Right joystick | Right joystick |
| Fire | Fire button | Fire button |
| Melee | --- | Melee button |
| Ability | Ability button | Ability button |
| Exit / Enter Tank | Vehicle button | Vehicle button (near tank) |
| Scoreboard | Score button | Score button |

---

## Technical Architecture

### Current Stack (keep)

- **Three.js** for 3D rendering
- **Vite** for dev server and bundling
- **Vanilla JS** (no framework overhead)
- **Mobile-first** touch controls with desktop keyboard/mouse

### Planned Systems

| System | Purpose |
|--------|---------|
| `MatchManager` | Runs best-of-3 match flow: round start, round end, match result, rewards. |
| `TeamManager` | Creates two teams of 6 tanks. Assigns tank classes per league composition tables. Tracks alive/dead per team. |
| `LeagueSystem` | Tracks LP, current league, promotion/demotion, league-gated unlock checks. |
| `ShopSystem` | Between-match shop UI. Tabs: tanks, weapons, upgrades, skins. Checks league requirements. |
| `EconomySystem` | Tracks money balance. Calculates match rewards from personal performance stats. |
| `StatsTracker` | Per-round tracking of damage dealt, damage taken, kills, assists, survival time for reward calculation. |
| `LoadoutSystem` | Manages equipped tank class, primary weapon, melee weapon, skins. Persisted to localStorage. |
| `PlayerController` | Manages mode switching (tank vs on-foot). Delegates input to the active mode. |
| `SoldierEntity` | On-foot player/enemy character. Movement, shooting, melee, health. |
| `UpgradeSystem` | Tracks purchased upgrades per tank/weapon, applies stat modifiers, enforces tier caps. |
| `AbilitySystem` | Manages cooldown-based active abilities for tanks and weapons. Input binding, VFX triggers. |
| `ObstacleSystem` | Spawns and manages destructible/indestructible environment objects. |
| `VillageGenerator` | Procedurally places house clusters with paths. |
| `CoverSystem` | AI pathfinding awareness of cover positions. |
| `ParticleSystem` | Explosions, muzzle flash, dust, debris. |
| `SaveSystem` | Persists player profile to localStorage: money, league, owned items, upgrades, skins. |

### File Structure (planned)

```
src/
  core/
    Game.js              (main loop, scene setup)
    MatchManager.js      (best-of-3 round flow, scoring, rewards)
    TeamManager.js       (create teams of 6, assign classes, track alive/dead)
    PlayerController.js  (mode switching: tank vs on-foot)
  data/
    TankDefs.js          (tank class stats, prices, league requirements)
    WeaponDefs.js        (weapon stats, prices, league requirements)
    UpgradeDefs.js       (upgrade tiers, costs, stat multipliers)
    LeagueDefs.js        (league thresholds, difficulty multipliers, AI scaling)
    TeamCompositions.js  (which tank classes per team per league)
    SkinDefs.js          (cosmetic definitions, prices)
  entities/
    Tank.js              (tank entity, stats, firing)
    Soldier.js           (on-foot entity, gun, melee)
    Projectile.js        (bullets and shells)
    Obstacle.js          (trees, rocks, buildings base class)
    Village.js           (building cluster generator)
  systems/
    InputSystem.js       (keyboard, mouse, touch)
    CameraController.js  (follows active player mode)
    ProjectileSystem.js  (manages all live projectiles)
    AIController.js      (shared AI for teammates and enemies, league-scaled stats)
    StatsTracker.js      (per-round damage, kills, assists, survival tracking)
    UpgradeSystem.js     (upgrade tracking, stat application, tier caps)
    AbilitySystem.js     (cooldown management, ability effects, VFX)
    CollisionSystem.js   (extracted from Game.js)
    ParticleSystem.js    (visual effects)
    LeagueSystem.js      (LP tracking, promote/demote logic)
    EconomySystem.js     (money balance, match reward calculation)
    SaveSystem.js        (localStorage persistence for profile)
  ui/
    HUD.js               (health, ammo, kill feed, round counter, ability cooldown)
    Scoreboard.js        (hold Tab: all 12 tanks, HP bars, kills, damage, alive/dead)
    ShopMenu.js          (between-match shop: tanks, weapons, upgrades, skins)
    LoadoutScreen.js     (pre-match tank + weapon selection)
    MatchResultScreen.js (post-match rewards, LP change, league status, personal stats)
    RoundBanner.js       (round start/end overlay: "Round 1", "You Win", etc.)
    LeagueDisplay.js     (league badge, LP progress bar)
    ModeIndicator.js     (shows current mode: tank/on-foot)
    AbilityBar.js        (ability icon with cooldown ring)
    KillFeed.js          (top-right feed: "Player destroyed Enemy #3", etc.)
```

---

## Milestones

### M1 - Solid Tank Combat (current state + polish)

- [x] Player tank with turret aim
- [x] Enemy tanks with basic AI
- [x] Projectile system
- [x] Terrain with rocks and trees
- [x] HUD (health, ammo, score)
- [ ] Obstacle collision (tanks blocked by rocks/trees)
- [ ] Destructible trees
- [ ] Particle effects (explosions, muzzle flash)
- [ ] Tank wreck props (demolished tanks stay on field as cover)

### M2 - 6v6 Teams and Match System

- [ ] TeamManager: create two teams of 6 tanks, spawn on opposite sides
- [ ] AI teammates: same AI as enemies, fights on player's side
- [ ] Round win condition: all 6 tanks on one team destroyed
- [ ] MatchManager: best-of-3 round state machine
- [ ] Round reset logic (full HP, full ammo, positions reset, keep loadout)
- [ ] Round transition UI (countdown, "Round 2", "Your Team Wins")
- [ ] StatsTracker: per-round damage dealt, kills, assists, survival
- [ ] Performance-based money rewards (damage dealt, kills, bonuses)
- [ ] Match result screen with personal stats breakdown
- [ ] Kill feed UI (top-right: "Player destroyed Enemy #3")
- [ ] Scoreboard UI (hold Tab: all 12 tanks with HP, kills, status)

### M3 - Economy and Shop

- [ ] EconomySystem: money balance, earn/spend
- [ ] SaveSystem: persist profile to localStorage
- [ ] Shop UI with tabs (tanks, weapons, upgrades, skins)
- [ ] Purchase flow with league-requirement checks
- [ ] Loadout screen: pick tank + primary weapon + melee before match

### M4 - League Progression

- [ ] LeagueSystem: LP tracking, promotion, demotion
- [ ] League display on main menu (badge, LP bar)
- [ ] Enemy difficulty scaling per league (HP, damage, accuracy, reaction)
- [ ] League-gated shop items (weapons/tanks hidden until league reached)
- [ ] League-gated upgrade tier caps
- [ ] Promotion/demotion animation and notification

### M5 - On-Foot Mode

- [ ] Soldier entity with movement and shooting
- [ ] Mode switching (exit/enter tank)
- [ ] Melee attack system
- [ ] Camera adapts to on-foot perspective
- [ ] On-foot health and vulnerability

### M6 - Weapon Arsenal

- [ ] Weapon data definitions (pistol through plasma cannon)
- [ ] Weapon stat system (damage, fire rate, range, reload, clip size)
- [ ] Sniper rifle: long range, slow fire, scope zoom
- [ ] Explosive weapons: grenade launcher, rocket launcher (arc/splash)
- [ ] Melee weapon variety (knife, machete, war hammer, energy blade)
- [ ] Weapon switching and equip system

### M7 - Tank Variety

- [ ] Tank class data definitions with distinct stats
- [ ] Scout, Heavy, Artillery tank models
- [ ] Flame Tank with flamethrower weapon
- [ ] Shield Tank, Jump Tank, Siege Tank models
- [ ] Tank selection in loadout screen
- [ ] Per-class upgrade tracking

### M8 - Abilities (Gold+ League Content)

- [ ] AbilitySystem: cooldown timers, input binding (Q key / button)
- [ ] Tank abilities: Energy Shield, Rocket Jump, Lockdown Mode, Inferno Burst, Barrage
- [ ] Weapon abilities: Cluster Bomb, Lock-On, Overcharge, Nova Blast, Dash Strike
- [ ] Ability cooldown UI (icon with radial fill)
- [ ] Ability VFX (shield bubble, jump trail, explosion rings)
- [ ] AI enemies use abilities at Platinum+ leagues

### M9 - Environment and Structures

- [ ] House/building geometry (destructible)
- [ ] Village cluster generation
- [ ] Bridges, walls, fences
- [ ] Rivers/mud movement penalty zones
- [ ] Wrecked tank props as cover

### M10 - Skins and Polish

- [ ] Skin system: alternate tank colors, camo patterns, decals
- [ ] Skin shop tab with previews
- [ ] Main menu polish (title, buttons, league display)
- [ ] Sound effects (shooting, explosions, engine, UI clicks)
- [ ] Music (menu theme, combat loop)

---

## Out of Scope (for now)

- Multiplayer / networking (AI opponents only)
- Story campaign or scripted missions
- Cloud saves or user accounts (localStorage only)
- Realistic graphics or PBR materials
- Loot boxes or randomized rewards (all purchases are direct)
- Trading or gifting between players
- Map editor
