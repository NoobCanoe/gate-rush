import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLineLevel, MEN_SIDE, FIRE_SIDE } from '../src/linegen.js';
import { ROAD_HALF, unlockedWeapons } from '../src/rules.js';

test('lane levels are deterministic and differ by number', () => {
  assert.deepEqual(generateLineLevel(4, 4), generateLineLevel(4, 4));
  assert.notDeepEqual(generateLineLevel(4, 4), generateLineLevel(5, 4));
});

test('one lane is a constant stream of cards, mostly +1', () => {
  for (let n = 1; n <= 30; n++) {
    const lv = generateLineLevel(n, n);
    const cards = lv.items.filter((i) => i.type === 'card');
    assert.ok(cards.length >= 150, `L${n} has ${cards.length} cards`);
    assert.ok(cards.every((c) => c.side === MEN_SIDE), 'all cards in the men lane');
    for (let i = 1; i < cards.length; i++) {
      assert.ok(cards[i].z - cards[i - 1].z <= 4, `gap in the stream L${n}`);
    }
    const plusOne = cards.filter((c) => c.gate.op === 'add' && c.gate.value === 1).length;
    assert.ok(plusOne / cards.length > 0.7, `mostly +1 L${n}`);
    assert.ok(cards.every((c) => c.gate.op === 'add' && c.gate.value >= 1), `no card ever costs soldiers L${n}`);
  }
});

test('the other lane holds containers to shoot open', () => {
  for (let n = 1; n <= 30; n++) {
    const lv = generateLineLevel(n, n);
    const crates = lv.items.filter((i) => i.type === 'crate');
    assert.ok(crates.length >= 6, `L${n} has ${crates.length} containers`);
    for (const c of crates) {
      assert.equal(c.side, FIRE_SIDE);
      assert.ok(Math.sign(c.x) === FIRE_SIDE && Math.abs(c.x) < ROAD_HALF);
      assert.ok(c.hp > 0);
      if (c.weapon !== null) assert.ok(unlockedWeapons(n).includes(c.weapon) && c.weapon !== 'rifle');
    }
  }
  assert.ok(generateLineLevel(1, 1).items.filter((i) => i.type === 'crate').every((c) => c.weapon === null));
  assert.ok(generateLineLevel(8, 8).items.some((i) => i.type === 'crate' && i.weapon !== null));
  assert.ok(generateLineLevel(8, 1).items.filter((i) => i.type === 'crate').every((c) => c.weapon === null), 'only weapons already unlocked');
});

test('a lane level has a horde, a boss and nothing from the other mode', () => {
  for (const n of [1, 12, 9999]) {
    const lv = generateLineLevel(n, n);
    assert.equal(lv.mode, 'line');
    assert.ok(!lv.items.some((i) => i.type === 'gates'));
    assert.ok(lv.flow.steps.length >= 6);
    for (const st of lv.flow.steps) assert.ok(st.count > 0 && st.hp > 0 && Number.isFinite(st.hp));
    assert.ok(Number.isFinite(lv.boss.hp) && lv.boss.hp > 0 && lv.boss.dps >= 1);
    let prev = 0;
    for (const it of lv.items) { assert.ok(it.z >= prev); prev = it.z; }
  }
});
