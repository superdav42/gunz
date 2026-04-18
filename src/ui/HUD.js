import { GunDefs, MeleeDefs } from '../data/WeaponDefs.js';

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

    // Weapon slot indicator (t034) — shown only in soldier mode
    this.weaponSlotsEl  = document.getElementById('weapon-slots');
    this.slotGunEl      = document.getElementById('weapon-slot-gun');
    this.slotMeleeEl    = document.getElementById('weapon-slot-melee');

    // Visual polish (t058): ghost health bar + damage flash
    this.healthGhost  = document.getElementById('health-ghost');
    this.damageFlashEl = document.getElementById('damage-flash');
    /** Previous health percentage — used to detect HP drops for ghost bar. */
    this._lastHealthPct = 100;
    /** setTimeout handle for ghost bar decay delay. */
    this._ghostTimer = null;
    /** setTimeout handle for damage flash fade-out. */
    this._flashTimer = null;
  }

  /**
   * @param {object}  data
   * @param {number}  data.score
   * @param {number}  data.health      — current HP of the active entity
   * @param {number}  [data.maxHealth=100] — max HP; pass soldier.maxHealth (30) so the
   *                                     bar fills to 100 % at full soldier HP, not 30 %
   * @param {number|string|null} data.ammo — ammo count, null for soldiers (∞)
   * @param {import('../systems/StatsTracker.js').RoundStats} [data.stats]
   * @param {boolean} [data.soldierMode=false]    — true when player is on foot (t034)
   * @param {'gun'|'melee'} [data.activeWeaponSlot='gun'] — currently selected slot (t034)
   * @param {string}  [data.soldierGunId]   — equipped gun id, used to look up name (t034)
   * @param {string}  [data.soldierMeleeId] — equipped melee id, used to look up name (t034)
   */
  update({
    score,
    health,
    maxHealth = 100,
    ammo,
    stats,
    soldierMode = false,
    activeWeaponSlot = 'gun',
    soldierGunId,
    soldierMeleeId,
  }) {
    this.scoreEl.textContent = score;
    this.ammoEl.textContent  = ammo ?? '∞';

    const pct = Math.max(0, (health / maxHealth) * 100);
    this._updateHealthBar(pct);

    // Update stats panel if elements are present and data was provided
    if (stats) {
      if (this.statsDmgEl) this.statsDmgEl.textContent = stats.damageDealt;
      if (this.statsKillsEl) this.statsKillsEl.textContent = stats.kills;
      if (this.statsAssistsEl) this.statsAssistsEl.textContent = stats.assists;
    }

    // Weapon slot indicator (t034): visible only in soldier mode.
    this._updateWeaponSlots(soldierMode, activeWeaponSlot, soldierGunId, soldierMeleeId);
  }

  /**
   * Update the weapon slot indicator shown in soldier mode.
   * Highlights the active slot and shows weapon names from WeaponDefs.
   * @private
   * @param {boolean}          soldierMode
   * @param {'gun'|'melee'}    activeWeaponSlot
   * @param {string|undefined} gunId
   * @param {string|undefined} meleeId
   */
  _updateWeaponSlots(soldierMode, activeWeaponSlot, gunId, meleeId) {
    if (!this.weaponSlotsEl) return;

    if (!soldierMode) {
      this.weaponSlotsEl.style.display = 'none';
      return;
    }

    this.weaponSlotsEl.style.display = 'flex';

    const gunName   = (gunId   && GunDefs[gunId])     ? GunDefs[gunId].name     : 'Gun';
    const meleeName = (meleeId && MeleeDefs[meleeId])  ? MeleeDefs[meleeId].name : 'Melee';

    if (this.slotGunEl) {
      this.slotGunEl.textContent = `[1] ${gunName}`;
      this.slotGunEl.classList.toggle('weapon-slot-active', activeWeaponSlot === 'gun');
    }
    if (this.slotMeleeEl) {
      this.slotMeleeEl.textContent = `[2] ${meleeName}`;
      this.slotMeleeEl.classList.toggle('weapon-slot-active', activeWeaponSlot === 'melee');
    }
  }

  // -------------------------------------------------------------------------
  // Visual polish helpers (t058)
  // -------------------------------------------------------------------------

  /**
   * Update the health bar fill width and color, including the ghost bar.
   *
   * Ghost bar (orange) lingers at the previous HP value for 500 ms then
   * transitions back to the current value via CSS, giving visual feedback
   * for damage received without obscuring the live HP state.
   *
   * @private
   * @param {number} pct  Current HP as a percentage (0–100).
   */
  _updateHealthBar(pct) {
    // Actual bar
    this.healthBar.style.width = `${pct}%`;

    if (pct > 50) {
      this.healthBar.style.backgroundColor = '#4caf50';
    } else if (pct > 25) {
      this.healthBar.style.backgroundColor = '#ff9800';
    } else {
      this.healthBar.style.backgroundColor = '#f44336';
    }

    // Ghost bar: freeze at old value when HP drops, then decay after a delay.
    if (pct < this._lastHealthPct && this.healthGhost) {
      // Snap ghost to old value without CSS transition (remove transition temporarily).
      this.healthGhost.style.transition = 'none';
      this.healthGhost.style.width = `${this._lastHealthPct}%`;

      clearTimeout(this._ghostTimer);
      this._ghostTimer = setTimeout(() => {
        if (!this.healthGhost) return;
        // Re-enable transition before setting new width so the decay animates.
        this.healthGhost.style.transition = 'width 0.75s ease-out';
        this.healthGhost.style.width = `${pct}%`;
      }, 450);
    } else if (pct > this._lastHealthPct && this.healthGhost) {
      // Healed up — snap ghost to match immediately (no ghost on heal).
      clearTimeout(this._ghostTimer);
      this.healthGhost.style.transition = 'none';
      this.healthGhost.style.width = `${pct}%`;
    }

    this._lastHealthPct = pct;
  }

  /**
   * Flash the screen red to signal that the player took damage.
   *
   * Safe to call multiple times in quick succession — each call resets the
   * fade-out timer so rapid hits produce a consistent flash, not a blink.
   */
  flashDamage() {
    if (!this.damageFlashEl) return;
    this.damageFlashEl.style.opacity = '1';
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => {
      if (this.damageFlashEl) this.damageFlashEl.style.opacity = '0';
    }, 80);
  }

  // -------------------------------------------------------------------------

  showGameOver(score) {
    this.finalScoreEl.textContent = score;
    this.gameOverEl.classList.remove('hidden');
  }

  hideGameOver() {
    this.gameOverEl.classList.add('hidden');
  }
}
