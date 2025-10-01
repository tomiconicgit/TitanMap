// file: tile-utils.js

/** Centered plane: tile (tx,tz) -> world (x,z) */
export function tileToWorld(tx, tz, gridWidth, gridHeight) {
  const x = tx - gridWidth / 2 + 0.5;
  const z = tz - gridHeight / 2 + 0.5;
  return { x, z };
}

/** Centered plane: world (x,z) -> clamped tile (tx,tz) */
export function worldToTile(x, z, gridWidth, gridHeight) {
  let tx = Math.floor(x + gridWidth / 2);
  let tz = Math.floor(z + gridHeight / 2);
  tx = Math.max(0, Math.min(gridWidth - 1, tx));
  tz = Math.max(0, Math.min(gridHeight - 1, tz));
  return { tx, tz };
}

export const keyFor = (tx, tz) => `${tx},${tz}`;