/**
 * LeagueDefs.js — Static definitions for all 6 league tiers.
 *
 * Each entry is keyed by a stable ID string used throughout the codebase.
 * Data matches the VISION.md "League System" and "AI Difficulty Scaling per League" tables.
 *
 * leagueId:          unique identifier string
 * name:              display name
 * lpRequired:        minimum LP to be in this league (0 = starting league)
 * promotionLp:       LP threshold to advance to the next league (null = top league)
 * aiScaling:         AI difficulty multipliers applied to the enemy team
 *   accuracy:        fraction of aimed shots that are on-target (0–1).
 *                    Applied as aim spread: maxSpread = (1 - accuracy) * MAX_AIM_SPREAD.
 *   reactionTime:    seconds before an AI tank begins engaging a newly-spotted target.
 *   hpMultiplier:    enemy tank HP relative to the base value (1.0 = base).
 *   damageMultiplier:enemy projectile damage relative to base (1.0 = base).
 * tierCap:           highest upgrade tier available in the shop at this league.
 */
export const LeagueDefs = {
  bronze: {
    id: 'bronze',
    name: 'Bronze',
    lpRequired: 0,
    promotionLp: 500,
    aiScaling: {
      accuracy: 0.40,
      reactionTime: 1.5,
      hpMultiplier: 0.6,
      damageMultiplier: 0.6,
    },
    tierCap: 2,
  },

  silver: {
    id: 'silver',
    name: 'Silver',
    lpRequired: 500,
    promotionLp: 1200,
    aiScaling: {
      accuracy: 0.55,
      reactionTime: 1.0,
      hpMultiplier: 0.8,
      damageMultiplier: 0.8,
    },
    tierCap: 3,
  },

  gold: {
    id: 'gold',
    name: 'Gold',
    lpRequired: 1200,
    promotionLp: 2200,
    aiScaling: {
      accuracy: 0.70,
      reactionTime: 0.7,
      hpMultiplier: 1.0,
      damageMultiplier: 1.0,
    },
    tierCap: 4,
  },

  platinum: {
    id: 'platinum',
    name: 'Platinum',
    lpRequired: 2200,
    promotionLp: 3500,
    aiScaling: {
      accuracy: 0.80,
      reactionTime: 0.5,
      hpMultiplier: 1.2,
      damageMultiplier: 1.1,
    },
    tierCap: 5,
  },

  diamond: {
    id: 'diamond',
    name: 'Diamond',
    lpRequired: 3500,
    promotionLp: 5000,
    aiScaling: {
      accuracy: 0.90,
      reactionTime: 0.3,
      hpMultiplier: 1.4,
      damageMultiplier: 1.3,
    },
    tierCap: 5,
  },

  champion: {
    id: 'champion',
    name: 'Champion',
    lpRequired: 5000,
    promotionLp: null, // top league — no promotion
    aiScaling: {
      accuracy: 0.95,
      reactionTime: 0.2,
      hpMultiplier: 1.6,
      damageMultiplier: 1.5,
    },
    tierCap: 5,
  },
};

/**
 * Ordered array of league IDs from lowest to highest tier.
 * Matches the progression sequence in VISION.md.
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
 * LP gain/loss amounts per match result (global — same across all leagues).
 * Source: VISION.md "LP Gains and Losses" table.
 */
export const LP_CHANGES = {
  /** Win 2-0 (sweep) */
  winSweep: 40,
  /** Win 2-1 (close) */
  winClose: 25,
  /** Lose 1-2 (close) */
  loseClose: -10,
  /** Lose 0-2 (sweep) */
  loseSweep: -20,
};

/**
 * Return a league definition by id.
 * Throws if the id is unknown to catch typos early.
 *
 * @param {string} id — e.g. 'bronze', 'silver'
 * @returns {object}
 */
export function getLeagueDef(id) {
  const def = LeagueDefs[id];
  if (!def) {
    throw new Error(`[LeagueDefs] Unknown league id: "${id}"`);
  }
  return def;
}

/**
 * Return the league the player is currently in based on their LP total.
 * Finds the highest league whose lpRequired is ≤ lp.
 *
 * @param {number} lp — current league points
 * @returns {object} league definition
 */
export function getLeagueForLp(lp) {
  let result = LeagueDefs.bronze;
  for (const id of LEAGUE_ORDER) {
    if (lp >= LeagueDefs[id].lpRequired) {
      result = LeagueDefs[id];
    } else {
      break;
    }
  }
  return result;
}
