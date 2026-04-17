import * as THREE from 'three';
import { TankWreck } from '../entities/TankWreck.js';

/**
 * WreckSystem — manages TankWreck props on the battlefield.
 *
 * Two categories of wreck are tracked separately:
 *
 *  - Static wrecks: pre-placed at map initialisation via `spawnInitial()`.
 *    These represent old battle debris scattered around the field before the
 *    current match starts.  They persist across round resets so the map always
 *    has cover regardless of how few tanks have been destroyed this match.
 *
 *  - Dynamic wrecks: spawned in-game when a tank is demolished (via `add()`).
 *    These are cleared between rounds via `reset()` so the field starts clean.
 *
 * Both categories contribute to `obstacles` — CollisionSystem uses this array
 * to block live tanks and absorb projectiles against all wreck meshes.
 *
 * A soft cap (MAX_DYNAMIC_WRECKS) prevents unbounded scene growth in long
 * sessions; the oldest dynamic wreck is silently culled when the cap is reached.
 */
const MAX_DYNAMIC_WRECKS = 24;

/**
 * Pre-placed wreck positions: [x, z, rotationY].
 *
 * Positions are chosen to provide mid-field tactical cover without blocking
 * spawn lanes.  Spawn zones: Team 0 at z ≈ +55 (south), Team 1 at z ≈ −55
 * (north).  Wrecks are concentrated in the −40 < z < +40 combat envelope.
 *
 * Eight wrecks give meaningful cover without cluttering the field:
 *   - A central cluster of two (offset so players cannot camp a single spot)
 *   - Left and right flank cover positions
 *   - Forward and rear mid-field hulks
 */
const STATIC_WRECK_DEFS = [
  // Central cluster — offset so they do not perfectly align into a wall
  [  3,   4, 0.3 ],
  [ -5,  -2, 2.1 ],

  // Left flank corridor
  [ -28, -18, 1.0 ],
  [ -22,  20, 3.8 ],

  // Right flank corridor
  [  28, -15, 0.7 ],
  [  24,  22, 4.5 ],

  // Deep mid — forward and rear of centre
  [ -10, -35, 1.6 ],
  [  12,  30, 5.0 ],
];

export class WreckSystem {
  /**
   * @param {import('three').Scene} scene
   */
  constructor(scene) {
    this.scene = scene;

    /** @type {TankWreck[]} Pre-placed wrecks — not cleared on round reset. */
    this._staticWrecks = [];

    /** @type {TankWreck[]} In-game kill wrecks — cleared on round reset. */
    this._dynamicWrecks = [];
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Spawn pre-placed wreck props at the positions defined in STATIC_WRECK_DEFS.
   * Must be called once after WreckSystem construction and before the first
   * round begins.  Calling it a second time will add duplicate wrecks.
   *
   * @param {import('../entities/Terrain.js').Terrain} terrain
   *   Used to sample ground height so wrecks sit flush on the terrain.
   */
  spawnInitial(terrain) {
    for (const [x, z, ry] of STATIC_WRECK_DEFS) {
      const y = terrain.getHeightAt(x, z);
      const pos = new THREE.Vector3(x, y, z);
      const wreck = new TankWreck(pos, ry);
      this.scene.add(wreck.mesh);
      this._staticWrecks.push(wreck);
    }
  }

  /**
   * Spawn a new dynamic wreck at the given world position with the given yaw.
   * Called by Game when a tank is demolished during a round.
   *
   * @param {import('three').Vector3} position
   * @param {number} rotationY Hull yaw in radians.
   */
  add(position, rotationY = 0) {
    if (this._dynamicWrecks.length >= MAX_DYNAMIC_WRECKS) {
      // Cull the oldest dynamic wreck to keep scene size bounded
      const oldest = this._dynamicWrecks.shift();
      this.scene.remove(oldest.mesh);
    }

    const wreck = new TankWreck(position, rotationY);
    this.scene.add(wreck.mesh);
    this._dynamicWrecks.push(wreck);
  }

  /**
   * Returns a lightweight obstacle descriptor for every wreck (static and
   * dynamic), suitable for CollisionSystem.  A fresh array is built each call
   * so the caller always sees the current snapshot.
   *
   * @returns {Array<{x: number, z: number, radius: number}>}
   */
  get obstacles() {
    const toDesc = (w) => ({
      x: w.mesh.position.x,
      z: w.mesh.position.z,
      radius: w.collisionRadius,
    });
    return [
      ...this._staticWrecks.map(toDesc),
      ...this._dynamicWrecks.map(toDesc),
    ];
  }

  /**
   * Remove all *dynamic* wrecks from the scene (called on round reset).
   * Static (pre-placed) wrecks are intentionally preserved — they are part
   * of the map, not of the current round's state.
   */
  reset() {
    for (const w of this._dynamicWrecks) {
      this.scene.remove(w.mesh);
    }
    this._dynamicWrecks.length = 0;
  }
}
