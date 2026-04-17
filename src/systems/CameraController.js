import * as THREE from 'three';

export class CameraController {
  constructor(camera, target) {
    this.camera = camera;
    this.target = target;
    this.offset = new THREE.Vector3(0, 14, 18);
    this.lookOffset = new THREE.Vector3(0, 0, -5);
    this.smoothing = 4;
    this._currentPos = new THREE.Vector3();
    this._desiredPos = new THREE.Vector3();
    this._lookAt = new THREE.Vector3();
  }

  update(dt) {
    const targetPos = this.target.mesh.position;

    // Desired camera position: behind and above the tank
    this._desiredPos
      .copy(this.offset)
      .applyEuler(new THREE.Euler(0, this.target.mesh.rotation.y, 0))
      .add(targetPos);

    // Smooth follow
    this._currentPos.lerp(this._desiredPos, 1 - Math.exp(-this.smoothing * dt));
    this.camera.position.copy(this._currentPos);

    // Look at point slightly ahead of tank
    this._lookAt
      .copy(this.lookOffset)
      .applyEuler(new THREE.Euler(0, this.target.mesh.rotation.y, 0))
      .add(targetPos);
    this._lookAt.y = targetPos.y + 2;

    this.camera.lookAt(this._lookAt);
  }
}
