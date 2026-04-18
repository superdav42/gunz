/**
 * WeaponDefs.js — Static definitions for all on-foot weapons.
 *
 * Two categories:
 *   GUN_DEFS   — primary ranged weapons (pistol through plasma cannon)
 *   MELEE_DEFS — melee weapons (knife through energy blade)
 *
 * Stat reference:
 *   damage:       Damage per hit (guns: per bullet/shell; melee: per swing).
 *   fireRate:     Shots per second (guns only).
 *   range:        Effective range in world units. Melee values are close-range (≤ 3 m).
 *   clipSize:     Rounds before reload is needed.
 *   reloadTime:   Seconds to complete a reload.
 *   spread:       Inaccuracy cone half-angle in degrees at default range.
 *   projectileSpeed: World-units per second (0 = instant/hitscan).
 *   splashRadius: AoE damage radius in world units (0 = point damage only).
 *   chargeTime:   Seconds to hold fire for max damage (0 = instant).
 *   ability:      Special ability identifier (null if none).
 *   abilityCooldown: Seconds between ability uses.
 *   isExplosive:  true = triggers splash / arc trajectory.
 *   isArc:        true = projectile follows ballistic arc (grenade launcher).
 *   leagueRequired: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'
 *   price:        Shop cost in $. 0 = free starter weapon.
 */

// ---------------------------------------------------------------------------
// Guns (primary ranged weapons)
// ---------------------------------------------------------------------------
export const GunDefs = {
  pistol: {
    id: 'pistol',
    name: 'Pistol',
    type: 'gun',
    description: 'Starter sidearm. Low damage, decent fire rate. Always available.',
    price: 0,
    leagueRequired: 'bronze',
    damage: 12,
    fireRate: 2.0,
    range: 40,
    clipSize: 12,
    reloadTime: 1.2,
    spread: 5,
    projectileSpeed: 80,
    splashRadius: 0,
    chargeTime: 0,
    isExplosive: false,
    isArc: false,
    ability: null,
    abilityCooldown: 0,
  },

  smg: {
    id: 'smg',
    name: 'SMG',
    type: 'gun',
    description: 'Fast fire rate, low accuracy at range. Effective up close.',
    price: 1500,
    leagueRequired: 'bronze',
    damage: 9,
    fireRate: 5.0,
    range: 25,
    clipSize: 30,
    reloadTime: 1.6,
    spread: 10,
    projectileSpeed: 90,
    splashRadius: 0,
    chargeTime: 0,
    isExplosive: false,
    isArc: false,
    ability: null,
    abilityCooldown: 0,
  },

  assaultRifle: {
    id: 'assaultRifle',
    name: 'Assault Rifle',
    type: 'gun',
    description: 'Balanced damage and fire rate. The workhorse weapon for Silver+ players.',
    price: 3000,
    leagueRequired: 'silver',
    damage: 18,
    fireRate: 3.0,
    range: 60,
    clipSize: 25,
    reloadTime: 1.8,
    spread: 4,
    projectileSpeed: 100,
    splashRadius: 0,
    chargeTime: 0,
    isExplosive: false,
    isArc: false,
    ability: null,
    abilityCooldown: 0,
  },

  sniperRifle: {
    id: 'sniperRifle',
    name: 'Sniper Rifle',
    type: 'gun',
    description: 'High damage, slow fire, very long range. Must stand still to use effectively.',
    price: 4500,
    leagueRequired: 'silver',
    damage: 60,
    fireRate: 0.5,
    range: 200,
    clipSize: 5,
    reloadTime: 2.5,
    spread: 0.5,
    projectileSpeed: 300,   // fast, near-instant
    splashRadius: 0,
    chargeTime: 0,
    isExplosive: false,
    isArc: false,
    ability: null,
    abilityCooldown: 0,
  },

  shotgun: {
    id: 'shotgun',
    name: 'Shotgun',
    type: 'gun',
    description: 'Devastating up close with spread pellets, useless at range.',
    price: 3500,
    leagueRequired: 'silver',
    damage: 15,             // per pellet (fires 8 pellets per shot)
    fireRate: 1.0,
    range: 15,
    clipSize: 8,
    reloadTime: 2.0,
    spread: 20,
    projectileSpeed: 70,
    splashRadius: 0,
    chargeTime: 0,
    isExplosive: false,
    isArc: false,
    pelletsPerShot: 8,      // shotgun-specific
    ability: null,
    abilityCooldown: 0,
  },

  grenadeLauncher: {
    id: 'grenadeLauncher',
    name: 'Grenade Launcher',
    type: 'gun',
    description: 'Area damage on impact, arc trajectory, slow reload. Cluster Bomb ability.',
    price: 6000,
    leagueRequired: 'gold',
    damage: 55,
    fireRate: 0.6,
    range: 70,
    clipSize: 6,
    reloadTime: 3.0,
    spread: 2,
    projectileSpeed: 30,    // slow arc
    splashRadius: 6,
    chargeTime: 0,
    isExplosive: true,
    isArc: true,
    ability: 'clusterBomb',
    abilityCooldown: 18,
  },

  rocketLauncher: {
    id: 'rocketLauncher',
    name: 'Rocket Launcher',
    type: 'gun',
    description: 'High single-target damage with splash. Lock-On ability tracks nearest enemy.',
    price: 8000,
    leagueRequired: 'gold',
    damage: 90,
    fireRate: 0.4,
    range: 100,
    clipSize: 4,
    reloadTime: 3.5,
    spread: 1,
    projectileSpeed: 50,
    splashRadius: 8,
    chargeTime: 0,
    isExplosive: true,
    isArc: false,
    ability: 'lockOn',
    abilityCooldown: 15,
  },

  railgun: {
    id: 'railgun',
    name: 'Railgun',
    type: 'gun',
    description: 'Pierces through multiple enemies in a line. Requires a brief charge. Overcharge ability.',
    price: 12000,
    leagueRequired: 'platinum',
    damage: 80,
    fireRate: 0.35,
    range: 180,
    clipSize: 8,
    reloadTime: 2.8,
    spread: 0,
    projectileSpeed: 500,   // near-instant rail
    splashRadius: 0,
    chargeTime: 0.8,        // must hold before firing
    isExplosive: false,
    isArc: false,
    piercing: true,         // railgun-specific: hits all in line
    ability: 'overcharge',
    abilityCooldown: 20,
  },

  plasmaCannon: {
    id: 'plasmaCannon',
    name: 'Plasma Cannon',
    type: 'gun',
    description: 'Massive damage, slow energy projectile, high splash. Nova Blast ability.',
    price: 18000,
    leagueRequired: 'diamond',
    damage: 150,
    fireRate: 0.25,
    range: 120,
    clipSize: 3,
    reloadTime: 4.0,
    spread: 1,
    projectileSpeed: 40,
    splashRadius: 12,
    chargeTime: 0,
    isExplosive: true,
    isArc: false,
    ability: 'novaBlast',
    abilityCooldown: 25,
  },
};

// ---------------------------------------------------------------------------
// Melee weapons
// ---------------------------------------------------------------------------
export const MeleeDefs = {
  combatKnife: {
    id: 'combatKnife',
    name: 'Combat Knife',
    type: 'melee',
    description: 'Starter melee. Quick, low damage. Always available.',
    price: 0,
    leagueRequired: 'bronze',
    damage: 30,
    attackRate: 2.5,        // swings per second
    range: 2.0,             // world units reach
    ability: null,
    abilityCooldown: 0,
  },

  machete: {
    id: 'machete',
    name: 'Machete',
    type: 'melee',
    description: 'Wider swing arc, more damage than the knife.',
    price: 1000,
    leagueRequired: 'bronze',
    damage: 50,
    attackRate: 1.8,
    range: 2.5,
    ability: null,
    abilityCooldown: 0,
  },

  warHammer: {
    id: 'warHammer',
    name: 'War Hammer',
    type: 'melee',
    description: 'Slow, heavy damage, small knockback on hit.',
    price: 3000,
    leagueRequired: 'silver',
    damage: 100,
    attackRate: 1.0,
    range: 2.2,
    knockback: 3,           // world-units impulse on hit
    ability: null,
    abilityCooldown: 0,
  },

  energyBlade: {
    id: 'energyBlade',
    name: 'Energy Blade',
    type: 'melee',
    description: 'Fast, high damage, glowing visual. Dash Strike ability.',
    price: 10000,
    leagueRequired: 'gold',
    damage: 120,
    attackRate: 3.0,
    range: 3.0,
    ability: 'dashStrike',
    abilityCooldown: 12,
  },
};

// ---------------------------------------------------------------------------
// Ordered lists for shop display
// ---------------------------------------------------------------------------
export const GUN_ORDER = [
  'pistol',
  'smg',
  'assaultRifle',
  'sniperRifle',
  'shotgun',
  'grenadeLauncher',
  'rocketLauncher',
  'railgun',
  'plasmaCannon',
];

export const MELEE_ORDER = [
  'combatKnife',
  'machete',
  'warHammer',
  'energyBlade',
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Return a gun definition by id. Throws if unknown.
 * @param {string} id
 * @returns {object}
 */
export function getGunDef(id) {
  const def = GunDefs[id];
  if (!def) {
    throw new Error(`Unknown gun id: "${id}"`);
  }
  return def;
}

/**
 * Return a melee definition by id. Throws if unknown.
 * @param {string} id
 * @returns {object}
 */
export function getMeleeDef(id) {
  const def = MeleeDefs[id];
  if (!def) {
    throw new Error(`Unknown melee id: "${id}"`);
  }
  return def;
}

/**
 * Return any weapon def (gun or melee) by id.
 * Checks guns first, then melee.
 * @param {string} id
 * @returns {object}
 */
export function getWeaponDef(id) {
  return GunDefs[id] ?? MeleeDefs[id] ?? (() => { throw new Error(`Unknown weapon id: "${id}"`); })();
}
