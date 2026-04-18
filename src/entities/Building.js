/**
 * Building — a destructible environment structure (t047).
 *
 * Geometry:
 *   4 wall panels (N/S/E/W) as separate BoxGeometry meshes, each with HP.
 *   Flat roof box on top (indestructible — stays even as walls fall).
 *   Thin floor/foundation plane.
 *
 * Destruction:
 *   Each wall takes `WALL_HP` hits before being removed from the scene.
 *   When all 4 walls are gone the obstacle radius is zeroed so tanks can
 *   drive through the ruins.
 *
 * Collision:
 *   Exposes `obstacle: { x, z, radius }` compatible with CollisionSystem's
 *   existing push-back helpers.  Radius is set to zero once the building is
 *   fully destroyed.
 *
 * Projectile hit:
 *   Call `hitByProjectile(worldPos, damage)` — it finds the closest alive wall
 *   and deducts damage, returning metadata used by CollisionSystem callbacks.
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Shared materials (module-level singletons — one material per color)
// ---------------------------------------------------------------------------

const _wallMat = new THREE.MeshStandardMaterial({
  color: 0xe0c898,  // warm sandy beige
  roughness: 0.9,
  flatShading: true,
});

const _roofMat = new THREE.MeshStandardMaterial({
  color: 0x7a3820,  // dark terracotta
  roughness: 0.85,
  flatShading: true,
});

const _floorMat = new THREE.MeshStandardMaterial({
  color: 0xc8a060,  // tan earth
  roughness: 1.0,
  flatShading: true,
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WALL_HEIGHT    = 3.5;
const WALL_THICKNESS = 0.4;
const WALL_HP        = 3;    // hits required to destroy one wall

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

export class Building {
  /**
   * @param {THREE.Scene}                              scene
   * @param {number}                                   x       World X centre.
   * @param {number}                                   z       World Z centre.
   * @param {number}                                   width   X dimension.
   * @param {number}                                   depth   Z dimension.
   * @param {import('./Terrain.js').Terrain}           terrain Used for ground height.
   */
  constructor(scene, x, z, width, depth, terrain) {
    this._scene  = scene;
    this.x       = x;
    this.z       = z;
    this.width   = width;
    this.depth   = depth;

    const groundY  = terrain.getHeightAt(x, z);
    this._groundY  = groundY;

    /** Bounding circle radius for tank push-back (footprint diagonal / 2). */
    this.radius = Math.sqrt(
      (width  / 2) * (width  / 2) +
      (depth  / 2) * (depth  / 2)
    );

    /**
     * Obstacle record compatible with CollisionSystem's existing push-back.
     * Radius is zeroed when all walls are gone (tanks can pass through ruins).
     * @type {{ x: number, z: number, radius: number }}
     */
    this.obstacle = { x, z, radius: this.radius };

    /**
     * Individual wall records.
     * @type {Array<{ mesh: THREE.Mesh, hp: number, alive: boolean, side: string }>}
     */
    this.walls = [];

    /** False once every wall is destroyed. */
    this._alive = true;

    // Build the Three.js group
    this.group = new THREE.Group();
    this.group.position.set(x, groundY, z);
    scene.add(this.group);

    this._buildStructure();
  }

  /** True while at least one wall is standing. */
  get alive() { return this._alive; }

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  _buildStructure() {
    const W  = this.width;
    const D  = this.depth;
    const WT = WALL_THICKNESS;
    const WH = WALL_HEIGHT;

    // Foundation slab
    const floorGeo = new THREE.BoxGeometry(W + 0.3, 0.15, D + 0.3);
    const floorMesh = new THREE.Mesh(floorGeo, _floorMat);
    floorMesh.position.y = 0.075;
    floorMesh.receiveShadow = true;
    this.group.add(floorMesh);

    // North wall (local z = −depth/2): full width, inset to sit inside footprint.
    this._addWall('north',
      0,             WH / 2, -(D / 2 - WT / 2),
      W,             WH,     WT);

    // South wall (local z = +depth/2)
    this._addWall('south',
      0,             WH / 2, +(D / 2 - WT / 2),
      W,             WH,     WT);

    // East wall (local x = +width/2): depth inset by WT×2 so corners don't double up.
    this._addWall('east',
      +(W / 2 - WT / 2), WH / 2, 0,
      WT,                WH,     D - 2 * WT);

    // West wall
    this._addWall('west',
      -(W / 2 - WT / 2), WH / 2, 0,
      WT,                WH,     D - 2 * WT);

    // Roof slab (indestructible — sits atop walls)
    const roofGeo  = new THREE.BoxGeometry(W + 0.5, 0.3, D + 0.5);
    const roofMesh = new THREE.Mesh(roofGeo, _roofMat);
    roofMesh.position.y = WH + 0.15;
    roofMesh.castShadow = true;
    this.group.add(roofMesh);
  }

  /**
   * Create one wall panel and register it.
   *
   * @param {string} side  'north'|'south'|'east'|'west'
   * @param {number} lx    Local X offset.
   * @param {number} ly    Local Y offset (centre of wall).
   * @param {number} lz    Local Z offset.
   * @param {number} w     Box width  (X).
   * @param {number} h     Box height (Y).
   * @param {number} d     Box depth  (Z).
   */
  _addWall(side, lx, ly, lz, w, h, d) {
    const geo  = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, _wallMat);
    mesh.position.set(lx, ly, lz);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.walls.push({ mesh, hp: WALL_HP, alive: true, side });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Apply projectile damage to the closest alive wall.
   *
   * @param {THREE.Vector3} hitWorldPos  World-space hit position.
   * @param {number}        damage       Amount of HP to remove.
   * @returns {{ hit: boolean, wallDestroyed: boolean, buildingDestroyed: boolean }}
   */
  hitByProjectile(hitWorldPos, damage) {
    // Find the closest alive wall by world-space distance to its centre.
    let closest     = null;
    let closestDist = Infinity;
    const wallWorld = new THREE.Vector3();

    for (const wall of this.walls) {
      if (!wall.alive) { continue; }
      wall.mesh.getWorldPosition(wallWorld);
      const dist = hitWorldPos.distanceTo(wallWorld);
      if (dist < closestDist) {
        closestDist = dist;
        closest     = wall;
      }
    }

    if (!closest) {
      return { hit: false, wallDestroyed: false, buildingDestroyed: false };
    }

    closest.hp = Math.max(0, closest.hp - damage);

    let wallDestroyed     = false;
    let buildingDestroyed = false;

    if (closest.hp === 0) {
      wallDestroyed  = true;
      closest.alive  = false;
      this.group.remove(closest.mesh);

      // Dispose geometry to release GPU memory.
      closest.mesh.geometry.dispose();

      const allDown = this.walls.every(w => !w.alive);
      if (allDown) {
        this._alive           = false;
        buildingDestroyed     = true;
        this.obstacle.radius  = 0;  // tanks may now pass through the ruins
      }
    }

    return { hit: true, wallDestroyed, buildingDestroyed };
  }

  /**
   * Returns true if the given world XZ point is within the building AABB.
   * Used by CollisionSystem for a fast pre-filter before calling
   * `hitByProjectile`.
   *
   * @param {number} worldX
   * @param {number} worldZ
   * @returns {boolean}
   */
  containsPointXZ(worldX, worldZ) {
    const hw = this.width  / 2 + 0.5;
    const hd = this.depth  / 2 + 0.5;
    const lx = worldX - this.x;
    const lz = worldZ - this.z;
    return lx >= -hw && lx <= hw && lz >= -hd && lz <= hd;
  }
}
