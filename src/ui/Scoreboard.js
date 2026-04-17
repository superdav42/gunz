/**
 * Scoreboard — hold Tab to view all 12 tanks with HP, kills, damage, and status.
 *
 * Usage:
 *   const scoreboard = new Scoreboard(teamManager);
 *   // In the game loop, after reading input:
 *   scoreboard.update(input.tabHeld);
 *
 * The component injects its own DOM element into document.body and manages
 * visibility itself. No HTML template needed — built entirely in JS to keep
 * the overlay self-contained and easy to tree-shake later.
 */
export class Scoreboard {
  /**
   * @param {import('../core/TeamManager.js').TeamManager} teamManager
   */
  constructor(teamManager) {
    this._teams = teamManager;
    this._visible = false;
    this._el = null;
    this._teamContainers = [];
    this._build();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Call every frame with the current Tab-held state.
   * Renders fresh data whenever the overlay is visible.
   * @param {boolean} tabHeld
   */
  update(tabHeld) {
    if (tabHeld && !this._visible) {
      this._visible = true;
      this._el.classList.remove('sb-hidden');
    } else if (!tabHeld && this._visible) {
      this._visible = false;
      this._el.classList.add('sb-hidden');
    }

    if (this._visible) {
      this._render();
    }
  }

  // ---------------------------------------------------------------------------
  // Private: DOM construction
  // ---------------------------------------------------------------------------

  _build() {
    const el = document.createElement('div');
    el.id = 'scoreboard-overlay';
    el.className = 'sb-overlay sb-hidden';
    el.innerHTML = this._scaffoldHTML();
    document.body.appendChild(el);

    this._el = el;
    this._teamContainers = [
      el.querySelector('#sb-team-0'),
      el.querySelector('#sb-team-1'),
    ];
  }

  _scaffoldHTML() {
    return `
      <div class="sb-panel">
        <div class="sb-title">SCOREBOARD</div>
        <div class="sb-columns">
          <div class="sb-team-block">
            <div class="sb-team-header sb-green">YOUR TEAM</div>
            <div class="sb-col-labels">
              <span class="sb-col-name">Tank</span>
              <span class="sb-col-hp">HP</span>
              <span class="sb-col-kills">Kills</span>
              <span class="sb-col-dmg">Damage</span>
              <span class="sb-col-status">Status</span>
            </div>
            <div id="sb-team-0" class="sb-rows"></div>
          </div>
          <div class="sb-divider"></div>
          <div class="sb-team-block">
            <div class="sb-team-header sb-red">ENEMY TEAM</div>
            <div class="sb-col-labels">
              <span class="sb-col-name">Tank</span>
              <span class="sb-col-hp">HP</span>
              <span class="sb-col-kills">Kills</span>
              <span class="sb-col-dmg">Damage</span>
              <span class="sb-col-status">Status</span>
            </div>
            <div id="sb-team-1" class="sb-rows"></div>
          </div>
        </div>
        <div class="sb-hint">Release Tab to close</div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Private: rendering
  // ---------------------------------------------------------------------------

  _render() {
    this._renderTeam(0);
    this._renderTeam(1);
  }

  /**
   * Rebuild the row HTML for one team.
   * @param {number} teamId — 0 (player team) or 1 (enemy team)
   */
  _renderTeam(teamId) {
    const container = this._teamContainers[teamId];
    if (!container) return;

    const slots = this._teams.teams[teamId].slots;
    let html = '';

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const tank = slot.tank;
      const alive = slot.alive;

      const label = this._tankLabel(teamId, i);
      const hpPct = alive ? Math.max(0, (tank.health / tank.maxHealth) * 100) : 0;
      const hpColor = this._hpColor(hpPct);
      const hpText = alive ? Math.ceil(tank.health) : '0';
      const rowClass = alive ? 'sb-row' : 'sb-row sb-row-dead';
      const statusClass = alive ? 'sb-status-alive' : 'sb-status-dead';
      const statusText = alive ? 'ALIVE' : 'DESTR';

      html += `
        <div class="${rowClass}">
          <span class="sb-col-name">${label}</span>
          <span class="sb-col-hp">
            <span class="sb-hp-bar-outer">
              <span class="sb-hp-bar-inner" style="width:${hpPct.toFixed(1)}%;background:${hpColor}"></span>
            </span>
            <span class="sb-hp-num">${hpText}</span>
          </span>
          <span class="sb-col-kills">${tank.kills}</span>
          <span class="sb-col-dmg">${tank.damageDealt}</span>
          <span class="sb-col-status ${statusClass}">${statusText}</span>
        </div>
      `;
    }

    container.innerHTML = html;
  }

  /**
   * Human-readable label for a tank slot.
   * @param {number} teamId
   * @param {number} slotIndex
   * @returns {string}
   */
  _tankLabel(teamId, slotIndex) {
    if (teamId === 0) {
      return slotIndex === 0 ? 'You' : `Ally ${slotIndex}`;
    }
    return `Enemy ${slotIndex + 1}`;
  }

  /**
   * CSS color string for an HP bar based on percentage.
   * @param {number} pct — 0..100
   * @returns {string}
   */
  _hpColor(pct) {
    if (pct > 50) return '#4caf50';
    if (pct > 25) return '#ff9800';
    return '#f44336';
  }
}
