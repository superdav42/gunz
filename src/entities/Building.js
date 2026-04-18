/**
 * Building — a destructible structure entity.
 *
 * Each building consists of:
 *  - A floor and roof (non-destructible, treated as permanent structure).
 *  - Four walls (N, S, E, W), each independently destructible.
 *
 * Walls are built from BoxGeometry (flat-shaded, low-poly style) with a beige
 * colour.  Each wall has 3 HP; projectile shells deal 1 damage per hit.  Tanks
 * that drive into a wall instantly destroy it ("smash through" mechanic).
 *
 * Collision data:
 *  Each wall exposes an AABB descriptor { cx, cz, hw, hd } where (cx, cz) is
 *  the wall centre in world XZ, and hw/hd are the half-extents on X and Z.
 *  CollisionSystem uses these for projectile interception and tank-smash checks.
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BUILD_W = 10;   // Building outer width  (X axis)
const BUILD_D = 8;    // Building outer depth  (Z axis)
const WALL_T  = 0.6;  // Wall thickness
const WALL_H  = 3.5;  // Wall height

/**
 * Shots needed to destroy one wall.  Tanks bypass this (instant destruction).
 */
export const WALL_HP = 3;

// ---------------------------------------------------------------------------
// Shared geometry (created once per module — shared across all Building instances)
// ---------------------------------------------------------------------------

const _northSouthWallGeo = new THREE.BoxGeometry(BUILD_W, WALL_H, WALL_T);
const _eastWestWallGeo   = new THREE.BoxGeometry(WALL_T, WALL_H, BUILD_D - 2 * WALL_T);
const _floorGeo          = new THREE.BoxGeometry(BUILD_W, 0.3, BUILD_D);
const _roofGeo           = new THREE.BoxGeometry(BUILD_W, 0.6, BUILD_D);

// ---------------------------------------------------------------------------
// Shared materials
// ---------------------------------------------------------------------------

const _wallMat  = new THREE.MeshStandardMaterial({ color: 0xd4b896, flatShading: true });
const _roofMat  = new THREE.MeshStandardMaterial({ color: 0x8b4513, flatShading: true });
const _floorMat = new THREE.MeshStandardMaterial({ color: 0xc8a87a, flatShading: true });

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

export class Building {
  /**
   * @param {THREE.Scene} scene
   * @param {number}      x       World X position (building centre).
   * @param {number}      z       World Z position (building centre).
   * @param {number}      groundY Terrain height at (x, z).
   */
  constructor(scene, x, z, groundY) {
    this._scene  = scene;
    /** Building centre X — used for spatial queries. */
    this.x       = x;
    /** Building centre Z — used for spatial queries. */
    this.z       = z;
    this.width   = BUILD_W;
    this.depth   = BUILD_D;

    // ---- Non-destructible shell: floor + roof ----
    this._group = new THREE.Group();
    this._group.position.set(x, groundY, z);

    const floor = new THREE.Mesh(_floorGeo, _floorMat);
    floor.position.y = 0.15;
    floor.receiveShadow = true;
    this._group.add(floor);

    const roof = new THREE.Mesh(_roofGeo, _roofMat);
    roof.position.y = WALL_H + 0.3;
    roof.castShadow = true;
    this._group.add(roof);

    scene.add(this._group);

    // ---- Destructible walls (independent meshes, not children of _group) ----
    /**
     * Wall descriptors.  Each entry:
     *   mesh  {THREE.Mesh}  — the wall's visual representation in the scene.
     *   hp    {number}      — current hit-points.
     *   alive {boolean}     — false once the wall has been destroyed.
     *   cx    {number}      — wall centre X in world space.
     *   cz    {number}      — wall centre Z in world space.
     *   hw    {number}      — half-extent along X (AABB).
     *   hd    {number}      — half-extent along Z (AABB).
     *
     * @type {Array<{mesh: THREE.Mesh, hp: number, alive: boolean,
     *              cx: number, cz: number, hw: number, hd: number}>}
     */
    this.walls = [
      // 0: North wall
      this._makeWall(scene, groundY, {
        geo: _northSouthWallGeo,
        wx: x,                 wz: z - BUILD_D / 2,
        cx: x,                 cz: z - BUILD_D / 2,
        hw: BUILD_W / 2,       hd: WALL_T / 2,
      }),
      // 1: South wall
      this._makeWall(scene, groundY, {
        geo: _northSouthWallGeo,
        wx: x,                 wz: z + BUILD_D / 2,
        cx: x,                 cz: z + BUILD_D / 2,
        hw: BUILD_W / 2,       hd: WALL_T / 2,
      }),
      // 2: East wall (fits between N+S walls)
      this._makeWall(scene, groundY, {
        geo: _eastWestWallGeo,
        wx: x + BUILD_W / 2,   wz: z,
        cx: x + BUILD_W / 2,   cz: z,
        hw: WALL_T / 2,        hd: (BUILD_D - 2 * WALL_T) / 2,
      }),
      // 3: West wall
      this._makeWall(scene, groundY, {
        geo: _eastWestWallGeo,
        wx: x - BUILD_W / 2,   wz: z,
        cx: x - BUILD_W / 2,   cz: z,
        hw: WALL_T / 2,        hd: (BUILD_D - 2 * WALL_T) / 2,
      }),
    ];
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Build and scene-add one wall mesh; return its descriptor object.
   *
   * @param {THREE.Scene}  scene
   * @param {number}       groundY
   * @param {{ geo: THREE.BufferGeometry,
   *           wx: number, wz: number,
   *           cx: number, cz: number,
   *           hw: number, hd: number }} opts
   */
  _makeWall(scene, groundY, { geo, wx, wz, cx, cz, hw, hd }) {
    const mesh = new THREE.Mesh(geo, _wallMat);
    mesh.position.set(wx, groundY + WALL_H / 2, wz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    return { mesh, hp: WALL_HP, alive: true, cx, cz, hw, hd };
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Apply damage to the wall at `wallIndex`.
   * Returns true if this hit destroyed the wall (HP reached 0), false otherwise.
   *
   * @param {number} wallIndex  Index into `this.walls` (0-3).
   * @param {number} amount     Damage to apply.
   * @returns {boolean}
   */
  damageWall(wallIndex, amount) {
    const wall = this.walls[wallIndex];
    if (!wall.alive) return false;

    wall.hp = Math.max(0, wall.hp - amount);
    if (wall.hp === 0) {
      wall.alive = false;
      this._scene.remove(wall.mesh);
      // If every wall is gone, remove the structural shell (floor + roof) too.
      if (this.isFullyDestroyed) {
        this._scene.remove(this._group);
      }
      return true;
    }
    return false;
  }

  /**
   * True when all four walls have been destroyed.
   * @type {boolean}
   */
  get isFullyDestroyed() {
    return this.walls.every(w => !w.alive);
  }

  /**
   * Force-remove all meshes from the scene without running damage logic.
   * Used by BuildingSystem.reset() between rounds.
   */
  destroy() {
    for (const wall of this.walls) {
      if (wall.alive) {
        wall.alive = false;
        this._scene.remove(wall.mesh);
      }
    }
    this._scene.remove(this._group);
  }
}
