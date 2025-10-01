import * as THREE from 'three';
import { tileToWorld } from './grid-utils.js';

function buildStraightPath(ax, az, bx, bz) {
  // Simple Manhattan-ish path: step X then Z (no obstacles yet).
  const path = [];
  let x = ax, z = az;

  const stepx = (bx > x) ? 1 : -1;
  const stepz = (bz > z) ? 1 : -1;

  while (x !== bx) { x += stepx; path.push([x, z]); }
  while (z !== bz) { z += stepz; path.push([x, z]); }

  return path;
}

export class CharacterController {
  constructor(characterMesh, startTx, startTz, speed = 4) {
    this.mesh = characterMesh;
    this.tilePos = { tx: startTx, tz: startTz };
    this.speed = speed;

    this.path = [];
    this.targetPosition = tileToWorld(startTx, startTz).clone();
    this.isMoving = false;

    // Use the global PF (from pathfinding-browser.js) if available.
    this.PF = (typeof window !== 'undefined') ? window.PF : null;
    if (!this.PF) {
      console.warn('[CharacterController] window.PF not found; will use straight-line fallback.');
    } else {
      this.pfGrid = new this.PF.Grid(10, 10);
      this.finder = new this.PF.AStarFinder({
        allowDiagonal: true,
        dontCrossCorners: true
      });
    }
  }

  moveTo(tx, tz) {
    if (this.isMoving || (tx === this.tilePos.tx && tz === this.tilePos.tz)) return;
    if (tx < 0 || tx > 9 || tz < 0 || tz > 9) return;

    let path = null;

    if (this.PF && this.pfGrid && this.finder) {
      try {
        const grid = this.pfGrid.clone();
        const { tx: sx, tz: sz } = this.tilePos;
        path = this.finder.findPath(sx, sz, tx, tz, grid);
        if (!Array.isArray(path) || path.length <= 1) path = null;
      } catch (e) {
        console.warn('[CharacterController] PF failed, falling back to straight path.', e);
        path = null;
      }
    }

    if (!path) {
      // Fallback: straight path (X then Z)
      path = buildStraightPath(this.tilePos.tx, this.tilePos.tz, tx, tz);
    } else {
      // Drop the first node (it's the current tile)
      path = path.slice(1);
    }

    if (path.length > 0) {
      this.path = path;
      this.isMoving = true;
      this._setNextTarget();
    }
  }

  _setNextTarget() {
    if (this.path.length === 0) {
      this.isMoving = false;
      return;
    }
    const [nx, nz] = this.path[0];
    const wp = tileToWorld(nx, nz);
    this.targetPosition.set(wp.x, this.mesh.position.y, wp.z);
  }

  update(dt) {
    if (!this.isMoving) return;

    const dist = this.mesh.position.distanceTo(this.targetPosition);

    if (dist < 0.05) {
      const [nx, nz] = this.path[0];
      this.tilePos = { tx: nx, tz: nz };
      this.path.shift();
      if (this.path.length === 0) {
        this.isMoving = false;
        return;
      }
      this._setNextTarget();
      return;
    }

    const step = this.speed * dt;
    const t = Math.min(1, step / Math.max(1e-6, dist)); // clamp so we never overshoot
    this.mesh.position.lerp(this.targetPosition, t);
  }
}