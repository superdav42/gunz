import * as THREE from 'three';
import { Terrain } from '../entities/Terrain.js';
import { InputSystem } from '../systems/InputSystem.js';
import { ProjectileSystem } from '../systems/ProjectileSystem.js';
import { CollisionSystem } from '../systems/CollisionSystem.js';
import { ParticleSystem } from '../systems/ParticleSystem.js';
import { TreeSystem } from '../systems/TreeSystem.js';
import { WreckSystem } from '../systems/WreckSystem.js';
import { HUD } from '../ui/HUD.js';
import { CameraController } from '../systems/CameraController.js';
import { TeamManager } from './TeamManager.js';

// Simple AI constants (temporary — will be replaced by AIController in t007)
const AI_AGGRO_RANGE = 50;
const AI_FIRE_RANGE = 30;
const AI_MOVE_SPEED = 6;
const AI_TURN_SPEED = 1.5;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.score = 0;
    this.isRunning = false;

    this._initRenderer();
    this._initScene();
    this._initSystems();

    window.addEventListener('resize', () => this._onResize());
    this._onResize();
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 80, 200);

    // Lighting
    const ambient = new THREE.AmbientLight(0x6688cc, 0.5);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffeedd, 1.5);
    sun.position.set(50, 80, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    this.scene.add(sun);

    // Camera
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);

    // Terrain (rocks only — trees managed by TreeSystem)
    this.terrain = new Terrain();
    this.scene.add(this.terrain.mesh);

    // TeamManager creates all 12 tanks and places them on the field.
    // this.player is a convenience alias to teams[0].slots[0].tank.
    this.teams = new TeamManager(this.scene, this.terrain);
    this.player = this.teams.player;
  }

  _initSystems() {
    this.input = new InputSystem(this.canvas);
    this.cameraController = new CameraController(this.camera, this.player);
    this.projectiles = new ProjectileSystem(this.scene);
    this.particles = new ParticleSystem(this.scene);
    // TreeSystem spawns tree entities with HP; CollisionSystem handles shell hits
    this.trees = new TreeSystem(this.scene, this.terrain);
    // WreckSystem — demolished tanks become cover props on the field
    this.wrecks = new WreckSystem(this.scene);

    // Dust-emission timers
    this._playerDustTimer = 0;
    this._enemyDustTimer = 0;

    /**
     * CollisionSystem compatibility adapter.
     * CollisionSystem expects enemies.active (Tank[]) and enemies.remove(j).
     * We delegate to TeamManager so kills are tracked correctly.
     */
    const teams = this.teams;
    this._enemiesAdapter = {
      get active() { return teams.getEnemyTanks(); },
      remove: (j) => {
        const living = teams.getEnemyTanks();
        if (living[j]) {
          teams.killTank(living[j]);
        }
      },
    };

    this.collision = new CollisionSystem({
      terrain: this.terrain,
      player: this.player,
      enemies: this._enemiesAdapter,
      projectiles: this.projectiles,
      treeSystem: this.trees,
      wrecks: this.wrecks,
    });

    this.collision
      .onScoreAdd(pts => { this.score += pts; })
      .onPlayerDeath(() => this._gameOver())
      .onHit((pos) => {
        this.particles.emitExplosion(pos, { count: 15, speed: 6, lifetime: 0.6 });
      })
      .onKill((pos, owner, tankData) => {
        this.particles.emitExplosion(pos, { count: 35, speed: 10 });
        // Leave a wreck at the tank's last position as indestructible cover
        if (tankData) {
          this.wrecks.add(tankData.position, tankData.rotationY);
        }
      })
      .onTreeHit((pos) => {
        // Small impact burst to show the tree was hit
        this.particles.emitExplosion(pos, { count: 8, speed: 4, lifetime: 0.4 });
      })
      .onTreeDestroy((pos) => {
        // Full debris burst when tree is felled
        this.particles.emitTreeDebris(pos);
      });

    // Notify on team elimination (will be consumed by MatchManager in t008)
    this.teams.onTeamEliminated((teamId) => {
      const winner = teamId === 1 ? 'Player Team' : 'Enemy Team';
      console.info(`[TeamManager] Team ${teamId} eliminated — ${winner} wins the round.`);
    });

    this.hud = new HUD();
  }

  start() {
    this.isRunning = true;
    this.clock.start();
    this._loop();
  }

  _loop() {
    if (!this.isRunning) return;
    requestAnimationFrame(() => this._loop());

    const dt = Math.min(this.clock.getDelta(), 0.05);

    // Player input
    this._updatePlayer(dt);

    // Temporary AI for enemy tanks (replaced by AIController in t007)
    this._updateEnemyAI(dt);

    // Ally AI placeholder — friendly tanks hold position for now
    // (AIController in t007 will add proper target-selection for allies too)

    // Update each alive tank's fire cooldown
    for (const tank of this.teams.getAllLivingTanks()) {
      tank.update(dt);
    }

    // Systems
    this.projectiles.update(dt);
    this.particles.update(dt);
    this.cameraController.update(dt);
    this.collision.update();

    // Dust trails for living enemy tanks
    this._enemyDustTimer -= dt;
    if (this._enemyDustTimer <= 0) {
      this._enemyDustTimer = 0.15;
      for (const tank of this.teams.getEnemyTanks()) {
        this.particles.emitDust(tank.mesh.position);
      }
    }

    // HUD
    this.hud.update({
      score: this.score,
      health: this.player.health,
      ammo: this.player.ammo,
    });

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Minimal enemy AI: face and advance toward player, fire when in range.
   * Temporary placeholder — AIController (t007) will replace this with
   * proper target-selection per team.
   *
   * @param {number} dt
   */
  _updateEnemyAI(dt) {
    const playerPos = this.player.mesh.position;

    for (const enemy of this.teams.getEnemyTanks()) {
      const pos = enemy.mesh.position;
      const dist = pos.distanceTo(playerPos);

      if (dist > AI_AGGRO_RANGE) continue;

      // Turn hull toward player
      const targetAngle = Math.atan2(playerPos.x - pos.x, playerPos.z - pos.z);
      const hullAngle = enemy.mesh.rotation.y;
      let diff = targetAngle - hullAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      enemy.mesh.rotation.y += Math.sign(diff) * Math.min(Math.abs(diff), AI_TURN_SPEED * dt);

      // Advance if beyond optimal fire range
      if (dist > AI_FIRE_RANGE * 0.7) {
        enemy.mesh.translateZ(-AI_MOVE_SPEED * dt);
      }

      // Keep on terrain
      pos.y = this.terrain.getHeightAt(pos.x, pos.z);

      // Clamp to arena
      const bound = 90;
      pos.x = THREE.MathUtils.clamp(pos.x, -bound, bound);
      pos.z = THREE.MathUtils.clamp(pos.z, -bound, bound);

      // Aim turret and fire
      enemy.setTurretAngle(targetAngle);
      if (dist < AI_FIRE_RANGE && enemy.canFire()) {
        const projectile = enemy.fire();
        if (projectile) {
          this.projectiles.add(projectile);
          const flashDir = projectile.velocity.clone().normalize();
          this.particles.emitMuzzleFlash(
            projectile.mesh.position.clone(),
            flashDir
          );
        }
      }
    }
  }

  _updatePlayer(dt) {
    const input = this.input.getState();

    const moveSpeed = 12;
    const turnSpeed = 2.5;

    if (input.forward) {
      this.player.mesh.translateZ(-moveSpeed * dt);
    }
    if (input.backward) {
      this.player.mesh.translateZ(moveSpeed * 0.6 * dt);
    }
    if (input.left) {
      this.player.mesh.rotation.y += turnSpeed * dt;
    }
    if (input.right) {
      this.player.mesh.rotation.y -= turnSpeed * dt;
    }

    if (input.turretAngle !== null) {
      this.player.setTurretAngle(input.turretAngle);
    }

    if (input.fire && this.player.canFire()) {
      const projectile = this.player.fire();
      if (projectile) {
        this.projectiles.add(projectile);
        const flashDir = projectile.velocity.clone().normalize();
        this.particles.emitMuzzleFlash(
          projectile.mesh.position.clone(),
          flashDir
        );
      }
    }

    // Keep on terrain
    const pos = this.player.mesh.position;
    pos.y = this.terrain.getHeightAt(pos.x, pos.z);

    // Clamp to arena
    const bound = 90;
    pos.x = THREE.MathUtils.clamp(pos.x, -bound, bound);
    pos.z = THREE.MathUtils.clamp(pos.z, -bound, bound);

    // Dust trail while moving
    this._playerDustTimer -= dt;
    if (this._playerDustTimer <= 0 && (input.forward || input.backward)) {
      this._playerDustTimer = 0.15;
      this.particles.emitDust(this.player.mesh.position);
    }
  }

  _gameOver() {
    this.isRunning = false;
    this.hud.showGameOver(this.score);
  }

  restart() {
    this.score = 0;
    this.teams.reset();
    this.projectiles.reset();
    this.particles.reset();
    this.trees.reset();
    this.wrecks.reset();
    this._playerDustTimer = 0;
    this._enemyDustTimer = 0;
    this.hud.hideGameOver();
    this.start();
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
