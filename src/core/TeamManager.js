import * as THREE from 'three';
import { Tank } from '../entities/Tank.js';

/**
 * TeamManager — creates and tracks two teams of 6 tanks for a 6v6 match.
 *
 * Team layout:
 *   Team 0 (player team, green): spawns on the south side (z = +SPAWN_Z).
 *     tanks[0] = the human-controlled player tank.
 *     tanks[1-5] = AI ally tanks.
 *   Team 1 (enemy team, red): spawns on the north side (z = -SPAWN_Z).
 *     tanks[0-5] = AI enemy tanks.
 *
 * Alive/dead tracking:
 *   Each slot is an object { tank, alive }.
 *   Call killTank(tank) when a tank is destroyed; it sets alive=false and
 *   removes the mesh from the scene.
 *   isTeamEliminated(teamId) returns true when all tank slots AND all
 *   registered soldiers on that team are dead.
 *
 * Soldier tracking (t029):
 *   When a tank occupant bails out as a Soldier, register the Soldier via
 *   registerSoldier(soldier, teamId) so the round-end check waits for the
 *   soldier to die before declaring the team eliminated.
 *   Call killSoldier(soldier) when a soldier's HP reaches 0.
 *   Call unregisterSoldier(soldier) when a soldier re-enters a tank (alive
 *   but no longer a free agent — removes from tracking without triggering
 *   the elimination check).
 *
 * Integration with EnemySystem / CollisionSystem:
 *   Use getEnemyTanks() to get the live enemy Tank instances so existing
 *   systems that iterate over an `active` array still work. EnemySystem
 *   should be replaced by AIController (t007) once TeamManager is in use.
 */

const TEAM_SIZE = 6;

// Spawn parameters
const SPAWN_Z = 55;          // north/south offset from centre
const SPAWN_SPREAD_X = 30;   // total X spread across spawn line
const SPAWN_ROW_DEPTH = 8;   // gap between two row groups (not used for single row)

// Team color palettes
const TEAM_COLORS = [
  { body: 0x2d5a27, turret: 0x3a7a33 }, // Team 0 — green (player side)
  { body: 0x8b2500, turret: 0xb03000 }, // Team 1 — red (enemy side)
];

export class TeamManager {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../entities/Terrain.js').Terrain} terrain
   */
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;

    /**
     * @type {Array<{id: number, name: string, slots: Array<{tank: Tank, alive: boolean}>}>}
     */
    this.teams = [];

    this._onTeamEliminatedCb = null;

    /**
     * Soldier tracking for round-end logic (t029).
     * Maps each active Soldier instance to its { teamId, alive } state.
     * Populated via registerSoldier() when a combatant bails out of a tank.
     * @type {Map<import('../entities/Soldier.js').Soldier, {teamId: number, alive: boolean}>}
     */
    this._soldiers = new Map();

    this._buildTeams();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * The human-controlled player Tank instance (always teams[0].slots[0].tank).
   * @returns {Tank}
   */
  get player() {
    return this.teams[0].slots[0].tank;
  }

  /**
   * All living Tank instances on team 0 (player side, excluding the player).
   * @returns {Tank[]}
   */
  getAllyTanks() {
    return this.teams[0].slots
      .filter((slot, i) => i > 0 && slot.alive)
      .map(slot => slot.tank);
  }

  /**
   * All living Tank instances on team 1 (enemy side).
   * Compatible with EnemySystem's `.active` interface for CollisionSystem.
   * @returns {Tank[]}
   */
  getEnemyTanks() {
    return this.teams[1].slots
      .filter(slot => slot.alive)
      .map(slot => slot.tank);
  }

  /**
   * Returns living tanks for both teams as a flat array.
   * @returns {Tank[]}
   */
  getAllLivingTanks() {
    return this.teams.flatMap(team =>
      team.slots.filter(slot => slot.alive).map(slot => slot.tank)
    );
  }

  /**
   * Mark a tank as dead, remove its mesh from the scene.
   * Triggers the onTeamEliminated callback if the team is now wiped.
   *
   * @param {Tank} tank
   */
  killTank(tank) {
    for (const team of this.teams) {
      for (const slot of team.slots) {
        if (slot.tank === tank && slot.alive) {
          slot.alive = false;
          this.scene.remove(tank.mesh);
          if (this.isTeamEliminated(team.id) && this._onTeamEliminatedCb) {
            this._onTeamEliminatedCb(team.id);
          }
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Returns true when every tank slot AND every registered soldier on the
   * given team is dead.  A live soldier keeps the team in the fight even
   * after all tanks are destroyed.
   * @param {number} teamId — 0 or 1
   * @returns {boolean}
   */
  isTeamEliminated(teamId) {
    const team = this.teams[teamId];
    if (!team) return false;
    if (!team.slots.every(slot => !slot.alive)) return false;
    // Check registered soldiers — any live soldier keeps the team alive.
    for (const [, entry] of this._soldiers) {
      if (entry.teamId === teamId && entry.alive) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Soldier tracking (t029)
  // ---------------------------------------------------------------------------

  /**
   * Register a live Soldier so the round-end check waits for it to die.
   * Call this immediately after spawning a soldier from a bailed-out tank,
   * BEFORE calling killTank() for that tank, to prevent a false early
   * team-elimination signal.
   *
   * @param {import('../entities/Soldier.js').Soldier} soldier
   * @param {number} teamId — 0 or 1
   */
  registerSoldier(soldier, teamId) {
    this._soldiers.set(soldier, { teamId, alive: true });
  }

  /**
   * Mark a soldier as dead.  Removes their mesh from the scene if still
   * attached, then checks whether the team is now fully eliminated.
   *
   * @param {import('../entities/Soldier.js').Soldier} soldier
   * @returns {boolean} true if the soldier was found and marked dead.
   */
  killSoldier(soldier) {
    const entry = this._soldiers.get(soldier);
    if (!entry || !entry.alive) return false;

    entry.alive = false;

    // Remove mesh from scene if it hasn't already been removed.
    if (soldier.mesh && soldier.mesh.parent) {
      this.scene.remove(soldier.mesh);
    }

    if (this.isTeamEliminated(entry.teamId) && this._onTeamEliminatedCb) {
      this._onTeamEliminatedCb(entry.teamId);
    }

    return true;
  }

  /**
   * Remove a soldier from tracking without killing them.
   * Use this when a soldier re-enters a tank (alive, just no longer a
   * free combatant).  Does NOT trigger the elimination check.
   *
   * @param {import('../entities/Soldier.js').Soldier} soldier
   * @returns {boolean} true if the soldier was found and removed.
   */
  unregisterSoldier(soldier) {
    return this._soldiers.delete(soldier);
  }

  /**
   * Count living tanks per team.
   * @returns {{team0: number, team1: number}}
   */
  getAliveCounts() {
    return {
      team0: this.teams[0].slots.filter(s => s.alive).length,
      team1: this.teams[1].slots.filter(s => s.alive).length,
    };
  }

  /**
   * Register a callback called when a team is fully eliminated.
   * @param {(teamId: number) => void} cb
   */
  onTeamEliminated(cb) {
    this._onTeamEliminatedCb = cb;
    return this;
  }

  /**
   * Reset both teams to full health, restore meshes to scene, reposition.
   * Also clears all registered soldiers — PlayerController.reset() removes
   * the soldier mesh; this ensures the tracking map starts clean.
   * Called by MatchManager/round reset (t009).
   */
  reset() {
    // Clear soldier tracking before restoring tank slots so no stale entries
    // prevent the first-round elimination check from working correctly.
    this._soldiers.clear();

    for (const team of this.teams) {
      const isPlayerTeam = team.id === 0;
      for (let i = 0; i < team.slots.length; i++) {
        const slot = team.slots[i];
        slot.alive = true;
        slot.tank.reset();

        // Restore mesh if it was removed from the scene
        if (!slot.tank.mesh.parent) {
          this.scene.add(slot.tank.mesh);
        }

        // Reposition
        const spawnPos = this._spawnPosition(i, isPlayerTeam ? 0 : 1);
        slot.tank.mesh.position.copy(spawnPos);
        slot.tank.mesh.rotation.y = isPlayerTeam ? 0 : Math.PI;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Tank class IDs assigned to each slot in a 6-tank team.
   * Slot 0 is always the player (their chosen class — overridden at runtime when
   * the loadout system is in place; 'standard' is the placeholder until t040).
   * Slots 1-5 are AI teammates; varied classes make team composition visible on the
   * field.  Full league-based composition tables land in t038.
   */
  static get AI_ALLY_CLASSES() {
    return ['standard', 'scout', 'heavy', 'artillery', 'standard'];
  }

  static get AI_ENEMY_CLASSES() {
    return ['standard', 'scout', 'heavy', 'artillery', 'standard', 'heavy'];
  }

  _buildTeams() {
    // Team 0 — player side
    const playerTeam = {
      id: 0,
      name: 'Player Team',
      slots: [],
    };

    for (let i = 0; i < TEAM_SIZE; i++) {
      const isPlayer = i === 0;
      // Slot 0 = player (defaults to 'standard' until the loadout system from t040
      // sets a real selection).  Slots 1-5 = AI allies with varied classes.
      const tankClassId = isPlayer
        ? 'standard'
        : TeamManager.AI_ALLY_CLASSES[i - 1] || 'standard';

      const tank = new Tank({
        isPlayer,
        color: TEAM_COLORS[0].body,
        turretColor: TEAM_COLORS[0].turret,
        teamId: 0,
        name: isPlayer ? 'Player' : `Ally ${i}`,
        tankClassId,
      });

      const pos = this._spawnPosition(i, 0);
      tank.mesh.position.copy(pos);
      tank.mesh.rotation.y = 0; // facing north

      this.scene.add(tank.mesh);
      playerTeam.slots.push({ tank, alive: true });
    }

    // Team 1 — enemy side
    const enemyTeam = {
      id: 1,
      name: 'Enemy Team',
      slots: [],
    };

    for (let i = 0; i < TEAM_SIZE; i++) {
      const tankClassId = TeamManager.AI_ENEMY_CLASSES[i] || 'standard';

      const tank = new Tank({
        isPlayer: false,
        color: TEAM_COLORS[1].body,
        turretColor: TEAM_COLORS[1].turret,
        teamId: 1,
        name: `Enemy #${i + 1}`,
        tankClassId,
      });

      const pos = this._spawnPosition(i, 1);
      tank.mesh.position.copy(pos);
      tank.mesh.rotation.y = Math.PI; // facing south

      this.scene.add(tank.mesh);
      enemyTeam.slots.push({ tank, alive: true });
    }

    this.teams.push(playerTeam, enemyTeam);
  }

  /**
   * Calculate spawn position for a given slot index and team side.
   *
   * Team 0 spawns along z = +SPAWN_Z (south).
   * Team 1 spawns along z = -SPAWN_Z (north).
   * Tanks are evenly spaced across the X axis within SPAWN_SPREAD_X.
   *
   * @param {number} index — 0..5
   * @param {number} teamId — 0 or 1
   * @returns {THREE.Vector3}
   */
  _spawnPosition(index, teamId) {
    // Spread tanks evenly: positions at -SPREAD/2, ..., +SPREAD/2
    const step = SPAWN_SPREAD_X / (TEAM_SIZE - 1);
    const x = -SPAWN_SPREAD_X / 2 + index * step;
    const z = teamId === 0 ? SPAWN_Z : -SPAWN_Z;

    const y = this.terrain ? this.terrain.getHeightAt(x, z) : 0;
    return new THREE.Vector3(x, y, z);
  }
}
