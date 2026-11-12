import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLevel } from '../src/levelgen.js';
import { ROAD_HALF, unlockedWeapons, gateIsGood } from '../src/rules.js';

test('levels are deterministic and differ by number', () => {
  assert.deepEqual(generateLevel(7), generateLevel(7));
  assert.notDeepEqual(generateLevel(7), generateLevel(8));
});

test('level length gives a 60 to 90 second run', () => {
  assert.equal(generateLevel(1).length, 492);
  assert.equal(generateLevel(40).length, 720);
});

test('every level obeys the layout rules', () => {
  for (let n = 1; n <= 40; n++) {
    const lv = generateLevel(n);
    let prev = 0;
    let gates = 0;
    let crates = 0;
    for (const it of lv.items) {
      assert.ok(it.z >= prev, `sorted L${n}`);
      prev = it.z;
      assert.ok(it.z >= 40 && it.z <= lv.length - 30, `z range L${n}`);
      if (it.type === 'gates') {
        gates++;
        assert.ok(gateIsGood(it.left) || gateIsGood(it.right), `good side L${n}`);
        for (const g of [it.left, it.right]) assert.ok(Number.isInteger(g.value) && g.value > 0);
      } else {
        assert.ok(Math.abs(it.x) <= ROAD_HALF, `x range L${n}`);
        assert.ok(it.hp > 0);
      }
      if (it.type === 'crate') {
        crates++;
        assert.ok(unlockedWeapons(n).includes(it.weapon), `unlocked L${n}`);
        assert.notEqual(it.weapon, 'rifle');
      }
    }
    assert.equal(lv.items[0].type, 'gates');
    assert.ok(gates >= 6, `gate rows L${n}`);
    assert.ok(crates <= (n < 4 ? 1 : 2), `crate count L${n}`);
    if (n >= 2) assert.ok(crates >= 1, `has a crate L${n}`);
  }
});

test('level 1 has no weapon crate', () => {
  assert.ok(!generateLevel(1).items.some((i) => i.type === 'crate'));
});

test('every fifth level has a big boss and themes rotate', () => {
  assert.equal(generateLevel(5).boss.big, true);
  assert.equal(generateLevel(4).boss.big, false);
  assert.equal(generateLevel(1).theme, 0);
  assert.equal(generateLevel(6).theme, 1);
  assert.equal(generateLevel(21).theme, 0);
});

test('boss health grows with level', () => {
  const hp = (n) => generateLevel(n).boss.hp;
  assert.ok(hp(6) < hp(7) && hp(7) < hp(8));
  assert.ok(generateLevel(3).boss.dps >= 1);
});
