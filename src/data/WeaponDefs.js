/**
 * WeaponDefs — authoritative on-foot weapon definitions.
 *
 * Stats sourced from VISION.md "The Shop — Weapons Tab" section.
 * Referenced by LoadoutScreen (t018), ShopMenu (t017), and Firearm variety (t031).
 *
 * Two weapon categories:
 *   'gun'   — primary firearm (player equips exactly one)
 *   'melee' — melee weapon (player equips exactly one)
 *
 * league: the minimum league required to purchase this weapon.
 * Owned weapons are tracked by PlayerInventory (t015 stub).
 */

/** @typedef {'bronze'|'silver'|'gold'|'platinum'|'diamond'} League */

/**
 * @typedef {Object} WeaponDef
 * @property {string}        id          - Unique key (used in PlayerInventory)
 * @property {string}        name        - Display name
 * @property {'gun'|'melee'} type        - Weapon category
 * @property {string}        description - Short flavour line
 * @property {League}        league      - Minimum league to purchase
 * @property {number}        price       - Purchase price in $. 0 = free starter.
 * @property {string|null}   ability     - Special ability name, or null
 */

/** @type {WeaponDef[]} */
export const WEAPON_DEFS = [
  // ── Guns ──────────────────────────────────────────────────────────────────
  {
    id:          'pistol',
    name:        'Pistol',
    type:        'gun',
    description: 'Starter. Low damage, decent fire rate.',
    league:      'bronze',
    price:       0,
    ability:     null,
  },
  {
    id:          'smg',
    name:        'SMG',
    type:        'gun',
    description: 'Fast fire rate, low accuracy at range.',
    league:      'bronze',
    price:       1500,
    ability:     null,
  },
  {
    id:          'assault_rifle',
    name:        'Assault Rifle',
    type:        'gun',
    description: 'Balanced damage and rate.',
    league:      'silver',
    price:       3000,
    ability:     null,
  },
  {
    id:          'sniper_rifle',
    name:        'Sniper Rifle',
    type:        'gun',
    description: 'High damage, slow fire, long range.',
    league:      'silver',
    price:       4500,
    ability:     null,
  },
  {
    id:          'shotgun',
    name:        'Shotgun',
    type:        'gun',
    description: 'Devastating up close, useless at range.',
    league:      'silver',
    price:       3500,
    ability:     null,
  },
  {
    id:          'grenade_launcher',
    name:        'Grenade Launcher',
    type:        'gun',
    description: 'Area damage, arc trajectory, slow reload.',
    league:      'gold',
    price:       6000,
    ability:     'Cluster Bomb',
  },
  {
    id:          'rocket_launcher',
    name:        'Rocket Launcher',
    type:        'gun',
    description: 'High single-target damage, splash.',
    league:      'gold',
    price:       8000,
    ability:     'Lock-On',
  },
  {
    id:          'railgun',
    name:        'Railgun',
    type:        'gun',
    description: 'Pierces through multiple enemies. Charge time.',
    league:      'platinum',
    price:       12000,
    ability:     'Overcharge',
  },
  {
    id:          'plasma_cannon',
    name:        'Plasma Cannon',
    type:        'gun',
    description: 'Massive damage, energy projectile, slow.',
    league:      'diamond',
    price:       18000,
    ability:     'Nova Blast',
  },

  // ── Melee ─────────────────────────────────────────────────────────────────
  {
    id:          'combat_knife',
    name:        'Combat Knife',
    type:        'melee',
    description: 'Starter melee. Quick, low damage.',
    league:      'bronze',
    price:       0,
    ability:     null,
  },
  {
    id:          'machete',
    name:        'Machete',
    type:        'melee',
    description: 'Wider swing, more damage.',
    league:      'bronze',
    price:       1000,
    ability:     null,
  },
  {
    id:          'war_hammer',
    name:        'War Hammer',
    type:        'melee',
    description: 'Slow, heavy damage, small knockback.',
    league:      'silver',
    price:       3000,
    ability:     null,
  },
  {
    id:          'energy_blade',
    name:        'Energy Blade',
    type:        'melee',
    description: 'Fast, high damage, glowing visual.',
    league:      'gold',
    price:       10000,
    ability:     'Dash Strike',
  },
];

/** @type {Map<string, WeaponDef>} */
export const WEAPON_MAP = new Map(WEAPON_DEFS.map(w => [w.id, w]));

/**
 * Retrieve a weapon definition by id.
 * @param {string} id
 * @returns {WeaponDef}
 */
export function getWeaponDef(id) {
  const def = WEAPON_MAP.get(id);
  if (!def) throw new Error(`[WeaponDefs] Unknown weapon id: "${id}"`);
  return def;
}

/**
 * Filter weapons by type.
 * @param {'gun'|'melee'} type
 * @returns {WeaponDef[]}
 */
export function getWeaponsByType(type) {
  return WEAPON_DEFS.filter(w => w.type === type);
}
