import { Game } from './core/Game.js';

const canvas = document.getElementById('game-canvas');
const game = new Game(canvas);

// Wire enemy fire into projectile system
game.enemies.onFire((projectile) => {
  game.projectiles.add(projectile);
});

// Start
game.start();

// Restart button
document.getElementById('restart-btn').addEventListener('click', () => {
  game.restart();
});

// Prevent zoom on double-tap (mobile)
document.addEventListener('dblclick', (e) => e.preventDefault());
