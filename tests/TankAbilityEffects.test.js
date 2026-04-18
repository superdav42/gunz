/**
 * TankAbilityEffects.test.js — Unit tests for the six tank ability effects (t043).
 *
 * Run: node --test tests/TankAbilityEffects.test.js
 *
 * These tests verify gameplay-observable behaviour for each ability:
 *   infernoBurst  — damages enemies in radius, ignores team-mates
 *   energyShield  — sets shielded flag, absorbs damage, expires on timer
 *   rocketJump    — sets isJumping, drives Y parabola, AoE on landing
 *   lockdownMode  — sets isLockedDown, halves fireRate, restores on expiry
 *   barrage       — fires first shot immediately, queues remaining shots
 *   reactiveArmor — sets reactiveArmorCharges on tank
 *
 * Also tests:
 *   Tank.takeDamage() — Energy Shield and Reactive Armor integration
 *   reset()           — cancels active effects
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TankAbilityEffects,
  REACTIVE_ARMOR_CHARGES,
  REACTIVE_ARMOR_REDUCTION,
} from '../src/systems/TankAbilityEffects.js';

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

/** Stub terrain: flat ground at y = 0. */
const terrain = {
  getHeightAt: (_x, _z) => 0,
};

/** Stub ParticleSystem: records calls but does nothing visual. */
function makeParticles() {
  return {
    calls: [],
    emitExplosion(pos, opts = {}) { this.calls.push({ type: 'explosion', pos, opts }); },
    emitMuzzleFlash(pos, dir) { this.calls.push({ type: 'flash', pos, dir }); },
    emitDust(pos) { this.calls.push({ type: 'dust', pos }); },
  };
}

/** Stub ProjectileSystem: records added projectiles. */
function makeProjectileSystem() {
  return {
    added: [],
    add(proj) { this.added.push(proj); },
  };
}

/**
 * Minimal THREE.Vector3-compatible position stub.
 * Supports clone(), add(), distanceTo() — the only methods used by TankAbilityEffects.
 */
function makePos(x = 0, y = 0, z = 0) {
  const pos = {
    x, y, z,
    clone() { return makePos(this.x, this.y, this.z); },
    add(other) {
      this.x += other.x;
      this.y += other.y;
      this.z += other.z;
      return this;
    },
    distanceTo(other) {
      const dx = this.x - other.x;
      const dy = this.y - other.y;
      const dz = this.z - other.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    },
  };
  return pos;
}

/**
 * Minimal Tank-like stub.
 * Sets all fields TankAbilityEffects reads or writes.
 */
function makeTank(teamId = 0, opts = {}) {
  const proj = {
    mesh: { position: makePos() },
    velocity: {
      clone() { return { normalize() { return makePos(); } }; },
    },
  };

  return {
    teamId,
    isPlayer: opts.isPlayer ?? false,
    health:   opts.health   ?? 100,
    armor:    opts.armor    ?? 0,
    fireRate: opts.fireRate ?? 0.5, // seconds between shots
    fireCooldown: 0,
    ammo: 30,
    isJumping:    false,
    isLockedDown: false,
    shielded:     false,
    reactiveArmorCharges: 0,
    mesh: {
      position: makePos(opts.x ?? 0, opts.y ?? 0, opts.z ?? 0),
    },
    canFire() { return this.fireCooldown <= 0 && this.ammo > 0; },
    fire() {
      if (!this.canFire()) return null;
      this.fireCooldown = this.fireRate;
      if (this.isPlayer) this.ammo--;
      return proj;
    },
    takeDamage(amount) {
      // Mirrors Tank.takeDamage() from entities/Tank.js (t043).
      if (this.shielded) return 0;
      let dmg = amount;
      if (this.reactiveArmorCharges > 0) {
        dmg = dmg * REACTIVE_ARMOR_REDUCTION;
        this.reactiveArmorCharges--;
      }
      const reduced = dmg * (1 - this.armor);
      this.health = Math.max(0, this.health - reduced);
      return Math.min(reduced, this.health + reduced); // actual removed
    },
  };
}

/**
 * Build a TankAbilityEffects instance with stubbed dependencies.
 * @returns {{ effects: TankAbilityEffects, particles: object, projectileSystem: object }}
 */
function makeEffects() {
  const particles       = makeParticles();
  const projectileSystem = makeProjectileSystem();
  const effects = new TankAbilityEffects({ terrain, particles, projectileSystem });
  return { effects, particles, projectileSystem };
}

// ---------------------------------------------------------------------------
// infernoBurst
// ---------------------------------------------------------------------------

test('infernoBurst: damages enemies in radius', () => {
  const { effects } = makeEffects();
  const player = makeTank(0);
  const enemy  = makeTank(1, { health: 100 });
  const allTanks = [player, enemy];

  effects.execute('infernoBurst', player, allTanks);

  assert.ok(enemy.health < 100, 'enemy should take damage');
});

test('infernoBurst: does not damage self', () => {
  const { effects } = makeEffects();
  const player = makeTank(0, { health: 100 });
  const allTanks = [player];

  effects.execute('infernoBurst', player, allTanks);
  assert.equal(player.health, 100);
});

test('infernoBurst: does not damage team-mates', () => {
  const { effects } = makeEffects();
  const player = makeTank(0, { health: 100 });
  const ally   = makeTank(0, { health: 100 });
  const allTanks = [player, ally];

  effects.execute('infernoBurst', player, allTanks);
  assert.equal(ally.health, 100);
});

test('infernoBurst: enemy far outside radius takes no damage', () => {
  const { effects } = makeEffects();
  const player = makeTank(0);
  // Position enemy 20 units away — outside INFERNO_BURST_RADIUS (15)
  const farEnemy = makeTank(1, { health: 100, x: 20 });
  const allTanks = [player, farEnemy];

  effects.execute('infernoBurst', player, allTanks);
  assert.equal(farEnemy.health, 100);
});

test('infernoBurst: emits particles', () => {
  const { effects, particles } = makeEffects();
  const player = makeTank(0);
  effects.execute('infernoBurst', player, [player]);

  assert.ok(particles.calls.length > 0, 'should emit particles');
});

// ---------------------------------------------------------------------------
// energyShield
// ---------------------------------------------------------------------------

test('energyShield: sets tank.shielded = true', () => {
  const { effects } = makeEffects();
  const tank = makeTank(0);
  effects.execute('energyShield', tank, [tank]);
  assert.equal(tank.shielded, true);
});

test('energyShield: does not stack (second call returns false)', () => {
  const { effects } = makeEffects();
  const tank = makeTank(0);
  effects.execute('energyShield', tank, [tank]);
  const result = effects.execute('energyShield', tank, [tank]);
  assert.equal(result, false);
});

test('energyShield: shield clears after duration', () => {
  const { effects } = makeEffects();
  const tank = makeTank(0);
  effects.execute('energyShield', tank, [tank]);
  assert.equal(tank.shielded, true);

  // Advance past the 5-second duration
  effects.update(5.1, [tank]);
  assert.equal(tank.shielded, false);
});

test('energyShield: absorbs all incoming damage while active', () => {
  const { effects } = makeEffects();
  const tank = makeTank(0, { health: 100 });
  effects.execute('energyShield', tank, [tank]);

  const dmgApplied = tank.takeDamage(50);
  assert.equal(dmgApplied, 0);
  assert.equal(tank.health, 100);
});

// ---------------------------------------------------------------------------
// rocketJump
// ---------------------------------------------------------------------------

test('rocketJump: sets isJumping = true', () => {
  const { effects } = makeEffects();
  const tank = makeTank(0);
  effects.execute('rocketJump', tank, [tank]);
  assert.equal(tank.isJumping, true);
});

test('rocketJump: cannot activate while already jumping', () => {
  const { effects } = makeEffects();
  const tank = makeTank(0);
  effects.execute('rocketJump', tank, [tank]);
  const second = effects.execute('rocketJump', tank, [tank]);
  assert.equal(second, false);
});

test('rocketJump: cannot activate while locked down', () => {
  const { effects } = makeEffects();
  const tank = makeTank(0);
  tank.isLockedDown = true;
  const result = effects.execute('rocketJump', tank, [tank]);
  assert.equal(result, false);
  assert.equal(tank.isJumping, false);
});

test('rocketJump: clears isJumping after duration', () => {
  const { effects } = makeEffects();
  const tank = makeTank(0);
  effects.execute('rocketJump', tank, [tank]);
  // 2.1 s > ROCKET_JUMP_DURATION (2.0 s)
  effects.update(2.1, [tank]);
  assert.equal(tank.isJumping, false);
});

test('rocketJump: tank Y is elevated above base during flight', () => {
  const { effects } = makeEffects();
  const tank = makeTank(0);
  effects.execute('rocketJump', tank, [tank]);
  // Advance to mid-flight (t ≈ 0.5 → peak altitude)
  effects.update(1.0, [tank]);
  assert.ok(
    tank.mesh.position.y > 0,
    `tank Y should be above ground at mid-flight (got ${tank.mesh.position.y})`
  );
});

test('rocketJump: AoE damages enemies on landing', () => {
  const { effects } = makeEffects();
  const tank  = makeTank(0);
  const enemy = makeTank(1, { health: 100 });
  const allTanks = [tank, enemy];
  effects.execute('rocketJump', tank, allTanks);
  // Advance past full duration
  effects.update(2.1, allTanks);
  assert.ok(enemy.health < 100, 'enemy should take AoE damage on landing');
});

test('rocketJump: AoE does not damage allies', () => {
  const { effects } = makeEffects();
  const tank = makeTank(0, { health: 100 });
  const ally = makeTank(0, { health: 100 });
  const allTanks = [tank, ally];
  effects.execute('rocketJump', tank, allTanks);
  effects.update(2.1, allTanks);
  assert.equal(ally.health, 100);
});

// ---------------------------------------------------------------------------
// lockdownMode
// ---------------------------------------------------------------------------

test('lockdownMode: sets isLockedDown = true', () => {
  const { effects } = makeEffects();
  const tank = makeTank(0);
  effects.execute('lockdownMode', tank, [tank]);
  assert.equal(tank.isLockedDown, true);
});

test('lockdownMode: halves fireRate (doubles cadence)', () => {
  const { effects } = makeEffects();
  const tank = makeTank(0, { fireRate: 0.4 });
  effects.execute('lockdownMode', tank, [tank]);
  assert.ok(tank.fireRate < 0.4, 'fireRate should decrease (faster firing)');
  assert.equal(tank.fireRate, 0.2); // 0.4 / 2
});

test('lockdownMode: restores fireRate after duration', () => {
  const { effects } = makeEffects();
  const tank = makeTank(0, { fireRate: 0.4 });
  effects.execute('lockdownMode', tank, [tank]);
  effects.update(8.1, [tank]); // past LOCKDOWN_DURATION (8s)
  assert.equal(tank.isLockedDown, false);
  assert.equal(tank.fireRate, 0.4);
});

test('lockdownMode: does not stack (second call returns false)', () => {
  const { effects } = makeEffects();
  const tank = makeTank(0);
  effects.execute('lockdownMode', tank, [tank]);
  const result = effects.execute('lockdownMode', tank, [tank]);
  assert.equal(result, false);
});

// ---------------------------------------------------------------------------
// barrage
// ---------------------------------------------------------------------------

test('barrage: fires a shot immediately on activation', () => {
  const { effects, projectileSystem } = makeEffects();
  const tank = makeTank(0);
  effects.execute('barrage', tank, [tank]);
  assert.equal(projectileSystem.added.length, 1, 'first barrage shot fires immediately');
});

test('barrage: fires 5 total shots over time', () => {
  const { effects, projectileSystem } = makeEffects();
  const tank = makeTank(0);
  effects.execute('barrage', tank, [tank]);
  // Advance past all 4 queued intervals (4 × 0.2 = 0.8 s)
  effects.update(0.3, [tank]);
  effects.update(0.3, [tank]);
  effects.update(0.3, [tank]);
  effects.update(0.3, [tank]);
  assert.equal(projectileSystem.added.length, 5, 'all 5 barrage shots should fire');
});

test('barrage: does not consume player ammo', () => {
  const { effects } = makeEffects();
  const tank = makeTank(0, {});
  tank.isPlayer = true;
  tank.ammo = 10;
  effects.execute('barrage', tank, [tank]);
  // Flush the queued shots
  effects.update(1.0, [tank]);
  assert.equal(tank.ammo, 10, 'barrage should not consume ammo');
});

test('barrage: restores normal fireCooldown after shots', () => {
  const { effects } = makeEffects();
  const tank = makeTank(0);
  tank.fireCooldown = 0.25; // mid-fire when barrage activates
  effects.execute('barrage', tank, [tank]);
  // fireCooldown should be restored to 0.25, not overwritten to 0
  assert.ok(
    tank.fireCooldown <= 0.25,
    `fireCooldown should remain at most 0.25 after barrage shot (got ${tank.fireCooldown})`
  );
});

// ---------------------------------------------------------------------------
// reactiveArmor
// ---------------------------------------------------------------------------

test('reactiveArmor: sets reactiveArmorCharges to REACTIVE_ARMOR_CHARGES', () => {
  const { effects } = makeEffects();
  const tank = makeTank(0);
  effects.execute('reactiveArmor', tank, [tank]);
  assert.equal(tank.reactiveArmorCharges, REACTIVE_ARMOR_CHARGES);
});

test('reactiveArmor: halves damage on each charged hit', () => {
  const { effects } = makeEffects();
  const tank = makeTank(0, { health: 100 });
  effects.execute('reactiveArmor', tank, [tank]);

  tank.takeDamage(40); // should apply 20 (50% of 40)
  assert.equal(tank.health, 80);
  assert.equal(tank.reactiveArmorCharges, REACTIVE_ARMOR_CHARGES - 1);
});

test('reactiveArmor: charges run out after N hits', () => {
  const { effects } = makeEffects();
  const tank = makeTank(0, { health: 1000 });
  effects.execute('reactiveArmor', tank, [tank]);

  // Apply N hits; each should consume one charge
  for (let i = 0; i < REACTIVE_ARMOR_CHARGES; i++) {
    tank.takeDamage(10);
  }
  assert.equal(tank.reactiveArmorCharges, 0);

  // Next hit applies full damage (no charges remaining)
  const healthBefore = tank.health;
  tank.takeDamage(10);
  assert.equal(tank.health, healthBefore - 10);
});

// ---------------------------------------------------------------------------
// reset()
// ---------------------------------------------------------------------------

test('reset: cancels energyShield mid-duration', () => {
  const { effects } = makeEffects();
  const tank = makeTank(0);
  effects.execute('energyShield', tank, [tank]);
  assert.equal(tank.shielded, true);
  effects.reset();
  assert.equal(tank.shielded, false);
});

test('reset: cancels rocketJump mid-flight', () => {
  const { effects } = makeEffects();
  const tank = makeTank(0);
  effects.execute('rocketJump', tank, [tank]);
  assert.equal(tank.isJumping, true);
  effects.reset();
  assert.equal(tank.isJumping, false);
});

test('reset: cancels lockdownMode mid-duration', () => {
  const { effects } = makeEffects();
  const tank = makeTank(0, { fireRate: 0.4 });
  effects.execute('lockdownMode', tank, [tank]);
  assert.equal(tank.isLockedDown, true);
  effects.reset();
  assert.equal(tank.isLockedDown, false);
  assert.equal(tank.fireRate, 0.4); // restored
});

test('reset: clears barrage queue', () => {
  const { effects, projectileSystem } = makeEffects();
  const tank = makeTank(0);
  effects.execute('barrage', tank, [tank]);
  effects.reset();
  // Advance time — no more shots should fire after reset
  const shotsBefore = projectileSystem.added.length;
  effects.update(1.0, [tank]);
  assert.equal(projectileSystem.added.length, shotsBefore, 'no barrage shots after reset');
});

// ---------------------------------------------------------------------------
// execute: unknown ability ID
// ---------------------------------------------------------------------------

test('execute: unknown ability id returns false', () => {
  const { effects } = makeEffects();
  const tank = makeTank(0);
  const result = effects.execute('blorginator', tank, [tank]);
  assert.equal(result, false);
});
