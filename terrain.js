// file: terrain.js
import * as THREE from 'three';

export class Terrain {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.edges = null;
    this.gridWidth = 10;
    this.gridHeight = 10;
    this.showOutlines = false;

    // Raycast helpers
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
  }

  /** Build/replace the single terrain mesh sized to (w,h) with (w,h) segments */
  rebuild(w, h) {
    this.gridWidth = w | 0;
    this.gridHeight = h | 0;

    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry?.dispose?.();
      this.mesh.material?.dispose?.();
      this.mesh = null;
    }

    const geo = new THREE.PlaneGeometry(this.gridWidth, this.gridHeight, this.gridWidth, this.gridHeight);
    const mat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.95, metalness: 0.0 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.name = `Terrain_${this.gridWidth}x${this.gridHeight}`;
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);

    this._rebuildOutlines();
  }

  setOutlinesVisible(on) {
    this.showOutlines = !!on;
    this._rebuildOutlines();
  }

  _rebuildOutlines() {
    // remove old
    if (this.edges) {
      this.scene.remove(this.edges);
      this.edges.geometry?.dispose?.();
      this.edges.material?.dispose?.();
      this.edges = null;
    }
    if (!this.mesh || !this.showOutlines) return;

    const w = this.gridWidth | 0, h = this.gridHeight | 0;
    const verts = [];
    const xMin = -w / 2, xMax = w / 2;
    const yMin = -h / 2, yMax = h / 2;

    // vertical grid lines
    for (let xi = 0; xi <= w; xi++) {
      const x = xMin + xi;
      verts.push(x, yMin, 0,  x, yMax, 0);
    }
    // horizontal grid lines
    for (let yi = 0; yi <= h; yi++) {
      const y = yMin + yi;
      verts.push(xMin, y, 0,  xMax, y, 0);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x00aaff });

    this.edges = new THREE.LineSegments(geo, mat);
    this.edges.position.copy(this.mesh.position);
    this.edges.rotation.copy(this.mesh.rotation);
    this.edges.position.y += 0.001;
    this.edges.renderOrder = 1;
    this.scene.add(this.edges);
  }

  /**
   * Raycast the pointer to this mesh, returns world point or null
   * @param {PointerEvent} e
   * @param {THREE.Camera} camera
   * @param {HTMLCanvasElement} canvas
   */
  raycastPointer(e, camera, canvas) {
    if (!this.mesh) return null;
    const rect = canvas.getBoundingClientRect();
    this.ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, camera);
    const hit = this.raycaster.intersectObject(this.mesh, false);
    return hit.length ? hit[0].point : null;
  }

  dispose() {
    if (this.edges) {
      this.scene.remove(this.edges);
      this.edges.geometry?.dispose?.();
      this.edges.material?.dispose?.();
      this.edges = null;
    }
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry?.dispose?.();
      this.mesh.material?.dispose?.();
      this.mesh = null;
    }
  }
}