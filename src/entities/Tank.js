import * as THREE from 'three';
import { Projectile } from './Projectile.js';

const TANK_COLORS = {
  player: { body: 0x2d5a27, turret: 0x3a7a33 },
  enemy: { body: 0x8b2500, turret: 0xb03000 },
};

export class Tank {
  /**
   * @param {object} [opts]
   * @param {boolean} [opts.isPlayer=false]
   * @param {number|null} [opts.color=null]       — override hull color (hex int)
   * @param {number|null} [opts.turretColor=null] — override turret color (hex int)
   * @param {number} [opts.teamId=1]              — 0 = player team, 1 = enemy team
   */
  constructor({ isPlayer = false, color = null, turretColor = null, teamId = 1 } = {}) {
    this.isPlayer = isPlayer;
    this.teamId = teamId;
    this.health = 100;
    this.maxHealth = 100;
    this.ammo = 30;
    this.fireCooldown = 0;
    this.fireRate = 0.3; // seconds between shots

    const base = isPlayer ? TANK_COLORS.player : TANK_COLORS.enemy;
    const palette = {
      body: color !== null ? color : base.body,
      turret: turretColor !== null ? turretColor : (color !== null ? color : base.turret),
    };

    this.mesh = this._buildMesh(palette);
    this.turret = this.mesh.getObjectByName('turret');
    this.barrel = this.mesh.getObjectByName('barrel');
    this.muzzle = this.mesh.getObjectByName('muzzle');
  }

  _buildMesh(palette) {
    const group = new THREE.Group();

    // Hull (body)
    const hullGeo = new THREE.BoxGeometry(3, 1.2, 4.5);
    const hullMat = new THREE.MeshStandardMaterial({
      color: palette.body,
      roughness: 0.7,
      metalness: 0.3,
    });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.position.y = 0.8;
    hull.castShadow = true;
    hull.receiveShadow = true;
    group.add(hull);

    // Track left
    const trackGeo = new THREE.BoxGeometry(0.6, 0.8, 4.8);
    const trackMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.9,
    });
    const trackL = new THREE.Mesh(trackGeo, trackMat);
    trackL.position.set(-1.6, 0.5, 0);
    trackL.castShadow = true;
    group.add(trackL);

    const trackR = trackL.clone();
    trackR.position.x = 1.6;
    group.add(trackR);

    // Turret base
    const turretGroup = new THREE.Group();
    turretGroup.name = 'turret';
    turretGroup.position.y = 1.5;

    const turretGeo = new THREE.CylinderGeometry(1.1, 1.3, 0.8, 8);
    const turretMat = new THREE.MeshStandardMaterial({
      color: palette.turret,
      roughness: 0.6,
      metalness: 0.4,
    });
    const turretMesh = new THREE.Mesh(turretGeo, turretMat);
    turretMesh.castShadow = true;
    turretGroup.add(turretMesh);

    // Barrel
    const barrelGeo = new THREE.CylinderGeometry(0.15, 0.18, 3.5, 8);
    const barrelMat = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.5,
      metalness: 0.6,
    });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.name = 'barrel';
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.1, -1.9);
    barrel.castShadow = true;
    turretGroup.add(barrel);

    // Muzzle point (for spawning projectiles)
    const muzzle = new THREE.Object3D();
    muzzle.name = 'muzzle';
    muzzle.position.set(0, 0.1, -3.6);
    turretGroup.add(muzzle);

    group.add(turretGroup);

    return group;
  }

  setTurretAngle(angle) {
    if (this.turret) {
      this.turret.rotation.y = angle - this.mesh.rotation.y;
    }
  }

  canFire() {
    return this.fireCooldown <= 0 && this.ammo > 0;
  }

  fire() {
    if (!this.canFire()) return null;

    this.fireCooldown = this.fireRate;
    if (this.isPlayer) this.ammo--;

    // Get world position and direction of muzzle
    const worldPos = new THREE.Vector3();
    this.muzzle.getWorldPosition(worldPos);

    const worldDir = new THREE.Vector3(0, 0, -1);
    this.muzzle.getWorldDirection(worldDir);

    return new Projectile({
      position: worldPos,
      direction: worldDir,
      isPlayerOwned: this.isPlayer,
      speed: 50,
      damage: 25,
    });
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
  }

  update(dt) {
    if (this.fireCooldown > 0) {
      this.fireCooldown -= dt;
    }
  }

  reset() {
    this.health = this.maxHealth;
    this.ammo = 30;
    this.fireCooldown = 0;
  }
}
