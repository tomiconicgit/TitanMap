// file: height-tool.js
import * as THREE from 'three';
import { tileToWorld } from './grid-utils.js';

/**
 * Manages a single, unified terrain mesh for height and texture painting.
 */
export class HeightTool {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Mesh} terrainMesh - The single mesh for the terrain
   * @param {number} gridWidth
   * @param {number} gridHeight
   */
  constructor(scene, terrainMesh, gridWidth = 10, gridHeight = 10) {
    this.scene = scene;
    this.terrainMesh = terrainMesh;
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;

    this.heights = new Float32Array((this.gridWidth + 1) * (this.gridHeight + 1)).fill(0);
    this.pinned = new Set();

    this.pinGroup = new THREE.Group();
    this.pinGroup.name = 'PinnedTilesOverlay';
    scene.add(this.pinGroup);
    this.pinMeshes = new Map();

    this.applyHeightsToMesh();
  }

  idx(vx, vz) { return vz * (this.gridWidth + 1) + vx; }

  tileKey(tx, tz) { return `${tx},${tz}`; }

  reset(terrainMesh, width, height) {
    this.terrainMesh = terrainMesh;
    this.gridWidth = width;
    this.gridHeight = height;
    this.heights = new Float32Array((width + 1) * (height + 1)).fill(0);
    this.removeAllPins();
    this.applyHeightsToMesh();
  }

  removeAllPins() {
    for (const [, m] of this.pinMeshes) {
      this.pinGroup.remove(m);
      m.geometry?.dispose?.();
      m.material?.dispose?.();
    }
    this.pinMeshes.clear();
    this.pinned.clear();
  }
  
  togglePin(tx, tz) {
    if (tx < 0 || tz < 0 || tx >= this.gridWidth || tz >= this.gridHeight) return false;
    const key = this.tileKey(tx, tz);
    if (this.pinned.has(key)) {
      this.pinned.delete(key);
      const m = this.pinMeshes.get(key);
      if (m) {
        this.pinGroup.remove(m);
        m.geometry?.dispose?.();
        m.material?.dispose?.();
      }
      this.pinMeshes.delete(key);
      return false;
    } else {
      this.pinned.add(key);
      const geo = new THREE.PlaneGeometry(1, 1);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x00ff66, transparent: true, opacity: 0.35, side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      const wp = tileToWorld(tx, tz, this.gridWidth, this.gridHeight);
      
      const v_tl = this.heights[this.idx(tx, tz)];
      const v_tr = this.heights[this.idx(tx + 1, tz)];
      const v_bl = this.heights[this.idx(tx, tz + 1)];
      const v_br = this.heights[this.idx(tx + 1, tz + 1)];
      const avgHeight = (v_tl + v_tr + v_bl + v_br) / 4;
      
      mesh.position.set(wp.x, avgHeight + 0.05, wp.z);
      mesh.name = `Pin_${key}`;
      this.pinGroup.add(mesh);
      this.pinMeshes.set(key, mesh);
      return true;
    }
  }

  nodeIsBlocked(vx, vz) {
    const tiles = [
      [vx - 1, vz - 1], [vx, vz - 1],
      [vx - 1, vz],     [vx, vz]
    ];
    for (const [tx, tz] of tiles) {
      if (this.pinned.has(this.tileKey(tx, tz))) return true;
    }
    return false;
  }

  setTileHeight(tx, tz, value) {
    if (tx < 0 || tz < 0 || tx >= this.gridWidth || tz >= this.gridHeight) return;

    const vertices = [
      [tx,     tz],
      [tx + 1, tz],
      [tx,     tz + 1],
      [tx + 1, tz + 1]
    ];

    for (const [vx, vz] of vertices) {
      if (this.nodeIsBlocked(vx, vz)) continue;
      this.heights[this.idx(vx, vz)] = value;
    }

    this.applyHeightsToMesh();
  }

  applyHeightsToMesh() {
    if (!this.terrainMesh) return;
    const pos = this.terrainMesh.geometry.attributes.position;
    if (pos.count !== this.heights.length) {
      console.error("Mismatch between terrain vertex count and height data.");
      return;
    }
    for (let i = 0; i < this.heights.length; i++) {
      pos.setY(i, this.heights[i]);
    }
    pos.needsUpdate = true;
    this.terrainMesh.geometry.computeVertexNormals();
    this.terrainMesh.geometry.computeBoundingSphere(); // CORRECTED: Ensures bounds are updated

    this.updatePinPositions();
  }
  
  updatePinPositions() {
    for (const [key, mesh] of this.pinMeshes) {
      const [tx, tz] = key.split(',').map(Number);
      const v_tl = this.heights[this.idx(tx, tz)];
      const v_tr = this.heights[this.idx(tx + 1, tz)];
      const v_bl = this.heights[this.idx(tx, tz + 1)];
      const v_br = this.heights[this.idx(tx + 1, tz + 1)];
      const avgHeight = (v_tl + v_tr + v_bl + v_br) / 4;
      mesh.position.y = avgHeight + 0.05;
    }
  }
}
