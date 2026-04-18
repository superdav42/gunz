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
 *  onDamageDealt(tank, amount)           — called when a player shell hits an enemy (every hit,
 *                                          including the lethal shot). Used by StatsTracker (t010).
 *  onTankKilled(tank, byPlayer)          — called just before an enemy tank is removed.
 *                                          byPlayer: true = player's shell was lethal.
 *                                          Used by StatsTracker for kill/assist accounting.
 *  onTreeHit(position)                   — called on every non-lethal shell hit on a tree
 *  onTreeDestroy(position)               — called when a shell destroys a tree
 *  onKillFeed(killer, victim)            — called on every tank kill for the kill feed UI
 *    killer: display name of the entity that scored the kill ('Player', 'Enemy #2', …)
 *    victim: display name of the destroyed tank
 *  onWallHit(position)                   — called on every non-lethal shell hit on a building wall
 *  onWallDestroy(position)               — called when a shell or tank destroys a building wall
 */
export class CollisionSystem {
  /**
   * @param {object} opts
   * @param {import('../entities/Terrain.js').Terrain}             opts.terrain
   * @param {import('../entities/Tank.js').Tank}                   opts.player
   * @param {import('./EnemySystem.js').EnemySystem}               opts.enemies
   * @param {import('./ProjectileSystem.js').ProjectileSystem}     opts.projectiles
   * @param {import('./TreeSystem.js').TreeSystem}                 [opts.treeSystem]
   * @param {import('./WreckSystem.js').WreckSystem}               [opts.wrecks]
   * @param {import('./BuildingSystem.js').BuildingSystem}         [opts.buildingSystem]
   */
  constructor({ terrain, player, enemies, projectiles, treeSystem = null, wrecks = null, buildingSystem = null }) {
    this.terrain = terrain;
    this.player = player;
    this.enemies = enemies;
    this.projectiles = projectiles;
    this.treeSystem = treeSystem;
    this.wrecks = wrecks;
    this.buildingSystem = buildingSystem;

    this._onScoreAdd = null;
    this._onPlayerDeath = null;
    this._onHit = null;
    this._onKill = null;
    this._onDamageDealt = null;
    this._onTankKilled = null;
    this._onTreeHit = null;
    this._onTreeDestroy = null;
    this._onKillFeed = null;
    this._onWallHit = null;
    this._onWallDestroy = null;

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

  /**
   * @param {(tank: import('../entities/Tank.js').Tank, amount: number) => void} cb
   */
  onDamageDealt(cb) {
    this._onDamageDealt = cb;
    return this;
  }

  /**
   * @param {(tank: import('../entities/Tank.js').Tank, byPlayer: boolean) => void} cb
   */
  onTankKilled(cb) {
    this._onTankKilled = cb;
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

  /** @param {(position: import('three').Vector3) => void} cb */
  onWallHit(cb) {
    this._onWallHit = cb;
    return this;
  }

  /** @param {(position: import('three').Vector3) => void} cb */
  onWallDestroy(cb) {
    this._onWallDestroy = cb;
    return this;
  }

  // ---------------------------------------------------------------------------
  // Per-frame entry point
  // ---------------------------------------------------------------------------

  update() {
    this._checkProjectileCollisions();
    this._checkTankObstacleCollisions();
    // Tank-smash building walls (tanks instantly destroy walls they drive into).
    if (this.buildingSystem) {
      this._checkTankBuildingCollisions();
    }
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
          // Cap actualDamage to remaining HP so scoreboard stats don't over-count overkill.
          const actualDamage = Math.min(p.damage, e.health);
          if (p.ownerTank) p.ownerTank.recordDamage(actualDamage);
          // StatsTracker callback also uses the capped value (t010).
          if (this._onDamageDealt) this._onDamageDealt(e, actualDamage);
          e.takeDamage(p.damage);
          this.projectiles.remove(i);

          if (e.health <= 0) {
            // Process direct-hit kill BEFORE splash (t032):
            // Ensures enemies.remove(j) uses the correct index before any
            // splash removal could shift the active list.
            if (p.ownerTank) p.ownerTank.recordKill();
            // Snapshot position+rotation before remove() clears the mesh from scene.
            const tankData = {
              position: e.mesh.position.clone(),
              rotationY: e.mesh.rotation.y,
            };
            if (this._onKillFeed) this._onKillFeed(this.player.name || 'Player', e.name || 'Enemy');
            if (this._onTankKilled) this._onTankKilled(e, true);
            this.enemies.remove(j);
            if (this._onKill) this._onKill(hitPos, 'player', tankData);
            if (this._onScoreAdd) this._onScoreAdd(100);
            // Splash AFTER direct-hit kill: e is already removed → pass null exclude. (t032)
            if (p.splashRadius > 0) {
              this._applySplashToEnemies(p, hitPos, null);
              if (this._onExplosion) this._onExplosion(hitPos, p.splashRadius);
            }
          } else {
            // Non-lethal hit: apply splash to nearby enemies then pick particle. (t032)
            if (p.splashRadius > 0) {
              this._applySplashToEnemies(p, hitPos, e); // exclude e (already hit)
              if (this._onExplosion) this._onExplosion(hitPos, p.splashRadius);
            } else {
              if (this._onHit) this._onHit(hitPos, 'player');
            }
          }
          break; // projectile consumed
        }
      }
    }

    // Enemy projectiles hitting the player tank
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (p.isPlayerOwned) continue;
      // Skip if the player is already dead (health=0 after killTank was called).
      // Without this guard, projectiles in-flight when the player dies would
      // re-trigger _onPlayerDeath on every subsequent frame they collide.
      if (player.health <= 0) continue;

      const dist = p.mesh.position.distanceTo(player.mesh.position);
      if (dist < 2.5) {
        const hitPos = p.mesh.position.clone();
        // Record damage dealt before applying it (health may clamp to 0)
        const actualDamage = Math.min(p.damage, player.health);
        if (p.ownerTank) p.ownerTank.recordDamage(actualDamage);
        player.takeDamage(p.damage);
        this.projectiles.remove(i);

        // Fire onExplosion for visual effect regardless of kill. (t032)
        if (p.splashRadius > 0) {
          if (this._onExplosion) this._onExplosion(hitPos, p.splashRadius);
        }

        if (player.health <= 0) {
          if (p.ownerTank) p.ownerTank.recordKill();
          const tankData = {
            position: player.mesh.position.clone(),
            rotationY: player.mesh.rotation.y,
          };
          if (this._onKillFeed) this._onKillFeed('Enemy', player.name || 'Player');
          if (this._onKill) this._onKill(hitPos, 'enemy', tankData);
          if (this._onPlayerDeath) this._onPlayerDeath();
        } else {
          // Only emit regular hit effect if NOT explosive. (t032)
          if (!p.isExplosive && this._onHit) this._onHit(hitPos, 'enemy');
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
            // Explosives detonating on wrecks still trigger splash. (t032)
            if (p.splashRadius > 0) {
              this._applySplashToEnemies(p, hitPos, null);
              this._applySplashToPlayer(p, hitPos, null);
              if (this._onExplosion) this._onExplosion(hitPos, p.splashRadius);
            } else {
              if (this._onHit) this._onHit(hitPos, 'wreck');
            }
            break; // projectile consumed
          }
        }
      }
    }

    // All projectiles vs destructible trees
    if (this.treeSystem) {
      this._checkProjectileTreeCollisions();
    }

    // All projectiles vs destructible building walls
    if (this.buildingSystem) {
      this._checkProjectileBuildingCollisions();
    }

    // Explosive projectiles that reach terrain level explode on impact. (t032)
    this._checkExplosiveTerrain();
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

        // Explosive projectiles hitting a tree also trigger splash damage. (t032)
        if (p.splashRadius > 0) {
          this._applySplashToEnemies(p, hitPos, null);
          this._applySplashToPlayer(p, hitPos, null);
          if (this._onExplosion) this._onExplosion(hitPos, p.splashRadius);
        }

        if (destroyed) {
          // treeSystem.destroyTree emits wood debris particles
          if (this._onTreeDestroy) this._onTreeDestroy(hitPos);
        } else if (!p.splashRadius) {
          if (this._onTreeHit) this._onTreeHit(hitPos);
        }

        break; // projectile consumed; skip remaining trees
      }
    }
  }

  /**
   * Explosive projectiles (splashRadius > 0) that descend to terrain level
   * detonate on ground contact. (t032)
   *
   * This handles grenades that arc past all tanks and land on the field, or
   * rockets that fly wide. The impact radius acts as an AoE even with no
   * direct hit.
   *
   * Ground detection: projectile Y ≤ terrain height + small clearance (0.4 u).
   * Uses the terrain already owned by this system — no extra references needed.
   */
  _checkExplosiveTerrain() {
    const projectiles = this.projectiles.active;

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (!p.isExplosive || !p.splashRadius) continue;

      const px = p.mesh.position.x;
      const py = p.mesh.position.y;
      const pz = p.mesh.position.z;
      const groundY = this.terrain.getHeightAt(px, pz);

      if (py > groundY + 0.4) continue; // still in flight

      // Detonate
      const hitPos = p.mesh.position.clone();
      this.projectiles.remove(i);

      this._applySplashToEnemies(p, hitPos, null);
      this._applySplashToPlayer(p, hitPos, null);

      if (this._onExplosion) this._onExplosion(hitPos, p.splashRadius);
    }
  }

  /**
   * Apply splash (area) damage from an explosive projectile to all enemy tanks
   * within `p.splashRadius`. Linear damage falloff: 100% at range 0, 0% at edge.
   *
   * Any enemy killed by splash triggers the full kill-callback chain so rewards,
   * kill feed, and TeamManager state stay consistent.
   *
   * @param {import('../entities/Projectile.js').Projectile} p           — exploding projectile
   * @param {import('three').Vector3}                        hitPos      — detonation position
   * @param {object|null}                                    excludeTank — direct-hit target to skip
   *   (already took direct damage; exclude to avoid double-applying)
   */
  _applySplashToEnemies(p, hitPos, excludeTank) {
    if (!p.isPlayerOwned) return; // enemy explosives don't splash enemies
    const radius = p.splashRadius;

    // Collect enemies in range first, then process kills after iteration.
    const inRange = [];
    for (const e of this.enemies.active) {
      if (e === excludeTank || e.health <= 0) continue;
      const dist = hitPos.distanceTo(e.mesh.position);
      if (dist >= radius) continue;

      const falloff   = 1 - dist / radius;
      const rawDmg    = p.damage * falloff;
      const cappedDmg = Math.min(rawDmg, e.health);

      if (this._onDamageDealt) this._onDamageDealt(e, cappedDmg);
      if (p.ownerTank) p.ownerTank.recordDamage(cappedDmg);
      e.takeDamage(rawDmg);

      if (e.health <= 0) {
        inRange.push(e);
      }
    }

    // Process splash kills: find current index by reference (list may have shrunk).
    for (const killed of inRange) {
      if (p.ownerTank) p.ownerTank.recordKill();
      const tankData = {
        position:  killed.mesh.position.clone(),
        rotationY: killed.mesh.rotation.y,
      };
      if (this._onKillFeed) this._onKillFeed(this.player.name || 'Player', killed.name || 'Enemy');
      if (this._onTankKilled) this._onTankKilled(killed, true);
      const idx = this.enemies.active.indexOf(killed);
      if (idx !== -1) this.enemies.remove(idx);
      if (this._onKill) this._onKill(hitPos, 'player', tankData);
      if (this._onScoreAdd) this._onScoreAdd(100);
    }
  }

  /**
   * Apply splash (area) damage from an enemy explosive to the player tank.
   *
   * @param {import('../entities/Projectile.js').Projectile} p           — exploding projectile
   * @param {import('three').Vector3}                        hitPos      — detonation position
   * @param {object|null}                                    excludeTank — direct-hit target to skip
   */
  _applySplashToPlayer(p, hitPos, excludeTank) {
    if (p.isPlayerOwned) return; // player explosives don't splash the player
    const player = this.player;
    if (player === excludeTank || player.health <= 0) return;

    const radius = p.splashRadius;
    const dist   = hitPos.distanceTo(player.mesh.position);
    if (dist >= radius) return;

    const falloff   = 1 - dist / radius;
    const rawDmg    = p.damage * falloff;
    const cappedDmg = Math.min(rawDmg, player.health);

    if (p.ownerTank) p.ownerTank.recordDamage(cappedDmg);
    player.takeDamage(rawDmg);

    if (player.health <= 0) {
      if (p.ownerTank) p.ownerTank.recordKill();
      const tankData = {
        position:  player.mesh.position.clone(),
        rotationY: player.mesh.rotation.y,
      };
      if (this._onKillFeed) this._onKillFeed('Enemy', player.name || 'Player');
      if (this._onKill) this._onKill(hitPos, 'enemy', tankData);
      if (this._onPlayerDeath) this._onPlayerDeath();
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

  // ---------------------------------------------------------------------------
  // Building collision helpers (t047)
  // ---------------------------------------------------------------------------

  /**
   * Check every active projectile against every alive building wall.
   *
   * Uses an AABB check in XZ combined with a vertical bounds check (so shells
   * flying at ground level below a wall base don't register).  Each wall
   * half-extent is padded by PROJ_R to account for the shell's own width and
   * prevent thin-wall tunnelling for slow-to-mid-speed shots.
   *
   * Explosive projectiles detonate on wall contact and apply splash as normal.
   * Non-explosive shells deal 1 damage; WALL_HP = 3, so 3 hits destroy a wall.
   */
  _checkProjectileBuildingCollisions() {
    const PROJ_R   = 0.35; // Shell radius buffer (world units)
    const projectiles = this.projectiles.active;
    const buildings   = this.buildingSystem.buildings;

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p  = projectiles[i];
      const px = p.mesh.position.x;
      const py = p.mesh.position.y;
      const pz = p.mesh.position.z;

      let consumed = false;

      for (const building of buildings) {
        if (consumed) break;

        for (let wi = 0; wi < building.walls.length; wi++) {
          const wall = building.walls[wi];
          if (!wall.alive) continue;

          // Padded AABB check in XZ plane
          if (
            px < wall.cx - wall.hw - PROJ_R || px > wall.cx + wall.hw + PROJ_R ||
            pz < wall.cz - wall.hd - PROJ_R || pz > wall.cz + wall.hd + PROJ_R
          ) continue;

          // Vertical bounds: wall spans (mesh.y - WALL_H/2) to (mesh.y + WALL_H/2)
          const wallMidY  = wall.mesh.position.y;
          const wallMinY  = wallMidY - 1.75; // WALL_H/2 = 1.75
          const wallMaxY  = wallMidY + 1.75;
          if (py < wallMinY - PROJ_R || py > wallMaxY + PROJ_R) continue;

          // Hit confirmed
          const hitPos = p.mesh.position.clone();
          this.projectiles.remove(i);

          // Explosives trigger splash before damaging the wall.
          if (p.splashRadius > 0) {
            this._applySplashToEnemies(p, hitPos, null);
            this._applySplashToPlayer(p, hitPos, null);
            if (this._onExplosion) this._onExplosion(hitPos, p.splashRadius);
          }

          const destroyed = building.damageWall(wi, p.damage);
          if (destroyed) {
            if (this._onWallDestroy) this._onWallDestroy(hitPos);
          } else if (!p.splashRadius) {
            if (this._onWallHit) this._onWallHit(hitPos);
          }

          consumed = true;
          break; // projectile consumed; skip remaining walls
        }
      }
    }
  }

  /**
   * Tank-smash mechanic: when a tank's circular footprint overlaps a building
   * wall's AABB, the wall is instantly destroyed (tanks smash through walls).
   *
   * The tank is NOT pushed back — it continues moving through the destroyed
   * wall gap.  This is intentional per the VISION ("Tanks smash through walls").
   *
   * All living tanks (player + all enemies) are checked each frame.
   */
  _checkTankBuildingCollisions() {
    const buildings = this.buildingSystem.buildings;
    const tankR     = this._tankRadius;

    const tanks = [this.player, ...this.enemies.active];

    for (const tank of tanks) {
      const tx = tank.mesh.position.x;
      const tz = tank.mesh.position.z;

      for (const building of buildings) {
        for (let wi = 0; wi < building.walls.length; wi++) {
          const wall = building.walls[wi];
          if (!wall.alive) continue;

          if (!this._circleOverlapsAABB(tx, tz, tankR, wall.cx, wall.cz, wall.hw, wall.hd)) {
            continue;
          }

          // Tank smash — instant destruction regardless of wall HP.
          const wallPos = wall.mesh.position.clone();
          building.damageWall(wi, 999); // 999 >> WALL_HP guarantees destruction
          if (this._onWallDestroy) this._onWallDestroy(wallPos);
        }
      }
    }
  }

  /**
   * Returns true if a circle (cx, cz, r) overlaps an axis-aligned rectangle
   * centred at (ax, az) with half-extents (hw, hd).
   *
   * Uses the standard "nearest point on AABB" approach which is correct for
   * all relative positions (inside, outside, corner).
   *
   * @param {number} cx  Circle centre X.
   * @param {number} cz  Circle centre Z.
   * @param {number} r   Circle radius.
   * @param {number} ax  AABB centre X.
   * @param {number} az  AABB centre Z.
   * @param {number} hw  AABB half-extent along X.
   * @param {number} hd  AABB half-extent along Z.
   * @returns {boolean}
   */
  _circleOverlapsAABB(cx, cz, r, ax, az, hw, hd) {
    const nearX = Math.max(ax - hw, Math.min(cx, ax + hw));
    const nearZ = Math.max(az - hd, Math.min(cz, az + hd));
    const dx    = cx - nearX;
    const dz    = cz - nearZ;
    return dx * dx + dz * dz < r * r;
  }
}
