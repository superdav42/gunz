export class HUD {
  constructor() {
    this.el = document.getElementById('hud');
    this.healthBar = document.getElementById('health-fill');
    this.scoreEl = document.getElementById('score');
    this.ammoEl = document.getElementById('ammo');
    this.gameOverEl = document.getElementById('game-over');
    this.finalScoreEl = document.getElementById('final-score');
  }

  update({ score, health, ammo }) {
    this.scoreEl.textContent = score;
    this.ammoEl.textContent = ammo;

    const pct = Math.max(0, (health / 100) * 100);
    this.healthBar.style.width = `${pct}%`;

    if (pct > 50) {
      this.healthBar.style.backgroundColor = '#4caf50';
    } else if (pct > 25) {
      this.healthBar.style.backgroundColor = '#ff9800';
    } else {
      this.healthBar.style.backgroundColor = '#f44336';
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
