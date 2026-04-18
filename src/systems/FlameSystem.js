/**
 * FlameSystem — continuous cone damage + fire particle management for the Flame Tank.
 *
 * The Flame Tank does NOT fire discrete projectiles.  Instead, while
 * `tank.flameActive` is true the system:
 *   1. Emits fire particles every PARTICLE_INTERVAL seconds (visual stream).
 *   2. Applies tick damage every TICK_INTERVAL seconds to every living target
 *      inside the flame cone.
 *
 * Cone geometry:
 *   Half-angle : FLAME_CONE_HALF_ANGLE_RAD  (30° — wide enough to engulf groups)
 *   Range      : FLAME_RANGE (20 world-units — matches TankDefs.flameTank.range)
 *
 * Damage cadence (mirrors TankDefs.flameTank):
 *   FLAME_DAMAGE_PER_TICK = 18   (per-hit damage)
 *   FLAME_TICKS_PER_SEC   = 10   (continuous fireRate)
 *   → 180 HP/s sustained against a target with no armor at point-blank
 *
 * Collision detection: XZ-plane dot-product against the muzzle's world forward
 * vector.  Y-difference is ignored (terrain slope negligible at 20-unit range).
 *
 * Usage (Game.js):
 *   const flameSystem = new FlameSystem();
 *   // Inside game loop (each frame, while round is active):
 *   const events = flameSystem.update(dt, flamers, this.particles);
 *   // `events` is an array of { tank, target, damage, isPlayerOwned }
 *   // — process kills and stats from these events in Game.js.
 *   // On round reset:
 *   flameSystem.reset();
 *
 * Flamer entries (passed by Game.js):
 *   { tank: Tank, targets: Tank[], isPlayerOwned: boolean }
 *   Only entries where `tank.flameActive === true` are processed.
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Constants (mirror TankDefs.flameTank where applicable)
// ---------------------------------------------------------------------------

/** Half-angle of the flame cone in radians (~30°). */
const FLAME_CONE_HALF_ANGLE_RAD = Math.PI / 6;

/** Cosine of the half-angle — used for dot-product cone check. */
const FLAME_CONE_COS = Math.cos(FLAME_CONE_HALF_ANGLE_RAD);

/** Maximum range of the flamethrower in world units. */
const FLAME_RANGE = 20;

/** Damage applied to each target inside the cone per tick. */
const FLAME_DAMAGE_PER_TICK = 18;

/** Ticks per second (continuous fire rate from TankDefs.flameTank.fireRate). */
const FLAME_TICKS_PER_SEC = 10;

/** Seconds between damage ticks. */
const FLAME_TICK_INTERVAL = 1 / FLAME_TICKS_PER_SEC;

/** Flame particles emitted per second per active flame tank. */
const FLAME_PARTICLES_PER_SEC = 55;

/** Seconds between particle emissions. */
const FLAME_PARTICLE_INTERVAL = 1 / FLAME_PARTICLES_PER_SEC;

// ---------------------------------------------------------------------------
// FlameSystem
// ---------------------------------------------------------------------------

export class FlameSystem {
  constructor() {
    /**
     * Per-tank timing state.
     * Key: Tank instance.
     * Value: { tickTimer: number, particleTimer: number }
     * @type {Map<object, {tickTimer: number, particleTimer: number}>}
     */
    this._timers = new Map();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Advance all active flame tanks by dt seconds.
   *
   * @param {number} dt — seconds since last frame
   * @param {Array<{tank: object, targets: object[], isPlayerOwned: boolean}>} flamers
   *   Each entry describes one potential flame tank.  Only tanks with
   *   `tank.flameActive === true` are processed.  Targets must be an array of
   *   Tank instances (health > 0 check is done internally per tick).
   * @param {import('./ParticleSystem.js').ParticleSystem} particles
   *   Used for fire particle emission.
   * @returns {Array<{tank: object, target: object, damage: number, isPlayerOwned: boolean}>}
   *   Damage events produced this frame.  Each event represents one tick hit on
   *   one target.  Game.js uses these to update stats, process kills, and emit
   *   kill-feed messages.
   */
  update(dt, flamers, particles) {
    const events = [];

    for (const { tank, targets, isPlayerOwned } of flamers) {
      if (!tank.flameActive) continue;

      const timers = this._getTimers(tank);

      // Compute world-space fire direction from the muzzle Object3D.
      // muzzle's local -Z is the barrel forward; getWorldDirection gives world -Z.
      const fireDir = new THREE.Vector3();
      tank.muzzle.getWorldDirection(fireDir);

      const muzzlePos = new THREE.Vector3();
      tank.muzzle.getWorldPosition(muzzlePos);

      // ── Particle emission ──────────────────────────────────────────────────
      timers.particleTimer += dt;
      while (timers.particleTimer >= FLAME_PARTICLE_INTERVAL) {
        timers.particleTimer -= FLAME_PARTICLE_INTERVAL;
        particles.emitFlame(muzzlePos.clone(), fireDir.clone());
      }

      // ── Damage ticks ───────────────────────────────────────────────────────
      timers.tickTimer += dt;
      while (timers.tickTimer >= FLAME_TICK_INTERVAL) {
        timers.tickTimer -= FLAME_TICK_INTERVAL;
        this._applyTickDamage(tank, targets, fireDir, isPlayerOwned, events);
      }
    }

    return events;
  }

  /**
   * Reset per-tank timers between rounds.
   * Call this whenever the round resets so timers don't carry over.
   */
  reset() {
    this._timers.clear();
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Get (or lazily create) the per-tank timer state.
   * @private
   * @param {object} tank
   * @returns {{tickTimer: number, particleTimer: number}}
   */
  _getTimers(tank) {
    if (!this._timers.has(tank)) {
      this._timers.set(tank, { tickTimer: 0, particleTimer: 0 });
    }
    return this._timers.get(tank);
  }

  /**
   * Apply one damage tick to every target inside the flame cone.
   *
   * Cone test (XZ plane):
   *   Flatten both the fire direction and the to-target vector to Y=0, then
   *   dot-product.  If the result is ≥ FLAME_CONE_COS the target is inside
   *   the 30° half-angle cone.  Range is checked separately with a 3D distance
   *   so targets on higher terrain edges are still reachable.
   *
   * @private
   * @param {object} tank
   * @param {object[]} targets
   * @param {THREE.Vector3} fireDir — normalised world-space forward
   * @param {boolean} isPlayerOwned
   * @param {Array} events — mutable array to push damage events into
   */
  _applyTickDamage(tank, targets, fireDir, isPlayerOwned, events) {
    const tankPos = tank.mesh.position;

    // Flatten fire direction to XZ so terrain height doesn't bias the cone.
    const flatFire = new THREE.Vector3(fireDir.x, 0, fireDir.z).normalize();

    for (const target of targets) {
      if (target.health <= 0) continue;

      // Range check (3D distance)
      const dist = tankPos.distanceTo(target.mesh.position);
      if (dist > FLAME_RANGE) continue;

      // Cone check (XZ plane)
      const toTarget = new THREE.Vector3(
        target.mesh.position.x - tankPos.x,
        0,
        target.mesh.position.z - tankPos.z
      );

      // If the tank is right on top of the target, treat it as in-cone.
      const toTargetLen = toTarget.length();
      if (toTargetLen > 0.05) {
        toTarget.divideScalar(toTargetLen);
        if (flatFire.dot(toTarget) < FLAME_CONE_COS) continue; // outside cone
      }

      // Apply damage (scale by owning tank's damage multiplier)
      const rawDamage = FLAME_DAMAGE_PER_TICK * (tank.damageMultiplier || 1);
      const actualDamage = target.takeDamage(rawDamage);

      // Record damage on the owning tank for kill-credit and stats.
      if (typeof tank.recordDamage === 'function') {
        tank.recordDamage(actualDamage);
      }

      events.push({ tank, target, damage: actualDamage, isPlayerOwned });
    }
  }
}
