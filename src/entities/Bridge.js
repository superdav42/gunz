/**
 * Bridge — destructible river crossing (t049).
 *
 * A bridge spans the full river depth (Z axis) at a fixed X position,
 * divided into NUM_SECTIONS planks.  Each plank has independent HP so shells
 * can blast out individual sections and leave a partial bridge.
 *
 * Geometry:
 *   - BRIDGE_WIDTH (X) × river_depth+4 (Z) flat platform.
 *   - Divided into NUM_SECTIONS equal planks along the Z axis.
 *   - Two decorative side railings (indestructible low posts).
 *
 * Crossing mechanics:
 *   - `isAliveAt(x, z)` returns true when the world XZ point is over a live plank.
 *   - Used by MapLayout to bypass the river speed penalty for entities on solid planks.
 *
 * Projectile hit:
 *   - `hitByProjectile(worldPos, damage)` reduces the closest live plank's HP.
 *   - Plank removed from scene when HP reaches 0.
 *
 * Collision:
 *   - No tank obstacle radius — tanks drive straight across.
 *   - `containsPointXZ(x, z)` is used for fast projectile broad-phase detection.
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Shared materials
// ---------------------------------------------------------------------------

const _plankMat = new THREE.MeshStandardMaterial({
  color: 0x8b6914,    // dark weathered wood
  roughness: 0.9,
  flatShading: true,
});

const _railingMat = new THREE.MeshStandardMaterial({
  color: 0x6b4f10,    // darker post wood
  roughness: 0.95,
  flatShading: true,
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BRIDGE_WIDTH  = 7;    // X extent — wide enough for a tank (tank ≈ 3 u wide)
const NUM_SECTIONS  = 3;    // planks per bridge
const PLANK_HP      = 3;    // projectile hits to destroy one plank
const RIVER_OVERLAP = 4;    // how many units each end extends beyond river bank

// ---------------------------------------------------------------------------
// Bridge
// ---------------------------------------------------------------------------

export class Bridge {
  /**
   * @param {THREE.Scene}                              scene
   * @param {number}                                   x            World X centre.
   * @param {number}                                   riverCenterZ World Z of river midline.
   * @param {number}                                   riverDepth   N-S width of river zone.
   * @param {import('./Terrain.js').Terrain}           terrain
   */
  constructor(scene, x, riverCenterZ, riverDepth, terrain) {
    this._scene       = scene;
    this.x            = x;
    this.riverCenterZ = riverCenterZ;

    /** Total Z length of the bridge (river + overhang on each bank). */
    const bridgeLength    = riverDepth + RIVER_OVERLAP;
    this._bridgeLength    = bridgeLength;
    this._halfBridgeLength = bridgeLength / 2;
    this._halfW           = BRIDGE_WIDTH / 2;

    // World-Z bounds of the bridge (used for containsPointXZ)
    this._minZ = riverCenterZ - this._halfBridgeLength;
    this._maxZ = riverCenterZ + this._halfBridgeLength;

    /**
     * Individual plank sections.
     * @type {Array<{mesh: THREE.Mesh, hp: number, alive: boolean, minZ: number, maxZ: number}>}
     */
    this.sections = [];

    this._build(bridgeLength, terrain);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Returns true when the world XZ point lies over a live bridge plank.
   * Used by MapLayout.isInRiver() to bypass the speed penalty for crossers.
   *
   * @param {number} worldX
   * @param {number} worldZ
   * @returns {boolean}
   */
  isAliveAt(worldX, worldZ) {
    if (Math.abs(worldX - this.x) > this._halfW) return false;
    for (const s of this.sections) {
      if (s.alive && worldZ >= s.minZ && worldZ <= s.maxZ) return true;
    }
    return false;
  }

  /**
   * AABB broad-phase: returns true if the XZ point is anywhere within the
   * bridge footprint (alive or not).  Used for projectile pre-filtering.
   *
   * @param {number} worldX
   * @param {number} worldZ
   * @returns {boolean}
   */
  containsPointXZ(worldX, worldZ) {
    return (
      Math.abs(worldX - this.x)            <= this._halfW + 0.5 &&
      worldZ >= this._minZ - 0.5 &&
      worldZ <= this._maxZ + 0.5
    );
  }

  /**
   * Apply projectile damage to the closest live plank.
   *
   * @param {THREE.Vector3} hitWorldPos
   * @param {number}        damage
   * @returns {{ hit: boolean, sectionDestroyed: boolean }}
   */
  hitByProjectile(hitWorldPos, damage) {
    let closest     = null;
    let closestDist = Infinity;
    const sWorld    = new THREE.Vector3();

    for (const s of this.sections) {
      if (!s.alive) continue;
      s.mesh.getWorldPosition(sWorld);
      const dist = hitWorldPos.distanceTo(sWorld);
      if (dist < closestDist) {
        closestDist = dist;
        closest     = s;
      }
    }

    if (!closest) return { hit: false, sectionDestroyed: false };

    closest.hp = Math.max(0, closest.hp - damage);
    let sectionDestroyed = false;

    if (closest.hp === 0) {
      sectionDestroyed = true;
      closest.alive    = false;
      this._scene.remove(closest.mesh);
      closest.mesh.geometry.dispose();
    }

    return { hit: true, sectionDestroyed };
  }

  // ---------------------------------------------------------------------------
  // Private construction
  // ---------------------------------------------------------------------------

  _build(bridgeLength, terrain) {
    const sectionLen = bridgeLength / NUM_SECTIONS;

    for (let i = 0; i < NUM_SECTIONS; i++) {
      const zOff   = -bridgeLength / 2 + sectionLen * (i + 0.5);
      const worldZ = this.riverCenterZ + zOff;
      const groundY = terrain.getHeightAt(this.x, worldZ) + 0.15;

      const geo  = new THREE.BoxGeometry(BRIDGE_WIDTH, 0.35, sectionLen - 0.08);
      const mesh = new THREE.Mesh(geo, _plankMat);
      mesh.position.set(this.x, groundY, worldZ);
      mesh.castShadow    = true;
      mesh.receiveShadow = true;
      this._scene.add(mesh);

      const sMinZ = worldZ - sectionLen / 2;
      const sMaxZ = worldZ + sectionLen / 2;

      this.sections.push({ mesh, hp: PLANK_HP, alive: true, minZ: sMinZ, maxZ: sMaxZ });
    }

    // Decorative side railings (indestructible visual posts)
    this._addRailing(bridgeLength, terrain, -(BRIDGE_WIDTH / 2) + 0.2);
    this._addRailing(bridgeLength, terrain, +(BRIDGE_WIDTH / 2) - 0.2);
  }

  /**
   * Place a continuous railing post along the bridge edge.
   *
   * @param {number}                               bridgeLength
   * @param {import('./Terrain.js').Terrain}       terrain
   * @param {number}                               xOffset   Local X offset from bridge centre.
   */
  _addRailing(bridgeLength, terrain, xOffset) {
    const wx      = this.x + xOffset;
    const groundY = terrain.getHeightAt(wx, this.riverCenterZ) + 0.5;
    const geo     = new THREE.BoxGeometry(0.22, 0.65, bridgeLength);
    const mesh    = new THREE.Mesh(geo, _railingMat);
    mesh.position.set(wx, groundY, this.riverCenterZ);
    mesh.castShadow = true;
    this._scene.add(mesh);
  }
}
