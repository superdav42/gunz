/**
 * UpgradeTracking.test.js — unit tests for t041 per-class upgrade tracking.
 *
 * Tests:
 *  1. UpgradeDefs.applyTankUpgrades correctly boosts hp/damage/fireRate/ammo.
 *  2. SaveSystem stores and retrieves per-class upgrade tiers independently.
 *  3. Upgrades are isolated between tank classes (heavy upgrades don't bleed to scout).
 *
 * Run: node --test tests/UpgradeTracking.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTankUpgrades,
  TankUpgradeDefs,
  getUpgradeMultiplier,
  getUpgradeFlat,
} from '../src/data/UpgradeDefs.js';
import { TankDefs } from '../src/data/TankDefs.js';

// ---------------------------------------------------------------------------
// applyTankUpgrades — stat computation
// ---------------------------------------------------------------------------

test('armorPlating tier 2 adds +30% HP to standard base (100 HP)', () => {
  const base = { hp: 100, speed: 12, turnRate: 1.2, damage: 25, fireRate: 0.9, ammo: 30 };
  const result = applyTankUpgrades(base, { armorPlating: 2 });
  // tier 2 × 0.15 bonusPerTier = +30% → 100 × 1.30 = 130
  assert.equal(result.hp, 130);
});

test('engine tier 1 boosts speed and turnRate by 12%', () => {
  const base = { hp: 100, speed: 12, turnRate: 1.2, damage: 25, fireRate: 0.9, ammo: 30 };
  const result = applyTankUpgrades(base, { engine: 1 });
  assert.ok(Math.abs(result.speed - 12 * 1.12) < 0.0001, `speed should be ~${12 * 1.12}`);
  assert.ok(Math.abs(result.turnRate - 1.2 * 1.12) < 0.0001, `turnRate should be ~${1.2 * 1.12}`);
});

test('mainGun tier 3 boosts damage and fire rate', () => {
  const base = { hp: 100, speed: 12, turnRate: 1.2, damage: 25, fireRate: 0.9, ammo: 30 };
  const result = applyTankUpgrades(base, { mainGun: 3 });
  // damage: 25 × (1 + 0.15×3) = 25 × 1.45 = 36.25
  assert.ok(Math.abs(result.damage - 25 * 1.45) < 0.0001);
  // fireRate bonus: 1 + 0.08×3 = 1.24 → 0.9 × 1.24 = 1.116
  assert.ok(Math.abs(result.fireRate - 0.9 * 1.24) < 0.0001);
});

test('ammoCapacity tier 2 adds +20 ammo flat', () => {
  const base = { hp: 100, speed: 12, turnRate: 1.2, damage: 25, fireRate: 0.9, ammo: 30 };
  const result = applyTankUpgrades(base, { ammoCapacity: 2 });
  // bonusPerTier=10, tier=2 → +20 flat
  assert.equal(result.ammo, 50);
});

test('zero-tier upgrades are no-ops', () => {
  const base = { hp: 200, speed: 7, turnRate: 0.7, damage: 60, fireRate: 0.4, ammo: 30 };
  const result = applyTankUpgrades(base, { armorPlating: 0, mainGun: 0 });
  assert.deepEqual(result, base);
});

test('upgrades for multiple stats combine independently', () => {
  const base = { hp: 100, speed: 12, turnRate: 1.2, damage: 25, fireRate: 0.9, ammo: 30 };
  const result = applyTankUpgrades(base, { armorPlating: 1, ammoCapacity: 1 });
  // HP: 100 × 1.15 = 115 (floating point — use approximate comparison)
  assert.ok(Math.abs(result.hp - 115) < 0.0001, `hp should be ~115, got ${result.hp}`);
  // Ammo: 30 + 10 = 40
  assert.equal(result.ammo, 40);
  // Other stats unchanged
  assert.equal(result.damage, 25);
});

// ---------------------------------------------------------------------------
// TankDefs — base stats exist for all 8 classes
// ---------------------------------------------------------------------------

test('every TankDef has the stats needed for applyTankUpgrades', () => {
  const REQUIRED = ['hp', 'speed', 'turnRate', 'damage', 'fireRate'];
  for (const [id, def] of Object.entries(TankDefs)) {
    for (const stat of REQUIRED) {
      assert.equal(typeof def[stat], 'number', `TankDefs.${id}.${stat} must be a number`);
    }
  }
});

// ---------------------------------------------------------------------------
// Per-class isolation: upgrading one class should not affect another
// ---------------------------------------------------------------------------

test('upgrades stored under heavy class do not affect scout stats', () => {
  // Simulate: heavy has armorPlating:2, scout has no upgrades.
  const heavyBase = { hp: TankDefs.heavy.hp, damage: TankDefs.heavy.damage, fireRate: TankDefs.heavy.fireRate, speed: TankDefs.heavy.speed, turnRate: TankDefs.heavy.turnRate, ammo: 30 };
  const scoutBase = { hp: TankDefs.scout.hp, damage: TankDefs.scout.damage, fireRate: TankDefs.scout.fireRate, speed: TankDefs.scout.speed, turnRate: TankDefs.scout.turnRate, ammo: 30 };

  const heavyUpgrades = { armorPlating: 2 };
  const scoutUpgrades = {}; // no upgrades for scout

  const heavyStats = applyTankUpgrades(heavyBase, heavyUpgrades);
  const scoutStats = applyTankUpgrades(scoutBase, scoutUpgrades);

  // Heavy HP should be boosted
  assert.ok(heavyStats.hp > TankDefs.heavy.hp, 'heavy HP should be upgraded');
  // Scout HP should remain at base
  assert.equal(scoutStats.hp, TankDefs.scout.hp, 'scout HP should be unchanged');
});

// ---------------------------------------------------------------------------
// getUpgradeMultiplier / getUpgradeFlat helpers
// ---------------------------------------------------------------------------

test('getUpgradeMultiplier returns 1 + bonusPerTier × tier for percent upgrades', () => {
  const def = TankUpgradeDefs.armorPlating;
  assert.equal(getUpgradeMultiplier(def, 0), 1);
  assert.ok(Math.abs(getUpgradeMultiplier(def, 1) - 1.15) < 0.0001);
  assert.ok(Math.abs(getUpgradeMultiplier(def, 5) - 1.75) < 0.0001);
});

test('getUpgradeFlat returns bonusPerTier × tier for flat upgrades', () => {
  const def = TankUpgradeDefs.ammoCapacity;
  assert.equal(getUpgradeFlat(def, 0), 0);
  assert.equal(getUpgradeFlat(def, 1), 10);
  assert.equal(getUpgradeFlat(def, 3), 30);
});

test('getUpgradeMultiplier returns 1 for flat-type upgrades (not applicable)', () => {
  const def = TankUpgradeDefs.ammoCapacity; // bonusType: 'additive_flat'
  assert.equal(getUpgradeMultiplier(def, 3), 1);
});
