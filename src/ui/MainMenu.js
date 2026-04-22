/**
 * MainMenu — title screen shown before the first match and after each match ends.
 *
 * Layout (top → bottom):
 *   • Large "GUNZ" title + tagline
 *   • League badge + LP bar
 *   • Money balance
 *   • Three action buttons: PLAY  |  SHOP  |  LOADOUT
 *
 * The menu creates its own DOM and CSS at construction time so it has no
 * hard dependency on index.html markup beyond document.body.
 *
 * Usage:
 *   const menu = new MainMenu();
 *   menu.update(leagueId, lp, money);
 *   menu.show({
 *     onPlay:    () => { ... },   // proceed to LoadoutScreen → match
 *     onShop:    () => { ... },   // open ShopMenu
 *     onLoadout: () => { ... },   // open LoadoutScreen for browsing
 *   });
 *   menu.hide();
 *
 * Re-calling show() replaces the previous callback set; update() can be called
 * at any time (visible or not) to refresh the league / money display.
 */

import { getLeagueDef } from '../data/LeagueDefs.js';

// ---------------------------------------------------------------------------
// Per-league colour palette (mirrors LeagueDisplay)
// ---------------------------------------------------------------------------

const LEAGUE_COLOURS = {
  bronze:   { badge: '#cd7f32', text: '#fff',  bar: '#cd7f32' },
  silver:   { badge: '#c0c0c0', text: '#111',  bar: '#b0b0b0' },
  gold:     { badge: '#ffd700', text: '#111',  bar: '#ffd700' },
  platinum: { badge: '#8ecae6', text: '#111',  bar: '#8ecae6' },
  diamond:  { badge: '#48cae4', text: '#fff',  bar: '#48cae4' },
  champion: { badge: '#9b59b6', text: '#fff',  bar: '#c77dff' },
};

// ---------------------------------------------------------------------------
// Styles injected once per document
// ---------------------------------------------------------------------------

const STYLE_ID = 'main-menu-style';

const CSS = `
  /* === Main menu overlay === */
  #main-menu {
    position: fixed;
    inset: 0;
    z-index: 300;
    background: rgba(4, 6, 10, 0.97);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0;
    pointer-events: auto;
    /* Subtle animated background gradient */
    background-image:
      radial-gradient(ellipse at 50% 0%, rgba(76,175,80,0.07) 0%, transparent 65%),
      radial-gradient(ellipse at 20% 100%, rgba(100,150,255,0.05) 0%, transparent 60%);
  }

  #main-menu.mm-hidden {
    display: none !important;
  }

  /* === Title === */
  .mm-title {
    font-size: clamp(64px, 14vw, 120px);
    font-weight: 900;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #fff;
    text-shadow:
      0 0 40px rgba(76,175,80,0.35),
      0 0 80px rgba(76,175,80,0.15),
      0 4px 12px rgba(0,0,0,0.8);
    line-height: 1;
    margin-bottom: 6px;
    user-select: none;
  }

  .mm-tagline {
    font-size: clamp(10px, 2vw, 14px);
    font-weight: 700;
    letter-spacing: 0.35em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.35);
    margin-bottom: 40px;
    user-select: none;
  }

  /* === League row === */
  .mm-league-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
  }

  .mm-league-badge {
    display: inline-block;
    padding: 5px 16px;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 3px;
    text-transform: uppercase;
    text-shadow: 0 1px 2px rgba(0,0,0,0.4);
    box-shadow: 0 2px 8px rgba(0,0,0,0.45);
    transition: background 0.4s, color 0.4s;
    user-select: none;
  }

  .mm-lp-label {
    color: rgba(255,255,255,0.7);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 1px;
    white-space: nowrap;
  }

  /* === LP bar === */
  .mm-bar-outer {
    width: 160px;
    height: 10px;
    background: rgba(255,255,255,0.1);
    border-radius: 5px;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.18);
    margin-bottom: 20px;
  }

  .mm-bar-fill {
    height: 100%;
    border-radius: 5px;
    transition: width 0.7s ease-out, background 0.4s;
    width: 0%;
  }

  /* === Money === */
  .mm-money-row {
    display: flex;
    align-items: baseline;
    gap: 7px;
    margin-bottom: 44px;
  }

  .mm-money-label {
    color: rgba(255,255,255,0.4);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  .mm-money-value {
    color: #ffd54f;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 1px;
    text-shadow: 0 0 12px rgba(255,213,79,0.4);
  }

  /* === Button group === */
  .mm-buttons {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .mm-btn {
    padding: 16px 44px;
    font-size: 15px;
    font-weight: 900;
    letter-spacing: 3px;
    text-transform: uppercase;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  }

  .mm-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  }

  .mm-btn:active {
    transform: translateY(0);
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  }

  /* Play — primary / green */
  .mm-btn-play {
    background: #4caf50;
    color: #fff;
    min-width: 160px;
  }
  .mm-btn-play:hover { background: #43a047; }
  .mm-btn-play:active { background: #388e3c; }

  /* Shop — blue-grey */
  .mm-btn-shop {
    background: rgba(255,255,255,0.1);
    color: #fff;
    border: 1px solid rgba(255,255,255,0.2);
  }
  .mm-btn-shop:hover { background: rgba(255,255,255,0.16); }
  .mm-btn-shop:active { background: rgba(255,255,255,0.08); }

  /* Loadout — same neutral style as Shop */
  .mm-btn-loadout {
    background: rgba(255,255,255,0.1);
    color: #fff;
    border: 1px solid rgba(255,255,255,0.2);
  }
  .mm-btn-loadout:hover { background: rgba(255,255,255,0.16); }
  .mm-btn-loadout:active { background: rgba(255,255,255,0.08); }

  /* === Version / hint footer === */
  .mm-footer {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    color: rgba(255,255,255,0.2);
    font-size: 11px;
    letter-spacing: 1px;
    pointer-events: none;
    white-space: nowrap;
  }

  @media (max-width: 480px) {
    .mm-btn { padding: 14px 28px; font-size: 13px; letter-spacing: 2px; }
    .mm-buttons { gap: 10px; }
    .mm-bar-outer { width: 120px; }
  }
`;

// ---------------------------------------------------------------------------
// MainMenu class
// ---------------------------------------------------------------------------

export class MainMenu {
  constructor() {
    /** @private @type {{ onPlay: ()=>void, onShop: ()=>void, onLoadout: ()=>void }|null} */
    this._callbacks = null;

    this._injectStyles();
    this._buildDOM();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Show the main menu, registering action callbacks.
   *
   * @param {{ onPlay: ()=>void, onShop: ()=>void, onLoadout: ()=>void }} callbacks
   */
  show(callbacks) {
    this._callbacks = callbacks || {};
    this._el.classList.remove('mm-hidden');
  }

  /** Hide the main menu. */
  hide() {
    this._el.classList.add('mm-hidden');
  }

  /**
   * Update the league badge, LP bar, and money balance.
   * Safe to call while hidden — values are applied immediately so they are
   * correct when the menu is next shown.
   *
   * @param {string} leagueId  — e.g. 'bronze', 'gold', 'champion'
   * @param {number} lp        — current league points
   * @param {number} money     — current money balance
   */
  update(leagueId, lp, money) {
    this._updateLeague(leagueId, lp);
    this._updateMoney(money);
  }

  // ---------------------------------------------------------------------------
  // DOM construction
  // ---------------------------------------------------------------------------

  /** @private */
  _injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /** @private Build the full DOM tree and append to body. */
  _buildDOM() {
    // ---- Outer container ----
    this._el = document.createElement('div');
    this._el.id = 'main-menu';
    this._el.className = 'mm-hidden';

    // ---- Title ----
    const title = document.createElement('div');
    title.className = 'mm-title';
    title.textContent = 'GUNZ';

    const tagline = document.createElement('div');
    tagline.className = 'mm-tagline';
    tagline.textContent = 'Tank Combat';

    // ---- League row ----
    const leagueRow = document.createElement('div');
    leagueRow.className = 'mm-league-row';

    this._badgeEl = document.createElement('div');
    this._badgeEl.className = 'mm-league-badge';
    this._badgeEl.textContent = 'BRONZE';

    this._lpLabelEl = document.createElement('span');
    this._lpLabelEl.className = 'mm-lp-label';
    this._lpLabelEl.textContent = '0 / 500 LP';

    leagueRow.appendChild(this._badgeEl);
    leagueRow.appendChild(this._lpLabelEl);

    // ---- LP bar ----
    const barOuter = document.createElement('div');
    barOuter.className = 'mm-bar-outer';

    this._barFillEl = document.createElement('div');
    this._barFillEl.className = 'mm-bar-fill';
    barOuter.appendChild(this._barFillEl);

    // ---- Money ----
    const moneyRow = document.createElement('div');
    moneyRow.className = 'mm-money-row';

    const moneyLabel = document.createElement('span');
    moneyLabel.className = 'mm-money-label';
    moneyLabel.textContent = 'Balance';

    this._moneyEl = document.createElement('span');
    this._moneyEl.className = 'mm-money-value';
    this._moneyEl.textContent = '$0';

    moneyRow.appendChild(moneyLabel);
    moneyRow.appendChild(this._moneyEl);

    // ---- Buttons ----
    const buttons = document.createElement('div');
    buttons.className = 'mm-buttons';

    this._playBtn = document.createElement('button');
    this._playBtn.className = 'mm-btn mm-btn-play';
    this._playBtn.textContent = 'Play';
    this._playBtn.addEventListener('click', () => this._onPlay());

    this._shopBtn = document.createElement('button');
    this._shopBtn.className = 'mm-btn mm-btn-shop';
    this._shopBtn.textContent = 'Shop';
    this._shopBtn.addEventListener('click', () => this._onShop());

    this._loadoutBtn = document.createElement('button');
    this._loadoutBtn.className = 'mm-btn mm-btn-loadout';
    this._loadoutBtn.textContent = 'Loadout';
    this._loadoutBtn.addEventListener('click', () => this._onLoadout());

    buttons.appendChild(this._playBtn);
    buttons.appendChild(this._shopBtn);
    buttons.appendChild(this._loadoutBtn);

    // ---- Footer ----
    const footer = document.createElement('div');
    footer.className = 'mm-footer';
    footer.textContent = 'WASD / Joystick to move · Click / Fire to shoot · Q = Ability';

    // ---- Assemble ----
    this._el.appendChild(title);
    this._el.appendChild(tagline);
    this._el.appendChild(leagueRow);
    this._el.appendChild(barOuter);
    this._el.appendChild(moneyRow);
    this._el.appendChild(buttons);
    this._el.appendChild(footer);

    document.body.appendChild(this._el);
  }

  // ---------------------------------------------------------------------------
  // League / money update helpers
  // ---------------------------------------------------------------------------

  /**
   * @private
   * @param {string} leagueId
   * @param {number} lp
   */
  _updateLeague(leagueId, lp) {
    let def;
    try {
      def = getLeagueDef(leagueId);
    } catch (_) {
      def = getLeagueDef('bronze');
      leagueId = 'bronze';
    }

    const colours = LEAGUE_COLOURS[leagueId] || LEAGUE_COLOURS.bronze;

    // Badge
    this._badgeEl.textContent = (def.name || leagueId).toUpperCase();
    this._badgeEl.style.background = colours.badge;
    this._badgeEl.style.color = colours.text;

    // LP label
    this._lpLabelEl.textContent =
      def.promotionLp === null
        ? `${lp} LP — MAX`
        : `${lp} / ${def.promotionLp} LP`;

    // Bar fill
    const span = def.promotionLp === null
      ? 1
      : def.promotionLp - (def.lpRequired || 0);
    const pct = span > 0
      ? Math.min(100, Math.max(0, ((lp - (def.lpRequired || 0)) / span) * 100))
      : 100;
    this._barFillEl.style.width = `${pct}%`;
    this._barFillEl.style.background = colours.bar;
  }

  /**
   * @private
   * @param {number} money
   */
  _updateMoney(money) {
    this._moneyEl.textContent = `$${Math.round(money).toLocaleString()}`;
  }

  // ---------------------------------------------------------------------------
  // Button handlers
  // ---------------------------------------------------------------------------

  /** @private */
  _onPlay() {
    if (this._callbacks && this._callbacks.onPlay) {
      this.hide();
      this._callbacks.onPlay();
    }
  }

  /** @private */
  _onShop() {
    if (this._callbacks && this._callbacks.onShop) {
      this.hide();
      this._callbacks.onShop();
    }
  }

  /** @private */
  _onLoadout() {
    if (this._callbacks && this._callbacks.onLoadout) {
      this.hide();
      this._callbacks.onLoadout();
    }
  }
}
