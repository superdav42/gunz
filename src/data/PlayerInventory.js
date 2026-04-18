/**
 * PlayerInventory — localStorage-based stub for player-owned items and loadout.
 *
 * This is a minimal implementation that satisfies LoadoutScreen (t018) without
 * the full SaveSystem (t015) or ShopMenu (t017) being in place.
 *
 * Owned items default to the free starter set:
 *   - Tanks:  ['standard']
 *   - Guns:   ['pistol']
 *   - Melee:  ['combat_knife']
 *
 * Selected loadout (tank + gun + melee) is persisted across sessions.
 * The full SaveSystem (t015) will replace these simple primitives once
 * it is implemented; the API surface here is designed to be forward-compatible.
 */

const STORAGE_KEY = 'gunz_player_inventory_v1';

/** Default starter inventory — always owned regardless of storage state. */
const STARTER_TANKS  = ['standard'];
const STARTER_GUNS   = ['pistol'];
const STARTER_MELEE  = ['combat_knife'];

/**
 * @typedef {Object} LoadoutSelection
 * @property {string} tank  - Selected tank id
 * @property {string} gun   - Selected gun id
 * @property {string} melee - Selected melee weapon id
 */

/**
 * @typedef {Object} InventoryData
 * @property {string[]}         ownedTanks  - IDs of owned tank classes
 * @property {string[]}         ownedGuns   - IDs of owned guns
 * @property {string[]}         ownedMelee  - IDs of owned melee weapons
 * @property {LoadoutSelection} loadout     - Currently selected loadout
 * @property {number}           money       - Player's current balance ($)
 */

export class PlayerInventory {
  constructor() {
    /** @type {InventoryData} */
    this._data = this._load();
  }

  // ---------------------------------------------------------------------------
  // Read API
  // ---------------------------------------------------------------------------

  /** @returns {string[]} IDs of all owned tank classes. */
  getOwnedTanks() {
    return [...this._data.ownedTanks];
  }

  /** @returns {string[]} IDs of all owned guns. */
  getOwnedGuns() {
    return [...this._data.ownedGuns];
  }

  /** @returns {string[]} IDs of all owned melee weapons. */
  getOwnedMelee() {
    return [...this._data.ownedMelee];
  }

  /** @returns {LoadoutSelection} The currently selected loadout. */
  getLoadout() {
    return { ...this._data.loadout };
  }

  /** @returns {number} Current money balance. */
  getMoney() {
    return this._data.money;
  }

  /**
   * Check whether the player owns a specific item.
   * @param {'tank'|'gun'|'melee'} category
   * @param {string} id
   * @returns {boolean}
   */
  owns(category, id) {
    switch (category) {
      case 'tank':  return this._data.ownedTanks.includes(id);
      case 'gun':   return this._data.ownedGuns.includes(id);
      case 'melee': return this._data.ownedMelee.includes(id);
      default:      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Write API
  // ---------------------------------------------------------------------------

  /**
   * Save the player's loadout selection.
   * Called by LoadoutScreen when the player hits "Deploy".
   * @param {LoadoutSelection} loadout
   */
  setLoadout(loadout) {
    this._data.loadout = { ...loadout };
    this._save();
  }

  /**
   * Grant ownership of an item (used by ShopMenu t017 and SaveSystem t015).
   * @param {'tank'|'gun'|'melee'} category
   * @param {string} id
   */
  grantItem(category, id) {
    switch (category) {
      case 'tank':
        if (!this._data.ownedTanks.includes(id)) {
          this._data.ownedTanks.push(id);
        }
        break;
      case 'gun':
        if (!this._data.ownedGuns.includes(id)) {
          this._data.ownedGuns.push(id);
        }
        break;
      case 'melee':
        if (!this._data.ownedMelee.includes(id)) {
          this._data.ownedMelee.push(id);
        }
        break;
    }
    this._save();
  }

  /**
   * Deduct money. Returns false if the player cannot afford it.
   * @param {number} amount
   * @returns {boolean}
   */
  spendMoney(amount) {
    if (this._data.money < amount) {
      return false;
    }
    this._data.money -= amount;
    this._save();
    return true;
  }

  /**
   * Add money (called after a match reward is calculated).
   * @param {number} amount
   */
  addMoney(amount) {
    this._data.money += amount;
    this._save();
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  /** @private */
  _defaultData() {
    return {
      ownedTanks: [...STARTER_TANKS],
      ownedGuns:  [...STARTER_GUNS],
      ownedMelee: [...STARTER_MELEE],
      loadout: {
        tank:  STARTER_TANKS[0],
        gun:   STARTER_GUNS[0],
        melee: STARTER_MELEE[0],
      },
      money: 0,
    };
  }

  /** @private */
  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return this._defaultData();
      }
      const parsed = JSON.parse(raw);
      // Merge with defaults to handle schema additions from future updates.
      const defaults = this._defaultData();
      return {
        ownedTanks: this._mergeUnique(defaults.ownedTanks, parsed.ownedTanks),
        ownedGuns:  this._mergeUnique(defaults.ownedGuns,  parsed.ownedGuns),
        ownedMelee: this._mergeUnique(defaults.ownedMelee, parsed.ownedMelee),
        loadout: {
          tank:  parsed.loadout?.tank  || defaults.loadout.tank,
          gun:   parsed.loadout?.gun   || defaults.loadout.gun,
          melee: parsed.loadout?.melee || defaults.loadout.melee,
        },
        money: typeof parsed.money === 'number' ? parsed.money : 0,
      };
    } catch (_e) {
      return this._defaultData();
    }
  }

  /** @private */
  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
    } catch (_e) {
      // localStorage may be unavailable (private browsing, storage quota). Fail silently.
    }
  }

  /**
   * Merge two arrays keeping all unique values. Starter items always included.
   * @private
   * @param {string[]} defaults
   * @param {string[]} stored
   * @returns {string[]}
   */
  _mergeUnique(defaults, stored) {
    const set = new Set([...defaults, ...(Array.isArray(stored) ? stored : [])]);
    return [...set];
  }
}
