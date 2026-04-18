import * as THREE from 'three';
import { Projectile } from './Projectile.js';
import { getGunDef, getMeleeDef } from '../data/WeaponDefs.js';

/** Soldier base stats — on-foot mode. See VISION.md "On-Foot Mode". */
const SOLDIER_STATS = {
  /** Max HP. A tank shell (25 dmg) kills in one hit; small-arms fire takes 2-4 hits. */
  maxHealth: 30,
  /** Movement speed (units/s). Faster than a tank (12 u/s). */
  moveSpeed: 16,
  /** Turn speed (rad/s). More agile than a tank (2.5 rad/s). */
  turnSpeed: 4.0,
};

const SOLDIER_COLORS = {
  player: { body: 0x1a3a6b, head: 0xf5c07a, gun: 0x333333 },
  enemy:  { body: 0x7a1a1a, head: 0xf5c07a, gun: 0x333333 },
};

/**
 * Apply random spread to a normalised direction vector.
 *
 * Builds a random axis in the plane perpendicular to `dir` then rotates `dir`
 * around it by a random angle in [0, spreadRad].
 *
 * @param {THREE.Vector3} dir       — normalised aim direction (not mutated)
 * @param {number}        spreadDeg — spread cone half-angle in degrees (0 = no spread)
 * @returns {THREE.Vector3} new normalised direction with spread applied
 */
function _applySpread(dir, spreadDeg) {
  if (spreadDeg <= 0) return dir.clone();

  const spreadRad = THREE.MathUtils.degToRad(spreadDeg);

  // Pick an arbitrary vector not parallel to dir to build a perpendicular axis.
  const arbitary = Math.abs(dir.x) < 0.9
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 1, 0);
  const perp = new THREE.Vector3().crossVectors(dir, arbitary).normalize();

  // Rotate perp around dir by a random azimuth → random axis in the perp plane.
  const axis = perp.clone().applyAxisAngle(dir, Math.random() * Math.PI * 2);

  // Rotate dir by a random elevation within the spread cone.
  return dir.clone().applyAxisAngle(axis, Math.random() * spreadRad).normalize();
}

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

    /** Movement constants exposed so PlayerController / AIController can read them. */
    this.moveSpeed = SOLDIER_STATS.moveSpeed;
    this.turnSpeed = SOLDIER_STATS.turnSpeed;

    // ---- Gun weapon state (t030/t031) ----
    /** Active gun weapon id. Defaults to free starter pistol. */
    this.gunWeaponId = 'pistol';

    // Cache stats from WeaponDefs so hot-path fire() doesn't look them up.
    const _startGun = getGunDef('pistol');
    /** Damage per bullet. */
    this._gunDamage          = _startGun.damage;
    /** Seconds between shots (1 / fireRate). */
    this._gunFireInterval    = 1 / _startGun.fireRate;
    /** Effective range in world units (informational — not enforced by Projectile). */
    this._gunRange           = _startGun.range;
    /** Max rounds before reload. */
    this._gunClipSize        = _startGun.clipSize;
    /** Seconds to complete a reload. */
    this._gunReloadTime      = _startGun.reloadTime;
    /** Spread cone half-angle in degrees at default engagement range. */
    this._gunSpread          = _startGun.spread;
    /** Projectile travel speed in world-units/s. */
    this._gunProjectileSpeed = _startGun.projectileSpeed;
    /** Pellets fired per trigger pull (1 for all guns except shotgun). */
    this._gunPelletsPerShot  = _startGun.pelletsPerShot ?? 1;
    /** AoE splash radius in world units. 0 = point damage only. (t032) */
    this._gunSplashRadius    = _startGun.splashRadius ?? 0;
    /** Ballistic arc trajectory (grenade launcher). (t032) */
    this._gunIsArc           = _startGun.isArc ?? false;
    /** Explosive weapon — splash-eligible and visually distinct. (t032) */
    this._gunIsExplosive     = _startGun.isExplosive ?? false;

    /** Current rounds remaining in the clip. */
    this.clipCurrent = _startGun.clipSize;
    /** True while a reload animation is in progress. */
    this.isReloading = false;
    /** Seconds remaining until reload completes (counts down from reloadTime). */
    this._reloadTimer = 0;

    /** Seconds until the next shot is allowed. */
    this.fireCooldown = 0;

    // ---- Melee weapon state (t026) ----
    /** Active melee weapon id. Defaults to starter combat knife. */
    this.meleeWeaponId = 'combatKnife';
    /** Seconds until next melee swing is allowed. */
    this.meleeCooldown = 0;

    // Initialise melee stats from the default weapon.
    const _startMelee = getMeleeDef('combatKnife');
    /** Damage per melee hit (world units). */
    this._meleeDamage   = _startMelee.damage;
    /** Sphere radius (world units) checked for hit targets. */
    this._meleeRange    = _startMelee.range;
    /** Minimum seconds between swings = 1 / attackRate. */
    this._meleeInterval = 1 / _startMelee.attackRate;

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
  // Gun weapon management (t030/t031)
  // ---------------------------------------------------------------------------

  /**
   * Equip a gun by id (from GunDefs in WeaponDefs.js).
   * Reloads all cached stats and resets the clip to full.
   * @param {string} weaponId — e.g. 'pistol', 'smg', 'assaultRifle', 'sniperRifle', 'shotgun'
   * @returns {this} — for chaining
   */
  setGunWeapon(weaponId) {
    const def = getGunDef(weaponId);
    this.gunWeaponId           = weaponId;
    this._gunDamage            = def.damage;
    this._gunFireInterval      = 1 / def.fireRate;
    this._gunRange             = def.range;
    this._gunClipSize          = def.clipSize;
    this._gunReloadTime        = def.reloadTime;
    this._gunSpread            = def.spread;
    this._gunProjectileSpeed   = def.projectileSpeed;
    this._gunPelletsPerShot    = def.pelletsPerShot ?? 1;
    this._gunSplashRadius      = def.splashRadius ?? 0;
    this._gunIsArc             = def.isArc ?? false;
    this._gunIsExplosive       = def.isExplosive ?? false;
    this.clipCurrent           = def.clipSize;
    this.isReloading           = false;
    this._reloadTimer          = 0;
    this.fireCooldown          = 0;
    return this;
  }

  /**
   * Initiate a reload cycle if the clip is not already full and not already reloading.
   * Called automatically when the clip empties; also callable manually (R key).
   */
  startReload() {
    if (this.isReloading || this.clipCurrent >= this._gunClipSize) return;
    this.isReloading  = true;
    this._reloadTimer = this._gunReloadTime;
  }

  // ---------------------------------------------------------------------------
  // Combat — gun (t030/t031)
  // ---------------------------------------------------------------------------

  /**
   * @returns {boolean} True when fire cooldown has elapsed, clip has ammo, and not reloading.
   */
  canFire() {
    return this.fireCooldown <= 0 && !this.isReloading && this.clipCurrent > 0;
  }

  /**
   * Fire the equipped gun.
   *
   * Distinct behaviors per weapon type (t031):
   *   pistol        — single bullet, 5° spread, 80 u/s projectile.
   *   smg           — single bullet, 10° spread, rapid-fire (5 shots/s).
   *   assaultRifle  — single bullet, 4° spread, balanced stats.
   *   sniperRifle   — single bullet, 0.5° spread normally; 15° spread while moving.
   *                   Very high damage, near-instant projectile (300 u/s), slow rate.
   *   shotgun       — 8 pellets per pull, each independently spread at 20°.
   *                   Devastating up close, negligible beyond ~15 units.
   *
   * Clip and reload:
   *   Decrements clipCurrent each call. Auto-starts reload when clip empties.
   *   Returns [] immediately if canFire() is false.
   *
   * @param {boolean} [isMoving=false] — affects sniperRifle accuracy only.
   * @returns {Projectile[]} Newly-created projectile(s) — always an array.
   */
  fire(isMoving = false) {
    if (!this.canFire()) return [];

    this.fireCooldown = this._gunFireInterval;
    this.clipCurrent--;

    // Sniper rifle: accuracy degrades significantly while moving.
    // All other guns use their base spread value from WeaponDefs.
    let effectiveSpread = this._gunSpread;
    if (this.gunWeaponId === 'sniperRifle' && isMoving) {
      effectiveSpread = 15; // effectively suppresses precision shooting while running
    }

    const worldPos = new THREE.Vector3();
    this.muzzle.getWorldPosition(worldPos);

    const baseDir = new THREE.Vector3(0, 0, -1);
    this.muzzle.getWorldDirection(baseDir);

    const projectiles = [];
    const numPellets = this._gunPelletsPerShot;

    for (let i = 0; i < numPellets; i++) {
      const dir = _applySpread(baseDir, effectiveSpread);
      projectiles.push(new Projectile({
        position:      worldPos.clone(),
        direction:     dir,
        isPlayerOwned: this.isPlayer,
        ownerTank:     this,   // "ownerTank" field is owner-agnostic in Projectile
        speed:         this._gunProjectileSpeed,
        damage:        this._gunDamage,
        splashRadius:  this._gunSplashRadius,
        isArc:         this._gunIsArc,
        isExplosive:   this._gunIsExplosive,
      }));
    }

    // Auto-reload when the clip runs dry.
    if (this.clipCurrent <= 0) {
      this.startReload();
    }

    return projectiles;
  }

  // ---------------------------------------------------------------------------
  // Melee attack (t026)
  // ---------------------------------------------------------------------------

  /**
   * Equip a melee weapon by id (from MeleeDefs in WeaponDefs.js).
   * Reloads damage, range, and attack-rate from the definition.
   * @param {string} weaponId — e.g. 'combatKnife', 'machete', 'warHammer', 'energyBlade'
   */
  setMeleeWeapon(weaponId) {
    const def = getMeleeDef(weaponId);
    this.meleeWeaponId  = weaponId;
    this._meleeDamage   = def.damage;
    this._meleeRange    = def.range;
    this._meleeInterval = 1 / def.attackRate;
  }

  /**
   * @returns {boolean} True when the melee cooldown has elapsed and an attack is ready.
   */
  canMelee() {
    return this.meleeCooldown <= 0;
  }

  /**
   * Perform a melee swing.
   *
   * Uses a sphere-overlap check: every target whose mesh centre is within
   * `_meleeRange` world units of this soldier's position is hit.
   * Damage is capped to the target's remaining HP so recorded values are exact.
   *
   * Does nothing and returns [] if `canMelee()` is false.
   *
   * @param {Array<{mesh: import('three').Object3D, health: number, takeDamage: (n:number)=>void}>} targets
   *   Array of potential targets — may contain Tank or Soldier instances.
   * @returns {Array<{target: object, damage: number}>}
   *   Array of { target, damage } entries for each entity hit (may be empty).
   */
  melee(targets = []) {
    if (!this.canMelee()) return [];

    this.meleeCooldown = this._meleeInterval;

    const pos   = this.mesh.position;
    const range = this._meleeRange;
    const hits  = [];

    for (const target of targets) {
      if (!target || target.health <= 0) continue;

      const dist = pos.distanceTo(target.mesh.position);
      if (dist > range) continue;

      // Cap actualDamage to avoid overkill in recorded stats.
      const actualDamage = Math.min(this._meleeDamage, target.health);
      target.takeDamage(this._meleeDamage);
      this.recordDamage(actualDamage);
      if (target.health <= 0) {
        this.recordKill();
      }
      hits.push({ target, damage: actualDamage });
    }

    return hits;
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
    if (this.meleeCooldown > 0) {
      this.meleeCooldown -= dt;
    }
    // Advance reload timer — completes when _reloadTimer reaches 0.
    if (this.isReloading) {
      this._reloadTimer -= dt;
      if (this._reloadTimer <= 0) {
        this.isReloading  = false;
        this._reloadTimer = 0;
        this.clipCurrent  = this._gunClipSize;
      }
    }
  }

  /** Reset to full health / stats for round start. */
  reset() {
    this.health        = this.maxHealth;
    this.fireCooldown  = 0;
    this.meleeCooldown = 0;
    this.kills         = 0;
    this.damageDealt   = 0;
    // Refill clip and cancel any in-progress reload.
    this.clipCurrent  = this._gunClipSize;
    this.isReloading  = false;
    this._reloadTimer = 0;
  }
}
