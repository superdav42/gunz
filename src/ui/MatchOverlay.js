import { MatchState } from '../core/MatchManager.js';

/**
 * MatchOverlay — manages the three DOM overlays driven by MatchManager.
 *
 * Overlays (must exist in index.html):
 *   #pre-round-overlay   — PRE_ROUND countdown
 *   #round-end-overlay   — ROUND_END result + next-round countdown
 *   #match-end-overlay   — MATCH_END winner screen
 *
 * Bind to MatchManager via:
 *   const overlay = new MatchOverlay(game);
 *   game.match.onUIUpdate(ui => overlay.update(ui));
 *
 * The round pip row in the HUD top-centre is also updated here.
 */

const TEAM_NAMES = ['GREEN TEAM', 'RED TEAM'];

export class MatchOverlay {
  /**
   * @param {import('../core/Game.js').Game} game - Used for the restart handler.
   */
  constructor(game) {
    this.game = game;

    // PRE_ROUND overlay
    this._preRoundEl     = document.getElementById('pre-round-overlay');
    this._preRoundNum    = document.getElementById('pre-round-number');
    this._preRoundScore  = document.getElementById('pre-round-score');
    this._preRoundTimer  = document.getElementById('pre-round-timer');

    // ROUND_END overlay
    this._roundEndEl     = document.getElementById('round-end-overlay');
    this._roundEndTitle  = document.getElementById('round-end-title');
    this._roundEndScore  = document.getElementById('round-end-score');
    this._roundEndTimer  = document.getElementById('round-end-timer');

    // MATCH_END overlay
    this._matchEndEl     = document.getElementById('match-end-overlay');
    this._matchResultEl  = document.getElementById('match-result-title');
    this._matchScoreEl   = document.getElementById('match-end-score');

    // Round indicator (HUD top-centre)
    this._roundPipsEl    = document.getElementById('round-pips');
    this._roundLabelEl   = document.getElementById('round-label');

    // Wire restart button
    const restartBtn = document.getElementById('match-restart-btn');
    if (restartBtn) {
      restartBtn.addEventListener('click', () => this.game.restart());
    }

    // Wire shop button (t017)
    const shopBtn = document.getElementById('match-shop-btn');
    if (shopBtn) {
      shopBtn.addEventListener('click', () => this.game.openShop());
    }

    this._lastState = null;
  }

  /**
   * Called every frame by MatchManager.onUIUpdate().
   * @param {import('../core/MatchManager.js').MatchUIState} ui
   */
  update(ui) {
    // Only update DOM when state or key values change (avoid thrashing).
    if (ui.state !== this._lastState) {
      this._applyState(ui);
      this._lastState = ui.state;
    }

    // Timer text updates every second regardless.
    this._updateTimers(ui);

    // Round indicator always reflects current round + per-team wins.
    this._updateRoundIndicator(ui);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /** @private */
  _applyState(ui) {
    this._hideAll();

    switch (ui.state) {
      case MatchState.PRE_ROUND:
        this._showPreRound(ui);
        break;
      case MatchState.ROUND_END:
        this._showRoundEnd(ui);
        break;
      case MatchState.MATCH_END:
        this._showMatchEnd(ui);
        break;
      case MatchState.ACTIVE:
      default:
        // No overlay during combat.
        break;
    }
  }

  /** @private */
  _hideAll() {
    this._setVisible(this._preRoundEl, false);
    this._setVisible(this._roundEndEl, false);
    this._setVisible(this._matchEndEl, false);
  }

  /** @private */
  _showPreRound(ui) {
    if (this._preRoundNum)   this._preRoundNum.textContent  = String(ui.round);
    if (this._preRoundScore) this._preRoundScore.textContent = `${ui.roundWins[0]} \u2014 ${ui.roundWins[1]}`;
    this._setVisible(this._preRoundEl, true);
  }

  /** @private */
  _showRoundEnd(ui) {
    if (this._roundEndTitle) {
      const winnerName = ui.roundWinnerId >= 0 ? TEAM_NAMES[ui.roundWinnerId] : 'DRAW';
      this._roundEndTitle.textContent = `${winnerName} WINS ROUND ${ui.round}`;
    }
    if (this._roundEndScore) {
      this._roundEndScore.textContent = `${ui.roundWins[0]} \u2014 ${ui.roundWins[1]}`;
    }
    this._setVisible(this._roundEndEl, true);
  }

  /** @private */
  _showMatchEnd(ui) {
    if (this._matchResultEl) {
      // Team 0 = player side; team 1 = enemy side.
      const playerWon = ui.matchWinnerId === 0;
      this._matchResultEl.textContent = playerWon ? 'VICTORY!' : 'DEFEAT';
      this._matchResultEl.style.color = playerWon ? '#4caf50' : '#f44336';
    }
    if (this._matchScoreEl) {
      this._matchScoreEl.textContent = `${ui.roundWins[0]} \u2014 ${ui.roundWins[1]}`;
    }
    this._setVisible(this._matchEndEl, true);
  }

  /** @private Update countdown text every frame (ceil changes ~once per second). */
  _updateTimers(ui) {
    if (this._preRoundTimer && ui.state === MatchState.PRE_ROUND) {
      this._preRoundTimer.textContent = String(Math.max(1, ui.timer));
    }
    if (this._roundEndTimer && ui.state === MatchState.ROUND_END) {
      this._roundEndTimer.textContent = String(Math.max(1, ui.timer));
    }
  }

  /** @private Pip row: green dots = player wins, red dots = enemy wins. */
  _updateRoundIndicator(ui) {
    if (this._roundLabelEl) {
      this._roundLabelEl.textContent = `Round ${ui.round}`;
    }
    if (!this._roundPipsEl) {
      return;
    }
    this._roundPipsEl.innerHTML = '';
    // Two sets of pips (one per team), separated by a dash.
    for (let i = 0; i < 2; i++) {
      const pip = document.createElement('span');
      pip.className = `pip pip-team${i} ${ui.roundWins[0] > i ? 'won' : ''}`;
      this._roundPipsEl.appendChild(pip);
    }
    const sep = document.createElement('span');
    sep.className = 'pip-sep';
    sep.textContent = '\u2014';
    this._roundPipsEl.appendChild(sep);
    for (let i = 0; i < 2; i++) {
      const pip = document.createElement('span');
      pip.className = `pip pip-team1 ${ui.roundWins[1] > i ? 'won' : ''}`;
      this._roundPipsEl.appendChild(pip);
    }
  }

  /** @private */
  _setVisible(el, visible) {
    if (!el) {
      return;
    }
    if (visible) {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  }
}
