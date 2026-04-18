/**
 * ParticleSystem — pool-based particle emitter for Three.js.
 *
 * All particles share a single BoxGeometry. Each particle owns its own
 * MeshBasicMaterial so color and opacity can vary per particle without
 * lighting overhead. The pool avoids allocations at runtime: particles
 * are acquired from a free-list and returned on death.
 *
 * Supported effects:
 *   emitExplosion(position, opts)   — burst of fire/smoke on tank/shell impact
 *   emitMuzzleFlash(position, dir)  — brief flash cone at barrel tip on fire
 *   emitDust(position)              — rising dirt puff behind moving tracks
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POOL_SIZE = 300;

// Shared geometry — all particles are scaled cubes.
const _GEO = new THREE.BoxGeometry(0.25, 0.25, 0.25);

// ---------------------------------------------------------------------------
// ParticleSystem
// ---------------------------------------------------------------------------

export class ParticleSystem {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;

    /** @type {Array<ParticleData>} complete pool */
    this._pool = [];
    /** @type {number[]} indices of free (inactive) particles */
    this._free = [];
    /** @type {number[]} indices of active (alive) particles */
    this._active = [];

    this._buildPool();
  }

  // -------------------------------------------------------------------------
  // Pool management
  // -------------------------------------------------------------------------

  _buildPool() {
    for (let i = 0; i < POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(_GEO, mat);
      mesh.frustumCulled = false; // particles move fast; skip frustum test

      this._pool.push({
        mesh,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        /** Remaining lifetime in seconds */
        life: 0,
        /** Total lifetime (for interpolation) */
        maxLife: 1,
        colorStart: new THREE.Color(),
        colorEnd: new THREE.Color(),
        /** Scale at birth */
        startScale: 1,
        /** Gravity acceleration (positive = downward) */
        gravity: 0,
      });

      this._free.push(i);
    }
  }

  /**
   * Acquire one particle from the free list.
   * Returns the particle object or null if the pool is exhausted.
   * @returns {ParticleData|null}
   */
  _acquire() {
    if (this._free.length === 0) return null;
    const idx = this._free.pop();
    this._active.push(idx);
    const p = this._pool[idx];
    this.scene.add(p.mesh);
    return p;
  }

  // -------------------------------------------------------------------------
  // Public emit API
  // -------------------------------------------------------------------------

  /**
   * Emit an explosion burst — fire, sparks, and dark smoke.
   *
   * @param {THREE.Vector3} position  World-space center of explosion.
   * @param {object}        [opts]
   * @param {number}        [opts.count=25]    Particle count.
   * @param {number}        [opts.speed=8]     Average launch speed (m/s).
   * @param {number}        [opts.lifetime=0.9] Max particle lifetime (s).
   */
  emitExplosion(position, opts = {}) {
    const count = opts.count ?? 25;
    const speed = opts.speed ?? 8;
    const lifetime = opts.lifetime ?? 0.9;

    for (let i = 0; i < count; i++) {
      const p = this._acquire();
      if (!p) return;

      // Random spherical direction with upward bias
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const spd = speed * (0.4 + Math.random() * 0.6);

      p.velocity.set(
        Math.sin(phi) * Math.cos(theta) * spd,
        Math.abs(Math.cos(phi)) * spd + 2,
        Math.sin(phi) * Math.sin(theta) * spd
      );

      p.position.copy(position);
      p.life = lifetime * (0.6 + Math.random() * 0.4);
      p.maxLife = p.life;
      p.gravity = 5;

      // Color palette — orange/yellow core → gray/black smoke
      const r = Math.random();
      if (r < 0.35) {
        p.colorStart.setHex(0xff6600);
        p.colorEnd.setHex(0x222222);
      } else if (r < 0.65) {
        p.colorStart.setHex(0xffcc00);
        p.colorEnd.setHex(0x555555);
      } else {
        p.colorStart.setHex(0xff3300);
        p.colorEnd.setHex(0x111111);
      }

      p.startScale = 0.4 + Math.random() * 0.5;

      // Initialise mesh state
      p.mesh.material.color.copy(p.colorStart);
      p.mesh.material.opacity = 1;
      p.mesh.scale.setScalar(p.startScale);
      p.mesh.position.copy(position);
    }
  }

  /**
   * Emit muzzle-flash particles.
   *
   * @param {THREE.Vector3} position  World-space muzzle tip.
   * @param {THREE.Vector3} direction Normalised fire direction.
   */
  emitMuzzleFlash(position, direction) {
    const count = 6;
    for (let i = 0; i < count; i++) {
      const p = this._acquire();
      if (!p) return;

      const spread = 0.4;
      p.velocity
        .set(
          direction.x + (Math.random() - 0.5) * spread,
          direction.y + (Math.random() - 0.5) * spread * 0.5,
          direction.z + (Math.random() - 0.5) * spread
        )
        .normalize()
        .multiplyScalar(6 + Math.random() * 6);

      p.position.copy(position);
      p.life = 0.06 + Math.random() * 0.06;
      p.maxLife = p.life;
      p.colorStart.setHex(0xffffff);
      p.colorEnd.setHex(0xff8800);
      p.startScale = 0.15 + Math.random() * 0.2;
      p.gravity = 0;

      p.mesh.material.color.copy(p.colorStart);
      p.mesh.material.opacity = 1;
      p.mesh.scale.setScalar(p.startScale);
      p.mesh.position.copy(position);
    }
  }

  /**
   * Emit a small dust puff at a tank's track position.
   * Call periodically (every ~0.15 s) while the tank is moving.
   *
   * @param {THREE.Vector3} position  World-space tank position.
   */
  emitDust(position) {
    const count = 2;
    for (let i = 0; i < count; i++) {
      const p = this._acquire();
      if (!p) return;

      p.velocity.set(
        (Math.random() - 0.5) * 2,
        0.8 + Math.random(),
        (Math.random() - 0.5) * 2
      );

      // Spawn near track edges, on the ground
      p.position.set(
        position.x + (Math.random() - 0.5) * 3,
        position.y,
        position.z + (Math.random() - 0.5) * 2
      );
      p.life = 0.5 + Math.random() * 0.4;
      p.maxLife = p.life;
      p.colorStart.setHex(0xc8a87a); // sandy dirt
      p.colorEnd.setHex(0xc8a87a);
      p.startScale = 0.15 + Math.random() * 0.15;
      p.gravity = -1; // rises gently

      p.mesh.material.color.copy(p.colorStart);
      p.mesh.material.opacity = 0.6;
      p.mesh.scale.setScalar(p.startScale);
      p.mesh.position.copy(p.position);
    }
  }

  /**
   * Emit debris when a tree is destroyed by a shell.
   * Spawns two batches:
   *   - Wood splinters (dark brown) that tumble outward with gravity
   *   - Leaf fragments (green) that drift upward and fade slowly
   *
   * @param {THREE.Vector3} position  World-space position of the destroyed tree.
   */
  emitTreeDebris(position) {
    // Wood splinter burst
    const woodCount = 18;
    for (let i = 0; i < woodCount; i++) {
      const p = this._acquire();
      if (!p) break;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.7; // mostly upward-outward
      const spd = 4 + Math.random() * 7;

      p.velocity.set(
        Math.sin(phi) * Math.cos(theta) * spd,
        Math.abs(Math.cos(phi)) * spd + 1.5,
        Math.sin(phi) * Math.sin(theta) * spd
      );

      p.position.copy(position).add({ x: 0, y: 1.5, z: 0 }); // mid-trunk height
      p.life = 0.6 + Math.random() * 0.5;
      p.maxLife = p.life;
      p.gravity = 9;
      p.colorStart.setHex(0x5c3a1e); // wood brown
      p.colorEnd.setHex(0x3d2510);
      p.startScale = 0.2 + Math.random() * 0.25;

      p.mesh.material.color.copy(p.colorStart);
      p.mesh.material.opacity = 1;
      p.mesh.scale.setScalar(p.startScale);
      p.mesh.position.copy(p.position);
    }

    // Leaf fragment drift
    const leafCount = 14;
    for (let i = 0; i < leafCount; i++) {
      const p = this._acquire();
      if (!p) break;

      p.velocity.set(
        (Math.random() - 0.5) * 5,
        2 + Math.random() * 3,
        (Math.random() - 0.5) * 5
      );

      // Spawn at canopy height (base + 4 units)
      p.position.copy(position).add({
        x: (Math.random() - 0.5) * 2,
        y: 4 + Math.random() * 2,
        z: (Math.random() - 0.5) * 2,
      });
      p.life = 0.9 + Math.random() * 0.6;
      p.maxLife = p.life;
      p.gravity = 2;
      p.colorStart.setHex(0x2d5a27); // canopy green
      p.colorEnd.setHex(0x4a7a3b);
      p.startScale = 0.15 + Math.random() * 0.2;

      p.mesh.material.color.copy(p.colorStart);
      p.mesh.material.opacity = 0.9;
      p.mesh.scale.setScalar(p.startScale);
      p.mesh.position.copy(p.position);
    }
  }

  /**
   * Emit a burst of fire particles for the Flame Tank weapon (t039).
   *
   * Particles travel forward within a ~30° half-angle cone from the nozzle.
   * Called at ~10 Hz (once per fire tick) so the particle density is
   * calibrated for that rate — not every frame.
   *
   * @param {THREE.Vector3} position  World-space nozzle tip.
   * @param {THREE.Vector3} direction Normalised forward direction of the nozzle.
   */
  emitFlame(position, direction) {
    const count = 10;
    // Perpendicular axes for cone spread (arbitrary; works for any direction).
    const up = Math.abs(direction.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
    const right = new THREE.Vector3().crossVectors(direction, up).normalize();
    const realUp  = new THREE.Vector3().crossVectors(right, direction).normalize();

    for (let i = 0; i < count; i++) {
      const p = this._acquire();
      if (!p) return;

      // Random angle within 30° half-angle cone
      const spreadAngle = (Math.random() * Math.PI) / 6; // 0–30°
      const rollAngle   = Math.random() * Math.PI * 2;
      const sinSpread   = Math.sin(spreadAngle);
      const cosSpread   = Math.cos(spreadAngle);

      const speed = 14 + Math.random() * 10; // fast, flame-like
      p.velocity.set(
        (direction.x * cosSpread
          + (right.x * Math.cos(rollAngle) + realUp.x * Math.sin(rollAngle)) * sinSpread) * speed,
        (direction.y * cosSpread
          + (right.y * Math.cos(rollAngle) + realUp.y * Math.sin(rollAngle)) * sinSpread) * speed,
        (direction.z * cosSpread
          + (right.z * Math.cos(rollAngle) + realUp.z * Math.sin(rollAngle)) * sinSpread) * speed,
      );

      // Spawn slightly ahead of nozzle so particles don't clip the barrel
      p.position.set(
        position.x + direction.x * 0.4,
        position.y + direction.y * 0.4,
        position.z + direction.z * 0.4,
      );

      p.life    = 0.25 + Math.random() * 0.20; // short — flame dissipates fast
      p.maxLife = p.life;
      p.gravity = 1.5; // slight upward curl cancels with velocity Y; net = gentle rise

      // Colour palette: bright yellow core → orange → dark red smoke
      const r = Math.random();
      if (r < 0.30) {
        p.colorStart.setHex(0xffee00); // yellow-white core
        p.colorEnd.setHex(0xff4400);
      } else if (r < 0.70) {
        p.colorStart.setHex(0xff8800); // orange mid
        p.colorEnd.setHex(0x881100);
      } else {
        p.colorStart.setHex(0xff3300); // deep red outer
        p.colorEnd.setHex(0x330000);
      }

      p.startScale = 0.20 + Math.random() * 0.20;

      p.mesh.material.color.copy(p.colorStart);
      p.mesh.material.opacity = 0.85 + Math.random() * 0.15;
      p.mesh.scale.setScalar(p.startScale);
      p.mesh.position.copy(p.position);
    }
  }

  // -------------------------------------------------------------------------
  // Per-frame update
  // -------------------------------------------------------------------------

  /**
   * Advance all active particles by dt seconds.
   * Dead particles are returned to the free list.
   *
   * @param {number} dt Delta time in seconds.
   */
  update(dt) {
    for (let i = this._active.length - 1; i >= 0; i--) {
      const idx = this._active[i];
      const p = this._pool[idx];

      p.life -= dt;

      if (p.life <= 0) {
        // Return to pool
        this.scene.remove(p.mesh);
        this._free.push(idx);
        this._active.splice(i, 1);
        continue;
      }

      // Physics
      p.velocity.y -= p.gravity * dt;
      p.position.addScaledVector(p.velocity, dt);
      p.mesh.position.copy(p.position);

      // Lifecycle fraction: 0 = birth, 1 = death
      const t = 1 - p.life / p.maxLife;

      // Interpolate colour and opacity
      p.mesh.material.color.lerpColors(p.colorStart, p.colorEnd, t);
      p.mesh.material.opacity = 1 - t;

      // Shrink toward zero
      p.mesh.scale.setScalar(Math.max(0.001, p.startScale * (1 - t * 0.8)));
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Remove all active particles from the scene and reset the pool.
   * Call this on round reset / game restart.
   */
  reset() {
    for (const idx of this._active) {
      this.scene.remove(this._pool[idx].mesh);
      this._free.push(idx);
    }
    this._active.length = 0;
  }
}

// ---------------------------------------------------------------------------
// JSDoc typedef (no runtime cost)
// ---------------------------------------------------------------------------

/**
 * @typedef {object} ParticleData
 * @property {THREE.Mesh}    mesh
 * @property {THREE.Vector3} position
 * @property {THREE.Vector3} velocity
 * @property {number}        life
 * @property {number}        maxLife
 * @property {THREE.Color}   colorStart
 * @property {THREE.Color}   colorEnd
 * @property {number}        startScale
 * @property {number}        gravity
 */
