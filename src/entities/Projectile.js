import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Shared geometries and materials — allocated once, reused across instances.
// ---------------------------------------------------------------------------

// Standard bullet — small sphere
const PROJECTILE_GEO = new THREE.SphereGeometry(0.2, 6, 6);
const PLAYER_MAT = new THREE.MeshStandardMaterial({
  color: 0xffdd44,
  emissive: 0xff8800,
  emissiveIntensity: 0.8,
});
const ENEMY_MAT = new THREE.MeshStandardMaterial({
  color: 0xff4444,
  emissive: 0xff0000,
  emissiveIntensity: 0.8,
});

// Grenade — larger olive-green sphere (arc trajectory, t032)
const GRENADE_GEO = new THREE.SphereGeometry(0.35, 6, 6);
const GRENADE_PLAYER_MAT = new THREE.MeshStandardMaterial({
  color: 0x5a7a2a,
  emissive: 0x2a4a0a,
  emissiveIntensity: 0.3,
  roughness: 0.8,
  metalness: 0.1,
});
const GRENADE_ENEMY_MAT = new THREE.MeshStandardMaterial({
  color: 0x7a3a2a,
  emissive: 0x4a1a0a,
  emissiveIntensity: 0.3,
  roughness: 0.8,
  metalness: 0.1,
});

// Rocket — slightly larger glowing sphere (direct trajectory, t032)
const ROCKET_GEO = new THREE.SphereGeometry(0.28, 6, 6);
const ROCKET_PLAYER_MAT = new THREE.MeshStandardMaterial({
  color: 0xcccccc,
  emissive: 0xff4400,
  emissiveIntensity: 1.2,
  metalness: 0.6,
  roughness: 0.3,
});
const ROCKET_ENEMY_MAT = new THREE.MeshStandardMaterial({
  color: 0x999999,
  emissive: 0xff2200,
  emissiveIntensity: 1.2,
  metalness: 0.6,
  roughness: 0.3,
});

// ---------------------------------------------------------------------------
// Gravity multipliers per projectile type
// ---------------------------------------------------------------------------

/** Full ballistic arc: grenade launcher (isArc = true). */
const GRAVITY_ARC      = 1.0;
/** Rocket: flies nearly straight (isExplosive = true, isArc = false). */
const GRAVITY_ROCKET   = 0.05;
/** Standard bullet: mild drop over long range. */
const GRAVITY_STANDARD = 0.3;

// ---------------------------------------------------------------------------
// Projectile
// ---------------------------------------------------------------------------

export class Projectile {
  /**
   * @param {object} opts
   * @param {import('three').Vector3} opts.position        World-space spawn position.
   * @param {import('three').Vector3} opts.direction       Normalised fire direction.
   * @param {boolean} opts.isPlayerOwned                   Owner team flag.
   * @param {number}  [opts.speed=50]                      Initial speed (units/s).
   * @param {number}  [opts.damage=25]                     Base damage per hit.
   * @param {object|null} [opts.ownerTank=null]            Firing entity (for attribution).
   * @param {number}  [opts.splashRadius=0]                AoE radius (0 = point damage only). (t032)
   * @param {boolean} [opts.isArc=false]                   If true: strong gravity, ballistic arc. (t032)
   * @param {boolean} [opts.isExplosive=false]             If true: splash-eligible, explosive visual. (t032)
   */
  constructor({
    position,
    direction,
    isPlayerOwned,
    speed = 50,
    damage = 25,
    ownerTank = null,
    splashRadius = 0,
    isArc = false,
    isExplosive = false,
  }) {
    this.isPlayerOwned = isPlayerOwned;
    this.ownerTank     = ownerTank;
    this.speed         = speed;
    this.damage        = damage;
    this.splashRadius  = splashRadius;
    this.isArc         = isArc;
    this.isExplosive   = isExplosive;

    // Longer lifetime for slow arc projectiles that need travel time.
    this.lifetime = isArc ? 6 : 3;
    this.age      = 0;

    // Gravity multiplier determines trajectory shape.
    if (isArc) {
      this._gravityMult = GRAVITY_ARC;
    } else if (isExplosive) {
      this._gravityMult = GRAVITY_ROCKET;
    } else {
      this._gravityMult = GRAVITY_STANDARD;
    }

    // Select geometry and material based on weapon type.
    let geo, mat;
    if (isArc) {
      geo = GRENADE_GEO;
      mat = isPlayerOwned ? GRENADE_PLAYER_MAT : GRENADE_ENEMY_MAT;
    } else if (isExplosive) {
      geo = ROCKET_GEO;
      mat = isPlayerOwned ? ROCKET_PLAYER_MAT : ROCKET_ENEMY_MAT;
    } else {
      geo = PROJECTILE_GEO;
      mat = isPlayerOwned ? PLAYER_MAT : ENEMY_MAT;
    }

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(position);

    this.velocity = direction.clone().normalize().multiplyScalar(speed);
  }

  update(dt) {
    this.mesh.position.addScaledVector(this.velocity, dt);
    this.age += dt;

    // Apply gravity based on weapon type.
    this.velocity.y -= 9.8 * this._gravityMult * dt;

    return this.age < this.lifetime && this.mesh.position.y > -1;
  }
}
