// file: character-controller.js
import * as THREE from 'three';
import { tileToWorld } from './grid-utils.js';

export class CharacterController {
  constructor(characterMesh, startTx, startTz, gridWidth = 10, gridHeight = 10) {
    this.mesh = characterMesh;
    this.speed = 4;
    this.path = [];
    this.isMoving = false;
    this.targetPosition = new THREE.Vector3();

    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;

    // Optional pathfinding lib (may be unreliable — we add a fallback)
    this.PF = (typeof window !== 'undefined') ? window.PF : null;
    if (this.PF) {
      // This build expects an object: {width, height}
      this.pfGrid = new this.PF.Grid({ width: gridWidth, height: gridHeight });
      this.finder = new this.PF.AStarFinder({
        allowDiagonal: true,
        dontCrossCorners: true,
        // NOTE: This lib’s A* uses a (dx,dy) heuristic internally; leave undefined to use its default,
        // because PF.Heuristic.* expect nodes and will mismatch in this build.
      });
    }

    this.resetTo(startTx, startTz);
  }

  updateGridSize(width, height) {
    this.gridWidth = width;
    this.gridHeight = height;
    if (this.PF) {
      this.pfGrid = new this.PF.Grid({ width, height });
      if (!this.finder) {
        this.finder = new this.PF.AStarFinder({
          allowDiagonal: true,
          dontCrossCorners: true,
        });
      }
    }
  }

  resetTo(tx, tz) {
    this.isMoving = false;
    this.path = [];
    this.tilePos = { tx, tz };
    const worldPos = tileToWorld(tx, tz, this.gridWidth, this.gridHeight);
    this.mesh.position.set(worldPos.x, this.mesh.position.y, worldPos.z);
    this.targetPosition.copy(this.mesh.position);
  }

  moveTo(tx, tz) {
    if (this.isMoving || (tx === this.tilePos.tx && tz === this.tilePos.tz)) return;
    if (tx < 0 || tx >= this.gridWidth || tz < 0 || tz >= this.gridHeight) return;

    let path = null;

    // Try pathfinding lib if present
    if (this.PF && this.finder && this.pfGrid) {
      try {
        const gridClone = this.pfGrid.clone();
        path = this.finder.findPath(this.tilePos.tx, this.tilePos.tz, tx, tz, gridClone);
      } catch (_) {
        // ignore; we’ll fallback
        path = null;
      }
    }

    // Fallback: 8-direction straight-line stepping to target
    if (!Array.isArray(path) || path.length <= 1) {
      path = this._fallbackPath(this.tilePos.tx, this.tilePos.tz, tx, tz);
    }

    if (path && path.length > 0) {
      // The fallback returns only the steps (no start), same as PF.slice(1)
      this.path = path;
      this.isMoving = true;
      this._setNextTarget();
    }
  }

  // Simple, robust 8-direction stepper (diag when possible, then straight)
  _fallbackPath(sx, sz, tx, tz) {
    const steps = [];
    let cx = sx, cz = sz;
    const clamp = (v, min, max) => Math.max(min, Math.min(v, max));
    while (cx !== tx || cz !== tz) {
      const stepX = Math.sign(tx - cx);
      const stepZ = Math.sign(tz - cz);
      cx = clamp(cx + stepX, 0, this.gridWidth - 1);
      cz = clamp(cz + stepZ, 0, this.gridHeight - 1);
      steps.push([cx, cz]);
      // Safety (avoid infinite loop if something’s weird)
      if (steps.length > this.gridWidth * this.gridHeight + 4) break;
    }
    return steps;
  }

  _setNextTarget() {
    if (this.path.length === 0) {
      this.isMoving = false;
      return;
    }
    const [nx, nz] = this.path[0];
    const wp = tileToWorld(nx, nz, this.gridWidth, this.gridHeight);
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
    const t = Math.min(1, step / Math.max(1e-6, dist));
    this.mesh.position.lerp(this.targetPosition, t);
  }
}