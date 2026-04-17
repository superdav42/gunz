/**
 * CollisionSystem — centralised collision detection and resolution.
 *
 * Handles:
 *  1. Projectile-vs-tank collisions (player ↔ enemy, bidirectional).
 *  2. Tank-vs-obstacle blocking: pushes tanks out of rocks/trees registered
 *     in Terrain.obstacles so they cannot pass through scenery.
 *
 * Callbacks (set before first update):
 *  onScoreAdd(points)      — called when an enemy tank is destroyed
 *  onPlayerDeath()         — called when the player tank reaches 0 HP
 *  onHit(position, owner)  — called on every non-lethal shell impact
 *  onKill(position, owner) — called when a shell destroys a tank
 *    owner: 'player' (player shell hit enemy) | 'enemy' (enemy shell hit player)
 */
export class CollisionSystem {
  /**
   * @param {object} opts
   * @param {import('../entities/Terrain.js').Terrain} opts.terrain
   * @param {import('../entities/Tank.js').Tank} opts.player
   * @param {import('./EnemySystem.js').EnemySystem} opts.enemies
   * @param {import('./ProjectileSystem.js').ProjectileSystem} opts.projectiles
   */
  constructor({ terrain, player, enemies, projectiles }) {
    this.terrain = terrain;
    this.player = player;
    this.enemies = enemies;
    this.projectiles = projectiles;

    this._onScoreAdd = null;
    this._onPlayerDeath = null;
    this._onHit = null;
    this._onKill = null;

    /**
     * Approximate half-width of a tank hull for obstacle push-back.
     * Hull is BoxGeometry(3, 1.2, 4.5); circumradius ≈ 2.7, but 2.2 gives
     * comfortable collision without feeling too generous.
     */
    this._tankRadius = 2.2;
  }

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
   * @param {(position: import('three').Vector3, owner: 'player'|'enemy') => void} cb
   */
  onHit(cb) {
    this._onHit = cb;
    return this;
  }

  /**
   * @param {(position: import('three').Vector3, owner: 'player'|'enemy') => void} cb
   */
  onKill(cb) {
    this._onKill = cb;
    return this;
  }

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
            if (this._onKill) this._onKill(hitPos, 'player');
            this.enemies.remove(j);
            if (this._onScoreAdd) this._onScoreAdd(100);
          } else {
            if (this._onHit) this._onHit(hitPos, 'player');
          }
          break; // projectile consumed; skip remaining enemies
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
        if (this._onHit) this._onHit(hitPos, 'enemy');
        if (player.health <= 0) {
          if (this._onKill) this._onKill(hitPos, 'enemy');
          if (this._onPlayerDeath) this._onPlayerDeath();
        }
      }
    }
  }

  /**
   * After all movement has been applied, push any tank that overlaps an
   * obstacle back to the nearest non-penetrating position.  This is a
   * simple impulse-based resolve: one correction vector per obstacle per
   * frame, which is stable for tanks moving at typical speeds (≤ 12 u/s).
   */
  _checkTankObstacleCollisions() {
    const obstacles = this.terrain.obstacles;
    if (!obstacles || obstacles.length === 0) return;

    this._resolveObstacleCollision(this.player.mesh, obstacles);

    for (const enemy of this.enemies.active) {
      this._resolveObstacleCollision(enemy.mesh, obstacles);
    }
  }

  /**
   * Resolve penetration between a tank mesh and each obstacle in the list.
   * Operates only in the XZ plane — Y is handled by terrain height.
   *
   * @param {import('three').Object3D} mesh
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
          // Tank is exactly on top of obstacle — push along +X arbitrarily
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
