/**
 * LeagueSystem — LP tracking, promotion/demotion logic on match result.
 *
 * Manages the player's accumulated League Points (LP) and league tier, applying
 * LP gains/losses after every match and handling tier promotions and demotions
 * according to VISION.md §League System.
 *
 * LP Gains/Losses (VISION.md):
 *   Win match (2-0 sweep)   : +40 LP
 *   Win match (2-1 close)   : +25 LP
 *   Lose match (1-2 close)  : -10 LP
 *   Lose match (0-2 sweep)  : -20 LP
 *
 * Promotion:  LP reaches the current league's `lpToPromote` threshold.
 * Demotion:   LP falls below the current league's `lpRequired` threshold
 *             (can only demote one tier at a time due to the LP floor).
 *
 * Usage:
 *   const league = new LeagueSystem({ leagueId: 'bronze', lp: 0 });
 *
 *   // After each match:
 *   const result = league.applyMatchResult({ playerWins: 2, enemyWins: 0 });
 *   // result: { lpDelta, newLp, oldLeagueId, newLeagueId, promoted, demoted }
 *
 *   // Read state:
 *   league.leagueId       // current league ID string
 *   league.lp             // current LP total
 *   league.def            // full LeagueDefs entry for the current league
 *   league.lpToNextLeague // LP gap to next promotion (Infinity at champion)
 *   league.isMaxLeague    // true at champion tier
 *   league.canUnlock(id)  // whether a tank/weapon/tier is accessible
 */

import { LeagueDefs, LEAGUE_ORDER, lpFloorForLeague, getLeagueForLP } from '../data/LeagueDefs.js';

/**
 * Encodes the four match outcomes into LP deltas.
 * Key format: `${playerWins}-${enemyWins}` (best-of-3, first to 2 wins).
 *
 * @private
 */
const LP_DELTA_TABLE = {
  '2-0': +40,   // win 2-0 sweep
  '2-1': +25,   // win 2-1 close
  '1-2': -10,   // lose 1-2 close
  '0-2': -20,   // lose 0-2 sweep
};

export class LeagueSystem {
  /**
   * @param {object} [opts]
   * @param {string} [opts.leagueId='bronze']  Starting league ID.
   * @param {number} [opts.lp=0]               Starting LP total.
   * @param {object} [opts.lpDeltas]           Override LP delta table (for testing / balancing).
   */
  constructor(opts = {}) {
    const { leagueId = 'bronze', lp = 0, lpDeltas = {} } = opts;

    if (!LeagueDefs[leagueId]) {
      throw new Error(`[LeagueSystem] Unknown leagueId: "${leagueId}"`);
    }

    /** @type {string} */
    this._leagueId = leagueId;

    /** @type {number} Raw accumulated LP. Never drops below 0. */
    this._lp = Math.max(0, Math.floor(lp));

    /**
     * LP delta overrides — used for tuning / A-B testing without touching
     * the canonical VISION.md table.
     * @private
     */
    this._lpDeltas = { ...LP_DELTA_TABLE, ...lpDeltas };

    /** Ordered history of match results applied this session. */
    this._matchHistory = [];
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /** Current league ID. @type {string} */
  get leagueId() {
    return this._leagueId;
  }

  /** Current LP total. @type {number} */
  get lp() {
    return this._lp;
  }

  /** Full LeagueDefs entry for the current league. @type {object} */
  get def() {
    return LeagueDefs[this._leagueId];
  }

  /** LP required to promote to the next league (Infinity at champion). @type {number} */
  get lpToNextLeague() {
    const promotionThreshold = this.def.lpToPromote;
    if (!isFinite(promotionThreshold)) {
      return Infinity;
    }
    return Math.max(0, promotionThreshold - this._lp);
  }

  /** True when the player is at Champion (no further promotion possible). @type {boolean} */
  get isMaxLeague() {
    return this._leagueId === LEAGUE_ORDER[LEAGUE_ORDER.length - 1];
  }

  /**
   * LP progress within the current league tier, as a fraction 0–1.
   * Useful for rendering a progress bar.
   *
   * Returns 1.0 at champion tier.
   *
   * @type {number}
   */
  get tierProgress() {
    const { lpRequired, lpToPromote } = this.def;
    if (!isFinite(lpToPromote)) {
      return 1.0;
    }
    const range = lpToPromote - lpRequired;
    if (range <= 0) {
      return 1.0;
    }
    return Math.min(1.0, (this._lp - lpRequired) / range);
  }

  // ---------------------------------------------------------------------------
  // Match result application
  // ---------------------------------------------------------------------------

  /**
   * Apply LP changes from a completed match and resolve promotion/demotion.
   *
   * Best-of-3: `playerWins` and `enemyWins` must sum to 3 or be a valid early-
   * exit result (2-0 or 0-2). Valid combos: 2-0, 2-1, 1-2, 0-2.
   *
   * @param {object} params
   * @param {number} params.playerWins  Rounds won by the player's team (0–2).
   * @param {number} params.enemyWins   Rounds won by the enemy team (0–2).
   * @returns {MatchLpResult}
   */
  applyMatchResult({ playerWins, enemyWins }) {
    const key = `${playerWins}-${enemyWins}`;
    const lpDelta = this._lpDeltas[key];

    if (lpDelta === undefined) {
      throw new Error(
        `[LeagueSystem] Invalid match result "${key}". ` +
        `Valid results: ${Object.keys(LP_DELTA_TABLE).join(', ')}`
      );
    }

    const oldLeagueId = this._leagueId;
    const oldLp = this._lp;

    // Apply LP delta, clamped to LP floor for the current league.
    const floor = lpFloorForLeague(this._leagueId);
    const rawNewLp = this._lp + lpDelta;
    this._lp = Math.max(floor, rawNewLp);

    // Resolve new league from updated LP total.
    const resolvedLeagueId = getLeagueForLP(this._lp);

    const promoted = LEAGUE_ORDER.indexOf(resolvedLeagueId) > LEAGUE_ORDER.indexOf(oldLeagueId);
    const demoted  = LEAGUE_ORDER.indexOf(resolvedLeagueId) < LEAGUE_ORDER.indexOf(oldLeagueId);

    this._leagueId = resolvedLeagueId;

    const result = {
      lpDelta,
      oldLp,
      newLp: this._lp,
      oldLeagueId,
      newLeagueId: this._leagueId,
      promoted,
      demoted,
    };

    this._matchHistory.push({
      ...result,
      playerWins,
      enemyWins,
      appliedAt: Date.now(),
    });

    console.info(
      `[LeagueSystem] Match ${playerWins}-${enemyWins}: ` +
      `LP ${oldLp} → ${this._lp} (${lpDelta >= 0 ? '+' : ''}${lpDelta}). ` +
      `League: ${oldLeagueId}${promoted ? ' → ' + this._leagueId + ' (PROMOTED)' : ''}` +
      `${demoted ? ' → ' + this._leagueId + ' (DEMOTED)' : ''}`
    );

    return result;
  }

  // ---------------------------------------------------------------------------
  // Unlock checks
  // ---------------------------------------------------------------------------

  /**
   * Returns true if the player's current league meets or exceeds the requirement.
   *
   * @param {string} requiredLeagueId  The minimum league needed ('bronze', 'silver', …).
   * @returns {boolean}
   */
  meetsLeagueRequirement(requiredLeagueId) {
    const playerRank   = LEAGUE_ORDER.indexOf(this._leagueId);
    const requiredRank = LEAGUE_ORDER.indexOf(requiredLeagueId);
    if (requiredRank === -1) {
      throw new Error(`[LeagueSystem] Unknown requiredLeagueId: "${requiredLeagueId}"`);
    }
    return playerRank >= requiredRank;
  }

  /**
   * Returns the maximum upgrade tier the player can purchase at their current league.
   *
   * @returns {number}  1–5.
   */
  get upgradeTierCap() {
    // LeagueDefs schema uses 'tierCap' (t022 compat fix — was 'upgradeTierCap' pre-PR#83)
    return this.def.tierCap ?? this.def.upgradeTierCap ?? 2;
  }

  /**
   * Returns true if the player can purchase upgrade tier `tier` at their current league.
   *
   * @param {number} tier  1-based upgrade tier to check.
   * @returns {boolean}
   */
  canAffordUpgradeTier(tier) {
    return tier <= this.upgradeTierCap;
  }

  // ---------------------------------------------------------------------------
  // State sync (for SaveSystem integration)
  // ---------------------------------------------------------------------------

  /**
   * Restore league state loaded from SaveSystem.
   * Call once after constructing the system from a saved profile.
   *
   * @param {string} leagueId
   * @param {number} lp
   */
  loadFromSave(leagueId, lp) {
    if (!LeagueDefs[leagueId]) {
      console.warn(
        `[LeagueSystem] loadFromSave: unknown leagueId "${leagueId}" — defaulting to bronze.`
      );
      leagueId = 'bronze';
    }
    this._leagueId = leagueId;
    this._lp = Math.max(0, Math.floor(lp));
  }

  // ---------------------------------------------------------------------------
  // History / debug
  // ---------------------------------------------------------------------------

  /**
   * Snapshot of match results applied this session (most recent last).
   * @returns {Array<MatchLpResult & { playerWins: number, enemyWins: number, appliedAt: number }>}
   */
  getMatchHistory() {
    return this._matchHistory.map(r => ({ ...r }));
  }
}

// ---------------------------------------------------------------------------
// JSDoc types
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   lpDelta:      number,
 *   oldLp:        number,
 *   newLp:        number,
 *   oldLeagueId:  string,
 *   newLeagueId:  string,
 *   promoted:     boolean,
 *   demoted:      boolean,
 * }} MatchLpResult
 */
