import * as THREE from 'three';

/**
 * MapLayout — balanced 6v6 map design for GUNZ.
 *
 * Responsibilities:
 *  - Spawn zone markers: colored ground pads at each team's deployment zone.
 *  - Center village: six box-buildings clustered around the map origin,
 *    providing infantry cover and a contested mid-game objective.
 *  - River lanes: two east-west mud channels crossing the battlefield at
 *    z ≈ ±26.  Tanks and soldiers are slowed in these zones.
 *  - Collision obstacle list: buildings and river edges registered so
 *    CollisionSystem can reject movement that passes through solid walls.
 *  - `isInRiver(x, z)`: query used by movement systems to apply the
 *    40 % (tank) / 60 % (soldier) speed penalty defined in VISION.md.
 *
 * Layout overview (Z axis = north-south, X axis = east-west):
 *
 *   z = -70  ┌──────────────────────────────────┐  Team 1 (enemy) spawn zone
 *            │                                  │
 *   z = -26  │ ══════════ north river ══════════ │  movement penalty band
 *            │                                  │
 *   z =   0  │         [ village ]              │  center village
 *            │                                  │
 *   z = +26  │ ══════════ south river ══════════ │  movement penalty band
 *            │                                  │
 *   z = +70  └──────────────────────────────────┘  Team 0 (player) spawn zone
 *
 * All geometry is added directly to the THREE.Scene (not as terrain children)
 * so world positions equal mesh positions, consistent with TreeSystem and
 * WreckSystem conventions.
 *
 * This module is persistent — `reset()` is a no-op because map geometry does
 * not change between rounds.  Only building HP (t047) would reset; that is
 * handled separately when destructibility is implemented.
 */

// ─── Spawn zone configuration ────────────────────────────────────────────────

/**
 * Spawn zone definitions.  Each entry describes a coloured ground pad that
 * visually marks where a team's tanks deploy at the start of each round.
 * The actual spawn positions are calculated by TeamManager._spawnPosition().
 *
 * width / depth are in world units (X and Z spans respectively).
 * Alpha-blended so the terrain colour shows through.
 */
const SPAWN_ZONE_DEFS = [
  // Team 0 — player side (green, south)
  { teamId: 0, centerX: 0, centerZ: 57, width: 38, depth: 16, color: 0x3a7a33 },
  // Team 1 — enemy side (red, north)
  { teamId: 1, centerX: 0, centerZ: -57, width: 38, depth: 16, color: 0xb03000 },
];

// ─── River lane configuration ─────────────────────────────────────────────────

/**
 * River / mud zone definitions.  Each zone is a wide east-west band.
 *
 * centerZ — world Z position of the river centre line.
 * depth   — north-south width of the mud zone in world units.
 * width   — east-west extent (spans the full traversable map width).
 * color   — rendered as a semi-transparent muddy-water plane.
 *
 * Movement penalties applied when `isInRiver()` returns true:
 *   Tanks: 40 % speed (i.e. multiply by 0.4)
 *   Soldiers: 60 % speed (i.e. multiply by 0.6)
 */
const RIVER_DEFS = [
  { centerZ: -26, depth: 10, width: 160, color: 0x2a5f8a },  // north river
  { centerZ: +26, depth: 10, width: 160, color: 0x2a5f8a },  // south river
];

// Movement-speed multipliers while inside a river zone.
export const RIVER_SPEED_TANK    = 0.40;
export const RIVER_SPEED_SOLDIER = 0.60;

// ─── Center village building definitions ─────────────────────────────────────

/**
 * Simple box buildings for the center village.
 *
 * Each entry: { x, z, w, d, h, color, roofColor }
 *   x, z      — world position of the building centre (Y is terrain-sampled).
 *   w, d, h   — width (X), depth (Z), height (Y) in world units.
 *   color     — wall material flat-shaded colour.
 *   roofColor — flat-shaded roof cap colour.
 *
 * Buildings are arranged in a loose cluster around the origin to create a
 * village square feel with alleys between them.  The layout has rotational
 * near-symmetry so neither team has a significant sightline advantage.
 *
 * Collision radius per building: approximated as half the larger of (w, d),
 * inflated by √2/2 to cover corners.
 */
const BUILDING_DEFS = [
  // Village centre — large community hall / depot
  { x:   0, z:   0, w: 9, d: 7, h: 6, color: 0xd4b896, roofColor: 0x8b3a2a },

  // East wing
  { x:  14, z:  -7, w: 6, d: 6, h: 5, color: 0xc9a87c, roofColor: 0x7a3020 },
  { x:  13, z:   9, w: 7, d: 5, h: 4, color: 0xbfa070, roofColor: 0x6a2820 },

  // West wing
  { x: -13, z:  -8, w: 6, d: 8, h: 5, color: 0xd4b896, roofColor: 0x8b3a2a },
  { x: -14, z:   7, w: 5, d: 6, h: 4, color: 0xbfa070, roofColor: 0x7a3020 },

  // North outpost (just south of north river)
  { x:  -4, z: -16, w: 6, d: 5, h: 4, color: 0xc9a87c, roofColor: 0x6a2820 },

  // South outpost (just north of south river)
  { x:   5, z:  16, w: 5, d: 6, h: 4, color: 0xc9a87c, roofColor: 0x7a3020 },
];

// ─── MapLayout class ──────────────────────────────────────────────────────────

export class MapLayout {
  /**
   * @param {THREE.Scene}                              scene
   * @param {import('../entities/Terrain.js').Terrain} terrain
   */
  constructor(scene, terrain) {
    this._scene   = scene;
    this._terrain = terrain;

    /**
     * Collision obstacles for buildings: { x, z, radius }.
     * Passed to CollisionSystem so tank movement is blocked by walls.
     * @type {Array<{x: number, z: number, radius: number}>}
     */
    this.buildingObstacles = [];

    /**
     * River zone descriptors for fast containment tests.
     * @type {Array<{minZ: number, maxZ: number}>}
     */
    this._riverZones = [];

    this._buildSpawnZones();
    this._buildRivers();
    this._buildVillage();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Returns true when the point (x, z) lies inside any river / mud zone.
   * Used by movement systems to apply speed penalties.
   *
   * @param {number} _x  — world X (unused; rivers span the full map width)
   * @param {number} z   — world Z
   * @returns {boolean}
   */
  isInRiver(_x, z) {
    for (const zone of this._riverZones) {
      if (z >= zone.minZ && z <= zone.maxZ) return true;
    }
    return false;
  }

  /**
   * No-op — map geometry persists across round resets.
   * Destructible building HP will be reset here once t047 is implemented.
   */
  reset() {
    return 0;
  }

  // ─── Private builders ────────────────────────────────────────────────────────

  /** Create semi-transparent coloured ground pads for each spawn zone. */
  _buildSpawnZones() {
    for (const def of SPAWN_ZONE_DEFS) {
      const geo = new THREE.PlaneGeometry(def.width, def.depth);
      geo.rotateX(-Math.PI / 2);

      const mat = new THREE.MeshStandardMaterial({
        color:       def.color,
        roughness:   1.0,
        metalness:   0.0,
        transparent: true,
        opacity:     0.45,
        flatShading: true,
        depthWrite:  false,
      });

      const mesh = new THREE.Mesh(geo, mat);
      const y = this._terrain.getHeightAt(def.centerX, def.centerZ) + 0.05;
      mesh.position.set(def.centerX, y, def.centerZ);
      mesh.receiveShadow = false;
      this._scene.add(mesh);
    }
  }

  /** Create translucent muddy-water planes for the two river zones. */
  _buildRivers() {
    for (const def of RIVER_DEFS) {
      // Visual plane — sits a couple centimetres above terrain to avoid z-fighting
      const geo = new THREE.PlaneGeometry(def.width, def.depth);
      geo.rotateX(-Math.PI / 2);

      const mat = new THREE.MeshStandardMaterial({
        color:       def.color,
        roughness:   0.6,
        metalness:   0.1,
        transparent: true,
        opacity:     0.70,
        flatShading: true,
        depthWrite:  false,
      });

      const mesh = new THREE.Mesh(geo, mat);
      // Sample terrain height at river centre and raise slightly
      const y = this._terrain.getHeightAt(0, def.centerZ) + 0.08;
      mesh.position.set(0, y, def.centerZ);
      mesh.receiveShadow = false;
      this._scene.add(mesh);

      // Register the containment band for isInRiver() queries
      this._riverZones.push({
        minZ: def.centerZ - def.depth / 2,
        maxZ: def.centerZ + def.depth / 2,
      });
    }
  }

  /**
   * Create the center village: simple flat-shaded box buildings.
   *
   * Each building has:
   *  - A BoxGeometry hull positioned at terrain height.
   *  - A thin flat BoxGeometry roof cap in a contrasting colour.
   *  - A collision obstacle registered in `buildingObstacles`.
   */
  _buildVillage() {
    const wallMat  = {}; // cache materials by color key to reduce draw calls
    const roofMat  = {};

    for (const def of BUILDING_DEFS) {
      const groundY = this._terrain.getHeightAt(def.x, def.z);

      // ── Wall mesh ──────────────────────────────────────────────────────────
      const wallKey = def.color;
      if (!wallMat[wallKey]) {
        wallMat[wallKey] = new THREE.MeshStandardMaterial({
          color:       def.color,
          roughness:   0.9,
          metalness:   0.0,
          flatShading: true,
        });
      }

      const wallGeo  = new THREE.BoxGeometry(def.w, def.h, def.d);
      const wallMesh = new THREE.Mesh(wallGeo, wallMat[wallKey]);
      wallMesh.position.set(def.x, groundY + def.h / 2, def.z);
      wallMesh.castShadow    = true;
      wallMesh.receiveShadow = true;
      this._scene.add(wallMesh);

      // ── Roof cap ───────────────────────────────────────────────────────────
      const roofKey = def.roofColor;
      if (!roofMat[roofKey]) {
        roofMat[roofKey] = new THREE.MeshStandardMaterial({
          color:       def.roofColor,
          roughness:   0.8,
          metalness:   0.0,
          flatShading: true,
        });
      }

      const roofThickness = 0.4;
      const roofGeo   = new THREE.BoxGeometry(def.w + 0.4, roofThickness, def.d + 0.4);
      const roofMesh  = new THREE.Mesh(roofGeo, roofMat[roofKey]);
      roofMesh.position.set(def.x, groundY + def.h + roofThickness / 2, def.z);
      roofMesh.castShadow    = true;
      roofMesh.receiveShadow = true;
      this._scene.add(roofMesh);

      // ── Collision obstacle ─────────────────────────────────────────────────
      // Approximate the building footprint as a circle inscribing the corners:
      //   radius = (max(w, d) / 2) * √2 / √2  ≈  half the longer side + 0.5 buffer
      const radius = Math.max(def.w, def.d) / 2 + 0.5;
      this.buildingObstacles.push({ x: def.x, z: def.z, radius });
    }
  }
}
