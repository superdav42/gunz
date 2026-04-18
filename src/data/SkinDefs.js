/**
 * SkinDefs.js — Static definitions for all cosmetic tank skins.
 *
 * Skins are purely cosmetic — they swap hull and turret colors with no effect
 * on any gameplay stat. All skins are keyed by a stable ID string.
 *
 * Fields:
 *   id:             Stable ID used in save file and shop.
 *   name:           Display name shown in the skin shop.
 *   description:    Flavor text shown in the shop card.
 *   type:           'solid' | 'camo' | 'prestige'
 *                     solid    — single-color hull with matched turret
 *                     camo     — contrasting hull/turret tones (two-tone)
 *                     prestige — premium skins for high-league players
 *   leagueRequired: Minimum league to purchase ('bronze' | 'silver' | 'gold' |
 *                   'platinum' | 'diamond').
 *   price:          Shop cost in $. Range $500–$5,000 per VISION.md.
 *   colorBody:      Hull color (hex integer).
 *   colorTurret:    Turret color (hex integer).
 *
 * NOTE: The default 'none' skin is not defined here; Tank.js falls back to
 * the class-defined colors from TankDefs when no skin is equipped.
 */

export const SkinDefs = {
  // --------------------------------------------------------------------------
  // Solid color skins (Bronze+)
  // --------------------------------------------------------------------------

  desert_sand: {
    id: 'desert_sand',
    name: 'Desert Sand',
    description: 'Sun-bleached tan hull with dark ochre turret. Built for arid campaigns.',
    type: 'solid',
    leagueRequired: 'bronze',
    price: 500,
    colorBody: 0xC2956C,
    colorTurret: 0x8B6914,
  },

  arctic_white: {
    id: 'arctic_white',
    name: 'Arctic White',
    description: 'Frost-white hull with pale grey turret. Invisible on snow.',
    type: 'solid',
    leagueRequired: 'bronze',
    price: 500,
    colorBody: 0xE8E8E8,
    colorTurret: 0xB0B0B0,
  },

  midnight_black: {
    id: 'midnight_black',
    name: 'Midnight Black',
    description: 'Matte black hull with dark charcoal turret. Low-profile and menacing.',
    type: 'solid',
    leagueRequired: 'bronze',
    price: 750,
    colorBody: 0x1A1A1A,
    colorTurret: 0x2D2D2D,
  },

  steel_blue: {
    id: 'steel_blue',
    name: 'Steel Blue',
    description: 'Industrial steel-blue hull with navy turret. Solid and dependable.',
    type: 'solid',
    leagueRequired: 'bronze',
    price: 750,
    colorBody: 0x4A6FA5,
    colorTurret: 0x2B4C7E,
  },

  // --------------------------------------------------------------------------
  // Camo patterns (Silver+) — two-tone hull/turret contrast
  // --------------------------------------------------------------------------

  woodland_camo: {
    id: 'woodland_camo',
    name: 'Woodland Camo',
    description: 'Classic green-and-brown two-tone. Blends with forested terrain.',
    type: 'camo',
    leagueRequired: 'silver',
    price: 1500,
    colorBody: 0x4B5320,
    colorTurret: 0x6B4226,
  },

  urban_camo: {
    id: 'urban_camo',
    name: 'Urban Camo',
    description: 'Grey-and-slate two-tone for city fights. Looks the part in ruins.',
    type: 'camo',
    leagueRequired: 'silver',
    price: 1500,
    colorBody: 0x6E6E6E,
    colorTurret: 0x3F3F3F,
  },

  desert_camo: {
    id: 'desert_camo',
    name: 'Desert Camo',
    description: 'Sand and terracotta two-tone. Scorched-earth veteran aesthetic.',
    type: 'camo',
    leagueRequired: 'silver',
    price: 2000,
    colorBody: 0xC2A87A,
    colorTurret: 0x8B4513,
  },

  jungle_camo: {
    id: 'jungle_camo',
    name: 'Jungle Camo',
    description: 'Deep green hull with dark olive turret. Disappears in dense foliage.',
    type: 'camo',
    leagueRequired: 'gold',
    price: 2500,
    colorBody: 0x2D5A27,
    colorTurret: 0x556B2F,
  },

  // --------------------------------------------------------------------------
  // Prestige skins (Gold+ / Platinum+ / Diamond+)
  // --------------------------------------------------------------------------

  crimson_blaze: {
    id: 'crimson_blaze',
    name: 'Crimson Blaze',
    description: 'Fiery red hull with deep crimson turret. War-paint for proven veterans.',
    type: 'prestige',
    leagueRequired: 'gold',
    price: 3000,
    colorBody: 0xCC2200,
    colorTurret: 0x8B0000,
  },

  royal_gold: {
    id: 'royal_gold',
    name: 'Royal Gold',
    description: 'Burnished gold hull with dark brass turret. Reserved for the elite.',
    type: 'prestige',
    leagueRequired: 'platinum',
    price: 4000,
    colorBody: 0xDAA520,
    colorTurret: 0xB8860B,
  },

  void_black: {
    id: 'void_black',
    name: 'Void Black',
    description: 'Deep-space black hull with iridescent dark-purple turret. Diamond prestige only.',
    type: 'prestige',
    leagueRequired: 'diamond',
    price: 5000,
    colorBody: 0x0A0A0A,
    colorTurret: 0x1A0033,
  },
};

/**
 * Ordered array of skin IDs for shop display (cheap → expensive).
 */
export const SKIN_ORDER = [
  'desert_sand',
  'arctic_white',
  'midnight_black',
  'steel_blue',
  'woodland_camo',
  'urban_camo',
  'desert_camo',
  'jungle_camo',
  'crimson_blaze',
  'royal_gold',
  'void_black',
];

/**
 * Return a skin definition by id. Throws if the id is unknown.
 * @param {string} id
 * @returns {object}
 */
export function getSkinDef(id) {
  const def = SkinDefs[id];
  if (!def) {
    throw new Error(`Unknown skin id: "${id}"`);
  }
  return def;
}
