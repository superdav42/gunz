/**
 * TankDefs — authoritative tank class definitions.
 *
 * Stats sourced from VISION.md "Tank Classes" and "The Shop" sections.
 * Referenced by LoadoutScreen (t018), ShopMenu (t017), and TankVariety (t035).
 *
 * league: the minimum league required to purchase this tank.
 * Owned tanks are tracked by PlayerInventory (t015 stub).
 */

/** @typedef {'bronze'|'silver'|'gold'|'platinum'|'diamond'} League */

/**
 * @typedef {Object} TankDef
 * @property {string}  id          - Unique key (used in PlayerInventory)
 * @property {string}  name        - Display name
 * @property {string}  description - Short flavour line
 * @property {string}  tradeoff    - VISION.md trade-off text
 * @property {League}  league      - Minimum league to purchase
 * @property {number}  price       - Purchase price in $. 0 = free starter.
 * @property {number}  baseHP      - Starting HP before upgrades
 * @property {number}  baseSpeed   - Movement speed multiplier (1 = standard)
 * @property {number}  baseArmor   - Damage reduction fraction (0–1)
 * @property {string}  color       - Hex color for the mesh (flat-shaded)
 * @property {string|null} ability - Ability name, or null for classes without one
 */

/** @type {TankDef[]} */
export const TANK_DEFS = [
  {
    id:          'standard',
    name:        'Standard',
    description: 'Balanced all-rounder. Good at everything, exceptional at nothing.',
    tradeoff:    'No extreme stats',
    league:      'bronze',
    price:       0,
    baseHP:      100,
    baseSpeed:   1.0,
    baseArmor:   0.10,
    color:       '#4caf50',
    ability:     null,
  },
  {
    id:          'scout',
    name:        'Scout',
    description: 'Light, fast, weak armor. Rapid-fire small cannon.',
    tradeoff:    'Speed vs survivability',
    league:      'bronze',
    price:       2000,
    baseHP:      60,
    baseSpeed:   1.5,
    baseArmor:   0.05,
    color:       '#8bc34a',
    ability:     null,
  },
  {
    id:          'heavy',
    name:        'Heavy',
    description: 'Slow, thick armor, big cannon. High damage, long reload.',
    tradeoff:    'Power vs mobility',
    league:      'silver',
    price:       5000,
    baseHP:      200,
    baseSpeed:   0.6,
    baseArmor:   0.30,
    color:       '#607d8b',
    ability:     'Reactive Armor',
  },
  {
    id:          'artillery',
    name:        'Artillery',
    description: 'Very long range, arc shots. Paper-thin armor.',
    tradeoff:    'Range vs close-combat',
    league:      'silver',
    price:       5000,
    baseHP:      70,
    baseSpeed:   0.7,
    baseArmor:   0.05,
    color:       '#795548',
    ability:     'Barrage',
  },
  {
    id:          'flame',
    name:        'Flame Tank',
    description: 'Short-range flamethrower. Strong vs groups.',
    tradeoff:    'Range vs area damage',
    league:      'gold',
    price:       8000,
    baseHP:      110,
    baseSpeed:   0.9,
    baseArmor:   0.15,
    color:       '#ff5722',
    ability:     'Inferno Burst',
  },
  {
    id:          'shield',
    name:        'Shield Tank',
    description: 'Medium speed, medium armor. Has Energy Shield ability.',
    tradeoff:    'Defense vs offense',
    league:      'platinum',
    price:       15000,
    baseHP:      130,
    baseSpeed:   0.85,
    baseArmor:   0.20,
    color:       '#2196f3',
    ability:     'Energy Shield',
  },
  {
    id:          'jump',
    name:        'Jump Tank',
    description: 'Light-medium armor. Has Rocket Jump ability.',
    tradeoff:    'Mobility vs durability',
    league:      'platinum',
    price:       15000,
    baseHP:      90,
    baseSpeed:   1.1,
    baseArmor:   0.12,
    color:       '#9c27b0',
    ability:     'Rocket Jump',
  },
  {
    id:          'siege',
    name:        'Siege Tank',
    description: 'Heavy armor, powerful cannon. Has Lockdown Mode.',
    tradeoff:    'Firepower vs mobility',
    league:      'diamond',
    price:       25000,
    baseHP:      250,
    baseSpeed:   0.5,
    baseArmor:   0.35,
    color:       '#f44336',
    ability:     'Lockdown Mode',
  },
];

/** @type {Map<string, TankDef>} */
export const TANK_MAP = new Map(TANK_DEFS.map(t => [t.id, t]));

/**
 * Retrieve a tank definition by id.
 * @param {string} id
 * @returns {TankDef}
 */
export function getTankDef(id) {
  const def = TANK_MAP.get(id);
  if (!def) throw new Error(`[TankDefs] Unknown tank id: "${id}"`);
  return def;
}
