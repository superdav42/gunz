/**
 * ZoneSystem.test.js — unit tests for the river/mud movement-penalty zone system.
 *
 * Run: node --test tests/ZoneSystem.test.js
 *
 * ZoneSystem depends on THREE.js for mesh construction, but the logic under
 * test (getSpeedMultiplier, isInZone) is pure arithmetic — no WebGL context
 * needed.  We supply a minimal terrain stub and bypass Three.js mesh creation
 * by monkey-patching _buildVisuals to a no-op.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Minimal THREE.js stubs — only what ZoneSystem.js uses for _buildZonePlane.
// We override _buildVisuals so the real mesh code never runs in tests.
// ---------------------------------------------------------------------------

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// Patch globalThis.THREE so the ES module import of 'three' resolves.
// ZoneSystem does `import * as THREE from 'three'` — we intercept via
// a minimal global stub before the module loads.
// Since Node test runner uses native ESM, we set a side-channel via
// the node:module loader or simply rely on the fact that _buildVisuals
// is overridden before any construction (see test helper below).

// ---------------------------------------------------------------------------
// Terrain stub — getHeightAt returns 0 everywhere (flat ground).
// ---------------------------------------------------------------------------

const terrainStub = {
  getHeightAt: (_x, _z) => 0,
};

// ---------------------------------------------------------------------------
// Import ZoneSystem — Three.js will be resolved from node_modules.
// If Three.js is installed (it is — it's in package.json), the import succeeds.
// We override _buildVisuals immediately after construction.
// ---------------------------------------------------------------------------

import {
  ZoneSystem,
  ZONE_TANK_MULTIPLIER,
  ZONE_SOLDIER_MULTIPLIER,
} from '../src/systems/ZoneSystem.js';

/**
 * Helper: create a ZoneSystem without triggering Three.js WebGL calls.
 * Replaces _buildVisuals with a no-op before calling the constructor.
 */
function makeZoneSystem() {
  // Temporarily replace _buildVisuals on the prototype.
  const orig = ZoneSystem.prototype._buildVisuals;
  ZoneSystem.prototype._buildVisuals = function () { this._meshes = []; };
  const zs = new ZoneSystem({ add: () => {} }, terrainStub);
  ZoneSystem.prototype._buildVisuals = orig;
  return zs;
}

// ---------------------------------------------------------------------------
// Exported constant tests
// ---------------------------------------------------------------------------

test('ZONE_TANK_MULTIPLIER is 0.40', () => {
  assert.equal(ZONE_TANK_MULTIPLIER, 0.40);
});

test('ZONE_SOLDIER_MULTIPLIER is 0.60', () => {
  assert.equal(ZONE_SOLDIER_MULTIPLIER, 0.60);
});

// ---------------------------------------------------------------------------
// getSpeedMultiplier tests
// ---------------------------------------------------------------------------

test('getSpeedMultiplier returns 1.0 when outside all zones', () => {
  const zs = makeZoneSystem();
  // World origin is deliberately clear of any default zone.
  assert.equal(zs.getSpeedMultiplier(0, 0, 'tank'), 1.0);
  assert.equal(zs.getSpeedMultiplier(0, 0, 'soldier'), 1.0);
});

test('getSpeedMultiplier applies tank multiplier inside a river zone', () => {
  const zs = makeZoneSystem();
  // West river: cx=-40, cz=0, hw=8, hd=60 → x in [-48,-32], z in [-60,60]
  const mult = zs.getSpeedMultiplier(-40, 0, 'tank');
  assert.equal(mult, ZONE_TANK_MULTIPLIER);
});

test('getSpeedMultiplier applies soldier multiplier inside a river zone', () => {
  const zs = makeZoneSystem();
  const mult = zs.getSpeedMultiplier(-40, 0, 'soldier');
  assert.equal(mult, ZONE_SOLDIER_MULTIPLIER);
});

test('getSpeedMultiplier applies tank multiplier inside a mud zone', () => {
  const zs = makeZoneSystem();
  // South mud: cx=0, cz=50, hw=18, hd=10 → x in [-18,18], z in [40,60]
  const mult = zs.getSpeedMultiplier(0, 50, 'tank');
  assert.equal(mult, ZONE_TANK_MULTIPLIER);
});

test('getSpeedMultiplier applies soldier multiplier inside a mud zone', () => {
  const zs = makeZoneSystem();
  const mult = zs.getSpeedMultiplier(0, 50, 'soldier');
  assert.equal(mult, ZONE_SOLDIER_MULTIPLIER);
});

test('getSpeedMultiplier returns 1.0 just outside zone boundary (x)', () => {
  const zs = makeZoneSystem();
  // West river east edge: cx+hw = -40+8 = -32; point at x=-31.9 is outside.
  const mult = zs.getSpeedMultiplier(-31.9, 0, 'tank');
  assert.equal(mult, 1.0);
});

test('getSpeedMultiplier returns penalty at zone boundary (x)', () => {
  const zs = makeZoneSystem();
  // x = -32 is exactly on the east boundary of the west river — should be inside.
  const mult = zs.getSpeedMultiplier(-32, 0, 'tank');
  assert.equal(mult, ZONE_TANK_MULTIPLIER);
});

// ---------------------------------------------------------------------------
// isInZone tests
// ---------------------------------------------------------------------------

test('isInZone returns false outside all zones', () => {
  const zs = makeZoneSystem();
  assert.equal(zs.isInZone(0, 0), false);
});

test('isInZone returns true inside a river zone', () => {
  const zs = makeZoneSystem();
  assert.equal(zs.isInZone(-40, 0), true);
});

test('isInZone returns true inside a mud zone', () => {
  const zs = makeZoneSystem();
  assert.equal(zs.isInZone(0, 50), true);
});

test('zones array is populated', () => {
  const zs = makeZoneSystem();
  assert.ok(zs.zones.length > 0, 'zones should have at least one entry');
});
