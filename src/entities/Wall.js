/**
 * LowWall — short destructible barrier / fence (t049).
 *
 * Geometry:
 *   A flat-shaded box, 0.85 u tall, with a configurable width and a thin
 *   depth (0.35 u) so it reads as a wall/fence rather than a pillar.
 *
 * Mechanics:
 *   - Tanks drive through (no tank push-back; StructureSystem.checkTankWallSmash
 *     destroys the wall on tank contact).
 *   - Projectiles deal damage; wall is removed when HP reaches 0.
 *   - `obstacle.radius` is zeroed on destruction so any collision lists that
 *     include walls (e.g. soldier push-back) automatically stop blocking.
 *
 * Collision:
 *   - Exposes `obstacle: { x, z, radius }` compatible with CollisionSystem's
 *     _resolveObstacleCollision() push-back.  Radius is half the wall's width.
 *   - For tanks the wall is NOT included in obstacle lists (tank drives through).
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Shared material
// ---------------------------------------------------------------------------

const _wallMat = new THREE.MeshStandardMaterial({
  color: 0xc0b090,    // light concrete / sandstone
  roughness: 1.0,
  flatShading: true,
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WALL_HEIGHT    = 0.85;    // short enough to shoot over from tank height
const WALL_THICKNESS = 0.35;
const WALL_HP        = 2;       // hits required to destroy

// ---------------------------------------------------------------------------
// LowWall
// ---------------------------------------------------------------------------

export class LowWall {
  /**
   * @param {THREE.Scene}                              scene
   * @param {number}                                   x       World X centre.
   * @param {number}                                   z       World Z centre.
   * @param {number}                                   width   Extent along local X (before rotY).
   * @param {number}                                   rotY    Y-axis rotation in radians.
   * @param {import('./Terrain.js').Terrain}           terrain
   */
  constructor(scene, x, z, width, rotY, terrain) {
    this._scene = scene;
    this.x      = x;
    this.z      = z;
    this.width  = width;

    const groundY = terrain.getHeightAt(x, z);

    /**
     * Obstacle record for CollisionSystem push-back.
     * Radius is half the wall width.  Zeroed when destroyed.
     * @type {{ x: number, z: number, radius: number }}
     */
    this.obstacle = { x, z, radius: width / 2 };

    this.hp     = WALL_HP;
    this._alive = true;

    const geo  = new THREE.BoxGeometry(width, WALL_HEIGHT, WALL_THICKNESS);
    this.mesh  = new THREE.Mesh(geo, _wallMat);
    this.mesh.position.set(x, groundY + WALL_HEIGHT / 2, z);
    this.mesh.rotation.y   = rotY;
    this.mesh.castShadow    = true;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** True while the wall has at least 1 HP remaining. */
  get alive() { return this._alive; }

  /**
   * Apply damage from a projectile or tank smash.
   * Returns true if this hit destroyed the wall.
   *
   * @param {number} damage
   * @returns {boolean}
   */
  takeDamage(damage) {
    if (!this._alive) return false;
    this.hp = Math.max(0, this.hp - damage);

    if (this.hp === 0) {
      this._alive          = false;
      this.obstacle.radius = 0;
      this._scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      return true;
    }

    return false;
  }

  /**
   * AABB broad-phase for projectile detection.
   * Uses a generous pad so shells clip the wall even when approaching at angles.
   *
   * @param {number} worldX
   * @param {number} worldZ
   * @returns {boolean}
   */
  containsPointXZ(worldX, worldZ) {
    const hw = this.width / 2 + 0.4;
    const hd = WALL_THICKNESS / 2 + 0.4;
    return (
      Math.abs(worldX - this.x) <= hw &&
      Math.abs(worldZ - this.z) <= hd
    );
  }
}
