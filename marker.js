// file: marker.js
import * as THREE from 'three';

function tileKey(tx, tz) { return `${tx},${tz}`; }

/**
 * MarkerTool manages temporary red highlights for tiles you tap while
 * marker mode is ON. When you turn marker mode OFF, you can fetch the
 * set of marked tiles and make them non-walkable elsewhere.
 */
export class MarkerTool {
  /**
   * @param {THREE.Scene} scene
   * @param {function(number, number, number, number): {x:number,z:number}} tileToWorld
   * @param {number} gridWidth
   * @param {number} gridHeight
   */
  constructor(scene, tileToWorld, gridWidth = 10, gridHeight = 10) {
    this.scene = scene;
    this.tileToWorld = tileToWorld;
    this.gridWidth = gridWidth | 0;
    this.gridHeight = gridHeight | 0;

    this.group = new THREE.Group();
    this.group.name = 'MarkerLayer';
    this.scene.add(this.group);

    // "tx,tz" -> Mesh (red overlay)
    this.tempMarks = new Map();
  }

  setGridSize(w, h) {
    this.gridWidth = w | 0;
    this.gridHeight = h | 0;
    this.clearAll(); // reset visuals on resize
  }

  /** Add a red overlay on the given tile (no-op if out of bounds or already marked) */
  mark(tx, tz) {
    if (tx < 0 || tz < 0 || tx >= this.gridWidth || tz >= this.gridHeight) return;
    const key = tileKey(tx, tz);
    if (this.tempMarks.has(key)) return;

    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff3333,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;

    const wp = this.tileToWorld(tx, tz, this.gridWidth, this.gridHeight);
    mesh.position.set(wp.x, 0.02, wp.z);
    mesh.name = `Marker_${key}`;

    this.group.add(mesh);
    this.tempMarks.set(key, mesh);
  }

  /** Returns an array of keys "tx,tz" for currently marked tiles */
  getMarkedKeys() {
    return [...this.tempMarks.keys()];
  }

  /** Remove all red overlays and free GPU resources */
  clearAll() {
    for (const [, mesh] of this.tempMarks) {
      this.group.remove(mesh);
      mesh.geometry?.dispose?.();
      mesh.material?.dispose?.();
    }
    this.tempMarks.clear();
  }

  /** Hide or show the whole layer (for quick visibility flips) */
  setVisible(v) {
    this.group.visible = !!v;
  }
}