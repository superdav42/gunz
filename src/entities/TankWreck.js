import * as THREE from 'three';

/**
 * TankWreck — a static, indestructible cover prop left behind when a tank
 * is demolished. Visually represents a burnt-out, darkened tank hull with a
 * canted turret and a broken barrel.
 *
 * Wrecks are added to the scene by WreckSystem and registered as obstacles
 * with CollisionSystem so live tanks and projectiles cannot pass through them.
 */
export class TankWreck {
  /**
   * @param {import('three').Vector3} position  World position of the wreck.
   * @param {number}                  rotationY Hull yaw (radians) inherited from the killed tank.
   */
  constructor(position, rotationY = 0) {
    /** @type {number} Collision radius used by CollisionSystem (XZ plane). */
    this.collisionRadius = 2.4;

    this.mesh = this._buildMesh();
    this.mesh.position.set(position.x, position.y, position.z);
    this.mesh.rotation.y = rotationY;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  _buildMesh() {
    const group = new THREE.Group();

    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      roughness: 0.9,
      metalness: 0.1,
    });

    // Charred hull — slightly squashed to look compressed by damage
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.0, 4.5), hullMat);
    hull.position.y = 0.65;
    hull.castShadow = true;
    hull.receiveShadow = true;
    group.add(hull);

    // Burnt tracks
    const trackMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.95,
    });
    const trackGeo = new THREE.BoxGeometry(0.6, 0.7, 4.8);
    const trackL = new THREE.Mesh(trackGeo, trackMat);
    trackL.position.set(-1.6, 0.38, 0);
    trackL.castShadow = true;
    trackL.receiveShadow = true;
    group.add(trackL);
    const trackR = trackL.clone();
    trackR.position.x = 1.6;
    group.add(trackR);

    const turretMat = new THREE.MeshStandardMaterial({
      color: 0x1f1f1f,
      roughness: 0.9,
      metalness: 0.2,
    });

    // Turret — slightly off-centre and canted to look blown off
    const turret = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.25, 0.75, 8),
      turretMat
    );
    turret.position.set(0.25, 1.5, 0.2);
    turret.rotation.z = 0.18; // slight tilt
    turret.castShadow = true;
    group.add(turret);

    // Broken barrel — shorter, angled downward
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.17, 2.0, 8),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.85 })
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.rotation.z = 0.28; // bent
    barrel.position.set(0.25, 1.45, -1.2);
    barrel.castShadow = true;
    group.add(barrel);

    // Scorch ring on the ground beneath the wreck
    const scorchGeo = new THREE.CircleGeometry(2.8, 16);
    const scorchMat = new THREE.MeshStandardMaterial({
      color: 0x1a1208,
      roughness: 1.0,
      metalness: 0.0,
    });
    const scorch = new THREE.Mesh(scorchGeo, scorchMat);
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.y = 0.01; // just above terrain to avoid z-fighting
    scorch.receiveShadow = true;
    group.add(scorch);

    return group;
  }
}
