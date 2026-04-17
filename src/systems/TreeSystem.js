/**
 * TreeSystem — owns all Tree instances on the map.
 *
 * Responsibilities:
 *  - Spawns 30 trees at random world positions (same density as the prior
 *    decorative trees in Terrain._addProps).
 *  - Exposes `this.trees` for projectile hit-testing in CollisionSystem.
 *  - `reset()` tears down the current tree set and respawns fresh trees,
 *    suitable for round reset.
 *
 * Trees are placed directly in the THREE.Scene (not as children of the
 * terrain mesh) so their world positions equal their group.position values,
 * which simplifies collision math.
 */

import { Tree } from '../entities/Tree.js';

const TREE_COUNT = 30;
/** Minimum XZ distance from world origin (spawn zone) to prevent trees
 *  blocking tank spawn. */
const SPAWN_CLEAR_RADIUS = 15;

export class TreeSystem {
  /**
   * @param {THREE.Scene}                              scene
   * @param {import('../entities/Terrain.js').Terrain} terrain
   */
  constructor(scene, terrain) {
    this._scene = scene;
    this._terrain = terrain;

    /** @type {Tree[]} All Tree instances (alive + dead). */
    this.trees = [];

    this._spawnTrees();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  _spawnTrees() {
    let placed = 0;
    let attempts = 0;
    // Attempt up to 5x count to hit the quota despite spawn-clear filtering
    while (placed < TREE_COUNT && attempts < TREE_COUNT * 5) {
      attempts++;
      const x = (Math.random() - 0.5) * 170;
      const z = (Math.random() - 0.5) * 170;
      if (Math.abs(x) < SPAWN_CLEAR_RADIUS && Math.abs(z) < SPAWN_CLEAR_RADIUS) {
        continue;
      }
      const groundY = this._terrain.getHeightAt(x, z);
      this.trees.push(new Tree(this._scene, x, z, groundY));
      placed++;
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Remove all trees from the scene and spawn a fresh set.
   * Call on round reset.
   */
  reset() {
    for (const tree of this.trees) {
      if (tree.alive) {
        tree.destroy();
      }
    }
    this.trees = [];
    this._spawnTrees();
  }
}
