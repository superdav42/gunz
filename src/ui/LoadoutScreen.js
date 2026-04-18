/**
 * LoadoutScreen — pre-match tank + weapon selection UI (t018).
 *
 * Renders a full-screen overlay (#loadout-overlay in index.html) that lets the
 * player pick their tank class and on-foot weapons from their owned inventory
 * before each match.
 *
 * Integration pattern (from Game.js):
 *
 *   this.loadout = new LoadoutScreen(inventory);
 *   // Show before first match and after each MATCH_END:
 *   this.loadout.show((selection) => {
 *     // selection = { tank, gun, melee }
 *     this.start();
 *   });
 *
 * The screen reads owned items from PlayerInventory and falls back to the
 * previously selected loadout as the default selection. On "Deploy", it calls
 * inventory.setLoadout(selection) then invokes the onDeploy callback.
 *
 * DOM requirements (index.html):
 *   #loadout-overlay        — outer full-screen container
 *   #loadout-tank-grid      — injected tank card list
 *   #loadout-gun-grid       — injected gun card list
 *   #loadout-melee-grid     — injected melee card list
 *   #loadout-deploy-btn     — "Deploy" button
 *   #loadout-money          — money balance display
 *   #loadout-selected-tank  — selected tank summary label
 *   #loadout-selected-gun   — selected gun summary label
 *   #loadout-selected-melee — selected melee summary label
 */

import { TANK_DEFS, getTankDef } from '../data/TankDefs.js';
import { WEAPON_DEFS, getWeaponDef } from '../data/WeaponDefs.js';

export class LoadoutScreen {
  /**
   * @param {import('../data/PlayerInventory.js').PlayerInventory} inventory
   */
  constructor(inventory) {
    this.inventory = inventory;

    /** @private @type {((selection: import('../data/PlayerInventory.js').LoadoutSelection) => void)|null} */
    this._onDeployCb = null;

    /** @private Current selections (updated as player clicks cards). */
    this._selection = { ...inventory.getLoadout() };

    // DOM references
    this._overlay      = document.getElementById('loadout-overlay');
    this._tankGrid     = document.getElementById('loadout-tank-grid');
    this._gunGrid      = document.getElementById('loadout-gun-grid');
    this._meleeGrid    = document.getElementById('loadout-melee-grid');
    this._deployBtn    = document.getElementById('loadout-deploy-btn');
    this._moneyEl      = document.getElementById('loadout-money');
    this._selTankEl    = document.getElementById('loadout-selected-tank');
    this._selGunEl     = document.getElementById('loadout-selected-gun');
    this._selMeleeEl   = document.getElementById('loadout-selected-melee');

    if (this._deployBtn) {
      this._deployBtn.addEventListener('click', () => this._deploy());
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Show the loadout screen. Rebuilds grids each time (inventory may have changed).
   * @param {(selection: import('../data/PlayerInventory.js').LoadoutSelection) => void} onDeploy
   */
  show(onDeploy) {
    this._onDeployCb = onDeploy;
    // Sync selection to whatever is currently saved (may differ from last show).
    this._selection = { ...this.inventory.getLoadout() };

    this._render();

    if (this._overlay) {
      this._overlay.classList.remove('hidden');
    }
  }

  /** Hide the loadout screen. */
  hide() {
    if (this._overlay) {
      this._overlay.classList.add('hidden');
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  /** @private Rebuild all card grids and update summary labels. */
  _render() {
    this._renderTankGrid();
    this._renderWeaponGrid('gun',   this._gunGrid);
    this._renderWeaponGrid('melee', this._meleeGrid);
    this._updateSummary();
    this._updateMoney();
  }

  /** @private */
  _renderTankGrid() {
    if (!this._tankGrid) {
      return;
    }
    this._tankGrid.innerHTML = '';

    const ownedIds = new Set(this.inventory.getOwnedTanks());

    for (const def of TANK_DEFS) {
      const owned    = ownedIds.has(def.id);
      const selected = this._selection.tank === def.id;
      const card     = this._makeTankCard(def, owned, selected);
      this._tankGrid.appendChild(card);
    }
  }

  /**
   * @private
   * @param {'gun'|'melee'} type
   * @param {HTMLElement|null} container
   */
  _renderWeaponGrid(type, container) {
    if (!container) {
      return;
    }
    container.innerHTML = '';

    const owned    = new Set(type === 'gun' ? this.inventory.getOwnedGuns() : this.inventory.getOwnedMelee());
    const selId    = type === 'gun' ? this._selection.gun : this._selection.melee;
    const weapons  = WEAPON_DEFS.filter(w => w.type === type);

    for (const def of weapons) {
      const isOwned    = owned.has(def.id);
      const isSelected = selId === def.id;
      const card       = this._makeWeaponCard(def, isOwned, isSelected, type);
      container.appendChild(card);
    }
  }

  /**
   * Build a tank selection card.
   * @private
   * @param {import('../data/TankDefs.js').TankDef} def
   * @param {boolean} owned
   * @param {boolean} selected
   * @returns {HTMLElement}
   */
  _makeTankCard(def, owned, selected) {
    const card = document.createElement('button');
    card.className = [
      'ls-card',
      'ls-tank-card',
      selected ? 'ls-card-selected' : '',
      !owned   ? 'ls-card-locked'   : '',
    ].join(' ').trim();

    card.dataset.id = def.id;

    // Color swatch
    const swatch = document.createElement('div');
    swatch.className = 'ls-tank-swatch';
    swatch.style.background = def.color;

    // Text block
    const info = document.createElement('div');
    info.className = 'ls-card-info';

    const nameLine = document.createElement('div');
    nameLine.className = 'ls-card-name';
    nameLine.textContent = def.name;

    const descLine = document.createElement('div');
    descLine.className = 'ls-card-desc';
    descLine.textContent = def.description;

    const statsLine = document.createElement('div');
    statsLine.className = 'ls-card-stats';
    statsLine.innerHTML =
      `HP <b>${def.baseHP}</b>&nbsp;&nbsp;` +
      `SPD <b>${def.baseSpeed.toFixed(1)}×</b>&nbsp;&nbsp;` +
      `ARM <b>${Math.round(def.baseArmor * 100)}%</b>` +
      (def.ability ? `&nbsp;&nbsp;⚡ <b>${def.ability}</b>` : '');

    const leagueLine = document.createElement('div');
    leagueLine.className = 'ls-card-league';
    if (!owned) {
      leagueLine.textContent = def.price === 0
        ? 'STARTER'
        : `$${def.price.toLocaleString()} · ${def.league.toUpperCase()}`;
      leagueLine.style.color = '#f44336';
    } else if (selected) {
      leagueLine.textContent = 'SELECTED';
      leagueLine.style.color = '#4caf50';
    } else {
      leagueLine.textContent = def.league.toUpperCase();
    }

    info.appendChild(nameLine);
    info.appendChild(descLine);
    info.appendChild(statsLine);
    info.appendChild(leagueLine);

    card.appendChild(swatch);
    card.appendChild(info);

    if (owned) {
      card.addEventListener('click', () => this._selectTank(def.id));
    } else {
      card.disabled = true;
      card.title = `Requires ${def.league} league and $${def.price.toLocaleString()}`;
    }

    return card;
  }

  /**
   * Build a weapon selection card.
   * @private
   * @param {import('../data/WeaponDefs.js').WeaponDef} def
   * @param {boolean} owned
   * @param {boolean} selected
   * @param {'gun'|'melee'} type
   * @returns {HTMLElement}
   */
  _makeWeaponCard(def, owned, selected, type) {
    const card = document.createElement('button');
    card.className = [
      'ls-card',
      'ls-weapon-card',
      selected ? 'ls-card-selected' : '',
      !owned   ? 'ls-card-locked'   : '',
    ].join(' ').trim();

    card.dataset.id = def.id;

    const icon = document.createElement('div');
    icon.className = 'ls-weapon-icon';
    icon.textContent = type === 'gun' ? '🔫' : '⚔️';

    const info = document.createElement('div');
    info.className = 'ls-card-info';

    const nameLine = document.createElement('div');
    nameLine.className = 'ls-card-name';
    nameLine.textContent = def.name;

    const descLine = document.createElement('div');
    descLine.className = 'ls-card-desc';
    descLine.textContent = def.description;

    const abilityLine = document.createElement('div');
    abilityLine.className = 'ls-card-league';
    if (!owned) {
      abilityLine.textContent = def.price === 0
        ? 'STARTER'
        : `$${def.price.toLocaleString()} · ${def.league.toUpperCase()}`;
      abilityLine.style.color = '#f44336';
    } else if (def.ability) {
      abilityLine.textContent = `⚡ ${def.ability}`;
      abilityLine.style.color = '#ffb300';
    } else if (selected) {
      abilityLine.textContent = 'SELECTED';
      abilityLine.style.color = '#4caf50';
    } else {
      abilityLine.textContent = def.league.toUpperCase();
    }

    info.appendChild(nameLine);
    info.appendChild(descLine);
    info.appendChild(abilityLine);

    card.appendChild(icon);
    card.appendChild(info);

    if (owned) {
      card.addEventListener('click', () => this._selectWeapon(type, def.id));
    } else {
      card.disabled = true;
      card.title = `Requires ${def.league} league and $${def.price.toLocaleString()}`;
    }

    return card;
  }

  // ---------------------------------------------------------------------------
  // Selection handlers
  // ---------------------------------------------------------------------------

  /** @private */
  _selectTank(id) {
    this._selection.tank = id;
    // Re-render just the tank grid to update selected state.
    this._renderTankGrid();
    this._updateSummary();
  }

  /**
   * @private
   * @param {'gun'|'melee'} type
   * @param {string} id
   */
  _selectWeapon(type, id) {
    if (type === 'gun') {
      this._selection.gun = id;
      this._renderWeaponGrid('gun', this._gunGrid);
    } else {
      this._selection.melee = id;
      this._renderWeaponGrid('melee', this._meleeGrid);
    }
    this._updateSummary();
  }

  /** @private */
  _updateSummary() {
    try {
      const tank  = getTankDef(this._selection.tank);
      const gun   = getWeaponDef(this._selection.gun);
      const melee = getWeaponDef(this._selection.melee);

      if (this._selTankEl)  this._selTankEl.textContent  = tank.name;
      if (this._selGunEl)   this._selGunEl.textContent   = gun.name;
      if (this._selMeleeEl) this._selMeleeEl.textContent = melee.name;
    } catch (_e) {
      // ids may be stale during initial render — ignore
    }
  }

  /** @private */
  _updateMoney() {
    if (this._moneyEl) {
      this._moneyEl.textContent = `$${this.inventory.getMoney().toLocaleString()}`;
    }
  }

  // ---------------------------------------------------------------------------
  // Deploy
  // ---------------------------------------------------------------------------

  /** @private */
  _deploy() {
    // Persist the selection.
    this.inventory.setLoadout(this._selection);
    this.hide();

    if (this._onDeployCb) {
      this._onDeployCb({ ...this._selection });
    }
  }
}
