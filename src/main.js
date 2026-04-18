import { Game } from './core/Game.js';

const canvas = document.getElementById('game-canvas');
const game = new Game(canvas);

// Show LoadoutScreen on first load; start() will begin the game loop
// once the player hits "Deploy".
game.start();

// Prevent zoom on double-tap (mobile)
document.addEventListener('dblclick', (e) => e.preventDefault());
