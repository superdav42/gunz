import * as THREE from 'three';

const PROJECTILE_GEO = new THREE.SphereGeometry(0.2, 6, 6);
const PLAYER_MAT = new THREE.MeshStandardMaterial({
  color: 0xffdd44,
  emissive: 0xff8800,
  emissiveIntensity: 0.8,
});
const ENEMY_MAT = new THREE.MeshStandardMaterial({
  color: 0xff4444,
  emissive: 0xff0000,
  emissiveIntensity: 0.8,
});

export class Projectile {
  constructor({ position, direction, isPlayerOwned, speed = 50, damage = 25 }) {
    this.isPlayerOwned = isPlayerOwned;
    this.speed = speed;
    this.damage = damage;
    this.lifetime = 3; // seconds
    this.age = 0;

    const mat = isPlayerOwned ? PLAYER_MAT : ENEMY_MAT;
    this.mesh = new THREE.Mesh(PROJECTILE_GEO, mat);
    this.mesh.position.copy(position);

    this.velocity = direction.clone().normalize().multiplyScalar(speed);
  }

  update(dt) {
    this.mesh.position.addScaledVector(this.velocity, dt);
    this.age += dt;
    // Gravity
    this.velocity.y -= 9.8 * dt * 0.3;
    return this.age < this.lifetime && this.mesh.position.y > -1;
  }
}
