/**
 * CollisionSystem — centralised collision detection and resolution.
 *
 * Handles:
 *  1. Projectile-vs-tank collisions (player ↔ enemy, bidirectional).
 *  2. Projectile-vs-wreck absorption: shells are consumed by wrecks (the
 *     wreck itself is indestructible, making it genuine cover).
 *  3. Projectile-vs-tree collisions: trees take shell damage and are destroyed
 *     when HP reaches zero, triggering debris particles.
 *  4. Tank-vs-obstacle blocking: pushes tanks out of rocks and living trees.
 *  5. Tank-vs-wreck blocking: same impulse resolve applied to WreckSystem
 *     obstacles so live tanks cannot drive through demolished hulls.
 *
 * Callbacks (set before first update):
 *  onScoreAdd(points)                    — called when an enemy tank is destroyed
 *  onPlayerDeath()                       — called when the player tank reaches 0 HP
 *  onHit(position, owner)                — called on every non-lethal shell impact
 *    owner: 'player' | 'enemy' | 'wreck'
 *  onKill(position, owner, tankData)     — called when a shell destroys a tank
 *    owner: 'player' (player shell hit enemy) | 'enemy' (enemy shell hit player)
 *    tankData: { position: Vector3, rotationY: number } — snapshot for wreck spawning
 *  onTreeHit(position)     — called on every non-lethal shell hit on a tree
 *  onTreeDestroy(position) — called when a shell destroys a tree
 *  onKillFeed(killer, victim) — called on every tank kill for the kill feed UI
 *    killer: display name of the entity that scored the kill ('Player', 'Enemy #2', …)
 *    victim: display name of the destroyed tank
 */
export class CollisionSystem {
  /**
   * @param {object} opts
   * @param {import('../entities/Terrain.js').Terrain}         opts.terrain
   * @param {import('../entities/Tank.js').Tank}               opts.player
   * @param {import('./EnemySystem.js').EnemySystem}           opts.enemies
   * @param {import('./ProjectileSystem.js').ProjectileSystem} opts.projectiles
   * @param {import('./TreeSystem.js').TreeSystem}             [opts.treeSystem]
   * @param {import('./WreckSystem.js').WreckSystem}           [opts.wrecks]
   */
  constructor({ terrain, player, enemies, projectiles, treeSystem = null, wrecks = null }) {
    this.terrain = terrain;
    this.player = player;
    this.enemies = enemies;
    this.projectiles = projectiles;
    this.treeSystem = treeSystem;
    this.wrecks = wrecks;

    this._onScoreAdd = null;
    this._onPlayerDeath = null;
    this._onHit = null;
    this._onKill = null;
    this._onTreeHit = null;
    this._onTreeDestroy = null;
    this._onKillFeed = null;

    /**
     * Approximate half-width of a tank hull for obstacle push-back.
     * Hull is BoxGeometry(3, 1.2, 4.5); circumradius ≈ 2.7, but 2.2 gives
     * comfortable collision without feeling too generous.
     */
    this._tankRadius = 2.2;

    /**
     * Maximum height above tree base (group.position.y) for shell-vs-tree
     * detection. Trunk (2u) + canopy (4u) = 6u total; 1u buffer added.
     */
    this._treeHitHeight = 7;

    /**
     * XZ hit radius for shell-vs-tree.  Canopy base radius is 1.5; +0.5 for
     * the shell's own width gives a comfortable but not over-generous hit zone.
     */
    this._treeHitRadius = 2.0;
  }

  // ---------------------------------------------------------------------------
  // Callback setters (fluent)
  // ---------------------------------------------------------------------------

  /** @param {(points: number) => void} cb */
  onScoreAdd(cb) {
    this._onScoreAdd = cb;
    return this;
  }

  /** @param {() => void} cb */
  onPlayerDeath(cb) {
    this._onPlayerDeath = cb;
    return this;
  }

  /**
   * @param {(position: import('three').Vector3, owner: string) => void} cb
   */
  onHit(cb) {
    this._onHit = cb;
    return this;
  }

  /**
   * @param {(
   *   position: import('three').Vector3,
   *   owner: string,
   *   tankData: {position: import('three').Vector3, rotationY: number}
   * ) => void} cb
   */
  onKill(cb) {
    this._onKill = cb;
    return this;
  }

  /** @param {(position: import('three').Vector3) => void} cb */
  onTreeHit(cb) {
    this._onTreeHit = cb;
    return this;
  }

  /** @param {(position: import('three').Vector3) => void} cb */
  onTreeDestroy(cb) {
    this._onTreeDestroy = cb;
    return this;
  }

  /**
   * Called once per tank kill with display names for the kill feed.
   * @param {(killer: string, victim: string) => void} cb
   */
  onKillFeed(cb) {
    this._onKillFeed = cb;
    return this;
  }

  // ---------------------------------------------------------------------------
  // Per-frame entry point
  // ---------------------------------------------------------------------------

  update() {
    this._checkProjectileCollisions();
    this._checkTankObstacleCollisions();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  _checkProjectileCollisions() {
    const projectiles = this.projectiles.active;
    const enemies = this.enemies.active;
    const player = this.player;

    // Player projectiles hitting enemy tanks
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (!p.isPlayerOwned) continue;

      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        const dist = p.mesh.position.distanceTo(e.mesh.position);
        if (dist < 2.5) {
          const hitPos = p.mesh.position.clone();
          e.takeDamage(p.damage);
          this.projectiles.remove(i);
          if (e.health <= 0) {
            // Snapshot position+rotation before remove() clears the mesh from scene
            const tankData = {
              position: e.mesh.position.clone(),
              rotationY: e.mesh.rotation.y,
            };
            if (this._onKillFeed) this._onKillFeed(this.player.name || 'Player', e.name || 'Enemy');
            this.enemies.remove(j);
            if (this._onKill) this._onKill(hitPos, 'player', tankData);
            if (this._onScoreAdd) this._onScoreAdd(100);
          } else {
            if (this._onHit) this._onHit(hitPos, 'player');
          }
          break; // projectile consumed
        }
      }
    }

    // Enemy projectiles hitting the player tank
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (p.isPlayerOwned) continue;

      const dist = p.mesh.position.distanceTo(player.mesh.position);
      if (dist < 2.5) {
        const hitPos = p.mesh.position.clone();
        player.takeDamage(p.damage);
        this.projectiles.remove(i);
        if (player.health <= 0) {
          const tankData = {
            position: player.mesh.position.clone(),
            rotationY: player.mesh.rotation.y,
          };
          if (this._onKillFeed) this._onKillFeed('Enemy', player.name || 'Player');
          if (this._onKill) this._onKill(hitPos, 'enemy', tankData);
          if (this._onPlayerDeath) this._onPlayerDeath();
        } else {
          if (this._onHit) this._onHit(hitPos, 'enemy');
        }
      }
    }

    // Projectiles hitting wrecks — absorbed (no damage, wreck is indestructible)
    if (this.wrecks) {
      const wreckObs = this.wrecks.obstacles;
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        for (const obs of wreckObs) {
          const dx = p.mesh.position.x - obs.x;
          const dz = p.mesh.position.z - obs.z;
          const distSq = dx * dx + dz * dz;
          const hitRadius = obs.radius + 0.3; // small fudge for shell size
          if (distSq < hitRadius * hitRadius) {
            const hitPos = p.mesh.position.clone();
            this.projectiles.remove(i);
            if (this._onHit) this._onHit(hitPos, 'wreck');
            break; // projectile consumed
          }
        }
      }
    }

    // All projectiles vs destructible trees
    if (this.treeSystem) {
      this._checkProjectileTreeCollisions();
    }
  }

  /**
   * Check every active projectile against every alive tree.
   *
   * Uses a 2D XZ distance check combined with a vertical bounds check so that
   * shells flying over a cleared area do not trigger phantom tree hits.
   * Delegates HP deduction to Tree.takeDamage() and debris emission to
   * TreeSystem.destroyTree().
   */
  _checkProjectileTreeCollisions() {
    const trees = this.treeSystem.trees;
    const projectiles = this.projectiles.active;
    const hitRadius = this._treeHitRadius;
    const maxHeight = this._treeHitHeight;

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      const px = p.mesh.position.x;
      const py = p.mesh.position.y;
      const pz = p.mesh.position.z;

      for (let j = trees.length - 1; j >= 0; j--) {
        const tree = trees[j];
        if (!tree.alive) continue;

        // Fast XZ distance check (squared, avoids sqrt)
        const dx = px - tree.x;
        const dz = pz - tree.z;
        if (dx * dx + dz * dz >= hitRadius * hitRadius) continue;

        // Vertical bounds: projectile must be within the tree column
        const baseY = tree.group.position.y;
        const relY = py - baseY;
        if (relY < -1 || relY > maxHeight) continue;

        // Hit confirmed
        const hitPos = p.mesh.position.clone();
        this.projectiles.remove(i);

        const destroyed = tree.takeDamage(p.damage);

        if (destroyed) {
          // treeSystem.destroyTree emits wood debris particles
          if (this._onTreeDestroy) this._onTreeDestroy(hitPos);
        } else {
          if (this._onTreeHit) this._onTreeHit(hitPos);
        }

        break; // projectile consumed; skip remaining trees
      }
    }
  }

  /**
   * After all movement, push tanks out of rocks (permanent), alive trees
   * (removed once destroyed), and wrecks (permanent until round reset).
   * Operates in the XZ plane only.
   */
  _checkTankObstacleCollisions() {
    // Rock obstacles are permanent — from terrain.obstacles
    const rockObs = this.terrain.obstacles;

    this._resolveObstacleCollision(this.player.mesh, rockObs);
    for (const enemy of this.enemies.active) {
      this._resolveObstacleCollision(enemy.mesh, rockObs);
    }

    // Alive trees act as dynamic obstacles
    if (this.treeSystem) {
      this._resolveTreeObstacleCollision(this.player.mesh);
      for (const enemy of this.enemies.active) {
        this._resolveTreeObstacleCollision(enemy.mesh);
      }
    }

    // Wrecks are indestructible cover — block all living tanks
    if (this.wrecks) {
      const wreckObs = this.wrecks.obstacles;
      if (wreckObs.length > 0) {
        this._resolveObstacleCollision(this.player.mesh, wreckObs);
        for (const enemy of this.enemies.active) {
          this._resolveObstacleCollision(enemy.mesh, wreckObs);
        }
      }
    }
  }

  /**
   * Resolve penetration between a tank mesh and each rock/wreck obstacle.
   *
   * @param {import('three').Object3D}             mesh
   * @param {Array<{x: number, z: number, radius: number}>} obstacles
   */
  _resolveObstacleCollision(mesh, obstacles) {
    const pos = mesh.position;
    const tankRadius = this._tankRadius;

    for (const obs of obstacles) {
      const dx = pos.x - obs.x;
      const dz = pos.z - obs.z;
      const distSq = dx * dx + dz * dz;
      const minDist = tankRadius + obs.radius;

      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq);
        if (dist < 0.001) {
          pos.x += minDist;
        } else {
          const overlap = minDist - dist;
          pos.x += (dx / dist) * overlap;
          pos.z += (dz / dist) * overlap;
        }
      }
    }
  }

  /**
   * Resolve penetration between a tank mesh and each alive tree.
   * Skips dead trees so tanks can drive through fallen positions.
   *
   * @param {import('three').Object3D} mesh
   */
  _resolveTreeObstacleCollision(mesh) {
    const pos = mesh.position;
    const tankRadius = this._tankRadius;
    const trees = this.treeSystem.trees;

    for (const tree of trees) {
      if (!tree.alive) continue;

      const dx = pos.x - tree.x;
      const dz = pos.z - tree.z;
      const distSq = dx * dx + dz * dz;
      const minDist = tankRadius + tree.radius;

      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq);
        if (dist < 0.001) {
          pos.x += minDist;
        } else {
          const overlap = minDist - dist;
          pos.x += (dx / dist) * overlap;
          pos.z += (dz / dist) * overlap;
        }
      }
    }
  }
}
