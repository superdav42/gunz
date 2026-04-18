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
 *     usesAbilities — null/false = no ability use; 'slow' = occasional (Gold);
 *                     'tactical' = situational (Platinum); 'smart' = instant (Diamond+).
 *   Ally AI uses fixed "Gold-level" constants regardless of league.
 *
 * Ability usage (t046 — VISION.md §"AI Difficulty Scaling per League"):
 *   At Gold+, AI tanks that have an ability (tank.abilityId) will use it
 *   according to the usesAbilities mode:
 *     'slow'     — 30% random chance when trigger conditions are met.
 *     'tactical' — uses whenever trigger conditions are met (Platinum).
 *     'smart'    — uses with zero extra delay (Diamond/Champion).
 *   Ability assignment: call assignLeagueAbilities(teamId, startSlot) after
 *   applyLeagueScalingToTeam() to assign per-tank abilities based on the
 *   default team composition for the current league.
 *
 * Usage:
 *   const ai = new AIController(teams, projectiles, particles, terrain, leagueDef);
 *   ai.applyLeagueScalingToTeam(1, 0);     // scale enemy HP + damage once at game start
 *   ai.assignLeagueAbilities(1, 0, 'enemy'); // assign abilities to enemy team
 *   ai.assignLeagueAbilities(0, 1, 'ally'); // assign abilities to ally AI
 *   // on league change:
 *   ai.setLeague(newLeagueDef);
 *   ai.applyLeagueScalingToTeam(1, 0);
 *   ai.assignLeagueAbilities(1, 0, 'enemy');
 *   ai.assignLeagueAbilities(0, 1, 'ally');
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

// ── Ability tuning ─────────────────────────────────────────────────────────

/** HP fraction below which a tank prefers defensive abilities (shield, armor). */
const ABILITY_DEFENSIVE_HP_THRESHOLD = 0.55;

/** Distance below which 'rocketJump' triggers (too close = bad position). */
const ROCKET_JUMP_TRIGGER_DIST = 12;

/**
 * Radius used to count allies/enemies clustered for barrage/infernoBurst.
 * If ≥ CLUSTER_MIN_TANKS enemies are within CLUSTER_RADIUS of each other,
 * the cluster condition is met.
 */
const CLUSTER_RADIUS = 20;
const CLUSTER_MIN_TANKS = 2;

/** energyShield active duration (seconds). */
const SHIELD_DURATION = 5;

/** reactiveArmor active duration (seconds) and damage-reduction fraction. */
const ARMOR_BOOST_DURATION = 5;
const ARMOR_BOOST_FRACTION = 0.5;

/** lockdownMode active duration (seconds). */
const LOCKDOWN_DURATION = 8;

/**
 * Default ability assignments by team role and slot index.
 * These match the VISION.md team composition for Platinum+ leagues.
 * format: [abilityId, abilityCooldown] pairs; null = no ability.
 *
 * 'enemy' slots 0-5; 'ally' slots 1-5 (slot 0 = player, skip).
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
     * Key: Tank instance.
     * Value: {
     *   reactionTimer: number,
     *   lastTargetUuid: string|null,
     *   abilityCooldownLeft: number,    — seconds until this tank's ability is ready again
     *   abilityActiveTimeLeft: number,  — seconds remaining on an active timed ability
     * }
     * Built lazily on first encounter; cleared by reset().
     * @type {Map<object, {
     *   reactionTimer: number,
     *   lastTargetUuid: string|null,
     *   abilityCooldownLeft: number,
     *   abilityActiveTimeLeft: number
     * }>}
     */
    this._tankState = new Map();

    // Apply initial league. Falls back to bronze if leagueDef is missing/null.
    this._applyLeagueDef(leagueDef || getLeagueDef('bronze'));
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Switch the AI to a different league difficulty level.
   * Call applyLeagueScalingToTeam() and assignLeagueAbilities() afterwards
   * to update enemy HP/damage and ability assignments.
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
   * Assign abilities to AI tanks based on the current league and a fixed
   * slot-to-ability table (matches VISION.md team composition for each league).
   *
   * Leagues below Gold: all AI tanks get abilityId = null (no abilities).
   * Gold+: abilities are assigned per slot using ABILITY_BY_SLOT.
   *
   * This must be called after applyLeagueScalingToTeam() so the tank instances
   * already exist.  It is safe to call multiple times (e.g. on league change);
   * per-tank cooldown timers in _tankState are reset on reset().
   *
   * @param {number} teamId    — 0 or 1
   * @param {number} startSlot — first slot index to process
   * @param {'enemy'|'ally'} role — which slot table to use
   */
  assignLeagueAbilities(teamId, startSlot, role) {
    const team = this.teams.teams[teamId];
    if (!team) return;

    const usesAbilities = this._scaling.usesAbilities;
    const table = ABILITY_BY_SLOT[role] || ABILITY_BY_SLOT.enemy;

    for (let i = startSlot; i < team.slots.length; i++) {
      const tank = team.slots[i].tank;
      const entry = table[i] || null;

      if (!usesAbilities || !entry) {
        // Bronze/Silver or no ability for this slot — clear any existing assignment.
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
   * Clear per-tank transient state (reaction timers, ability cooldowns).
   * Call between rounds so AI reaction timers and ability cooldowns don't carry over.
   */
  reset() {
    this._tankState.clear();
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Store the difficulty values from a league def into fast-access fields.
   * Uses the `aiScaling` sub-object from LeagueDefs (field: leagueDef.aiScaling.*).
   * @param {object} leagueDef
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
   */
  _updateTeamAI(dt, teamId, startSlot) {
    const team = this.teams.teams[teamId];
    if (!team) return;

    // The opposing team's living tanks are the potential targets.
    const opposingTeamId = teamId === 0 ? 1 : 0;
    const targets = this._getLivingTanks(opposingTeamId);
    const friendlies = this._getLivingTanks(teamId);
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

      this._driveTankTowardTarget(
        dt, tank, target, dist, state, isEnemyTeam, targets, friendlies
      );
    }
  }

  /**
   * Tick the ability cooldown and active-time counters for a single tank.
   * Also clears timed ability state flags when their duration expires.
   *
   * @param {number} dt
   * @param {import('../entities/Tank.js').Tank} tank
   * @param {object} state — per-tank AI state
   */
  _tickAbilityTimers(dt, tank, state) {
    if (state.abilityCooldownLeft > 0) {
      state.abilityCooldownLeft = Math.max(0, state.abilityCooldownLeft - dt);
    }

    if (state.abilityActiveTimeLeft > 0) {
      state.abilityActiveTimeLeft = Math.max(0, state.abilityActiveTimeLeft - dt);

      // Clear timed state flags when the active duration expires.
      if (state.abilityActiveTimeLeft === 0) {
        tank.shieldActive = false;
        tank.armorBoost = 0;
        tank.lockdownActive = false;
      }
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
   *  1. Evaluate ability use (Platinum+ leagues).
   *  2. Rotate hull toward target and advance (skip if lockdownMode active).
   *  3. Stop when within fire stop distance.
   *  4. Aim turret (with accuracy spread) and fire after reaction delay.
   *
   * @param {number} dt
   * @param {import('../entities/Tank.js').Tank} tank
   * @param {import('../entities/Tank.js').Tank} target
   * @param {number} dist                    — pre-computed distance to target
   * @param {object} state                   — per-tank AI state
   * @param {boolean} isEnemyTeam            — true = apply league scaling
   * @param {import('../entities/Tank.js').Tank[]} targets    — all living enemy tanks
   * @param {import('../entities/Tank.js').Tank[]} friendlies — all living friendly tanks
   */
  _driveTankTowardTarget(dt, tank, target, dist, state, isEnemyTeam, targets, friendlies) {
    const pos = tank.mesh.position;
    const targetPos = target.mesh.position;

    // --- Choose difficulty values based on team role ---
    const accuracy = isEnemyTeam ? this._scaling.accuracy : ALLY_ACCURACY;
    const reactionTime = isEnemyTeam ? this._scaling.reactionTime : ALLY_REACTION_TIME;

    // ── Phase 1: Evaluate ability use (Platinum+ enemy team or Gold+ ally) ──
    // Ally AI always uses Gold-level ability mode ('slow') regardless of league.
    const abilityMode = isEnemyTeam
      ? (this._scaling.usesAbilities || null)
      : 'slow'; // ally AI uses slow mode unconditionally when abilities assigned

    if (abilityMode && tank.abilityId && state.abilityCooldownLeft === 0) {
      const shouldUse = this._shouldUseAbility(
        abilityMode, tank, target, dist, state, targets
      );
      if (shouldUse) {
        this._activateAbility(tank, target, dist, targets, state);
      }
    }

    // ── Phase 2: Rotate hull toward target and advance ──────────────────────
    // lockdownMode: tank holds position while ability is active.
    if (!tank.lockdownActive) {
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

      // Advance if outside preferred fire distance.
      const stopDist = FIRE_RANGE * FIRE_STOP_FACTOR;
      if (dist > stopDist) {
        tank.mesh.translateZ(-MOVE_SPEED * dt);
      }
    }

    // ── Phase 3: Keep on terrain, clamp to arena ────────────────────────────
    pos.y = this.terrain.getHeightAt(pos.x, pos.z);
    pos.x = THREE.MathUtils.clamp(pos.x, -ARENA_BOUND, ARENA_BOUND);
    pos.z = THREE.MathUtils.clamp(pos.z, -ARENA_BOUND, ARENA_BOUND);

    // ── Phase 4: Aim turret and fire ────────────────────────────────────────
    const targetAngleFire = Math.atan2(
      targetPos.x - pos.x,
      targetPos.z - pos.z
    );
    const maxSpread = (1 - accuracy) * MAX_AIM_SPREAD;
    const spread = (Math.random() - 0.5) * 2 * maxSpread;
    tank.setTurretAngle(targetAngleFire + spread);

    // Lockdown mode doubles fire rate: allow fire every half-cooldown.
    const effectiveFireRange = tank.lockdownActive ? FIRE_RANGE * 1.5 : FIRE_RANGE;
    const reacted = state.reactionTimer >= reactionTime;
    if (dist < effectiveFireRange && tank.canFire() && reacted) {
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
  }

  // ── Ability decision logic ──────────────────────────────────────────────

  /**
   * Decide whether to use the given tank's ability right now.
   *
   * Tactical triggers per ability (VISION.md: "shields when taking fire,
   * jumps to reposition, barrages on clusters"):
   *   energyShield  — HP below defensive threshold.
   *   reactiveArmor — HP below defensive threshold.
   *   lockdownMode  — within fire range AND target is stationary-ish.
   *   rocketJump    — too close to an enemy (needs repositioning).
   *   barrage       — 2+ enemies clustered within CLUSTER_RADIUS.
   *   infernoBurst  — 2+ enemies within short range (≤ 20 units).
   *
   * Mode gate:
   *   'slow'     — 30% random chance on top of the trigger conditions.
   *   'tactical' — trigger conditions alone.
   *   'smart'    — trigger conditions alone (no extra delay, same as tactical
   *                for decision purposes; distinction is in react-speed which
   *                is handled via reactionTime in difficulty scaling).
   *
   * @param {string} mode        — 'slow'|'tactical'|'smart'
   * @param {import('../entities/Tank.js').Tank} tank
   * @param {import('../entities/Tank.js').Tank} target
   * @param {number} dist
   * @param {object} state
   * @param {import('../entities/Tank.js').Tank[]} allEnemies — opponents
   * @returns {boolean}
   */
  _shouldUseAbility(mode, tank, target, dist, state, allEnemies) {
    const hpFraction = tank.health / tank.maxHealth;
    const abilityId = tank.abilityId;
    let conditionMet = false;

    switch (abilityId) {
      case 'energyShield':
        // Use when HP drops below threshold AND not already shielded.
        conditionMet = hpFraction < ABILITY_DEFENSIVE_HP_THRESHOLD && !tank.shieldActive;
        break;

      case 'reactiveArmor':
        conditionMet = hpFraction < ABILITY_DEFENSIVE_HP_THRESHOLD && tank.armorBoost === 0;
        break;

      case 'lockdownMode':
        // Use when in firing range and not already locked down.
        conditionMet = dist < FIRE_RANGE && !tank.lockdownActive;
        break;

      case 'rocketJump':
        // Use when too close to an enemy (escape / reposition).
        conditionMet = dist < ROCKET_JUMP_TRIGGER_DIST;
        break;

      case 'barrage':
        // Use when 2+ enemies are clustered near the target.
        conditionMet = this._clusterCount(target.mesh.position, allEnemies) >= CLUSTER_MIN_TANKS;
        break;

      case 'infernoBurst':
        // Use when 2+ enemies are within short range of this tank.
        conditionMet =
          this._countNearby(tank.mesh.position, allEnemies, 20) >= CLUSTER_MIN_TANKS;
        break;

      default:
        // Unknown ability — never trigger.
        conditionMet = false;
        break;
    }

    if (!conditionMet) return false;

    // Mode gate: 'slow' has a random chance to hold off (simulates hesitation).
    if (mode === 'slow' && Math.random() > 0.30) return false;

    return true;
  }

  /**
   * Activate the given tank's ability and apply its effect.
   *
   * Effects implemented (t046 scope):
   *   energyShield  — sets tank.shieldActive = true for SHIELD_DURATION.
   *   reactiveArmor — sets tank.armorBoost for ARMOR_BOOST_DURATION.
   *   lockdownMode  — sets tank.lockdownActive = true for LOCKDOWN_DURATION
   *                   (AIController skips movement while active; fire range +50%).
   *   rocketJump    — teleports tank to a flanking position (20 units perpendicular).
   *   barrage       — fires 3 rapid projectiles in a spread toward the target cluster.
   *   infernoBurst  — fires 5 projectiles in a wide forward cone.
   *
   * After activation, resets abilityCooldownLeft to tank.abilityCooldown so
   * the ability cannot be used again until the cooldown expires.
   *
   * @param {import('../entities/Tank.js').Tank} tank
   * @param {import('../entities/Tank.js').Tank} target
   * @param {number} dist
   * @param {import('../entities/Tank.js').Tank[]} allEnemies
   * @param {object} state — per-tank AI state
   */
  _activateAbility(tank, target, dist, allEnemies, state) {
    const abilityId = tank.abilityId;

    switch (abilityId) {
      case 'energyShield':
        tank.shieldActive = true;
        state.abilityActiveTimeLeft = SHIELD_DURATION;
        break;

      case 'reactiveArmor':
        tank.armorBoost = ARMOR_BOOST_FRACTION;
        state.abilityActiveTimeLeft = ARMOR_BOOST_DURATION;
        break;

      case 'lockdownMode':
        tank.lockdownActive = true;
        state.abilityActiveTimeLeft = LOCKDOWN_DURATION;
        break;

      case 'rocketJump':
        this._doRocketJump(tank, target);
        // rocketJump has no sustained active period — just the teleport.
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

    // Reset cooldown so the ability can't be reused until the timer expires.
    state.abilityCooldownLeft = tank.abilityCooldown;
  }

  // ── Ability effect helpers ──────────────────────────────────────────────

  /**
   * Rocket Jump: teleport the tank 20 units perpendicular to its heading,
   * landing it in a flanking position away from the current threat.
   *
   * @param {import('../entities/Tank.js').Tank} tank
   * @param {import('../entities/Tank.js').Tank} target
   */
  _doRocketJump(tank, target) {
    const pos = tank.mesh.position;
    const toTarget = new THREE.Vector3(
      target.mesh.position.x - pos.x,
      0,
      target.mesh.position.z - pos.z
    ).normalize();

    // Perpendicular left to the direction toward the target.
    const perpendicular = new THREE.Vector3(-toTarget.z, 0, toTarget.x);
    // Randomise left or right flank.
    const side = Math.random() > 0.5 ? 1 : -1;
    const jumpDist = 20;

    const newX = THREE.MathUtils.clamp(
      pos.x + perpendicular.x * jumpDist * side, -ARENA_BOUND, ARENA_BOUND
    );
    const newZ = THREE.MathUtils.clamp(
      pos.z + perpendicular.z * jumpDist * side, -ARENA_BOUND, ARENA_BOUND
    );

    tank.mesh.position.set(newX, this.terrain.getHeightAt(newX, newZ), newZ);

    // Emit a small explosion burst at the landing site to signal the jump.
    this.particles.emitExplosion(
      tank.mesh.position.clone(),
      { count: 12, speed: 5, lifetime: 0.5 }
    );
  }

  /**
   * Barrage: fire three projectiles in a spread toward the target cluster.
   * Spread angles are -15°, 0°, +15° around the direct aim line.
   *
   * @param {import('../entities/Tank.js').Tank} tank
   * @param {import('../entities/Tank.js').Tank} target
   */
  _doBarrage(tank, target) {
    const SPREAD_ANGLES = [-0.26, 0, 0.26]; // radians (~15° each)
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
   * Inferno Burst: fire five projectiles in a wide forward cone (range ±40°).
   * Targets the nearest enemy position as the cone center.
   *
   * @param {import('../entities/Tank.js').Tank} tank
   * @param {import('../entities/Tank.js').Tank[]} allEnemies
   */
  _doInfernoBurst(tank, allEnemies) {
    const nearest = this._nearestTarget(tank.mesh.position, allEnemies);
    if (!nearest) return;

    const pos = tank.mesh.position;
    const baseAngle = Math.atan2(
      nearest.mesh.position.x - pos.x,
      nearest.mesh.position.z - pos.z
    );

    const CONE_ANGLES = [-0.70, -0.35, 0, 0.35, 0.70]; // radians (~20° steps)
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

  // ── Spatial helpers ──────────────────────────────────────────────────────

  /**
   * Count how many tanks in `candidates` are within `radius` of `center`.
   *
   * @param {THREE.Vector3} center
   * @param {import('../entities/Tank.js').Tank[]} candidates
   * @param {number} radius
   * @returns {number}
   */
  _countNearby(center, candidates, radius) {
    let count = 0;
    for (const t of candidates) {
      if (center.distanceTo(t.mesh.position) <= radius) count++;
    }
    return count;
  }

  /**
   * Count how many tanks in `candidates` are within CLUSTER_RADIUS of `center`.
   * Used to detect enemy clusters for barrage targeting.
   *
   * @param {THREE.Vector3} center
   * @param {import('../entities/Tank.js').Tank[]} candidates
   * @returns {number}
   */
  _clusterCount(center, candidates) {
    return this._countNearby(center, candidates, CLUSTER_RADIUS);
  }
}
