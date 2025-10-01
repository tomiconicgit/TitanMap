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

    this.PF = (typeof window !== 'undefined') ? window.PF : null;
    if (this.PF) {
      this.pfGrid = new this.PF.Grid({ width: gridWidth, height: gridHeight });
      this.finder = new this.PF.AStarFinder({
        allowDiagonal: true,
        dontCrossCorners: true,
        heuristic: this.PF.Heuristic.octile,
        weight: 1
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
          heuristic: this.PF.Heuristic.octile,
          weight: 1
        });
      }
    }
  }

  /** Mark a list/set of tiles as non-walkable on the current PF grid */
  applyNonWalkables(tilesIterable) {
    if (!this.pfGrid) return;
    for (const t of tilesIterable) {
      const [xStr, yStr] = (Array.isArray(t) ? t : String(t).split(','));
      const x = Number(xStr), y = Number(yStr);
      if (Number.isFinite(x) && Number.isFinite(y) &&
          x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight) {
        this.pfGrid.setWalkableAt(x, y, false);
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
    if (this.PF && this.finder && this.pfGrid) {
      const gridClone = this.pfGrid.clone();
      path = this.finder.findPath(this.tilePos.tx, this.tilePos.tz, tx, tz, gridClone);
    }

    if (path && path.length > 1) {
      this.path = path.slice(1);
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