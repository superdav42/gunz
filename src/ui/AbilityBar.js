/**
 * AbilityBar — HUD element showing two ability icons with radial cooldown fill.
 *
 * Layout (bottom-centre of screen, from index.html #ability-bar):
 *   [ Tank Ability ]  [ Weapon Ability ]
 *
 * Each slot renders:
 *   - SVG ring: partial arc fill that grows as the cooldown recharges.
 *     Uses the stroke-dashoffset technique so the arc sweeps clockwise
 *     from the 12 o'clock position.
 *   - Ability label: short name (e.g. "SHIELD", "LOCK-ON").
 *   - Countdown text: seconds remaining when on cooldown, empty when ready.
 *   - "Q" key hint: glows when the slot is ready to activate.
 *   - Slot type tag: "TANK" or "WEP" below each icon.
 *
 * Slot 0 = tank ability, Slot 1 = weapon ability.
 * Empty slots (no ability on the equipped item) are shown dimmed with "—".
 *
 * Reads state from AbilitySystem (t042) via its public getters:
 *   tankAbilityId, weaponAbilityId, tankReady, weaponReady,
 *   tankCooldownFraction (0=ready, 1=full), tankCooldownRemaining (seconds).
 */

/** Short display labels that fit inside the 64px icon ring. */
const ABILITY_LABELS = {
  infernoBurst:  'INFERNO',
  energyShield:  'SHIELD',
  rocketJump:    'JUMP',
  lockdownMode:  'LOCKDOWN',
  barrage:       'BARRAGE',
  reactiveArmor: 'ARMOR',
  clusterBomb:   'CLUSTER',
  lockOn:        'LOCK-ON',
  overcharge:    'OVRCHRG',
  novaBlast:     'NOVA',
  dashStrike:    'DASH',
};

export class AbilityBar {
  constructor() {
    this.el = document.getElementById('ability-bar');
    if (!this.el) {
      console.warn('[AbilityBar] #ability-bar element not found in DOM.');
      return;
    }

    // Cache per-slot DOM references for fast per-frame updates.
    this._slots = [0, 1].map(i => this._cacheSlot(i));
  }

  /**
   * Update both icon slots from AbilitySystem state.
   * Called every frame from Game._loop().
   *
   * @param {import('../systems/AbilitySystem.js').AbilitySystem} abilitySystem
   */
  update(abilitySystem) {
    if (!this.el) return;

    // Slot 0: tank ability
    this._updateSlot(this._slots[0], {
      id:              abilitySystem.tankAbilityId,
      ready:           abilitySystem.tankReady,
      cooldownFrac:    abilitySystem.tankCooldownFraction,
      cooldownSeconds: abilitySystem.tankCooldownRemaining,
    });

    // Slot 1: weapon ability
    this._updateSlot(this._slots[1], {
      id:              abilitySystem.weaponAbilityId,
      ready:           abilitySystem.weaponReady,
      cooldownFrac:    abilitySystem.weaponCooldownFraction,
      cooldownSeconds: abilitySystem.weaponCooldownRemaining,
    });
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  /**
   * Cache DOM element references for one slot.
   * @param {number} index
   * @returns {object}
   */
  _cacheSlot(index) {
    const container = this.el.querySelector(`[data-ability-slot="${index}"]`);
    if (!container) {
      console.warn(`[AbilityBar] data-ability-slot="${index}" not found.`);
      return {};
    }
    return {
      container,
      arc:       container.querySelector('.ab-arc'),
      label:     container.querySelector('.ab-label'),
      countdown: container.querySelector('.ab-countdown'),
      keyHint:   container.querySelector('.ab-key-hint'),
    };
  }

  /**
   * Refresh one slot's visuals.
   *
   * @param {object} ui        — cached DOM refs from _cacheSlot
   * @param {object} slotData
   * @param {string|null} slotData.id              — ability identifier
   * @param {boolean}     slotData.ready           — true when off cooldown
   * @param {number}      slotData.cooldownFrac    — 0=ready, 1=just activated
   * @param {number}      slotData.cooldownSeconds — seconds remaining
   */
  _updateSlot(ui, slotData) {
    if (!ui.container) return;

    if (!slotData.id) {
      // Empty slot — no ability on this item
      ui.container.classList.add('ab-slot-empty');
      ui.container.classList.remove('ab-slot-ready');
      if (ui.label)     ui.label.textContent     = '—';
      if (ui.countdown) ui.countdown.textContent = '';
      if (ui.keyHint)   ui.keyHint.style.opacity = '0';
      this._setArc(ui.arc, 1); // full ring in dim colour
      return;
    }

    ui.container.classList.remove('ab-slot-empty');
    if (ui.label) {
      ui.label.textContent = ABILITY_LABELS[slotData.id] || slotData.id.toUpperCase().slice(0, 8);
    }

    if (slotData.ready) {
      ui.container.classList.add('ab-slot-ready');
      if (ui.countdown) ui.countdown.textContent = '';
      if (ui.keyHint)   ui.keyHint.style.opacity = '1';
      this._setArc(ui.arc, 1); // full arc in green
    } else {
      ui.container.classList.remove('ab-slot-ready');
      const secs = Math.ceil(slotData.cooldownSeconds);
      if (ui.countdown) ui.countdown.textContent = secs > 0 ? secs + 's' : '';
      if (ui.keyHint)   ui.keyHint.style.opacity = '0';
      // cooldownFrac: 0=ready → arc full; 1=just activated → arc empty
      // Arc fill = 1 - cooldownFrac
      this._setArc(ui.arc, 1 - slotData.cooldownFrac);
    }
  }

  /**
   * Set the radial arc fill amount via SVG stroke-dashoffset.
   *
   * The SVG circle has r="26". Circumference = 2π × 26 ≈ 163.36.
   * progress=0 → arc is empty (full offset = circumference).
   * progress=1 → arc is full  (offset = 0).
   *
   * @param {SVGCircleElement|null} arcEl
   * @param {number} progress  0..1
   */
  _setArc(arcEl, progress) {
    if (!arcEl) return;
    const r    = 26;
    const circ = 2 * Math.PI * r;
    arcEl.style.strokeDasharray  = circ;
    arcEl.style.strokeDashoffset = circ * (1 - progress);
  }
}
