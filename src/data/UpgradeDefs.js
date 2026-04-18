/**
 * UpgradeDefs.js — Static definitions for all upgrades.
 *
 * Two categories:
 *   TANK_UPGRADE_DEFS  — permanent per-tank-class stat upgrades.
 *   FOOT_UPGRADE_DEFS  — permanent per-weapon on-foot upgrades.
 *
 * Upgrade tiers and league caps (from VISION.md):
 *   Tier 1 — Bronze minimum  (+10–15% stat boost)
 *   Tier 2 — Bronze minimum  (+15–20%)
 *   Tier 3 — Silver minimum  (+20–25%)
 *   Tier 4 — Gold minimum    (+25–30%)
 *   Tier 5 — Platinum minimum(+30–35%)
 *
 * League tier-cap table (maximum tier purchasable per league):
 *   Bronze   → tier 2
 *   Silver   → tier 3
 *   Gold     → tier 4
 *   Platinum → tier 5
 *   Diamond  → tier 5 (no additional cap)
 *   Champion → tier 5
 *
 * Each upgrade entry has:
 *   id:          Stable string key.
 *   name:        Display name.
 *   description: Effect description.
 *   category:    'tank' | 'foot'
 *   maxTier:     Highest purchasable tier (1–5).
 *   costs:       Array of prices indexed by tier (costs[0] = tier 1 price, etc.).
 *   stat:        Which stat this upgrade affects.
 *   bonusPerTier: Flat or fractional bonus applied per tier level.
 *   bonusType:   'additive_percent' = multiply base by (1 + tier * bonus) |
 *                'additive_flat'    = add (tier * bonus) to base value.
 *
 * Stat multiplier helpers are exported separately (see applyUpgrades).
 */

// ---------------------------------------------------------------------------
// League tier-cap constants
// ---------------------------------------------------------------------------
export const LEAGUE_TIER_CAPS = {
  bronze:   2,
  silver:   3,
  gold:     4,
  platinum: 5,
  diamond:  5,
  champion: 5,
};

// ---------------------------------------------------------------------------
// Tank upgrades (apply per-tank-class; upgrading Standard does not affect Heavy)
// ---------------------------------------------------------------------------
export const TankUpgradeDefs = {
  armorPlating: {
    id: 'armorPlating',
    name: 'Armor Plating',
    description: 'Increases maximum HP of this tank class.',
    category: 'tank',
    maxTier: 5,
    costs: [500, 1000, 2000, 4000, 8000],
    stat: 'hp',
    bonusPerTier: 0.15,     // +15% HP per tier → tier 5 = +75% HP
    bonusType: 'additive_percent',
    leaguePerTier: ['bronze', 'bronze', 'silver', 'gold', 'platinum'],
  },

  engine: {
    id: 'engine',
    name: 'Engine',
    description: 'Increases speed and turn rate of this tank class.',
    category: 'tank',
    maxTier: 5,
    costs: [500, 1000, 2000, 4000, 8000],
    stat: 'speed',              // also improves turnRate proportionally
    bonusPerTier: 0.12,         // +12% speed per tier
    bonusType: 'additive_percent',
    leaguePerTier: ['bronze', 'bronze', 'silver', 'gold', 'platinum'],
  },

  mainGun: {
    id: 'mainGun',
    name: 'Main Gun',
    description: 'Increases shell damage and reduces reload time.',
    category: 'tank',
    maxTier: 5,
    costs: [750, 1500, 3000, 6000, 12000],
    stat: 'damage',             // also improves fireRate proportionally (–8% reload per tier)
    bonusPerTier: 0.15,
    bonusType: 'additive_percent',
    leaguePerTier: ['bronze', 'bronze', 'silver', 'gold', 'platinum'],
  },

  ammoCapacity: {
    id: 'ammoCapacity',
    name: 'Ammo Capacity',
    description: 'Increases maximum ammo loaded per resupply.',
    category: 'tank',
    maxTier: 3,
    costs: [300, 600, 1200],
    stat: 'ammo',
    bonusPerTier: 10,           // +10 ammo per tier (flat)
    bonusType: 'additive_flat',
    leaguePerTier: ['bronze', 'bronze', 'silver'],
  },

  tracks: {
    id: 'tracks',
    name: 'Tracks',
    description: 'Improves hill climbing and reduces terrain slowdown.',
    category: 'tank',
    maxTier: 3,
    costs: [400, 800, 1600],
    stat: 'terrainPenalty',
    bonusPerTier: 0.20,         // –20% terrain speed penalty per tier
    bonusType: 'additive_percent',
    leaguePerTier: ['bronze', 'bronze', 'silver'],
  },

  hullReinforcement: {
    id: 'hullReinforcement',
    name: 'Hull Reinforcement',
    description: 'Increases resistance to explosive (splash) damage.',
    category: 'tank',
    maxTier: 3,
    costs: [600, 1200, 2400],
    stat: 'explosiveResistance',
    bonusPerTier: 0.15,         // +15% explosive damage reduction per tier
    bonusType: 'additive_percent',
    leaguePerTier: ['bronze', 'bronze', 'silver'],
  },
};

// ---------------------------------------------------------------------------
// On-foot weapon upgrades (apply per-weapon; upgrading AR does not affect Sniper)
// ---------------------------------------------------------------------------
export const FootUpgradeDefs = {
  firearmdamage: {
    id: 'firearmdamage',
    name: 'Firearm Damage',
    description: 'Increases bullet damage for the equipped gun.',
    category: 'foot',
    maxTier: 5,
    costs: [400, 800, 1600, 3200, 6400],
    stat: 'damage',
    bonusPerTier: 0.15,
    bonusType: 'additive_percent',
    leaguePerTier: ['bronze', 'bronze', 'silver', 'gold', 'platinum'],
  },

  fireRate: {
    id: 'fireRate',
    name: 'Fire Rate',
    description: 'Reduces time between shots for the equipped gun.',
    category: 'foot',
    maxTier: 5,
    costs: [400, 800, 1600, 3200, 6400],
    stat: 'fireRate',
    bonusPerTier: 0.12,         // +12% fire rate per tier
    bonusType: 'additive_percent',
    leaguePerTier: ['bronze', 'bronze', 'silver', 'gold', 'platinum'],
  },

  clipSize: {
    id: 'clipSize',
    name: 'Clip Size',
    description: 'Increases ammo capacity before reload.',
    category: 'foot',
    maxTier: 3,
    costs: [300, 600, 1200],
    stat: 'clipSize',
    bonusPerTier: 5,            // +5 rounds per tier (flat)
    bonusType: 'additive_flat',
    leaguePerTier: ['bronze', 'bronze', 'silver'],
  },

  reloadSpeed: {
    id: 'reloadSpeed',
    name: 'Reload Speed',
    description: 'Reduces reload time for the equipped gun.',
    category: 'foot',
    maxTier: 3,
    costs: [300, 600, 1200],
    stat: 'reloadTime',
    bonusPerTier: 0.15,         // –15% reload time per tier
    bonusType: 'additive_percent',
    leaguePerTier: ['bronze', 'bronze', 'silver'],
  },

  meleeDamage: {
    id: 'meleeDamage',
    name: 'Melee Damage',
    description: 'Increases damage per melee hit.',
    category: 'foot',
    maxTier: 4,
    costs: [300, 600, 1200, 2400],
    stat: 'damage',
    bonusPerTier: 0.20,
    bonusType: 'additive_percent',
    leaguePerTier: ['bronze', 'bronze', 'silver', 'gold'],
  },

  meleeReach: {
    id: 'meleeReach',
    name: 'Melee Reach',
    description: 'Extends the effective range of melee attacks.',
    category: 'foot',
    maxTier: 3,
    costs: [250, 500, 1000],
    stat: 'range',
    bonusPerTier: 0.5,          // +0.5 world units per tier (flat)
    bonusType: 'additive_flat',
    leaguePerTier: ['bronze', 'bronze', 'silver'],
  },

  sprintSpeed: {
    id: 'sprintSpeed',
    name: 'Sprint Speed',
    description: 'Increases on-foot movement speed.',
    category: 'foot',
    maxTier: 3,
    costs: [400, 800, 1600],
    stat: 'speed',
    bonusPerTier: 0.12,
    bonusType: 'additive_percent',
    leaguePerTier: ['bronze', 'bronze', 'silver'],
  },

  bodyArmor: {
    id: 'bodyArmor',
    name: 'Body Armor',
    description: 'Increases on-foot maximum HP.',
    category: 'foot',
    maxTier: 4,
    costs: [500, 1000, 2000, 4000],
    stat: 'hp',
    bonusPerTier: 0.20,
    bonusType: 'additive_percent',
    leaguePerTier: ['bronze', 'bronze', 'silver', 'gold'],
  },
};

// ---------------------------------------------------------------------------
// Ordered lists for shop display
// ---------------------------------------------------------------------------
export const TANK_UPGRADE_ORDER = [
  'armorPlating',
  'engine',
  'mainGun',
  'ammoCapacity',
  'tracks',
  'hullReinforcement',
];

export const FOOT_UPGRADE_ORDER = [
  'firearmdamage',
  'fireRate',
  'clipSize',
  'reloadSpeed',
  'meleeDamage',
  'meleeReach',
  'sprintSpeed',
  'bodyArmor',
];

// ---------------------------------------------------------------------------
// Stat computation helpers
// ---------------------------------------------------------------------------

/**
 * Calculate the stat multiplier for a given tier of a percent-based upgrade.
 * Returns the total multiplier (e.g. 1.30 means +30% of base).
 *
 * @param {object} upgradeDef  - An entry from TankUpgradeDefs or FootUpgradeDefs.
 * @param {number} tier        - Current purchased tier (0 = none, 1–maxTier).
 * @returns {number}
 */
export function getUpgradeMultiplier(upgradeDef, tier) {
  if (upgradeDef.bonusType !== 'additive_percent') {
    return 1;
  }
  return 1 + upgradeDef.bonusPerTier * tier;
}

/**
 * Calculate the flat additive bonus for a given tier of a flat upgrade.
 *
 * @param {object} upgradeDef
 * @param {number} tier
 * @returns {number}
 */
export function getUpgradeFlat(upgradeDef, tier) {
  if (upgradeDef.bonusType !== 'additive_flat') {
    return 0;
  }
  return upgradeDef.bonusPerTier * tier;
}

/**
 * Apply all purchased tank upgrades to a base stats object.
 *
 * @param {object} baseStats          — plain object with base stat values.
 * @param {object} purchasedUpgrades  — { upgradeId: tier } map for this tank class.
 * @returns {object}                  — new stats object with upgrades applied.
 */
export function applyTankUpgrades(baseStats, purchasedUpgrades) {
  const stats = { ...baseStats };

  for (const [id, tier] of Object.entries(purchasedUpgrades)) {
    if (tier === 0) {
      continue;
    }
    const def = TankUpgradeDefs[id];
    if (!def) {
      continue;
    }

    if (def.bonusType === 'additive_percent') {
      const multiplier = getUpgradeMultiplier(def, tier);
      stats[def.stat] = baseStats[def.stat] * multiplier;

      // Engine also improves turnRate at the same rate.
      if (id === 'engine' && 'turnRate' in stats) {
        stats.turnRate = baseStats.turnRate * multiplier;
      }

      // Main Gun also reduces reload time (fireRate improvement).
      if (id === 'mainGun' && 'fireRate' in stats) {
        // Each tier reduces reload by 8%, which increases shots per second.
        const fireRateMultiplier = 1 + 0.08 * tier;
        stats.fireRate = baseStats.fireRate * fireRateMultiplier;
      }
    } else {
      stats[def.stat] = baseStats[def.stat] + getUpgradeFlat(def, tier);
    }
  }

  return stats;
}

/**
 * Apply all purchased foot upgrades to a base weapon stats object.
 *
 * @param {object} baseStats          — plain object with base stat values.
 * @param {object} purchasedUpgrades  — { upgradeId: tier } map for this weapon.
 * @returns {object}                  — new stats object with upgrades applied.
 */
export function applyFootUpgrades(baseStats, purchasedUpgrades) {
  const stats = { ...baseStats };

  for (const [id, tier] of Object.entries(purchasedUpgrades)) {
    if (tier === 0) {
      continue;
    }
    const def = FootUpgradeDefs[id];
    if (!def) {
      continue;
    }

    if (def.bonusType === 'additive_percent') {
      const multiplier = getUpgradeMultiplier(def, tier);
      // Reload time reduces (lower is better): invert the multiplier.
      if (id === 'reloadSpeed') {
        stats[def.stat] = baseStats[def.stat] / multiplier;
      } else {
        stats[def.stat] = baseStats[def.stat] * multiplier;
      }
    } else {
      stats[def.stat] = baseStats[def.stat] + getUpgradeFlat(def, tier);
    }
  }

  return stats;
}

/**
 * Return the maximum purchasable tier for a given upgrade in the current league.
 *
 * @param {object} upgradeDef   — An upgrade definition object.
 * @param {string} currentLeague — e.g. 'bronze', 'silver'.
 * @returns {number}            — 0 if no tiers are available yet, otherwise 1–maxTier.
 */
export function getMaxAvailableTier(upgradeDef, currentLeague) {
  const leagueCap = LEAGUE_TIER_CAPS[currentLeague] ?? 0;
  return Math.min(upgradeDef.maxTier, leagueCap);
}

/**
 * Lookup a tank upgrade definition by id. Throws if unknown.
 * @param {string} id
 * @returns {object}
 */
export function getTankUpgradeDef(id) {
  const def = TankUpgradeDefs[id];
  if (!def) {
    throw new Error(`Unknown tank upgrade id: "${id}"`);
  }
  return def;
}

/**
 * Lookup a foot upgrade definition by id. Throws if unknown.
 * @param {string} id
 * @returns {object}
 */
export function getFootUpgradeDef(id) {
  const def = FootUpgradeDefs[id];
  if (!def) {
    throw new Error(`Unknown foot upgrade id: "${id}"`);
  }
  return def;
}
