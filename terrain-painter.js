// file: terrain-painter.js
import * as THREE from 'three';
import { SAND_MATERIAL, setWorldSpaceUVs } from './sand-material.js';
import { createWaterTile } from './water-tiles.js';
import { tileToWorld } from './grid-utils.js';

export class TerrainPainter {
  constructor(scene, dirLight, waterNormals) {
    this.group = new THREE.Group();
    this.group.name = 'TerrainPaint';
    scene.add(this.group);

    this.dirLight = dirLight;
    this.waterNormals = waterNormals;

    this.paintedTiles = new Map(); // "x,y" -> mesh
    this.waterTiles = new Set();

    this.gridWidth = 10;
    this.gridHeight = 10;

    // simple flat-color materials for the other terrain types
    this.MATERIALS = {
      // sand handled via SAND_MATERIAL
      dirt:   new THREE.MeshStandardMaterial({ color: 0x6F451F, roughness: 0.95, metalness: 0.0, flatShading: true }),
      grass:  new THREE.MeshStandardMaterial({ color: 0x2E7D32, roughness: 0.90, metalness: 0.0, flatShading: true }),
      stone:  new THREE.MeshStandardMaterial({ color: 0x7D7D7D, roughness: 1.00, metalness: 0.0, flatShading: true }),
      gravel: new THREE.MeshStandardMaterial({ color: 0x9A9A9A, roughness: 0.95, metalness: 0.0, flatShading: true }),
    };
  }

  setGridSize(w, h) {
    this.gridWidth = w;
    this.gridHeight = h;
  }

  tileKey(x, y) { return `${x},${y}`; }

  clearAll() {
    for (const [, mesh] of this.paintedTiles) {
      this.group.remove(mesh);
      mesh.geometry?.dispose?.();
      if (mesh.userData?.isWater) mesh.material?.dispose?.();
    }
    this.paintedTiles.clear();
    this.waterTiles.clear();
  }

  paintTile(tx, tz, type) {
    if (tx < 0 || tx >= this.gridWidth || tz < 0 || tz >= this.gridHeight) return;

    const key = this.tileKey(tx, tz);
    const old = this.paintedTiles.get(key);
    if (old) {
      if (old.userData?.isWater) this.waterTiles.delete(old);
      this.group.remove(old);
      old.geometry?.dispose?.();
      if (old.userData?.isWater) old.material?.dispose?.();
      this.paintedTiles.delete(key);
    }

    // WATER
    if (type === 'water') {
      const mesh = createWaterTile({
        tx, tz,
        tileToWorld,
        gridWidth: this.gridWidth,
        gridHeight: this.gridHeight,
        dirLight: this.dirLight,
        waterNormals: this.waterNormals
      });
      this.group.add(mesh);
      this.paintedTiles.set(key, mesh);
      this.waterTiles.add(mesh);
      return;
    }

    // SOLIDS
    const geo = new THREE.PlaneGeometry(1, 1);
    const wp = tileToWorld(tx, tz, this.gridWidth, this.gridHeight);
    let mat;

    if (type === 'sand') {
      setWorldSpaceUVs(geo, wp);      // makes dunes continuous across tiles
      mat = SAND_MATERIAL;
    } else {
      mat = this.MATERIALS[type] || this.MATERIALS.dirt;
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(wp.x, 0.015, wp.z);
    mesh.name = `Tile_${key}_${type}`;
    mesh.userData.type = type;

    this.group.add(mesh);
    this.paintedTiles.set(key, mesh);
  }

  tickWater(dt) {
    if (!this.waterTiles.size) return;
    for (const w of this.waterTiles) {
      const u = w.material?.uniforms;
      if (u && u.time) u.time.value += dt;
    }
  }

  serialize() {
    const tiles = [];
    for (const [key, mesh] of this.paintedTiles) {
      const [xStr, yStr] = key.split(',');
      const tx = Number(xStr), tz = Number(yStr);
      const t = mesh?.userData?.type;
      if (Number.isFinite(tx) && Number.isFinite(tz) && typeof t === 'string') {
        tiles.push([tx, tz, t]);
      }
    }
    return tiles;
  }

  deserialize(tiles) {
    this.clearAll();
    if (!Array.isArray(tiles)) return;
    for (const t of tiles) {
      if (!Array.isArray(t) || t.length < 3) continue;
      const px = Number(t[0]), pz = Number(t[1]);
      const type = String(t[2]);
      if (Number.isFinite(px) && Number.isFinite(pz)) {
        this.paintTile(px, pz, type);
      }
    }
  }
}