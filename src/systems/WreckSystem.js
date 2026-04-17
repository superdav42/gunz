import { TankWreck } from '../entities/TankWreck.js';

/**
 * WreckSystem — manages TankWreck props on the battlefield.
 *
 * When a tank is demolished, Game calls `add()` with the killed tank's
 * position and yaw.  The wreck mesh is added to the scene and registered
 * as an obstacle that CollisionSystem uses to block both live tanks and
 * projectiles from passing through.
 *
 * A soft cap (MAX_WRECKS) prevents unbounded scene growth in long sessions;
 * the oldest wreck is silently culled when the cap is reached.
 */
const MAX_WRECKS = 24;

export class WreckSystem {
  /**
   * @param {import('three').Scene} scene
   */
  constructor(scene) {
    this.scene = scene;

    /** @type {TankWreck[]} */
    this._wrecks = [];
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Spawn a new wreck at the given world position with the given yaw.
   *
   * @param {import('three').Vector3} position
   * @param {number} rotationY Hull yaw in radians.
   */
  add(position, rotationY = 0) {
    if (this._wrecks.length >= MAX_WRECKS) {
      // Cull the oldest wreck to keep scene size bounded
      const oldest = this._wrecks.shift();
      this.scene.remove(oldest.mesh);
    }

    const wreck = new TankWreck(position, rotationY);
    this.scene.add(wreck.mesh);
    this._wrecks.push(wreck);
  }

  /**
   * Returns a lightweight obstacle descriptor for each live wreck, suitable
   * for CollisionSystem.  A fresh array is built each call so the caller
   * always sees the current snapshot.
   *
   * @returns {Array<{x: number, z: number, radius: number}>}
   */
  get obstacles() {
    return this._wrecks.map((w) => ({
      x: w.mesh.position.x,
      z: w.mesh.position.z,
      radius: w.collisionRadius,
    }));
  }

  /**
   * Remove all wrecks from the scene (called on round reset).
   */
  reset() {
    for (const w of this._wrecks) {
      this.scene.remove(w.mesh);
    }
    this._wrecks.length = 0;
  }
}
