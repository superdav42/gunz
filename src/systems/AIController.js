import * as THREE from 'three';
import { getLeagueDef } from '../data/LeagueDefs.js';

/**
 * AIController — drives all AI tanks: 5 ally tanks (team 0, slots 1-5) and
 * 6 enemy tanks (team 1, slots 0-5). Both sides use identical behavior logic;
 * each AI tank picks the nearest living tank on the opposing team as its target.
 *
 * League difficulty scaling (VISION.md §"AI Difficulty Scaling per League"):
 *   Enemy team only scales with the player's league:
 *     accuracy      — aim spread; higher league = tighter aim.
 *     reactionTime  — seconds before engaging a newly-spotted target.
 *     hpMultiplier  — applied to enemy tank maxHealth via applyLeagueScalingToTeam().
 *     damageMultiplier — applied to enemy tank.damageMultiplier via applyLeagueScalingToTeam().
 *   Ally AI uses fixed "Gold-level" constants regardless of league.
 *
 * Usage:
 *   const ai = new AIController(teams, projectiles, particles, terrain, leagueDef);
 *   ai.applyLeagueScalingToTeam(1, 0);  // scale enemy team HP + damage once at game start
 *   // on league change:
 *   ai.setLeague(newLeagueDef);
 *   ai.applyLeagueScalingToTeam(1, 0);  // re-apply to enemy team
 */

// -------------------------------------------------------------------------
// Tuneable constants — shared by all AI regardless of league
// -------------------------------------------------------------------------

/** Distance at which an AI tank begins tracking a target. */
const AGGRO_RANGE = 60;

/** AI advances until within FIRE_RANGE * FIRE_STOP_FACTOR of the target. */
const FIRE_RANGE = 28;
const FIRE_STOP_FACTOR = 0.75;

/** Movement speed (units/s) while advancing. */
const MOVE_SPEED = 7;

/** Maximum rotation rate (rad/s) of the tank hull while turning toward target. */
const TURN_SPEED = 1.8;

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
     * Optional callback fired whenever an AI tank fires a projectile.
     * Signature: (tank: Tank, projectile: Projectile) => void
     * Set via onShot() — used by SoundSystem to play AI cannon sounds.
     * @type {((tank: object, projectile: object) => void)|null}
     */
    this._onShot = null;

    // Apply initial league. Falls back to bronze if leagueDef is missing/null.
    this._applyLeagueDef(leagueDef || getLeagueDef('bronze'));
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Register a callback that fires whenever any AI tank fires a projectile.
   * Used by SoundSystem to play cannon sounds for AI shots.
   *
   * @param {(tank: object, projectile: object) => void} fn
   * @returns {this}
   */
  onShot(fn) {
    this._onShot = fn;
    return this;
  }

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
      // Re-derive from the default base HP (100) so re-applying after a
      // league change doesn't compound multipliers.
      const BASE_HP = 100;
      tank.maxHealth = Math.round(BASE_HP * hpMultiplier);
      tank.health = tank.maxHealth;
      tank.damageMultiplier = damageMultiplier;
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
   */
  reset() {
    this._tankState.clear();
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Store the difficulty values from a league def into fast-access fields.
   * Uses the `ai` sub-object from LeagueDefs (field: leagueDef.ai.*).
   * @param {object} leagueDef
   */
  _applyLeagueDef(leagueDef) {
    this._scaling = leagueDef.ai;
  }

  /**
   * Get (or lazily create) the per-tank AI state object.
   * @param {object} tank — Tank instance
   * @returns {{reactionTimer: number, lastTargetUuid: string|null}}
   */
  _getTankState(tank) {
    if (!this._tankState.has(tank)) {
      this._tankState.set(tank, { reactionTimer: 0, lastTargetUuid: null });
    }
    return this._tankState.get(tank);
  }

  /**
   * Update AI for all living tanks in `teamId`, starting from `startSlot`.
   *
   * @param {number} dt
   * @param {number} teamId    — which team to process
   * @param {number} startSlot — first slot index to process (skip player slot)
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

      // No target or target out of aggro range: reset reaction timer and idle.
      const dist = target ? tank.mesh.position.distanceTo(target.mesh.position) : Infinity;
      if (!target || dist > AGGRO_RANGE) {
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

      this._driveTankTowardTarget(dt, tank, target, dist, state.reactionTimer, isEnemyTeam);
    }
  }

  /**
   * All living tank instances for a given team.
   *
   * @param {number} teamId
   * @returns {import('../entities/Tank.js').Tank[]}
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
   * @param {number} reactionTimer — seconds this tank has had this target in range
   * @param {boolean} isEnemyTeam  — true = apply league scaling; false = ally AI defaults
   */
  _driveTankTowardTarget(dt, tank, target, dist, reactionTimer, isEnemyTeam) {
    const pos = tank.mesh.position;
    const targetPos = target.mesh.position;

    // --- Choose difficulty values based on team role ---
    const accuracy = isEnemyTeam ? this._scaling.aimAccuracy : ALLY_ACCURACY;
    const reactionTime = isEnemyTeam ? this._scaling.reactionTime : ALLY_REACTION_TIME;

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
    tank.mesh.rotation.y += Math.sign(diff) * Math.min(Math.abs(diff), TURN_SPEED * dt);

    // --- Advance if outside preferred fire distance ---
    const stopDist = FIRE_RANGE * FIRE_STOP_FACTOR;
    if (dist > stopDist) {
      tank.mesh.translateZ(-MOVE_SPEED * dt);
    }

    // --- Keep on terrain ---
    pos.y = this.terrain.getHeightAt(pos.x, pos.z);

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
    if (dist < FIRE_RANGE && tank.canFire() && reacted) {
      const projectile = tank.fire();
      if (projectile) {
        this.projectiles.add(projectile);
        const flashDir = projectile.velocity.clone().normalize();
        this.particles.emitMuzzleFlash(
          projectile.mesh.position.clone(),
          flashDir
        );
        // Notify the sound system (if registered) so AI cannon fire is audible.
        if (this._onShot) this._onShot(tank, projectile);
      }
    }
  }
}
