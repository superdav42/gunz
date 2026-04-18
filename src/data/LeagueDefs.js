/**
 * LeagueDefs.js — Static definitions for all 6 leagues.
 *
 * Each entry is keyed by a stable ID string used throughout the codebase.
 * Data reflects VISION.md "League System" and "AI Difficulty Scaling per League" tables.
 *
 * lpRequired:       Minimum LP to be in this league (0 for starting league).
 * lpToPromote:      LP threshold to promote to the next league (same as next league's lpRequired).
 *                   Set to Infinity for the top league.
 * lpGains:          LP awarded or deducted per match result.
 * upgradeTierCap:   Maximum upgrade tier purchasable while in this league (1–5).
 * ai:               Enemy-team difficulty scalars applied at this league.
 *   aimAccuracy:    Float 0–1. Probability that an aimed shot hits.
 *   reactionTime:   Seconds before an AI tank reacts to a newly spotted target.
 *   hpMultiplier:   Multiplied against each enemy tank's base HP value.
 *   damageMultiplier: Multiplied against each enemy tank's base damage value.
 *   usesCover:      How frequently AI seeks cover ('rarely'|'sometimes'|'often'|'always').
 *   usesAbilities:  Whether AI activates tank/weapon abilities and how well ('no'|'slow'|'yes'|'smart'|'instant').
 *   focusFire:      Whether AI tanks coordinate to focus the same target ('no'|'sometimes'|'often'|'always').
 * teamComposition:  Default 5-slot ally composition (player fills one slot themselves).
 *   ally:           Array of tank-class IDs for the 5 AI ally slots.
 *   enemy:          Array of tank-class IDs for all 6 AI enemy slots.
 * unlockTheme:      Short description of gear unlocked at this league.
 */

export const LeagueDefs = {
  bronze: {
    id: 'bronze',
    name: 'Bronze',
    lpRequired: 0,
    lpToPromote: 500,
    upgradeTierCap: 2,
    lpGains: {
      win20: 40,   // 2-0 sweep win
      win21: 25,   // 2-1 close win
      lose12: -10, // 1-2 close loss
      lose02: -20, // 0-2 sweep loss
    },
    ai: {
      aimAccuracy: 0.40,
      reactionTime: 1.5,
      hpMultiplier: 0.6,
      damageMultiplier: 0.6,
      usesCover: 'rarely',
      usesAbilities: 'no',
      focusFire: 'no',
    },
    teamComposition: {
      ally:  ['standard', 'standard', 'standard', 'scout', 'heavy'],
      enemy: ['standard', 'standard', 'standard', 'standard', 'standard', 'scout'],
    },
    unlockTheme: 'Starter weapons and tanks.',
  },

  silver: {
    id: 'silver',
    name: 'Silver',
    lpRequired: 500,
    lpToPromote: 1200,
    upgradeTierCap: 3,
    lpGains: {
      win20: 40,
      win21: 25,
      lose12: -10,
      lose02: -20,
    },
    ai: {
      aimAccuracy: 0.55,
      reactionTime: 1.0,
      hpMultiplier: 0.8,
      damageMultiplier: 0.8,
      usesCover: 'sometimes',
      usesAbilities: 'no',
      focusFire: 'no',
    },
    teamComposition: {
      ally:  ['standard', 'standard', 'scout', 'heavy', 'artillery'],
      enemy: ['standard', 'standard', 'standard', 'scout', 'heavy', 'artillery'],
    },
    unlockTheme: 'Snipers, explosives, Scout and Heavy tanks.',
  },

  gold: {
    id: 'gold',
    name: 'Gold',
    lpRequired: 1200,
    lpToPromote: 2200,
    upgradeTierCap: 4,
    lpGains: {
      win20: 40,
      win21: 25,
      lose12: -10,
      lose02: -20,
    },
    ai: {
      aimAccuracy: 0.70,
      reactionTime: 0.7,
      hpMultiplier: 1.0,
      damageMultiplier: 1.0,
      usesCover: 'often',
      usesAbilities: 'slow',
      focusFire: 'no',
    },
    teamComposition: {
      ally:  ['standard', 'scout', 'heavy', 'artillery', 'flameTank'],
      enemy: ['standard', 'scout', 'heavy', 'artillery', 'flameTank', 'standard'],
    },
    unlockTheme: 'Advanced weapons, Flame Tank, first abilities.',
  },

  platinum: {
    id: 'platinum',
    name: 'Platinum',
    lpRequired: 2200,
    lpToPromote: 3500,
    upgradeTierCap: 5,
    lpGains: {
      win20: 40,
      win21: 25,
      lose12: -10,
      lose02: -20,
    },
    ai: {
      aimAccuracy: 0.80,
      reactionTime: 0.5,
      hpMultiplier: 1.2,
      damageMultiplier: 1.1,
      usesCover: 'always',
      usesAbilities: 'yes',
      focusFire: 'sometimes',
    },
    teamComposition: {
      ally:  ['scout', 'heavy', 'artillery', 'shieldTank', 'jumpTank'],
      enemy: ['heavy', 'artillery', 'flameTank', 'shieldTank', 'jumpTank', 'scout'],
    },
    unlockTheme: 'Big guns with abilities (shield, jump).',
  },

  diamond: {
    id: 'diamond',
    name: 'Diamond',
    lpRequired: 3500,
    lpToPromote: 5000,
    upgradeTierCap: 5,
    lpGains: {
      win20: 40,
      win21: 25,
      lose12: -10,
      lose02: -20,
    },
    ai: {
      aimAccuracy: 0.90,
      reactionTime: 0.3,
      hpMultiplier: 1.4,
      damageMultiplier: 1.3,
      usesCover: 'always',
      usesAbilities: 'smart',
      focusFire: 'often',
    },
    teamComposition: {
      ally:  ['heavy', 'artillery', 'shieldTank', 'jumpTank', 'siegeTank'],
      enemy: ['heavy', 'shieldTank', 'jumpTank', 'siegeTank', 'artillery', 'flameTank'],
    },
    unlockTheme: 'Best tanks and weapons in the game.',
  },

  champion: {
    id: 'champion',
    name: 'Champion',
    lpRequired: 5000,
    lpToPromote: Infinity,
    upgradeTierCap: 5,
    lpGains: {
      win20: 40,
      win21: 25,
      lose12: -10,
      lose02: -20,
    },
    ai: {
      aimAccuracy: 0.95,
      reactionTime: 0.2,
      hpMultiplier: 1.6,
      damageMultiplier: 1.5,
      usesCover: 'always',
      usesAbilities: 'instant',
      focusFire: 'always',
    },
    teamComposition: {
      ally:  ['heavy', 'shieldTank', 'jumpTank', 'siegeTank', 'artillery'],
      enemy: ['heavy', 'shieldTank', 'jumpTank', 'siegeTank', 'artillery', 'flameTank'],
    },
    unlockTheme: 'Cosmetic prestige skins. Bragging rights.',
  },
};

/**
 * Ordered array of league IDs from lowest to highest.
 * Preserves promotion-chain order used by LeagueSystem for LP comparisons.
 */
export const LEAGUE_ORDER = [
  'bronze',
  'silver',
  'gold',
  'platinum',
  'diamond',
  'champion',
];

/**
 * Return a league definition by id. Throws if the id is unknown.
 * @param {string} id
 * @returns {object}
 */
export function getLeagueDef(id) {
  const def = LeagueDefs[id];
  if (!def) {
    throw new Error(`Unknown league id: "${id}"`);
  }
  return def;
}

/**
 * Return the league id that a given LP total falls into.
 * Walks LEAGUE_ORDER in reverse (highest first) and returns the first league
 * whose lpRequired is <= the provided LP value.
 * @param {number} lp
 * @returns {string}  League id (never null — falls back to 'bronze' at minimum).
 */
export function getLeagueForLP(lp) {
  for (let i = LEAGUE_ORDER.length - 1; i >= 0; i--) {
    const id = LEAGUE_ORDER[i];
    if (lp >= LeagueDefs[id].lpRequired) {
      return id;
    }
  }
  return 'bronze';
}
