// file: marker.js
import * as THREE from 'three';

const key = (tx, tz) => `${tx},${tz}`;

export class MarkerTool {
  constructor(scene, tileToWorld, gridWidth = 10, gridHeight = 10) {
    this.scene = scene;
    this.tileToWorld = tileToWorld;
    this.gridWidth = gridWidth | 0;
    this.gridHeight = gridHeight | 0;

    this.group = new THREE.Group();
    this.group.name = 'MarkerLayer';
    this.group.visible = false;
    this.scene.add(this.group);

    this.overlays = new Map();
  }

  setGridSize(w, h) {
    this.gridWidth = w | 0;
    this.gridHeight = h | 0;
    this.clearAll();
  }

  syncToKeys(keysIterable) {
    for (const k of keysIterable) {
      const [txStr, tzStr] = String(k).split(',');
      const tx = Number(txStr), tz = Number(tzStr);
      if (!Number.isFinite(tx) || !Number.isFinite(tz)) continue;
      this._ensureOverlay(tx, tz);
    }
  }

  mark(tx, tz) {
    if (tx < 0 || tz < 0 || tx >= this.gridWidth || tz >= this.gridHeight) return;
    this._ensureOverlay(tx, tz);
  }

  _ensureOverlay(tx, tz) {
    const k = key(tx, tz);
    if (this.overlays.has(k)) return;

    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;

    const wp = this.tileToWorld(tx, tz, this.gridWidth, this.gridHeight);
    mesh.position.set(wp.x, 0.02, wp.z);
    mesh.name = `Marker_${k}`;

    this.group.add(mesh);
    this.overlays.set(k, mesh);
  }

  getMarkedKeys() { return [...this.overlays.keys()]; }

  clearAll() {
    for (const [, mesh] of this.overlays) {
      this.group.remove(mesh);
      mesh.geometry?.dispose?.();
      mesh.material?.dispose?.();
    }
    this.overlays.clear();
  }

  setVisible(v) { this.group.visible = !!v; }
}