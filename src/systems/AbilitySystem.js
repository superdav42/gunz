/**
 * AbilitySystem.js — Cooldown-based active ability management for tanks and weapons.
 *
 * Architecture (VISION.md "Weapon and Tank Abilities — Gold+ Leagues"):
 *   - Two ability slots per player: one from the equipped tank, one from the equipped weapon.
 *   - Max 2 active abilities at once (one per slot — natural cap, no extra bookkeeping needed).
 *   - Q key (desktop) / ability button (mobile) triggers the context-appropriate slot:
 *       Tank mode   → tank ability slot.
 *       Soldier mode → weapon ability slot.
 *   - Each slot has an independent cooldown timer.  Once activated the slot is on cooldown
 *     for `abilityCooldown` seconds before it becomes ready again.  No ammo cost.
 *   - This class manages state and emits ability IDs on activation.  Actual gameplay
 *     effects (VFX, stat changes, projectiles) are implemented by t043 (tank abilities)
 *     and t044 (weapon abilities).
 *
 * Usage:
 *   const abilities = new AbilitySystem();
 *   abilities.setTankDef(TankDefs['flameTank']);    // abilityCooldown: 20, ability: 'infernoBurst'
 *   abilities.setWeaponDef(WeaponDefs['grenadeLauncher']); // abilityCooldown: 18, ability: 'clusterBomb'
 *
 *   // Per-frame:
 *   abilities.update(dt);
 *
 *   // On Q key in tank mode:
 *   const activatedId = abilities.tryActivateTankAbility(); // 'infernoBurst' or null
 *
 *   // On Q key in soldier mode:
 *   const activatedId = abilities.tryActivateWeaponAbility(); // 'clusterBomb' or null
 */
export class AbilitySystem {
  constructor() {
    // ── Tank ability slot ──────────────────────────────────────────────────
    /** @type {string|null} Ability identifier from TankDefs.ability. */
    this._tankAbilityId = null;
    /** @type {number} Full cooldown duration in seconds. */
    this._tankCooldownMax = 0;
    /** @type {number} Seconds remaining before the slot is ready again (0 = ready). */
    this._tankCooldownRemaining = 0;

    // ── Weapon ability slot ───────────────────────────────────────────────
    /** @type {string|null} Ability identifier from WeaponDefs.ability. */
    this._weaponAbilityId = null;
    /** @type {number} Full cooldown duration in seconds. */
    this._weaponCooldownMax = 0;
    /** @type {number} Seconds remaining before the slot is ready again (0 = ready). */
    this._weaponCooldownRemaining = 0;
  }

  // ── Configuration ────────────────────────────────────────────────────────

  /**
   * Configure the tank ability slot from a TankDef entry.
   * Call this when the player's tank selection changes (loadout screen, restart).
   * Resets the cooldown so the ability is ready at round start.
   *
   * @param {{ ability: string|null, abilityCooldown: number }} def
   */
  setTankDef(def) {
    this._tankAbilityId       = def.ability        ?? null;
    this._tankCooldownMax     = def.abilityCooldown ?? 0;
    this._tankCooldownRemaining = 0; // ready at round start
  }

  /**
   * Configure the weapon ability slot from a WeaponDef entry.
   * Call this when the player's weapon selection changes.
   * Resets the cooldown so the ability is ready at round start.
   *
   * @param {{ ability: string|null, abilityCooldown: number }} def
   */
  setWeaponDef(def) {
    this._weaponAbilityId       = def.ability        ?? null;
    this._weaponCooldownMax     = def.abilityCooldown ?? 0;
    this._weaponCooldownRemaining = 0; // ready at round start
  }

  // ── Read-only state ───────────────────────────────────────────────────────

  /** Ability identifier for the tank slot, or null if the tank has no ability. */
  get tankAbilityId()   { return this._tankAbilityId; }

  /** Ability identifier for the weapon slot, or null if the weapon has no ability. */
  get weaponAbilityId() { return this._weaponAbilityId; }

  /**
   * True when the tank ability exists and is off cooldown.
   * @returns {boolean}
   */
  get tankReady() {
    return this._tankAbilityId !== null && this._tankCooldownRemaining <= 0;
  }

  /**
   * True when the weapon ability exists and is off cooldown.
   * @returns {boolean}
   */
  get weaponReady() {
    return this._weaponAbilityId !== null && this._weaponCooldownRemaining <= 0;
  }

  /**
   * Cooldown progress for the tank slot: 0 = fully ready, 1 = just activated / max wait.
   * Useful for a radial cooldown fill in AbilityBar UI (t045).
   * @returns {number} Value in [0, 1].
   */
  get tankCooldownFraction() {
    if (this._tankCooldownMax <= 0) return 0;
    return Math.max(0, this._tankCooldownRemaining / this._tankCooldownMax);
  }

  /**
   * Cooldown progress for the weapon slot: 0 = fully ready, 1 = just activated / max wait.
   * @returns {number} Value in [0, 1].
   */
  get weaponCooldownFraction() {
    if (this._weaponCooldownMax <= 0) return 0;
    return Math.max(0, this._weaponCooldownRemaining / this._weaponCooldownMax);
  }

  /**
   * Seconds remaining on the tank ability cooldown (0 = ready).
   * @returns {number}
   */
  get tankCooldownRemaining() {
    return Math.max(0, this._tankCooldownRemaining);
  }

  /**
   * Seconds remaining on the weapon ability cooldown (0 = ready).
   * @returns {number}
   */
  get weaponCooldownRemaining() {
    return Math.max(0, this._weaponCooldownRemaining);
  }

  // ── Per-frame update ──────────────────────────────────────────────────────

  /**
   * Advance cooldown timers.  Call once per game-loop tick with the frame delta.
   * @param {number} dt — seconds since the last frame
   */
  update(dt) {
    if (this._tankCooldownRemaining > 0) {
      this._tankCooldownRemaining = Math.max(0, this._tankCooldownRemaining - dt);
    }
    if (this._weaponCooldownRemaining > 0) {
      this._weaponCooldownRemaining = Math.max(0, this._weaponCooldownRemaining - dt);
    }
  }

  // ── Activation ────────────────────────────────────────────────────────────

  /**
   * Attempt to activate the tank ability slot.
   *
   * On success the slot enters cooldown and the ability ID is returned so the
   * caller (Game.js) can trigger the appropriate effect (t043).
   * On failure (no ability, or still on cooldown) returns null — silent no-op.
   *
   * Called when the player presses Q while in tank mode.
   *
   * @returns {string|null} Activated ability ID, or null if the slot is not ready.
   */
  tryActivateTankAbility() {
    if (!this.tankReady) return null;
    this._tankCooldownRemaining = this._tankCooldownMax;
    console.info(`[AbilitySystem] Tank ability activated: ${this._tankAbilityId} (cooldown ${this._tankCooldownMax}s)`);
    return this._tankAbilityId;
  }

  /**
   * Attempt to activate the weapon ability slot.
   *
   * On success the slot enters cooldown and the ability ID is returned so the
   * caller (Game.js) can trigger the appropriate effect (t044).
   * On failure (no ability, or still on cooldown) returns null — silent no-op.
   *
   * Called when the player presses Q while in on-foot soldier mode.
   *
   * @returns {string|null} Activated ability ID, or null if the slot is not ready.
   */
  tryActivateWeaponAbility() {
    if (!this.weaponReady) return null;
    this._weaponCooldownRemaining = this._weaponCooldownMax;
    console.info(`[AbilitySystem] Weapon ability activated: ${this._weaponAbilityId} (cooldown ${this._weaponCooldownMax}s)`);
    return this._weaponAbilityId;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Reset both cooldowns to 0 (abilities immediately ready).
   * Call at the start of each round so abilities are fresh, not carried over.
   */
  reset() {
    this._tankCooldownRemaining   = 0;
    this._weaponCooldownRemaining = 0;
  }
}
