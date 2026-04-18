import * as THREE from 'three';

/**
 * CameraController — third-person follow camera that adapts to the player's
 * current mode (tank or on-foot soldier).
 *
 * **Tank mode** (default): high, far view — offset (0, 14, 18), lookOffset (0, 0, −5).
 * **Soldier mode**: lower, closer view — offset (0, 6, 10), lookOffset (0, 0, −2).
 *
 * Mode detection (t027)
 * ---------------------
 * The camera reads `target.mode` each frame (as exposed by PlayerController).
 * When `target.mode` changes from 'tank' to 'soldier' (or vice versa), the
 * desired offsets are updated and the working offsets smoothly lerp toward the
 * new values over ~0.5 s — a cinematic transition, not a snap cut.
 *
 * `target` can be a plain Tank entity (no .mode property) or a PlayerController
 * (which exposes .mode and .mesh).  Both expose `.mesh.position` and
 * `.mesh.rotation.y`, so the camera logic is entity-agnostic.
 */
export class CameraController {
  // ---- Per-mode camera parameters ----------------------------------------

  /** Camera offset (local to target heading) for tank mode. */
  static TANK_OFFSET      = new THREE.Vector3(0, 14, 18);
  /** Look-at offset for tank mode — point slightly ahead of hull. */
  static TANK_LOOK_OFFSET = new THREE.Vector3(0,  0, -5);

  /** Camera offset for on-foot (soldier) mode — closer and lower. */
  static FOOT_OFFSET      = new THREE.Vector3(0,  6, 10);
  /** Look-at offset for on-foot mode — shorter look-ahead. */
  static FOOT_LOOK_OFFSET = new THREE.Vector3(0,  0, -2);

  // -------------------------------------------------------------------------

  /**
   * @param {THREE.Camera}  camera
   * @param {object}        target — Tank, Soldier, or PlayerController.
   *                                 Must expose `.mesh.position` and `.mesh.rotation.y`.
   *                                 PlayerController also exposes `.mode` ('tank'|'soldier').
   */
  constructor(camera, target) {
    this.camera  = camera;
    this.target  = target;

    /** Current working offset — interpolated toward _targetOffset each frame. */
    this.offset     = CameraController.TANK_OFFSET.clone();
    /** Current working look-at offset — interpolated toward _targetLookOffset. */
    this.lookOffset = CameraController.TANK_LOOK_OFFSET.clone();

    // Desired offsets; updated when the detected mode changes.
    this._targetOffset     = this.offset.clone();
    this._targetLookOffset = this.lookOffset.clone();

    /** Last known mode — used for change detection. */
    this._lastMode = 'tank';

    // How quickly the camera position follows the target (exp-decay constant).
    this.smoothing = 4;
    // How quickly offsets lerp toward new mode values on mode change.
    this._offsetSmoothSpeed = 6;

    this._currentPos = new THREE.Vector3();
    this._desiredPos = new THREE.Vector3();
    this._lookAt     = new THREE.Vector3();

    /**
     * Screen-shake: current amplitude in world units.
     * Decays exponentially toward zero each frame.
     * Call shake(amplitude) to trigger; larger values = more violent shake.
     */
    this._shakeAmp   = 0;
    /** Decay rate constant — higher = faster decay. */
    this._shakeDecay = 9;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Replace the follow target (e.g. to track a different entity).
   * @param {object} target
   */
  setTarget(target) {
    this.target = target;
  }

  /**
   * Trigger a screen-shake impulse.
   *
   * Multiple calls within the same frame are safe: the amplitude is clamped
   * to the maximum of the existing and new values so that overlapping events
   * don't stack beyond a sensible ceiling.
   *
   * Amplitude guide:
   *   0.3 — distant explosion
   *   0.8 — nearby enemy tank destroyed
   *   1.5 — direct hit on player (non-lethal)
   *   3.0 — player tank destroyed
   *
   * @param {number} amplitude  Peak displacement in world units (≥ 0).
   */
  shake(amplitude) {
    this._shakeAmp = Math.max(this._shakeAmp, amplitude);
  }

  /**
   * Per-frame update.  Call every frame — even outside active rounds so that
   * any in-progress offset transition completes smoothly.
   *
   * @param {number} dt — seconds since last frame
   */
  update(dt) {
    // --- Mode detection (t027): adapt offsets when PlayerController mode changes ---
    // target.mode is 'tank' or 'soldier' (PlayerController) or undefined (plain Tank).
    const rawMode = this.target.mode;            // undefined for plain Tank entities
    const camMode = rawMode === 'soldier' ? 'foot' : 'tank';
    if (camMode !== this._lastMode) {
      this._lastMode = camMode;
      this._applyModeOffsets(camMode);
    }

    const targetPos = this.target.mesh.position;

    // Smoothly interpolate working offsets toward desired values.
    const k = 1 - Math.exp(-this._offsetSmoothSpeed * dt);
    this.offset.lerp(this._targetOffset, k);
    this.lookOffset.lerp(this._targetLookOffset, k);

    // Desired camera position: offset applied relative to target's Y heading.
    this._desiredPos
      .copy(this.offset)
      .applyEuler(new THREE.Euler(0, this.target.mesh.rotation.y, 0))
      .add(targetPos);

    // Smooth follow of camera position.
    this._currentPos.lerp(this._desiredPos, 1 - Math.exp(-this.smoothing * dt));
    this.camera.position.copy(this._currentPos);

    // ---- Screen shake (t058) ----
    // Apply a random offset that decays exponentially toward zero.
    if (this._shakeAmp > 0.005) {
      this._shakeAmp *= Math.exp(-this._shakeDecay * dt);
      const s = this._shakeAmp;
      this.camera.position.x += (Math.random() - 0.5) * 2 * s;
      this.camera.position.y += (Math.random() - 0.5) * s; // less vertical swing
      this.camera.position.z += (Math.random() - 0.5) * 2 * s;
    } else {
      this._shakeAmp = 0;
    }

    // Look-at point: slightly ahead of and at the height of the target.
    this._lookAt
      .copy(this.lookOffset)
      .applyEuler(new THREE.Euler(0, this.target.mesh.rotation.y, 0))
      .add(targetPos);
    this._lookAt.y = targetPos.y + 2;

    this.camera.lookAt(this._lookAt);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * @private
   * Update desired offsets for the given camera mode.
   * @param {'tank'|'foot'} mode
   */
  _applyModeOffsets(mode) {
    if (mode === 'foot') {
      this._targetOffset.copy(CameraController.FOOT_OFFSET);
      this._targetLookOffset.copy(CameraController.FOOT_LOOK_OFFSET);
    } else {
      this._targetOffset.copy(CameraController.TANK_OFFSET);
      this._targetLookOffset.copy(CameraController.TANK_LOOK_OFFSET);
    }
  }
}
