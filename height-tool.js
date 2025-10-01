// file: height-tool.js
import * as THREE from 'three';
import { tileToWorld } from './grid-utils.js';

/**
 * HeightTool
 * ----------
 * Keeps a (gridWidth+1) x (gridHeight+1) heightfield of shared corner nodes.
 * Each tile mesh is a PlaneGeometry(1,1,1,1) rotated -PI/2 around X so
 * geometry Z -> world Y (height).
 *
 * Pinned tiles "hold" their corners: any corner used by a pinned tile won't be
 * changed when a neighbor is raised/lowered.
 *
 * NOTE: Only tiles that exist as meshes will visually update (i.e., tiles
 * you've painted/placed). If you want *every* cell to display height even when
 * not painted, we can add neutral ground tiles later.
 */
export class HeightTool {
  /**
   * @param {THREE.Scene} scene
   * @param {Map<string,THREE.Mesh>} paintedTilesMap - key "x,y" -> tile mesh
   * @param {number} gridWidth
   * @param {number} gridHeight
   */
  constructor(scene, paintedTilesMap, gridWidth = 10, gridHeight = 10) {
    this.scene = scene;
    this.paintedTiles = paintedTilesMap;

    this.gridWidth = gridWidth | 0;
    this.gridHeight = gridHeight | 0;

    this.heights = new Float32Array((this.gridWidth + 1) * (this.gridHeight + 1));
    this.pinned = new Set(); // tile keys "x,y"

    // Visual layer for pinned tiles
    this.pinGroup = new THREE.Group();
    this.pinGroup.name = 'PinnedTilesOverlay';
    scene.add(this.pinGroup);
    this.pinMeshes = new Map(); // key -> mesh
  }

  idx(nx, nz) { return nz * (this.gridWidth + 1) + nx; }
  tileKey(x, y) { return `${x},${y}`; }

  /** Reset sizes (clears pins, zeroes heights) */
  reset(w, h) {
    this.gridWidth = w | 0;
    this.gridHeight = h | 0;
    this.heights = new Float32Array((this.gridWidth + 1) * (this.gridHeight + 1));
    this.removeAllPins();
  }

  /** Clear all pins & overlays */
  removeAllPins() {
    for (const [, m] of this.pinMeshes) {
      this.pinGroup.remove(m);
      m.geometry?.dispose?.();
      m.material?.dispose?.();
    }
    this.pinMeshes.clear();
    this.pinned.clear();
  }

  /** Toggle a green overlay for a tile as pinned (returns isPinned) */
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
      mesh.position.set(wp.x, 0.05, wp.z);
      mesh.name = `Pin_${key}`;
      this.pinGroup.add(mesh);
      this.pinMeshes.set(key, mesh);
      return true;
    }
  }

  /** True if ANY tile using corner node (nx,nz) is pinned */
  nodeIsBlocked(nx, nz) {
    const tiles = [
      [nx-1, nz-1],
      [nx-1, nz],
      [nx,   nz-1],
      [nx,   nz],
    ];
    for (const [tx, tz] of tiles) {
      if (tx < 0 || tz < 0 || tx >= this.gridWidth || tz >= this.gridHeight) continue;
      if (this.pinned.has(this.tileKey(tx, tz))) return true;
    }
    return false;
  }

  /** Set a tile's 4 node heights to @value (unless blocked by pins) and update neighbor meshes */
  setTileHeight(tx, tz, value) {
    if (tx < 0 || tz < 0 || tx >= this.gridWidth || tz >= this.gridHeight) return;

    // four corner nodes for this tile:
    const nodes = [
      [tx,   tz  ], // LL
      [tx+1, tz  ], // LR
      [tx,   tz+1], // UL
      [tx+1, tz+1]  // UR
    ];

    for (const [nx, nz] of nodes) {
      if (this.nodeIsBlocked(nx, nz)) continue;
      this.heights[this.idx(nx, nz)] = value;
    }

    // Update all tiles that share these nodes
    const affected = new Set();
    affected.add(this.tileKey(tx, tz));
    if (tx-1 >= 0) affected.add(this.tileKey(tx-1, tz));
    if (tz-1 >= 0) affected.add(this.tileKey(tx, tz-1));
    if (tx-1 >= 0 && tz-1 >= 0) affected.add(this.tileKey(tx-1, tz-1));
    if (tx+1 < this.gridWidth) affected.add(this.tileKey(tx+1, tz));
    if (tz+1 < this.gridHeight) affected.add(this.tileKey(tx, tz+1));
    if (tx+1 < this.gridWidth && tz+1 < this.gridHeight) affected.add(this.tileKey(tx+1, tz+1));

    for (const key of affected) {
      const m = this.paintedTiles.get(key);
      if (m) this._applyHeightsToTileMesh(m, key);
    }
  }

  /** Force-refresh a specific painted tile from current heightfield (used after LOAD) */
  refreshTile(tx, tz) {
    const key = this.tileKey(tx, tz);
    const m = this.paintedTiles.get(key);
    if (m) this._applyHeightsToTileMesh(m, key);
  }

  /** Bulk refresh (e.g., after load) */
  refreshAllPainted() {
    for (const key of this.paintedTiles.keys()) {
      const m = this.paintedTiles.get(key);
      if (m) this._applyHeightsToTileMesh(m, key);
    }
  }

  /** Internal: write node heights to a PlaneGeometry(1,1) tile mesh */
  _applyHeightsToTileMesh(mesh, key) {
    const [tx, tz] = key.split(',').map(n => parseInt(n, 10));
    if (!Number.isFinite(tx) || !Number.isFinite(tz)) return;

    const pos = mesh.geometry.attributes.position;
    if (!pos || pos.count < 4) return;

    const hLL = this.heights[this.idx(tx,   tz  )]; // vertex 0
    const hLR = this.heights[this.idx(tx+1, tz  )]; // vertex 1
    const hUL = this.heights[this.idx(tx,   tz+1)]; // vertex 2
    const hUR = this.heights[this.idx(tx+1, tz+1)]; // vertex 3

    // In geometry local XY plane (before rotation), set Z = height
    pos.setZ(0, hLL);
    pos.setZ(1, hLR);
    pos.setZ(2, hUL);
    pos.setZ(3, hUR);

    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }
}