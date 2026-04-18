/**
 * MusicSystem — Howler.js-based music manager for GUNZ (t057).
 *
 * All music is synthesised procedurally at module load time as WAV data URLs.
 * No external audio files required.  Music tracks are kept separate from SFX
 * (SoundSystem) so volume can be controlled independently.
 *
 * Tracks
 * ──────
 *   menu    — calm ambient arpeggio loop for loadout/shop screens
 *   combat  — driving rhythmic loop for active match play
 *   victory — short ascending fanfare (one-shot, match won)
 *   defeat  — short descending phrase (one-shot, match lost)
 *
 * Public API
 * ──────────
 *   playMenu()               — crossfade to menu loop
 *   playCombat()             — crossfade to combat loop
 *   playVictory()            — play victory sting (stops current loop)
 *   playDefeat()             — play defeat sting (stops current loop)
 *   stopAll(fadeDuration?)   — fade out and stop all music
 *   setMusicVolume(0-1)      — music-only volume (persisted to localStorage)
 *   getMusicVolume()         — current music volume
 *   dispose()                — release all Howl instances
 */

import { Howl } from 'howler';

// ─── WAV synthesis helpers (independent of SoundSystem for module isolation) ──

const SR = 16_000; // 16 kHz sample rate

/**
 * Build a 16-bit mono WAV data URL.
 * @param {number}              duration  seconds
 * @param {(t: number) => number} fn      sample render, must return [-1, 1]
 * @returns {string}
 */
function _makeWavUrl(duration, fn) {
  const n   = Math.ceil(SR * duration);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const s = fn(i / SR);
    pcm[i]  = Math.round(Math.max(-1, Math.min(1, s)) * 32_767);
  }

  const buf = new ArrayBuffer(44 + n * 2);
  const dv  = new DataView(buf);
  const wr  = (off, str) => {
    for (let k = 0; k < str.length; k++) dv.setUint8(off + k, str.charCodeAt(k));
  };

  wr(0, 'RIFF');  dv.setUint32(4, 36 + n * 2, true);
  wr(8, 'WAVE');  wr(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, SR, true); dv.setUint32(28, SR * 2, true);
  dv.setUint16(32, 2, true);  dv.setUint16(34, 16, true);
  wr(36, 'data'); dv.setUint32(40, n * 2, true);

  const out = new Uint8Array(buf, 44);
  for (let i = 0; i < n; i++) {
    out[i * 2]     =  pcm[i] & 0xff;
    out[i * 2 + 1] = (pcm[i] >> 8) & 0xff;
  }

  const all = new Uint8Array(buf);
  let bin = '';
  for (const b of all) bin += String.fromCharCode(b);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

// ─── Note sequencer ───────────────────────────────────────────────────────────

/**
 * Render a sequence of pitched notes into a WAV.
 *
 * @param {number} duration  total clip duration in seconds
 * @param {Array<{start:number, freq:number, dur:number, vol?:number, harmonics?:boolean}>} notes
 * @returns {string}  WAV data URL
 */
function _renderNotes(duration, notes) {
  return _makeWavUrl(duration, (t) => {
    let sample = 0;
    for (const n of notes) {
      if (t < n.start || t >= n.start + n.dur) continue;
      const local = t - n.start;
      // Linear attack + exponential decay envelope
      const attack  = Math.min(0.04, n.dur * 0.1);
      const release = Math.min(0.15, n.dur * 0.3);
      let env;
      if (local < attack) {
        env = local / attack;
      } else if (local > n.dur - release) {
        env = (n.dur - local) / release;
      } else {
        env = 1.0;
      }
      env = Math.max(0, env);

      const vol = n.vol !== undefined ? n.vol : 0.5;
      const f   = n.freq;

      // Pure sine fundamental + optional soft harmonics for warmth
      let wave = Math.sin(2 * Math.PI * f * local);
      if (n.harmonics) {
        wave += Math.sin(2 * Math.PI * f * 2 * local) * 0.25;
        wave += Math.sin(2 * Math.PI * f * 3 * local) * 0.10;
        wave /= 1.35; // normalise
      }

      sample += wave * env * vol;
    }
    // Soft-clip with tanh to prevent harsh clipping if notes overlap
    return Math.tanh(sample);
  });
}

// ─── Note frequency table ─────────────────────────────────────────────────────

const N = {
  C3:  130.81, D3:  146.83, Eb3: 155.56, F3:  174.61, G3:  196.00,
  Ab3: 207.65, Bb3: 233.08,
  C4:  261.63, D4:  293.66, Eb4: 311.13, E4:  329.63, F4:  349.23,
  G4:  392.00, Ab4: 415.30, A4:  440.00, Bb4: 466.16, B4:  493.88,
  C5:  523.25, D5:  587.33, E5:  659.25, G5:  783.99,
};

// ─── Menu music loop ──────────────────────────────────────────────────────────
// Calm ambient arpeggio in C major.  8-second seamless loop at ~80 BPM.
// Pattern: ascending C-E-G-A-G-E + sustained bass + high shimmer notes.

const MENU_BEAT = 0.75; // seconds per beat at 80 BPM

const _MENU_ARPEGGIO = [
  // Main arpeggio line (ascending C-E-G-A)
  { start: 0.0 * MENU_BEAT, freq: N.C4, dur: 1.6 * MENU_BEAT, vol: 0.48 },
  { start: 1.5 * MENU_BEAT, freq: N.E4, dur: 1.6 * MENU_BEAT, vol: 0.45 },
  { start: 3.0 * MENU_BEAT, freq: N.G4, dur: 1.6 * MENU_BEAT, vol: 0.45 },
  { start: 4.5 * MENU_BEAT, freq: N.A4, dur: 1.6 * MENU_BEAT, vol: 0.45 },
  // Descent
  { start: 6.0 * MENU_BEAT, freq: N.G4, dur: 1.6 * MENU_BEAT, vol: 0.42 },
  { start: 7.5 * MENU_BEAT, freq: N.E4, dur: 1.8 * MENU_BEAT, vol: 0.40 },
  // Bass note underneath
  { start: 0.0 * MENU_BEAT, freq: N.C3, dur: 4.0 * MENU_BEAT, vol: 0.20 },
  { start: 4.5 * MENU_BEAT, freq: N.G3, dur: 4.0 * MENU_BEAT, vol: 0.18 },
  // High shimmer on alternate beats
  { start: 2.25 * MENU_BEAT, freq: N.C5, dur: 0.8 * MENU_BEAT, vol: 0.22 },
  { start: 5.25 * MENU_BEAT, freq: N.D5, dur: 0.8 * MENU_BEAT, vol: 0.20 },
];

const MENU_DURATION = 8 * MENU_BEAT; // ≈ 6.0 s loop

const _MENU_URL = _renderNotes(MENU_DURATION, _MENU_ARPEGGIO);

// ─── Combat music loop ────────────────────────────────────────────────────────
// Driving, tense loop in C minor at ~130 BPM.  8-second seamless loop.
// Two-voice texture: low bass pattern + higher counter-melody.

const CB = 60 / 130; // seconds per beat at 130 BPM

const _COMBAT_NOTES = (() => {
  const notes = [];
  // Bass pattern: C3 every beat with rhythmic accents
  const bassPat = [N.C3, N.C3, N.G3, N.C3, N.Bb3, N.C3, N.G3, N.Ab3];
  for (let i = 0; i < 8; i++) {
    notes.push({ start: i * CB, freq: bassPat[i], dur: CB * 0.85, vol: 0.38, harmonics: true });
  }
  // Counter melody (off-beat, higher register)
  const melPat = [N.Eb4, N.D4, N.C4, N.Bb3, N.C4, N.D4, N.Eb4, N.F4];
  for (let i = 0; i < 8; i++) {
    notes.push({ start: (i + 0.5) * CB, freq: melPat[i], dur: CB * 0.6, vol: 0.30 });
  }
  // Accent pulse every 2 beats (sub-bass rumble)
  for (let i = 0; i < 4; i++) {
    notes.push({ start: i * CB * 2, freq: N.C3 / 2, dur: CB * 0.5, vol: 0.22, harmonics: true });
  }
  return notes;
})();

const COMBAT_DURATION = 8 * CB; // ≈ 3.7 s loop (tight, punchy)

const _COMBAT_URL = _renderNotes(COMBAT_DURATION, _COMBAT_NOTES);

// ─── Victory sting ────────────────────────────────────────────────────────────
// Rising fanfare: C4 → E4 → G4 → C5 → E5, then a held chord.

const VB = 0.38; // seconds per note

const _VICTORY_NOTES = [
  { start: 0 * VB, freq: N.C4, dur: VB * 1.1, vol: 0.55, harmonics: true },
  { start: 1 * VB, freq: N.E4, dur: VB * 1.1, vol: 0.55, harmonics: true },
  { start: 2 * VB, freq: N.G4, dur: VB * 1.1, vol: 0.55, harmonics: true },
  { start: 3 * VB, freq: N.C5, dur: VB * 1.6, vol: 0.60, harmonics: true },
  { start: 4 * VB, freq: N.E5, dur: VB * 1.6, vol: 0.58, harmonics: true },
  // Held chord root (fade sustain)
  { start: 3 * VB, freq: N.G4, dur: VB * 2.4, vol: 0.30 },
  { start: 3 * VB, freq: N.C4, dur: VB * 2.4, vol: 0.25 },
];

const VICTORY_DURATION = 3.0;

const _VICTORY_URL = _renderNotes(VICTORY_DURATION, _VICTORY_NOTES);

// ─── Defeat sting ─────────────────────────────────────────────────────────────
// Slow descending minor phrase: C4 → Bb3 → Ab3 → G3.

const DB = 0.55; // seconds per note

const _DEFEAT_NOTES = [
  { start: 0 * DB, freq: N.C4,  dur: DB * 1.2, vol: 0.50, harmonics: true },
  { start: 1 * DB, freq: N.Bb3, dur: DB * 1.2, vol: 0.48, harmonics: true },
  { start: 2 * DB, freq: N.Ab3, dur: DB * 1.2, vol: 0.46, harmonics: true },
  { start: 3 * DB, freq: N.G3,  dur: DB * 2.0, vol: 0.44, harmonics: true },
  // Harmonised fifth underneath
  { start: 0 * DB, freq: N.G3,  dur: DB * 1.2, vol: 0.22 },
  { start: 1 * DB, freq: N.F3,  dur: DB * 1.2, vol: 0.20 },
  { start: 2 * DB, freq: N.Eb3, dur: DB * 1.2, vol: 0.20 },
  { start: 3 * DB, freq: N.D3,  dur: DB * 2.0, vol: 0.18 },
];

const DEFEAT_DURATION = 3.5;

const _DEFEAT_URL = _renderNotes(DEFEAT_DURATION, _DEFEAT_NOTES);

// ─── MusicSystem class ────────────────────────────────────────────────────────

const STORAGE_KEY = 'gunz_music_volume';
const FADE_MS     = 800; // default crossfade duration in ms

export class MusicSystem {
  constructor() {
    /** Current music volume [0-1].  Loaded from localStorage. */
    this._volume = this._loadVolume();

    this._menu = new Howl({
      src:    [_MENU_URL],
      loop:   true,
      volume: 0,
    });

    this._combat = new Howl({
      src:    [_COMBAT_URL],
      loop:   true,
      volume: 0,
    });

    this._victory = new Howl({
      src:    [_VICTORY_URL],
      loop:   false,
      volume: this._volume,
    });

    this._defeat = new Howl({
      src:    [_DEFEAT_URL],
      loop:   false,
      volume: this._volume,
    });

    /** Which loop is currently playing: 'menu' | 'combat' | null */
    this._activeLoop = null;

    /** Howl sound IDs for the active looping tracks. */
    this._menuId   = null;
    this._combatId = null;
  }

  // ─── Volume ──────────────────────────────────────────────────────────────

  /**
   * Set music volume independently of SFX.
   * @param {number} v  0 (silent) – 1 (full)
   */
  setMusicVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    this._persist();

    // Apply immediately to whatever is currently playing.
    if (this._activeLoop === 'menu' && this._menuId !== null) {
      this._menu.volume(this._volume, this._menuId);
    } else if (this._activeLoop === 'combat' && this._combatId !== null) {
      this._combat.volume(this._volume, this._combatId);
    }

    this._victory.volume(this._volume);
    this._defeat.volume(this._volume);
  }

  /** @returns {number} Current music volume [0-1]. */
  getMusicVolume() {
    return this._volume;
  }

  // ─── Track control ───────────────────────────────────────────────────────

  /**
   * Crossfade to the menu loop.
   * Safe to call when menu is already playing (no-op).
   */
  playMenu() {
    if (this._activeLoop === 'menu') return;
    this._fadeOutActive();
    this._activeLoop = 'menu';
    this._menuId     = this._menu.play();
    this._menu.fade(0, this._volume, FADE_MS, this._menuId);
  }

  /**
   * Crossfade to the combat loop.
   * Safe to call when combat is already playing (no-op).
   */
  playCombat() {
    if (this._activeLoop === 'combat') return;
    this._fadeOutActive();
    this._activeLoop = 'combat';
    this._combatId   = this._combat.play();
    this._combat.fade(0, this._volume, FADE_MS, this._combatId);
  }

  /**
   * Stop all loops and play the victory sting once.
   */
  playVictory() {
    this._fadeOutActive(300);
    this._victory.volume(this._volume);
    this._victory.play();
  }

  /**
   * Stop all loops and play the defeat sting once.
   */
  playDefeat() {
    this._fadeOutActive(300);
    this._defeat.volume(this._volume);
    this._defeat.play();
  }

  /**
   * Fade out and stop all music.
   * @param {number} [fadeDuration=FADE_MS]  fade time in ms
   */
  stopAll(fadeDuration = FADE_MS) {
    this._fadeOutActive(fadeDuration);
    this._victory.stop();
    this._defeat.stop();
  }

  // ─── Dispose ─────────────────────────────────────────────────────────────

  /** Release all Howl instances. */
  dispose() {
    this._menu.unload();
    this._combat.unload();
    this._victory.unload();
    this._defeat.unload();
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  /**
   * Fade out whichever loop is currently active.
   * @param {number} [ms=FADE_MS]
   * @private
   */
  _fadeOutActive(ms = FADE_MS) {
    if (this._activeLoop === 'menu' && this._menuId !== null) {
      const id = this._menuId;
      this._menu.fade(this._menu.volume(id), 0, ms, id);
      setTimeout(() => this._menu.stop(id), ms + 50);
      this._menuId = null;
    } else if (this._activeLoop === 'combat' && this._combatId !== null) {
      const id = this._combatId;
      this._combat.fade(this._combat.volume(id), 0, ms, id);
      setTimeout(() => this._combat.stop(id), ms + 50);
      this._combatId = null;
    }
    this._activeLoop = null;
  }

  /**
   * Load saved music volume from localStorage.  Defaults to 0.4.
   * @returns {number}
   * @private
   */
  _loadVolume() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null) {
        const v = parseFloat(raw);
        if (!isNaN(v)) return Math.max(0, Math.min(1, v));
      }
    } catch (_) {
      // localStorage unavailable (private browsing, etc.)
    }
    return 0.4;
  }

  /**
   * Persist current music volume to localStorage.
   * @private
   */
  _persist() {
    try {
      localStorage.setItem(STORAGE_KEY, String(this._volume));
    } catch (_) {
      // ignore quota errors
    }
  }
}
