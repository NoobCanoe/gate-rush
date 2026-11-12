import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLevel } from '../src/levelgen.js';
import { ROAD_HALF, RUN_SPEED, unlockedWeapons, gateIsGood } from '../src/rules.js';

test('levels are deterministic and differ by number', () => {
  assert.deepEqual(generateLevel(7), generateLevel(7));
  assert.notDeepEqual(generateLevel(7), generateLevel(8));
});

test('a run lasts about a minute', () => {
  const secs = (n) => generateLevel(n).length / RUN_SPEED;
  assert.ok(secs(1) >= 45 && secs(1) <= 60, `level 1 runs ${secs(1)}s`);
  assert.ok(secs(40) >= 60 && secs(40) <= 80, `level 40 runs ${secs(40)}s`);
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
        assert.ok(it.left.op !== it.right.op || it.left.value !== it.right.value, `gates differ L${n}`);
        for (const g of [it.left, it.right]) assert.ok(Number.isInteger(g.value) && g.value > 0);
      } else {
        assert.ok(Math.abs(it.x) <= ROAD_HALF, `x range L${n}`);
        assert.ok(it.hp > 0);
      }
      if (it.type === 'crate') {
        crates++;
        if (it.weapon !== null) {
          assert.ok(unlockedWeapons(n).includes(it.weapon), `unlocked L${n}`);
          assert.notEqual(it.weapon, 'rifle');
        }
      }
    }
    assert.equal(lv.items[0].type, 'gates');
    assert.ok(gates >= 6, `gate rows L${n}`);
    assert.ok(crates >= 2 && crates <= 5, `crate count L${n}: ${crates}`);
  }
});

test('level 1 offers power upgrades, later levels new weapons too', () => {
  const crates = (n) => generateLevel(n).items.filter((i) => i.type === 'crate');
  assert.ok(crates(1).every((c) => c.weapon === null));
  assert.ok(crates(2).some((c) => c.weapon === 'mg'));
  assert.ok(crates(12).some((c) => c.weapon === null), 'power crates still appear later');
});

test('every fifth level has a big boss and themes rotate', () => {
  assert.equal(generateLevel(5).boss.big, true);
  assert.equal(generateLevel(4).boss.big, false);
  assert.equal(generateLevel(1).theme, 0);
  assert.equal(generateLevel(6).theme, 1);
  assert.equal(generateLevel(21).theme, 0);
});

test('the boss is sized to the level', () => {
  for (const n of [1, 7, 30, 9999]) {
    const b = generateLevel(n).boss;
    assert.ok(Number.isFinite(b.hp) && b.hp > 0 && b.dps >= 1, `L${n}`);
  }
  assert.ok(generateLevel(30).boss.hp > generateLevel(1).boss.hp * 5);
});

test('the enemy stream is fixed by the level and thickens along it', () => {
  for (let n = 1; n <= 40; n++) {
    const f = generateLevel(n).flow;
    assert.ok(f.every > 0 && f.every <= 2, `interval L${n}`);
    assert.ok(f.hp > 0);
    assert.ok(f.steps.length >= 6 && f.steps[0].z === 0, `steps L${n}`);
    for (const st of f.steps) assert.ok(st.count > 0 && Number.isFinite(st.count));
    assert.ok(f.steps[f.steps.length - 1].count > f.steps[0].count * 3, `thickens L${n}`);
  }
});

test('gate pairs pose a real question', () => {
  let cross = 0;
  let traps = 0;
  let total = 0;
  for (let n = 1; n <= 30; n++) {
    for (const it of generateLevel(n).items) {
      if (it.type !== 'gates') continue;
      total++;
      const ops = [it.left.op, it.right.op];
      if (ops.includes('mul') && ops.includes('add')) cross++;
      if (ops.includes('sub') || ops.includes('div')) traps++;
    }
  }
  assert.ok(cross / total > 0.2, `add-versus-multiply pairs: ${cross}/${total}`);
  assert.ok(traps / total > 0.2 && traps / total < 0.5, `trap pairs: ${traps}/${total}`);
});
