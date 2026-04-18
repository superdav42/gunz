/**
 * LeagueDisplay — DOM overlay for the league badge and LP progress bar.
 *
 * Rendered as a fixed element in the viewport.  Designed for the match-end
 * screen and any future main-menu context; can be shown/hidden independently.
 *
 * Key features:
 *  - League badge:    coloured pill with the league name.
 *  - LP label:        "current / target LP" text (or "MAX" at Champion).
 *  - LP bar:          animating fill bar that reflects LP within the current league span.
 *  - Delta pop-in:    "+25 LP" / "-10 LP" text that floats up and fades.
 *  - Promo/demo banner: full-screen notification for promotions and demotions.
 *
 * Usage:
 *   const display = new LeagueDisplay();
 *   display.show();
 *   display.update('bronze', 0);           // set initial state (no animation)
 *   display.animateChange(leagueEvent);    // after LeagueSystem.applyMatchResult()
 *   display.hide();
 */

import { getLeagueDef } from '../data/LeagueDefs.js';

/**
 * Per-league flat-shaded colour palette.
 * badge:  background of the league name pill.
 * text:   text colour on the badge.
 * bar:    LP bar fill colour.
 */
const LEAGUE_COLOURS = {
  bronze:   { badge: '#cd7f32', text: '#fff',  bar: '#cd7f32' },
  silver:   { badge: '#c0c0c0', text: '#111',  bar: '#b0b0b0' },
  gold:     { badge: '#ffd700', text: '#111',  bar: '#ffd700' },
  platinum: { badge: '#8ecae6', text: '#111',  bar: '#8ecae6' },
  diamond:  { badge: '#48cae4', text: '#fff',  bar: '#48cae4' },
  champion: { badge: '#9b59b6', text: '#fff',  bar: '#c77dff' },
};

/** CSS injected once per document. */
const STYLE_ID = 'league-display-style';

const CSS = `
  .ld-container {
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 200;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    pointer-events: none;
  }
  .ld-hidden { display: none !important; }

  /* League name badge */
  .ld-badge {
    display: inline-block;
    padding: 6px 18px;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 900;
    letter-spacing: 3px;
    text-transform: uppercase;
    text-shadow: 0 1px 2px rgba(0,0,0,0.4);
    box-shadow: 0 2px 8px rgba(0,0,0,0.45);
    transition: background 0.4s, color 0.4s;
  }

  /* Row holding label + bar */
  .ld-lp-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .ld-lp-label {
    color: rgba(255,255,255,0.85);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 1px;
    text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
    white-space: nowrap;
  }

  .ld-bar-outer {
    width: 140px;
    height: 10px;
    background: rgba(0,0,0,0.5);
    border-radius: 5px;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.2);
  }

  .ld-bar-fill {
    height: 100%;
    border-radius: 5px;
    transition: width 0.7s ease-out, background 0.4s;
    width: 0%;
  }

  /* LP delta pop-in ("+25 LP" floats upward and fades) */
  .ld-delta {
    font-size: 16px;
    font-weight: 900;
    letter-spacing: 1px;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.9);
    opacity: 0;
    pointer-events: none;
  }
  .ld-delta-positive { color: #4cff80; }
  .ld-delta-negative { color: #ff5555; }
  .ld-delta.ld-anim-in {
    animation: ldDeltaPop 1.8s ease-out forwards;
  }
  @keyframes ldDeltaPop {
    0%   { opacity: 1; transform: translateY(0);   }
    60%  { opacity: 1; transform: translateY(-18px); }
    100% { opacity: 0; transform: translateY(-30px); }
  }

  /* Promotion / demotion banner (centred, overlaid) */
  .ld-promo-banner {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0.7);
    z-index: 300;
    background: rgba(0,0,0,0.88);
    border: 2px solid transparent;
    border-radius: 10px;
    padding: 20px 44px;
    text-align: center;
    opacity: 0;
    pointer-events: none;
  }
  .ld-promo-banner.ld-banner-show {
    animation: ldBannerIn 0.4s ease-out forwards,
               ldBannerOut 0.5s ease-in 2.8s forwards;
  }
  .ld-promo-banner.ld-promo { border-color: #4cff80; }
  .ld-promo-banner.ld-demo  { border-color: #ff5555; }

  .ld-banner-title {
    font-size: 28px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 3px;
    text-shadow: 2px 2px 6px rgba(0,0,0,0.8);
  }
  .ld-banner-title.ld-promo { color: #4cff80; }
  .ld-banner-title.ld-demo  { color: #ff5555; }

  .ld-banner-sub {
    margin-top: 6px;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 2px;
    color: rgba(255,255,255,0.85);
  }

  @keyframes ldBannerIn {
    0%   { opacity: 0; transform: translate(-50%,-50%) scale(0.7); }
    100% { opacity: 1; transform: translate(-50%,-50%) scale(1);   }
  }
  @keyframes ldBannerOut {
    0%   { opacity: 1; transform: translate(-50%,-50%) scale(1);   }
    100% { opacity: 0; transform: translate(-50%,-50%) scale(1.1); }
  }

  /* On-touch devices push the display above the joystick zone */
  @media (pointer: coarse) {
    .ld-container { bottom: 200px; }
  }
`;

export class LeagueDisplay {
  constructor() {
    /** @type {number|null} */
    this._deltaTimer = null;
    /** @type {number|null} */
    this._bannerTimer = null;

    this._injectStyles();
    this._buildDOM();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Make the league display visible. */
  show() {
    this._containerEl.classList.remove('ld-hidden');
  }

  /** Hide the league display. Does not reset internal state. */
  hide() {
    this._containerEl.classList.add('ld-hidden');
    this._hideBanner();
  }

  /**
   * Immediately update badge and LP bar to reflect the given state.
   * Call this on first display and after animateChange() to sync text.
   *
   * @param {string} leagueId
   * @param {number} lp
   */
  update(leagueId, lp) {
    const def = getLeagueDef(leagueId);
    const colours = LEAGUE_COLOURS[leagueId] || LEAGUE_COLOURS.bronze;

    // Badge
    this._badgeEl.textContent = def.name.toUpperCase();
    this._badgeEl.style.background = colours.badge;
    this._badgeEl.style.color = colours.text;

    // LP label
    this._lpLabelEl.textContent =
      def.lpToPromote === Infinity
        ? `${lp} LP — MAX`
        : `${lp} / ${def.lpToPromote} LP`;

    // Bar fill
    const span = def.lpToPromote === Infinity
      ? 1
      : def.lpToPromote - def.lpRequired;
    const pct = span > 0
      ? Math.min(100, Math.max(0, ((lp - def.lpRequired) / span) * 100))
      : 100;
    this._lpBarFillEl.style.width = `${pct}%`;
    this._lpBarFillEl.style.background = colours.bar;
  }

  /**
   * Animate a league change returned by LeagueSystem.applyMatchResult().
   * Shows the LP delta pop-in, transitions the bar/badge, and displays the
   * promo/demo banner when the league tier changes.
   *
   * Accepts the shape returned by LeagueSystem.applyMatchResult():
   *   { lpDelta, oldLp, newLp, oldLeagueId, newLeagueId, promoted, demoted }
   *
   * @param {{ lpDelta: number, newLp: number, newLeagueId: string, promoted: boolean, demoted: boolean }} event
   */
  animateChange(event) {
    const { lpDelta, promoted, demoted, newLeagueId, newLp } = event;
    const delta = lpDelta;

    // Floating LP delta text
    this._showDeltaPop(delta);

    // Update badge + bar to the new state (CSS transition handles the bar)
    this.update(newLeagueId, newLp);

    // Overlay notification for league tier change
    if (promoted) {
      this._showBanner(newLeagueId, true);
    } else if (demoted) {
      this._showBanner(newLeagueId, false);
    }
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

  /** @private */
  _buildDOM() {
    // Main container
    this._containerEl = document.createElement('div');
    this._containerEl.className = 'ld-container ld-hidden';

    // League badge pill
    this._badgeEl = document.createElement('div');
    this._badgeEl.className = 'ld-badge';
    this._badgeEl.textContent = 'BRONZE';

    // LP row: label + bar
    const lpRow = document.createElement('div');
    lpRow.className = 'ld-lp-row';

    this._lpLabelEl = document.createElement('span');
    this._lpLabelEl.className = 'ld-lp-label';
    this._lpLabelEl.textContent = '0 / 500 LP';

    const barOuter = document.createElement('div');
    barOuter.className = 'ld-bar-outer';

    this._lpBarFillEl = document.createElement('div');
    this._lpBarFillEl.className = 'ld-bar-fill';
    barOuter.appendChild(this._lpBarFillEl);

    lpRow.appendChild(this._lpLabelEl);
    lpRow.appendChild(barOuter);

    // LP delta pop-in element
    this._deltaEl = document.createElement('div');
    this._deltaEl.className = 'ld-delta';

    this._containerEl.appendChild(this._badgeEl);
    this._containerEl.appendChild(lpRow);
    this._containerEl.appendChild(this._deltaEl);
    document.body.appendChild(this._containerEl);

    // Promo/demo banner (separate fixed element)
    this._promoBannerEl = document.createElement('div');
    this._promoBannerEl.className = 'ld-promo-banner';

    this._bannerTitleEl = document.createElement('div');
    this._bannerTitleEl.className = 'ld-banner-title';

    this._bannerSubEl = document.createElement('div');
    this._bannerSubEl.className = 'ld-banner-sub';

    this._promoBannerEl.appendChild(this._bannerTitleEl);
    this._promoBannerEl.appendChild(this._bannerSubEl);
    document.body.appendChild(this._promoBannerEl);
  }

  // ---------------------------------------------------------------------------
  // Private animation helpers
  // ---------------------------------------------------------------------------

  /** @private Float a "+NN LP" or "-NN LP" label up and fade it out. */
  _showDeltaPop(delta) {
    const sign = delta >= 0 ? '+' : '';
    this._deltaEl.textContent = `${sign}${delta} LP`;

    const polarClass = delta >= 0 ? 'ld-delta-positive' : 'ld-delta-negative';
    this._deltaEl.className = `ld-delta ${polarClass}`;

    // Force reflow to restart the CSS animation cleanly.
    void this._deltaEl.offsetWidth;
    this._deltaEl.classList.add('ld-anim-in');

    clearTimeout(this._deltaTimer);
    this._deltaTimer = setTimeout(() => {
      this._deltaEl.classList.remove('ld-anim-in');
    }, 1900);
  }

  /**
   * @private Show the promotion or demotion overlay banner.
   * @param {string} leagueId — new league
   * @param {boolean} isPromotion
   */
  _showBanner(leagueId, isPromotion) {
    const def = getLeagueDef(leagueId);
    const typeClass = isPromotion ? 'ld-promo' : 'ld-demo';

    this._bannerTitleEl.textContent = isPromotion ? 'PROMOTED!' : 'DEMOTED';
    this._bannerTitleEl.className = `ld-banner-title ${typeClass}`;
    this._bannerSubEl.textContent = `Now in ${def.name} League`;

    // Reset to base class so the animation can restart from scratch.
    this._promoBannerEl.className = 'ld-promo-banner';
    void this._promoBannerEl.offsetWidth;
    this._promoBannerEl.className = `ld-promo-banner ${typeClass} ld-banner-show`;

    clearTimeout(this._bannerTimer);
    // Hide after animation completes (0.4 in + 2.8 hold + 0.5 out ≈ 3.7 s)
    this._bannerTimer = setTimeout(() => this._hideBanner(), 3700);
  }

  /** @private Reset banner to invisible without triggering the animation. */
  _hideBanner() {
    clearTimeout(this._bannerTimer);
    this._bannerTimer = null;
    this._promoBannerEl.className = 'ld-promo-banner';
  }
}
