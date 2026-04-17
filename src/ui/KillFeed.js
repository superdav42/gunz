/**
 * KillFeed — top-right corner overlay showing destruction messages.
 *
 * Usage:
 *   const kf = new KillFeed();
 *   kf.addMessage('Player', 'Enemy #3');  // → "Player destroyed Enemy #3"
 *
 * Features:
 *   - Auto-fades each entry after FADE_DELAY ms.
 *   - Caps the visible stack at MAX_MESSAGES; oldest entry removed first.
 *   - Color-coded: player names in green, enemy names in red.
 *   - clear() removes all entries (call on round reset).
 *
 * Requires a <div id="kill-feed"> in the HTML document.
 */

const MAX_MESSAGES = 5;
const FADE_DELAY = 3000;    // ms visible before fade begins
const FADE_DURATION = 500;  // ms for the CSS opacity transition

export class KillFeed {
  constructor() {
    this.el = document.getElementById('kill-feed');
    /** @type {number[]} setTimeout IDs so clear() can cancel pending fades. */
    this._timers = [];
  }

  /**
   * Add a destruction message to the feed.
   *
   * @param {string} killer — display name of the entity that scored the kill
   *   (e.g. 'Player', 'Enemy #2', 'Ally 3')
   * @param {string} victim — display name of the destroyed entity
   */
  addMessage(killer, victim) {
    if (!this.el) return;

    // Enforce stack cap — remove oldest entry if already at limit
    const entries = this.el.querySelectorAll('.kf-entry');
    if (entries.length >= MAX_MESSAGES) {
      entries[0].remove();
    }

    // Build entry element
    const entry = document.createElement('div');
    entry.className = 'kf-entry';

    const killerSpan = document.createElement('span');
    killerSpan.className = _nameClass(killer);
    killerSpan.textContent = killer;

    const verbSpan = document.createElement('span');
    verbSpan.className = 'kf-verb';
    verbSpan.textContent = ' destroyed ';

    const victimSpan = document.createElement('span');
    victimSpan.className = _nameClass(victim);
    victimSpan.textContent = victim;

    entry.appendChild(killerSpan);
    entry.appendChild(verbSpan);
    entry.appendChild(victimSpan);
    this.el.appendChild(entry);

    // Schedule fade-out then removal
    const faderId = setTimeout(() => {
      entry.classList.add('kf-fading');
      setTimeout(() => entry.remove(), FADE_DURATION);
    }, FADE_DELAY);

    this._timers.push(faderId);
  }

  /**
   * Remove all messages and cancel pending fade timers.
   * Call on round reset.
   */
  clear() {
    for (const id of this._timers) {
      clearTimeout(id);
    }
    this._timers = [];
    if (this.el) this.el.innerHTML = '';
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Map a display name to the appropriate CSS class for colour-coding.
 *
 * 'Player'       → green  (kf-player)
 * 'Ally …'       → green  (kf-player)
 * 'Enemy …'      → red    (kf-enemy)
 * anything else  → white  (kf-neutral)
 *
 * @param {string} name
 * @returns {string}
 */
function _nameClass(name) {
  if (name === 'Player' || name.startsWith('Ally')) return 'kf-player';
  if (name.startsWith('Enemy')) return 'kf-enemy';
  return 'kf-neutral';
}
