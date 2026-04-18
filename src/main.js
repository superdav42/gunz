import { Game } from './core/Game.js';

const canvas = document.getElementById('game-canvas');
const game = new Game(canvas);

// Show LoadoutScreen on first load; start() will begin the game loop
// once the player hits "Deploy".
game.start();

// Prevent zoom on double-tap (mobile)
document.addEventListener('dblclick', (e) => e.preventDefault());

// ── Music volume control (t057) ───────────────────────────────────────────────
// Wired after game.start() so game.music is available.
const musicBtn    = document.getElementById('music-vol-btn');
const musicPopup  = document.getElementById('music-vol-popup');
const musicSlider = document.getElementById('music-vol-slider');

if (musicBtn && musicPopup && musicSlider) {
  // Sync slider to the MusicSystem's persisted volume.
  const syncSlider = () => {
    const v = game.music.getMusicVolume();
    musicSlider.value = String(Math.round(v * 100));
    musicBtn.classList.toggle('muted', v === 0);
    musicBtn.title = v === 0 ? 'Music: off' : `Music: ${Math.round(v * 100)}%`;
  };
  syncSlider();

  // Toggle popup on button click.
  musicBtn.addEventListener('click', () => {
    musicPopup.classList.toggle('visible');
  });

  // Close popup when clicking elsewhere.
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#music-ctrl')) {
      musicPopup.classList.remove('visible');
    }
  }, true);

  // Update music volume as slider moves.
  musicSlider.addEventListener('input', () => {
    const v = parseInt(musicSlider.value, 10) / 100;
    game.music.setMusicVolume(v);
    musicBtn.classList.toggle('muted', v === 0);
    musicBtn.title = v === 0 ? 'Music: off' : `Music: ${Math.round(v * 100)}%`;
  });
}
