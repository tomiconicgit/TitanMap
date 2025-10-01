// file: terrain.js
import * as THREE from 'three';

export class Terrain {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;

    this.showOutlines = false;
    this.edgesMesh = null;

    // scratch
    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
  }

  rebuild(width, height) {
    this.width = width | 0;
    this.height = height | 0;

    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry?.dispose?.();
      this.mesh.material?.dispose?.();
      this.mesh = null;
    }
    if (this.edgesMesh) {
      this.scene.remove(this.edgesMesh);
      this.edgesMesh.geometry?.dispose?.();
      this.edgesMesh.material?.dispose?.();
      this.edgesMesh = null;
    }

    // Size == tiles, Segments == tiles
    const geo = new THREE.PlaneGeometry(this.width, this.height, this.width, this.height);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x777777,
      roughness: 0.95,
      metalness: 0.0
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.rotation.x = -Math.PI / 2; // XY => XZ, Z becomes world Y
    this.mesh.receiveShadow = true;
    this.mesh.name = `Terrain_${this.width}x${this.height}`;
    this.scene.add(this.mesh);

    if (this.showOutlines) this._rebuildEdges();
  }

  setOutlinesVisible(on) {
    this.showOutlines = !!on;
    if (this.showOutlines) this._rebuildEdges();
    else if (this.edgesMesh) {
      this.scene.remove(this.edgesMesh);
      this.edgesMesh.geometry?.dispose?.();
      this.edgesMesh.material?.dispose?.();
      this.edgesMesh = null;
    }
  }

  _rebuildEdges() {
    if (!this.mesh) return;
    if (this.edgesMesh) {
      this.scene.remove(this.edgesMesh);
      this.edgesMesh.geometry?.dispose?.();
      this.edgesMesh.material?.dispose?.();
      this.edgesMesh = null;
    }
    const eg = new THREE.EdgesGeometry(this.mesh.geometry);
    const emat = new THREE.LineBasicMaterial({ color: 0x00aaff });
    this.edgesMesh = new THREE.LineSegments(eg, emat);
    this.edgesMesh.position.copy(this.mesh.position);
    this.edgesMesh.rotation.copy(this.mesh.rotation);
    this.edgesMesh.position.y += 0.001;
    this.edgesMesh.renderOrder = 1;
    this.scene.add(this.edgesMesh);
  }

  raycastPointer(evt, camera, canvas) {
    if (!this.mesh) return null;
    const rect = canvas.getBoundingClientRect();
    this._ndc.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    this._ndc.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;

    this._raycaster.setFromCamera(this._ndc, camera);
    const hit = this._raycaster.intersectObject(this.mesh, false);
    if (!hit.length) return null;
    // return world-space point on mesh
    return hit[0].point;
  }

  /**
   * Sample the current deformed surface height (world Y) at world XZ.
   * Uses bilinear interpolation of the plane's vertex Z (after deformation).
   */
  getHeightAt(worldX, worldZ) {
    if (!this.mesh) return 0;
    const pos = this.mesh.geometry.attributes.position;
    const w = this.width, h = this.height;

    // Convert worldX/worldZ to local tile-space [0..w]x[0..h]
    // Plane is centered; tiles are 1x1.
    let lx = worldX + w / 2;
    let lz = worldZ + h / 2;

    // Clamp inside the mesh
    lx = Math.min(Math.max(lx, 0), w - 1e-6);
    lz = Math.min(Math.max(lz, 0), h - 1e-6);

    const tx = Math.floor(lx);
    const tz = Math.floor(lz);
    const fx = lx - tx;
    const fz = lz - tz;

    // Vertex indices: (vx, vz) => vz*(w+1) + vx
    const idx = (vx, vz) => vz * (w + 1) + vx;

    const v00 = pos.getZ(idx(tx,     tz    )); // top-left
    const v10 = pos.getZ(idx(tx + 1, tz    )); // top-right
    const v01 = pos.getZ(idx(tx,     tz + 1)); // bottom-left
    const v11 = pos.getZ(idx(tx + 1, tz + 1)); // bottom-right

    // Bilinear interpolation inside the 1x1 tile
    const a = v00 * (1 - fx) + v10 * fx;
    const b = v01 * (1 - fx) + v11 * fx;
    const height = a * (1 - fz) + b * fz;
    return height;
  }
}