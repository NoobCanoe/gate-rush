import test from 'node:test';
import assert from 'node:assert/strict';
import { createSteer } from '../src/input.js';

test('touching off-centre does not jump the army', () => {
  const s = createSteer();
  s.start(1, 300, 400);
  assert.equal(s.value, 0);
});

test('dragging steers relative to where the drag began', () => {
  const s = createSteer();
  s.start(1, 300, 400);
  s.move(1, 370, 400);
  assert.equal(s.value, 0.5);
  s.move(1, 1000, 400);
  assert.equal(s.value, 1);
  s.move(1, -1000, 400);
  assert.equal(s.value, -1);
});

test('lifting keeps the position and a new drag continues from it', () => {
  const s = createSteer();
  s.start(1, 300, 400);
  s.move(1, 370, 400);
  s.end(1);
  assert.equal(s.value, 0.5);
  s.start(2, 50, 400);
  s.move(2, 50, 400);
  assert.equal(s.value, 0.5);
  s.move(2, 15, 400);
  assert.equal(s.value, 0.25);
});

test('a second finger is ignored while the first is down', () => {
  const s = createSteer();
  s.start(1, 200, 400);
  s.start(2, 10, 400);
  s.move(2, 390, 400);
  assert.equal(s.value, 0);
  s.end(2);
  s.move(1, 270, 400);
  assert.equal(s.value, 0.5);
});

test('a zero-width screen is harmless', () => {
  const s = createSteer();
  s.start(1, 0, 0);
  s.move(1, 50, 0);
  assert.ok(Number.isFinite(s.value));
});

test('dragging past the edge leaves no dead travel on the way back', () => {
  const s = createSteer();
  s.start(1, 100, 400);
  s.move(1, 100 + 420, 400); // three times the full span
  assert.equal(s.value, 1);
  s.move(1, 100 + 420 - 70, 400);
  assert.equal(s.value, 0.5);
});

test('a lost pointer-up does not block the next touch', () => {
  const s = createSteer();
  s.start(1, 100, 400);
  s.cancel();
  s.start(2, 200, 400);
  s.move(2, 270, 400);
  assert.equal(s.value, 0.5);
});
