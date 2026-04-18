/**
 * SaveSystem — schema-versioned localStorage persistence for the player profile.
 *
 * Persisted profile fields (schema v1):
 *  - schemaVersion      : number
 *  - money              : number — bank balance (kept in sync with EconomySystem)
 *  - leagueId           : string — 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'champion'
 *  - leaguePoints       : number — accumulated LP
 *  - ownedTanks         : string[] — tank class IDs (always includes 'standard')
 *  - ownedWeapons       : string[] — primary weapon IDs (always includes 'pistol')
 *  - ownedMelee         : string[] — melee weapon IDs (always includes 'combat_knife')
 *  - ownedSkins         : string[] — cosmetic skin IDs
 *  - equippedTankClass  : string
 *  - equippedPrimary    : string
 *  - equippedMelee      : string
 *  - upgrades           : object — { [scope: tankClass | 'infantry']: { [upgradeId]: tier } }
 *
 * Schema versioning:
 *  Increment SCHEMA_VERSION whenever the profile shape changes.
 *  Add a migration branch in _migrate() that brings older saves up to the new shape.
 *
 * Usage:
 *  const save = new SaveSystem();
 *  const profile = save.load();              // call once at startup; returns profile
 *  save.getProfile();                        // returns a defensive copy any time
 *  save.updateMoney(newBalance);
 *  save.save();                              // persist to localStorage
 *  save.reset();                             // wipe to factory defaults and save
 */

/** Increment when the profile schema changes.  Add migration in _migrate(). */
const SCHEMA_VERSION = 1;

/** localStorage key. */
const STORAGE_KEY = 'gunz_profile_v1';

/**
 * Factory for a brand-new default profile (no progression).
 * @returns {PlayerProfile}
 */
function createDefaultProfile() {
  return {
    schemaVersion: SCHEMA_VERSION,
    money: 0,
    leagueId: 'bronze',
    leaguePoints: 0,
    ownedTanks: ['standard'],
    ownedWeapons: ['pistol'],
    ownedMelee: ['combat_knife'],
    ownedSkins: [],
    equippedTankClass: 'standard',
    equippedPrimary: 'pistol',
    equippedMelee: 'combat_knife',
    upgrades: {},
  };
}

export class SaveSystem {
  constructor() {
    /** @type {PlayerProfile|null} */
    this._profile = null;
  }

  // ---------------------------------------------------------------------------
  // Load / save / reset
  // ---------------------------------------------------------------------------

  /**
   * Load the profile from localStorage.
   * Falls back to the default profile on missing or corrupt data.
   * Call once at game startup before reading any profile data.
   *
   * @returns {PlayerProfile} the loaded (or default) profile
   */
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) {
        this._profile = createDefaultProfile();
      } else {
        this._profile = this._migrate(JSON.parse(raw));
      }
    } catch (err) {
      console.warn('[SaveSystem] Failed to load profile — resetting to defaults.', err);
      this._profile = createDefaultProfile();
    }
    return this.getProfile();
  }

  /**
   * Persist the in-memory profile to localStorage.
   * Call after any mutation (updateMoney, addOwnedItem, etc.).
   *
   * @returns {boolean} true on success, false on quota or serialization error.
   */
  save() {
    if (!this._profile) {
      console.warn('[SaveSystem] save() called before load() — initialising defaults.');
      this._profile = createDefaultProfile();
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._profile));
      return true;
    } catch (err) {
      console.error('[SaveSystem] Failed to persist profile.', err);
      return false;
    }
  }

  /**
   * Wipe the saved profile and reset to factory defaults.
   * Immediately persists the default profile.
   *
   * @returns {PlayerProfile} the new default profile
   */
  reset() {
    this._profile = createDefaultProfile();
    this.save();
    return this.getProfile();
  }

  // ---------------------------------------------------------------------------
  // Profile accessor
  // ---------------------------------------------------------------------------

  /**
   * Defensive copy of the current in-memory profile.
   * Treat the returned object as read-only; use the mutation helpers below.
   *
   * @throws {Error} if load() has not been called.
   * @returns {PlayerProfile}
   */
  getProfile() {
    if (!this._profile) {
      throw new Error('[SaveSystem] getProfile() called before load().');
    }
    return {
      ...this._profile,
      ownedTanks:   [...this._profile.ownedTanks],
      ownedWeapons: [...this._profile.ownedWeapons],
      ownedMelee:   [...this._profile.ownedMelee],
      ownedSkins:   [...this._profile.ownedSkins],
      upgrades:     JSON.parse(JSON.stringify(this._profile.upgrades)),
    };
  }

  // ---------------------------------------------------------------------------
  // Mutation helpers
  // (each mutates in memory — caller must call save() afterwards)
  // ---------------------------------------------------------------------------

  /**
   * Update the stored money balance.
   * Typically called with EconomySystem.balance after a match ends.
   *
   * @param {number} amount — new balance; clamped to ≥ 0.
   */
  updateMoney(amount) {
    this._assertLoaded();
    this._profile.money = Math.max(0, Math.floor(amount));
  }

  /**
   * Update the stored league state.
   *
   * @param {string} leagueId — league identifier (e.g. 'bronze', 'silver')
   * @param {number} lp       — accumulated league points
   */
  updateLeague(leagueId, lp) {
    this._assertLoaded();
    this._profile.leagueId = leagueId;
    this._profile.leaguePoints = Math.max(0, Math.floor(lp));
  }

  /**
   * Record an item purchase.  Adds to the appropriate owned list if not present.
   *
   * @param {'tank'|'weapon'|'melee'|'skin'} type
   * @param {string} id
   */
  addOwnedItem(type, id) {
    this._assertLoaded();
    const key = _ownedKey(type);
    if (!this._profile[key].includes(id)) {
      this._profile[key].push(id);
    }
  }

  /**
   * Check whether an item is owned.
   *
   * @param {'tank'|'weapon'|'melee'|'skin'} type
   * @param {string} id
   * @returns {boolean}
   */
  hasItem(type, id) {
    this._assertLoaded();
    return this._profile[_ownedKey(type)].includes(id);
  }

  /**
   * Update the equipped loadout.
   *
   * @param {string} tankClass — tank class ID
   * @param {string} primary   — primary weapon ID
   * @param {string} melee     — melee weapon ID
   */
  setLoadout(tankClass, primary, melee) {
    this._assertLoaded();
    this._profile.equippedTankClass = tankClass;
    this._profile.equippedPrimary   = primary;
    this._profile.equippedMelee     = melee;
  }

  /**
   * Record a purchased upgrade tier.
   *
   * @param {string} scope     — tank class ID or 'infantry' for on-foot weapon upgrades
   * @param {string} upgradeId — upgrade identifier (e.g. 'armor_plating', 'main_gun')
   * @param {number} tier      — the tier now owned (1-based)
   */
  setUpgrade(scope, upgradeId, tier) {
    this._assertLoaded();
    if (!this._profile.upgrades[scope]) {
      this._profile.upgrades[scope] = {};
    }
    this._profile.upgrades[scope][upgradeId] = Math.max(0, Math.floor(tier));
  }

  /**
   * Get the current tier for an upgrade (0 = not purchased).
   *
   * @param {string} scope
   * @param {string} upgradeId
   * @returns {number}
   */
  getUpgradeTier(scope, upgradeId) {
    this._assertLoaded();
    return (this._profile.upgrades[scope] && this._profile.upgrades[scope][upgradeId]) || 0;
  }

  // ---------------------------------------------------------------------------
  // Schema migration
  // ---------------------------------------------------------------------------

  /**
   * Bring a parsed save blob up to SCHEMA_VERSION.
   * Handles corrupt input by falling back to defaults.
   *
   * @param {object} raw — parsed JSON from localStorage
   * @returns {PlayerProfile}
   */
  _migrate(raw) {
    if (typeof raw !== 'object' || raw === null) {
      console.warn('[SaveSystem] Corrupt profile data — resetting to defaults.');
      return createDefaultProfile();
    }

    const fromVersion = raw.schemaVersion || 0;

    // v0 → v1: fill any missing fields with defaults.
    if (fromVersion < 1) {
      raw.schemaVersion    = 1;
      raw.money            = raw.money            ?? 0;
      raw.leagueId         = raw.leagueId         ?? 'bronze';
      raw.leaguePoints     = raw.leaguePoints     ?? 0;
      raw.ownedTanks       = raw.ownedTanks       ?? ['standard'];
      raw.ownedWeapons     = raw.ownedWeapons     ?? ['pistol'];
      raw.ownedMelee       = raw.ownedMelee       ?? ['combat_knife'];
      raw.ownedSkins       = raw.ownedSkins       ?? [];
      raw.equippedTankClass= raw.equippedTankClass?? 'standard';
      raw.equippedPrimary  = raw.equippedPrimary  ?? 'pistol';
      raw.equippedMelee    = raw.equippedMelee    ?? 'combat_knife';
      raw.upgrades         = raw.upgrades         ?? {};
    }

    // Future migrations go here as additional `if (fromVersion < N)` blocks.

    return _mergeWithDefaults(raw);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * @throws {Error}
   */
  _assertLoaded() {
    if (!this._profile) {
      throw new Error('[SaveSystem] Must call load() before mutating the profile.');
    }
  }
}

// ---------------------------------------------------------------------------
// Module-private helpers
// ---------------------------------------------------------------------------

/**
 * Map item type to profile array key.
 * @param {'tank'|'weapon'|'melee'|'skin'} type
 * @returns {string}
 */
function _ownedKey(type) {
  const map = { tank: 'ownedTanks', weapon: 'ownedWeapons', melee: 'ownedMelee', skin: 'ownedSkins' };
  if (!map[type]) throw new Error(`[SaveSystem] Unknown item type: "${type}"`);
  return map[type];
}

/**
 * Merge a migrated raw object with defaults to fill any remaining gaps
 * and clamp numeric fields.
 *
 * @param {object} raw
 * @returns {PlayerProfile}
 */
function _mergeWithDefaults(raw) {
  const d = createDefaultProfile();
  return {
    schemaVersion:    SCHEMA_VERSION,
    money:            typeof raw.money            === 'number'  ? Math.max(0, Math.floor(raw.money))            : d.money,
    leagueId:         typeof raw.leagueId         === 'string'  ? raw.leagueId                                  : d.leagueId,
    leaguePoints:     typeof raw.leaguePoints     === 'number'  ? Math.max(0, Math.floor(raw.leaguePoints))     : d.leaguePoints,
    ownedTanks:       Array.isArray(raw.ownedTanks)             ? raw.ownedTanks                                : d.ownedTanks,
    ownedWeapons:     Array.isArray(raw.ownedWeapons)           ? raw.ownedWeapons                              : d.ownedWeapons,
    ownedMelee:       Array.isArray(raw.ownedMelee)             ? raw.ownedMelee                                : d.ownedMelee,
    ownedSkins:       Array.isArray(raw.ownedSkins)             ? raw.ownedSkins                                : d.ownedSkins,
    equippedTankClass:typeof raw.equippedTankClass === 'string' ? raw.equippedTankClass                         : d.equippedTankClass,
    equippedPrimary:  typeof raw.equippedPrimary   === 'string' ? raw.equippedPrimary                           : d.equippedPrimary,
    equippedMelee:    typeof raw.equippedMelee     === 'string' ? raw.equippedMelee                             : d.equippedMelee,
    upgrades: (typeof raw.upgrades === 'object' && raw.upgrades !== null) ? raw.upgrades : d.upgrades,
  };
}

/**
 * @typedef {{
 *   schemaVersion:    number,
 *   money:            number,
 *   leagueId:         string,
 *   leaguePoints:     number,
 *   ownedTanks:       string[],
 *   ownedWeapons:     string[],
 *   ownedMelee:       string[],
 *   ownedSkins:       string[],
 *   equippedTankClass:string,
 *   equippedPrimary:  string,
 *   equippedMelee:    string,
 *   upgrades:         Object.<string, Object.<string, number>>
 * }} PlayerProfile
 */
