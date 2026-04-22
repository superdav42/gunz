/**
 * LeagueDefs.test.js — unit tests for LeagueDefs data and helper functions.
 *
 * Run: node --test tests/LeagueDefs.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LeagueDefs,
  LEAGUE_ORDER,
  getLeagueDef,
  getLeagueForLP,
  lpFloorForLeague,
} from '../src/data/LeagueDefs.js';

// ---------------------------------------------------------------------------
// LeagueDefs structure
// ---------------------------------------------------------------------------

test('LeagueDefs contains all 6 leagues', () => {
  assert.deepEqual(Object.keys(LeagueDefs), LEAGUE_ORDER);
});

test('every league has required fields', () => {
  for (const id of LEAGUE_ORDER) {
    const def = LeagueDefs[id];
    assert.equal(typeof def.id, 'string', `${id}.id`);
    assert.equal(typeof def.name, 'string', `${id}.name`);
    assert.equal(typeof def.lpRequired, 'number', `${id}.lpRequired`);
    assert.equal(typeof def.upgradeTierCap, 'number', `${id}.upgradeTierCap`);
    assert.ok(def.upgradeTierCap >= 1 && def.upgradeTierCap <= 5, `${id}.upgradeTierCap in [1,5]`);
    assert.equal(typeof def.ai, 'object', `${id}.ai`);
    assert.equal(typeof def.lpGains, 'object', `${id}.lpGains`);
    assert.equal(typeof def.teamComposition, 'object', `${id}.teamComposition`);
  }
});

test('lpRequired is strictly increasing', () => {
  for (let i = 1; i < LEAGUE_ORDER.length; i++) {
    const prev = LeagueDefs[LEAGUE_ORDER[i - 1]].lpRequired;
    const curr = LeagueDefs[LEAGUE_ORDER[i]].lpRequired;
    assert.ok(curr > prev, `${LEAGUE_ORDER[i]}.lpRequired (${curr}) > ${LEAGUE_ORDER[i-1]}.lpRequired (${prev})`);
  }
});

test('champion promotionLp is null', () => {
  assert.equal(LeagueDefs.champion.promotionLp, null);
});

test('lpRequired matches VISION.md table', () => {
  assert.equal(LeagueDefs.bronze.lpRequired, 0);
  assert.equal(LeagueDefs.silver.lpRequired, 500);
  assert.equal(LeagueDefs.gold.lpRequired, 1200);
  assert.equal(LeagueDefs.platinum.lpRequired, 2200);
  assert.equal(LeagueDefs.diamond.lpRequired, 3500);
  assert.equal(LeagueDefs.champion.lpRequired, 5000);
});

test('upgrade tier caps match VISION.md', () => {
  assert.equal(LeagueDefs.bronze.upgradeTierCap, 2);
  assert.equal(LeagueDefs.silver.upgradeTierCap, 3);
  assert.equal(LeagueDefs.gold.upgradeTierCap, 4);
  assert.equal(LeagueDefs.platinum.upgradeTierCap, 5);
  assert.equal(LeagueDefs.diamond.upgradeTierCap, 5);
  assert.equal(LeagueDefs.champion.upgradeTierCap, 5);
});

test('lpGains match VISION.md table for bronze', () => {
  const { lpGains } = LeagueDefs.bronze;
  assert.equal(lpGains.win20, 40);
  assert.equal(lpGains.win21, 25);
  assert.equal(lpGains.lose12, -10);
  assert.equal(lpGains.lose02, -20);
});

test('teamComposition: bronze ally has 5 slots, enemy has 6', () => {
  const tc = LeagueDefs.bronze.teamComposition;
  assert.equal(tc.ally.length, 5);
  assert.equal(tc.enemy.length, 6);
});

// ---------------------------------------------------------------------------
// getLeagueDef
// ---------------------------------------------------------------------------

test('getLeagueDef returns the correct entry', () => {
  const def = getLeagueDef('gold');
  assert.equal(def.id, 'gold');
  assert.equal(def.lpRequired, 1200);
});

test('getLeagueDef throws for unknown id', () => {
  assert.throws(() => getLeagueDef('mythril'), /Unknown league id/);
});

// ---------------------------------------------------------------------------
// lpFloorForLeague
// ---------------------------------------------------------------------------

test('lpFloorForLeague: bronze floor is 0', () => {
  assert.equal(lpFloorForLeague('bronze'), 0);
});

test('lpFloorForLeague: silver floor equals bronze lpRequired (0)', () => {
  assert.equal(lpFloorForLeague('silver'), LeagueDefs.bronze.lpRequired);
});

test('lpFloorForLeague: gold floor equals silver lpRequired (500)', () => {
  assert.equal(lpFloorForLeague('gold'), LeagueDefs.silver.lpRequired);
});

test('lpFloorForLeague: champion floor equals diamond lpRequired (3500)', () => {
  assert.equal(lpFloorForLeague('champion'), LeagueDefs.diamond.lpRequired);
});

// ---------------------------------------------------------------------------
// getLeagueForLP
// ---------------------------------------------------------------------------

test('getLeagueForLP: 0 → bronze', () => {
  assert.equal(getLeagueForLP(0), 'bronze');
});

test('getLeagueForLP: 499 → bronze', () => {
  assert.equal(getLeagueForLP(499), 'bronze');
});

test('getLeagueForLP: 500 → silver', () => {
  assert.equal(getLeagueForLP(500), 'silver');
});

test('getLeagueForLP: 1199 → silver', () => {
  assert.equal(getLeagueForLP(1199), 'silver');
});

test('getLeagueForLP: 1200 → gold', () => {
  assert.equal(getLeagueForLP(1200), 'gold');
});

test('getLeagueForLP: 2200 → platinum', () => {
  assert.equal(getLeagueForLP(2200), 'platinum');
});

test('getLeagueForLP: 3500 → diamond', () => {
  assert.equal(getLeagueForLP(3500), 'diamond');
});

test('getLeagueForLP: 5000 → champion', () => {
  assert.equal(getLeagueForLP(5000), 'champion');
});

test('getLeagueForLP: very large number → champion', () => {
  assert.equal(getLeagueForLP(999999), 'champion');
});
