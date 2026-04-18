/**
 * VillageGenerator — procedural village cluster placement (t048).
 *
 * Generates NUM_CLUSTERS village clusters, each containing 3–8 buildings
 * spread across a CLUSTER_SPREAD-unit radius.  Dirt-path ground planes are
 * placed between and around each cluster to give a worn-road appearance.
 *
 * Placement rules:
 *  - Clusters avoid the team spawn lanes (|z| 35–75) so fights don't start
 *    inside a building.
 *  - Buildings within a cluster are checked for overlap; failures are retried.
 *  - A random 40 % of buildings are rotated 90° so the streetscape varies.
 *
 * Collision integration:
 *  - `this.buildings` holds all Building instances.
 *  - `this.activeObstacles` returns the live obstacle list compatible with
 *    CollisionSystem's push-back helpers ({ x, z, radius }).  Obstacles whose
 *    radius has been zeroed (fully destroyed building) are filtered out.
 */

import * as THREE from 'three';
import { Building } from './Building.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const NUM_CLUSTERS    = 3;   // village clusters on the map
const CLUSTER_SPREAD  = 14;  // max XZ offset for buildings within a cluster
const MIN_CLUSTER_SEP = 38;  // minimum separation between cluster centres
const WORLD_HALF      = 80;  // buildings placed within ±80 units

// Building footprint presets (width × depth, in world units)
const BUILDING_PRESETS = [
  { width:  7, depth: 5 },  // small cottage
  { width:  8, depth: 6 },  // standard house
  { width: 10, depth: 7 },  // larger house
  { width:  9, depth: 8 },  // square house
  { width: 12, depth: 6 },  // long barracks
];

const BUILDING_GAP = 2.5;   // minimum clear space between adjacent building footprints

const DIRT_COLOR   = 0x9e825a;  // worn-earth path colour

// ---------------------------------------------------------------------------
// VillageGenerator
// ---------------------------------------------------------------------------

export class VillageGenerator {
  /**
   * @param {THREE.Scene}                              scene
   * @param {import('./Terrain.js').Terrain}           terrain
   */
  constructor(scene, terrain) {
    this._scene   = scene;
    this._terrain = terrain;

    /** @type {Building[]} */
    this.buildings = [];

    this._generate();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Live obstacle list for CollisionSystem.
   * Filters out any building that has been fully destroyed (radius === 0).
   * @returns {Array<{ x: number, z: number, radius: number }>}
   */
  get activeObstacles() {
    const out = [];
    for (const b of this.buildings) {
      if (b.obstacle.radius > 0) {
        out.push(b.obstacle);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Private generation
  // ---------------------------------------------------------------------------

  _generate() {
    const centers = this._clusterCenters();
    for (const c of centers) {
      const count = 3 + Math.floor(Math.random() * 6); // 3–8
      this._buildCluster(c.x, c.z, count);
      this._placePaths(c.x, c.z);
    }
  }

  /**
   * Pick NUM_CLUSTERS well-separated cluster centres, avoiding spawn lanes.
   * @returns {Array<{x:number, z:number}>}
   */
  _clusterCenters() {
    const centers = [];
    let attempts  = 0;

    while (centers.length < NUM_CLUSTERS && attempts < NUM_CLUSTERS * 30) {
      attempts++;
      const x = (Math.random() - 0.5) * WORLD_HALF * 2;
      const z = (Math.random() - 0.5) * WORLD_HALF * 2;

      // Avoid the edge buffer
      if (Math.abs(x) > WORLD_HALF - 10 || Math.abs(z) > WORLD_HALF - 10) { continue; }

      // Avoid team spawn lanes: players spawn at z = ±55 with spread ±30.
      // Keep clusters away from |z| = 35–75 to prevent first-contact inside buildings.
      if (Math.abs(z) > 35 && Math.abs(z) < 75) { continue; }

      // Enforce minimum separation between cluster centres.
      let tooClose = false;
      for (const c of centers) {
        const dx = x - c.x;
        const dz = z - c.z;
        if (dx * dx + dz * dz < MIN_CLUSTER_SEP * MIN_CLUSTER_SEP) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) { continue; }

      centers.push({ x, z });
    }

    return centers;
  }

  /**
   * Attempt to place `count` buildings around the cluster centre (cx, cz).
   * Uses rejection sampling with BUILDING_GAP clearance between footprints.
   *
   * @param {number} cx   Cluster centre X.
   * @param {number} cz   Cluster centre Z.
   * @param {number} count  Target building count.
   */
  _buildCluster(cx, cz, count) {
    const placed = [];   // { x, z, width, depth }
    let attempts = 0;

    while (placed.length < count && attempts < count * 25) {
      attempts++;

      const offsetX = (Math.random() - 0.5) * CLUSTER_SPREAD * 2;
      const offsetZ = (Math.random() - 0.5) * CLUSTER_SPREAD * 2;
      const wx      = cx + offsetX;
      const wz      = cz + offsetZ;

      // Pick a random preset and optionally rotate 90°
      const preset  = BUILDING_PRESETS[Math.floor(Math.random() * BUILDING_PRESETS.length)];
      const rotate  = Math.random() < 0.4;
      const w       = rotate ? preset.depth : preset.width;
      const d       = rotate ? preset.width : preset.depth;

      // Reject if the footprint overlaps any already-placed building
      if (this._overlapsAny(wx, wz, w, d, placed)) { continue; }

      // Also reject if too close to the world boundary
      if (Math.abs(wx) + w / 2 > WORLD_HALF || Math.abs(wz) + d / 2 > WORLD_HALF) { continue; }

      placed.push({ x: wx, z: wz, width: w, depth: d });
      this.buildings.push(new Building(this._scene, wx, wz, w, d, this._terrain));
    }
  }

  /**
   * Returns true if a candidate footprint (cx, cz, w, d) overlaps any entry
   * in the `placed` array by more than BUILDING_GAP.
   */
  _overlapsAny(cx, cz, w, d, placed) {
    for (const p of placed) {
      const minDx = (w + p.width)  / 2 + BUILDING_GAP;
      const minDz = (d + p.depth)  / 2 + BUILDING_GAP;
      if (Math.abs(cx - p.x) < minDx && Math.abs(cz - p.z) < minDz) {
        return true;
      }
    }
    return false;
  }

  /**
   * Place dirt-path ground planes around a cluster centre.
   *
   * Generates:
   *  - A central cross patch at the cluster heart.
   *  - 2–3 spoke paths radiating outward in random directions.
   *
   * @param {number} cx   Cluster centre X.
   * @param {number} cz   Cluster centre Z.
   */
  _placePaths(cx, cz) {
    const mat = new THREE.MeshStandardMaterial({
      color:     DIRT_COLOR,
      roughness: 1.0,
      flatShading: true,
    });

    // Central dirt plaza
    const plazaSize = 6 + Math.random() * 4;
    this._addPathPlane(cx, cz, plazaSize, plazaSize, 0, mat);

    // Spoke paths
    const spokeCount = 2 + Math.floor(Math.random() * 2);   // 2–3
    for (let i = 0; i < spokeCount; i++) {
      const angle  = (i / spokeCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
      const len    = CLUSTER_SPREAD * 1.3 + Math.random() * 5;
      const pathW  = 2.2 + Math.random() * 0.8;

      const midX = cx + Math.cos(angle) * len / 2;
      const midZ = cz + Math.sin(angle) * len / 2;

      this._addPathPlane(midX, midZ, pathW, len, angle, mat);
    }
  }

  /**
   * Spawn a single flat-box path plane at world position (wx, wz).
   *
   * @param {number}              wx      Path centre X.
   * @param {number}              wz      Path centre Z.
   * @param {number}              width   Path width (local X before rotation).
   * @param {number}              length  Path length (local Z before rotation).
   * @param {number}              rotY    Y-axis rotation in radians.
   * @param {THREE.Material}      mat
   */
  _addPathPlane(wx, wz, width, length, rotY, mat) {
    const geo  = new THREE.BoxGeometry(width, 0.08, length);
    const mesh = new THREE.Mesh(geo, mat);

    const groundY = this._terrain.getHeightAt(wx, wz);
    mesh.position.set(wx, groundY + 0.03, wz);
    mesh.rotation.y   = rotY;
    mesh.receiveShadow = true;

    this._scene.add(mesh);
  }
}
