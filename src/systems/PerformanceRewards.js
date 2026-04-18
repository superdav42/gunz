/**
 * PerformanceRewards — calculates post-match money rewards from StatsTracker output.
 *
 * Reward table (from VISION.md § "Performance-Based Rewards"):
 *
 *  | Action                        | Money Earned                              |
 *  |-------------------------------|-------------------------------------------|
 *  | Damage dealt                  | +$1 per 5 HP dealt to enemy tanks         |
 *  | Tank kill (last hit)          | +$100–$300 (varies by enemy tank class)   |
 *  | Assist (≥30% damage, not kill)| +$50–$150 (varies by enemy tank class)    |
 *  | On-foot kill (enemy soldier)  | +$40                                      |
 *  | Survived the round            | +$150 bonus per round                     |
 *  | Win a round                   | +$500 bonus per round won                 |
 *  | Win the match                 | +$1,000 bonus                             |
 *  | MVP (most damage in match)    | +$400 bonus                               |
 *  | Flawless round (zero dmg taken| +$300 bonus per flawless round            |
 *  | Lose the match                | keep damage/kill earnings, no win/MVP     |
 *
 * Usage:
 *  const rewards = PerformanceRewards.calculate({
 *    matchStats,      // from StatsTracker.getMatchStats()
 *    roundWins,       // boolean[] — true for each round the player's team won
 *    matchWon,        // boolean — did the player's team win the match?
 *    isMVP,           // boolean — did this player deal most damage?
 *    killReward,      // optional number — $ per kill (default 200)
 *    assistReward,    // optional number — $ per assist (default 100)
 *  });
 *  // rewards.total   — total money earned
 *  // rewards.lines   — human-readable breakdown for the rewards screen
 *
 * Notes:
 *  - Kill and assist rewards default to the midpoint of the VISION.md ranges
 *    ($200 and $100 respectively).  When TankDefs (t016) are implemented, pass
 *    the per-kill reward array for class-accurate values.
 *  - isMVP must be determined by the caller (MatchManager) by comparing each
 *    player's total damageDealt across all rounds.
 *  - roundWins length must match matchStats.rounds length (rounds played).
 *  - Flawless detection uses RoundStats.damageReceived, which requires
 *    StatsTracker.recordPlayerDamageTaken() to be called on every player hit.
 */
export class PerformanceRewards {
  // ---------------------------------------------------------------------------
  // Reward constants (from VISION.md reward table)
  // ---------------------------------------------------------------------------

  /** $1 per 5 HP dealt — expressed as $ per 1 HP for multiplication. */
  static DAMAGE_RATE = 1 / 5;

  /** Default kill reward (mid-range of $100–$300). */
  static KILL_DEFAULT = 200;

  /** Minimum kill reward (cheapest tank class). */
  static KILL_MIN = 100;

  /** Maximum kill reward (most expensive tank class). */
  static KILL_MAX = 300;

  /** Default assist reward (mid-range of $50–$150). */
  static ASSIST_DEFAULT = 100;

  /** Minimum assist reward. */
  static ASSIST_MIN = 50;

  /** Maximum assist reward. */
  static ASSIST_MAX = 150;

  /** Bonus per on-foot (soldier) kill. */
  static ON_FOOT_KILL_REWARD = 40;

  /** Bonus per round survived. */
  static SURVIVED_BONUS = 150;

  /** Bonus per round won by the player's team. */
  static WIN_ROUND_BONUS = 500;

  /** Bonus for winning the overall match. */
  static WIN_MATCH_BONUS = 1000;

  /** Bonus for being MVP (most damage in match). */
  static MVP_BONUS = 400;

  /** Bonus per round where the player's tank took zero damage. */
  static FLAWLESS_BONUS = 300;

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Calculate total money rewards for a completed match.
   *
   * @param {object}  params
   * @param {{ rounds: import('./StatsTracker.js').RoundStats[],
   *           totals: import('./StatsTracker.js').MatchTotals }} params.matchStats
   *   — output of StatsTracker.getMatchStats()
   * @param {boolean[]} params.roundWins
   *   — true for each round the player's team won (index matches rounds array)
   * @param {boolean}  params.matchWon
   *   — true if the player's team won the match
   * @param {boolean}  params.isMVP
   *   — true if this player dealt the most total damage across all players
   * @param {number}   [params.killReward=200]
   *   — $ per kill; use per-class value from TankDefs when available
   * @param {number}   [params.assistReward=100]
   *   — $ per assist; use per-class value from TankDefs when available
   * @param {number}   [params.onFootKills=0]
   *   — number of enemy soldiers killed while on foot
   * @returns {RewardBreakdown}
   */
  static calculate({
    matchStats,
    roundWins,
    matchWon,
    isMVP,
    killReward = PerformanceRewards.KILL_DEFAULT,
    assistReward = PerformanceRewards.ASSIST_DEFAULT,
    onFootKills = 0,
  }) {
    const { rounds, totals } = matchStats;

    // --- per-HP damage reward ---
    const damageEarned = Math.floor(totals.damageDealt * PerformanceRewards.DAMAGE_RATE);

    // --- kill and assist rewards ---
    const killEarned = totals.kills * killReward;
    const assistEarned = totals.assists * assistReward;

    // --- on-foot kill reward ---
    const onFootEarned = onFootKills * PerformanceRewards.ON_FOOT_KILL_REWARD;

    // --- per-round bonuses ---
    let survivalEarned = 0;
    let flawlessEarned = 0;
    let roundWinEarned = 0;

    for (let i = 0; i < rounds.length; i++) {
      const round = rounds[i];

      if (round.survived) {
        survivalEarned += PerformanceRewards.SURVIVED_BONUS;
      }

      if (round.damageReceived === 0 && round.survived) {
        // Flawless: tank alive at round end AND took zero damage
        flawlessEarned += PerformanceRewards.FLAWLESS_BONUS;
      }

      if (roundWins[i]) {
        roundWinEarned += PerformanceRewards.WIN_ROUND_BONUS;
      }
    }

    // --- match-level bonuses (only on win) ---
    const matchWinEarned = matchWon ? PerformanceRewards.WIN_MATCH_BONUS : 0;
    const mvpEarned = isMVP && matchWon ? PerformanceRewards.MVP_BONUS : 0;

    // --- total ---
    const total =
      damageEarned +
      killEarned +
      assistEarned +
      onFootEarned +
      survivalEarned +
      flawlessEarned +
      roundWinEarned +
      matchWinEarned +
      mvpEarned;

    // --- human-readable breakdown lines ---
    const lines = PerformanceRewards._buildLines({
      damageDealt: totals.damageDealt,
      damageEarned,
      kills: totals.kills,
      killReward,
      killEarned,
      assists: totals.assists,
      assistReward,
      assistEarned,
      onFootKills,
      onFootEarned,
      survivalEarned,
      flawlessEarned,
      roundWinEarned,
      matchWon,
      matchWinEarned,
      isMVP,
      mvpEarned,
    });

    return {
      total,
      breakdown: {
        damage: damageEarned,
        kills: killEarned,
        assists: assistEarned,
        onFootKills: onFootEarned,
        survivalBonuses: survivalEarned,
        flawlessBonuses: flawlessEarned,
        roundWinBonuses: roundWinEarned,
        matchWinBonus: matchWinEarned,
        mvpBonus: mvpEarned,
      },
      lines,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Build an array of { label, amount } objects for the rewards screen UI.
   * Only lines where amount > 0 are included.
   *
   * @param {object} p — destructured calculation intermediates
   * @returns {RewardLine[]}
   */
  static _buildLines(p) {
    const lines = [];

    if (p.damageEarned > 0) {
      lines.push({
        label: `Damage dealt (${p.damageDealt} HP)`,
        amount: p.damageEarned,
      });
    }

    if (p.killEarned > 0) {
      lines.push({
        label: `Kills ×${p.kills} ($${p.killReward} each)`,
        amount: p.killEarned,
      });
    }

    if (p.assistEarned > 0) {
      lines.push({
        label: `Assists ×${p.assists} ($${p.assistReward} each)`,
        amount: p.assistEarned,
      });
    }

    if (p.onFootEarned > 0) {
      lines.push({
        label: `On-foot kills ×${p.onFootKills}`,
        amount: p.onFootEarned,
      });
    }

    if (p.survivalEarned > 0) {
      lines.push({
        label: 'Survived round bonus',
        amount: p.survivalEarned,
      });
    }

    if (p.flawlessEarned > 0) {
      lines.push({
        label: 'Flawless round bonus',
        amount: p.flawlessEarned,
      });
    }

    if (p.roundWinEarned > 0) {
      lines.push({
        label: 'Round win bonus',
        amount: p.roundWinEarned,
      });
    }

    if (p.matchWinEarned > 0) {
      lines.push({
        label: 'Match win bonus',
        amount: p.matchWinEarned,
      });
    }

    if (p.mvpEarned > 0) {
      lines.push({
        label: 'MVP bonus',
        amount: p.mvpEarned,
      });
    }

    return lines;
  }
}

/**
 * @typedef {{
 *   total:     number,
 *   breakdown: {
 *     damage:          number,
 *     kills:           number,
 *     assists:         number,
 *     onFootKills:     number,
 *     survivalBonuses: number,
 *     flawlessBonuses: number,
 *     roundWinBonuses: number,
 *     matchWinBonus:   number,
 *     mvpBonus:        number,
 *   },
 *   lines: RewardLine[],
 * }} RewardBreakdown
 *
 * @typedef {{
 *   label:  string,
 *   amount: number,
 * }} RewardLine
 */
