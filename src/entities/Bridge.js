/**
 * Bridge — a destructible map structure spanning a low terrain area.
 *
 * Gameplay behaviour:
 *  - Intact bridge: absorbs projectile hits, takes damage.  Tanks pass freely
 *    through the bridge zone (the deck sits at terrain level, so terrain-following
 *    Y-snapping still works).
 *  - Damaged bridge (HP ≤ 50 %): visual appearance darkens.
 *  - Destroyed bridge (HP = 0): deck collapses (tilts, darkens); railings hide.
 *    Four rubble-circle obstacles are spawned at world positions along the span
 *    so CollisionSystem can block tanks from passing through the rubble.
 *
 * Geometry (all in local space, rotated by `rotY` when added to scene):
 *  - Deck: BoxGeometry(deckWidth × 0.6 × deckLength)  — local X = across, local Z = along
 *  - Two railings: long thin boxes on ±X edges
 *  - Two cross-braces: wide flat boxes at ±Z ends (supports)
 *
 * Collision (OBB in XZ):
 *  - halfWidth  = deckWidth  / 2   (local X extent)
 *  - halfSpan   = deckLength / 2   (local Z extent)
 *  - radius     = sqrt(halfWidth² + halfSpan²)  — fast pre-check distance
 *
 * @module entities/Bridge
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Shared materials (module-level singletons to avoid repeated GPU allocation)
// ---------------------------------------------------------------------------

const _deckMat = new THREE.MeshStandardMaterial({
  color: 0x8b7355,   // weathered wood
  roughness: 0.9,
  metalness: 0.0,
  flatShading: true,
});

const _pillarMat = new THREE.MeshStandardMaterial({
  color: 0x7a7870,   // aged concrete
  roughness: 0.85,
  metalness: 0.05,
  flatShading: true,
});

const _damagedMat = new THREE.MeshStandardMaterial({
  color: 0x3e2800,   // charred / collapsed wood
  roughness: 1.0,
  metalness: 0.0,
  flatShading: true,
});

// ---------------------------------------------------------------------------
// Bridge
// ---------------------------------------------------------------------------

export class Bridge {
  /**
   * @param {THREE.Scene} scene
   * @param {number}      x        World X of bridge centre.
   * @param {number}      z        World Z of bridge centre.
   * @param {number}      groundY  Terrain height at (x, z).
   * @param {number}      [rotY=0] Rotation around Y axis in radians.
   *   rotY = 0        → bridge deck spans along world Z (N–S crossing).
   *   rotY = Math.PI/2 → bridge deck spans along world X (E–W crossing).
   * @param {number}      [deckWidth=8]   Width of the bridge deck (local X).
   * @param {number}      [deckLength=18] Span of the bridge (local Z).
   */
  constructor(scene, x, z, groundY, rotY = 0, deckWidth = 8, deckLength = 18) {
    this._scene  = scene;
    this.x       = x;
    this.z       = z;
    this.groundY = groundY;
    this.rotY    = rotY;

    this.deckWidth  = deckWidth;
    this.deckLength = deckLength;

    this.maxHp = 6;
    this.hp    = this.maxHp;
    /** True while HP > 0 and the bridge has not yet collapsed. */
    this.alive = true;

    /** Half the deck width  (local X extent). Used for OBB hit checks. */
    this.halfWidth = deckWidth  / 2;
    /** Half the span length (local Z extent). Used for OBB hit checks. */
    this.halfSpan  = deckLength / 2;
    /**
     * Circumradius for fast pre-check: shell must be within this distance of
     * the bridge centre before the full OBB test runs.
     */
    this.radius = Math.sqrt(this.halfWidth * this.halfWidth + this.halfSpan * this.halfSpan);

    /**
     * Circular obstacle descriptors spawned when the bridge collapses.
     * Format matches WreckSystem / CollisionSystem obstacle arrays:
     *   { x: number, z: number, radius: number }
     * Empty while alive; populated by _collapse().
     * @type {Array<{x: number, z: number, radius: number}>}
     */
    this.rubbleObstacles = [];

    /** Reference to the main deck mesh (mutated on damage/collapse). */
    this._deckMesh = null;

    this.group = new THREE.Group();
    this._buildMesh();
    scene.add(this.group);
  }

  // ---------------------------------------------------------------------------
  // Mesh construction
  // ---------------------------------------------------------------------------

  _buildMesh() {
    const W = this.deckWidth;
    const L = this.deckLength;

    // --- Main deck ---
    const deckGeo = new THREE.BoxGeometry(W, 0.6, L);
    this._deckMesh = new THREE.Mesh(deckGeo, _deckMat);
    this._deckMesh.position.y = 0.3;
    this._deckMesh.castShadow   = true;
    this._deckMesh.receiveShadow = true;
    this.group.add(this._deckMesh);

    // --- Side railings (visual only) ---
    const railGeo = new THREE.BoxGeometry(0.25, 1.0, L);
    const railMatL = _pillarMat;
    const railL = new THREE.Mesh(railGeo, railMatL);
    railL.position.set(-(W / 2 - 0.125), 1.1, 0);
    railL.castShadow = true;
    this.group.add(railL);

    const railR = railL.clone();
    railR.position.x = W / 2 - 0.125;
    this.group.add(railR);

    // --- Cross-braces / end-supports ---
    const braceGeo = new THREE.BoxGeometry(W + 1.0, 2.0, 0.6);
    for (const sign of [-1, 1]) {
      const brace = new THREE.Mesh(braceGeo, _pillarMat);
      brace.position.set(0, -0.7, sign * (L / 2 - 0.5));
      brace.castShadow = true;
      this.group.add(brace);
    }

    this.group.position.set(this.x, this.groundY, this.z);
    this.group.rotation.y = this.rotY;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Apply damage from a projectile hit.
   * @param {number} amount
   * @returns {boolean} `true` if this hit destroyed the bridge.
   */
  takeDamage(amount) {
    if (!this.alive) return false;

    this.hp = Math.max(0, this.hp - amount);

    // Visually show damage at half HP
    if (this.hp > 0 && this.hp <= this.maxHp * 0.5) {
      this._deckMesh.material = _damagedMat;
    }

    if (this.hp <= 0) {
      this._collapse();
      return true;
    }
    return false;
  }

  /**
   * Force-destroy without damage (e.g. round reset).  Removes from scene.
   */
  destroy() {
    this.hp   = 0;
    this.alive = false;
    this._scene.remove(this.group);
    this.rubbleObstacles = [];
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Visually collapse the bridge deck and populate rubbleObstacles.
   * Called when HP reaches 0.
   */
  _collapse() {
    this.alive = false;

    // Tilt and darken the deck
    this._deckMesh.material = _damagedMat;
    this._deckMesh.rotation.z = 0.4;
    this._deckMesh.position.y = -0.4;

    // Hide railings and supports
    for (const child of this.group.children) {
      if (child !== this._deckMesh) {
        child.visible = false;
      }
    }

    // Spawn rubble obstacles along the span in world space.
    // Four circles spread evenly at ±2.5 and ±7.5 local Z positions.
    const c = Math.cos(this.rotY);
    const s = Math.sin(this.rotY);

    for (const oz of [-7.5, -2.5, 2.5, 7.5]) {
      // Transform local (0, oz) to world XZ:
      //   world_x = x + local_x * cos(rotY) + local_z * sin(rotY)
      //   world_z = z - local_x * sin(rotY) + local_z * cos(rotY)
      // Since local_x = 0:
      const wx = this.x + s * oz;
      const wz = this.z + c * oz;
      this.rubbleObstacles.push({ x: wx, z: wz, radius: 2.5 });
    }
  }
}
