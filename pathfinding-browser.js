/* pathfinding-browser.js (minimal, correct A* for browser)
   Exposes: window.PF = { Grid, AStarFinder, Heuristic }
*/
(function () {
  // ----- Heuristics -----
  const Heuristic = {
    manhattan: (dx, dy) => dx + dy,
    euclidean: (dx, dy) => Math.hypot(dx, dy),
    chebyshev: (dx, dy) => Math.max(dx, dy),
    octile:    (dx, dy) => {
      const F = Math.SQRT2 - 1;
      return (dx < dy) ? F * dx + dy : F * dy + dx;
    }
  };

  // ----- Grid / Node -----
  class Node {
    constructor(x, y, walkable = true) {
      this.x = x; this.y = y;
      this.walkable = walkable;
      // for A*
      this.f = 0; this.g = 0; this.h = 0;
      this.opened = false; this.closed = false;
      this.parent = null;
    }
  }

  class Grid {
    constructor(opt) {
      // accepts {width, height} or (w, h) for convenience
      const w = (typeof opt === 'object') ? opt.width : arguments[0];
      const h = (typeof opt === 'object') ? opt.height : arguments[1];
      this.width = w|0; this.height = h|0;
      this.nodes = new Array(this.height);
      for (let y = 0; y < this.height; y++) {
        this.nodes[y] = new Array(this.width);
        for (let x = 0; x < this.width; x++) {
          this.nodes[y][x] = new Node(x, y, true);
        }
      }
    }
    getNodeAt(x, y) { return this.nodes[y][x]; }
    isInside(x, y) { return x >= 0 && x < this.width && y >= 0 && y < this.height; }
    isWalkableAt(x, y) { return this.isInside(x, y) && this.nodes[y][x].walkable; }
    setWalkableAt(x, y, walkable) { if (this.isInside(x, y)) this.nodes[y][x].walkable = !!walkable; }
    clone() {
      const g = new Grid({ width: this.width, height: this.height });
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          g.nodes[y][x].walkable = this.nodes[y][x].walkable;
        }
      }
      return g;
    }
    getNeighbors(node, allowDiagonal = true, dontCrossCorners = true) {
      const x = node.x, y = node.y;
      const neighbors = [];

      // orthogonal
      const up    = [x, y - 1], down  = [x, y + 1],
            left  = [x - 1, y], right = [x + 1, y];

      const canUp    = this.isWalkableAt(up[0], up[1]);
      const canDown  = this.isWalkableAt(down[0], down[1]);
      const canLeft  = this.isWalkableAt(left[0], left[1]);
      const canRight = this.isWalkableAt(right[0], right[1]);

      if (canUp)    neighbors.push(this.getNodeAt(up[0], up[1]));
      if (canRight) neighbors.push(this.getNodeAt(right[0], right[1]));
      if (canDown)  neighbors.push(this.getNodeAt(down[0], down[1]));
      if (canLeft)  neighbors.push(this.getNodeAt(left[0], left[1]));

      if (!allowDiagonal) return neighbors;

      // diagonals
      const u = canUp, d = canDown, l = canLeft, r = canRight;

      // If crossing corners is disallowed, at least one of the adjacent orthogonal tiles must be walkable.
      const diagOK = (okA, okB) => dontCrossCorners ? (okA || okB) : (okA && okB);

      const uL = [x - 1, y - 1], uR = [x + 1, y - 1],
            dL = [x - 1, y + 1], dR = [x + 1, y + 1];

      if (this.isWalkableAt(uL[0], uL[1]) && diagOK(u, l)) neighbors.push(this.getNodeAt(uL[0], uL[1]));
      if (this.isWalkableAt(uR[0], uR[1]) && diagOK(u, r)) neighbors.push(this.getNodeAt(uR[0], uR[1]));
      if (this.isWalkableAt(dL[0], dL[1]) && diagOK(d, l)) neighbors.push(this.getNodeAt(dL[0], dL[1]));
      if (this.isWalkableAt(dR[0], dR[1]) && diagOK(d, r)) neighbors.push(this.getNodeAt(dR[0], dR[1]));

      return neighbors;
    }
  }

  // ----- A* -----
  class AStarFinder {
    constructor(opts = {}) {
      this.allowDiagonal  = !!opts.allowDiagonal;
      this.dontCrossCorners = !!opts.dontCrossCorners;
      this.heuristicFn    = opts.heuristic || Heuristic.manhattan;
      this.weight         = Number(opts.weight || 1);
    }

    findPath(sx, sy, ex, ey, grid) {
      const start = grid.getNodeAt(sx, sy);
      const goal  = grid.getNodeAt(ex, ey);
      if (!start || !goal || !start.walkable || !goal.walkable) return [];

      // binary heap (min-heap by f)
      const open = [];
      const pushOpen = (n) => {
        open.push(n);
        let i = open.length - 1;
        while (i > 0) {
          const p = ((i - 1) >> 1);
          if (open[p].f <= open[i].f) break;
          [open[i], open[p]] = [open[p], open[i]];
          i = p;
        }
      };
      const popOpen = () => {
        const top = open[0], last = open.pop();
        if (open.length) {
          open[0] = last;
          // down-heap
          let i = 0;
          while (true) {
            const l = i * 2 + 1, r = l + 1;
            let m = i;
            if (l < open.length && open[l].f < open[m].f) m = l;
            if (r < open.length && open[r].f < open[m].f) m = r;
            if (m === i) break;
            [open[i], open[m]] = [open[m], open[i]];
            i = m;
          }
        }
        return top;
      };

      start.g = 0;
      start.h = this.heuristicFn(Math.abs(ex - sx), Math.abs(ey - sy)) * this.weight;
      start.f = start.g + start.h;
      pushOpen(start);
      start.opened = true;

      while (open.length) {
        const node = popOpen();
        node.closed = true;

        if (node === goal) {
          // reconstruct
          const path = [];
          let cur = node;
          while (cur) {
            path.push([cur.x, cur.y]);
            cur = cur.parent;
          }
          return path.reverse();
        }

        const neighbors = grid.getNeighbors(node, this.allowDiagonal, this.dontCrossCorners);
        for (let i = 0; i < neighbors.length; i++) {
          const nb = neighbors[i];
          if (nb.closed || !nb.walkable) continue;

          const dx = nb.x - node.x;
          const dy = nb.y - node.y;
          const cost = (dx === 0 || dy === 0) ? 1 : Math.SQRT2; // straight or diagonal

          const gScore = node.g + cost;
          const beenOpened = nb.opened;

          if (!beenOpened || gScore < nb.g) {
            nb.g = gScore;
            nb.h = nb.h || this.heuristicFn(Math.abs(ex - nb.x), Math.abs(ey - nb.y)) * this.weight;
            nb.f = nb.g + nb.h;
            nb.parent = node;

            if (!beenOpened) {
              pushOpen(nb);
              nb.opened = true;
            } else {
              // re-heapify: simple approach reinsert (cheap for small sets)
              // remove nb from open if exists, then push again
              const idx = open.indexOf(nb);
              if (idx >= 0) { open.splice(idx, 1); }
              pushOpen(nb);
            }
          }
        }
      }

      return [];
    }
  }

  // Expose
  const PF = { Grid, AStarFinder, Heuristic };
  if (typeof window !== 'undefined') window.PF = PF;
  else if (typeof global !== 'undefined') global.PF = PF;
})();