// file: terrain-painter.js
import * as THREE from 'three';
import { keyFor } from './tile-utils.js';

import { colorProc as sandProc }   from './textures/sand.js';
import { colorProc as dirtProc }   from './textures/dirt.js';
import { colorProc as pathProc }   from './textures/path.js';
import { colorProc as grassProc }  from './textures/grass.js';
import { colorProc as gravelProc } from './textures/gravel.js';

const PROC = {
  sand:   sandProc,
  dirt:   dirtProc,
  path:   pathProc,
  grass:  grassProc,
  gravel: gravelProc
};

export class TerrainPainter {
  constructor(terrain) {
    this.terrain = terrain;
    this.gridWidth = 10;
    this.gridHeight = 10;
    this.painted = new Map(); // key => type
  }

  setGridSize(w, h) {
    this.gridWidth = w|0;
    this.gridHeight = h|0;
  }

  /** Paint logical record + write colors */
  paint(tx, tz, type) {
    if (!PROC[type]) return;
    if (tx < 0 || tz < 0 || tx >= this.gridWidth || tz >= this.gridHeight) return;

    const seed = hash2(tx, tz); // stable seed per tile
    const proc = PROC[type];

    // Create a colorAtCorner function that returns THREE.Color for (fx,fz) in {0,1}
    const colorAtCorner = (fx, fz) => {
      const c = proc({ tx, tz, fx, fz, seed });
      return (c instanceof THREE.Color) ? c : new THREE.Color(c.r, c.g, c.b);
    };

    this.terrain.paintTileColor(tx, tz, colorAtCorner);
    this.painted.set(keyFor(tx, tz), type);
  }

  serialize() {
    const out = [];
    for (const [k, t] of this.painted) {
      const [x, z] = k.split(',').map(Number);
      out.push([x, z, t]);
    }
    return out;
  }

  deserialize(tilesArray) {
    this.painted.clear();
    if (!Array.isArray(tilesArray)) return;
    for (const [tx, tz, type] of tilesArray) {
      this.paint(tx|0, tz|0, String(type));
    }
  }
}

// tiny hash-based RNG
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}