/**
 * MatchManager — best-of-3 round state machine.
 *
 * State transitions:
 *
 *   PRE_ROUND (3 s countdown)
 *       │  timer expires
 *       ▼
 *     ACTIVE  ←─────────────────────────────┐
 *       │  one team eliminated              │
 *       ▼                                   │
 *   ROUND_END (5 s result screen)           │
 *       │  timer expires                    │
 *       ├─ a team has 2 wins ──→  MATCH_END │
 *       └─ match continues ──────────────────┘
 *
 * Integration (Game.js):
 *
 *   this.match = new MatchManager(this.teams);
 *   this.match
 *     .onRoundReset(() => { projectiles.reset(); particles.reset(); })
 *     .onMatchEnd((winnerId) => { ... });
 *   // in game loop:
 *   this.match.update(dt);
 *   if (!this.match.isActive()) return; // skip combat during overlays
 */

export const MatchState = Object.freeze({
  PRE_ROUND:  'PRE_ROUND',
  ACTIVE:     'ACTIVE',
  ROUND_END:  'ROUND_END',
  MATCH_END:  'MATCH_END',
});

/** Seconds shown on the "ROUND X STARTING IN …" overlay. */
const PRE_ROUND_DURATION = 3;
/** Seconds shown on the "ROUND OVER" result screen before advancing. */
const ROUND_END_DURATION = 5;
/** Best-of-this-many rounds: first to ceil(MAX_ROUNDS / 2) wins. */
const MAX_ROUNDS = 3;
const WINS_NEEDED = Math.ceil(MAX_ROUNDS / 2); // 2

export class MatchManager {
  /**
   * @param {import('./TeamManager.js').TeamManager} teams
   */
  constructor(teams) {
    this.teams = teams;

    /** @type {string} */
    this.state = MatchState.PRE_ROUND;
    /** Seconds remaining in the current timed phase. */
    this.stateTimer = PRE_ROUND_DURATION;
    /** 1-indexed round counter (max MAX_ROUNDS). */
    this.roundNumber = 1;
    /** [team0Wins, team1Wins] */
    this.roundWins = [0, 0];
    /** Which team won the most recent round (-1 = none yet). */
    this.lastRoundWinnerId = -1;
    /** Which team won the overall match (-1 = undecided). */
    this.matchWinnerId = -1;

    /** @private @type {(() => void) | null} */
    this._onRoundStartCb = null;
    /** @private @type {(() => void) | null} */
    this._onRoundResetCb = null;
    /** @private @type {((winnerId: number) => void) | null} */
    this._onMatchEndCb = null;
    /** @private @type {((ui: MatchUIState) => void) | null} */
    this._onUIUpdateCb = null;

    // Wire into TeamManager — fired when ALL tanks on a team are dead.
    this.teams.onTeamEliminated((teamId) => this._handleTeamEliminated(teamId));
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * True only while a round is actively in progress.
   * Game.js uses this to gate player input and AI updates.
   * @returns {boolean}
   */
  isActive() {
    return this.state === MatchState.ACTIVE;
  }

  /** @returns {string} One of the MatchState constants. */
  getState() {
    return this.state;
  }

  /**
   * Drive the state machine forward. Call once per frame from the game loop.
   * @param {number} dt - Delta time in seconds.
   */
  update(dt) {
    switch (this.state) {
      case MatchState.PRE_ROUND:
        this._tickPreRound(dt);
        break;
      case MatchState.ROUND_END:
        this._tickRoundEnd(dt);
        break;
      case MatchState.ACTIVE:
      case MatchState.MATCH_END:
        // No timer-driven transitions in these states.
        break;
    }

    this._emitUI();
  }

  /**
   * Register a callback fired when a new round's combat begins (PRE_ROUND → ACTIVE).
   * Also triggered for the very first round when the timer expires.
   * @param {() => void} cb
   * @returns {this}
   */
  onRoundStart(cb) {
    this._onRoundStartCb = cb;
    return this;
  }

  /**
   * Register a callback fired when a completed round is being reset for the next one.
   * Use this to clear projectiles, particles, wrecks, etc.
   * Fires before the PRE_ROUND countdown starts for rounds 2 and 3.
   * @param {() => void} cb
   * @returns {this}
   */
  onRoundReset(cb) {
    this._onRoundResetCb = cb;
    return this;
  }

  /**
   * Register a callback fired when the match reaches MATCH_END.
   * @param {(winnerId: number) => void} cb - winnerId: 0 = player team, 1 = enemy team.
   * @returns {this}
   */
  onMatchEnd(cb) {
    this._onMatchEndCb = cb;
    return this;
  }

  /**
   * Register a UI update callback — called every frame with the current overlay state.
   * Use MatchOverlay.js to bind this to DOM overlays.
   * @param {(ui: MatchUIState) => void} cb
   * @returns {this}
   */
  onUIUpdate(cb) {
    this._onUIUpdateCb = cb;
    return this;
  }

  /**
   * Reset the match to the initial state (all rounds, win counts cleared).
   * Called by Game.restart().
   */
  reset() {
    this.state = MatchState.PRE_ROUND;
    this.stateTimer = PRE_ROUND_DURATION;
    this.roundNumber = 1;
    this.roundWins = [0, 0];
    this.lastRoundWinnerId = -1;
    this.matchWinnerId = -1;
    // teams.reset() is the caller's responsibility (already done in Game.restart)
  }

  // ---------------------------------------------------------------------------
  // State transitions
  // ---------------------------------------------------------------------------

  /** @private */
  _tickPreRound(dt) {
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      this._enterActive();
    }
  }

  /** @private */
  _tickRoundEnd(dt) {
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      this._prepareNextRound();
    }
  }

  /**
   * Called by the TeamManager `onTeamEliminated` hook.
   * @private
   * @param {number} teamId - The team that was wiped out.
   */
  _handleTeamEliminated(teamId) {
    if (this.state !== MatchState.ACTIVE) {
      // Guard: ignore spurious callbacks during non-combat phases.
      return;
    }

    // The eliminated team *lost* — the other team wins this round.
    const winnerId = teamId === 0 ? 1 : 0;
    this.lastRoundWinnerId = winnerId;
    this.roundWins[winnerId]++;

    console.info(
      `[MatchManager] Round ${this.roundNumber} complete — team ${winnerId} wins the round. ` +
      `Match score: ${this.roundWins[0]}-${this.roundWins[1]} ` +
      `(need ${WINS_NEEDED} to win match)`
    );

    if (this.roundWins[winnerId] >= WINS_NEEDED) {
      this._enterMatchEnd(winnerId);
    } else {
      this._enterRoundEnd();
    }
  }

  /** @private PRE_ROUND → ACTIVE */
  _enterActive() {
    this.state = MatchState.ACTIVE;
    this.stateTimer = 0;
    if (this._onRoundStartCb) {
      this._onRoundStartCb();
    }
    console.info(`[MatchManager] Round ${this.roundNumber} — ACTIVE`);
  }

  /** @private ACTIVE → ROUND_END */
  _enterRoundEnd() {
    this.state = MatchState.ROUND_END;
    this.stateTimer = ROUND_END_DURATION;
    console.info(`[MatchManager] Round ${this.roundNumber} — ROUND_END`);
  }

  /** @private ACTIVE → MATCH_END */
  _enterMatchEnd(winnerId) {
    this.state = MatchState.MATCH_END;
    this.matchWinnerId = winnerId;
    this.stateTimer = 0;
    console.info(
      `[MatchManager] MATCH_END — team ${winnerId} wins the match ` +
      `(${this.roundWins[0]}-${this.roundWins[1]})`
    );
    if (this._onMatchEndCb) {
      this._onMatchEndCb(winnerId);
    }
  }

  /**
   * Advance to the next round: reset the field, enter PRE_ROUND.
   * @private ROUND_END → PRE_ROUND
   */
  _prepareNextRound() {
    this.roundNumber++;

    // Notify Game.js to clear projectiles, particles, etc.
    if (this._onRoundResetCb) {
      this._onRoundResetCb();
    }

    // Put all tanks back at full HP with starting positions.
    this.teams.reset();

    this.state = MatchState.PRE_ROUND;
    this.stateTimer = PRE_ROUND_DURATION;
    console.info(`[MatchManager] Preparing round ${this.roundNumber} — PRE_ROUND`);
  }

  // ---------------------------------------------------------------------------
  // UI emission
  // ---------------------------------------------------------------------------

  /**
   * Push current overlay data to the registered UI callback each frame.
   * @private
   */
  _emitUI() {
    if (!this._onUIUpdateCb) {
      return;
    }

    /** @type {MatchUIState} */
    const ui = {
      state:         this.state,
      round:         this.roundNumber,
      roundWins:     [...this.roundWins],
      timer:         Math.ceil(this.stateTimer),
      roundWinnerId: this.lastRoundWinnerId,
      matchWinnerId: this.matchWinnerId,
    };

    this._onUIUpdateCb(ui);
  }
}

/**
 * @typedef {Object} MatchUIState
 * @property {string}   state         - Current MatchState value.
 * @property {number}   round         - Current round number (1–3).
 * @property {number[]} roundWins     - [team0Wins, team1Wins].
 * @property {number}   timer         - Ceiling of stateTimer (0 during ACTIVE/MATCH_END).
 * @property {number}   roundWinnerId - Which team won the last round (-1 = none).
 * @property {number}   matchWinnerId - Which team won the match (-1 = undecided).
 */
