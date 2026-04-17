import * as THREE from 'three';

export class Terrain {
  constructor() {
    this.size = 200;
    this.segments = 80;
    /**
     * Collidable rock props: each entry is { x, z, radius } in world space.
     * Trees are NOT listed here — they are managed by TreeSystem.
     */
    this.obstacles = [];

    const geo = new THREE.PlaneGeometry(
      this.size,
      this.size,
      this.segments,
      this.segments
    );
    geo.rotateX(-Math.PI / 2);

    // Generate rolling hills
    const vertices = geo.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i);
      const z = vertices.getZ(i);
      const y = this._heightFn(x, z);
      vertices.setY(i, y);
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: 0x4a7a3b,
      roughness: 0.95,
      metalness: 0.0,
      flatShading: true,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;

    // Decorative objects
    this._addProps();
  }

  _heightFn(x, z) {
    return (
      Math.sin(x * 0.03) * 2 +
      Math.cos(z * 0.04) * 1.5 +
      Math.sin((x + z) * 0.02) * 3 +
      Math.sin(x * 0.08) * 0.5
    );
  }

  getHeightAt(x, z) {
    return this._heightFn(x, z);
  }

  _addProps() {
    // Scattered rocks — registered as permanent collision obstacles.
    // Trees are spawned separately by TreeSystem (see src/systems/TreeSystem.js).
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.9,
      flatShading: true,
    });

    for (let i = 0; i < 40; i++) {
      const rock = new THREE.Mesh(rockGeo, rockMat);
      const x = (Math.random() - 0.5) * 180;
      const z = (Math.random() - 0.5) * 180;
      const scale = 0.5 + Math.random() * 1.5;
      rock.position.set(x, this._heightFn(x, z) - 0.3, z);
      rock.scale.set(scale, scale * 0.6, scale);
      rock.rotation.set(
        Math.random() * 0.5,
        Math.random() * Math.PI * 2,
        Math.random() * 0.5
      );
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.mesh.add(rock);
      // Register for collision — dodecahedron circumradius ≈ 1 world unit * scale
      this.obstacles.push({ x, z, radius: scale * 1.0 });
    }
  }
}
