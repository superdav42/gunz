/**
 * StatsTracker — per-round and match-aggregate performance tracking.
 *
 * Tracks (per round, for the player):
 *  - damageDealt  : total HP damage dealt to enemy tanks
 *  - kills        : enemy tanks destroyed by the player (last-hit)
 *  - assists      : enemy tanks the player damaged ≥30% of maxHP, killed by someone else
 *  - survived     : whether the player's tank was alive when the round ended
 *  - survivalTime : seconds the player's tank was alive in the round
 *
 * Usage:
 *  const stats = new StatsTracker();
 *  stats.startRound();                             // call before each round begins
 *  stats.recordPlayerDamage(tank, amount);         // on every player-hit
 *  stats.recordTankKilled(tank, isPlayerKill);     // on every enemy tank death
 *  stats.update(dt);                               // in game loop for survival time
 *  const result = stats.endRound(playerAlive);     // at round end
 *  stats.getMatchStats();                          // aggregate across all rounds
 *  stats.reset();                                  // on full match reset
 *
 * Designed to integrate with CollisionSystem callbacks (onDamageDealt, onTankKilled)
 * and MatchManager round lifecycle (t008).
 */
export class StatsTracker {
  constructor() {
    /** Completed-round snapshots. Index 0 = round 1, etc. */
    this._history = [];

    /** Mutable stats for the round currently in progress. */
    this._current = this._emptyRound();

    /**
     * Per-enemy-tank damage accumulator for assist tracking.
     * Key: Tank instance. Value: total HP damage the player dealt to it.
     * Cleared when the tank dies.
     * @type {Map<import('../entities/Tank.js').Tank, number>}
     */
    this._damageByTarget = new Map();

    /** Seconds elapsed since this round started (survival time). */
    this._roundElapsed = 0;

    /** Whether the player's tank is still alive this round. */
    this._playerAlive = true;
  }

  // ---------------------------------------------------------------------------
  // Round lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Begin a new round.  Call before the first frame of each round.
   * Resets per-round accumulators but leaves match history intact.
   */
  startRound() {
    this._current = this._emptyRound();
    this._damageByTarget.clear();
    this._roundElapsed = 0;
    this._playerAlive = true;
  }

  /**
   * Finalise the current round.
   *
   * @param {boolean} playerAlive — pass true if the player's tank survived.
   * @returns {RoundStats} snapshot of the completed round
   */
  endRound(playerAlive) {
    this._playerAlive = playerAlive;
    this._current.survived = playerAlive;
    this._current.survivalTime = this._roundElapsed;

    const snapshot = { ...this._current };
    this._history.push(snapshot);
    return snapshot;
  }

  /**
   * Full reset — clears history and per-round state.
   * Call when starting a new match.
   */
  reset() {
    this._history = [];
    this.startRound();
  }

  // ---------------------------------------------------------------------------
  // Event recording
  // ---------------------------------------------------------------------------

  /**
   * Record damage the player dealt to an enemy tank.
   * Call every time a player projectile connects with an enemy.
   *
   * @param {import('../entities/Tank.js').Tank} tank   — the tank that was hit
   * @param {number}                             amount — HP damage dealt
   */
  recordPlayerDamage(tank, amount) {
    const prev = this._damageByTarget.get(tank) || 0;
    this._damageByTarget.set(tank, prev + amount);
    this._current.damageDealt += amount;
  }

  /**
   * Record the death of an enemy tank.
   * Computes assist credit if the player dealt ≥30% of the tank's max HP
   * and the kill was not by the player.
   *
   * @param {import('../entities/Tank.js').Tank} tank          — the tank that died
   * @param {boolean}                            killedByPlayer — true if the player's shell was lethal
   */
  recordTankKilled(tank, killedByPlayer) {
    const playerDamage = this._damageByTarget.get(tank) || 0;

    if (killedByPlayer) {
      this._current.kills++;
    } else {
      // Assist threshold: ≥30% of tank's max HP dealt by the player
      const maxHp = tank.maxHealth > 0 ? tank.maxHealth : 100;
      const fraction = playerDamage / maxHp;
      if (fraction >= 0.3) {
        this._current.assists++;
      }
    }

    // Release the damage accumulator for this tank
    this._damageByTarget.delete(tank);
  }

  /**
   * Notify StatsTracker that the player's own tank has been destroyed.
   * Stops survival-time accumulation for the round.
   */
  recordPlayerDeath() {
    this._playerAlive = false;
  }

  // ---------------------------------------------------------------------------
  // Per-frame update
  // ---------------------------------------------------------------------------

  /**
   * Advance the survival timer.  Call once per frame from the game loop
   * when the round is active.
   *
   * @param {number} dt — seconds since last frame
   */
  update(dt) {
    if (this._playerAlive) {
      this._roundElapsed += dt;
    }
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /**
   * Live stats for the round in progress (does not include survivalTime
   * or survived flag until endRound is called).
   *
   * @returns {RoundStats}
   */
  getCurrentRoundStats() {
    return { ...this._current };
  }

  /**
   * Snapshot for a completed round (0-indexed).
   *
   * @param {number} index
   * @returns {RoundStats|null}
   */
  getRoundStats(index) {
    const entry = this._history[index];
    return entry ? { ...entry } : null;
  }

  /**
   * Aggregate stats across all completed rounds.
   * Useful for rewards calculation and MVP determination.
   *
   * @returns {{ rounds: RoundStats[], totals: MatchTotals }}
   */
  getMatchStats() {
    const allRounds = this._history.map(r => ({ ...r }));

    const totals = allRounds.reduce(
      (acc, r) => ({
        damageDealt: acc.damageDealt + r.damageDealt,
        kills: acc.kills + r.kills,
        assists: acc.assists + r.assists,
        roundsSurvived: acc.roundsSurvived + (r.survived ? 1 : 0),
        totalSurvivalTime: acc.totalSurvivalTime + r.survivalTime,
      }),
      { damageDealt: 0, kills: 0, assists: 0, roundsSurvived: 0, totalSurvivalTime: 0 }
    );

    return { rounds: allRounds, totals };
  }

  /**
   * Round index currently in progress (0-based, equals history length
   * since history only contains completed rounds).
   *
   * @returns {number}
   */
  get currentRoundIndex() {
    return this._history.length;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * @returns {RoundStats}
   */
  _emptyRound() {
    return {
      damageDealt: 0,
      kills: 0,
      assists: 0,
      survived: false,
      survivalTime: 0,
    };
  }
}

/**
 * @typedef {{
 *   damageDealt:  number,
 *   kills:        number,
 *   assists:      number,
 *   survived:     boolean,
 *   survivalTime: number
 * }} RoundStats
 *
 * @typedef {{
 *   damageDealt:       number,
 *   kills:             number,
 *   assists:           number,
 *   roundsSurvived:    number,
 *   totalSurvivalTime: number
 * }} MatchTotals
 */
