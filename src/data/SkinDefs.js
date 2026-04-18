/**
 * SkinDefs.js — Cosmetic tank skin definitions for the shop (t053).
 *
 * Each entry describes a purchasable skin. Skins have no league gate — any
 * player can buy any skin if they have the money.
 *
 * colorBody:   Hull and track panel colour (hex integer).
 * colorTurret: Turret dome colour (hex integer, usually a shade of colorBody).
 *
 * These colours are applied by SkinPreview (rotating preview model) and by the
 * Tank entity when a skin is equipped (material swap in t053 rendering).
 */

/** @typedef {{ id: string, name: string, price: number, description: string, colorBody: number, colorTurret: number }} SkinDef */

/** @type {SkinDef[]} Ordered list used for rendering the skins grid. */
export const SKIN_DEFS = [
  {
    id: 'camo_green',
    name: 'Camo Green',
    price: 500,
    description: 'Military woodland camo.',
    colorBody:   0x4a6b3f,
    colorTurret: 0x3d5933,
  },
  {
    id: 'desert_tan',
    name: 'Desert Tan',
    price: 750,
    description: 'Sandy desert scheme.',
    colorBody:   0xc2a35e,
    colorTurret: 0xa8893d,
  },
  {
    id: 'arctic_white',
    name: 'Arctic White',
    price: 1000,
    description: 'Snow camouflage.',
    colorBody:   0xe0e0e0,
    colorTurret: 0xc8c8c8,
  },
  {
    id: 'stealth_black',
    name: 'Stealth Black',
    price: 1500,
    description: 'All-black tactical finish.',
    colorBody:   0x1c1c1c,
    colorTurret: 0x111111,
  },
  {
    id: 'neon_blue',
    name: 'Neon Blue',
    price: 2000,
    description: 'Electric blue neon.',
    colorBody:   0x0066cc,
    colorTurret: 0x004499,
  },
  {
    id: 'chrome',
    name: 'Chrome',
    price: 3000,
    description: 'Mirror-polished chrome.',
    colorBody:   0xc0c0c0,
    colorTurret: 0xa0a0a0,
  },
  {
    id: 'gold_plated',
    name: 'Gold Plated',
    price: 5000,
    description: 'Prestige gold finish.',
    colorBody:   0xffd700,
    colorTurret: 0xd4a800,
  },
];

/**
 * Lookup map from skin ID to definition.
 * @type {Record<string, SkinDef>}
 */
export const SKIN_MAP = Object.fromEntries(SKIN_DEFS.map(s => [s.id, s]));
