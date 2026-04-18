import * as THREE from 'three';
import { getLeagueDef } from '../data/LeagueDefs.js';
import { Soldier } from '../entities/Soldier.js';

/**
 * AIController — drives all AI tanks and bailed AI soldiers.
 *
 * Tank AI: 5 ally tanks (team 0, slots 1-5) and 6 enemy tanks (team 1, slots 0-5).
 * Each AI tank picks the nearest living tank on the opposing team as its target.
 *
 * Soldier AI (t028): When an AI tank is destroyed the caller may spawn a Soldier
 * and register it via addSoldier(soldier, teamId, scene).  The soldier then runs
 * a 3-state FSM each frame:
 *
 *   advance  → Move toward nearest enemy (tank or player soldier); shoot in range.
 *   cover    → Triggered when HP < SOLDIER_COVER_HP_THRESHOLD * maxHP.
 *              Picks nearest cover obstacle; moves toward it.
 *   attack   → Reached cover or cover timer expired.  Stand still; face + shoot enemy.
 *
 * Cover objects are passed in on each updateSoldiers() call as a flat array of
 * {x, z} positions (supplied by WreckSystem.obstacles + TreeSystem cover positions).
 *
 * League difficulty scaling (VISION.md §"AI Difficulty Scaling per League"):
 *   Enemy team only scales with the player's league:
 *     accuracy      — aim spread; higher league = tighter aim.
 *     reactionTime  — seconds before engaging a newly-spotted target.
 *     hpMultiplier  — applied to enemy tank maxHealth via applyLeagueScalingToTeam().
 *     damageMultiplier — applied to enemy tank.damageMultiplier via applyLeagueScalingToTeam().
 *     usesAbilities — null = no ability use; 'slow' = occasional (Gold);
 *                     'tactical' = situational (Platinum); 'smart' = instant (Diamond+).
 *   Ally AI uses fixed "Gold-level" constants regardless of league.
 *
 * Ability usage (t046 — VISION.md §"AI Difficulty Scaling per League"):
 *   At Gold+, AI tanks with an assigned ability (tank.abilityId) use it tactically:
 *     'slow'     — 30% random chance when trigger conditions are met (Gold).
 *     'tactical' — uses whenever trigger conditions are met (Platinum).
 *     'smart'    — instant situational recognition (Diamond/Champion).
 *   Call assignLeagueAbilities(teamId, startSlot, role) after applyLeagueScalingToTeam()
 *   to assign per-tank abilities based on the default team composition for the league.
 *
 * Usage:
 *   const ai = new AIController(teams, projectiles, particles, terrain, leagueDef);
 *   ai.applyLeagueScalingToTeam(1, 0);       // scale enemy HP + damage once at game start
 *   ai.assignLeagueAbilities(1, 0, 'enemy'); // assign abilities to enemy team
 *   ai.assignLeagueAbilities(0, 1, 'ally');  // assign abilities to ally AI (skip player slot)
 *   // When an AI tank is killed, bail a soldier:
 *   ai.addSoldier(new Soldier({teamId, name}), teamId, scene);
 *   // Each frame (inside Game loop):
 *   ai.update(dt);                // tank AI
 *   ai.updateSoldiers(dt, coverPositions, playerSoldier);  // soldier AI
 */

// -------------------------------------------------------------------------
// Tank AI tuneable constants
// -------------------------------------------------------------------------

/**
 * AI advances until within (tank.range * FIRE_RANGE_FRACTION) of the target,
 * then stops and fires.  Calibrated so standard-class tanks stop at ~28 u.
 */
const FIRE_RANGE_FRACTION = 0.35;

/** Minimum fire range so tanks don't refuse to engage at very short class range. */
const FIRE_RANGE_MIN = 10;

/** Stop distance as a fraction of the computed fire range. */
const FIRE_STOP_FACTOR = 0.75;

/**
 * Aggro range (begin tracking) is 75 % of the tank's max range, clamped
 * to a minimum of 30 u so even short-range classes (FlameTank) will hunt.
 */
const AGGRO_RANGE_FRACTION = 0.75;
const AGGRO_RANGE_MIN = 30;

/** Arena boundary (XZ). Tanks are clamped within ±ARENA_BOUND. */
const ARENA_BOUND = 90;

/**
 * Maximum aim spread angle (radians) at 0% accuracy.
 * Actual spread = (1 - accuracy) * MAX_AIM_SPREAD.
 * Applied as a random per-frame jitter to the turret aim angle.
 */
const MAX_AIM_SPREAD = 0.8;

/** Ally AI fixed accuracy — Gold-level constant, regardless of player league. */
const ALLY_ACCURACY = 0.65;

/** Ally AI fixed reaction time (seconds) — Gold-level constant. */
const ALLY_REACTION_TIME = 0.4;

// -------------------------------------------------------------------------
// Soldier AI tuneable constants (t028)
// -------------------------------------------------------------------------

/**
 * Soldier aggro range (units).  Soldiers have better situational awareness
 * than tanks but are constrained to smaller weapons; keep consistent with
 * SOLDIER_FIRE_RANGE below.
 */
const SOLDIER_AGGRO_RANGE = 50;

/**
 * Maximum range at which an AI soldier will open fire.
 * Soldier bullets have speed 60 u/s (from Soldier.js); at 25 units the
 * bullet takes ~0.42 s to travel, which feels snappy at the game's scale.
 */
const SOLDIER_FIRE_RANGE = 25;

/**
 * Preferred stop distance while advancing (multiplier on SOLDIER_FIRE_RANGE).
 * Soldiers stop further away than tanks — they lack armour.
 */
const SOLDIER_FIRE_STOP = 0.7;

/**
 * Rotation speed of an AI soldier (rad/s).  Faster than a tank (1.8) to
 * give a skirmisher feel, but not as fast as a player (4.0 from Soldier.js).
 */
const SOLDIER_TURN_SPEED = 2.8;

/**
 * HP fraction below which the soldier will seek cover.
 * At 50 % HP a direct tank shell still 1-shots; cover is meaningful only
 * for surviving against enemy soldiers.
 */
const SOLDIER_COVER_HP_THRESHOLD = 0.5;

/**
 * Maximum distance (units) to consider a cover obstacle reachable.
 * Obstacles further away are ignored so soldiers don't sprint off the
 * map chasing a distant wreck.
 */
const SOLDIER_COVER_SEARCH_RADIUS = 35;

/**
 * Distance threshold at which the soldier is considered "at cover" and
 * transitions to the attack state.
 */
const SOLDIER_AT_COVER_DIST = 3.5;

/**
 * Fallback timer (seconds).  If the soldier spends this long in the cover
 * state without reaching the cover point (e.g. path blocked), it gives up
 * and transitions to attack mode to avoid standing still indefinitely.
 */
const SOLDIER_COVER_TIMEOUT = 4.0;

/** Aim spread for AI soldiers (radians at worst accuracy). Lower than tanks. */
const SOLDIER_MAX_AIM_SPREAD = 0.5;

// ── Ability AI tuneable constants (t046) ──────────────────────────────────

/** HP fraction below which a tank prefers defensive abilities (shield, armor). */
const ABILITY_DEFENSIVE_HP_THRESHOLD = 0.55;

/** Distance below which rocketJump triggers (tank is dangerously close). */
const ROCKET_JUMP_TRIGGER_DIST = 12;

/**
 * Radius and minimum count for "cluster" detection (barrage / infernoBurst).
 * If ≥ CLUSTER_MIN_TANKS enemies are within CLUSTER_RADIUS of the target,
 * the cluster condition is satisfied.
 */
const CLUSTER_RADIUS = 20;
const CLUSTER_MIN_TANKS = 2;

/**
 * Default ability assignments by team role and slot index.
 * Matches the VISION.md team composition for Platinum+ leagues.
 * Format: [abilityId, abilityCooldownSeconds] | null (no ability).
 */
const ABILITY_BY_SLOT = {
  enemy: [
    null,                           // slot 0 — standard grunt
    null,                           // slot 1 — scout
    ['reactiveArmor', 20],          // slot 2 — heavy
    ['barrage', 30],                // slot 3 — artillery
    ['infernoBurst', 20],           // slot 4 — flame tank
    ['energyShield', 25],           // slot 5 — shield tank
  ],
  ally: [
    null,                           // slot 0 — player (never assigned here)
    null,                           // slot 1 — standard ally
    ['reactiveArmor', 20],          // slot 2 — heavy ally
    ['barrage', 30],                // slot 3 — artillery ally
    ['infernoBurst', 20],           // slot 4 — flame ally
    ['rocketJump', 15],             // slot 5 — jump tank ally
  ],
};

// -------------------------------------------------------------------------

export class AIController {
  /**
   * @param {import('../core/TeamManager.js').TeamManager} teamManager
   * @param {import('./ProjectileSystem.js').ProjectileSystem} projectileSystem
   * @param {import('./ParticleSystem.js').ParticleSystem} particleSystem
   * @param {import('../entities/Terrain.js').Terrain} terrain
   * @param {object} [leagueDef] — LeagueDefs entry for the player's current league.
   *   Defaults to 'bronze' when omitted. Determines enemy AI difficulty.
   */
  constructor(teamManager, projectileSystem, particleSystem, terrain, leagueDef) {
    this.teams = teamManager;
    this.projectiles = projectileSystem;
    this.particles = particleSystem;
    this.terrain = terrain;

    /**
     * Per-tank transient AI state.
     * Key: Tank instance. Value: { reactionTimer: number, lastTargetUuid: string|null }.
     * Built lazily on first encounter; cleared by reset().
     * @type {Map<object, {reactionTimer: number, lastTargetUuid: string|null}>}
     */
    this._tankState = new Map();

    /**
     * Active AI soldiers and their FSM state.
     * Each entry: { soldier, teamId, scene, fsm }.
     * fsm = { state: 'advance'|'cover'|'attack', coverTarget: THREE.Vector3|null,
     *          coverTimer: number }
     * @type {Array<{soldier: Soldier, teamId: number, scene: THREE.Scene,
     *               fsm: {state: string, coverTarget: THREE.Vector3|null, coverTimer: number}}>}
     */
    this._soldiers = [];

    // Apply initial league. Falls back to bronze if leagueDef is missing/null.
    this._applyLeagueDef(leagueDef || getLeagueDef('bronze'));
  }

  // -------------------------------------------------------------------------
  // Public API — Tank AI
  // -------------------------------------------------------------------------

  /**
   * Switch the AI to a different league difficulty level.
   * Call applyLeagueScalingToTeam() afterwards to update enemy HP/damage.
   *
   * @param {object} leagueDef — entry from LeagueDefs (e.g. LeagueDefs.silver)
   */
  setLeague(leagueDef) {
    this._applyLeagueDef(leagueDef);
  }

  /**
   * Apply HP and damage multipliers from the current league to all AI slots
   * on the given team.  Call once after teams are built and again whenever
   * the player promotes or demotes.
   *
   * HP scaling: sets tank.maxHealth = round(currentMaxHealth * hpMultiplier).
   *   Because Tank.reset() restores health to maxHealth, the scaled value
   *   persists correctly through round resets.
   * Damage scaling: sets tank.damageMultiplier, consumed by Tank.fire().
   *
   * @param {number} teamId    — 0 or 1 (use 1 for the enemy team)
   * @param {number} startSlot — first slot index to process (pass 1 for team 0
   *   to skip the player tank in slot 0)
   */
  applyLeagueScalingToTeam(teamId, startSlot) {
    const team = this.teams.teams[teamId];
    if (!team) return;

    const { hpMultiplier, damageMultiplier } = this._scaling;

    for (let i = startSlot; i < team.slots.length; i++) {
      const tank = team.slots[i].tank;
      // Re-derive from tank.baseHp (class-specific base HP from TankDefs) so
      // re-applying after a league change doesn't compound multipliers.
      // tank.baseHp is set by Tank._applyClassDef() for all class types.
      tank.maxHealth = Math.round(tank.baseHp * hpMultiplier);
      tank.health = tank.maxHealth;
      tank.damageMultiplier = damageMultiplier;
    }
  }

  /**
   * Assign abilities to AI tanks based on the current league and a fixed
   * slot-to-ability table (matches VISION.md team composition for each league).
   *
   * Leagues below Gold (usesAbilities null): all tanks get abilityId = null.
   * Gold+: abilities assigned per ABILITY_BY_SLOT table.
   *
   * Safe to call multiple times (e.g. on league change). Per-tank cooldown
   * timers in _tankState are reset by reset() between rounds.
   *
   * @param {number}          teamId    — 0 or 1
   * @param {number}          startSlot — first slot index to process
   * @param {'enemy'|'ally'}  role      — which slot table to use
   */
  assignLeagueAbilities(teamId, startSlot, role) {
    const team = this.teams.teams[teamId];
    if (!team) return;

    const usesAbilities = this._scaling ? this._scaling.usesAbilities : null;
    const table = ABILITY_BY_SLOT[role] || ABILITY_BY_SLOT.enemy;

    for (let i = startSlot; i < team.slots.length; i++) {
      const tank = team.slots[i].tank;
      const entry = table[i] || null;

      if (!usesAbilities || !entry) {
        // Bronze/Silver or no ability defined for this slot.
        tank.abilityId = null;
        tank.abilityCooldown = 0;
      } else {
        const [abilityId, cooldown] = entry;
        tank.abilityId = abilityId;
        tank.abilityCooldown = cooldown;
      }
    }
  }

  /**
   * Drive all AI tanks one simulation step.
   *
   * @param {number} dt — seconds since last frame
   */
  update(dt) {
    // Ally AI: team 0, slots 1-5 (slot 0 is the human player)
    this._updateTeamAI(dt, 0, 1);

    // Enemy AI: team 1, all slots
    this._updateTeamAI(dt, 1, 0);
  }

  /**
   * Clear per-tank transient state (reaction timers).
   * Call between rounds so AI reaction timers don't carry over.
   * Also removes all AI soldiers from their scenes.
   */
  reset() {
    this._tankState.clear();
    this.resetSoldiers();
  }

  // -------------------------------------------------------------------------
  // Public API — Soldier AI (t028)
  // -------------------------------------------------------------------------

  /**
   * Register a newly-bailed Soldier with the AI controller.
   * The caller is responsible for spawning the Soldier entity (mesh placement
   * and scene.add) before this call.
   *
   * @param {Soldier}       soldier — Soldier entity already placed in the scene
   * @param {number}        teamId  — 0 = ally team, 1 = enemy team
   * @param {THREE.Scene}   scene   — needed for death clean-up
   */
  addSoldier(soldier, teamId, scene) {
    this._soldiers.push({
      soldier,
      teamId,
      scene,
      fsm: { state: 'advance', coverTarget: null, coverTimer: 0 },
    });
  }

  /**
   * Unregister a Soldier (call when it dies externally or on round reset).
   * Does NOT remove the mesh from the scene — caller handles that.
   *
   * @param {Soldier} soldier
   */
  removeSoldier(soldier) {
    const idx = this._soldiers.findIndex(e => e.soldier === soldier);
    if (idx !== -1) this._soldiers.splice(idx, 1);
  }

  /**
   * Returns a flat array of all AI Soldier instances currently registered.
   * Used by Game.js for hit-detection against incoming projectiles.
   * @returns {Soldier[]}
   */
  getActiveSoldiers() {
    return this._soldiers.map(e => e.soldier);
  }

  /**
   * Drive all AI soldiers one simulation step.
   *
   * @param {number} dt             — seconds since last frame
   * @param {Array<{x: number, z: number}>} coverPositions
   *   Flat list of obstacle centres in XZ (wrecks + trees).  Soldiers use
   *   these as candidate cover positions when their HP falls below the
   *   threshold.  Pass an empty array if no cover data is available.
   * @param {Soldier|null} playerSoldier
   *   The player's on-foot Soldier, or null when the player is in a tank.
   *   Enemy AI soldiers will target this; ally AI soldiers will ignore it.
   */
  updateSoldiers(dt, coverPositions, playerSoldier) {
    for (let i = this._soldiers.length - 1; i >= 0; i--) {
      const entry = this._soldiers[i];
      const { soldier, teamId, fsm } = entry;

      if (soldier.health <= 0) continue; // dead soldier; let Game.js clean up

      // Build target list: all opposing tanks + opposing soldier (if any).
      const targets = this._getSoldierTargets(teamId, playerSoldier);
      if (targets.length === 0) continue; // no enemies alive — idle

      // Pick nearest target (tank or soldier)
      const { target, dist } = this._nearestMeshTarget(soldier.mesh.position, targets);
      if (!target || dist > SOLDIER_AGGRO_RANGE) continue;

      // Update FSM: transition to cover when HP is low
      this._updateSoldierFSM(dt, entry, dist, coverPositions);

      // Execute current FSM state
      switch (fsm.state) {
        case 'advance':
          this._soldierAdvance(dt, entry, target, dist);
          break;
        case 'cover':
          this._soldierSeekCover(dt, entry, target);
          break;
        case 'attack':
          this._soldierAttack(dt, entry, target, dist);
          break;
      }

      // Advance the soldier's internal cooldown timers
      soldier.update(dt);
    }
  }

  /**
   * Remove all AI soldiers from their scenes and clear the list.
   * Called between rounds via reset().
   */
  resetSoldiers() {
    for (const { soldier, scene } of this._soldiers) {
      scene.remove(soldier.mesh);
    }
    this._soldiers.length = 0;
  }

  // -------------------------------------------------------------------------
  // Private — Tank AI helpers
  // -------------------------------------------------------------------------

  /**
   * Store the difficulty values from a league def into fast-access fields.
   * Uses the `aiScaling` sub-object from LeagueDefs (field: leagueDef.aiScaling.*).
   * @param {object} leagueDef
   * @private
   */
  _applyLeagueDef(leagueDef) {
    this._scaling = leagueDef.aiScaling;
  }

  /**
   * Get (or lazily create) the per-tank AI state object.
   * @param {object} tank — Tank instance
   * @returns {{
   *   reactionTimer: number,
   *   lastTargetUuid: string|null,
   *   abilityCooldownLeft: number,
   *   abilityActiveTimeLeft: number
   * }}
   * @private
   */
  _getTankState(tank) {
    if (!this._tankState.has(tank)) {
      this._tankState.set(tank, {
        reactionTimer: 0,
        lastTargetUuid: null,
        abilityCooldownLeft: 0,
        abilityActiveTimeLeft: 0,
      });
    }
    return this._tankState.get(tank);
  }

  /**
   * Update AI for all living tanks in `teamId`, starting from `startSlot`.
   *
   * @param {number} dt
   * @param {number} teamId    — which team to process
   * @param {number} startSlot — first slot index to process (skip player slot)
   * @private
   */
  _updateTeamAI(dt, teamId, startSlot) {
    const team = this.teams.teams[teamId];
    if (!team) return;

    // The opposing team's living tanks are the potential targets.
    const opposingTeamId = teamId === 0 ? 1 : 0;
    const targets = this._getLivingTanks(opposingTeamId);
    const isEnemyTeam = teamId === 1;

    for (let i = startSlot; i < team.slots.length; i++) {
      const slot = team.slots[i];
      if (!slot.alive) continue;

      const tank = slot.tank;
      const target = this._nearestTarget(tank.mesh.position, targets);
      const state = this._getTankState(tank);

      // Tick ability cooldown and active-ability timers every frame,
      // even when no target is in range.
      this._tickAbilityTimers(dt, tank, state);

      // No target or target out of aggro range: reset reaction timer and idle.
      // Aggro range is per-tank so classes with longer range begin tracking earlier.
      const dist = target ? tank.mesh.position.distanceTo(target.mesh.position) : Infinity;
      const aggroRange = Math.max(AGGRO_RANGE_MIN, (tank.range || 80) * AGGRO_RANGE_FRACTION);
      if (!target || dist > aggroRange) {
        state.reactionTimer = 0;
        state.lastTargetUuid = null;
        continue;
      }

      // Track how long we've had THIS specific target in range.
      // Reset the timer when the target changes (e.g. previous target died).
      const targetUuid = target.mesh.uuid;
      if (targetUuid !== state.lastTargetUuid) {
        state.reactionTimer = 0;
        state.lastTargetUuid = targetUuid;
      }
      state.reactionTimer += dt;

      this._driveTankTowardTarget(
        dt, tank, target, dist, state, isEnemyTeam, targets
      );
    }
  }

  /**
   * Tick the ability cooldown and active-time counters for a single tank.
   * Clears timed ability state flags (shielded, isLockedDown) when duration expires.
   * Note: reactiveArmorCharges expire by charge-consumption in takeDamage().
   *       rocketJump (isJumping) is managed by TankAbilityEffects.
   *
   * @param {number} dt
   * @param {import('../entities/Tank.js').Tank} tank
   * @param {object} state — per-tank AI state
   * @private
   */
  _tickAbilityTimers(dt, tank, state) {
    if (state.abilityCooldownLeft > 0) {
      state.abilityCooldownLeft = Math.max(0, state.abilityCooldownLeft - dt);
    }
    if (state.abilityActiveTimeLeft > 0) {
      state.abilityActiveTimeLeft = Math.max(0, state.abilityActiveTimeLeft - dt);
      if (state.abilityActiveTimeLeft === 0) {
        // Clear timed-effect flags when duration expires.
        tank.shielded = false;
        tank.isLockedDown = false;
      }
    }
  }

  /**
   * All living tank instances for a given team.
   *
   * @param {number} teamId
   * @returns {import('../entities/Tank.js').Tank[]}
   * @private
   */
  _getLivingTanks(teamId) {
    const team = this.teams.teams[teamId];
    if (!team) return [];
    return team.slots.filter(s => s.alive).map(s => s.tank);
  }

  /**
   * Pick the closest tank from the candidates list.
   *
   * @param {THREE.Vector3} fromPos
   * @param {import('../entities/Tank.js').Tank[]} candidates
   * @returns {import('../entities/Tank.js').Tank|null}
   * @private
   */
  _nearestTarget(fromPos, candidates) {
    let nearest = null;
    let nearestDist = Infinity;

    for (const candidate of candidates) {
      const dist = fromPos.distanceTo(candidate.mesh.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = candidate;
      }
    }

    return nearest;
  }

  /**
   * Run one frame of AI behavior for a single tank against its chosen target.
   *
   * League scaling applied here:
   *   accuracy     — per-frame aim spread added to the turret angle.
   *                  Low accuracy = wide jitter; high accuracy = nearly perfect.
   *   reactionTime — tank waits this many seconds before firing after spotting
   *                  a target (or after the target changes).
   *
   * HP and damage scaling are NOT applied here — they are applied once at
   * tank initialization via applyLeagueScalingToTeam().
   *
   * Phases:
   *  1. Rotate hull toward target and advance.
   *  2. Stop when within fire stop distance.
   *  3. Aim turret (with accuracy spread) and fire after reaction delay.
   *
   * @param {number} dt
   * @param {import('../entities/Tank.js').Tank} tank
   * @param {import('../entities/Tank.js').Tank} target
   * @param {number} dist          — pre-computed distance to target (units)
   * @param {object} state         — per-tank AI state object
   * @param {boolean} isEnemyTeam  — true = apply league scaling; false = ally AI defaults
   * @param {import('../entities/Tank.js').Tank[]} targets — all living opponent tanks
   * @private
   */
  _driveTankTowardTarget(dt, tank, target, dist, state, isEnemyTeam, targets) {
    const reactionTimer = state.reactionTimer;
    const pos = tank.mesh.position;
    const targetPos = target.mesh.position;

    // --- Choose difficulty values based on team role ---
    const accuracy = isEnemyTeam ? this._scaling.accuracy : ALLY_ACCURACY;
    const reactionTime = isEnemyTeam ? this._scaling.reactionTime : ALLY_REACTION_TIME;

    // ── Ability evaluation (t046) ────────────────────────────────────────────
    // Ally AI uses 'slow' mode if it has abilities (unconditional — ally difficulty
    // is Gold-level regardless of league).
    const abilityMode = isEnemyTeam
      ? (this._scaling.usesAbilities || null)
      : 'slow';

    if (abilityMode && tank.abilityId && state.abilityCooldownLeft === 0) {
      if (this._shouldUseAbility(abilityMode, tank, target, dist, targets)) {
        this._activateAbility(tank, target, targets, state);
      }
    }

    // --- Per-class movement stats ---
    // tank.speed and tank.turnRate are set by Tank._applyClassDef from TankDefs.
    const moveSpeed = tank.speed;
    const turnSpeed = tank.turnRate;

    // --- Per-class fire and aggro ranges ---
    // fireRange scales with the tank's effective range stat so Artillery AI
    // engages from far away while FlameTank AI closes to near-melee distance.
    const fireRange = Math.max(FIRE_RANGE_MIN, tank.range * FIRE_RANGE_FRACTION);
    const stopDist  = fireRange * FIRE_STOP_FACTOR;
    const aggroRange = Math.max(AGGRO_RANGE_MIN, tank.range * AGGRO_RANGE_FRACTION);

    // Early-out if target slipped outside aggro range since _updateTeamAI checked.
    if (dist > aggroRange) return;

    // --- Rotate hull toward target ---
    const targetAngle = Math.atan2(
      targetPos.x - pos.x,
      targetPos.z - pos.z
    );
    const hullAngle = tank.mesh.rotation.y;
    let diff = targetAngle - hullAngle;
    // Normalize to [-π, π]
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    // Lockdown Mode (t043): skip all hull movement and turning while active.
    // The tank remains stationary but still aims and fires at doubled rate.
    if (!tank.isLockedDown) {
      tank.mesh.rotation.y += Math.sign(diff) * Math.min(Math.abs(diff), turnSpeed * dt);

      // --- Advance if outside preferred fire distance ---
      if (dist > stopDist) {
        tank.mesh.translateZ(-moveSpeed * dt);
      }
    }

    // --- Keep on terrain ---
    // Skip terrain-follow while jumping — TankAbilityEffects drives Y (t043).
    if (!tank.isJumping) {
      pos.y = this.terrain.getHeightAt(pos.x, pos.z);
    }

    // --- Clamp to arena ---
    pos.x = THREE.MathUtils.clamp(pos.x, -ARENA_BOUND, ARENA_BOUND);
    pos.z = THREE.MathUtils.clamp(pos.z, -ARENA_BOUND, ARENA_BOUND);

    // --- Aim turret with accuracy-based spread ---
    // Low-accuracy AI has wide jitter; high-accuracy AI nearly perfectly tracks.
    const maxSpread = (1 - accuracy) * MAX_AIM_SPREAD;
    const spread = (Math.random() - 0.5) * 2 * maxSpread;
    tank.setTurretAngle(targetAngle + spread);

    // --- Fire when in range and reaction time has elapsed ---
    const reacted = reactionTimer >= reactionTime;
    if (dist < fireRange && reacted) {
      if (tank.isFlamethrower) {
        // Flame Tank: enable continuous cone damage via FlameSystem.
        // The turret already faces the target (aim step above), so the
        // muzzle forward direction used by FlameSystem will naturally sweep
        // the enemy.  No discrete projectile is created.
        tank.flameActive = true;
      } else if (tank.canFire()) {
        tank.flameActive = false;
        const projectile = tank.fire();
        if (projectile) {
          this.projectiles.add(projectile);
          const flashDir = projectile.velocity.clone().normalize();
          this.particles.emitMuzzleFlash(
            projectile.mesh.position.clone(),
            flashDir
          );
        }
      }
    } else {
      // Out of fire range — stop flaming.
      if (tank.isFlamethrower) {
        tank.flameActive = false;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Private — Soldier AI helpers (t028)
  // -------------------------------------------------------------------------

  /**
   * Build the list of valid targets for a soldier on `teamId`.
   *
   * An ally soldier (team 0) targets: all living enemy tanks (team 1).
   * An enemy soldier (team 1) targets: living player tank (team 0 slot 0) +
   *   all living ally tanks (team 0 slots 1-5) + playerSoldier (if alive).
   *
   * Each returned element has a `.mesh` property so _nearestMeshTarget works
   * for both Tank and Soldier types.
   *
   * @param {number} teamId
   * @param {Soldier|null} playerSoldier
   * @returns {Array<{mesh: THREE.Group}>}
   * @private
   */
  _getSoldierTargets(teamId, playerSoldier) {
    const opposingTeamId = teamId === 0 ? 1 : 0;
    const tanks = this._getLivingTanks(opposingTeamId);
    const targets = [...tanks];

    // If team 1 (enemy soldiers), also target the player's on-foot soldier.
    if (teamId === 1 && playerSoldier && playerSoldier.health > 0) {
      targets.push(playerSoldier);
    }

    // If team 0 (ally soldiers), also target team 0 slot 0 tank is irrelevant
    // (that's the player's own tank). Nothing extra needed.

    return targets;
  }

  /**
   * Find the closest object (tank or soldier) by mesh position.
   *
   * @param {THREE.Vector3} fromPos
   * @param {Array<{mesh: THREE.Group}>} candidates
   * @returns {{target: object|null, dist: number}}
   * @private
   */
  _nearestMeshTarget(fromPos, candidates) {
    let nearest = null;
    let nearestDist = Infinity;

    for (const candidate of candidates) {
      const dist = fromPos.distanceTo(candidate.mesh.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = candidate;
      }
    }

    return { target: nearest, dist: nearestDist };
  }

  /**
   * Update FSM transitions for a soldier entry.
   *
   * Transitions:
   *  advance → cover : HP drops below threshold.
   *  cover → attack  : soldier reached cover point OR cover timer expired.
   *  attack → advance: HP recovers above threshold (e.g. no longer in danger).
   *                    In practice HP can only decrease, so this is a fallback
   *                    for when cover was unreachable (timeout).
   *  attack → cover  : HP drops below threshold again (re-triggered after timeout).
   *
   * @param {number} dt
   * @param {{soldier: Soldier, fsm: object}} entry
   * @param {number} distToTarget — current distance to nearest enemy
   * @param {Array<{x: number, z: number}>} coverPositions
   * @private
   */
  _updateSoldierFSM(dt, entry, distToTarget, coverPositions) {
    const { soldier, fsm } = entry;
    const hpFraction = soldier.health / soldier.maxHealth;

    switch (fsm.state) {
      case 'advance': {
        if (hpFraction < SOLDIER_COVER_HP_THRESHOLD) {
          // Seek nearest cover obstacle
          const coverPos = this._findCover(soldier.mesh.position, coverPositions);
          if (coverPos) {
            fsm.coverTarget = coverPos;
            fsm.coverTimer = 0;
            fsm.state = 'cover';
          }
          // No cover available → stay in advance (just shoot more aggressively)
        }
        break;
      }
      case 'cover': {
        fsm.coverTimer += dt;
        const coverDist = fsm.coverTarget
          ? soldier.mesh.position.distanceTo(fsm.coverTarget)
          : Infinity;
        if (coverDist <= SOLDIER_AT_COVER_DIST || fsm.coverTimer >= SOLDIER_COVER_TIMEOUT) {
          fsm.state = 'attack';
          fsm.coverTimer = 0;
        }
        break;
      }
      case 'attack': {
        // If HP drops even lower (another hit), re-seek cover
        if (hpFraction < SOLDIER_COVER_HP_THRESHOLD * 0.6) {
          const coverPos = this._findCover(soldier.mesh.position, coverPositions);
          if (coverPos) {
            fsm.coverTarget = coverPos;
            fsm.coverTimer = 0;
            fsm.state = 'cover';
          }
        }
        break;
      }
    }
  }

  /**
   * Advance state: move toward nearest enemy and shoot when in range.
   *
   * @param {number} dt
   * @param {{soldier: Soldier, teamId: number}} entry
   * @param {{mesh: THREE.Group}} target
   * @param {number} dist — pre-computed distance to target
   * @private
   */
  _soldierAdvance(dt, entry, target, dist) {
    const { soldier } = entry;
    const pos = soldier.mesh.position;
    const targetPos = target.mesh.position;

    // Rotate toward target
    const targetAngle = Math.atan2(targetPos.x - pos.x, targetPos.z - pos.z);
    this._rotateSoldierToward(soldier, targetAngle, dt);

    // Move forward until within preferred fire stop distance
    const stopDist = SOLDIER_FIRE_RANGE * SOLDIER_FIRE_STOP;
    if (dist > stopDist) {
      soldier.mesh.translateZ(-soldier.moveSpeed * dt);
      // Keep on terrain and arena-clamped
      this._clampSoldier(soldier);
    }

    // Fire when close enough
    this._soldierTryFire(soldier, targetAngle);
  }

  /**
   * Cover state: move toward the chosen cover point.
   * The soldier faces the cover (not the enemy) so movement looks intentional.
   *
   * @param {number} dt
   * @param {{soldier: Soldier, fsm: object}} entry
   * @param {{mesh: THREE.Group}} target — kept for potential suppressive fire
   * @private
   */
  _soldierSeekCover(dt, entry, target) {
    const { soldier, fsm } = entry;
    const pos = soldier.mesh.position;
    const coverPos = fsm.coverTarget;

    if (!coverPos) return;

    // Face cover
    const angle = Math.atan2(coverPos.x - pos.x, coverPos.z - pos.z);
    this._rotateSoldierToward(soldier, angle, dt);

    // Move toward cover
    soldier.mesh.translateZ(-soldier.moveSpeed * dt);
    this._clampSoldier(soldier);

    // Suppressive fire at target while retreating (if in range)
    const targetAngle = Math.atan2(
      target.mesh.position.x - pos.x,
      target.mesh.position.z - pos.z
    );
    const dist = pos.distanceTo(target.mesh.position);
    if (dist < SOLDIER_FIRE_RANGE) {
      this._soldierTryFire(soldier, targetAngle);
    }
  }

  /**
   * Attack state: stand at cover, face enemy, and shoot.
   *
   * @param {number} dt
   * @param {{soldier: Soldier}} entry
   * @param {{mesh: THREE.Group}} target
   * @param {number} dist — pre-computed distance to target
   * @private
   */
  _soldierAttack(dt, entry, target, dist) {
    const { soldier } = entry;
    const pos = soldier.mesh.position;
    const targetAngle = Math.atan2(
      target.mesh.position.x - pos.x,
      target.mesh.position.z - pos.z
    );

    // Rotate to face target
    this._rotateSoldierToward(soldier, targetAngle, dt);

    // Fire if in range
    if (dist < SOLDIER_FIRE_RANGE) {
      this._soldierTryFire(soldier, targetAngle);
    }
  }

  /**
   * Fire one bullet if the soldier's cooldown allows.
   * Adds aim spread matching league accuracy for enemy soldiers.
   * Ally soldiers use a fixed moderate accuracy.
   *
   * @param {Soldier} soldier
   * @param {number} targetAngle — world-space angle to target (radians)
   * @private
   */
  _soldierTryFire(soldier, targetAngle) {
    if (!soldier.canFire()) return;

    // Apply aim spread — enemies scale with league, allies use fixed value
    const accuracy = this._scaling ? this._scaling.accuracy : ALLY_ACCURACY;
    const maxSpread = (1 - accuracy) * SOLDIER_MAX_AIM_SPREAD;
    const spread = (Math.random() - 0.5) * 2 * maxSpread;

    // Temporarily set mesh rotation so muzzle points toward target + spread
    const prevRotY = soldier.mesh.rotation.y;
    soldier.mesh.rotation.y = targetAngle + spread;

    const projectile = soldier.fire();
    if (projectile) {
      this.projectiles.add(projectile);
      const flashDir = projectile.velocity.clone().normalize();
      this.particles.emitMuzzleFlash(
        projectile.mesh.position.clone(),
        flashDir
      );
    }

    // Restore original rotation; visual facing handled by _rotateSoldierToward
    soldier.mesh.rotation.y = prevRotY;
  }

  /**
   * Smoothly rotate a soldier's mesh toward `targetAngle` (Y-axis).
   *
   * @param {Soldier} soldier
   * @param {number} targetAngle — desired world-space Y rotation (radians)
   * @param {number} dt
   * @private
   */
  _rotateSoldierToward(soldier, targetAngle, dt) {
    let diff = targetAngle - soldier.mesh.rotation.y;
    while (diff > Math.PI)  diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    soldier.mesh.rotation.y += Math.sign(diff) * Math.min(Math.abs(diff), SOLDIER_TURN_SPEED * dt);
  }

  /**
   * Snap soldier to terrain height and clamp XZ to arena boundary.
   *
   * @param {Soldier} soldier
   * @private
   */
  _clampSoldier(soldier) {
    const pos = soldier.mesh.position;
    pos.y = this.terrain.getHeightAt(pos.x, pos.z);
    pos.x = THREE.MathUtils.clamp(pos.x, -ARENA_BOUND, ARENA_BOUND);
    pos.z = THREE.MathUtils.clamp(pos.z, -ARENA_BOUND, ARENA_BOUND);
  }

  /**
   * Find the best cover position near `fromPos` from the given obstacle list.
   * Picks the nearest obstacle within SOLDIER_COVER_SEARCH_RADIUS that is not
   * identical to the soldier's current position (avoids zero-distance targets).
   *
   * @param {THREE.Vector3} fromPos
   * @param {Array<{x: number, z: number}>} coverPositions
   * @returns {THREE.Vector3|null}
   * @private
   */
  _findCover(fromPos, coverPositions) {
    let best = null;
    let bestDist = Infinity;

    for (const obs of coverPositions) {
      const dx = obs.x - fromPos.x;
      const dz = obs.z - fromPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < 1.5) continue; // already on top of this obstacle
      if (dist > SOLDIER_COVER_SEARCH_RADIUS) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = obs;
      }
    }

    if (!best) return null;

    const y = this.terrain.getHeightAt(best.x, best.z);
    return new THREE.Vector3(best.x, y, best.z);
  }

  // ── Ability AI — decision logic (t046) ─────────────────────────────────

  /**
   * Decide whether to use the given tank's ability right now.
   *
   * Tactical triggers per ability (VISION.md: "shields when taking fire,
   * jumps to reposition, barrages on clusters"):
   *   energyShield  — HP below defensive threshold.
   *   reactiveArmor — HP below defensive threshold AND no charges remaining.
   *   lockdownMode  — within fire range (good firing position to hold).
   *   rocketJump    — too close to an enemy (needs repositioning).
   *   barrage       — 2+ enemies clustered within CLUSTER_RADIUS of target.
   *   infernoBurst  — 2+ enemies within short range (≤ 20 units) of self.
   *
   * Mode gate:
   *   'slow'     — 30% random chance on top of trigger conditions (Gold).
   *   'tactical' — trigger conditions alone (Platinum).
   *   'smart'    — same as tactical; faster response comes from lower reactionTime.
   *
   * @param {string} mode        — 'slow'|'tactical'|'smart'
   * @param {import('../entities/Tank.js').Tank} tank
   * @param {import('../entities/Tank.js').Tank} target
   * @param {number} dist
   * @param {import('../entities/Tank.js').Tank[]} allEnemies — opponent tanks
   * @returns {boolean}
   * @private
   */
  _shouldUseAbility(mode, tank, target, dist, allEnemies) {
    const hpFraction = tank.health / tank.maxHealth;
    const abilityId  = tank.abilityId;
    let conditionMet = false;

    switch (abilityId) {
      case 'energyShield':
        conditionMet = hpFraction < ABILITY_DEFENSIVE_HP_THRESHOLD && !tank.shielded;
        break;

      case 'reactiveArmor':
        conditionMet = hpFraction < ABILITY_DEFENSIVE_HP_THRESHOLD
          && (tank.reactiveArmorCharges === 0 || tank.reactiveArmorCharges === undefined);
        break;

      case 'lockdownMode':
        // Use when in firing range and not already locked down.
        conditionMet = dist < Math.max(FIRE_RANGE_MIN, (tank.range || 80) * FIRE_RANGE_FRACTION)
          && !tank.isLockedDown;
        break;

      case 'rocketJump':
        conditionMet = dist < ROCKET_JUMP_TRIGGER_DIST;
        break;

      case 'barrage':
        conditionMet = this._countNearby(target.mesh.position, allEnemies, CLUSTER_RADIUS)
          >= CLUSTER_MIN_TANKS;
        break;

      case 'infernoBurst':
        conditionMet = this._countNearby(tank.mesh.position, allEnemies, 20)
          >= CLUSTER_MIN_TANKS;
        break;

      default:
        conditionMet = false;
        break;
    }

    if (!conditionMet) return false;

    // 'slow' mode (Gold): only 30% chance to act even when the trigger fires.
    if (mode === 'slow' && Math.random() > 0.30) return false;

    return true;
  }

  /**
   * Activate the given tank's ability and apply its effect.
   *
   * Effects (t046 scope, complementing t043 TankAbilityEffects for the player):
   *   energyShield  — sets tank.shielded = true; cleared by _tickAbilityTimers
   *                   after 5 seconds.
   *   reactiveArmor — sets tank.reactiveArmorCharges (3 charges, each halves
   *                   one hit's damage); charges consumed on each hit in takeDamage().
   *   lockdownMode  — sets tank.isLockedDown = true for 8 seconds; AIController
   *                   skips movement while active, extends effective fire range.
   *   rocketJump    — teleports tank 20 units to a perpendicular flanking position;
   *                   no sustained active period.
   *   barrage       — fires 3 projectiles in a ±15° spread toward the target cluster.
   *   infernoBurst  — fires 5 projectiles in a ±40° forward cone toward nearest enemy.
   *
   * @param {import('../entities/Tank.js').Tank} tank
   * @param {import('../entities/Tank.js').Tank} target
   * @param {import('../entities/Tank.js').Tank[]} allEnemies
   * @param {object} state — per-tank AI state
   * @private
   */
  _activateAbility(tank, target, allEnemies, state) {
    switch (tank.abilityId) {
      case 'energyShield':
        tank.shielded = true;
        state.abilityActiveTimeLeft = 5; // seconds
        break;

      case 'reactiveArmor':
        // Grant 3 charge-based hits of 50% damage reduction (matches t043 design).
        tank.reactiveArmorCharges = 3;
        state.abilityActiveTimeLeft = 0; // charge-based, no timer needed
        break;

      case 'lockdownMode':
        tank.isLockedDown = true;
        state.abilityActiveTimeLeft = 8; // seconds
        break;

      case 'rocketJump':
        this._doRocketJump(tank, target);
        state.abilityActiveTimeLeft = 0;
        break;

      case 'barrage':
        this._doBarrage(tank, target);
        state.abilityActiveTimeLeft = 0;
        break;

      case 'infernoBurst':
        this._doInfernoBurst(tank, allEnemies);
        state.abilityActiveTimeLeft = 0;
        break;

      default:
        break;
    }

    // Reset cooldown so the ability cannot be reused until the timer expires.
    state.abilityCooldownLeft = tank.abilityCooldown || 0;
  }

  // ── Ability effect helpers ───────────────────────────────────────────────

  /**
   * Rocket Jump: teleport tank 20 units to a perpendicular flank position.
   * Emits a particle burst at the landing site.
   *
   * @param {import('../entities/Tank.js').Tank} tank
   * @param {import('../entities/Tank.js').Tank} target
   * @private
   */
  _doRocketJump(tank, target) {
    const pos = tank.mesh.position;
    const toTarget = new THREE.Vector3(
      target.mesh.position.x - pos.x,
      0,
      target.mesh.position.z - pos.z
    ).normalize();

    // Perpendicular direction to the target bearing; randomise left or right.
    const perpendicular = new THREE.Vector3(-toTarget.z, 0, toTarget.x);
    const side = Math.random() > 0.5 ? 1 : -1;
    const jumpDist = 20;

    const newX = THREE.MathUtils.clamp(
      pos.x + perpendicular.x * jumpDist * side, -ARENA_BOUND, ARENA_BOUND
    );
    const newZ = THREE.MathUtils.clamp(
      pos.z + perpendicular.z * jumpDist * side, -ARENA_BOUND, ARENA_BOUND
    );

    tank.mesh.position.set(newX, this.terrain.getHeightAt(newX, newZ), newZ);

    this.particles.emitExplosion(
      tank.mesh.position.clone(),
      { count: 12, speed: 5, lifetime: 0.5 }
    );
  }

  /**
   * Barrage: fire three projectiles in a ±15° spread toward the target cluster.
   *
   * @param {import('../entities/Tank.js').Tank} tank
   * @param {import('../entities/Tank.js').Tank} target
   * @private
   */
  _doBarrage(tank, target) {
    const SPREAD_ANGLES = [-0.26, 0, 0.26]; // ~15° each
    const pos = tank.mesh.position;
    const baseAngle = Math.atan2(
      target.mesh.position.x - pos.x,
      target.mesh.position.z - pos.z
    );

    for (const offset of SPREAD_ANGLES) {
      tank.setTurretAngle(baseAngle + offset);
      const projectile = tank.fire();
      if (projectile) {
        this.projectiles.add(projectile);
        this.particles.emitMuzzleFlash(
          projectile.mesh.position.clone(),
          projectile.velocity.clone().normalize()
        );
      }
    }
  }

  /**
   * Inferno Burst: fire five projectiles in a ±40° cone toward nearest enemy.
   *
   * @param {import('../entities/Tank.js').Tank} tank
   * @param {import('../entities/Tank.js').Tank[]} allEnemies
   * @private
   */
  _doInfernoBurst(tank, allEnemies) {
    const nearest = this._nearestTarget(tank.mesh.position, allEnemies);
    if (!nearest) return;

    const pos = tank.mesh.position;
    const baseAngle = Math.atan2(
      nearest.mesh.position.x - pos.x,
      nearest.mesh.position.z - pos.z
    );

    const CONE_ANGLES = [-0.70, -0.35, 0, 0.35, 0.70]; // ~20° steps
    for (const offset of CONE_ANGLES) {
      tank.setTurretAngle(baseAngle + offset);
      const projectile = tank.fire();
      if (projectile) {
        this.projectiles.add(projectile);
        this.particles.emitMuzzleFlash(
          projectile.mesh.position.clone(),
          projectile.velocity.clone().normalize()
        );
      }
    }
  }

  /**
   * Count tanks in `candidates` within `radius` of `center`.
   *
   * @param {THREE.Vector3} center
   * @param {import('../entities/Tank.js').Tank[]} candidates
   * @param {number} radius
   * @returns {number}
   * @private
   */
  _countNearby(center, candidates, radius) {
    let count = 0;
    for (const t of candidates) {
      if (center.distanceTo(t.mesh.position) <= radius) count++;
    }
    return count;
  }
}
