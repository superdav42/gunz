/**
 * TeamCompositions.js — Per-league team roster definitions for auto-filling AI slots.
 *
 * Source: VISION.md "Team Composition per League" table.
 *
 * Structure per league:
 *   playerTeamAI:  Array of 5 tank IDs — AI teammate classes to fill alongside the player.
 *                  The player always occupies the 6th slot with their chosen tank class.
 *   enemyTeam:     Array of 6 tank IDs — the full enemy AI team composition.
 *
 * Tank IDs match keys in TankDefs.js: 'standard', 'scout', 'heavy', 'artillery',
 * 'flameTank', 'shieldTank', 'jumpTank', 'siegeTank'.
 *
 * Note: AI tanks may include classes the player hasn't unlocked yet (e.g. Heavy
 * appears in Bronze ally AI). This is intentional — AI teams are not constrained
 * by the shop's league unlock system.
 */

/**
 * Per-league team composition definitions.
 * Keyed by league ID (matches LeagueDefs.js keys).
 */
export const TeamCompositions = {
  /**
   * Bronze league.
   * Player team: 4 Standard, 1 Scout, 1 Heavy.
   * Enemy team:  5 Standard, 1 Scout.
   * AI fills the remaining 5 player-team slots; player takes one slot with their tank.
   */
  bronze: {
    leagueId: 'bronze',
    playerTeamAI: [
      'standard',
      'standard',
      'standard',
      'scout',
      'heavy',
    ],
    enemyTeam: [
      'standard',
      'standard',
      'standard',
      'standard',
      'standard',
      'scout',
    ],
  },

  /**
   * Silver league.
   * Player team: 3 Standard, 1 Scout, 1 Heavy, 1 Artillery.
   * Enemy team:  3 Standard, 1 Scout, 1 Heavy, 1 Artillery.
   */
  silver: {
    leagueId: 'silver',
    playerTeamAI: [
      'standard',
      'standard',
      'scout',
      'heavy',
      'artillery',
    ],
    enemyTeam: [
      'standard',
      'standard',
      'standard',
      'scout',
      'heavy',
      'artillery',
    ],
  },

  /**
   * Gold league.
   * Player team: 2 Standard, 1 Scout, 1 Heavy, 1 Artillery, 1 Flame Tank.
   * Enemy team:  Same composition (AI gains ability usage at Gold+).
   */
  gold: {
    leagueId: 'gold',
    playerTeamAI: [
      'standard',
      'scout',
      'heavy',
      'artillery',
      'flameTank',
    ],
    enemyTeam: [
      'standard',
      'standard',
      'scout',
      'heavy',
      'artillery',
      'flameTank',
    ],
  },

  /**
   * Platinum league.
   * Mixed roster from all classes unlocked through Platinum tier.
   * Full ability usage by all AI tanks.
   */
  platinum: {
    leagueId: 'platinum',
    playerTeamAI: [
      'scout',
      'heavy',
      'artillery',
      'flameTank',
      'shieldTank',
    ],
    enemyTeam: [
      'standard',
      'scout',
      'heavy',
      'artillery',
      'flameTank',
      'shieldTank',
    ],
  },

  /**
   * Diamond league.
   * Full mixed roster including Diamond-tier tanks.
   * Max-tier stats and aggressive AI behaviour.
   */
  diamond: {
    leagueId: 'diamond',
    playerTeamAI: [
      'heavy',
      'artillery',
      'flameTank',
      'jumpTank',
      'siegeTank',
    ],
    enemyTeam: [
      'scout',
      'heavy',
      'artillery',
      'flameTank',
      'jumpTank',
      'siegeTank',
    ],
  },

  /**
   * Champion league.
   * Full mixed roster, all eight classes represented across both teams.
   * Hardest AI settings — maximum aggression and coordination.
   */
  champion: {
    leagueId: 'champion',
    playerTeamAI: [
      'artillery',
      'flameTank',
      'shieldTank',
      'jumpTank',
      'siegeTank',
    ],
    enemyTeam: [
      'heavy',
      'artillery',
      'flameTank',
      'shieldTank',
      'jumpTank',
      'siegeTank',
    ],
  },
};

/**
 * Return the team composition definition for a given league.
 * Throws if the league ID is unknown.
 *
 * @param {string} leagueId — e.g. 'bronze', 'gold'
 * @returns {{ leagueId: string, playerTeamAI: string[], enemyTeam: string[] }}
 */
export function getTeamComposition(leagueId) {
  const comp = TeamCompositions[leagueId];
  if (!comp) {
    throw new Error(`[TeamCompositions] Unknown league id: "${leagueId}"`);
  }
  return comp;
}

/**
 * Return the 5 AI ally tank class IDs for the player's team in a given league.
 * The caller must prepend the player's chosen tank class to get the full 6-tank roster.
 *
 * @param {string} leagueId
 * @returns {string[]} Array of 5 tank IDs
 */
export function getAllyAISlots(leagueId) {
  return getTeamComposition(leagueId).playerTeamAI;
}

/**
 * Return the full 6-tank enemy team composition for a given league.
 *
 * @param {string} leagueId
 * @returns {string[]} Array of 6 tank IDs
 */
export function getEnemyTeam(leagueId) {
  return getTeamComposition(leagueId).enemyTeam;
}
