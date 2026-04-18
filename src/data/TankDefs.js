/**
 * TankDefs.js — Static definitions for all 8 tank classes.
 *
 * Each entry is keyed by a stable ID string used throughout the codebase.
 * Stats reflect VISION.md tables. All values are base (tier-0, no upgrades).
 *
 * leagueRequired: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'
 * price:          USD cost in the shop (0 = free / starter).
 * hp:             Base max hit points.
 * armor:          Damage reduction fraction (0 = no reduction, 0.3 = 30% reduction).
 * speed:          World-units per second, forward movement.
 * turnRate:       Radians per second, hull rotation.
 * damage:         Base damage per shell hit (before target armor reduction).
 * fireRate:       Shots per second.
 * range:          Maximum effective range in world units.
 * ability:        Identifier for the tank's special ability (null if none).
 * abilityCooldown: Seconds between ability uses (0 if no ability).
 */
export const TankDefs = {
  standard: {
    id: 'standard',
    name: 'Standard',
    description: 'Balanced all-rounder. The starter tank — no extreme stats, reliable in any situation.',
    price: 0,
    leagueRequired: 'bronze',
    hp: 100,
    armor: 0.10,
    speed: 12,
    turnRate: 1.2,
    damage: 25,
    fireRate: 0.9,      // shots per second
    range: 80,
    ability: null,
    abilityCooldown: 0,
    colorBody: 0x2d5a27,
    colorTurret: 0x3a7a33,
    // Visual scale relative to default mesh (1 = no change)
    scaleHull: 1.0,
  },

  scout: {
    id: 'scout',
    name: 'Scout',
    description: 'Light, fast, weak armor. Rapid-fire small cannon. Best at flanking and hit-and-run.',
    price: 2000,
    leagueRequired: 'bronze',
    hp: 60,
    armor: 0.0,
    speed: 20,
    turnRate: 1.8,
    damage: 14,
    fireRate: 2.0,      // rapid-fire
    range: 60,
    ability: null,
    abilityCooldown: 0,
    colorBody: 0x6b8e23,
    colorTurret: 0x8fbc8f,
    scaleHull: 0.75,
  },

  heavy: {
    id: 'heavy',
    name: 'Heavy',
    description: 'Slow, thick armor, big cannon. Highest damage per shot but longest reload.',
    price: 5000,
    leagueRequired: 'silver',
    hp: 200,
    armor: 0.30,
    speed: 7,
    turnRate: 0.7,
    damage: 60,
    fireRate: 0.4,      // slow reload
    range: 90,
    ability: 'reactiveArmor',
    abilityCooldown: 20,
    colorBody: 0x4a3728,
    colorTurret: 0x5c4a3a,
    scaleHull: 1.35,
  },

  artillery: {
    id: 'artillery',
    name: 'Artillery',
    description: 'Very long range, arc shots. Paper-thin armor. Devastating from a distance.',
    price: 5000,
    leagueRequired: 'silver',
    hp: 40,
    armor: 0.0,
    speed: 6,
    turnRate: 0.6,
    damage: 80,
    fireRate: 0.25,     // very slow reload
    range: 200,         // extreme range
    ability: 'barrage',
    abilityCooldown: 30,
    colorBody: 0x7a6a3a,
    colorTurret: 0x9a8a5a,
    scaleHull: 1.1,
  },

  flameTank: {
    id: 'flameTank',
    name: 'Flame Tank',
    description: 'Short-range flamethrower. Strong vs groups. Has Inferno Burst ability.',
    price: 8000,
    leagueRequired: 'gold',
    hp: 120,
    armor: 0.15,
    speed: 10,
    turnRate: 1.0,
    damage: 18,         // per-tick damage while in flamethrower cone
    fireRate: 10,       // continuous (ticks per second)
    range: 20,          // short range only
    ability: 'infernoBurst',
    abilityCooldown: 20,
    colorBody: 0x8b1a00,
    colorTurret: 0xcc3300,
    scaleHull: 1.05,
  },

  shieldTank: {
    id: 'shieldTank',
    name: 'Shield Tank',
    description: 'Medium speed, medium armor. Has Energy Shield ability — blocks all incoming fire for 5s.',
    price: 15000,
    leagueRequired: 'platinum',
    hp: 150,
    armor: 0.20,
    speed: 11,
    turnRate: 1.0,
    damage: 28,
    fireRate: 0.8,
    range: 85,
    ability: 'energyShield',
    abilityCooldown: 25,
    colorBody: 0x1a3a8b,
    colorTurret: 0x2255cc,
    scaleHull: 1.15,
  },

  jumpTank: {
    id: 'jumpTank',
    name: 'Jump Tank',
    description: 'Light-medium armor. Has Rocket Jump — launches into air, lands with area damage.',
    price: 15000,
    leagueRequired: 'platinum',
    hp: 100,
    armor: 0.12,
    speed: 14,
    turnRate: 1.3,
    damage: 25,
    fireRate: 0.9,
    range: 80,
    ability: 'rocketJump',
    abilityCooldown: 15,
    colorBody: 0x2a5a8b,
    colorTurret: 0x3a7ab0,
    scaleHull: 0.95,
  },

  siegeTank: {
    id: 'siegeTank',
    name: 'Siege Tank',
    description: 'Heavy armor, powerful cannon. Has Lockdown Mode — stationary but doubles fire rate and range for 8s.',
    price: 25000,
    leagueRequired: 'diamond',
    hp: 250,
    armor: 0.35,
    speed: 5,
    turnRate: 0.5,
    damage: 90,
    fireRate: 0.35,
    range: 110,
    ability: 'lockdownMode',
    abilityCooldown: 20,
    colorBody: 0x3a2a1a,
    colorTurret: 0x5a4030,
    scaleHull: 1.5,
  },
};

/**
 * Ordered array of tank IDs for shop display order.
 */
export const TANK_ORDER = [
  'standard',
  'scout',
  'heavy',
  'artillery',
  'flameTank',
  'shieldTank',
  'jumpTank',
  'siegeTank',
];

/**
 * Return a tank definition by id. Throws if the id is unknown.
 * @param {string} id
 * @returns {object}
 */
export function getTankDef(id) {
  const def = TankDefs[id];
  if (!def) {
    throw new Error(`Unknown tank id: "${id}"`);
  }
  return def;
}
