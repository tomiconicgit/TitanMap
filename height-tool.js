// file: height-tool.js
import * as THREE from 'three';

/**
 * HeightTool operates on a single PlaneGeometry used as the terrain mesh:
 * - Stores a (w+1)*(h+1) height field.
 * - setTileHeight(tx,tz,val): raises the 4 corner vertices of that tile (unless pinned).
 * - Pins are per tile; pinning a tile locks its 4 corner vertices.
 * - Can show/hide green overlays for pinned tiles.
 *
 * IMPORTANT: Your terrain mesh is a PlaneGeometry lying in local XY with Z=0,
 * then the MESH is rotated -PI/2 about X to become the ground.
 * Therefore "vertical" => geometry's local Z component.
 */
export class HeightTool {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Mesh} terrainMesh
   * @param {number} gridWidth number of tiles along X
   * @param {number} gridHeight number of tiles along Z
   */
  constructor(scene, terrainMesh, gridWidth = 10, gridHeight = 10) {
    this.scene = scene;
    this.terrainMesh = terrainMesh;
    this.gridWidth = gridWidth | 0;
    this.gridHeight = gridHeight | 0;

    // (w+1)*(h+1) vertex heights (in world Y == local Z)
    this.heights = new Float32Array((this.gridWidth + 1) * (this.gridHeight + 1)).fill(0);

    // pinned tile keys "tx,tz"
    this.pinned = new Set();

    // green overlays for pins (visible only when you want to show pin mode UI)
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

  /**
   * Reinitialize when the terrain mesh or grid size changes.
   */
  reset(terrainMesh, width, height) {
    this.terrainMesh = terrainMesh;
    this.gridWidth = width | 0;
    this.gridHeight = height | 0;
    this.heights = new Float32Array((this.gridWidth + 1) * (this.gridHeight + 1)).fill(0);
    // keep the *set* of pinned tiles, but rebuild the visuals
    this._rebuildAllPinMeshes();
    this._applyHeightsToGeometry();
  }

  // ---- pin overlays (green) ----
  setPinsVisible(v) { this.pinGroup.visible = !!v; }

  _rebuildAllPinMeshes() {
    // clear visuals
    for (const [, m] of this.pinMeshes) {
      this.pinGroup.remove(m);
      m.geometry?.dispose?.();
      m.material?.dispose?.();
    }
    this.pinMeshes.clear();

    // rebuild visuals for current pinned set
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
    // same mapping used elsewhere: centered plane, each tile is 1x1
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

  /**
   * Toggle pin on a tile. Pinned tile locks its 4 corner vertices.
   * Returns true if now pinned, false if unpinned.
   */
  togglePin(tx, tz) {
    if (tx < 0 || tz < 0 || tx >= this.gridWidth || tz >= this.gridHeight) return false;
    const k = this._key(tx, tz);

    if (this.pinned.has(k)) {
      // unpin
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
      // pin
      this.pinned.add(k);
      this._ensurePinMesh(tx, tz);
      return true;
    }
  }

  /**
   * A vertex (vx,vz) is considered "blocked" if any of the 4 tiles that share it are pinned.
   */
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

  /**
   * Set the height for the 4 vertices of tile (tx,tz) to "value", unless the vertex is blocked by a pin.
   * Because vertices are shared, neighbours will slope naturally.
   */
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

  /**
   * Write heights[] to geometry.local Z (which is world Y after mesh rotation),
   * recompute normals, and nudge pin overlays vertically to follow.
   */
  _applyHeightsToGeometry() {
    if (!this.terrainMesh) return;
    const pos = this.terrainMesh.geometry.attributes.position;
    const expected = (this.gridWidth + 1) * (this.gridHeight + 1);
    if (pos.count !== expected) {
      console.error('[HeightTool] Geometry vertex count mismatch.');
      return;
    }

    for (let i = 0; i < this.heights.length; i++) {
      pos.setZ(i, this.heights[i]);
    }
    pos.needsUpdate = true;
    this.terrainMesh.geometry.computeVertexNormals();
    this.terrainMesh.geometry.computeBoundingSphere?.();

    // keep green overlays sitting above the average height per tile
    for (const [k, mesh] of this.pinMeshes) {
      const [tx, tz] = k.split(',').map(Number);
      mesh.position.y = this._tileAverageHeight(tx, tz) + 0.05;
    }
  }
}