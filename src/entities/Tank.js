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
   * @param {string} [opts.name='']               — display name shown in kill feed
   */
  constructor({ isPlayer = false, color = null, turretColor = null, teamId = 1, name = '' } = {}) {
    this.isPlayer = isPlayer;
    this.teamId = teamId;
    /** @type {string} Display name for kill feed messages (e.g. 'Player', 'Enemy #2'). */
    this.name = name || (isPlayer ? 'Player' : 'Enemy');
    this.health = 100;
    this.maxHealth = 100;
    this.ammo = 30;
    this.fireCooldown = 0;
    this.fireRate = 0.3; // seconds between shots

    /**
     * Damage multiplier for projectiles fired by this tank.
     * AI enemies set this via AIController.applyLeagueScalingToTeam()
     * based on the player's current league (VISION.md AI scaling table).
     * Default 1.0 (no modification). Does not reset between rounds — call
     * applyLeagueScalingToTeam() once after teams are created.
     */
    this.damageMultiplier = 1.0;

    // ── Ability state (t046) ────────────────────────────────────────────────
    /**
     * Which ability this tank owns (null = none).
     * For AI tanks: set by AIController.assignLeagueAbilities() based on league.
     * For the player tank: set by AbilitySystem via Game.js loadout selection.
     * Matches the ability id keys in TankDefs (e.g. 'energyShield', 'rocketJump').
     */
    this.abilityId = null;

    /**
     * Seconds between uses of this tank's ability.
     * 0 when abilityId is null.
     */
    this.abilityCooldown = 0;

    /**
     * energyShield: when true, all incoming damage is blocked.
     * Duration tracked by the AIController per-tank state; this flag is
     * cleared when the active time expires.
     */
    this.shieldActive = false;

    /**
     * reactiveArmor: additional flat damage-reduction fraction (0–0.5).
     * Stacks multiplicatively with tank class armor (if any).
     * Set to 0 when the boost expires.
     */
    this.armorBoost = 0;

    /**
     * lockdownMode: when true, the AI ignores movement commands so the
     * tank holds a stationary firing position.
     */
    this.lockdownActive = false;

    // Per-round combat stats — displayed on the scoreboard (t013)
    this.kills = 0;
    this.damageDealt = 0;

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
      ownerTank: this,
      speed: 50,
      damage: 25 * this.damageMultiplier,
    });
  }

  /**
   * Apply incoming damage, respecting active ability defences.
   *
   * energyShield  — blocks ALL damage while active (shieldActive = true).
   * reactiveArmor — reduces effective damage by armorBoost fraction (0–0.5).
   *
   * @param {number} amount — raw incoming damage
   * @returns {number} actual HP removed (0 if shielded)
   */
  takeDamage(amount) {
    // Energy shield blocks all incoming damage entirely.
    if (this.shieldActive) return 0;

    // Reactive armor reduces damage by the boost fraction (additive on top of
    // any class armor; class armor is not tracked on Tank.js in this version).
    const effective = amount * (1 - this.armorBoost);
    const actual = Math.min(this.health, effective);
    this.health = Math.max(0, this.health - effective);
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
    this.ammo = 30;
    this.fireCooldown = 0;
    this.kills = 0;
    this.damageDealt = 0;

    // Clear transient ability effects so tanks start each round with no active
    // shield / armor / lockdown state. Permanent ability assignment (abilityId,
    // abilityCooldown) is NOT reset — it persists across rounds like upgrades.
    this.shieldActive = false;
    this.armorBoost = 0;
    this.lockdownActive = false;

    // Reset turret to face forward (local rotation.y = 0).
    // Loadout properties (tank class, weapons, upgrades — added in future tasks)
    // are intentionally NOT reset here — they persist across rounds per VISION.md.
    if (this.turret) {
      this.turret.rotation.y = 0;
    }
  }
}
