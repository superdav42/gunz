/**
 * LeagueSystem — LP tracking, league promotion / demotion logic.
 *
 * Manages the player's league state by reading and writing through SaveSystem.
 * Promotion and demotion thresholds are defined in LeagueDefs.
 *
 * Usage:
 *   const league = new LeagueSystem(saveSystem);
 *   const id     = league.getCurrentLeagueId();   // 'bronze'
 *   const def    = league.getCurrentLeagueDef();  // LeagueDefs.bronze
 *   const cap    = league.getUpgradeTierCap();    // 2
 *   const result = league.applyMatchResult('win20');
 *   //  → { lpBefore, lpAfter, delta, leagueBefore, leagueAfter, promoted, demoted }
 *
 * League IDs (lowest→highest): bronze, silver, gold, platinum, diamond, champion.
 * Match result keys: 'win20' (2-0 sweep), 'win21' (2-1 close),
 *                    'lose12' (1-2 close), 'lose02' (0-2 sweep).
 */

import {
  getLeagueDef,
  getLeagueForLP,
  LEAGUE_ORDER,
} from '../data/LeagueDefs.js';

export class LeagueSystem {
  /**
   * @param {import('./SaveSystem.js').SaveSystem} saveSystem
   */
  constructor(saveSystem) {
    this._save = saveSystem;
  }

  // ---------------------------------------------------------------------------
  // Read-only accessors
  // ---------------------------------------------------------------------------

  /**
   * Current league ID string.
   * @returns {'bronze'|'silver'|'gold'|'platinum'|'diamond'|'champion'}
   */
  getCurrentLeagueId() {
    return this._save._profile.leagueId || 'bronze';
  }

  /**
   * Current league definition object from LeagueDefs.
   * @returns {object}
   */
  getCurrentLeagueDef() {
    return getLeagueDef(this.getCurrentLeagueId());
  }

  /**
   * Accumulated league points for the current league.
   * @returns {number}
   */
  getCurrentLP() {
    return this._save._profile.leaguePoints || 0;
  }

  /**
   * Maximum upgrade tier purchasable while in the current league (1–5).
   * Mirrors LeagueDefs[id].upgradeTierCap.
   * @returns {number}
   */
  getUpgradeTierCap() {
    return this.getCurrentLeagueDef().upgradeTierCap;
  }

  // ---------------------------------------------------------------------------
  // Unlock helpers (used by ShopMenu and other consumers)
  // ---------------------------------------------------------------------------

  /**
   * True if the player's current league meets or exceeds a tank's league requirement.
   * @param {object} tankDef  A TankDefs entry with a `leagueRequired` field.
   * @returns {boolean}
   */
  isTankUnlocked(tankDef) {
    return this._meetsLeagueReq(tankDef.leagueRequired);
  }

  /**
   * True if the player's current league meets or exceeds a weapon's league requirement.
   * @param {object} weaponDef  A GunDefs / MeleeDefs entry with a `leagueRequired` field.
   * @returns {boolean}
   */
  isWeaponUnlocked(weaponDef) {
    return this._meetsLeagueReq(weaponDef.leagueRequired);
  }

  /**
   * Maximum available tier for an upgrade in the current league.
   * Clamps the upgrade's own maxTier to the league tier cap.
   *
   * @param {object} upgradeDef  A TankUpgradeDefs / FootUpgradeDefs entry.
   * @returns {number}  0 if not available yet (league too low), otherwise 1–5.
   */
  getMaxAvailableUpgradeTier(upgradeDef) {
    const cap = this.getUpgradeTierCap();
    return Math.min(upgradeDef.maxTier, cap);
  }

  // ---------------------------------------------------------------------------
  // LP mutation (side-effects: persists via SaveSystem)
  // ---------------------------------------------------------------------------

  /**
   * Apply a match result LP delta, detect promotion/demotion, and persist.
   *
   * @param {'win20'|'win21'|'lose12'|'lose02'} result
   *   win20  = 2-0 sweep win
   *   win21  = 2-1 close win
   *   lose12 = 1-2 close loss
   *   lose02 = 0-2 sweep loss
   *
   * @returns {{
   *   lpBefore:     number,
   *   lpAfter:      number,
   *   delta:        number,
   *   leagueBefore: string,
   *   leagueAfter:  string,
   *   promoted:     boolean,
   *   demoted:      boolean,
   * }}
   */
  applyMatchResult(result) {
    const leagueBefore = this.getCurrentLeagueId();
    const lpBefore     = this.getCurrentLP();
    const def          = getLeagueDef(leagueBefore);
    const delta        = def.lpGains[result] ?? 0;
    const lpAfter      = Math.max(0, lpBefore + delta);
    const leagueAfter  = getLeagueForLP(lpAfter);

    const idxBefore = LEAGUE_ORDER.indexOf(leagueBefore);
    const idxAfter  = LEAGUE_ORDER.indexOf(leagueAfter);

    this._save.updateLeague(leagueAfter, lpAfter);
    this._save.save();

    const summary = {
      lpBefore,
      lpAfter,
      delta,
      leagueBefore,
      leagueAfter,
      promoted: idxAfter > idxBefore,
      demoted:  idxAfter < idxBefore,
    };

    if (summary.promoted) {
      console.info(
        `[LeagueSystem] PROMOTED ${leagueBefore} → ${leagueAfter} ` +
        `(LP: ${lpBefore} + ${delta} = ${lpAfter})`
      );
    } else if (summary.demoted) {
      console.info(
        `[LeagueSystem] DEMOTED ${leagueBefore} → ${leagueAfter} ` +
        `(LP: ${lpBefore} + ${delta} = ${lpAfter})`
      );
    } else {
      console.info(
        `[LeagueSystem] Match result applied. LP: ${lpBefore} + ${delta} = ${lpAfter} ` +
        `(${leagueAfter})`
      );
    }

    return summary;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * @private
   * @param {string} requiredId  League ID that an item requires.
   * @returns {boolean}
   */
  _meetsLeagueReq(requiredId) {
    const currentIdx  = LEAGUE_ORDER.indexOf(this.getCurrentLeagueId());
    const requiredIdx = LEAGUE_ORDER.indexOf(requiredId);
    if (requiredIdx === -1) {
      // Unknown league ID — treat as always unlocked to avoid hiding items.
      console.warn(`[LeagueSystem] Unknown leagueRequired value: "${requiredId}"`);
      return true;
    }
    return currentIdx >= requiredIdx;
  }
}
