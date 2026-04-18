/**
 * LoadoutScreen — pre-match tank + weapon selection UI (t018).
 *
 * Renders a full-screen overlay (#loadout-overlay in index.html) that lets the
 * player pick their tank class and on-foot weapons from their owned inventory
 * before each match.
 *
 * Integration pattern (from Game.js):
 *
 *   this.loadoutScreen = new LoadoutScreen(this.save);
 *   // Show before first match and after each MATCH_END:
 *   this.loadoutScreen.show((selection) => {
 *     // selection = { tank, gun, melee }
 *     this._startImmediately();
 *   });
 *
 * The screen reads owned items and equipped loadout from SaveSystem.getProfile()
 * and on "Deploy" invokes the callback with the selection — Game.js is responsible
 * for calling save.setLoadout() and save.save() so the choice persists.
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

import { TankDefs, TANK_ORDER } from '../data/TankDefs.js';
import { GunDefs, MeleeDefs, GUN_ORDER, MELEE_ORDER } from '../data/WeaponDefs.js';

export class LoadoutScreen {
  /**
   * @param {import('../systems/SaveSystem.js').SaveSystem} save
   */
  constructor(save) {
    this.save = save;

    /** @private @type {((selection: {tank:string,gun:string,melee:string}) => void)|null} */
    this._onDeployCb = null;

    /** @private Current selection — initialised from saved profile each show(). */
    this._sel = { tank: 'standard', gun: 'pistol', melee: 'combatKnife' };

    // DOM references — resolved once (elements are static in index.html)
    this._overlay    = document.getElementById('loadout-overlay');
    this._tankGrid   = document.getElementById('loadout-tank-grid');
    this._gunGrid    = document.getElementById('loadout-gun-grid');
    this._meleeGrid  = document.getElementById('loadout-melee-grid');
    this._deployBtn  = document.getElementById('loadout-deploy-btn');
    this._moneyEl    = document.getElementById('loadout-money');
    this._selTankEl  = document.getElementById('loadout-selected-tank');
    this._selGunEl   = document.getElementById('loadout-selected-gun');
    this._selMeleeEl = document.getElementById('loadout-selected-melee');

    if (this._deployBtn) {
      this._deployBtn.addEventListener('click', () => this._deploy());
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Show the loadout screen. Rebuilds grids each time so newly purchased items
   * (from the shop) appear without requiring a reload.
   * @param {(selection: {tank:string,gun:string,melee:string}) => void} onDeploy
   */
  show(onDeploy) {
    this._onDeployCb = onDeploy;

    // Sync selection from persisted profile.
    const profile = this.save.getProfile();
    this._sel = {
      tank:  profile.equippedTankClass || 'standard',
      gun:   profile.equippedPrimary   || 'pistol',
      melee: profile.equippedMelee     || 'combatKnife',
    };

    this._render(profile);

    if (this._overlay) {
      this._overlay.classList.remove('hidden');
    }
  }

  /** Hide the loadout screen without triggering onDeploy. */
  hide() {
    if (this._overlay) {
      this._overlay.classList.add('hidden');
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  /**
   * @private
   * @param {import('../systems/SaveSystem.js').PlayerProfile} profile
   */
  _render(profile) {
    this._renderTankGrid(profile.ownedTanks);
    this._renderGunGrid(profile.ownedWeapons);
    this._renderMeleeGrid(profile.ownedMelee);
    this._updateSummary();
    this._updateMoney(profile.money);
  }

  /**
   * @private
   * @param {string[]} ownedIds
   */
  _renderTankGrid(ownedIds) {
    if (!this._tankGrid) {
      return;
    }
    this._tankGrid.innerHTML = '';
    const owned = new Set(ownedIds);

    for (const id of TANK_ORDER) {
      const def = TankDefs[id];
      if (!def) {
        continue;
      }
      const card = this._makeTankCard(def, owned.has(id), this._sel.tank === id);
      this._tankGrid.appendChild(card);
    }
  }

  /**
   * @private
   * @param {string[]} ownedIds
   */
  _renderGunGrid(ownedIds) {
    if (!this._gunGrid) {
      return;
    }
    this._gunGrid.innerHTML = '';
    const owned = new Set(ownedIds);

    for (const id of GUN_ORDER) {
      const def = GunDefs[id];
      if (!def) {
        continue;
      }
      const card = this._makeWeaponCard(def, owned.has(id), this._sel.gun === id, 'gun');
      this._gunGrid.appendChild(card);
    }
  }

  /**
   * @private
   * @param {string[]} ownedIds
   */
  _renderMeleeGrid(ownedIds) {
    if (!this._meleeGrid) {
      return;
    }
    this._meleeGrid.innerHTML = '';
    const owned = new Set(ownedIds);

    for (const id of MELEE_ORDER) {
      const def = MeleeDefs[id];
      if (!def) {
        continue;
      }
      const card = this._makeWeaponCard(def, owned.has(id), this._sel.melee === id, 'melee');
      this._meleeGrid.appendChild(card);
    }
  }

  /**
   * @private
   * @param {object} def - TankDef from TankDefs
   * @param {boolean} owned
   * @param {boolean} selected
   * @returns {HTMLElement}
   */
  _makeTankCard(def, owned, selected) {
    const card = document.createElement('button');
    card.className = [
      'ls-card ls-tank-card',
      selected ? 'ls-card-selected' : '',
      !owned   ? 'ls-card-locked'   : '',
    ].join(' ').trim();
    card.dataset.id = def.id;

    // Color swatch — use colorBody hex (stored as number, convert to CSS hex)
    const swatch = document.createElement('div');
    swatch.className = 'ls-tank-swatch';
    swatch.style.background = '#' + def.colorBody.toString(16).padStart(6, '0');

    // Info block
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
    const armorPct = Math.round(def.armor * 100);
    statsLine.innerHTML =
      `HP <b>${def.hp}</b>&nbsp;&nbsp;` +
      `SPD <b>${def.speed}</b>&nbsp;&nbsp;` +
      `ARM <b>${armorPct}%</b>` +
      (def.ability ? `&nbsp;&nbsp;⚡ <b>${def.ability}</b>` : '');

    const leagueLine = document.createElement('div');
    leagueLine.className = 'ls-card-league';
    if (!owned) {
      leagueLine.textContent = def.price === 0
        ? 'STARTER'
        : `$${def.price.toLocaleString()} · ${def.leagueRequired.toUpperCase()}`;
      leagueLine.style.color = '#f44336';
    } else if (selected) {
      leagueLine.textContent = 'SELECTED';
      leagueLine.style.color = '#4caf50';
    } else {
      leagueLine.textContent = def.leagueRequired.toUpperCase();
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
      card.title = `Requires ${def.leagueRequired} league` +
        (def.price > 0 ? ` and $${def.price.toLocaleString()}` : '');
    }

    return card;
  }

  /**
   * @private
   * @param {object} def - GunDef or MeleeDef
   * @param {boolean} owned
   * @param {boolean} selected
   * @param {'gun'|'melee'} type
   * @returns {HTMLElement}
   */
  _makeWeaponCard(def, owned, selected, type) {
    const card = document.createElement('button');
    card.className = [
      'ls-card ls-weapon-card',
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
        : `$${def.price.toLocaleString()} · ${def.leagueRequired.toUpperCase()}`;
      abilityLine.style.color = '#f44336';
    } else if (def.ability) {
      abilityLine.textContent = `⚡ ${def.ability}`;
      abilityLine.style.color = '#ffb300';
    } else if (selected) {
      abilityLine.textContent = 'SELECTED';
      abilityLine.style.color = '#4caf50';
    } else {
      abilityLine.textContent = def.leagueRequired.toUpperCase();
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
      card.title = `Requires ${def.leagueRequired} league` +
        (def.price > 0 ? ` and $${def.price.toLocaleString()}` : '');
    }

    return card;
  }

  // ---------------------------------------------------------------------------
  // Selection handlers
  // ---------------------------------------------------------------------------

  /** @private */
  _selectTank(id) {
    this._sel.tank = id;
    const profile = this.save.getProfile();
    this._renderTankGrid(profile.ownedTanks);
    this._updateSummary();
  }

  /**
   * @private
   * @param {'gun'|'melee'} type
   * @param {string} id
   */
  _selectWeapon(type, id) {
    const profile = this.save.getProfile();
    if (type === 'gun') {
      this._sel.gun = id;
      this._renderGunGrid(profile.ownedWeapons);
    } else {
      this._sel.melee = id;
      this._renderMeleeGrid(profile.ownedMelee);
    }
    this._updateSummary();
  }

  /** @private */
  _updateSummary() {
    const tank  = TankDefs[this._sel.tank];
    const gun   = GunDefs[this._sel.gun];
    const melee = MeleeDefs[this._sel.melee];

    if (this._selTankEl)  this._selTankEl.textContent  = tank  ? tank.name  : this._sel.tank;
    if (this._selGunEl)   this._selGunEl.textContent   = gun   ? gun.name   : this._sel.gun;
    if (this._selMeleeEl) this._selMeleeEl.textContent = melee ? melee.name : this._sel.melee;
  }

  /**
   * @private
   * @param {number} money
   */
  _updateMoney(money) {
    if (this._moneyEl) {
      this._moneyEl.textContent = `$${money.toLocaleString()}`;
    }
  }

  // ---------------------------------------------------------------------------
  // Deploy
  // ---------------------------------------------------------------------------

  /** @private */
  _deploy() {
    this.hide();
    if (this._onDeployCb) {
      this._onDeployCb({ ...this._sel });
    }
  }
}
