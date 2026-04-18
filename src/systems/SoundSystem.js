/**
 * SoundSystem — Howler.js-based audio manager for GUNZ.
 *
 * All audio data is synthesised procedurally at module load time and
 * encoded as WAV data URLs, so no external audio files are required.
 * Howler.js handles cross-browser audio context management, looping,
 * rate/volume control, and the user-gesture unlock flow automatically.
 *
 * Sounds
 * ──────
 *   cannon    — low-frequency thud + crack (tank fire)
 *   explosion — rumble + noise decay (tank destroyed / heavy blast)
 *   impact    — sharp thud (shell hit, non-lethal)
 *   engine    — loopable low-frequency rumble (player tank movement)
 *   uiClick   — short sine-click (UI buttons)
 *
 * Public API
 * ──────────
 *   playShot()            — cannon fire (player or AI)
 *   playExplosion()       — tank destroyed / large blast
 *   playImpact()          — shell impact, non-lethal
 *   startEngine()         — begin looping engine sound
 *   stopEngine()          — fade out engine sound
 *   setEngineRate(0-1)    — vary pitch by throttle (0 = idle, 1 = full)
 *   playUIClick()         — short UI click
 *   setMasterVolume(0-1)  — global volume (default 0.6)
 *   update(dt)            — drain per-frame timers (call once per frame)
 *   dispose()             — stop all sounds and release AudioContext
 */

import { Howl, Howler } from 'howler';

// ─── WAV synthesis helpers ───────────────────────────────────────────────────

/** Sample rate for all synthesised sounds (16 kHz — good enough for SFX). */
const SR = 16_000;

/**
 * Fast linear-congruential PRNG so synthesised noise is deterministic across
 * reloads and doesn't steal entropy from Math.random().
 */
let _seed = 0x9e3779b9;
function _rand() {
  _seed = (Math.imul(1_664_525, _seed) + 1_013_904_223) >>> 0;
  return (_seed / 0xffff_ffff) * 2 - 1; // returns [-1, 1)
}

/**
 * Build a 16-bit mono WAV data URL.
 *
 * @param {number}              duration  seconds
 * @param {(t: number) => number} fn      sample render — must return values in [-1, 1]
 * @returns {string}  "data:audio/wav;base64,…"
 */
function _makeWavUrl(duration, fn) {
  const n   = Math.ceil(SR * duration);
  const pcm = new Int16Array(n);

  for (let i = 0; i < n; i++) {
    const t    = i / SR;
    const s    = fn(t);
    pcm[i]     = Math.round(Math.max(-1, Math.min(1, s)) * 32_767);
  }

  // 44-byte RIFF/WAV header + PCM data
  const buf = new ArrayBuffer(44 + n * 2);
  const dv  = new DataView(buf);

  const wr = (offset, str) => {
    for (let k = 0; k < str.length; k++) dv.setUint8(offset + k, str.charCodeAt(k));
  };

  wr(0,  'RIFF');
  dv.setUint32(4,  36 + n * 2, true); // file size - 8
  wr(8,  'WAVE');
  wr(12, 'fmt ');
  dv.setUint32(16, 16,      true);    // chunk size
  dv.setUint16(20,  1,      true);    // PCM = 1
  dv.setUint16(22,  1,      true);    // mono
  dv.setUint32(24, SR,      true);    // sample rate
  dv.setUint32(28, SR * 2,  true);    // byte rate
  dv.setUint16(32,  2,      true);    // block align
  dv.setUint16(34, 16,      true);    // bits per sample
  wr(36, 'data');
  dv.setUint32(40, n * 2, true);

  // Write PCM into the buffer after the header
  const out = new Uint8Array(buf, 44);
  for (let i = 0; i < n; i++) {
    const v    = pcm[i];
    out[i * 2]     = v & 0xff;
    out[i * 2 + 1] = (v >> 8) & 0xff;
  }

  // base64-encode the full WAV file
  const all = new Uint8Array(buf);
  let bin = '';
  for (const b of all) bin += String.fromCharCode(b);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

// ─── Synthesised sound data URLs ─────────────────────────────────────────────
// Generated once at module load time. Generation is synchronous and takes
// ~5-20 ms total — acceptable for a game startup sequence.

/** Cannon fire: low-frequency thud, muzzle crack, decaying noise (0.55 s). */
const _CANNON_URL = _makeWavUrl(0.55, (t) => {
  const env   = Math.exp(-t * 14);
  const thud  = Math.sin(2 * Math.PI * 85  * t) * env;
  const crack = Math.sin(2 * Math.PI * 380 * t) * Math.exp(-t * 32) * 0.4;
  const noise = _rand() * env * 0.45;
  return (thud + crack + noise) * 0.75;
});

/** Explosion: rumble + broadband noise, 2-second decay. */
const _EXPLOSION_URL = _makeWavUrl(2.0, (t) => {
  const env    = Math.exp(-t * 2.2);
  const rumble = Math.sin(2 * Math.PI * 42 * t) * env * 0.5;
  const noise  = _rand() * env * 0.9;
  const wobble = Math.sin(2 * Math.PI * 6  * t) * 0.08;
  return (rumble + noise + wobble) * 0.9;
});

/** Shell impact (non-lethal): short metallic thud (0.3 s). */
const _IMPACT_URL = _makeWavUrl(0.3, (t) => {
  const env  = Math.exp(-t * 18);
  const thud = Math.sin(2 * Math.PI * 130 * t) * env * 0.7;
  const hiss = _rand() * env * 0.35;
  return (thud + hiss) * 0.8;
});

/**
 * Engine loop: three harmonics of 68 Hz + gentle noise.
 * Exactly 1 second — Howler.js loops it seamlessly.
 */
const _ENGINE_URL = _makeWavUrl(1.0, (t) => {
  const f = 68;
  return (
    Math.sin(2 * Math.PI * f       * t) * 0.45 +
    Math.sin(2 * Math.PI * f * 2   * t) * 0.20 +
    Math.sin(2 * Math.PI * f * 3   * t) * 0.10 +
    _rand() * 0.06
  );
});

/** UI click: short 850 Hz sine burst (0.12 s). */
const _UI_CLICK_URL = _makeWavUrl(0.12, (t) => {
  const env = Math.exp(-t * 45);
  return Math.sin(2 * Math.PI * 850 * t) * env * 0.65;
});

// ─── SoundSystem class ───────────────────────────────────────────────────────

export class SoundSystem {
  constructor() {
    /** Master enable flag — set false to silence all sounds without teardown. */
    this.enabled = true;

    /**
     * Per-frame shot cooldown (seconds). Prevents rapid cannon stacking when
     * multiple shots fire in close succession (e.g., shotgun pellets).
     */
    this._shotCooldown = 0;

    // Set global master volume before creating any Howl instances.
    Howler.volume(0.6);

    this._shot = new Howl({
      src:     [_CANNON_URL],
      volume:  0.9,
      preload: true,
    });

    this._explosion = new Howl({
      src:     [_EXPLOSION_URL],
      volume:  1.0,
      preload: true,
    });

    this._impact = new Howl({
      src:     [_IMPACT_URL],
      volume:  0.55,
      preload: true,
    });

    this._engine = new Howl({
      src:     [_ENGINE_URL],
      loop:    true,
      volume:  0,     // silent until startEngine() fades it in
      preload: true,
    });

    this._uiClick = new Howl({
      src:     [_UI_CLICK_URL],
      volume:  0.5,
      preload: true,
    });

    /** Active Howl sound ID for the looping engine track. */
    this._engineId      = null;
    this._engineRunning = false;
  }

  // ─── Per-frame update ───────────────────────────────────────────────────

  /**
   * Drain per-frame timers.  Call once per game frame with the frame delta.
   * @param {number} dt  seconds since last frame
   */
  update(dt) {
    if (this._shotCooldown > 0) this._shotCooldown -= dt;
  }

  // ─── Cannon fire ────────────────────────────────────────────────────────

  /**
   * Play cannon fire sound.
   * Rate-limited to 80 ms minimum gap so simultaneous multi-projectile weapons
   * (e.g., shotgun) produce one crisp shot rather than a wall of noise.
   */
  playShot() {
    if (!this.enabled)           return;
    if (this._shotCooldown > 0)  return;
    this._shotCooldown = 0.08;
    this._shot.play();
  }

  // ─── Explosion ──────────────────────────────────────────────────────────

  /** Play explosion sound — tank destroyed or large explosive blast. */
  playExplosion() {
    if (!this.enabled) return;
    this._explosion.play();
  }

  // ─── Impact ─────────────────────────────────────────────────────────────

  /**
   * Play shell-impact sound (non-lethal hit).
   * Only one concurrent impact plays at a time to avoid stacking when many
   * shells land simultaneously.
   */
  playImpact() {
    if (!this.enabled)             return;
    if (this._impact.playing())    return; // deduplicate concurrent hits
    this._impact.play();
  }

  // ─── Engine loop ────────────────────────────────────────────────────────

  /**
   * Begin the looping engine sound with a 400 ms fade-in.
   * Safe to call when the engine is already running — subsequent calls are
   * ignored.
   */
  startEngine() {
    if (!this.enabled || this._engineRunning) return;
    this._engineRunning = true;
    this._engineId      = this._engine.play();
    this._engine.fade(0, 0.35, 400, this._engineId);
  }

  /**
   * Fade out and stop the engine sound over 300 ms.
   * Safe to call when the engine is already stopped.
   */
  stopEngine() {
    if (!this._engineRunning) return;
    this._engineRunning = false;

    // Capture ID so the delayed stop matches the current play-through.
    const id = this._engineId;
    this._engine.fade(this._engine.volume(id), 0, 300, id);

    setTimeout(() => {
      // Guard: don't stop if startEngine() was called again during the fade.
      if (!this._engineRunning) this._engine.stop(id);
    }, 350);
  }

  /**
   * Adjust engine pitch to convey throttle / speed.
   * @param {number} rate  0 = idle (low pitch), 1 = full throttle (high pitch)
   */
  setEngineRate(rate) {
    if (!this._engineRunning || this._engineId === null) return;
    const clamped = Math.max(0, Math.min(1, rate));
    // Map 0-1 to playback rate 0.65-1.45 (just under an octave range).
    this._engine.rate(0.65 + clamped * 0.80, this._engineId);
  }

  // ─── UI sounds ──────────────────────────────────────────────────────────

  /** Play a short click for UI button interactions. */
  playUIClick() {
    if (!this.enabled) return;
    this._uiClick.play();
  }

  /**
   * Attach click-sound listeners to all current and future DOM buttons.
   * Useful when the SoundSystem is not directly passed to each UI class.
   *
   * Listening on `document` with `{ capture: true }` ensures the click is
   * heard even if a child handler calls stopPropagation().
   */
  bindUIClicks() {
    this._uiClickHandler = (e) => {
      const el = e.target;
      if (
        el instanceof HTMLButtonElement ||
        el.classList.contains('shop-tab') ||
        el.classList.contains('loadout-option') ||
        el.classList.contains('upgrade-btn')
      ) {
        this.playUIClick();
      }
    };
    document.addEventListener('click', this._uiClickHandler, { capture: true });
  }

  // ─── Master volume ──────────────────────────────────────────────────────

  /**
   * Set global master volume.
   * @param {number} v  0 (silent) – 1 (full volume)
   */
  setMasterVolume(v) {
    Howler.volume(Math.max(0, Math.min(1, v)));
  }

  // ─── Dispose ────────────────────────────────────────────────────────────

  /** Stop all sounds and release the Howler audio context. */
  dispose() {
    if (this._uiClickHandler) {
      document.removeEventListener('click', this._uiClickHandler, { capture: true });
    }
    this._engine.stop();
    Howler.unload();
  }
}
