/**
 * StructureSystem — owns and manages all Bridge and Wall instances on the map.
 *
 * Responsibilities:
 *  - Spawns predefined bridges and wall/fence segments at map start.
 *  - Exposes obstacle arrays consumed by CollisionSystem:
 *      • `bridgeRubbleObstacles` — circle obstacles along collapsed bridge spans.
 *        Used to block tank movement through rubble after destruction.
 *      • `wallObstacles`         — OBB descriptors for alive wall segments.
 *        Used for projectile absorption and tank-contact destruction.
 *  - `reset()` tears everything down and respawns for the next round.
 *
 * Map placements:
 *  Bridges create E-W and N-S chokepoints in the mid-field combat zone.
 *  Wall/fence segments are scattered at infantry-relevant positions, providing
 *  low cover and breakable obstacles for tanks to smash through.
 *
 * @module systems/StructureSystem
 */

import { Bridge } from '../entities/Bridge.js';
import { Wall }   from '../entities/Wall.js';

// ---------------------------------------------------------------------------
// Map definitions
// ---------------------------------------------------------------------------

/**
 * Bridge spawn definitions: [x, z, rotY].
 *   rotY = 0          → deck spans along world Z (N–S bridge).
 *   rotY = Math.PI/2  → deck spans along world X (E–W bridge).
 */
const BRIDGE_DEFS = [
  //  x      z     rotY             — comment
  [   0,   -25,  Math.PI / 2 ],    // Central E-W bridge at z=-25
  [  35,    10,  0           ],    // Right-flank N-S bridge at x=35
];

/**
 * Wall/fence segment definitions: [x, z, rotY, length].
 *   rotY = 0          → wall long-axis along world X (E–W wall).
 *   rotY = Math.PI/2  → wall long-axis along world Z (N–S wall).
 */
const WALL_DEFS = [
  //  x       z     rotY             len   — purpose
  [ -15,   -10,  Math.PI / 2,    5 ],     // Left mid-field cover, N-S
  [ -15,    12,  Math.PI / 2,    5 ],     // Left mid-field cover, N-S
  [  15,   -12,  Math.PI / 2,    5 ],     // Right mid-field cover, N-S
  [  15,    10,  Math.PI / 2,    5 ],     // Right mid-field cover, N-S
  [  -5,    20,  0,              4 ],     // Forward centre cover, E-W
  [   5,   -22,  0,              4 ],     // Rear centre cover, E-W
  [ -26,     0,  Math.PI / 4,    3 ],     // Left diagonal fence
  [  26,     5, -Math.PI / 4,    3 ],     // Right diagonal fence
  [ -40,    45,  0,              6 ],     // Team 0 south spawn perimeter
  [  40,    45,  0,              6 ],     // Team 0 south spawn perimeter
  [ -40,   -45,  0,              6 ],     // Team 1 north spawn perimeter
  [  40,   -45,  0,              6 ],     // Team 1 north spawn perimeter
];

// ---------------------------------------------------------------------------
// StructureSystem
// ---------------------------------------------------------------------------

export class StructureSystem {
  /**
   * @param {THREE.Scene}                              scene
   * @param {import('../entities/Terrain.js').Terrain} terrain
   */
  constructor(scene, terrain) {
    this._scene   = scene;
    this._terrain = terrain;

    /** @type {Bridge[]} All Bridge instances (alive + collapsed). */
    this.bridges = [];

    /** @type {Wall[]}   All Wall instances (alive only — destroyed walls are removed). */
    this.walls = [];

    this._spawn();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Circle obstacles from collapsed bridge rubble.
   * Format matches WreckSystem.obstacles: { x, z, radius }.
   * CollisionSystem uses these to push tanks back (bridges block movement
   * once destroyed, creating permanent rubble chokepoints).
   *
   * @returns {Array<{x: number, z: number, radius: number}>}
   */
  get bridgeRubbleObstacles() {
    const rubble = [];
    for (const b of this.bridges) {
      if (!b.alive) {
        for (const r of b.rubbleObstacles) rubble.push(r);
      }
    }
    return rubble;
  }

  /**
   * OBB descriptors for all alive wall segments.
   * Each entry includes a back-reference to the Wall instance so
   * CollisionSystem can call wall.takeDamage() or wall.destroy().
   *
   * @returns {Array<{wall: Wall, x: number, z: number, rotY: number,
   *                  halfLength: number, halfThickness: number, groundY: number}>}
   */
  get wallObstacles() {
    return this.walls
      .filter(w => w.alive)
      .map(w => ({
        wall:         w,
        x:            w.x,
        z:            w.z,
        rotY:         w.rotY,
        halfLength:   w.halfLength,
        halfThickness: w.halfThickness,
        groundY:      w.groundY,
      }));
  }

  /**
   * Remove all structures from the scene and respawn fresh instances.
   * Call on round reset.
   */
  reset() {
    for (const b of this.bridges) b.destroy();
    for (const w of this.walls)   w.destroy();
    this.bridges = [];
    this.walls   = [];
    this._spawn();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  _spawn() {
    for (const [x, z, rotY] of BRIDGE_DEFS) {
      const y = this._terrain.getHeightAt(x, z);
      this.bridges.push(new Bridge(this._scene, x, z, y, rotY));
    }

    for (const [x, z, rotY, length] of WALL_DEFS) {
      const y = this._terrain.getHeightAt(x, z);
      this.walls.push(new Wall(this._scene, x, z, y, rotY, length));
    }
  }
}
