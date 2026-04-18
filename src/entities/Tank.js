import * as THREE from 'three';
import { Projectile } from './Projectile.js';
import { getTankDef } from '../data/TankDefs.js';
import { applyTankUpgrades } from '../data/UpgradeDefs.js';


/**
 * Per-class geometry parameters — distinct visual identity for each tank class.
 * Dimensions are in world units (unscaled). Deviations from 'standard' make each
 * class visually distinct at a glance: Scout is narrow and low, Siege is massive, etc.
 *
 * hullW/H/L  : BoxGeometry extents for the main hull.
 * trackW/H   : BoxGeometry extents for each track.
 * turretTopR/BotR/H/Segs : CylinderGeometry for the turret dome.
 * barrelTopR/BotR/L : CylinderGeometry for the barrel.
 * barrelPitch: radians — negative rotates barrel upward (artillery elevation).
 * extras     : optional detail geometry key ('jumpJets', 'sideArmor', or null).
 */
const CLASS_MESH_PARAMS = {
  standard: {
    hullW: 3.0, hullH: 1.2, hullL: 4.5,
    trackW: 0.60, trackH: 0.80,
    turretTopR: 1.10, turretBotR: 1.30, turretH: 0.80, turretSegs: 8,
    barrelTopR: 0.15, barrelBotR: 0.18, barrelL: 3.5,
    barrelPitch: 0,
    extras: null,
  },
  scout: {
    // Narrow, low silhouette — fast flanker with reduced cross-section
    hullW: 2.4, hullH: 0.90, hullL: 3.8,
    trackW: 0.48, trackH: 0.65,
    turretTopR: 0.82, turretBotR: 0.98, turretH: 0.55, turretSegs: 6,
    barrelTopR: 0.10, barrelBotR: 0.12, barrelL: 2.8,
    barrelPitch: 0,
    extras: null,
  },
  heavy: {
    // Wide, tall, heavily-armored — unmistakable bulk on the field
    hullW: 4.2, hullH: 1.50, hullL: 5.5,
    trackW: 0.80, trackH: 1.00,
    turretTopR: 1.35, turretBotR: 1.60, turretH: 1.00, turretSegs: 8,
    barrelTopR: 0.22, barrelBotR: 0.26, barrelL: 4.0,
    barrelPitch: 0,
    extras: null,
  },
  artillery: {
    // Standard hull but with an extremely long, thin barrel; elevated pitch
    hullW: 3.0, hullH: 1.20, hullL: 5.0,
    trackW: 0.60, trackH: 0.80,
    turretTopR: 0.90, turretBotR: 1.10, turretH: 0.70, turretSegs: 8,
    barrelTopR: 0.10, barrelBotR: 0.13, barrelL: 6.0,
    barrelPitch: -0.22, // ~13° upward elevation (artillery arc)
    extras: null,
  },
  flameTank: {
    // Stubby wide nozzle instead of a cannon barrel
    hullW: 3.2, hullH: 1.30, hullL: 4.5,
    trackW: 0.64, trackH: 0.85,
    turretTopR: 1.10, turretBotR: 1.30, turretH: 0.80, turretSegs: 8,
    barrelTopR: 0.32, barrelBotR: 0.40, barrelL: 1.8,
    barrelPitch: 0,
    extras: null,
  },
  shieldTank: {
    // Dome-shaped turret (steep taper, many segments) distinguishes it visually
    hullW: 3.4, hullH: 1.30, hullL: 4.8,
    trackW: 0.65, trackH: 0.85,
    turretTopR: 0.60, turretBotR: 1.50, turretH: 1.10, turretSegs: 12,
    barrelTopR: 0.14, barrelBotR: 0.17, barrelL: 3.5,
    barrelPitch: 0,
    extras: null,
  },
  jumpTank: {
    // Slightly smaller hull; rocket-booster pods on the hull sides
    hullW: 2.8, hullH: 1.10, hullL: 4.2,
    trackW: 0.58, trackH: 0.75,
    turretTopR: 1.00, turretBotR: 1.20, turretH: 0.70, turretSegs: 8,
    barrelTopR: 0.14, barrelBotR: 0.17, barrelL: 3.2,
    barrelPitch: 0,
    extras: 'jumpJets',
  },
  siegeTank: {
    // Massive hull and turret — the largest tank on the field
    hullW: 5.0, hullH: 1.80, hullL: 6.5,
    trackW: 0.90, trackH: 1.20,
    turretTopR: 1.50, turretBotR: 1.85, turretH: 1.30, turretSegs: 8,
    barrelTopR: 0.28, barrelBotR: 0.34, barrelL: 4.5,
    barrelPitch: 0,
    extras: 'sideArmor',
  },
};

export class Tank {
  /**
   * @param {object} [opts]
   * @param {boolean} [opts.isPlayer=false]
   * @param {number|null} [opts.color=null]          — override hull color (hex int)
   * @param {number|null} [opts.turretColor=null]    — override turret color (hex int)
   * @param {number} [opts.teamId=1]                 — 0 = player team, 1 = enemy team
   * @param {string} [opts.name='']                  — display name shown in kill feed
   * @param {string} [opts.tankClassId='standard']   — tank class key (controls mesh shape + stats)
   * @param {Object.<string,number>} [opts.upgrades={}]
   *   Purchased upgrade tiers for this tank class: { [upgradeId]: tier }.
   *   Applied on top of base class stats via applyClassStats() (t041).
   */
  constructor({
    isPlayer = false,
    color = null,
    turretColor = null,
    teamId = 1,
    name = '',
    tankClassId = 'standard',
    upgrades = {},
  } = {}) {
    this.isPlayer = isPlayer;
    this.teamId = teamId;
    /** @type {string} Display name for kill feed messages (e.g. 'Player', 'Enemy #2'). */
    this.name = name || (isPlayer ? 'Player' : 'Enemy');

    /**
     * Tank class identifier — controls mesh geometry and combat stats.
     * Falls back to 'standard' for any unknown id so meshes never break.
     */
    this.tankClassId = CLASS_MESH_PARAMS[tankClassId] ? tankClassId : 'standard';

    // Apply combat/movement stats from TankDefs for the resolved class, then
    // layer the player's purchased upgrades on top (t041).
    this._applyClassDef(this.tankClassId);
    this.applyClassStats(this.tankClassId, upgrades);
    /**
     * Maximum ammo capacity for this tank (after ammoCapacity upgrades).
     * Set by applyClassStats(); used by reset() to restore the correct cap.
     */
    // baseAmmo is set by applyClassStats() — this line guards the default.
    if (this.baseAmmo === undefined) this.baseAmmo = 30;
    this.ammo = this.baseAmmo;
    this.fireCooldown = 0;

    /**
     * Damage multiplier for projectiles fired by this tank.
     * AI enemies set this via AIController.applyLeagueScalingToTeam()
     * based on the player's current league (VISION.md AI scaling table).
     * Default 1.0 (no modification). Does not reset between rounds — call
     * applyLeagueScalingToTeam() once after teams are created.
     */
    this.damageMultiplier = 1.0;

    // Per-round combat stats — displayed on the scoreboard (t013)
    this.kills = 0;
    this.damageDealt = 0;

    // ---------------------------------------------------------------------------
    // Ability state — written and managed by TankAbilityEffects (t043).
    // Fields are initialised here so Tank instances are always shape-consistent.
    // ---------------------------------------------------------------------------

    /**
     * Energy Shield: when true, all incoming damage is absorbed (returns 0).
     * TankAbilityEffects sets this on activation; clears after the duration.
     * @type {boolean}
     */
    this.shielded = false;

    /**
     * Rocket Jump: while true, PlayerController and AIController skip terrain-
     * follow so TankAbilityEffects can drive the Y coordinate along the arc.
     * @type {boolean}
     */
    this.isJumping = false;

    /**
     * Lockdown Mode: while true, hull movement is suppressed.
     * TankAbilityEffects clears this when the duration expires.
     * @type {boolean}
     */
    this.isLockedDown = false;

    /**
     * Reactive Armor: number of hit-reduction charges remaining.
     * Each incoming hit decrements this by 1 and deals half damage instead.
     * TankAbilityEffects sets this to REACTIVE_ARMOR_CHARGES on activation.
     * @type {number}
     */
    this.reactiveArmorCharges = 0;

    // ── Ability identity (t046) ──────────────────────────────────────────────
    /**
     * Which ability this tank owns (null = none).
     * For AI tanks: set by AIController.assignLeagueAbilities() per league.
     * For the player tank: set by AbilitySystem via Game.js loadout selection.
     * Matches the ability id keys in TankDefs (e.g. 'energyShield', 'barrage').
     * @type {string|null}
     */
    this.abilityId = null;

    /**
     * Seconds between uses of this tank's ability (0 when abilityId is null).
     * @type {number}
     */
    this.abilityCooldown = 0;

    // Use class-defined colors as defaults; explicit overrides take priority.
    // _applyClassDef() has already stored this.colorBody / this.colorTurret.
    const palette = {
      body:   color !== null        ? color        : this.colorBody,
      turret: turretColor !== null  ? turretColor  : (color !== null ? color : this.colorTurret),
    };

    this.mesh = this._buildMesh(palette, this.tankClassId);
    this.turret = this.mesh.getObjectByName('turret');
    this.barrel = this.mesh.getObjectByName('barrel');
    this.muzzle = this.mesh.getObjectByName('muzzle');
  }

  /**
   * Build the tank mesh using class-specific geometry parameters.
   *
   * Hull/track/turret/barrel dimensions are read from CLASS_MESH_PARAMS so that
   * each class has a distinct silhouette.  Team palette colors are still applied
   * for team identification.
   *
   * @param {{body: number, turret: number}} palette — team-tinted colors
   * @param {string} classId — key into CLASS_MESH_PARAMS
   * @returns {THREE.Group}
   */
  _buildMesh(palette, classId) {
    const p = CLASS_MESH_PARAMS[classId] || CLASS_MESH_PARAMS.standard;
    const group = new THREE.Group();

    // ── Ground clearance and derived Y positions ──────────────────────────────
    const groundClearance = 0.20;
    const hullCenterY = groundClearance + p.hullH / 2;
    const turretBaseY  = groundClearance + p.hullH + 0.05; // sit on hull top

    // ── Hull ─────────────────────────────────────────────────────────────────
    const hullGeo = new THREE.BoxGeometry(p.hullW, p.hullH, p.hullL);
    const hullMat = new THREE.MeshStandardMaterial({
      color: palette.body,
      roughness: 0.7,
      metalness: 0.3,
    });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.position.y = hullCenterY;
    hull.castShadow = true;
    hull.receiveShadow = true;
    group.add(hull);

    // ── Tracks (left & right) ────────────────────────────────────────────────
    const trackGeo = new THREE.BoxGeometry(p.trackW, p.trackH, p.hullL + 0.3);
    const trackMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.9,
    });
    const trackCenterY = groundClearance / 2 + p.trackH / 2;
    const trackOffsetX  = p.hullW / 2 + p.trackW / 2;

    const trackL = new THREE.Mesh(trackGeo, trackMat);
    trackL.position.set(-trackOffsetX, trackCenterY, 0);
    trackL.castShadow = true;
    group.add(trackL);

    const trackR = trackL.clone();
    trackR.position.x = trackOffsetX;
    group.add(trackR);

    // ── Turret ───────────────────────────────────────────────────────────────
    const turretGroup = new THREE.Group();
    turretGroup.name = 'turret';
    turretGroup.position.y = turretBaseY;

    const turretGeo = new THREE.CylinderGeometry(
      p.turretTopR, p.turretBotR, p.turretH, p.turretSegs,
    );
    const turretMat = new THREE.MeshStandardMaterial({
      color: palette.turret,
      roughness: 0.6,
      metalness: 0.4,
    });
    const turretMesh = new THREE.Mesh(turretGeo, turretMat);
    turretMesh.castShadow = true;
    turretGroup.add(turretMesh);

    // ── Barrel ───────────────────────────────────────────────────────────────
    // Barrel is embedded slightly inside the turret for a realistic gun mount.
    // Formula: barrel back-end is 0.15 units inside the turret centre, giving
    // a believable mounting point regardless of barrel length.
    const barrelCenterZ = -(p.barrelL / 2 + 0.15);
    const muzzleZ       = -(p.barrelL + 0.20);

    const barrelGeo = new THREE.CylinderGeometry(
      p.barrelTopR, p.barrelBotR, p.barrelL, 8,
    );
    const barrelMat = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.5,
      metalness: 0.6,
    });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.name = 'barrel';
    // Rotate to horizontal first (default CylinderGeometry is vertical),
    // then add elevation pitch (negative value = upward tilt, e.g. artillery).
    barrel.rotation.x = Math.PI / 2 + p.barrelPitch;
    barrel.position.set(0, 0.1, barrelCenterZ);
    barrel.castShadow = true;
    turretGroup.add(barrel);

    // Muzzle — world-space reference point for projectile spawn & muzzle flash
    const muzzle = new THREE.Object3D();
    muzzle.name = 'muzzle';
    muzzle.position.set(0, 0.1, muzzleZ);
    turretGroup.add(muzzle);

    group.add(turretGroup);

    // ── Class-specific extras ─────────────────────────────────────────────────
    if (p.extras === 'jumpJets') {
      this._addJumpJets(group, p, hullCenterY);
    } else if (p.extras === 'sideArmor') {
      this._addSideArmor(group, p, hullCenterY, palette.body);
    }

    return group;
  }

  /**
   * Jump Tank detail: two rocket-booster pods on the rear hull sides.
   * @private
   */
  _addJumpJets(group, p, hullCenterY) {
    const podGeo = new THREE.CylinderGeometry(0.28, 0.35, 1.2, 6);
    const podMat = new THREE.MeshStandardMaterial({
      color: 0x555566,
      roughness: 0.5,
      metalness: 0.5,
    });
    const offsetX = p.hullW / 2 + 0.55;
    const offsetZ = p.hullL / 2 - 0.6; // rear quarter of hull

    for (const side of [-1, 1]) {
      const pod = new THREE.Mesh(podGeo, podMat);
      pod.rotation.z = Math.PI / 2; // cylinders horizontal, pointing outward
      pod.position.set(side * offsetX, hullCenterY + 0.2, offsetZ);
      pod.castShadow = true;
      group.add(pod);
    }
  }

  /**
   * Siege Tank detail: thick side-armor slabs on each hull flank.
   * @private
   */
  _addSideArmor(group, p, hullCenterY, color) {
    const slabGeo = new THREE.BoxGeometry(0.35, p.hullH * 0.85, p.hullL * 0.80);
    const slabMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      metalness: 0.2,
    });
    const offsetX = p.hullW / 2 + 0.18;

    for (const side of [-1, 1]) {
      const slab = new THREE.Mesh(slabGeo, slabMat);
      slab.position.set(side * offsetX, hullCenterY, 0);
      slab.castShadow = true;
      slab.receiveShadow = true;
      group.add(slab);
    }
  }

  // ---------------------------------------------------------------------------
  // Class system (t037)
  // ---------------------------------------------------------------------------

  /**
   * Apply stats from a TankDefs entry.  Sets all per-class fields so that
   * movement, fire rate, HP, armor, and damage all reflect the chosen class.
   *
   * Called once during construction (via tankClassId), and again when a
   * loadout change re-assigns the player's tank class (applyClass).
   *
   * fireRate in TankDefs = shots per second → converted to seconds-per-shot
   * cooldown here so Tank.update() can use the existing fireCooldown pattern.
   *
   * @param {string} classId — key in TankDefs (e.g. 'standard', 'heavy')
   */
  _applyClassDef(classId) {
    const def = getTankDef(classId);
    /** Base HP before any league multiplier — used by AIController.applyLeagueScalingToTeam(). */
    this.baseHp     = def.hp;
    this.maxHealth  = def.hp;
    this.health     = def.hp;
    /**
     * Damage reduction fraction applied in takeDamage().
     * 0 = no reduction, 0.3 = 30% reduction (Heavy class).
     */
    this.armor      = def.armor;
    /** Forward movement speed in world-units/second (used by PlayerController + AIController). */
    this.speed      = def.speed;
    /** Hull rotation rate in radians/second (used by PlayerController + AIController). */
    this.turnRate   = def.turnRate;
    /** Base damage per shell (before damageMultiplier). */
    this.damage     = def.damage;
    /** Maximum effective range in world units (used by AIController for fire/aggro distance). */
    this.range      = def.range;
    /**
     * Seconds between shots (fire cooldown duration).
     * Derived from TankDefs.fireRate (shots/second): cooldown = 1 / fireRate.
     */
    this.fireRate   = 1 / def.fireRate;
    /** Hull color from TankDefs (informational; explicit color overrides take priority). */
    this.colorBody   = def.colorBody;
    /** Turret color from TankDefs (informational; explicit turretColor overrides take priority). */
    this.colorTurret = def.colorTurret;
  }

  /**
   * Re-assign this tank to a different class and apply its stats.
   *
   * Call this when a loadout selection changes the player's tank class
   * between matches.  Does NOT reset kills/damageDealt — those reset in reset().
   * Also updates tankClassId so reset() restores the correct maxHealth.
   *
   * @param {string} classId — key in TankDefs
   */
  applyClass(classId) {
    const resolved = CLASS_MESH_PARAMS[classId] ? classId : 'standard';
    this.tankClassId = resolved;
    this._applyClassDef(resolved);
    // Use the new class's base HP as the starting point for the next match.
    // League scaling (applyLeagueScalingToTeam) is only applied to enemy tanks,
    // so the player's maxHealth stays at the base value.
    this.maxHealth = this.baseHp;
    this.health    = this.maxHealth;
    // Reset ammo to the base (no upgrades applied here).
    this.baseAmmo = 30;
    this.ammo     = this.baseAmmo;
  }

  /**
   * Apply tank class stats AND the player's purchased per-class upgrades.
   *
   * This is the upgrade-aware version of applyClass().  Upgrades are stored
   * separately per tank class in SaveSystem so upgrading Heavy armor does not
   * affect Scout stats (t041).
   *
   * Upgrade effects applied here:
   *   armorPlating → maxHealth / health (+15% HP per tier)
   *   engine       → speed + turnRate   (+12% per tier)
   *   mainGun      → damage (+15%) + fireRate reduction (−8% cooldown per tier)
   *   ammoCapacity → baseAmmo (+10 flat per tier)
   *
   * @param {string} classId — tank class key (e.g. 'heavy', 'scout')
   * @param {Object.<string,number>} [upgrades={}] — { [upgradeId]: tier } for this class
   */
  applyClassStats(classId = 'standard', upgrades = {}) {
    const resolved = CLASS_MESH_PARAMS[classId] ? classId : 'standard';
    this.tankClassId = resolved;
    this._applyClassDef(resolved);

    // If there are no upgrades, nothing more to do — _applyClassDef already
    // set all combat stats from TankDefs.
    const hasUpgrades = Object.values(upgrades).some(t => t > 0);
    if (!hasUpgrades) {
      this.maxHealth = this.baseHp;
      this.health    = this.maxHealth;
      this.baseAmmo  = 30;
      this.ammo      = this.baseAmmo;
      return;
    }

    // Build base stats for applyTankUpgrades (mirrors what _applyClassDef set).
    const def = getTankDef(resolved);
    const baseStats = {
      hp:       def.hp,
      speed:    def.speed,
      turnRate: def.turnRate,
      damage:   def.damage,
      fireRate: def.fireRate,  // shots/sec — converted back to cooldown below
      ammo:     30,            // base ammo not in TankDefs; always starts at 30
    };

    const stats = applyTankUpgrades(baseStats, upgrades);

    this.maxHealth = Math.round(stats.hp);
    this.health    = this.maxHealth;
    this.baseHp    = this.maxHealth;   // keep in sync for AIController
    this.damage    = stats.damage;
    this.fireRate  = 1 / stats.fireRate;  // shots/sec → sec/shot cooldown
    this.speed     = stats.speed;
    this.turnRate  = stats.turnRate;
    this.baseAmmo  = Math.max(1, Math.round(stats.ammo));
    this.ammo      = this.baseAmmo;
  }

  // ---------------------------------------------------------------------------
  // Combat
  // ---------------------------------------------------------------------------

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
      ownerTank: this,
      speed: 50,
      damage: this.damage * this.damageMultiplier,
    });
  }

  /**
   * Apply incoming damage, respecting active ability protections and armor.
   *
   * Processing order (applied in sequence):
   *   1. Energy Shield  — absorbs ALL damage; returns 0 immediately.
   *   2. Reactive Armor — halves the remaining damage per charge consumed.
   *   3. Class Armor    — reduces by armor fraction (0–0.35).
   *
   * Returns the actual HP removed after all reductions.
   *
   * @param {number} amount — raw incoming damage (before all reductions)
   * @returns {number} actual damage applied to health (0 if shielded)
   */
  takeDamage(amount) {
    // 1. Energy Shield: absorb everything.
    if (this.shielded) return 0;

    let dmg = amount;

    // 2. Reactive Armor: 50 % reduction for each charge.
    if (this.reactiveArmorCharges > 0) {
      dmg = dmg * 0.5;
      this.reactiveArmorCharges--;
    }

    // 3. Class Armor: structural damage reduction.
    const reduced = dmg * (1 - this.armor);
    const actual  = Math.min(reduced, this.health);
    this.health   = Math.max(0, this.health - reduced);
    return actual;
  }

  /**
   * Record damage dealt by this tank against an opponent.
   * Called by CollisionSystem when one of this tank's shells hits a target.
   * @param {number} amount — actual HP removed (clamped to target's remaining HP)
   */
  recordDamage(amount) {
    this.damageDealt += amount;
  }

  /**
   * Record a kill credited to this tank.
   * Called by CollisionSystem when this tank's shell destroys an opponent.
   */
  recordKill() {
    this.kills++;
  }

  update(dt) {
    if (this.fireCooldown > 0) {
      this.fireCooldown -= dt;
    }
  }

  reset() {
    this.health = this.maxHealth;
    // Restore to the upgrade-adjusted ammo cap so ammoCapacity upgrades persist
    // across round resets.  Falls back to 30 for tanks without baseAmmo set
    // (e.g. AI tanks constructed before t041 was integrated).
    this.ammo = (this.baseAmmo !== undefined) ? this.baseAmmo : 30;
    this.fireCooldown = 0;
    this.kills = 0;
    this.damageDealt = 0;

    // Clear ability state so each round starts clean.
    // TankAbilityEffects.reset() cancels any in-flight timed effects before
    // Tank.reset() runs, so it is safe to zero these flags here.
    this.shielded             = false;
    this.isJumping            = false;
    this.isLockedDown         = false;
    this.reactiveArmorCharges = 0;

    // Reset turret to face forward (local rotation.y = 0).
    // Class stats (speed, armor, damage, etc.) and league-scaled maxHealth are
    // intentionally NOT reset here — they persist across rounds per VISION.md.
    if (this.turret) {
      this.turret.rotation.y = 0;
    }
  }
}
