/**
 * LeagueSystem.test.js — unit tests for LeagueSystem LP tracking and promotion logic.
 *
 * Run: node --test tests/LeagueSystem.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LeagueSystem } from '../src/systems/LeagueSystem.js';

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

test('default construction starts at bronze, 0 LP', () => {
  const ls = new LeagueSystem();
  assert.equal(ls.leagueId, 'bronze');
  assert.equal(ls.lp, 0);
});

test('constructor accepts initial leagueId and lp', () => {
  const ls = new LeagueSystem({ leagueId: 'silver', lp: 800 });
  assert.equal(ls.leagueId, 'silver');
  assert.equal(ls.lp, 800);
});

test('constructor rejects unknown leagueId', () => {
  assert.throws(
    () => new LeagueSystem({ leagueId: 'mythril' }),
    /Unknown leagueId/
  );
});

// ---------------------------------------------------------------------------
// LP deltas from match results
// ---------------------------------------------------------------------------

test('applyMatchResult 2-0: +40 LP', () => {
  const ls = new LeagueSystem({ leagueId: 'bronze', lp: 100 });
  const result = ls.applyMatchResult({ playerWins: 2, enemyWins: 0 });
  assert.equal(result.lpDelta, 40);
  assert.equal(ls.lp, 140);
});

test('applyMatchResult 2-1: +25 LP', () => {
  const ls = new LeagueSystem({ leagueId: 'bronze', lp: 100 });
  const result = ls.applyMatchResult({ playerWins: 2, enemyWins: 1 });
  assert.equal(result.lpDelta, 25);
  assert.equal(ls.lp, 125);
});

test('applyMatchResult 1-2: -10 LP', () => {
  const ls = new LeagueSystem({ leagueId: 'bronze', lp: 100 });
  const result = ls.applyMatchResult({ playerWins: 1, enemyWins: 2 });
  assert.equal(result.lpDelta, -10);
  assert.equal(ls.lp, 90);
});

test('applyMatchResult 0-2: -20 LP', () => {
  const ls = new LeagueSystem({ leagueId: 'bronze', lp: 100 });
  const result = ls.applyMatchResult({ playerWins: 0, enemyWins: 2 });
  assert.equal(result.lpDelta, -20);
  assert.equal(ls.lp, 80);
});

test('applyMatchResult rejects invalid match result', () => {
  const ls = new LeagueSystem();
  assert.throws(
    () => ls.applyMatchResult({ playerWins: 3, enemyWins: 0 }),
    /Invalid match result/
  );
});

// ---------------------------------------------------------------------------
// LP floor (no demotion below tier floor)
// ---------------------------------------------------------------------------

test('LP cannot drop below 0 in bronze', () => {
  const ls = new LeagueSystem({ leagueId: 'bronze', lp: 10 });
  ls.applyMatchResult({ playerWins: 0, enemyWins: 2 }); // -20, floor at 0
  assert.equal(ls.lp, 0);
});

test('LP floor in silver is 0 (bronze lpRequired)', () => {
  // silver floor = bronze.lpRequired = 0
  const ls = new LeagueSystem({ leagueId: 'silver', lp: 510 });
  ls.applyMatchResult({ playerWins: 0, enemyWins: 2 }); // -20 → 490 (still silver)
  assert.equal(ls.lp, 490);
});

test('LP does not drop below silver floor via repeated losses', () => {
  // silver floor = 0 (bronze.lpRequired); start at 500
  const ls = new LeagueSystem({ leagueId: 'silver', lp: 505 });
  // -20 → 485, demoted to bronze since 485 < 500
  const result = ls.applyMatchResult({ playerWins: 0, enemyWins: 2 });
  assert.equal(result.demoted, true);
  assert.equal(ls.leagueId, 'bronze');
  // bronze floor is 0, LP should be 485
  assert.equal(ls.lp, 485);
});

// ---------------------------------------------------------------------------
// Promotion
// ---------------------------------------------------------------------------

test('promotes to silver when LP reaches 500 from bronze', () => {
  const ls = new LeagueSystem({ leagueId: 'bronze', lp: 460 });
  const result = ls.applyMatchResult({ playerWins: 2, enemyWins: 0 }); // +40 → 500
  assert.equal(ls.lp, 500);
  assert.equal(result.promoted, true);
  assert.equal(result.oldLeagueId, 'bronze');
  assert.equal(result.newLeagueId, 'silver');
  assert.equal(ls.leagueId, 'silver');
});

test('promotes to gold when LP reaches 1200 from silver', () => {
  const ls = new LeagueSystem({ leagueId: 'silver', lp: 1175 });
  const result = ls.applyMatchResult({ playerWins: 2, enemyWins: 0 }); // +40 → 1215
  assert.equal(result.promoted, true);
  assert.equal(ls.leagueId, 'gold');
});

test('no promotion flag when win stays within same league', () => {
  const ls = new LeagueSystem({ leagueId: 'bronze', lp: 100 });
  const result = ls.applyMatchResult({ playerWins: 2, enemyWins: 0 });
  assert.equal(result.promoted, false);
  assert.equal(result.demoted, false);
});

// ---------------------------------------------------------------------------
// Demotion
// ---------------------------------------------------------------------------

test('demotes to bronze when LP drops below 500', () => {
  const ls = new LeagueSystem({ leagueId: 'silver', lp: 505 });
  const result = ls.applyMatchResult({ playerWins: 0, enemyWins: 2 }); // -20 → 485
  assert.equal(result.demoted, true);
  assert.equal(result.oldLeagueId, 'silver');
  assert.equal(result.newLeagueId, 'bronze');
  assert.equal(ls.leagueId, 'bronze');
});

test('no demotion flag when loss stays within same league', () => {
  const ls = new LeagueSystem({ leagueId: 'silver', lp: 800 });
  const result = ls.applyMatchResult({ playerWins: 0, enemyWins: 2 }); // -20 → 780 (still silver)
  assert.equal(result.demoted, false);
  assert.equal(ls.leagueId, 'silver');
});

// ---------------------------------------------------------------------------
// Champion tier
// ---------------------------------------------------------------------------

test('champion tier: isMaxLeague is true', () => {
  const ls = new LeagueSystem({ leagueId: 'champion', lp: 5000 });
  assert.equal(ls.isMaxLeague, true);
});

test('non-champion: isMaxLeague is false', () => {
  const ls = new LeagueSystem({ leagueId: 'diamond', lp: 4000 });
  assert.equal(ls.isMaxLeague, false);
});

test('champion tier: lpToNextLeague is Infinity', () => {
  const ls = new LeagueSystem({ leagueId: 'champion', lp: 5000 });
  assert.equal(ls.lpToNextLeague, Infinity);
});

test('champion: no promotion on win', () => {
  const ls = new LeagueSystem({ leagueId: 'champion', lp: 5500 });
  const result = ls.applyMatchResult({ playerWins: 2, enemyWins: 0 });
  assert.equal(result.promoted, false);
  assert.equal(ls.leagueId, 'champion');
});

// ---------------------------------------------------------------------------
// Tier progress
// ---------------------------------------------------------------------------

test('tierProgress: 0 LP in bronze → 0', () => {
  const ls = new LeagueSystem({ leagueId: 'bronze', lp: 0 });
  assert.equal(ls.tierProgress, 0);
});

test('tierProgress: 250 LP in bronze (mid-way to 500) → ~0.5', () => {
  const ls = new LeagueSystem({ leagueId: 'bronze', lp: 250 });
  assert.ok(Math.abs(ls.tierProgress - 0.5) < 0.01);
});

test('tierProgress: champion → 1.0', () => {
  const ls = new LeagueSystem({ leagueId: 'champion', lp: 5000 });
  assert.equal(ls.tierProgress, 1.0);
});

// ---------------------------------------------------------------------------
// Unlock / league checks
// ---------------------------------------------------------------------------

test('meetsLeagueRequirement: silver player meets bronze requirement', () => {
  const ls = new LeagueSystem({ leagueId: 'silver', lp: 600 });
  assert.equal(ls.meetsLeagueRequirement('bronze'), true);
});

test('meetsLeagueRequirement: bronze player does not meet silver requirement', () => {
  const ls = new LeagueSystem({ leagueId: 'bronze', lp: 200 });
  assert.equal(ls.meetsLeagueRequirement('silver'), false);
});

test('upgradeTierCap: gold → 4', () => {
  const ls = new LeagueSystem({ leagueId: 'gold', lp: 1300 });
  assert.equal(ls.upgradeTierCap, 4);
});

test('canAffordUpgradeTier: bronze cannot buy tier 3', () => {
  const ls = new LeagueSystem({ leagueId: 'bronze', lp: 200 });
  assert.equal(ls.canAffordUpgradeTier(3), false);
});

test('canAffordUpgradeTier: silver can buy tier 3', () => {
  const ls = new LeagueSystem({ leagueId: 'silver', lp: 700 });
  assert.equal(ls.canAffordUpgradeTier(3), true);
});

// ---------------------------------------------------------------------------
// loadFromSave
// ---------------------------------------------------------------------------

test('loadFromSave restores league and LP', () => {
  const ls = new LeagueSystem();
  ls.loadFromSave('gold', 1500);
  assert.equal(ls.leagueId, 'gold');
  assert.equal(ls.lp, 1500);
});

test('loadFromSave falls back to bronze on unknown leagueId', () => {
  const ls = new LeagueSystem();
  ls.loadFromSave('mythril', 9999);
  assert.equal(ls.leagueId, 'bronze');
});

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

test('getMatchHistory records applied results', () => {
  const ls = new LeagueSystem({ leagueId: 'bronze', lp: 100 });
  ls.applyMatchResult({ playerWins: 2, enemyWins: 0 });
  ls.applyMatchResult({ playerWins: 1, enemyWins: 2 });
  const history = ls.getMatchHistory();
  assert.equal(history.length, 2);
  assert.equal(history[0].lpDelta, 40);
  assert.equal(history[1].lpDelta, -10);
});
