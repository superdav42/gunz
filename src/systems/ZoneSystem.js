import * as THREE from 'three';

/**
 * ZoneSystem — manages river and mud movement-penalty zones.
 *
 * Zones are axis-aligned rectangles in XZ space. Any entity inside a zone
 * has its movement speed scaled:
 *   - Tank:   40% of base speed (tanks crawl through water/mud)
 *   - Soldier: 60% of base speed (infantry slows but less than tanks)
 *
 * Visual representation: flat-shaded planes placed just above terrain height
 * at each zone's centre. Rivers use a blue tint; mud uses a brown tint.
 * The planes are purely decorative — collision / penalty is handled by
 * getSpeedMultiplier() which is called each frame from PlayerController and
 * AIController.
 *
 * Zone definitions live in _ZONES below. Add or remove entries to tune the
 * map layout. Each zone entry:
 *   cx, cz   — world-space centre of the rectangle
 *   hw, hd   — half-width (X axis) and half-depth (Z axis) extents
 *   type     — 'river' | 'mud'
 */

// ---------------------------------------------------------------------------
// Speed multipliers — VISION.md "Rivers / mud" section, issue #66
// "40% tank, 60% soldier"
// ---------------------------------------------------------------------------

/** Speed multiplier applied to tank movement inside any penalty zone. */
export const ZONE_TANK_MULTIPLIER    = 0.40;

/** Speed multiplier applied to soldier movement inside any penalty zone. */
export const ZONE_SOLDIER_MULTIPLIER = 0.60;

// ---------------------------------------------------------------------------
// Zone material colours
// ---------------------------------------------------------------------------

const RIVER_COLOR = 0x3a8fd4;   // mid-blue for water
const MUD_COLOR   = 0x7a5c2e;   // earthy brown for mud

// ---------------------------------------------------------------------------
// Zone layout — balanced across the 200×200 arena (±90 playable XZ)
// Terrain size 200; rocks/trees occupy ±90 units; zones sit within ±85.
//
// Two rivers run roughly north-south in the east and west halves of the map.
// A mud zone occupies the south-centre near where teams re-engage after
// a river crossing.  A second mud patch guards the north-centre chokepoint.
// ---------------------------------------------------------------------------

const _ZONES = [
  // West river — north-south band on the western side of the field
  { cx: -40, cz: 0,   hw: 8, hd: 60, type: 'river' },
  // East river — north-south band on the eastern side
  { cx:  40, cz: 0,   hw: 8, hd: 60, type: 'river' },
  // South mud patch — centre-south
  { cx:   0, cz:  50, hw: 18, hd: 10, type: 'mud' },
  // North mud patch — centre-north
  { cx:   0, cz: -50, hw: 18, hd: 10, type: 'mud' },
];

// ---------------------------------------------------------------------------

export class ZoneSystem {
  /**
   * @param {THREE.Scene}                              scene
   * @param {import('../entities/Terrain.js').Terrain} terrain
   */
  constructor(scene, terrain) {
    this._scene   = scene;
    this._terrain = terrain;

    /**
     * Zone definitions — kept as plain objects so PlayerController and
     * AIController can query them with getSpeedMultiplier().
     * @type {Array<{cx:number,cz:number,hw:number,hd:number,type:string}>}
     */
    this.zones = _ZONES;

    /** Three.js meshes for the visual planes. Stored so they can be cleaned
     *  up if needed (e.g. round reset — though zones are permanent per-map). */
    this._meshes = [];

    this._buildVisuals();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Returns the speed multiplier that should be applied to a moving entity
   * at position (x, z).
   *
   * Returns 1.0 when outside all zones.
   * When inside a zone returns the multiplier for the given entity type.
   *
   * @param {number} x
   * @param {number} z
   * @param {'tank'|'soldier'} entityType
   * @returns {number} multiplier in (0, 1]
   */
  getSpeedMultiplier(x, z, entityType) {
    for (const zone of this.zones) {
      if (
        x >= zone.cx - zone.hw && x <= zone.cx + zone.hw &&
        z >= zone.cz - zone.hd && z <= zone.cz + zone.hd
      ) {
        return entityType === 'tank'
          ? ZONE_TANK_MULTIPLIER
          : ZONE_SOLDIER_MULTIPLIER;
      }
    }
    return 1.0;
  }

  /**
   * Returns true when the point (x, z) is inside any zone.
   * Convenience wrapper used by UI or AI for zone-awareness checks.
   *
   * @param {number} x
   * @param {number} z
   * @returns {boolean}
   */
  isInZone(x, z) {
    for (const zone of this.zones) {
      if (
        x >= zone.cx - zone.hw && x <= zone.cx + zone.hw &&
        z >= zone.cz - zone.hd && z <= zone.cz + zone.hd
      ) {
        return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Private — visual plane construction
  // ---------------------------------------------------------------------------

  /** @private */
  _buildVisuals() {
    for (const zone of this.zones) {
      const mesh = this._buildZonePlane(zone);
      this._scene.add(mesh);
      this._meshes.push(mesh);
    }
  }

  /**
   * Create a flat, semi-transparent coloured plane for a zone.
   *
   * The plane is placed at the terrain height at the zone's centre plus a
   * small Y offset (0.05 units) to avoid z-fighting with the terrain mesh.
   * PlaneGeometry is rotated to lie flat in XZ.
   *
   * @private
   * @param {{cx:number,cz:number,hw:number,hd:number,type:string}} zone
   * @returns {THREE.Mesh}
   */
  _buildZonePlane(zone) {
    const width  = zone.hw * 2;
    const depth  = zone.hd * 2;
    const color  = zone.type === 'river' ? RIVER_COLOR : MUD_COLOR;

    // Use enough segments to contour with the terrain's sine-wave hills.
    // One segment per 4 world units gives a reasonable fit without excess geometry.
    const segW = Math.max(1, Math.round(width  / 4));
    const segD = Math.max(1, Math.round(depth  / 4));

    const geo = new THREE.PlaneGeometry(width, depth, segW, segD);
    // Rotate flat (PlaneGeometry faces +Y by default after this rotation)
    geo.rotateX(-Math.PI / 2);

    // Contour each vertex to the terrain height + Y offset so the plane
    // hugs the ground instead of floating above hills or clipping below.
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);  // local X relative to plane centre
      const lz = pos.getZ(i);  // local Z relative to plane centre
      const wx = zone.cx + lx;
      const wz = zone.cz + lz;
      const terrainY = this._terrain.getHeightAt(wx, wz);
      pos.setY(i, terrainY + 0.05);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      metalness: 0.0,
      flatShading: true,
      transparent: true,
      opacity: zone.type === 'river' ? 0.75 : 0.85,
      depthWrite: false,   // transparent planes should not occlude shadows
    });

    const mesh = new THREE.Mesh(geo, mat);
    // Position at zone centre; Y is baked into vertex positions above.
    mesh.position.set(zone.cx, 0, zone.cz);
    mesh.receiveShadow = true;

    return mesh;
  }
}
