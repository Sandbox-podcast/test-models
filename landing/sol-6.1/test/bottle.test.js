import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { createBottleGeometry, projectBottleBounds } from '../src/bottle-geometry.js';
import { attachBottleControls } from '../src/bottle-controls.js';

test('the glass is a finite 3D volume with a narrower shoulder and usable normals', () => {
  const geometry = createBottleGeometry();
  const size = geometry.boundingBox.getSize(new Vector3());
  assert.ok(size.x > 1.5 && size.x < 1.8);
  assert.ok(size.y > 2 && size.y < 2.3);
  assert.ok(size.z > .8 && size.z < .9);
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  let shoulderWidth = 0;
  for (let i = 0; i < positions.count; i++) {
    assert.ok(Number.isFinite(positions.getX(i) + positions.getY(i) + positions.getZ(i)));
    const length = Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i));
    assert.ok(Math.abs(length - 1) < .001);
    if (positions.getY(i) > .85) shoulderWidth = Math.max(shoulderWidth, Math.abs(positions.getX(i)) * 2);
  }
  assert.ok(shoulderWidth > .5 && shoulderWidth < size.x * .6);
  geometry.dispose();
});

test('turning the bottle exposes its depth and the projected hit area follows the camera', () => {
  const camera = new PerspectiveCamera(36, 1440 / 900, .1, 60);
  camera.position.z = 8.1; camera.updateMatrixWorld();
  const bounds = new Box3(new Vector3(-.82, -1.15, -.42), new Vector3(.82, 1.61, .42));
  const front = projectBottleBounds(bounds, new Matrix4(), camera, 1440, 900);
  const side = projectBottleBounds(bounds, new Matrix4().makeRotationY(Math.PI / 2), camera, 1440, 900);
  assert.ok(side.width < front.width * .7);
  assert.ok(front.left > 0 && front.left + front.width < 1440);
  assert.ok(front.top > 0 && front.top + front.height < 900);
  const shifted = projectBottleBounds(bounds, new Matrix4().makeTranslation(1.6, 0, 0), camera, 1440, 900);
  assert.ok(shifted.left > front.left + 150);
  camera.aspect = 390 / 844; camera.position.z = 3.9 / camera.aspect;
  camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  const mobile = projectBottleBounds(bounds, new Matrix4().makeScale(.86, .86, .86), camera, 390, 844);
  assert.ok(mobile.left > 0 && mobile.left + mobile.width < 390);
  assert.ok(mobile.top > 0 && mobile.top + mobile.height < 844);
});

class Control extends EventTarget {
  disabled = false;
  classes = new Set();
  classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name) };
  setPointerCapture(id) { this.captured = id; }
  hasPointerCapture(id) { return this.captured === id; }
  releasePointerCapture() { this.captured = undefined; }
  send(type, fields = {}) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, clientX: 100, clientY: 100, detail: 1 }, fields);
    this.dispatchEvent(event); return event;
  }
}

test('horizontal dragging rotates, releases capture and suppresses the trailing click', () => {
  const button = new Control(); let angle = 0;
  attachBottleControls(button, { rotate: delta => { angle += delta; }, reset: () => {}, getWidth: () => 200 });
  button.send('pointerdown');
  button.send('pointermove', { clientX: 160 });
  assert.ok(angle > 1 && angle < 1.5);
  button.send('pointerup', { clientX: 160 });
  assert.equal(button.captured, undefined);
  const beforeClick = angle; button.send('click'); assert.equal(angle, beforeClick);
  button.send('click', { detail: 0 }); assert.ok(angle > beforeClick);
});

test('a vertical touch gesture leaves scrolling available; cancel and keyboard reset work', () => {
  const button = new Control(); let angle = 0;
  attachBottleControls(button, { rotate: delta => { angle += delta; }, reset: () => { angle = 0; }, getWidth: () => 180 });
  button.send('pointerdown', { pointerType: 'touch' });
  const vertical = button.send('pointermove', { clientX: 103, clientY: 160 });
  assert.equal(angle, 0); assert.equal(vertical.defaultPrevented, false);
  button.send('pointercancel'); assert.equal(button.captured, undefined);
  const right = button.send('keydown', { key: 'ArrowRight' });
  assert.ok(angle > 0); assert.equal(right.defaultPrevented, true);
  button.send('keydown', { key: 'ArrowLeft' }); assert.equal(angle, 0);
  button.send('keydown', { key: 'ArrowRight' });
  button.send('keydown', { key: 'Home' }); assert.equal(angle, 0);
});
