import * as THREE from 'three';
import { Tank } from '../entities/Tank.js';

const MAX_ENEMIES = 6;
const SPAWN_INTERVAL = 4; // seconds
const AGGRO_RANGE = 40;
const FIRE_RANGE = 25;

export class EnemySystem {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;
    this.active = [];
    this.spawnTimer = 2; // first spawn quicker
    this._projectileCallback = null;
  }

  /** Register a callback so enemies can fire projectiles into the system */
  onFire(callback) {
    this._projectileCallback = callback;
  }

  update(dt) {
    // Spawn logic
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.active.length < MAX_ENEMIES) {
      this._spawn();
      this.spawnTimer = SPAWN_INTERVAL;
    }

    const playerPos = this.player.mesh.position;

    for (const enemy of this.active) {
      enemy.update(dt);
      const pos = enemy.mesh.position;
      const dist = pos.distanceTo(playerPos);

      if (dist < AGGRO_RANGE) {
        // Face the player
        const angle = Math.atan2(
          playerPos.x - pos.x,
          playerPos.z - pos.z
        );

        // Rotate hull toward player
        const hullAngle = enemy.mesh.rotation.y;
        let diff = angle - hullAngle;
        // Normalize
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        enemy.mesh.rotation.y += Math.sign(diff) * Math.min(Math.abs(diff), 1.5 * dt);

        // Move toward player (stop at fire range)
        if (dist > FIRE_RANGE * 0.7) {
          enemy.mesh.translateZ(-6 * dt);
        }

        // Aim turret at player
        enemy.setTurretAngle(angle);

        // Fire
        if (dist < FIRE_RANGE && enemy.canFire()) {
          const projectile = enemy.fire();
          if (projectile && this._projectileCallback) {
            this._projectileCallback(projectile);
          }
        }
      }
    }
  }

  _spawn() {
    const enemy = new Tank({ isPlayer: false });

    // Spawn at random edge of arena
    const angle = Math.random() * Math.PI * 2;
    const radius = 60 + Math.random() * 20;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    enemy.mesh.position.set(x, 0, z);
    enemy.mesh.rotation.y = Math.atan2(-x, -z); // face center

    this.scene.add(enemy.mesh);
    this.active.push(enemy);
  }

  remove(index) {
    const enemy = this.active[index];
    this.scene.remove(enemy.mesh);
    this.active.splice(index, 1);
  }

  reset() {
    for (const e of this.active) {
      this.scene.remove(e.mesh);
    }
    this.active.length = 0;
    this.spawnTimer = 2;
  }
}
