// file: grid.js
import * as THREE from 'three';

/**
 * Creates a rectangular grid of width×height tiles (tile size = 1).
 * Returns a THREE.Group containing the grid lines.
 */
export function createGrid(width = 10, height = 10) {
  const group = new THREE.Group();
  group.name = 'RectGrid';

  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));

  // Lines every 1 unit, centered at origin
  // X axis goes left->right, Z axis goes forward->back
  const material = new THREE.LineBasicMaterial({ color: 0x444444 });
  const materialCenter = new THREE.LineBasicMaterial({ color: 0x888888 });

  const geo = new THREE.BufferGeometry();
  const verts = [];

  // vertical lines (parallel to Z), from x = -w/2 .. +w/2
  for (let x = 0; x <= w; x++) {
    const fx = x - w / 2;
    verts.push(fx, 0, -h / 2,  fx, 0,  h / 2);
  }

  // horizontal lines (parallel to X), from z = -h/2 .. +h/2
  for (let z = 0; z <= h; z++) {
    const fz = z - h / 2;
    verts.push(-w / 2, 0, fz,  w / 2, 0, fz);
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const lines = new THREE.LineSegments(geo, material);
  lines.position.y = -0.01;
  group.add(lines);

  // Emphasize origin axes line if they fall on a grid line
  if (w % 2 === 0) {
    const x0 = 0;
    const geoX = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x0, -0.009, -h / 2),
      new THREE.Vector3(x0, -0.009,  h / 2),
    ]);
    group.add(new THREE.Line(geoX, materialCenter));
  }
  if (h % 2 === 0) {
    const z0 = 0;
    const geoZ = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-w / 2, -0.009, z0),
      new THREE.Vector3( w / 2, -0.009, z0),
    ]);
    group.add(new THREE.Line(geoZ, materialCenter));
  }

  return group;
}