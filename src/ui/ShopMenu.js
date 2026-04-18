/**
 * ShopMenu — between-match shop with 4 tabs.
 * Tabs: Tanks | Weapons | Upgrades | Skins
 *
 * League gating (t022):
 *   • Tanks and weapons are locked if the player's current league is below
 *     the item's leagueRequired field.
 *   • Upgrades are capped at the tier ceiling for the current league
 *     (defined in LeagueDefs.upgradeTierCap: bronze=2, silver=3, gold=4, platinum/diamond/champion=5).
 *
 * Requires a `<div id="shop-menu">` element in the DOM (see index.html).
 *
 * Usage:
 *   const shop = new ShopMenu(saveSystem, economySystem, leagueSystem);
 *   shop.onClose(() => { resumeGame(); });
 *   shop.open();
 *
 * LeagueSystem API used:
 *   leagueSystem.leagueId                          — current league ID string
 *   leagueSystem.upgradeTierCap                    — max purchasable upgrade tier (1–5)
 *   leagueSystem.meetsLeagueRequirement(leagueId)  — true if player's league >= required
 */

import { TankDefs, TANK_ORDER }                        from '../data/TankDefs.js';
import { GunDefs, MeleeDefs, GUN_ORDER, MELEE_ORDER }  from '../data/WeaponDefs.js';
import {
  TankUpgradeDefs,
  FootUpgradeDefs,
  TANK_UPGRADE_ORDER,
  FOOT_UPGRADE_ORDER,
}                                                       from '../data/UpgradeDefs.js';
import { SkinDefs, SKIN_ORDER, getSkinDef }              from '../data/SkinDefs.js';
import { SkinPreview }                                  from './SkinPreview.js';

// ---------------------------------------------------------------------------
// League label helper
// ---------------------------------------------------------------------------

/** Convert a league ID to a display name ('bronze' → 'Bronze'). */
function leagueName(id) {
  if (!id) return '';
  return id.charAt(0).toUpperCase() + id.slice(1);
}

export class ShopMenu {
  /**
   * @param {import('../systems/SaveSystem.js').SaveSystem}       saveSystem
   * @param {import('../systems/EconomySystem.js').EconomySystem} economySystem
   * @param {import('../systems/LeagueSystem.js').LeagueSystem}   leagueSystem
   */
  constructor(saveSystem, economySystem, leagueSystem) {
    this._save    = saveSystem;
    this._economy = economySystem;
    this._league  = leagueSystem;

    this._activeTab      = 'tanks';
    this._closeCallbacks = [];

    /**
     * Currently previewed skin ID in the Skins tab.
     * Defaults to the first skin in SKIN_ORDER so the preview is never blank.
     * @type {string|null}
     */
    this._selectedSkinId = SKIN_ORDER[0] ?? null;

    /**
     * Three.js rotating tank preview — created lazily when the Skins tab is
     * opened, disposed when the shop closes.
     * @type {SkinPreview|null}
     */
    this._skinPreview = null;

    this._el = document.getElementById('shop-menu');
    if (!this._el) {
      console.error('[ShopMenu] #shop-menu element not found in DOM');
      return;
    }

    this._bindEvents();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Register a callback invoked when the player closes the shop. */
  onClose(fn) {
    this._closeCallbacks.push(fn);
  }

  /** Show the shop overlay and render the Tanks tab. */
  open() {
    this._activeTab = 'tanks';
    this._render();
    this._el.classList.remove('hidden');
  }

  /** Hide the shop overlay and fire close callbacks. */
  close() {
    this._disposeSkinPreview();
    this._el.classList.add('hidden');
    for (const fn of this._closeCallbacks) {
      fn();
    }
  }

  // ---------------------------------------------------------------------------
  // Event wiring (single delegated listener)
  // ---------------------------------------------------------------------------

  /** @private */
  _bindEvents() {
    this._el.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('[data-tab]');
      if (tabBtn) {
        this._activeTab = tabBtn.dataset.tab;
        this._render();
        return;
      }

      // Skin card click (not the buy button) — update preview selection.
      const skinCard = e.target.closest('[data-skin-select]');
      if (skinCard && !e.target.closest('[data-buy]')) {
        this._selectedSkinId = skinCard.dataset.skinSelect;
        // Update preview colour immediately (no full re-render needed).
        const def = SkinDefs[this._selectedSkinId];
        if (def && this._skinPreview) {
          this._skinPreview.setSkin(def.colorBody, def.colorTurret);
        }
        // Re-render to move the selection highlight; the preview canvas will
        // be seamlessly re-mounted into the new DOM by _mountSkinPreview().
        this._render();
        return;
      }

      const buyBtn = e.target.closest('[data-buy]');
      if (buyBtn && !buyBtn.disabled) {
        this._handleBuy(buyBtn.dataset);
        return;
      }

      if (e.target.closest('#shop-close-btn')) {
        this.close();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  /** @private Full re-render of the shop panel. */
  _render() {
    const currentLeagueId = this._league.leagueId;
    const balance         = this._economy.balance;

    this._el.innerHTML = `
      <div class="shop-panel">
        <div class="shop-header">
          <span class="shop-title">SHOP</span>
          <div class="shop-meta">
            <span class="shop-money">$${balance.toLocaleString()}</span>
            <span class="shop-league-badge shop-league-${currentLeagueId}">
              ${leagueName(currentLeagueId)}
            </span>
          </div>
          <button id="shop-close-btn" class="shop-close-btn" aria-label="Close shop">&#x2715;</button>
        </div>

        <nav class="shop-tabs">
          ${['tanks', 'weapons', 'upgrades', 'skins'].map(tab => `
            <button class="shop-tab-btn${this._activeTab === tab ? ' active' : ''}"
                    data-tab="${tab}">
              ${tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          `).join('')}
        </nav>

        <div class="shop-content">
          ${this._renderTab(currentLeagueId)}
        </div>
      </div>
    `;

    // After innerHTML replacement, re-attach the SkinPreview canvas if needed.
    this._mountSkinPreview();
  }

  /** @private Route to the active tab renderer. */
  _renderTab(currentLeagueId) {
    switch (this._activeTab) {
      case 'tanks':    return this._renderTanks(currentLeagueId);
      case 'weapons':  return this._renderWeapons(currentLeagueId);
      case 'upgrades': return this._renderUpgrades(currentLeagueId);
      case 'skins':    return this._renderSkins();
      default:         return '';
    }
  }

  // ---------------------------------------------------------------------------
  // Tab: Tanks
  // ---------------------------------------------------------------------------

  /** @private */
  _renderTanks(currentLeagueId) {
    const cards = TANK_ORDER.map(id => {
      const def        = TankDefs[id];
      const owned      = this._save.hasItem('tank', def.id);
      const locked     = !this._league.meetsLeagueRequirement(def.leagueRequired);
      const affordable = this._economy.canAfford(def.price);

      return `
        <div class="shop-card${owned ? ' owned' : ''}${locked ? ' locked' : ''}">
          <div class="shop-card-name">${def.name}
            ${def.ability ? `<span class="shop-ability-tag">${def.ability}</span>` : ''}
          </div>
          <div class="shop-card-desc">${def.description}</div>
          <div class="shop-card-stats">
            <span>HP ${def.hp}</span>
            <span>Spd ${def.speed}u/s</span>
            <span>Arm ${Math.round(def.armor * 100)}%</span>
          </div>
          ${locked ? `<div class="shop-req-label">Requires ${leagueName(def.leagueRequired)}</div>` : ''}
          <div class="shop-card-footer">
            ${this._buyFooter('tank', def.id, def.price, owned, locked, affordable)}
          </div>
        </div>
      `;
    }).join('');

    return `<div class="shop-grid">${cards}</div>`;
  }

  // ---------------------------------------------------------------------------
  // Tab: Weapons
  // ---------------------------------------------------------------------------

  /** @private */
  _renderWeapons(currentLeagueId) {
    /**
     * @param {string} label
     * @param {object} defs         GunDefs or MeleeDefs object
     * @param {string[]} orderArr   GUN_ORDER or MELEE_ORDER
     * @param {'weapon'|'melee'} saveType  key used in SaveSystem (weapon=guns, melee=melee)
     */
    const renderGroup = (label, defs, orderArr, saveType) => {
      const cards = orderArr.map(id => {
        const def        = defs[id];
        if (!def) return '';
        const owned      = this._save.hasItem(saveType, def.id);
        const locked     = !this._league.meetsLeagueRequirement(def.leagueRequired);
        const affordable = this._economy.canAfford(def.price);

        const statLine = def.type === 'melee'
          ? `<span>DMG ${def.damage}</span><span>Rate ${def.attackRate ?? '—'}/s</span><span>Rng ${def.range}m</span>`
          : `<span>DMG ${def.damage}</span><span>RPM ${Math.round((def.fireRate || 0) * 60)}</span><span>Rng ${def.range}m</span>`;

        return `
          <div class="shop-card${owned ? ' owned' : ''}${locked ? ' locked' : ''}">
            <div class="shop-card-name">${def.name}
              ${def.isExplosive ? '<span class="shop-type-tag">Explosive</span>' : ''}
              ${def.ability ? `<span class="shop-ability-tag">${def.ability}</span>` : ''}
            </div>
            <div class="shop-card-desc">${def.description}</div>
            <div class="shop-card-stats">${statLine}</div>
            ${locked ? `<div class="shop-req-label">Requires ${leagueName(def.leagueRequired)}</div>` : ''}
            <div class="shop-card-footer">
              ${this._buyFooter(saveType, def.id, def.price, owned, locked, affordable)}
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="shop-weapon-group">
          <div class="shop-group-label">${label}</div>
          <div class="shop-grid">${cards}</div>
        </div>
      `;
    };

    return (
      renderGroup('Firearms &amp; Explosives', GunDefs, GUN_ORDER, 'weapon') +
      renderGroup('Melee', MeleeDefs, MELEE_ORDER, 'melee')
    );
  }

  // ---------------------------------------------------------------------------
  // Tab: Upgrades (tier-capped by league)
  // ---------------------------------------------------------------------------

  /** @private */
  _renderUpgrades(currentLeagueId) {
    // League tier cap — maximum upgrade tier purchasable in current league.
    const tierCap = this._league.upgradeTierCap;

    // Tank upgrades are scoped to the equipped tank class (t041).
    // Upgrading "Armor Plating" for the Heavy class has no effect on the Scout.
    const equippedClassId = this._save.getProfile().equippedTankClass || 'standard';
    const equippedClassDef = TankDefs[equippedClassId] || TankDefs['standard'];
    const tankUpgradeLabel = `Tank Upgrades — ${equippedClassDef.name}`;

    const renderGroup = (label, defs, orderArr, scope) => {
      const rows = orderArr.map(id => {
        const def = defs[id];
        if (!def) return '';

        const currentTier = this._save.getUpgradeTier(scope, def.id);
        // Effective ceiling: lesser of the upgrade's own maxTier and the league cap.
        const effectiveCap = Math.min(def.maxTier, tierCap);
        const canUpgrade   = currentTier < effectiveCap;
        const nextTier     = canUpgrade ? currentTier + 1 : null;
        const nextCost     = (nextTier !== null) ? def.costs[nextTier - 1] : null;
        const affordable   = (nextCost !== null) && this._economy.canAfford(nextCost);

        // Tier pips — filled up to currentTier, cap marker at effectiveCap if < maxTier
        const pips = Array.from({ length: def.maxTier }, (_, i) => {
          const tierNum = i + 1;
          const filled  = tierNum <= currentTier;
          const capped  = tierNum === effectiveCap && effectiveCap < def.maxTier;
          return `<span class="tier-pip${filled ? ' filled' : ''}${capped ? ' cap-marker' : ''}"></span>`;
        }).join('');

        let action;
        if (currentTier >= def.maxTier) {
          action = '<span class="shop-maxed-label">MAX</span>';
        } else if (currentTier >= effectiveCap) {
          action = `<span class="shop-league-cap-label">Tier cap (${leagueName(currentLeagueId)})</span>`;
        } else {
          action = `
            <button class="shop-buy-btn${!affordable ? ' disabled' : ''}"
                    data-buy="upgrade"
                    data-id="${def.id}"
                    data-scope="${scope}"
                    data-price="${nextCost}"
                    data-tier="${nextTier}"
                    ${!affordable ? 'disabled' : ''}>
              $${nextCost.toLocaleString()}
            </button>
          `;
        }

        return `
          <div class="shop-upgrade-row${currentTier >= def.maxTier ? ' maxed' : ''}${(currentTier >= effectiveCap && currentTier < def.maxTier) ? ' at-cap' : ''}">
            <div class="shop-upgrade-info">
              <span class="shop-upgrade-name">${def.name}</span>
              <span class="shop-upgrade-effect">${def.description}</span>
            </div>
            <div class="shop-upgrade-tiers">
              ${pips}
              <span class="tier-count">${currentTier}/${def.maxTier}</span>
            </div>
            <div class="shop-upgrade-action">${action}</div>
          </div>
        `;
      }).join('');

      return `
        <div class="shop-upgrade-group">
          <div class="shop-group-label">${label}</div>
          ${rows}
        </div>
      `;
    };

    return (
      renderGroup(tankUpgradeLabel, TankUpgradeDefs, TANK_UPGRADE_ORDER, equippedClassId) +
      renderGroup('On-Foot Upgrades', FootUpgradeDefs, FOOT_UPGRADE_ORDER, 'infantry')
    );
  }

  // ---------------------------------------------------------------------------
  // Tab: Skins — two-column layout: rotating 3D preview + scrollable skin list
  // ---------------------------------------------------------------------------

  /** @private */
  _renderSkins() {
    // Ensure selectedSkinId defaults to the first skin if not yet set.
    if (!this._selectedSkinId && SKIN_ORDER.length > 0) {
      this._selectedSkinId = SKIN_ORDER[0];
    }

    const selectedDef = this._selectedSkinId ? SkinDefs[this._selectedSkinId] : SkinDefs[SKIN_ORDER[0]];

    const cards = SKIN_ORDER.map(id => {
      const def        = SkinDefs[id];
      if (!def) return '';
      const owned      = this._save.hasItem('skin', def.id);
      const locked     = !this._league.meetsLeagueRequirement(def.leagueRequired);
      const affordable = this._economy.canAfford(def.price);
      const isSelected = def.id === this._selectedSkinId;

      // Type label based on skin category.
      const typeLabel = def.type === 'prestige' ? 'Prestige'
                      : def.type === 'camo'     ? 'Camo'
                      :                           'Cosmetic';

      return `
        <div class="shop-card shop-skin-card${owned ? ' owned' : ''}${locked ? ' locked' : ''}${isSelected ? ' shop-skin-card-active' : ''}"
             data-skin-select="${def.id}"
             style="cursor:pointer;">
          <div class="shop-card-name">${def.name}
            <span class="shop-type-tag">${typeLabel}</span>
          </div>
          <div class="shop-card-desc">${def.description}</div>
          ${locked ? `<div class="shop-req-label">Requires ${leagueName(def.leagueRequired)}</div>` : ''}
          <div class="shop-card-footer">
            ${this._buyFooter('skin', def.id, def.price, owned, locked, affordable)}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="shop-skins-layout">
        <div class="shop-skin-preview-col">
          <div id="shop-skin-preview-mount" class="shop-skin-preview-mount"></div>
          <div class="shop-skin-preview-name">${selectedDef ? selectedDef.name : ''}</div>
          <div class="shop-skin-preview-desc">${selectedDef ? selectedDef.description : ''}</div>
        </div>
        <div class="shop-skin-grid-col">
          <div class="shop-grid">${cards}</div>
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Skin preview lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Create (or reuse) the SkinPreview instance and mount its canvas into the
   * preview mount div that was just rendered. Called after every _render().
   * @private
   */
  _mountSkinPreview() {
    if (this._activeTab !== 'skins') {
      // Leaving the skins tab — dispose to free GPU resources.
      this._disposeSkinPreview();
      return;
    }

    const mount = this._el.querySelector('#shop-skin-preview-mount');
    if (!mount) return;

    // Create the preview once; reuse across re-renders.
    if (!this._skinPreview) {
      this._skinPreview = new SkinPreview();
    }

    // Re-mount the canvas (it was removed when innerHTML was replaced).
    this._skinPreview.mount(mount);

    // Apply the currently selected skin colour.
    const def = this._selectedSkinId
      ? SkinDefs[this._selectedSkinId]
      : SkinDefs[SKIN_ORDER[0]];
    if (def) {
      this._skinPreview.setSkin(def.colorBody, def.colorTurret);
    }
  }

  /**
   * Dispose the SkinPreview and free GPU resources.
   * Safe to call multiple times.
   * @private
   */
  _disposeSkinPreview() {
    if (this._skinPreview) {
      this._skinPreview.dispose();
      this._skinPreview = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  /**
   * @private Renders the buy/owned/free footer for a card.
   */
  _buyFooter(buyType, id, price, owned, locked, affordable) {
    if (owned)       return '<span class="shop-owned-label">Owned</span>';
    if (price === 0) return '<span class="shop-free-label">Free</span>';
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

  // ---------------------------------------------------------------------------
  // Buy handler
  // ---------------------------------------------------------------------------

  /** @private */
  _handleBuy(dataset) {
    const price = parseInt(dataset.price || '0', 10);

    if (!this._economy.canAfford(price)) {
      this._showFlash('Not enough money!', 'error');
      return;
    }

    this._economy.spend(price);

    switch (dataset.buy) {
      case 'tank':
        this._save.addOwnedItem('tank', dataset.id);
        this._save.save();
        this._showFlash(`${dataset.id} purchased!`, 'success');
        break;

      case 'weapon':
        this._save.addOwnedItem('weapon', dataset.id);
        this._save.save();
        this._showFlash(`${dataset.id} purchased!`, 'success');
        break;

      case 'melee':
        this._save.addOwnedItem('melee', dataset.id);
        this._save.save();
        this._showFlash(`${dataset.id} purchased!`, 'success');
        break;

      case 'skin': {
        this._save.addOwnedItem('skin', dataset.id);
        this._save.save();
        const skinDef = SkinDefs[dataset.id];
        this._showFlash(`${skinDef ? skinDef.name : dataset.id} skin unlocked!`, 'success');
        break;
      }

      case 'upgrade': {
        const tier     = parseInt(dataset.tier || '1', 10);
        const scope    = dataset.scope || 'standard';
        const upgDef   = TankUpgradeDefs[dataset.id] || FootUpgradeDefs[dataset.id];
        // Server-side tier cap enforcement (guards against DOM manipulation).
        if (upgDef && !this._league.canAffordUpgradeTier(tier)) {
          this._showFlash(
            `Upgrade capped at tier ${this._league.upgradeTierCap} (${leagueName(this._league.leagueId)})`,
            'error'
          );
          return;
        }
        this._save.setUpgrade(scope, dataset.id, tier);
        this._save.save();
        this._showFlash(`${dataset.id} → tier ${tier}!`, 'success');
        break;
      }

      default:
        console.warn('[ShopMenu] Unknown buy type:', dataset.buy);
        return;
    }

    // Re-render to reflect new balance, ownership, and tier state.
    this._render();
  }

  /**
   * @private Brief status flash at the top of the panel.
   */
  _showFlash(msg, type) {
    const panel = this._el.querySelector('.shop-panel');
    if (!panel) return;
    panel.querySelector('.shop-flash')?.remove();
    const flash       = document.createElement('div');
    flash.className   = `shop-flash shop-flash-${type}`;
    flash.textContent = msg;
    panel.prepend(flash);
    setTimeout(() => flash.remove(), 2000);
  }
}
