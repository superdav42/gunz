import * as THREE from 'three';
import { Soldier } from '../entities/Soldier.js';

/**
 * Distance (units) within which the on-foot soldier can re-enter the idle tank.
 * Roughly the tank hull length (4.5) plus a comfortable step-in margin.
 */
const RE_ENTER_DIST = 6;

/** Arena bound: matches Game.js clamp value. */
const ARENA_BOUND = 90;

/**
 * PlayerController — manages the player's mode (tank vs. on-foot soldier).
 *
 * Modes
 * -----
 *  'tank'    — player directly controls this.tank (default).
 *  'soldier' — player's tank is idle or destroyed; player controls this.soldier.
 *
 * Transitions
 * -----------
 *  Voluntary exit  (E key in tank mode)    : soldier spawns beside tank; tank idles.
 *  Auto-bail       (tank destroyed by foe) : soldier spawns at tank's last position.
 *  Re-enter tank   (E key near idle tank)  : soldier despawns; tank control resumes.
 *
 * Interface compatibility
 * -----------------------
 *  CameraController uses target.mesh — the `mesh` getter always returns the
 *  active entity's mesh so the camera follows the right entity.
 *  HUD uses health/maxHealth/ammo — these getters delegate to the active entity.
 */
export class PlayerController {
  /**
   * @param {object}  opts
   * @param {import('../entities/Tank.js').Tank}       opts.tank    — player tank entity
   * @param {THREE.Scene}                              opts.scene
   * @param {import('../entities/Terrain.js').Terrain} opts.terrain
   */
  constructor({ tank, scene, terrain }) {
    this.tank    = tank;
    this.soldier = null;     // Soldier entity when on foot, null otherwise
    this.scene   = scene;
    this.terrain = terrain;

    /** @type {'tank' | 'soldier'} */
    this.mode = 'tank';

    /**
     * True when the player voluntarily exited the tank and the tank is still
     * alive/idle in the scene, making re-entry possible.
     * Set to false when the tank is destroyed (bailed out or destroyed while idle).
     * @type {boolean}
     */
    this._tankIdle = false;

    /**
     * Fired whenever a new Soldier is spawned (voluntary exit or auto-bail).
     * Receives the Soldier instance.  Game.js uses this to register the
     * soldier with TeamManager so round-end checks account for it (t029).
     * @private @type {((soldier: import('../entities/Soldier.js').Soldier) => void) | null}
     */
    this._onSoldierSpawnedCb = null;

    /**
     * Fired when a live Soldier re-enters the idle tank.
     * Receives the Soldier instance before it is removed from the scene.
     * Game.js uses this to unregister the soldier from TeamManager (t029).
     * @private @type {((soldier: import('../entities/Soldier.js').Soldier) => void) | null}
     */
    this._onSoldierReenteredCb = null;

    /**
     * Gun weapon id to equip on the soldier when spawned (t031).
     * Set from the loadout selection (Game.js) before any soldier is created.
     * Defaults to the starter pistol so a soldier always has a working gun.
     * @type {string}
     */
    this.soldierGunId = 'pistol';

    /**
     * Melee weapon id to equip on the soldier when spawned (t034).
     * Set from the loadout selection (Game.js) before any soldier is created.
     * Defaults to the starter combat knife.
     * @type {string}
     */
    this.soldierMeleeId = 'combatKnife';

    /**
     * Active weapon slot in soldier mode (t034).
     * 'gun'   — fire button fires the equipped gun.
     * 'melee' — fire button triggers a melee swing (targets resolved in Game.js).
     * Resets to 'gun' on mode reset so each new life starts with gun selected.
     * @type {'gun' | 'melee'}
     */
    this.activeWeaponSlot = 'gun';
  }

  // ---------------------------------------------------------------------------
  // Accessors — CameraController / HUD compatibility
  // ---------------------------------------------------------------------------

  /**
   * The active entity's mesh. CameraController binds to `target.mesh`.
   * @returns {THREE.Group}
   */
  get mesh() {
    return this.mode === 'tank' ? this.tank.mesh : this.soldier.mesh;
  }

  /** Current HP shown in the HUD. */
  get health() {
    return this.mode === 'tank' ? this.tank.health : this.soldier.health;
  }

  /** Maximum HP shown in the HUD. */
  get maxHealth() {
    return this.mode === 'tank' ? this.tank.maxHealth : this.soldier.maxHealth;
  }

  /**
   * Current ammo shown in the HUD.
   *   Tank mode    — returns tank.ammo (a number).
   *   Soldier mode — returns a formatted string: "12/30", "0/30", or "RELOAD".
   * @returns {number|string|null}
   */
  get ammo() {
    if (this.mode === 'tank') return this.tank.ammo;
    if (!this.soldier) return null;
    if (this.soldier.isReloading) return 'RELOAD';
    return `${this.soldier.clipCurrent}/${this.soldier._gunClipSize}`;
  }

  // ---------------------------------------------------------------------------
  // Soldier lifecycle callbacks (t029)
  // ---------------------------------------------------------------------------

  /**
   * Register a callback that fires whenever a new Soldier is spawned.
   * Use this in Game.js to register the soldier with TeamManager so the
   * round-end check waits for the soldier before declaring the team eliminated.
   * @param {(soldier: import('../entities/Soldier.js').Soldier) => void} cb
   * @returns {this}
   */
  onSoldierSpawned(cb) {
    this._onSoldierSpawnedCb = cb;
    return this;
  }

  /**
   * Register a callback that fires when a live Soldier successfully re-enters
   * the idle tank.  Receives the Soldier before its mesh is removed.
   * Use this in Game.js to unregister the soldier from TeamManager (the
   * soldier is alive — no elimination check should fire).
   * @param {(soldier: import('../entities/Soldier.js').Soldier) => void} cb
   * @returns {this}
   */
  onSoldierReentered(cb) {
    this._onSoldierReenteredCb = cb;
    return this;
  }

  // ---------------------------------------------------------------------------
  // Mode transitions
  // ---------------------------------------------------------------------------

  /**
   * Voluntary exit: player presses E while in tank mode.
   * Spawns a soldier 4 units to the right of the tank hull.
   * Tank remains idle in the scene and can be re-entered.
   */
  exitTank() {
    if (this.mode !== 'tank') return;

    const tankPos  = this.tank.mesh.position;
    const tankRotY = this.tank.mesh.rotation.y;

    // Offset 4 units to the hull's local +X (right side)
    const offset = new THREE.Vector3(4, 0, 0);
    offset.applyEuler(new THREE.Euler(0, tankRotY, 0));
    const spawnPos = tankPos.clone().add(offset);

    this._spawnSoldierAt(spawnPos, tankRotY);
    this._tankIdle = true;
    this.mode = 'soldier';

    console.info('[PlayerController] Voluntarily exited tank (E key).');
  }

  /**
   * Forced bail-out: the player's tank was destroyed.
   * Called by Game._onPlayerTankDestroyed() with the tank's last position.
   * The caller is responsible for removing the tank mesh and spawning a wreck.
   *
   * @param {THREE.Vector3} tankPos — snapshot taken before mesh removal
   */
  bailOut(tankPos) {
    if (this.soldier !== null) return; // already on foot

    this._spawnSoldierAt(tankPos.clone(), this.tank.mesh.rotation.y);
    this._tankIdle = false; // tank is destroyed — re-entry not possible
    this.mode = 'soldier';

    console.info('[PlayerController] Auto-bailed from destroyed tank.');
  }

  /**
   * Attempt to re-enter the idle tank (E key while on foot).
   * Succeeds only when:
   *   - Mode is 'soldier'.
   *   - `_tankIdle` is true (tank was voluntarily vacated, not destroyed).
   *   - Soldier is within RE_ENTER_DIST units of the tank.
   *
   * @returns {boolean} True if re-entry succeeded.
   */
  tryEnterTank() {
    if (this.mode !== 'soldier' || !this._tankIdle || !this.soldier) return false;

    const dist = this.soldier.mesh.position.distanceTo(this.tank.mesh.position);
    if (dist > RE_ENTER_DIST) return false;

    // Notify Game.js so TeamManager can unregister the soldier (t029).
    // Must fire before the soldier reference is cleared.
    if (this._onSoldierReenteredCb) {
      this._onSoldierReenteredCb(this.soldier);
    }

    this.scene.remove(this.soldier.mesh);
    this.soldier = null;
    this._tankIdle = false;
    this.mode = 'tank';

    console.info('[PlayerController] Re-entered tank.');
    return true;
  }

  /**
   * Remove the soldier from the scene (called on soldier death or round reset).
   * Safe to call when no soldier is active.
   */
  clearSoldier() {
    if (this.soldier) {
      this.scene.remove(this.soldier.mesh);
      this.soldier = null;
    }
  }

  /**
   * Called when the idle tank is destroyed by enemies while the player is on foot.
   * Updates state so re-entry is no longer offered.
   * The caller (Game.js) handles mesh removal and wreck spawning.
   */
  notifyTankDestroyedWhileIdle() {
    this._tankIdle = false;
    console.info('[PlayerController] Idle tank was destroyed by enemies; re-entry no longer possible.');
  }

  /**
   * Reset to tank mode for a new round: remove any active soldier.
   * Also resets weapon slot so the next bail-out starts with the gun selected.
   */
  reset() {
    this.clearSoldier();
    this._tankIdle = false;
    this.mode = 'tank';
    this.activeWeaponSlot = 'gun';
  }

  // ---------------------------------------------------------------------------
  // Per-frame update
  // ---------------------------------------------------------------------------

  /**
   * Process input and advance the active entity.
   *
   * @param {object} input — snapshot from InputSystem.getState()
   * @param {number} dt    — seconds since last frame
   * @returns {{ newProjectiles: import('../entities/Projectile.js').Projectile[],
   *             isMoving: boolean }}
   *   newProjectiles — projectiles to add to ProjectileSystem (empty array if none fired).
   *   isMoving       — true if the active entity moved this frame (for dust trails).
   */
  update(input, dt) {
    if (this.mode === 'tank') {
      return this._updateTankMode(input, dt);
    }
    return this._updateSoldierMode(input, dt);
  }

  // ---------------------------------------------------------------------------
  // Private — tank mode
  // ---------------------------------------------------------------------------

  /** @private */
  _updateTankMode(input, dt) {
    const tank    = this.tank;
    const terrain = this.terrain;

    // Use the tank's class-defined movement stats (set by Tank._applyClassDef).
    // speed is in world-units/second; turnRate is in radians/second.
    const moveSpeed = tank.speed;
    const turnSpeed = tank.turnRate;

    // Lockdown Mode (t043): suppress all hull movement while active.
    // Turret can still track the target; firing continues at doubled rate.
    const locked = tank.isLockedDown;

    const moving = !locked && (input.forward || input.backward);

    if (!locked) {
      if (input.forward)  tank.mesh.translateZ(-moveSpeed * dt);
      if (input.backward) tank.mesh.translateZ(moveSpeed * 0.6 * dt);
      if (input.left)     tank.mesh.rotation.y += turnSpeed * dt;
      if (input.right)    tank.mesh.rotation.y -= turnSpeed * dt;
    }

    if (input.turretAngle !== null) {
      tank.setTurretAngle(input.turretAngle);
    }

    // Terrain follow + arena clamp.
    // Skip terrain-follow while jumping — TankAbilityEffects drives the Y
    // coordinate along the parabolic arc (t043 rocketJump).
    const pos = tank.mesh.position;
    if (!tank.isJumping) {
      pos.y = terrain.getHeightAt(pos.x, pos.z);
    }
    pos.x = THREE.MathUtils.clamp(pos.x, -ARENA_BOUND, ARENA_BOUND);
    pos.z = THREE.MathUtils.clamp(pos.z, -ARENA_BOUND, ARENA_BOUND);

    // E key — voluntary exit (not permitted during lockdown or jump)
    if (input.exitVehicle && !locked && !tank.isJumping) {
      this.exitTank();
    }

    const newProjectiles = [];

    if (tank.isFlamethrower) {
      // Flame Tank: set the continuous-fire flag; FlameSystem (via Game.js)
      // handles damage ticks and particle emission.  No discrete projectile.
      tank.flameActive = !!(input.fire);
    } else if (input.fire && tank.canFire()) {
      const proj = tank.fire();
      if (proj) newProjectiles.push(proj);
    }

    return { newProjectiles, isMoving: moving };
  }

  // ---------------------------------------------------------------------------
  // Private — soldier mode
  // ---------------------------------------------------------------------------

  /** @private */
  _updateSoldierMode(input, dt) {
    const soldier = this.soldier;
    const terrain = this.terrain;

    const moving = input.forward || input.backward;

    if (input.forward)  soldier.mesh.translateZ(-soldier.moveSpeed * dt);
    if (input.backward) soldier.mesh.translateZ(soldier.moveSpeed * 0.6 * dt);
    if (input.left)     soldier.mesh.rotation.y += soldier.turnSpeed * dt;
    if (input.right)    soldier.mesh.rotation.y -= soldier.turnSpeed * dt;

    // Terrain follow + arena clamp
    const pos = soldier.mesh.position;
    pos.y = terrain.getHeightAt(pos.x, pos.z);
    pos.x = THREE.MathUtils.clamp(pos.x, -ARENA_BOUND, ARENA_BOUND);
    pos.z = THREE.MathUtils.clamp(pos.z, -ARENA_BOUND, ARENA_BOUND);

    soldier.update(dt);

    // E key — try to re-enter idle tank
    if (input.exitVehicle) {
      this.tryEnterTank();
    }

    // R key — manual reload when clip is not full and not already reloading
    if (input.reload) {
      soldier.startReload();
    }

    // Weapon slot switching (t034): 1 = gun, 2 = melee.
    if (input.switchToGun)   this.activeWeaponSlot = 'gun';
    if (input.switchToMelee) this.activeWeaponSlot = 'melee';

    // Fire: only fire the gun when the gun slot is active.
    // When the melee slot is active the fire button is handled by Game.js as a
    // melee swing (hit detection needs the full target list, not available here).
    // F key / input.melee always swings melee regardless of the active slot —
    // that path is handled entirely in Game.js and is not repeated here.
    let newProjectiles = [];
    if (input.fire && this.activeWeaponSlot === 'gun' && soldier.canFire()) {
      newProjectiles = soldier.fire(moving);
    }

    return { newProjectiles, isMoving: moving };
  }

  // ---------------------------------------------------------------------------
  // Private — helpers
  // ---------------------------------------------------------------------------

  /**
   * Instantiate and place a Soldier at the given world position.
   * Equips the soldier with the gun from `this.soldierGunId` (set from loadout).
   * @private
   * @param {THREE.Vector3} pos
   * @param {number}        rotY — initial world-space Y rotation (radians)
   */
  _spawnSoldierAt(pos, rotY) {
    const y = this.terrain.getHeightAt(pos.x, pos.z);
    this.soldier = new Soldier({ isPlayer: true, teamId: 0, name: 'Player' });
    this.soldier.mesh.position.set(pos.x, y, pos.z);
    this.soldier.mesh.rotation.y = rotY;
    // Apply the loadout gun selection (t031) — defaults to pistol if not set.
    this.soldier.setGunWeapon(this.soldierGunId);
    // Apply the loadout melee selection (t034) — defaults to combat knife if not set.
    this.soldier.setMeleeWeapon(this.soldierMeleeId);
    this.scene.add(this.soldier.mesh);

    // Notify Game.js so TeamManager can register the soldier before any
    // subsequent killTank() call checks for team elimination (t029).
    if (this._onSoldierSpawnedCb) {
      this._onSoldierSpawnedCb(this.soldier);
    }
  }
}
