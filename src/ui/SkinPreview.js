/**
 * SkinPreview — self-contained Three.js mini-scene that renders a rotating
 * tank model with a chosen skin applied. Used in the shop Skins tab.
 *
 * Usage:
 *   const preview = new SkinPreview();
 *   preview.mount(containerEl);          // attach canvas to a DOM element
 *   preview.setSkin(0xff0000, 0xcc0000); // update hull / turret colours
 *   preview.dispose();                   // clean up when leaving the tab
 *
 * The Three.js canvas is owned by this class. mount() moves it into the given
 * container; dispose() removes it and cancels the animation loop.
 *
 * The preview renders at a fixed 240×200 logical pixels (device-pixel-ratio
 * aware) so mount containers should be at least that size.
 */

import * as THREE from 'three';

/** Fixed preview dimensions — chosen to fit the shop side panel comfortably. */
const PREVIEW_W = 240;
const PREVIEW_H = 200;

export class SkinPreview {
  constructor() {
    this._animId = null;

    // ---- Renderer ----------------------------------------------------------
    this._renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._renderer.setSize(PREVIEW_W, PREVIEW_H);
    this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.0;

    const canvas = this._renderer.domElement;
    canvas.style.display      = 'block';
    canvas.style.borderRadius = '8px';
    canvas.style.width        = `${PREVIEW_W}px`;
    canvas.style.height       = `${PREVIEW_H}px`;

    // ---- Scene -------------------------------------------------------------
    this._scene = new THREE.Scene();

    // Soft ambient + warm key light matching the main game lighting.
    const ambient = new THREE.AmbientLight(0x6688cc, 0.7);
    this._scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffeedd, 1.6);
    key.position.set(6, 10, 8);
    this._scene.add(key);

    const fill = new THREE.DirectionalLight(0x8899cc, 0.4);
    fill.position.set(-5, 3, -4);
    this._scene.add(fill);

    // ---- Camera ------------------------------------------------------------
    this._camera = new THREE.PerspectiveCamera(40, PREVIEW_W / PREVIEW_H, 0.1, 100);
    // Slightly elevated front-quarter view so the turret and barrel are visible.
    this._camera.position.set(7, 5, 9);
    this._camera.lookAt(0, 1.0, 0);

    // ---- Tank mesh ---------------------------------------------------------
    /**
     * Persistent materials — colours are updated in setSkin() without
     * rebuilding the geometry.
     */
    this._hullMat   = new THREE.MeshStandardMaterial({
      color:      0x2d5a27,
      roughness:  0.7,
      metalness:  0.3,
      flatShading: true,
    });
    this._turretMat = new THREE.MeshStandardMaterial({
      color:      0x3a7a33,
      roughness:  0.6,
      metalness:  0.4,
      flatShading: true,
    });

    this._tankGroup = new THREE.Group();
    this._scene.add(this._tankGroup);
    this._buildTankMesh();

    // ---- Animation loop ----------------------------------------------------
    this._loop = this._loop.bind(this);
    this._animId = requestAnimationFrame(this._loop);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Attach the preview canvas to a DOM container element.
   * Safe to call multiple times (e.g. after a shop re-render): the canvas is
   * simply moved if it already has a parent.
   * @param {HTMLElement} container
   */
  mount(container) {
    const canvas = this._renderer.domElement;
    if (canvas.parentElement !== container) {
      container.appendChild(canvas);
    }
  }

  /**
   * Update the tank colours to match a skin definition.
   * @param {number} colorBody   Hull colour as a hex integer (e.g. 0x4a6b3f).
   * @param {number} colorTurret Turret colour as a hex integer.
   */
  setSkin(colorBody, colorTurret) {
    this._hullMat.color.setHex(colorBody);
    this._turretMat.color.setHex(colorTurret);
  }

  /**
   * Cancel the animation loop, dispose GPU resources, and remove the canvas
   * from the DOM. Call this when the skins tab or shop closes.
   */
  dispose() {
    if (this._animId !== null) {
      cancelAnimationFrame(this._animId);
      this._animId = null;
    }

    // Dispose geometries and materials to avoid GPU leaks.
    this._scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });

    this._renderer.dispose();
    const canvas = this._renderer.domElement;
    if (canvas.parentElement) {
      canvas.parentElement.removeChild(canvas);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Builds the tank mesh replicating Tank.js geometry so the preview matches
   * the in-game look exactly (flat-shaded low-poly style).
   * @private
   */
  _buildTankMesh() {
    const trackMat  = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9, flatShading: true });
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.6, flatShading: true });

    // Hull
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 4.5), this._hullMat);
    hull.position.y = 0.8;
    this._tankGroup.add(hull);

    // Tracks
    const trackGeo = new THREE.BoxGeometry(0.6, 0.8, 4.8);
    const trackL = new THREE.Mesh(trackGeo, trackMat);
    trackL.position.set(-1.6, 0.5, 0);
    this._tankGroup.add(trackL);
    const trackR = new THREE.Mesh(trackGeo, trackMat);
    trackR.position.set(1.6, 0.5, 0);
    this._tankGroup.add(trackR);

    // Turret group
    const turretGroup = new THREE.Group();
    turretGroup.position.y = 1.5;

    const turretMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.8, 8), this._turretMat);
    turretGroup.add(turretMesh);

    // Barrel (pointing forward along -Z to match Tank.js orientation)
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 3.5, 8), barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.1, -1.9);
    turretGroup.add(barrel);

    this._tankGroup.add(turretGroup);

    // Tilt slightly to show the top surface at the camera angle.
    this._tankGroup.rotation.x = -0.08;
  }

  /**
   * Animation loop — rotates the tank and renders a frame.
   * @private
   * @param {number} _ts - DOMHighResTimeStamp (unused; rotation is frame-rate-independent via fixed increment)
   */
  _loop(_ts) {
    this._animId = requestAnimationFrame(this._loop);
    // Slow continuous Y rotation — one full rotation every ~8 seconds at 60 fps.
    this._tankGroup.rotation.y += 0.013;
    this._renderer.render(this._scene, this._camera);
  }
}
