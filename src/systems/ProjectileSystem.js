export class ProjectileSystem {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
  }

  add(projectile) {
    this.scene.add(projectile.mesh);
    this.active.push(projectile);
  }

  remove(index) {
    const p = this.active[index];
    this.scene.remove(p.mesh);
    this.active.splice(index, 1);
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const alive = this.active[i].update(dt);
      if (!alive) {
        this.remove(i);
      }
    }
  }

  reset() {
    for (const p of this.active) {
      this.scene.remove(p.mesh);
    }
    this.active.length = 0;
  }
}
