import * as THREE from 'three';
import { Tank } from '../entities/Tank.js';
import { Terrain } from '../entities/Terrain.js';
import { InputSystem } from '../systems/InputSystem.js';
import { ProjectileSystem } from '../systems/ProjectileSystem.js';
import { EnemySystem } from '../systems/EnemySystem.js';
import { CollisionSystem } from '../systems/CollisionSystem.js';
import { HUD } from '../ui/HUD.js';
import { CameraController } from '../systems/CameraController.js';

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

    // Terrain
    this.terrain = new Terrain();
    this.scene.add(this.terrain.mesh);

    // Player tank
    this.player = new Tank({ isPlayer: true });
    this.player.mesh.position.set(0, 0, 0);
    this.scene.add(this.player.mesh);
  }

  _initSystems() {
    this.input = new InputSystem(this.canvas);
    this.cameraController = new CameraController(this.camera, this.player);
    this.projectiles = new ProjectileSystem(this.scene);
    this.enemies = new EnemySystem(this.scene, this.player);

    // Route enemy fire into the shared projectile pool
    this.enemies.onFire(p => this.projectiles.add(p));

    this.collision = new CollisionSystem({
      terrain: this.terrain,
      player: this.player,
      enemies: this.enemies,
      projectiles: this.projectiles,
    });
    this.collision
      .onScoreAdd(pts => { this.score += pts; })
      .onPlayerDeath(() => this._gameOver());

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

    // Update player from input
    this._updatePlayer(dt);

    // Update systems
    this.projectiles.update(dt);
    this.enemies.update(dt);
    this.cameraController.update(dt);

    // Collision detection (projectiles + tank-vs-obstacle blocking)
    this.collision.update();

    // HUD
    this.hud.update({
      score: this.score,
      health: this.player.health,
      ammo: this.player.ammo,
    });

    this.renderer.render(this.scene, this.camera);
  }

  _updatePlayer(dt) {
    const input = this.input.getState();

    // Movement
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

    // Turret aim (touch/mouse)
    if (input.turretAngle !== null) {
      this.player.setTurretAngle(input.turretAngle);
    }

    // Fire
    if (input.fire && this.player.canFire()) {
      const projectile = this.player.fire();
      if (projectile) {
        this.projectiles.add(projectile);
      }
    }

    // Keep on terrain
    const pos = this.player.mesh.position;
    pos.y = this.terrain.getHeightAt(pos.x, pos.z);

    // Clamp to arena
    const bound = 90;
    pos.x = THREE.MathUtils.clamp(pos.x, -bound, bound);
    pos.z = THREE.MathUtils.clamp(pos.z, -bound, bound);
  }

  _gameOver() {
    this.isRunning = false;
    this.hud.showGameOver(this.score);
  }

  restart() {
    this.score = 0;
    this.player.reset();
    this.player.mesh.position.set(0, 0, 0);
    this.player.mesh.rotation.set(0, 0, 0);
    this.enemies.reset();
    this.projectiles.reset();
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
