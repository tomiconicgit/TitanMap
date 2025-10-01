// file: height-tool.js
import * as THREE from 'three';

/**
 * HeightTool for a single PlaneGeometry terrain:
 * - Stores a (w+1)*(h+1) heightfield (applied to geometry local Z, i.e. world Y).
 * - setTileHeight(tx,tz,val): sets the four corner vertices of that tile unless pinned.
 * - Pinned tiles lock their four corner vertices. Green overlays show pins while visible.
 */
export class HeightTool {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Mesh} terrainMesh
   * @param {number} gridWidth
   * @param {number} gridHeight
   */
  constructor(scene, terrainMesh, gridWidth = 10, gridHeight = 10) {
    this.scene = scene;
    this.terrainMesh = terrainMesh;
    this.gridWidth = gridWidth | 0;
    this.gridHeight = gridHeight | 0;

    // (w+1)*(h+1) per-vertex heights (local Z => world Y after mesh rotation)
    this.heights = new Float32Array((this.gridWidth + 1) * (this.gridHeight + 1)).fill(0);

    // pinned tiles => lock their 4 corner vertices
    this.pinned = new Set();

    // green overlay visuals for pinned tiles
    this.pinGroup = new THREE.Group();
    this.pinGroup.name = 'HeightPinsOverlay';
    this.pinGroup.visible = false;
    this.scene.add(this.pinGroup);
    this.pinMeshes = new Map(); // key -> mesh

    this._applyHeightsToGeometry();
  }

  // ---- helpers ----
  _idx(vx, vz) { return vz * (this.gridWidth + 1) + vx; }
  _key(tx, tz) { return `${tx},${tz}`; }

  reset(terrainMesh, width, height) {
    this.terrainMesh = terrainMesh;
    this.gridWidth = width | 0;
    this.gridHeight = height | 0;
    this.heights = new Float32Array((this.gridWidth + 1) * (this.gridHeight + 1)).fill(0);
    this._rebuildAllPinMeshes();
    this._applyHeightsToGeometry();
  }

  setPinsVisible(v) { this.pinGroup.visible = !!v; }

  _rebuildAllPinMeshes() {
    for (const [, m] of this.pinMeshes) {
      this.pinGroup.remove(m);
      m.geometry?.dispose?.();
      m.material?.dispose?.();
    }
    this.pinMeshes.clear();
    for (const k of this.pinned) {
      const [tx, tz] = k.split(',').map(Number);
      this._ensurePinMesh(tx, tz);
    }
  }

  _ensurePinMesh(tx, tz) {
    const k = this._key(tx, tz);
    if (this.pinMeshes.has(k)) return;

    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ff66,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;

    const { x, z } = this._tileCenterWorld(tx, tz);
    const avg = this._tileAverageHeight(tx, tz);
    mesh.position.set(x, avg + 0.05, z);
    mesh.name = `Pin_${k}`;

    this.pinGroup.add(mesh);
    this.pinMeshes.set(k, mesh);
  }

  _tileCenterWorld(tx, tz) {
    return {
      x: tx - this.gridWidth / 2 + 0.5,
      z: tz - this.gridHeight / 2 + 0.5
    };
  }

  _tileAverageHeight(tx, tz) {
    const v_tl = this.heights[this._idx(tx, tz)];
    const v_tr = this.heights[this._idx(tx + 1, tz)];
    const v_bl = this.heights[this._idx(tx, tz + 1)];
    const v_br = this.heights[this._idx(tx + 1, tz + 1)];
    return (v_tl + v_tr + v_bl + v_br) / 4;
  }

  togglePin(tx, tz) {
    if (tx < 0 || tz < 0 || tx >= this.gridWidth || tz >= this.gridHeight) return false;
    const k = this._key(tx, tz);
    if (this.pinned.has(k)) {
      this.pinned.delete(k);
      const m = this.pinMeshes.get(k);
      if (m) {
        this.pinGroup.remove(m);
        m.geometry?.dispose?.();
        m.material?.dispose?.();
        this.pinMeshes.delete(k);
      }
      return false;
    } else {
      this.pinned.add(k);
      this._ensurePinMesh(tx, tz);
      return true;
    }
  }

  _vertexBlocked(vx, vz) {
    const tiles = [
      [vx - 1, vz - 1], [vx, vz - 1],
      [vx - 1, vz],     [vx, vz]
    ];
    for (const [tx, tz] of tiles) {
      if (tx < 0 || tz < 0 || tx >= this.gridWidth || tz >= this.gridHeight) continue;
      if (this.pinned.has(this._key(tx, tz))) return true;
    }
    return false;
  }

  setTileHeight(tx, tz, value) {
    if (tx < 0 || tz < 0 || tx >= this.gridWidth || tz >= this.gridHeight) return;

    const verts = [
      [tx,     tz],
      [tx + 1, tz],
      [tx,     tz + 1],
      [tx + 1, tz + 1]
    ];

    for (const [vx, vz] of verts) {
      if (this._vertexBlocked(vx, vz)) continue;
      this.heights[this._idx(vx, vz)] = value;
    }

    this._applyHeightsToGeometry();
  }

  _applyHeightsToGeometry() {
    if (!this.terrainMesh) return;
    const pos = this.terrainMesh.geometry.attributes.position;
    const expected = (this.gridWidth + 1) * (this.gridHeight + 1);
    if (pos.count !== expected) {
      console.error('[HeightTool] Geometry vertex count mismatch.');
      return;
    }

    for (let i = 0; i < this.heights.length; i++) {
      // IMPORTANT: PlaneGeometry is XY plane; after mesh rotation,
      // local Z corresponds to world Y (vertical).
      pos.setZ(i, this.heights[i]);
    }
    pos.needsUpdate = true;
    this.terrainMesh.geometry.computeVertexNormals();
    this.terrainMesh.geometry.computeBoundingSphere?.();

    // keep pin overlays riding above local average height
    for (const [k, mesh] of this.pinMeshes) {
      const [tx, tz] = k.split(',').map(Number);
      mesh.position.y = this._tileAverageHeight(tx, tz) + 0.05;
    }
  }
}