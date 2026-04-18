/**
 * StructureSystem — manages destructible bridges and low walls/fences (t049).
 *
 * Bridges:
 *   Placed at three X positions over each of the two river zones, creating six
 *   crossing points.  Each bridge consists of NUM_SECTIONS planks that can be
 *   destroyed independently.  When a plank is gone, a gap opens in the bridge
 *   and the river speed penalty is no longer bypassed at that XZ position.
 *
 *   Bridge crossing bypass:
 *     `hasBridgeAt(x, z)` — returns true while a live plank covers that point.
 *     MapLayout calls this inside isInRiver() to exclude bridge-covered cells
 *     from the mud/speed-penalty zone.
 *
 * Walls:
 *   Short concrete barriers placed near the map centre and river approaches.
 *   - Tanks drive through (StructureSystem detects overlap and destroys the wall).
 *   - Projectiles can also destroy walls via CollisionSystem callbacks.
 *   - `activeSoldierObstacles` — obstacle list for soldier push-back (alive walls).
 *
 * Integration:
 *   - Game.js creates this system AFTER MapLayout, then passes it to MapLayout
 *     via mapLayout.setStructureSystem(this.structures).
 *   - CollisionSystem receives it via the `structureSystem` constructor option.
 *   - Game._loop() calls structures.checkTankWallSmash(mesh) for each live tank.
 */

import { Bridge } from '../entities/Bridge.js';
import { LowWall } from '../entities/Wall.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** River definitions — must mirror MapLayout.RIVER_DEFS. */
const RIVER_DEFS = [
  { centerZ: -26, depth: 10 },  // north river
  { centerZ: +26, depth: 10 },  // south river
];

/** X positions at which bridges are placed over each river. */
const BRIDGE_X_POSITIONS = [-35, 0, 35];

/**
 * Low wall definitions.
 *   x, z   — world centre of the wall.
 *   width  — length along local X (before rotation).
 *   rotY   — Y rotation in radians (0 = wall runs east-west, π/2 = north-south).
 */
const WALL_DEFS = [
  // Centre plaza — crossing support walls
  { x:  -15, z:   0, width: 8, rotY: 0 },
  { x:  +15, z:   0, width: 8, rotY: 0 },
  { x:    0, z: -10, width: 6, rotY: Math.PI / 2 },
  { x:    0, z: +10, width: 6, rotY: Math.PI / 2 },

  // North river approaches
  { x: -20, z: -15, width: 5, rotY: 0 },
  { x: +20, z: -15, width: 5, rotY: 0 },
  { x:   5, z: -18, width: 4, rotY: Math.PI / 2 },
  { x: -5,  z: -18, width: 4, rotY: Math.PI / 2 },

  // South river approaches
  { x: -20, z: +15, width: 5, rotY: 0 },
  { x: +20, z: +15, width: 5, rotY: 0 },
  { x:   5, z: +18, width: 4, rotY: Math.PI / 2 },
  { x: -5,  z: +18, width: 4, rotY: Math.PI / 2 },
];

// How close a tank centre must be to a wall centre for a wall-smash event.
// Accounts for tank half-width (~2.2) plus a small contact margin.
const TANK_SMASH_RADIUS = 3.0;

// ---------------------------------------------------------------------------
// StructureSystem
// ---------------------------------------------------------------------------

export class StructureSystem {
  /**
   * @param {import('three').Scene}                    scene
   * @param {import('../entities/Terrain.js').Terrain} terrain
   */
  constructor(scene, terrain) {
    this._scene   = scene;
    this._terrain = terrain;

    /** @type {Bridge[]} */
    this.bridges = [];

    /** @type {LowWall[]} */
    this.walls = [];

    this._buildBridges();
    this._buildWalls();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Returns true when a live bridge plank covers the world XZ position.
   * Called by MapLayout.isInRiver() to skip the mud speed penalty.
   *
   * @param {number} x
   * @param {number} z
   * @returns {boolean}
   */
  hasBridgeAt(x, z) {
    for (const bridge of this.bridges) {
      if (bridge.isAliveAt(x, z)) return true;
    }
    return false;
  }

  /**
   * Returns all alive wall obstacles, compatible with CollisionSystem's
   * _resolveObstacleCollision() for soldier push-back.
   *
   * @returns {Array<{ x: number, z: number, radius: number }>}
   */
  get activeSoldierObstacles() {
    const out = [];
    for (const wall of this.walls) {
      if (wall.alive) out.push(wall.obstacle);
    }
    return out;
  }

  /**
   * Detect when a tank is physically overlapping a low wall and destroy it.
   * Tanks drive through walls — this provides the gameplay feedback that
   * the tank smashed the barrier rather than silently teleporting through it.
   *
   * Call once per frame for the player mesh and each enemy tank mesh.
   *
   * @param {import('three').Object3D} tankMesh
   */
  checkTankWallSmash(tankMesh) {
    const px  = tankMesh.position.x;
    const pz  = tankMesh.position.z;
    const r2  = TANK_SMASH_RADIUS * TANK_SMASH_RADIUS;

    for (const wall of this.walls) {
      if (!wall.alive) continue;
      const dx = px - wall.x;
      const dz = pz - wall.z;
      if (dx * dx + dz * dz < r2) {
        wall.takeDamage(99); // instant smash
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private builders
  // ---------------------------------------------------------------------------

  _buildBridges() {
    for (const river of RIVER_DEFS) {
      for (const bx of BRIDGE_X_POSITIONS) {
        this.bridges.push(
          new Bridge(this._scene, bx, river.centerZ, river.depth, this._terrain)
        );
      }
    }
  }

  _buildWalls() {
    for (const def of WALL_DEFS) {
      this.walls.push(
        new LowWall(this._scene, def.x, def.z, def.width, def.rotY, this._terrain)
      );
    }
  }
}
