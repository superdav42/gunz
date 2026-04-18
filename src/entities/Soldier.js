import * as THREE from 'three';
import { Projectile } from './Projectile.js';

/** Soldier stats — on-foot mode. See VISION.md "On-Foot Mode". */
const SOLDIER_STATS = {
  /** Max HP. A tank shell (25 dmg) kills in one hit; small-arms fire takes 2-4 hits. */
  maxHealth: 30,
  /** Seconds between shots — faster than a tank cannon (0.3s). */
  fireRate: 0.12,
  /** Damage per bullet — less than a tank shell (25 dmg). */
  damage: 8,
  /** Bullet speed — faster than tank shells for snappier feel. */
  bulletSpeed: 60,
  /** Movement speed (units/s). Faster than a tank (12 u/s). */
  moveSpeed: 16,
  /** Turn speed (rad/s). More agile than a tank (2.5 rad/s). */
  turnSpeed: 4.0,
};

const SOLDIER_COLORS = {
  player: { body: 0x1a3a6b, head: 0xf5c07a, gun: 0x333333 },
  enemy:  { body: 0x7a1a1a, head: 0xf5c07a, gun: 0x333333 },
};

export class Soldier {
  /**
   * @param {object} [opts]
   * @param {boolean} [opts.isPlayer=false]
   * @param {number}  [opts.teamId=1]   — 0 = player team, 1 = enemy team
   * @param {string}  [opts.name='']    — display name for kill feed
   */
  constructor({ isPlayer = false, teamId = 1, name = '' } = {}) {
    this.isPlayer = isPlayer;
    this.teamId = teamId;
    this.name = name || (isPlayer ? 'Player' : 'Enemy');

    this.health    = SOLDIER_STATS.maxHealth;
    this.maxHealth = SOLDIER_STATS.maxHealth;

    this.fireCooldown = 0;
    this.fireRate     = SOLDIER_STATS.fireRate;

    /** Movement constants exposed so PlayerController / AIController can read them. */
    this.moveSpeed = SOLDIER_STATS.moveSpeed;
    this.turnSpeed = SOLDIER_STATS.turnSpeed;

    // Per-round combat stats (mirrors Tank.js for scoreboard compatibility)
    this.kills       = 0;
    this.damageDealt = 0;

    const palette = isPlayer ? SOLDIER_COLORS.player : SOLDIER_COLORS.enemy;
    this.mesh   = this._buildMesh(palette);
    this.muzzle = this.mesh.getObjectByName('muzzle');
  }

  // ---------------------------------------------------------------------------
  // Mesh construction
  // ---------------------------------------------------------------------------

  /** @private */
  _buildMesh(palette) {
    const group = new THREE.Group();

    // Body — CapsuleGeometry: radius 0.35, length 0.7 → total height ≈ 1.4
    const bodyGeo = new THREE.CapsuleGeometry(0.35, 0.7, 4, 8);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: palette.body,
      roughness: 0.8,
      metalness: 0.1,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    // Capsule origin is at its geometric centre; lift so feet touch y=0
    body.position.y = 1.05; // 0.35 (bottom cap radius) + 0.35 (half length) + 0.35 (top cap) → 0.35+0.35=0.7 half-height → centre at 0.7 → so y=0.7 for feet on ground
    body.castShadow    = true;
    body.receiveShadow = false;
    group.add(body);

    // Head — small sphere above body
    const headGeo = new THREE.SphereGeometry(0.28, 8, 6);
    const headMat = new THREE.MeshStandardMaterial({
      color: palette.head,
      roughness: 0.9,
      metalness: 0.0,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.85; // body top (0.7 + 0.35 + 0.35 = 1.4) + neck gap + head radius
    head.castShadow = true;
    group.add(head);

    // Gun — small cylinder held at waist height, pointing forward (-Z)
    const gunGroup = new THREE.Group();
    gunGroup.position.set(0.25, 1.1, 0); // offset right slightly (right hand)

    const gunGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.9, 6);
    const gunMat = new THREE.MeshStandardMaterial({
      color: palette.gun,
      roughness: 0.5,
      metalness: 0.6,
    });
    const gun = new THREE.Mesh(gunGeo, gunMat);
    // Rotate so barrel points along -Z (forward)
    gun.rotation.x = Math.PI / 2;
    gun.position.z = -0.35; // centre of barrel shifted forward
    gun.castShadow = true;
    gunGroup.add(gun);

    // Muzzle point — world position used to spawn projectiles
    const muzzle = new THREE.Object3D();
    muzzle.name = 'muzzle';
    muzzle.position.z = -0.85; // tip of gun barrel
    gunGroup.add(muzzle);

    group.add(gunGroup);

    return group;
  }

  // ---------------------------------------------------------------------------
  // Combat
  // ---------------------------------------------------------------------------

  /** @returns {boolean} True if the cooldown has elapsed (no ammo limit for soldiers). */
  canFire() {
    return this.fireCooldown <= 0;
  }

  /**
   * Fire one bullet from the soldier's gun.
   * @returns {Projectile|null} New projectile, or null if on cooldown.
   */
  fire() {
    if (!this.canFire()) return null;

    this.fireCooldown = this.fireRate;

    const worldPos = new THREE.Vector3();
    this.muzzle.getWorldPosition(worldPos);

    const worldDir = new THREE.Vector3(0, 0, -1);
    this.muzzle.getWorldDirection(worldDir);

    return new Projectile({
      position:      worldPos,
      direction:     worldDir,
      isPlayerOwned: this.isPlayer,
      ownerTank:     this,   // "ownerTank" field is owner-agnostic in Projectile
      speed:         SOLDIER_STATS.bulletSpeed,
      damage:        SOLDIER_STATS.damage,
    });
  }

  /**
   * Apply incoming damage. HP is clamped to 0.
   * @param {number} amount
   */
  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
  }

  /**
   * Record damage dealt by this soldier (for scoreboard / rewards).
   * @param {number} amount
   */
  recordDamage(amount) {
    this.damageDealt += amount;
  }

  /** Record a kill credited to this soldier. */
  recordKill() {
    this.kills++;
  }

  // ---------------------------------------------------------------------------
  // Game loop
  // ---------------------------------------------------------------------------

  /** @param {number} dt — seconds since last frame */
  update(dt) {
    if (this.fireCooldown > 0) {
      this.fireCooldown -= dt;
    }
  }

  /** Reset to full health / stats for round start. */
  reset() {
    this.health       = this.maxHealth;
    this.fireCooldown = 0;
    this.kills        = 0;
    this.damageDealt  = 0;
  }
}
