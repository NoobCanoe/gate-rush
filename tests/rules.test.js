import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyGate, gateLabel, gateIsGood, upgradeCost, startArmy, volleyDamage, fireInterval,
  unlockedWeapons, formatCount, WEAPON_ORDER, ARMY_CAP,
} from '../src/rules.js';

test('gates add, multiply, subtract and divide', () => {
  assert.equal(applyGate(10, { op: 'add', value: 5 }), 15);
  assert.equal(applyGate(10, { op: 'mul', value: 3 }), 30);
  assert.equal(applyGate(10, { op: 'sub', value: 15 }), 0);
  assert.equal(applyGate(7, { op: 'div', value: 2 }), 3);
});

test('army is capped and stays a finite integer', () => {
  assert.equal(applyGate(60000, { op: 'mul', value: 5 }), ARMY_CAP);
  let a = 5;
  for (let i = 0; i < 100; i++) a = applyGate(a, { op: 'mul', value: 3 });
  assert.equal(a, ARMY_CAP);
  assert.ok(Number.isInteger(a));
});

test('good gates are add and multiply', () => {
  assert.equal(gateIsGood({ op: 'add', value: 1 }), true);
  assert.equal(gateIsGood({ op: 'mul', value: 2 }), true);
  assert.equal(gateIsGood({ op: 'sub', value: 1 }), false);
  assert.equal(gateIsGood({ op: 'div', value: 2 }), false);
});

test('gate labels', () => {
  assert.equal(gateLabel({ op: 'mul', value: 2 }), '×2');
  assert.equal(gateLabel({ op: 'add', value: 10 }), '+10');
  assert.equal(gateLabel({ op: 'sub', value: 5 }), '−5');
  assert.equal(gateLabel({ op: 'div', value: 2 }), '÷2');
});

test('upgrade costs rise geometrically', () => {
  assert.equal(upgradeCost('army', 0), 20);
  assert.equal(upgradeCost('army', 1), 27);
  assert.equal(upgradeCost('weapon', 2), 91);
});

test('starting army grows with the army upgrade', () => {
  assert.equal(startArmy({ upgrades: { army: 3 } }), 11);
  assert.equal(startArmy({}), 5);
});

test('weapons unlock by level', () => {
  assert.deepEqual(unlockedWeapons(1), ['rifle']);
  assert.deepEqual(unlockedWeapons(7), ['rifle', 'mg', 'shotgun', 'rocket']);
  assert.equal(unlockedWeapons(10).length, 5);
});

test('every weapon is at least as strong as the rifle', () => {
  const dps = (id) => volleyDamage(50, id, {}) / fireInterval(id, {});
  for (const id of WEAPON_ORDER) assert.ok(dps(id) >= dps('rifle'), id);
});

test('damage and fire rate upgrades help', () => {
  assert.ok(volleyDamage(10, 'rifle', { upgrades: { damage: 2 } }) > volleyDamage(10, 'rifle', {}));
  assert.ok(volleyDamage(10, 'mg', { weaponLevels: { mg: 1 } }) > volleyDamage(10, 'mg', {}));
  assert.ok(fireInterval('rifle', { upgrades: { fireRate: 2 } }) < fireInterval('rifle', {}));
});

test('counts are formatted compactly', () => {
  assert.equal(formatCount(950), '950');
  assert.equal(formatCount(12345), '12.3K');
  assert.equal(formatCount(99999), '100K');
});
