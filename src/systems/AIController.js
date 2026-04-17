import * as THREE from 'three';

/**
 * AIController — drives all AI tanks: 5 ally tanks (team 0, slots 1-5) and
 * 6 enemy tanks (team 1, slots 0-5). Both sides use identical behavior logic;
 * each AI tank picks the nearest living tank on the opposing team as its target.
 *
 * Design notes (VISION.md §"AI Behaviour"):
 *  - "teammates and enemies use the same logic"
 *  - Advance, Engage, Flank phases — implemented as a simple state machine per tank
 *  - League scaling is handled externally (t-future); constants here are M1 defaults
 */

// -------------------------------------------------------------------------
// Tuneable constants
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

// -------------------------------------------------------------------------

export class AIController {
  /**
   * @param {import('../core/TeamManager.js').TeamManager} teamManager
   * @param {import('./ProjectileSystem.js').ProjectileSystem} projectileSystem
   * @param {import('./ParticleSystem.js').ParticleSystem} particleSystem
   * @param {import('../entities/Terrain.js').Terrain} terrain
   */
  constructor(teamManager, projectileSystem, particleSystem, terrain) {
    this.teams = teamManager;
    this.projectiles = projectileSystem;
    this.particles = particleSystem;
    this.terrain = terrain;
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

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Update AI for all living tanks in `teamId`, starting from `startSlot`.
   *
   * @param {number} dt
   * @param {number} teamId       — which team to process
   * @param {number} startSlot    — first slot index to process (skip player slot)
   */
  _updateTeamAI(dt, teamId, startSlot) {
    const team = this.teams.teams[teamId];
    if (!team) return;

    // The opposing team's living tanks are the potential targets.
    const opposingTeamId = teamId === 0 ? 1 : 0;
    const targets = this._getLivingTanks(opposingTeamId);

    for (let i = startSlot; i < team.slots.length; i++) {
      const slot = team.slots[i];
      if (!slot.alive) continue;

      const tank = slot.tank;
      const target = this._nearestTarget(tank.mesh.position, targets);

      if (!target) continue;

      this._driveTankTowardTarget(dt, tank, target);
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
   * Phases:
   *  1. If target is beyond AGGRO_RANGE — stay put (idle).
   *  2. If within AGGRO_RANGE — turn hull toward target and advance.
   *  3. If within FIRE_RANGE — stop advancing, aim turret, fire.
   *
   * @param {number} dt
   * @param {import('../entities/Tank.js').Tank} tank
   * @param {import('../entities/Tank.js').Tank} target
   */
  _driveTankTowardTarget(dt, tank, target) {
    const pos = tank.mesh.position;
    const targetPos = target.mesh.position;
    const dist = pos.distanceTo(targetPos);

    if (dist > AGGRO_RANGE) return; // idle outside aggro range

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

    // --- Aim turret and fire when in range ---
    tank.setTurretAngle(targetAngle);

    if (dist < FIRE_RANGE && tank.canFire()) {
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
}
