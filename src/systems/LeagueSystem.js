/**
 * LeagueSystem — LP tracking, promotion, and demotion logic.
 *
 * Reads an initial { leagueId, leaguePoints } snapshot (e.g. from SaveSystem)
 * and tracks in-memory state thereafter.  The caller is responsible for
 * persisting changes: call save.updateLeague(system.leagueId, system.lp)
 * after applyMatchResult().
 *
 * Usage:
 *   const league = new LeagueSystem(save.getProfile());
 *   league.onLeagueChange(event => { ... });
 *   const event = league.applyMatchResult('win20');
 *   // event: { oldLeagueId, newLeagueId, oldLp, newLp, delta, promoted, demoted }
 *   save.updateLeague(league.leagueId, league.lp);
 *   save.save();
 */

import { LEAGUE_ORDER, getLeagueForLP, getLeagueDef } from '../data/LeagueDefs.js';

export class LeagueSystem {
  /**
   * @param {{ leagueId: string, leaguePoints: number }} profile
   */
  constructor({ leagueId, leaguePoints }) {
    /** @type {string} */
    this._leagueId = leagueId;
    /** @type {number} */
    this._lp = leaguePoints;
    /** @type {Array<Function>} */
    this._changeCallbacks = [];
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /** Current league id string (e.g. 'bronze'). */
  get leagueId() {
    return this._leagueId;
  }

  /** Current accumulated LP. */
  get lp() {
    return this._lp;
  }

  /** Full LeagueDef object for the current league. */
  get leagueDef() {
    return getLeagueDef(this._leagueId);
  }

  /**
   * LP required to promote to the next league (Infinity at Champion).
   * @returns {number}
   */
  get lpToPromote() {
    return this.leagueDef.lpToPromote;
  }

  /**
   * LP threshold at which this league begins.
   * @returns {number}
   */
  get lpBase() {
    return this.leagueDef.lpRequired;
  }

  /**
   * Fraction of the current LP bar filled (0.0–1.0).
   * Always 1.0 for Champion (no next league).
   * @returns {number}
   */
  get lpProgress() {
    const def = this.leagueDef;
    if (def.lpToPromote === Infinity) {
      return 1.0;
    }
    const span = def.lpToPromote - def.lpRequired;
    if (span <= 0) {
      return 1.0;
    }
    return Math.min(1.0, Math.max(0.0, (this._lp - def.lpRequired) / span));
  }

  // ---------------------------------------------------------------------------
  // Mutation
  // ---------------------------------------------------------------------------

  /**
   * Apply a match result, update LP, and recalculate the league.
   * Fires registered onLeagueChange callbacks with the change descriptor.
   *
   * @param {'win20'|'win21'|'lose12'|'lose02'} resultKey
   * @returns {{ oldLeagueId: string, newLeagueId: string, oldLp: number, newLp: number, delta: number, promoted: boolean, demoted: boolean }}
   */
  applyMatchResult(resultKey) {
    const oldLeagueId = this._leagueId;
    const oldLp = this._lp;

    const delta = this.leagueDef.lpGains[resultKey];
    if (delta === undefined) {
      throw new Error(`[LeagueSystem] Unknown result key: "${resultKey}"`);
    }

    const newLp = Math.max(0, this._lp + delta);
    const newLeagueId = getLeagueForLP(newLp);

    this._lp = newLp;
    this._leagueId = newLeagueId;

    const oldIdx = LEAGUE_ORDER.indexOf(oldLeagueId);
    const newIdx = LEAGUE_ORDER.indexOf(newLeagueId);

    const promoted = newIdx > oldIdx;
    const demoted = newIdx < oldIdx;

    const event = { oldLeagueId, newLeagueId, oldLp, newLp, delta, promoted, demoted };
    this._changeCallbacks.forEach(cb => cb(event));
    return event;
  }

  /**
   * Register a callback fired after every call to applyMatchResult.
   * Receives the same descriptor returned by applyMatchResult.
   *
   * @param {Function} cb
   * @returns {this}
   */
  onLeagueChange(cb) {
    this._changeCallbacks.push(cb);
    return this;
  }
}
