/**
 * TankDefs.test.js — unit tests for TankDefs data, helper functions, and the
 * TANK_STAT_MAX normalisation values used by LoadoutScreen's stat comparison
 * bars (t040).
 *
 * Run: node --test tests/TankDefs.test.js
 *
 * Verifies that all 8 tank classes are present with correct stats matching
 * VISION.md tables. Stat values come from TankDefs.js; relationships come
 * from VISION.md qualitative descriptions (e.g. Scout is faster than Standard).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TankDefs, TANK_ORDER, getTankDef } from '../src/data/TankDefs.js';
import { TANK_STAT_MAX } from '../src/ui/LoadoutScreen.js';

// ---------------------------------------------------------------------------
// Completeness
// ---------------------------------------------------------------------------

test('TANK_ORDER contains all 8 tank classes', () => {
  assert.equal(TANK_ORDER.length, 8);
});

test('TANK_ORDER lists classes in shop display order', () => {
  assert.deepEqual(TANK_ORDER, [
    'standard',
    'scout',
    'heavy',
    'artillery',
    'flameTank',
    'shieldTank',
    'jumpTank',
    'siegeTank',
  ]);
});

test('TankDefs keys match TANK_ORDER', () => {
  assert.deepEqual(Object.keys(TankDefs), TANK_ORDER);
});

// ---------------------------------------------------------------------------
// Required fields
// ---------------------------------------------------------------------------

test('every tank class has required fields with correct types', () => {
  const REQUIRED_NUMBER = ['hp', 'armor', 'speed', 'turnRate', 'damage', 'fireRate', 'range', 'price', 'abilityCooldown'];
  const REQUIRED_STRING = ['id', 'name', 'description', 'leagueRequired'];

  for (const id of TANK_ORDER) {
    const def = TankDefs[id];
    for (const field of REQUIRED_NUMBER) {
      assert.equal(typeof def[field], 'number', `${id}.${field} should be number`);
    }
    for (const field of REQUIRED_STRING) {
      assert.equal(typeof def[field], 'string', `${id}.${field} should be string`);
      assert.ok(def[field].length > 0, `${id}.${field} should not be empty`);
    }
    // ability is null or string
    assert.ok(
      def.ability === null || typeof def.ability === 'string',
      `${id}.ability should be null or string`
    );
  }
});

test('every tank class id field matches its key', () => {
  for (const id of TANK_ORDER) {
    assert.equal(TankDefs[id].id, id, `${id}.id should match its key`);
  }
});

// ---------------------------------------------------------------------------
// Shop prices — match VISION.md table
// ---------------------------------------------------------------------------

test('shop prices match VISION.md', () => {
  assert.equal(TankDefs.standard.price, 0);
  assert.equal(TankDefs.scout.price, 2000);
  assert.equal(TankDefs.heavy.price, 5000);
  assert.equal(TankDefs.artillery.price, 5000);
  assert.equal(TankDefs.flameTank.price, 8000);
  assert.equal(TankDefs.shieldTank.price, 15000);
  assert.equal(TankDefs.jumpTank.price, 15000);
  assert.equal(TankDefs.siegeTank.price, 25000);
});

// ---------------------------------------------------------------------------
// League requirements — match VISION.md table
// ---------------------------------------------------------------------------

test('league requirements match VISION.md', () => {
  assert.equal(TankDefs.standard.leagueRequired, 'bronze');
  assert.equal(TankDefs.scout.leagueRequired, 'bronze');
  assert.equal(TankDefs.heavy.leagueRequired, 'silver');
  assert.equal(TankDefs.artillery.leagueRequired, 'silver');
  assert.equal(TankDefs.flameTank.leagueRequired, 'gold');
  assert.equal(TankDefs.shieldTank.leagueRequired, 'platinum');
  assert.equal(TankDefs.jumpTank.leagueRequired, 'platinum');
  assert.equal(TankDefs.siegeTank.leagueRequired, 'diamond');
});

// ---------------------------------------------------------------------------
// Abilities — match VISION.md table
// ---------------------------------------------------------------------------

test('tank abilities match VISION.md', () => {
  assert.equal(TankDefs.standard.ability, null);
  assert.equal(TankDefs.scout.ability, null);
  assert.equal(TankDefs.heavy.ability, 'reactiveArmor');
  assert.equal(TankDefs.artillery.ability, 'barrage');
  assert.equal(TankDefs.flameTank.ability, 'infernoBurst');
  assert.equal(TankDefs.shieldTank.ability, 'energyShield');
  assert.equal(TankDefs.jumpTank.ability, 'rocketJump');
  assert.equal(TankDefs.siegeTank.ability, 'lockdownMode');
});

test('ability cooldowns match VISION.md', () => {
  assert.equal(TankDefs.standard.abilityCooldown, 0);
  assert.equal(TankDefs.scout.abilityCooldown, 0);
  assert.equal(TankDefs.heavy.abilityCooldown, 20);
  assert.equal(TankDefs.artillery.abilityCooldown, 30);
  assert.equal(TankDefs.flameTank.abilityCooldown, 20);
  assert.equal(TankDefs.shieldTank.abilityCooldown, 25);
  assert.equal(TankDefs.jumpTank.abilityCooldown, 15);
  assert.equal(TankDefs.siegeTank.abilityCooldown, 20);
});

test('tanks with no ability have abilityCooldown of 0', () => {
  for (const id of TANK_ORDER) {
    const def = TankDefs[id];
    if (def.ability === null) {
      assert.equal(def.abilityCooldown, 0, `${id} has no ability so cooldown should be 0`);
    }
  }
});

test('tanks with an ability have positive abilityCooldown', () => {
  for (const id of TANK_ORDER) {
    const def = TankDefs[id];
    if (def.ability !== null) {
      assert.ok(def.abilityCooldown > 0, `${id} has ability so cooldown should be positive`);
    }
  }
});

// ---------------------------------------------------------------------------
// HP stat relationships — from VISION.md class descriptions
// ---------------------------------------------------------------------------

test('Heavy has highest HP (most durable tank)', () => {
  const hp = (id) => TankDefs[id].hp;
  assert.ok(hp('heavy') > hp('standard'), 'heavy > standard HP');
  assert.ok(hp('heavy') > hp('scout'), 'heavy > scout HP');
});

test('Artillery has lowest or near-lowest HP (paper-thin armor)', () => {
  const hp = (id) => TankDefs[id].hp;
  // Artillery HP should be lower than standard, scout, heavy, shield, jump
  assert.ok(hp('artillery') < hp('standard'), 'artillery < standard HP');
  assert.ok(hp('artillery') < hp('heavy'), 'artillery < heavy HP');
  assert.ok(hp('artillery') < hp('shieldTank'), 'artillery < shieldTank HP');
});

test('Scout has less HP than Standard (light tank)', () => {
  assert.ok(TankDefs.scout.hp < TankDefs.standard.hp, 'scout HP < standard HP');
});

test('Siege Tank has highest HP overall (heavy armor, powerful tank)', () => {
  const hp = (id) => TankDefs[id].hp;
  for (const id of TANK_ORDER.filter((id) => id !== 'siegeTank')) {
    assert.ok(hp('siegeTank') >= hp(id), `siegeTank HP >= ${id} HP`);
  }
});

// ---------------------------------------------------------------------------
// Speed relationships — from VISION.md class descriptions
// ---------------------------------------------------------------------------

test('Scout is the fastest tank', () => {
  const speed = (id) => TankDefs[id].speed;
  for (const id of TANK_ORDER.filter((id) => id !== 'scout')) {
    assert.ok(speed('scout') > speed(id), `scout faster than ${id}`);
  }
});

test('Siege Tank is the slowest tank', () => {
  const speed = (id) => TankDefs[id].speed;
  for (const id of TANK_ORDER.filter((id) => id !== 'siegeTank')) {
    assert.ok(speed('siegeTank') <= speed(id), `siegeTank slower than or equal to ${id}`);
  }
});

test('Heavy is slower than Standard', () => {
  assert.ok(TankDefs.heavy.speed < TankDefs.standard.speed, 'heavy speed < standard speed');
});

// ---------------------------------------------------------------------------
// Armor relationships — from VISION.md class descriptions
// ---------------------------------------------------------------------------

test('armor values are in range [0, 1]', () => {
  for (const id of TANK_ORDER) {
    const armor = TankDefs[id].armor;
    assert.ok(armor >= 0 && armor <= 1, `${id}.armor in [0,1], got ${armor}`);
  }
});

test('Heavy has higher armor than Standard', () => {
  assert.ok(TankDefs.heavy.armor > TankDefs.standard.armor, 'heavy armor > standard armor');
});

test('Scout has no armor (paper-thin)', () => {
  assert.equal(TankDefs.scout.armor, 0, 'scout has 0 armor');
});

test('Artillery has no armor (paper-thin)', () => {
  assert.equal(TankDefs.artillery.armor, 0, 'artillery has 0 armor');
});

test('Siege Tank has highest armor', () => {
  for (const id of TANK_ORDER.filter((id) => id !== 'siegeTank')) {
    assert.ok(
      TankDefs.siegeTank.armor >= TankDefs[id].armor,
      `siegeTank armor >= ${id} armor`
    );
  }
});

// ---------------------------------------------------------------------------
// Damage and fire-rate relationships — from VISION.md class descriptions
// ---------------------------------------------------------------------------

test('Artillery has highest single-shot damage (devastating from distance)', () => {
  const dmg = (id) => TankDefs[id].damage;
  assert.ok(dmg('artillery') > dmg('standard'), 'artillery > standard damage');
  assert.ok(dmg('artillery') > dmg('scout'), 'artillery > scout damage');
});

test('Scout has lower damage than Standard but higher fire rate', () => {
  assert.ok(TankDefs.scout.damage < TankDefs.standard.damage, 'scout damage < standard damage');
  assert.ok(TankDefs.scout.fireRate > TankDefs.standard.fireRate, 'scout fireRate > standard fireRate');
});

test('Flame Tank has short effective range', () => {
  // Flame tank's range should be much shorter than standard
  assert.ok(TankDefs.flameTank.range < TankDefs.standard.range, 'flameTank range < standard range');
});

test('Artillery has the longest range', () => {
  const range = (id) => TankDefs[id].range;
  for (const id of TANK_ORDER.filter((id) => id !== 'artillery')) {
    assert.ok(range('artillery') > range(id), `artillery range > ${id} range`);
  }
});

test('Artillery has slow fire rate (long reload)', () => {
  // Artillery should have lower fire rate than standard
  assert.ok(TankDefs.artillery.fireRate < TankDefs.standard.fireRate, 'artillery fireRate < standard fireRate');
});

test('Heavy has slow fire rate (long reload)', () => {
  assert.ok(TankDefs.heavy.fireRate < TankDefs.standard.fireRate, 'heavy fireRate < standard fireRate');
});

// ---------------------------------------------------------------------------
// Visual properties
// ---------------------------------------------------------------------------

test('every tank has numeric colorBody and colorTurret', () => {
  for (const id of TANK_ORDER) {
    const def = TankDefs[id];
    assert.equal(typeof def.colorBody, 'number', `${id}.colorBody should be number`);
    assert.equal(typeof def.colorTurret, 'number', `${id}.colorTurret should be number`);
  }
});

test('every tank has numeric scaleHull', () => {
  for (const id of TANK_ORDER) {
    const def = TankDefs[id];
    assert.equal(typeof def.scaleHull, 'number', `${id}.scaleHull should be number`);
    assert.ok(def.scaleHull > 0, `${id}.scaleHull should be positive`);
  }
});

test('Scout is visually smaller than Standard (scaleHull)', () => {
  assert.ok(TankDefs.scout.scaleHull < TankDefs.standard.scaleHull, 'scout smaller than standard');
});

test('Heavy is visually larger than Standard (scaleHull)', () => {
  assert.ok(TankDefs.heavy.scaleHull > TankDefs.standard.scaleHull, 'heavy larger than standard');
});

test('Siege Tank is visually the largest tank', () => {
  for (const id of TANK_ORDER.filter((id) => id !== 'siegeTank')) {
    assert.ok(
      TankDefs.siegeTank.scaleHull >= TankDefs[id].scaleHull,
      `siegeTank scaleHull >= ${id}`
    );
  }
});

// ---------------------------------------------------------------------------
// getTankDef helper
// ---------------------------------------------------------------------------

test('getTankDef returns the correct entry for each class', () => {
  for (const id of TANK_ORDER) {
    const def = getTankDef(id);
    assert.equal(def.id, id);
  }
});

test('getTankDef throws for unknown id', () => {
  assert.throws(() => getTankDef('superTank'), /Unknown tank id/);
  assert.throws(() => getTankDef(''), /Unknown tank id/);
});

test('getTankDef returns exact same object reference as TankDefs', () => {
  for (const id of TANK_ORDER) {
    assert.strictEqual(getTankDef(id), TankDefs[id]);
  }
});

// ---------------------------------------------------------------------------
// distinct stat profiles — each tank is differentiated from the others
// ---------------------------------------------------------------------------

test('all 8 tanks have distinct speed values', () => {
  const speeds = TANK_ORDER.map((id) => TankDefs[id].speed);
  const uniqueSpeeds = new Set(speeds);
  assert.equal(uniqueSpeeds.size, 8, `expected 8 distinct speed values, got ${uniqueSpeeds.size}`);
});

test('Flame Tank has by far the highest fire rate (continuous flamethrower)', () => {
  for (const id of TANK_ORDER.filter((id) => id !== 'flameTank')) {
    assert.ok(
      TankDefs.flameTank.fireRate > TankDefs[id].fireRate,
      `flameTank fireRate > ${id} fireRate`
    );
  }
});

test('Artillery has the lowest fire rate (very slow reload)', () => {
  for (const id of TANK_ORDER.filter((id) => id !== 'artillery')) {
    assert.ok(
      TankDefs.artillery.fireRate <= TankDefs[id].fireRate,
      `artillery fireRate <= ${id} fireRate`
    );
  }
});

test('HP ordering: siegeTank > heavy > shieldTank > flameTank > standard ≥ jumpTank > scout > artillery', () => {
  const hp = (id) => TankDefs[id].hp;
  assert.ok(hp('siegeTank') > hp('heavy'),    'siegeTank > heavy');
  assert.ok(hp('heavy')     > hp('shieldTank'), 'heavy > shieldTank');
  assert.ok(hp('shieldTank') > hp('flameTank'), 'shieldTank > flameTank');
  assert.ok(hp('flameTank') > hp('standard'), 'flameTank > standard');
  assert.ok(hp('standard')  >= hp('jumpTank'), 'standard ≥ jumpTank');
  assert.ok(hp('jumpTank')  > hp('scout'),    'jumpTank > scout');
  assert.ok(hp('scout')     > hp('artillery'), 'scout > artillery');
});

// ---------------------------------------------------------------------------
// TANK_STAT_MAX normalisation (t040) — LoadoutScreen stat comparison bars
// ---------------------------------------------------------------------------

test('TANK_STAT_MAX.hp equals the highest hp across all tank classes', () => {
  const expected = Math.max(...TANK_ORDER.map((id) => TankDefs[id].hp));
  assert.equal(TANK_STAT_MAX.hp, expected);
  // Siege Tank has 250 hp — the roster maximum
  assert.equal(TANK_STAT_MAX.hp, 250, 'Siege Tank has the highest HP (250)');
});

test('TANK_STAT_MAX.speed equals the highest speed across all tank classes', () => {
  const expected = Math.max(...TANK_ORDER.map((id) => TankDefs[id].speed));
  assert.equal(TANK_STAT_MAX.speed, expected);
  // Scout has speed 20 — the roster maximum
  assert.equal(TANK_STAT_MAX.speed, 20, 'Scout has the highest speed (20)');
});

test('TANK_STAT_MAX.armor equals the highest armor fraction across all tank classes', () => {
  const expected = Math.max(...TANK_ORDER.map((id) => TankDefs[id].armor));
  assert.equal(TANK_STAT_MAX.armor, expected);
  // Siege Tank has armor 0.35 — the roster maximum
  assert.equal(TANK_STAT_MAX.armor, 0.35, 'Siege Tank has the highest armor (0.35)');
});

test('TANK_STAT_MAX.damage equals the highest damage across all tank classes', () => {
  const expected = Math.max(...TANK_ORDER.map((id) => TankDefs[id].damage));
  assert.equal(TANK_STAT_MAX.damage, expected);
  // Siege Tank has damage 90 — the roster maximum
  assert.equal(TANK_STAT_MAX.damage, 90, 'Siege Tank has the highest damage (90)');
});

test('all TANK_STAT_MAX values are positive', () => {
  for (const [key, val] of Object.entries(TANK_STAT_MAX)) {
    assert.ok(val > 0, `TANK_STAT_MAX.${key} must be positive, got ${val}`);
  }
});

test('stat bar percentages are in [0, 100] for every tank and stat', () => {
  for (const id of TANK_ORDER) {
    const def = TankDefs[id];
    const checks = [
      { stat: 'hp',    value: def.hp,    max: TANK_STAT_MAX.hp },
      { stat: 'speed', value: def.speed, max: TANK_STAT_MAX.speed },
      { stat: 'armor', value: def.armor, max: TANK_STAT_MAX.armor },
      { stat: 'damage',value: def.damage,max: TANK_STAT_MAX.damage },
    ];
    for (const c of checks) {
      const pct = Math.round((c.value / c.max) * 100);
      assert.ok(pct >= 0 && pct <= 100,
        `${id}.${c.stat} pct=${pct} should be in [0, 100]`);
    }
  }
});

test('the hp leader renders a 100 % bar', () => {
  const pct = Math.round((TankDefs['siegeTank'].hp / TANK_STAT_MAX.hp) * 100);
  assert.equal(pct, 100, 'Siege Tank hp bar should be full width');
});

test('the speed leader renders a 100 % bar', () => {
  const pct = Math.round((TankDefs['scout'].speed / TANK_STAT_MAX.speed) * 100);
  assert.equal(pct, 100, 'Scout speed bar should be full width');
});
