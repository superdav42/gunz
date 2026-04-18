/**
 * BuildingSystem — owns all Building instances on the map.
 *
 * Responsibilities:
 *  - Spawns BUILDING_COUNT buildings at pseudo-random world positions,
 *    avoiding the tank spawn zones and the map centre so combat is not
 *    immediately obstructed.
 *  - Exposes `this.buildings` for CollisionSystem (projectile hit-tests and
 *    tank-smash checks).
 *  - `reset()` tears down the current building set and respawns a fresh one,
 *    suitable for round reset.
 *
 * Building layout notes:
 *  - MAP_RANGE (150) keeps buildings well inside the 200-unit terrain boundary.
 *  - SPAWN_CLEAR_RADIUS (22) prevents buildings from appearing inside the
 *    central combat spawn zone.
 *  - The team spawn exclusion band (|z| ≈ 45-65) keeps the area immediately
 *    behind each team's start position clear so tanks can move freely.
 */

import { Building } from '../entities/Building.js';

const BUILDING_COUNT        = 7;
/** Minimum XZ distance from world origin to prevent buildings blocking spawns. */
const SPAWN_CLEAR_RADIUS    = 22;
/** Spread of random placement in each axis. */
const MAP_RANGE             = 150;
/** Band around the team spawn rows (z ≈ ±55) that must stay clear. */
const SPAWN_BAND_CENTRE_Z   = 55;
const SPAWN_BAND_HALF_WIDTH = 14;

export class BuildingSystem {
  /**
   * @param {THREE.Scene}                              scene
   * @param {import('../entities/Terrain.js').Terrain} terrain
   */
  constructor(scene, terrain) {
    this._scene   = scene;
    this._terrain = terrain;

    /** @type {import('../entities/Building.js').Building[]} */
    this.buildings = [];

    this._spawnBuildings();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  _spawnBuildings() {
    let placed   = 0;
    let attempts = 0;
    // Allow up to 10× the target count in attempts to handle exclusion zones.
    while (placed < BUILDING_COUNT && attempts < BUILDING_COUNT * 10) {
      attempts++;
      const x = (Math.random() - 0.5) * MAP_RANGE;
      const z = (Math.random() - 0.5) * MAP_RANGE;

      // Skip positions too close to the map centre (tank spawn zone).
      if (Math.abs(x) < SPAWN_CLEAR_RADIUS && Math.abs(z) < SPAWN_CLEAR_RADIUS) {
        continue;
      }

      // Skip the rows immediately around each team's spawn zone.
      if (Math.abs(Math.abs(z) - SPAWN_BAND_CENTRE_Z) < SPAWN_BAND_HALF_WIDTH) {
        continue;
      }

      const groundY = this._terrain.getHeightAt(x, z);
      this.buildings.push(new Building(this._scene, x, z, groundY));
      placed++;
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Remove all buildings from the scene and respawn a fresh set.
   * Call on round reset so walls are restored to full HP.
   */
  reset() {
    for (const building of this.buildings) {
      building.destroy();
    }
    this.buildings = [];
    this._spawnBuildings();
  }
}
