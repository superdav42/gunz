/**
 * Tree — a destructible scenery entity.
 *
 * Each tree has 3 HP. Player shells deal 1 damage per hit; three hits
 * fell the tree, removing it from the scene. The obstacle entry is kept
 * on the TreeSystem's alive array so CollisionSystem can skip dead trees.
 *
 * Geometry is shared across all instances to minimise GPU upload cost.
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Shared geometries and materials (module-level singletons)
// ---------------------------------------------------------------------------

const _trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 2, 6);
const _trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e });

const _canopyGeo = new THREE.ConeGeometry(1.5, 4, 6);
const _canopyMat = new THREE.MeshStandardMaterial({
  color: 0x2d5a27,
  flatShading: true,
});

// ---------------------------------------------------------------------------
// Tree
// ---------------------------------------------------------------------------

export class Tree {
  /**
   * @param {THREE.Scene} scene
   * @param {number}      x       World X position.
   * @param {number}      z       World Z position.
   * @param {number}      groundY Terrain height at (x, z).
   */
  constructor(scene, x, z, groundY) {
    this._scene = scene;

    /** World X — used by CollisionSystem for push-back. */
    this.x = x;
    /** World Z — used by CollisionSystem for push-back. */
    this.z = z;
    /** Collision radius (matches ConeGeometry base radius). */
    this.radius = 1.5;
    /** Current hit-points. */
    this.hp = 3;
    /** Maximum hit-points (for UI or future use). */
    this.maxHp = 3;
    /** False once hp reaches 0 and the mesh has been removed. */
    this.alive = true;

    // Build the Three.js group
    this.group = new THREE.Group();

    const trunk = new THREE.Mesh(_trunkGeo, _trunkMat);
    trunk.position.y = 1;
    trunk.castShadow = true;
    this.group.add(trunk);

    const canopy = new THREE.Mesh(_canopyGeo, _canopyMat);
    canopy.position.y = 4;
    canopy.castShadow = true;
    this.group.add(canopy);

    this.group.position.set(x, groundY, z);
    scene.add(this.group);
  }

  /**
   * Apply damage.  Returns true on the hit that reduces HP to 0 (destruction).
   *
   * @param {number} amount
   * @returns {boolean} True if the tree was just destroyed.
   */
  takeDamage(amount) {
    if (!this.alive) return false;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp === 0) {
      this.alive = false;
      this._scene.remove(this.group);
      return true;
    }
    return false;
  }

  /**
   * Force-remove the mesh without damage logic (used by reset).
   */
  destroy() {
    this.hp = 0;
    this.alive = false;
    this._scene.remove(this.group);
  }
}
