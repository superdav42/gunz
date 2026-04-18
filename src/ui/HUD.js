export class HUD {
  constructor() {
    this.el = document.getElementById('hud');
    this.healthBar = document.getElementById('health-fill');
    this.scoreEl = document.getElementById('score');
    this.ammoEl = document.getElementById('ammo');
    this.gameOverEl = document.getElementById('game-over');
    this.finalScoreEl = document.getElementById('final-score');

    // Stats panel elements (t010)
    this.statsDmgEl = document.getElementById('stat-damage');
    this.statsKillsEl = document.getElementById('stat-kills');
    this.statsAssistsEl = document.getElementById('stat-assists');
  }

  /**
   * @param {object}  data
   * @param {number}  data.score
   * @param {number}  data.health      — current HP of the active entity
   * @param {number}  [data.maxHealth=100] — max HP; pass soldier.maxHealth (30) so the
   *                                     bar fills to 100 % at full soldier HP, not 30 %
   * @param {number|string|null} data.ammo — ammo count, null for soldiers (∞)
   * @param {import('../systems/StatsTracker.js').RoundStats} [data.stats]
   */
  update({ score, health, maxHealth = 100, ammo, stats }) {
    this.scoreEl.textContent = score;
    this.ammoEl.textContent  = ammo ?? '∞';

    const pct = Math.max(0, (health / maxHealth) * 100);
    this.healthBar.style.width = `${pct}%`;

    if (pct > 50) {
      this.healthBar.style.backgroundColor = '#4caf50';
    } else if (pct > 25) {
      this.healthBar.style.backgroundColor = '#ff9800';
    } else {
      this.healthBar.style.backgroundColor = '#f44336';
    }

    // Update stats panel if elements are present and data was provided
    if (stats) {
      if (this.statsDmgEl) this.statsDmgEl.textContent = stats.damageDealt;
      if (this.statsKillsEl) this.statsKillsEl.textContent = stats.kills;
      if (this.statsAssistsEl) this.statsAssistsEl.textContent = stats.assists;
    }
  }

  showGameOver(score) {
    this.finalScoreEl.textContent = score;
    this.gameOverEl.classList.remove('hidden');
  }

  hideGameOver() {
    this.gameOverEl.classList.add('hidden');
  }
}
