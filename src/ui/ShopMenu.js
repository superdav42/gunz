/**
 * ShopMenu — between-match shop with 4 tabs.
 * Tabs: Tanks | Weapons | Upgrades | Skins
 *
 * Uses the data APIs from src/data/ (TankDefs, WeaponDefs, UpgradeDefs)
 * and the SaveSystem / EconomySystem already wired in Game.js.
 *
 * Requires a `<div id="shop-menu" class="hidden">` element in index.html.
 *
 * Usage:
 *   const shop = new ShopMenu(save, economy);
 *   shop.onClose(() => { resumeGame(); });
 *   shop.open();
 */

import {
  TankDefs, TANK_ORDER,
} from '../data/TankDefs.js';
import {
  GunDefs, MeleeDefs, GUN_ORDER, MELEE_ORDER,
} from '../data/WeaponDefs.js';
import {
  TankUpgradeDefs, FootUpgradeDefs,
  TANK_UPGRADE_ORDER, FOOT_UPGRADE_ORDER,
  LEAGUE_TIER_CAPS,
} from '../data/UpgradeDefs.js';

// League ordering for comparison
const LEAGUE_ORDER = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'champion'];

/** @param {string} league @returns {number} */
function leagueIndex(league) {
  const i = LEAGUE_ORDER.indexOf(league);
  return i >= 0 ? i : 0;
}

/** Cosmetic skin definitions (league-free) */
const SKIN_DEFS = [
  { id: 'camo_green',    name: 'Camo Green',    price: 500,  desc: 'Military woodland camo.' },
  { id: 'desert_tan',    name: 'Desert Tan',    price: 750,  desc: 'Sandy desert scheme.' },
  { id: 'arctic_white',  name: 'Arctic White',  price: 1000, desc: 'Snow camouflage.' },
  { id: 'stealth_black', name: 'Stealth Black', price: 1500, desc: 'All-black tactical finish.' },
  { id: 'neon_blue',     name: 'Neon Blue',     price: 2000, desc: 'Electric blue neon.' },
  { id: 'chrome',        name: 'Chrome',        price: 3000, desc: 'Mirror-polished chrome.' },
  { id: 'gold_plated',   name: 'Gold Plated',   price: 5000, desc: 'Prestige gold finish.' },
];

export class ShopMenu {
  /**
   * @param {import('../systems/SaveSystem.js').SaveSystem} save
   * @param {import('../systems/EconomySystem.js').EconomySystem} economy
   */
  constructor(save, economy) {
    this._save    = save;
    this._economy = economy;
    this._tab     = 'tanks';
    this._closeCbs = [];

    this._el = document.getElementById('shop-menu');
    if (!this._el) {
      console.error('[ShopMenu] #shop-menu element not found in DOM');
      return;
    }

    this._bindEvents();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** @param {() => void} fn */
  onClose(fn) { this._closeCbs.push(fn); }

  open() {
    this._tab = 'tanks';
    this._render();
    this._el.classList.remove('hidden');
  }

  close() {
    this._el.classList.add('hidden');
    for (const fn of this._closeCbs) fn();
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  _bindEvents() {
    this._el.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('[data-tab]');
      if (tabBtn) { this._tab = tabBtn.dataset.tab; this._render(); return; }

      const buyBtn = e.target.closest('[data-buy]');
      if (buyBtn && !buyBtn.disabled) { this._handleBuy(buyBtn.dataset); return; }

      if (e.target.closest('#shop-close-btn')) { this.close(); }
    });
  }

  /** @returns {{ leagueId: string, leagueIdx: number }} */
  _playerLeague() {
    const profile = this._save.getProfile();
    const id = profile.leagueId ?? 'bronze';
    return { leagueId: id, leagueIdx: leagueIndex(id) };
  }

  _render() {
    const { leagueId } = this._playerLeague();
    const balance = this._economy.balance;
    const leagueName = leagueId.charAt(0).toUpperCase() + leagueId.slice(1);

    this._el.innerHTML = `
      <div class="shop-panel">
        <div class="shop-header">
          <span class="shop-title">SHOP</span>
          <div class="shop-meta">
            <span class="shop-money">$${balance.toLocaleString()}</span>
            <span class="shop-league-badge">${leagueName}</span>
          </div>
          <button id="shop-close-btn" class="shop-close-btn" aria-label="Close shop">&#x2715;</button>
        </div>
        <nav class="shop-tabs">
          ${['tanks','weapons','upgrades','skins'].map(t => `
            <button class="shop-tab-btn${this._tab === t ? ' active' : ''}" data-tab="${t}">
              ${t.charAt(0).toUpperCase() + t.slice(1)}
            </button>`).join('')}
        </nav>
        <div class="shop-content">${this._renderTab()}</div>
      </div>
    `;
  }

  _renderTab() {
    switch (this._tab) {
      case 'tanks':    return this._renderTanks();
      case 'weapons':  return this._renderWeapons();
      case 'upgrades': return this._renderUpgrades();
      case 'skins':    return this._renderSkins();
      default:         return '';
    }
  }

  // ── Tanks tab ──────────────────────────────────────────────────────────────

  _renderTanks() {
    const { leagueIdx } = this._playerLeague();
    const cards = TANK_ORDER.map(id => {
      const def        = TankDefs[id];
      if (!def) return '';
      const owned      = this._save.hasItem('tank', id);
      const locked     = leagueIndex(def.leagueRequired) > leagueIdx;
      const affordable = this._economy.canAfford(def.price);

      return `
        <div class="shop-card${owned ? ' owned' : ''}${locked ? ' locked' : ''}">
          <div class="shop-card-name">${def.name}
            ${def.ability ? `<span class="shop-ability-tag">${def.ability}</span>` : ''}
          </div>
          <div class="shop-card-desc">${def.description}</div>
          <div class="shop-card-stats">
            <span>HP ${def.hp}</span>
            <span>Spd ${def.speed}</span>
            <span>Arm ${Math.round(def.armor * 100)}%</span>
          </div>
          ${locked ? `<div class="shop-req-label">Requires ${def.leagueRequired}</div>` : ''}
          <div class="shop-card-footer">
            ${this._cardFooter('tank', id, def.price, owned, locked, affordable)}
          </div>
        </div>
      `;
    }).join('');

    return `<div class="shop-grid">${cards}</div>`;
  }

  // ── Weapons tab ────────────────────────────────────────────────────────────

  _renderWeapons() {
    const { leagueIdx } = this._playerLeague();

    const renderGroup = (label, defs, order, saveType) => {
      const cards = order.map(id => {
        const def = defs[id];
        if (!def) return '';
        const owned      = this._save.hasItem(saveType, id);
        const locked     = leagueIndex(def.leagueRequired) > leagueIdx;
        const affordable = this._economy.canAfford(def.price);

        const stats = saveType === 'melee'
          ? `<span>DMG ${def.damage}</span><span>Rng ${def.range}m</span>`
          : `<span>DMG ${def.damage}</span><span>RPS ${def.fireRate}</span><span>Rng ${def.range}m</span>`;

        return `
          <div class="shop-card${owned ? ' owned' : ''}${locked ? ' locked' : ''}">
            <div class="shop-card-name">${def.name}
              ${def.isExplosive ? `<span class="shop-type-tag">Explosive</span>` : ''}
              ${def.ability ? `<span class="shop-ability-tag">${def.ability}</span>` : ''}
            </div>
            <div class="shop-card-desc">${def.description}</div>
            <div class="shop-card-stats">${stats}</div>
            ${locked ? `<div class="shop-req-label">Requires ${def.leagueRequired}</div>` : ''}
            <div class="shop-card-footer">
              ${this._cardFooter(saveType, id, def.price, owned, locked, affordable)}
            </div>
          </div>
        `;
      }).join('');
      return `<div class="shop-weapon-group"><div class="shop-group-label">${label}</div><div class="shop-grid">${cards}</div></div>`;
    };

    return (
      renderGroup('Firearms &amp; Explosives', GunDefs, GUN_ORDER, 'weapon') +
      renderGroup('Melee', MeleeDefs, MELEE_ORDER, 'melee')
    );
  }

  // ── Upgrades tab ───────────────────────────────────────────────────────────

  _renderUpgrades() {
    const { leagueId } = this._playerLeague();
    const tierCap = LEAGUE_TIER_CAPS[leagueId] ?? 2;

    const renderGroup = (label, defs, order, scope) => {
      const rows = order.map(id => {
        const upg = defs[id];
        if (!upg) return '';

        const currentTier = this._save.getUpgradeTier(scope, upg.id);
        const maxTier     = Math.min(upg.maxTier, tierCap);
        const canUpgrade  = currentTier < maxTier;
        const nextCost    = canUpgrade ? upg.costs[currentTier] : null;
        const affordable  = nextCost !== null ? this._economy.canAfford(nextCost) : false;
        const nextLeague  = canUpgrade ? (upg.leaguePerTier[currentTier] ?? 'bronze') : null;
        const locked      = nextLeague ? leagueIndex(nextLeague) > leagueIndex(leagueId) : false;

        const pips = Array.from({ length: upg.maxTier }, (_, i) =>
          `<span class="tier-pip${i < currentTier ? ' filled' : ''}"></span>`
        ).join('');

        const action = !canUpgrade
          ? `<span class="shop-maxed-label">MAX</span>`
          : `<button class="shop-buy-btn${(!affordable || locked) ? ' disabled' : ''}"
              data-buy="upgrade"
              data-scope="${scope}"
              data-id="${upg.id}"
              data-price="${nextCost ?? 0}"
              data-tier="${currentTier + 1}"
              ${(!affordable || locked) ? 'disabled' : ''}>
              $${nextCost?.toLocaleString() ?? '?'}
            </button>`;

        return `
          <div class="shop-upgrade-row${!canUpgrade ? ' maxed' : ''}${locked ? ' locked' : ''}">
            <div class="shop-upgrade-info">
              <span class="shop-upgrade-name">${upg.name}</span>
              <span class="shop-upgrade-effect">${upg.description}</span>
            </div>
            <div class="shop-upgrade-tiers">
              ${pips}<span class="tier-count">${currentTier}/${maxTier}</span>
            </div>
            ${locked && nextLeague ? `<span class="shop-req-label">Req: ${nextLeague}</span>` : ''}
            <div class="shop-upgrade-action">${action}</div>
          </div>
        `;
      }).join('');

      return `<div class="shop-upgrade-group"><div class="shop-group-label">${label}</div>${rows}</div>`;
    };

    // Tank upgrades use 'standard' as scope (t041 will add per-class selection)
    return (
      renderGroup('Tank Upgrades (Standard)', TankUpgradeDefs, TANK_UPGRADE_ORDER, 'standard') +
      renderGroup('On-Foot Upgrades', FootUpgradeDefs, FOOT_UPGRADE_ORDER, 'infantry')
    );
  }

  // ── Skins tab ──────────────────────────────────────────────────────────────

  _renderSkins() {
    const cards = SKIN_DEFS.map(def => {
      const owned      = this._save.hasItem('skin', def.id);
      const affordable = this._economy.canAfford(def.price);
      return `
        <div class="shop-card${owned ? ' owned' : ''}">
          <div class="shop-card-name">${def.name}
            <span class="shop-type-tag">Cosmetic</span>
          </div>
          <div class="shop-card-desc">${def.desc}</div>
          <div class="shop-card-footer">
            ${this._cardFooter('skin', def.id, def.price, owned, false, affordable)}
          </div>
        </div>
      `;
    }).join('');
    return `<div class="shop-grid">${cards}</div>`;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _cardFooter(buyType, id, price, owned, locked, affordable) {
    if (owned)       return `<span class="shop-owned-label">Owned</span>`;
    if (price === 0) return `<span class="shop-free-label">Free</span>`;
    const disabled = locked || !affordable;
    return `
      <button class="shop-buy-btn${disabled ? ' disabled' : ''}"
              data-buy="${buyType}"
              data-id="${id}"
              data-price="${price}"
              ${disabled ? 'disabled' : ''}>
        $${price.toLocaleString()}
      </button>
    `;
  }

  _handleBuy(data) {
    const price = parseInt(data.price || '0', 10);

    if (!this._economy.canAfford(price)) {
      this._flash('Not enough money!', 'error');
      return;
    }

    try {
      this._economy.spend(price);
    } catch {
      this._flash('Purchase failed.', 'error');
      return;
    }

    switch (data.buy) {
      case 'tank':
        this._save.addOwnedItem('tank', data.id);
        this._save.save();
        this._flash(`${data.id} tank unlocked!`, 'success');
        break;
      case 'weapon':
        this._save.addOwnedItem('weapon', data.id);
        this._save.save();
        this._flash(`${data.id} unlocked!`, 'success');
        break;
      case 'melee':
        this._save.addOwnedItem('melee', data.id);
        this._save.save();
        this._flash(`${data.id} unlocked!`, 'success');
        break;
      case 'skin':
        this._save.addOwnedItem('skin', data.id);
        this._save.save();
        this._flash(`${data.id} skin unlocked!`, 'success');
        break;
      case 'upgrade': {
        const tier = parseInt(data.tier || '1', 10);
        this._save.setUpgrade(data.scope, data.id, tier);
        this._save.save();
        this._flash(`${data.id} upgraded to tier ${tier}!`, 'success');
        break;
      }
    }

    this._render();
  }

  _flash(msg, type) {
    const panel = this._el.querySelector('.shop-panel');
    if (!panel) return;
    panel.querySelector('.shop-flash')?.remove();
    const el = document.createElement('div');
    el.className = `shop-flash shop-flash-${type}`;
    el.textContent = msg;
    panel.prepend(el);
    setTimeout(() => el.remove(), 2000);
  }
}
