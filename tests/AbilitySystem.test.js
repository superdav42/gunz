/**
 * AbilitySystem.test.js — Unit tests for the AbilitySystem cooldown management.
 *
 * Run: node --test tests/AbilitySystem.test.js
 *
 * Covers:
 *  - Initial state (both slots ready, IDs null)
 *  - setTankDef / setWeaponDef configure slots correctly
 *  - tryActivateTankAbility / tryActivateWeaponAbility return ID on first call
 *  - Cooldown prevents double-activation
 *  - update(dt) drains the cooldown timer
 *  - Slot becomes ready again once cooldown reaches 0
 *  - reset() clears both cooldowns
 *  - Slots with no ability always return null on activate
 *  - tankCooldownFraction and weaponCooldownFraction return expected values
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AbilitySystem } from '../src/systems/AbilitySystem.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Minimal tank def that mirrors TankDefs shape. */
function makeTankDef(ability, cooldown) {
  return { ability, abilityCooldown: cooldown };
}

/** Minimal weapon def that mirrors WeaponDefs shape. */
function makeWeaponDef(ability, cooldown) {
  return { ability, abilityCooldown: cooldown };
}

// ── Initial state ────────────────────────────────────────────────────────────

test('initial state: both slots have null ability IDs', () => {
  const sys = new AbilitySystem();
  assert.equal(sys.tankAbilityId, null);
  assert.equal(sys.weaponAbilityId, null);
});

test('initial state: both slots are not ready (no ability configured)', () => {
  const sys = new AbilitySystem();
  assert.equal(sys.tankReady, false);
  assert.equal(sys.weaponReady, false);
});

test('initial state: cooldown fractions are 0', () => {
  const sys = new AbilitySystem();
  assert.equal(sys.tankCooldownFraction, 0);
  assert.equal(sys.weaponCooldownFraction, 0);
});

test('initial state: tryActivateTankAbility returns null', () => {
  const sys = new AbilitySystem();
  assert.equal(sys.tryActivateTankAbility(), null);
});

test('initial state: tryActivateWeaponAbility returns null', () => {
  const sys = new AbilitySystem();
  assert.equal(sys.tryActivateWeaponAbility(), null);
});

// ── setTankDef ────────────────────────────────────────────────────────────────

test('setTankDef: stores ability id and cooldown', () => {
  const sys = new AbilitySystem();
  sys.setTankDef(makeTankDef('infernoBurst', 20));
  assert.equal(sys.tankAbilityId, 'infernoBurst');
  assert.equal(sys.tankReady, true);
});

test('setTankDef: null ability → slot never ready', () => {
  const sys = new AbilitySystem();
  sys.setTankDef(makeTankDef(null, 0));
  assert.equal(sys.tankReady, false);
  assert.equal(sys.tryActivateTankAbility(), null);
});

test('setTankDef: resets cooldown to 0 (ready at round start)', () => {
  const sys = new AbilitySystem();
  sys.setTankDef(makeTankDef('energyShield', 25));
  sys.tryActivateTankAbility(); // put on cooldown
  // Reconfiguring mid-round (e.g. restart) should reset the timer
  sys.setTankDef(makeTankDef('energyShield', 25));
  assert.equal(sys.tankReady, true);
});

// ── setWeaponDef ─────────────────────────────────────────────────────────────

test('setWeaponDef: stores ability id and cooldown', () => {
  const sys = new AbilitySystem();
  sys.setWeaponDef(makeWeaponDef('clusterBomb', 18));
  assert.equal(sys.weaponAbilityId, 'clusterBomb');
  assert.equal(sys.weaponReady, true);
});

test('setWeaponDef: null ability → slot never ready', () => {
  const sys = new AbilitySystem();
  sys.setWeaponDef(makeWeaponDef(null, 0));
  assert.equal(sys.weaponReady, false);
  assert.equal(sys.tryActivateWeaponAbility(), null);
});

// ── Activation ───────────────────────────────────────────────────────────────

test('tryActivateTankAbility: returns ability id on first call when ready', () => {
  const sys = new AbilitySystem();
  sys.setTankDef(makeTankDef('rocketJump', 15));
  const result = sys.tryActivateTankAbility();
  assert.equal(result, 'rocketJump');
});

test('tryActivateTankAbility: returns null on second call (on cooldown)', () => {
  const sys = new AbilitySystem();
  sys.setTankDef(makeTankDef('rocketJump', 15));
  sys.tryActivateTankAbility(); // activates
  const second = sys.tryActivateTankAbility(); // on cooldown
  assert.equal(second, null);
});

test('tryActivateWeaponAbility: returns ability id on first call when ready', () => {
  const sys = new AbilitySystem();
  sys.setWeaponDef(makeWeaponDef('dashStrike', 12));
  const result = sys.tryActivateWeaponAbility();
  assert.equal(result, 'dashStrike');
});

test('tryActivateWeaponAbility: returns null on second call (on cooldown)', () => {
  const sys = new AbilitySystem();
  sys.setWeaponDef(makeWeaponDef('dashStrike', 12));
  sys.tryActivateWeaponAbility();
  assert.equal(sys.tryActivateWeaponAbility(), null);
});

test('activation sets slot to not-ready', () => {
  const sys = new AbilitySystem();
  sys.setTankDef(makeTankDef('barrage', 30));
  assert.equal(sys.tankReady, true);
  sys.tryActivateTankAbility();
  assert.equal(sys.tankReady, false);
});

// ── Cooldown drain (update) ───────────────────────────────────────────────────

test('update(dt): cooldown drains over time', () => {
  const sys = new AbilitySystem();
  sys.setTankDef(makeTankDef('lockdownMode', 20));
  sys.tryActivateTankAbility(); // cooldown = 20
  sys.update(5);  // 15 remaining
  assert.equal(sys.tankCooldownRemaining, 15);
});

test('update(dt): cooldown reaches 0 and slot becomes ready', () => {
  const sys = new AbilitySystem();
  sys.setTankDef(makeTankDef('reactiveArmor', 20));
  sys.tryActivateTankAbility(); // cooldown = 20
  sys.update(20); // fully drained
  assert.equal(sys.tankReady, true);
  assert.equal(sys.tankCooldownRemaining, 0);
});

test('update(dt): cooldown does not go below 0', () => {
  const sys = new AbilitySystem();
  sys.setTankDef(makeTankDef('infernoBurst', 20));
  sys.tryActivateTankAbility();
  sys.update(100); // way past cooldown
  assert.equal(sys.tankCooldownRemaining, 0);
  assert.equal(sys.tankReady, true);
});

test('update(dt): weapon cooldown drains independently of tank', () => {
  const sys = new AbilitySystem();
  sys.setTankDef(makeTankDef('barrage', 30));
  sys.setWeaponDef(makeWeaponDef('lockOn', 15));
  sys.tryActivateTankAbility();    // tank: 30s cooldown
  sys.tryActivateWeaponAbility();  // weapon: 15s cooldown
  sys.update(15);
  assert.equal(sys.weaponReady, true);   // weapon fully drained
  assert.equal(sys.tankReady, false);    // tank still on cooldown (15 remaining)
  assert.equal(sys.tankCooldownRemaining, 15);
});

// ── cooldownFraction ─────────────────────────────────────────────────────────

test('tankCooldownFraction: 1.0 just after activation', () => {
  const sys = new AbilitySystem();
  sys.setTankDef(makeTankDef('energyShield', 25));
  sys.tryActivateTankAbility();
  assert.equal(sys.tankCooldownFraction, 1.0);
});

test('tankCooldownFraction: 0.5 at half-cooldown', () => {
  const sys = new AbilitySystem();
  sys.setTankDef(makeTankDef('energyShield', 20));
  sys.tryActivateTankAbility();
  sys.update(10); // half elapsed
  assert.equal(sys.tankCooldownFraction, 0.5);
});

test('tankCooldownFraction: 0 when fully ready', () => {
  const sys = new AbilitySystem();
  sys.setTankDef(makeTankDef('energyShield', 20));
  sys.tryActivateTankAbility();
  sys.update(20);
  assert.equal(sys.tankCooldownFraction, 0);
});

test('weaponCooldownFraction: 0 when no cooldown configured', () => {
  const sys = new AbilitySystem();
  sys.setWeaponDef(makeWeaponDef(null, 0));
  assert.equal(sys.weaponCooldownFraction, 0);
});

// ── reset ─────────────────────────────────────────────────────────────────────

test('reset: clears tank cooldown — slot becomes ready', () => {
  const sys = new AbilitySystem();
  sys.setTankDef(makeTankDef('barrage', 30));
  sys.tryActivateTankAbility(); // on cooldown
  sys.reset();
  assert.equal(sys.tankReady, true);
  assert.equal(sys.tankCooldownRemaining, 0);
});

test('reset: clears weapon cooldown — slot becomes ready', () => {
  const sys = new AbilitySystem();
  sys.setWeaponDef(makeWeaponDef('novaBlast', 25));
  sys.tryActivateWeaponAbility();
  sys.reset();
  assert.equal(sys.weaponReady, true);
  assert.equal(sys.weaponCooldownRemaining, 0);
});

test('reset: both slots cleared simultaneously', () => {
  const sys = new AbilitySystem();
  sys.setTankDef(makeTankDef('infernoBurst', 20));
  sys.setWeaponDef(makeWeaponDef('overcharge', 20));
  sys.tryActivateTankAbility();
  sys.tryActivateWeaponAbility();
  sys.reset();
  assert.equal(sys.tankReady, true);
  assert.equal(sys.weaponReady, true);
});

// ── Re-activation after cooldown ──────────────────────────────────────────────

test('slot can be re-activated after cooldown expires', () => {
  const sys = new AbilitySystem();
  sys.setTankDef(makeTankDef('rocketJump', 15));
  assert.equal(sys.tryActivateTankAbility(), 'rocketJump'); // first use
  sys.update(15); // cooldown done
  assert.equal(sys.tryActivateTankAbility(), 'rocketJump'); // second use
});
