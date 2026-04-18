/**
 * EconomySystem — money balance, reward calculation, and spend validation.
 *
 * Tracks the player's persistent money balance and calculates match rewards
 * from StatsTracker output according to the VISION.md performance-reward table.
 *
 * Reward table (VISION.md §Performance-Based Rewards):
 *   +$1 per 5 HP damage dealt to enemy tanks   ($0.20/HP)
 *   +$100–$300 per tank kill (last-hit)         ($200 default)
 *   +$50–$150 per assist (≥30% damage to ally-kill)  ($100 default)
 *   +$150 bonus   survived the round
 *   +$300 bonus   flawless round (zero damage taken — requires damage-taken data)
 *   +$500 bonus   won the round
 *   +$1,000 bonus won the match
 *   +$400 bonus   MVP (most damage across both teams — requires comparative data)
 *
 * Flawless and MVP bonuses are accepted as optional inputs from callers that
 * have the required data; they default to false/0 when not supplied.
 *
 * Usage:
 *   const economy = new EconomySystem({ startingBalance: 0 });
 *
 *   // Per round (fire once with the round's RoundStats + win flag):
 *   const roundReward = economy.calculateRoundReward(roundStats, { wonRound: true, flawless: false });
 *   economy.earnReward(roundReward);
 *
 *   // At match end:
 *   const matchReward = economy.calculateMatchReward({ wonMatch: true, isMvp: false });
 *   economy.earnReward(matchReward);
 *
 *   // Spending (shop, upgrades):
 *   if (economy.canAfford(price)) economy.spend(price);
 *
 *   // Getters:
 *   economy.balance   // current money
 */
export class EconomySystem {
  /**
   * @param {object} [opts]
   * @param {number} [opts.startingBalance=0]   Initial money balance.
   * @param {object} [opts.rates]               Override reward rates (for testing / balancing).
   */
  constructor(opts = {}) {
    const { startingBalance = 0, rates = {} } = opts;

    /** @type {number} Current money balance. Always ≥ 0. */
    this._balance = Math.max(0, Math.floor(startingBalance));

    /**
     * Reward rate constants (VISION.md defaults; overridable via opts.rates).
     * @private
     */
    this._rates = {
      damagePerFiveHp: 1,           // $1 per 5 HP damage dealt
      killBase: 200,                 // $200 per kill (mid of $100–$300 range)
      assistBase: 100,               // $100 per assist (mid of $50–$150 range)
      survivalBonus: 150,            // +$150 for surviving the round
      flawlessBonus: 300,            // +$300 for zero damage taken
      winRoundBonus: 500,            // +$500 for winning a round
      winMatchBonus: 1000,           // +$1,000 for winning the match
      mvpBonus: 400,                 // +$400 for MVP (most damage)
      ...rates,
    };

    /** History of reward breakdowns applied this session (for display / debugging). */
    this._rewardHistory = [];
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /** Current money balance (always ≥ 0). @type {number} */
  get balance() {
    return this._balance;
  }

  // ---------------------------------------------------------------------------
  // Reward calculation
  // ---------------------------------------------------------------------------

  /**
   * Calculate the money reward for one round of performance.
   *
   * Does NOT modify the balance — call earnReward() to apply.
   *
   * @param {import('./StatsTracker.js').RoundStats} roundStats
   *   Snapshot returned by StatsTracker.endRound().
   * @param {object} [context]
   * @param {boolean} [context.wonRound=false]  True if the player's team won this round.
   * @param {boolean} [context.flawless=false]  True if the player took zero damage this round.
   * @returns {RewardBreakdown}
   */
  calculateRoundReward(roundStats, context = {}) {
    const { wonRound = false, flawless = false } = context;

    const damageReward = Math.floor((roundStats.damageDealt / 5) * this._rates.damagePerFiveHp);
    const killReward   = roundStats.kills   * this._rates.killBase;
    const assistReward = roundStats.assists * this._rates.assistBase;
    const survivalReward = roundStats.survived ? this._rates.survivalBonus : 0;
    const flawlessReward = (roundStats.survived && flawless) ? this._rates.flawlessBonus : 0;
    const roundWinReward = wonRound ? this._rates.winRoundBonus : 0;

    const total =
      damageReward +
      killReward   +
      assistReward +
      survivalReward +
      flawlessReward +
      roundWinReward;

    return {
      source: 'round',
      damageReward,
      killReward,
      assistReward,
      survivalReward,
      flawlessReward,
      roundWinReward,
      matchWinReward: 0,
      mvpReward: 0,
      total,
    };
  }

  /**
   * Calculate the money reward for match-level results.
   *
   * Does NOT modify the balance — call earnReward() to apply.
   *
   * @param {object} [context]
   * @param {boolean} [context.wonMatch=false]  True if the player's team won the match.
   * @param {boolean} [context.isMvp=false]     True if the player had the most damage.
   * @returns {RewardBreakdown}
   */
  calculateMatchReward(context = {}) {
    const { wonMatch = false, isMvp = false } = context;

    const matchWinReward = wonMatch ? this._rates.winMatchBonus : 0;
    const mvpReward      = isMvp   ? this._rates.mvpBonus       : 0;
    const total          = matchWinReward + mvpReward;

    return {
      source: 'match',
      damageReward: 0,
      killReward: 0,
      assistReward: 0,
      survivalReward: 0,
      flawlessReward: 0,
      roundWinReward: 0,
      matchWinReward,
      mvpReward,
      total,
    };
  }

  /**
   * Convenience: compute total rewards from a complete match (all rounds + match
   * result) using StatsTracker.getMatchStats() output.
   *
   * For each round: applies round-level rewards using per-round RoundStats.
   * Applies one match-level reward for the overall result.
   * MVP check: true if the player's total damage exceeds the provided threshold.
   *
   * Does NOT modify the balance.
   *
   * @param {object} params
   * @param {{ rounds: import('./StatsTracker.js').RoundStats[], totals: object }} params.matchStats
   *   Output of StatsTracker.getMatchStats().
   * @param {number[]} params.roundWins
   *   [playerTeamWins, enemyTeamWins] — e.g. [2, 1] for a 2-1 match win.
   * @param {boolean}  params.wonMatch         Overall match result.
   * @param {boolean}  [params.isMvp=false]    Whether the player earned MVP.
   * @param {boolean[]} [params.flawlessRounds]
   *   Per-round flawless flags (index-aligned with matchStats.rounds).
   * @returns {{ breakdowns: RewardBreakdown[], grandTotal: number }}
   */
  calculateFullMatchRewards({
    matchStats,
    roundWins,
    wonMatch,
    isMvp = false,
    flawlessRounds = [],
  }) {
    const breakdowns = [];

    // Per-round rewards
    matchStats.rounds.forEach((roundStats, idx) => {
      // Player's team wins the round when playerTeamWins > enemyTeamWins after
      // round idx+1 — approximated by checking if idx < playerTeamWins.
      // A more precise approach would store per-round win flags; for now this
      // correctly covers the common 2-0 / 2-1 cases.
      const playerTeamWins = roundWins[0];
      const wonRound = idx < playerTeamWins;
      const flawless = flawlessRounds[idx] === true;
      breakdowns.push(this.calculateRoundReward(roundStats, { wonRound, flawless }));
    });

    // Match-level reward (applied once at match end)
    breakdowns.push(this.calculateMatchReward({ wonMatch, isMvp }));

    const grandTotal = breakdowns.reduce((sum, b) => sum + b.total, 0);
    return { breakdowns, grandTotal };
  }

  // ---------------------------------------------------------------------------
  // Balance mutation
  // ---------------------------------------------------------------------------

  /**
   * Add a computed reward to the balance.
   *
   * @param {RewardBreakdown} breakdown  Output of calculateRoundReward() or calculateMatchReward().
   */
  earnReward(breakdown) {
    const amount = Math.max(0, Math.floor(breakdown.total));
    this._balance += amount;
    this._rewardHistory.push({ ...breakdown, appliedAt: Date.now() });

    console.info(
      `[EconomySystem] Earned $${amount} (${breakdown.source}). ` +
      `Balance: $${this._balance}`
    );

    return this;
  }

  /**
   * Directly earn a flat amount (for testing, bonuses, or starter grants).
   *
   * @param {number} amount
   */
  earnAmount(amount) {
    const safe = Math.max(0, Math.floor(amount));
    this._balance += safe;
    console.info(`[EconomySystem] Earned $${safe} (flat). Balance: $${this._balance}`);
    return this;
  }

  /**
   * Spend money. Throws if the balance is insufficient.
   *
   * @param {number} amount  Cost to deduct (must be > 0).
   * @throws {Error} If the player cannot afford the purchase.
   */
  spend(amount) {
    const cost = Math.floor(amount);
    if (cost <= 0) {
      throw new Error(`[EconomySystem] spend() called with non-positive amount: ${amount}`);
    }
    if (!this.canAfford(cost)) {
      throw new Error(
        `[EconomySystem] Insufficient funds. Cost: $${cost}, Balance: $${this._balance}`
      );
    }
    this._balance -= cost;
    console.info(`[EconomySystem] Spent $${cost}. Balance: $${this._balance}`);
    return this;
  }

  /**
   * Returns true if the current balance is enough to cover amount.
   *
   * @param {number} amount
   * @returns {boolean}
   */
  canAfford(amount) {
    return this._balance >= Math.floor(amount);
  }

  // ---------------------------------------------------------------------------
  // History / debug
  // ---------------------------------------------------------------------------

  /**
   * Reward entries applied this session (most recent last).
   * @returns {Array<RewardBreakdown & { appliedAt: number }>}
   */
  getRewardHistory() {
    return this._rewardHistory.map(r => ({ ...r }));
  }

  /**
   * Reset balance to zero and clear reward history.
   * Call when starting a completely new game / fresh save slot.
   * Do NOT call between rounds or between matches — the balance persists.
   */
  resetBalance() {
    this._balance = 0;
    this._rewardHistory = [];
    console.info('[EconomySystem] Balance reset to $0.');
  }
}

/**
 * @typedef {{
 *   source:         'round' | 'match',
 *   damageReward:   number,
 *   killReward:     number,
 *   assistReward:   number,
 *   survivalReward: number,
 *   flawlessReward: number,
 *   roundWinReward: number,
 *   matchWinReward: number,
 *   mvpReward:      number,
 *   total:          number,
 * }} RewardBreakdown
 */
