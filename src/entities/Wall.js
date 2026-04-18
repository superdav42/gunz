/**
 * Wall — a low destructible barrier providing infantry cover.
 *
 * Gameplay behaviour per VISION.md:
 *  "Walls / fences — Low cover for infantry. Tanks drive through."
 *
 *  - Infantry cover: the wall is ~0.9 units tall (crouching-soldier height).
 *  - Tank contact: when a tank's collision circle overlaps the wall's OBB,
 *    the wall is instantly destroyed (tank drives through it).  The tank is
 *    NOT pushed back — it passes through freely.
 *  - Projectile hit: any shell that intersects the OBB consumes the projectile
 *    and deals full damage.  A single tank-cannon shell (25 dmg, wall HP = 2)
 *    destroys the wall.
 *  - Destroyed wall: mesh removed; no residual obstacle.
 *
 * Geometry (all in local space, rotated by `rotY`):
 *  - Wall body: BoxGeometry(length × height × thickness)
 *    local X = along the wall (long axis),  local Z = through the wall (thin)
 *  - Cap stone: slightly wider flat box on top for visual detail
 *
 * Collision (OBB in XZ):
 *  - halfLength    = length / 2         (local X half-extent — long axis)
 *  - halfThickness = WALL_THICKNESS / 2 (local Z half-extent — short axis)
 *
 * @module entities/Wall
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WALL_HEIGHT    = 0.9;
const WALL_THICKNESS = 0.5;

// ---------------------------------------------------------------------------
// Shared materials
// ---------------------------------------------------------------------------

const _wallMat = new THREE.MeshStandardMaterial({
  color: 0xb8a88a,   // sandy stone
  roughness: 0.95,
  metalness: 0.0,
  flatShading: true,
});

const _capMat = new THREE.MeshStandardMaterial({
  color: 0xd0c09a,   // lighter cap stones
  roughness: 0.9,
  metalness: 0.0,
  flatShading: true,
});

// ---------------------------------------------------------------------------
// Wall
// ---------------------------------------------------------------------------

export class Wall {
  /**
   * @param {THREE.Scene} scene
   * @param {number}      x        World X of wall segment centre.
   * @param {number}      z        World Z of wall segment centre.
   * @param {number}      groundY  Terrain height at (x, z).
   * @param {number}      [rotY=0] Rotation around Y axis in radians.
   *   rotY = 0        → wall long-axis runs along world X (E–W wall).
   *   rotY = Math.PI/2 → wall long-axis runs along world Z (N–S wall).
   * @param {number}      [length=4] Length of the wall segment (local X).
   */
  constructor(scene, x, z, groundY, rotY = 0, length = 4) {
    this._scene  = scene;
    this.x       = x;
    this.z       = z;
    this.groundY = groundY;
    this.rotY    = rotY;
    this.length  = length;

    this.maxHp = 2;
    this.hp    = this.maxHp;
    /** True while the wall is standing and collidable. */
    this.alive = true;

    /** Half the long axis (local X). Used for OBB collision. */
    this.halfLength    = length / 2;
    /**
     * Half the wall thickness (local Z).  Used for OBB collision.
     * Inflated slightly beyond the visual half (0.25) so fast projectiles
     * (50 u/s) don't tunnel through the thin wall face in a single frame.
     */
    this.halfThickness = 1.0;

    this.group = new THREE.Group();
    this._buildMesh();
    scene.add(this.group);
  }

  // ---------------------------------------------------------------------------
  // Mesh construction
  // ---------------------------------------------------------------------------

  _buildMesh() {
    const L = this.length;
    const H = WALL_HEIGHT;
    const T = WALL_THICKNESS;

    // --- Main wall body ---
    const wallGeo  = new THREE.BoxGeometry(L, H, T);
    const wallMesh = new THREE.Mesh(wallGeo, _wallMat);
    wallMesh.position.y   = H / 2;
    wallMesh.castShadow   = true;
    wallMesh.receiveShadow = true;
    this.group.add(wallMesh);

    // --- Cap stones on top ---
    const capGeo  = new THREE.BoxGeometry(L + 0.1, 0.12, T + 0.1);
    const capMesh = new THREE.Mesh(capGeo, _capMat);
    capMesh.position.y = H + 0.06;
    capMesh.castShadow = true;
    this.group.add(capMesh);

    this.group.position.set(this.x, this.groundY, this.z);
    this.group.rotation.y = this.rotY;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Apply damage from a projectile hit.
   * @param {number} amount
   * @returns {boolean} `true` if this hit destroyed the wall.
   */
  takeDamage(amount) {
    if (!this.alive) return false;

    this.hp = Math.max(0, this.hp - amount);

    if (this.hp <= 0) {
      this._destroyVisual();
      return true;
    }
    return false;
  }

  /**
   * Force-destroy without damage logic (tank contact or round reset).
   * Removes mesh from the scene.
   */
  destroy() {
    if (!this.alive) return;
    this.hp = 0;
    this._destroyVisual();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  _destroyVisual() {
    this.alive = false;
    this._scene.remove(this.group);
  }
}
