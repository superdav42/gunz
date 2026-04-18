/**
 * ZoneSystem.test.js — Unit tests for river/mud zone detection and speed penalties.
 *
 * Run: node --test tests/ZoneSystem.test.js
 *
 * Covers:
 *  - RIVER_SPEED_TANK and RIVER_SPEED_SOLDIER match VISION.md values
 *  - isInRiver() returns true for points inside the north and south river bands
 *  - isInRiver() returns false for points clearly outside any river zone
 *  - isInRiver() returns false for center village area (z ≈ 0)
 *  - isInRiver() boundary: just inside and just outside the band edges
 *  - River zones are symmetric (same depth north and south)
 *  - X coordinate has no effect on isInRiver() (rivers span full map width)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MapLayout,
  RIVER_SPEED_TANK,
  RIVER_SPEED_SOLDIER,
} from '../src/systems/MapLayout.js';

// ── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Minimal Three.js scene/terrain mocks.
 * MapLayout calls scene.add() and terrain.getHeightAt() during construction —
 * both are no-ops for testing.
 */
const mockScene   = { add: () => {} };
const mockTerrain = { getHeightAt: () => 0 };

/** Construct a MapLayout with mock dependencies. */
function makeLayout() {
  return new MapLayout(mockScene, mockTerrain);
}

// ── Speed constant tests ──────────────────────────────────────────────────────

test('RIVER_SPEED_TANK equals 0.40 as specified in VISION.md', () => {
  assert.equal(RIVER_SPEED_TANK, 0.40);
});

test('RIVER_SPEED_SOLDIER equals 0.60 as specified in VISION.md', () => {
  assert.equal(RIVER_SPEED_SOLDIER, 0.60);
});

test('RIVER_SPEED_TANK is less than 1.0 (penalty, not boost)', () => {
  assert.ok(RIVER_SPEED_TANK > 0 && RIVER_SPEED_TANK < 1.0);
});

test('RIVER_SPEED_SOLDIER is less than 1.0 (penalty, not boost)', () => {
  assert.ok(RIVER_SPEED_SOLDIER > 0 && RIVER_SPEED_SOLDIER < 1.0);
});

// ── isInRiver() — river zone detection ───────────────────────────────────────

test('isInRiver() returns true at north river centre (z=-26)', () => {
  const layout = makeLayout();
  assert.equal(layout.isInRiver(0, -26), true);
});

test('isInRiver() returns true at south river centre (z=+26)', () => {
  const layout = makeLayout();
  assert.equal(layout.isInRiver(0, 26), true);
});

test('isInRiver() returns false at map centre (z=0, village area)', () => {
  const layout = makeLayout();
  assert.equal(layout.isInRiver(0, 0), false);
});

test('isInRiver() returns false at team 0 spawn zone (z=+57)', () => {
  const layout = makeLayout();
  assert.equal(layout.isInRiver(0, 57), false);
});

test('isInRiver() returns false at team 1 spawn zone (z=-57)', () => {
  const layout = makeLayout();
  assert.equal(layout.isInRiver(0, -57), false);
});

// River depth is 10 units, centred at ±26.
// North band: z in [-31, -21]; South band: z in [+21, +31].

test('isInRiver() returns true at north river edge minZ (z=-31)', () => {
  const layout = makeLayout();
  assert.equal(layout.isInRiver(0, -31), true);
});

test('isInRiver() returns true at north river edge maxZ (z=-21)', () => {
  const layout = makeLayout();
  assert.equal(layout.isInRiver(0, -21), true);
});

test('isInRiver() returns false just outside north river minZ (z=-31.1)', () => {
  const layout = makeLayout();
  assert.equal(layout.isInRiver(0, -31.1), false);
});

test('isInRiver() returns false just outside north river maxZ (z=-20.9)', () => {
  const layout = makeLayout();
  assert.equal(layout.isInRiver(0, -20.9), false);
});

test('isInRiver() returns true at south river edge minZ (z=+21)', () => {
  const layout = makeLayout();
  assert.equal(layout.isInRiver(0, 21), true);
});

test('isInRiver() returns true at south river edge maxZ (z=+31)', () => {
  const layout = makeLayout();
  assert.equal(layout.isInRiver(0, 31), true);
});

test('isInRiver() returns false just outside south river maxZ (z=+31.1)', () => {
  const layout = makeLayout();
  assert.equal(layout.isInRiver(0, 31.1), false);
});

test('isInRiver() returns false just outside south river minZ (z=+20.9)', () => {
  const layout = makeLayout();
  assert.equal(layout.isInRiver(0, 20.9), false);
});

// ── X coordinate invariance ───────────────────────────────────────────────────

test('isInRiver() is not affected by X coordinate (river spans full width)', () => {
  const layout = makeLayout();
  // Same Z (north river centre), various X values
  assert.equal(layout.isInRiver(-75, -26), true);
  assert.equal(layout.isInRiver(0,   -26), true);
  assert.equal(layout.isInRiver(75,  -26), true);
});

// ── Symmetry: both rivers are identical bands ─────────────────────────────────

test('north and south river zones have equal depth', () => {
  const layout = makeLayout();
  // Both rivers should span 10 units centred on their z position
  const northIn  = layout.isInRiver(0, -26);
  const southIn  = layout.isInRiver(0, 26);
  assert.equal(northIn, true);
  assert.equal(southIn, true);

  // Check that equal offsets from centre match on both sides
  const offsets = [0, 2, 4, 4.9];
  for (const off of offsets) {
    assert.equal(
      layout.isInRiver(0, -26 + off),
      layout.isInRiver(0,  26 - off),
      `Symmetry violated at offset ${off}`
    );
  }
});
