import test from 'node:test';
import assert from 'node:assert/strict';
import { newSave, loadSave, writeSave, buyUpgrade, SAVE_KEY } from '../src/save.js';

const storageWith = (value) => {
  const data = { [SAVE_KEY]: value };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; }, data };
};

test('a save survives a round trip', () => {
  const s = newSave();
  s.level = 7; s.coins = 123; s.upgrades.damage = 4; s.weaponLevels.mg = 2; s.muted = true;
  const storage = storageWith(null);
  assert.equal(writeSave(storage, s), true);
  assert.deepEqual(loadSave(storage), s);
});

test('missing or damaged data starts a new game', () => {
  for (const bad of [null, 'not json', '{"version":99}', '[]', '42', 'null']) {
    assert.deepEqual(loadSave(storageWith(bad)), newSave(), String(bad));
  }
  const throwing = { getItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadSave(throwing), newSave());
  assert.deepEqual(loadSave(undefined), newSave());
});

test('bad fields fall back one by one', () => {
  const s = loadSave(storageWith(JSON.stringify({
    version: 1, coins: 'abc', level: -3, upgrades: { army: 2.7, damage: null, hacked: 9 },
    weaponLevels: { mg: 3, banana: 2, laser: -1 }, muted: 'yes',
  })));
  assert.equal(s.coins, 0);
  assert.equal(s.level, 1);
  assert.deepEqual(s.upgrades, { army: 2, fireRate: 0, damage: 0, coins: 0 });
  assert.deepEqual(s.weaponLevels, { mg: 3 });
  assert.equal(s.muted, false);
});

test('a failed write reports false instead of throwing', () => {
  const storage = { getItem: () => null, setItem() { throw new Error('full'); } };
  assert.equal(writeSave(storage, newSave()), false);
  assert.equal(writeSave(undefined, newSave()), false);
});

test('upgrades are bought only when affordable', () => {
  const s = newSave();
  s.coins = 20;
  assert.equal(buyUpgrade(s, 'army'), true);
  assert.equal(s.coins, 0);
  assert.equal(s.upgrades.army, 1);
  assert.equal(buyUpgrade(s, 'army'), false);
  assert.equal(s.upgrades.army, 1);
});

test('weapon upgrades need an unlocked weapon', () => {
  const s = newSave();
  s.coins = 1000;
  assert.equal(buyUpgrade(s, 'weapon', 'mg'), false); // level 1: not unlocked yet
  s.level = 2;
  assert.equal(buyUpgrade(s, 'weapon', 'mg'), true);
  assert.equal(s.weaponLevels.mg, 1);
  assert.equal(s.coins, 950);
  assert.equal(buyUpgrade(s, 'weapon', 'banana'), false);
  assert.equal(buyUpgrade(s, 'nonsense'), false);
});
