import { ExtrudeGeometry, Shape, Vector3 } from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

/** Sculpted shoulders, a narrow throat and a thick, bevelled glass base. */
export function createBottleGeometry() {
  const outline = new Shape();
  outline.moveTo(-.55, -1.08);
  outline.lineTo(.55, -1.08);
  outline.quadraticCurveTo(.76, -1.08, .76, -.87);
  outline.lineTo(.76, .39);
  outline.bezierCurveTo(.76, .59, .66, .68, .51, .74);
  outline.lineTo(.30, .82);
  outline.quadraticCurveTo(.27, .84, .27, .90);
  outline.lineTo(-.27, .90);
  outline.quadraticCurveTo(-.27, .84, -.30, .82);
  outline.lineTo(-.51, .74);
  outline.bezierCurveTo(-.66, .68, -.76, .59, -.76, .39);
  outline.lineTo(-.76, -.87);
  outline.quadraticCurveTo(-.76, -1.08, -.55, -1.08);
  outline.closePath();
  const raw = new ExtrudeGeometry(outline, {
    depth: .64, steps: 1, curveSegments: 10,
    bevelEnabled: true, bevelThickness: .09, bevelSize: .055, bevelSegments: 6,
  });
  raw.translate(0, 0, -.32);
  const geometry = toCreasedNormals(raw, Math.PI / 3);
  if (geometry !== raw) raw.dispose();
  geometry.computeBoundingBox();
  return geometry;
}

const corner = new Vector3();

/** Project the bottle alone, excluding its light orbits, onto the interaction layer. */
export function projectBottleBounds(bounds, matrixWorld, camera, width, height) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (let i = 0; i < 8; i++) {
    corner.set(
      i & 1 ? bounds.max.x : bounds.min.x,
      i & 2 ? bounds.max.y : bounds.min.y,
      i & 4 ? bounds.max.z : bounds.min.z,
    ).applyMatrix4(matrixWorld).project(camera);
    const x = (corner.x + 1) * width / 2;
    const y = (1 - corner.y) * height / 2;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return { left, top, width: right - left, height: bottom - top };
}
