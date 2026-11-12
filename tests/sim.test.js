import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, stepRun, prepItem, MAX_STEP } from '../src/sim.js';
import { ROAD_HALF, RUN_SPEED, startArmy, volleyDamage } from '../src/rules.js';

// A run on an empty, very long road, to place hand-made items on.
function bare(save = {}, items = []) {
  const run = createRun(1, save);
  run.level = { ...run.level, length: 1000 };
  run.items = items.map(prepItem);
  return run;
}
function advance(run, seconds, steer = 0, save = {}) {
  for (let t = 0; t < seconds; t += MAX_STEP) stepRun(run, MAX_STEP, steer, save);
}
const types = (run) => run.events.map((e) => e.type);

test('a run starts with the starting army and the rifle', () => {
  const save = { upgrades: { army: 2 } };
  const run = createRun(1, save);
  assert.equal(run.army, startArmy(save));
  assert.equal(run.weapon, 'rifle');
  assert.equal(run.phase, 'run');
  assert.ok(run.items.length > 0);
});

test('steering moves the army to the road edge and stops there', () => {
  const run = bare();
  advance(run, 2, 1);
  assert.equal(run.x, ROAD_HALF - 0.5);
  advance(run, 3, -1);
  assert.equal(run.x, -(ROAD_HALF - 0.5));
});

test('the army takes the gate on its side of the road', () => {
  const gates = { type: 'gates', z: 12, left: { op: 'add', value: 10 }, right: { op: 'mul', value: 2 } };
  const left = bare({}, [gates]);
  advance(left, 2, -1);
  assert.equal(left.army, 15);
  assert.equal(types(left).filter((t) => t === 'gate').length, 1);

  const right = bare({}, [gates]);
  advance(right, 2, 1);
  assert.equal(right.army, 10);
});

test('a long frame cannot skip a gate', () => {
  const run = bare({}, [{ type: 'gates', z: 1, left: { op: 'add', value: 10 }, right: { op: 'add', value: 10 } }]);
  stepRun(run, 5, 0, {});
  assert.equal(run.army, 15);
  assert.ok(run.z <= RUN_SPEED * 0.25 + 1e-9);
});

test('a weak barrel is shot down before contact and pays coins', () => {
  const run = bare({}, [{ type: 'barrel', z: 20, x: 0, hp: 20, coins: 7 }]);
  advance(run, 3);
  assert.equal(run.items[0].alive, false);
  assert.equal(run.coins, 7);
  assert.equal(run.army, 5);
  assert.ok(types(run).includes('barrelDown'));
});

test('crashing into a huge barrel loses the run, and a lost run is frozen', () => {
  const run = bare({}, [{ type: 'barrel', z: 6, x: 0, hp: 100000, coins: 1 }]);
  advance(run, 2);
  assert.equal(run.phase, 'lost');
  assert.equal(run.army, 0);
  const z = run.z;
  stepRun(run, 0.1, 0, {});
  assert.equal(run.z, z);
  assert.equal(types(run).filter((t) => t === 'lost').length, 1);
});

test('a barrel in another lane is passed safely', () => {
  const run = bare({}, [{ type: 'barrel', z: 6, x: 3.5, hp: 100000, coins: 1 }]);
  advance(run, 2, -1);
  assert.equal(run.phase, 'run');
  assert.equal(run.army, 5);
});

test('shooting down a weapon crate equips its weapon', () => {
  const run = bare({}, [{ type: 'crate', z: 15, x: 0, weapon: 'mg', hp: 1 }]);
  advance(run, 1);
  assert.equal(run.weapon, 'mg');
  assert.ok(types(run).includes('weapon'));
});

test('a squad spawns enemies that cost a soldier each if they arrive', () => {
  const run = bare({}, [{ type: 'squad', z: 30, x: 0, count: 4, hp: 1e9 }]);
  advance(run, 0.1);
  assert.equal(run.enemies.length, 4);
  advance(run, 5);
  assert.equal(run.army, 1);
  assert.equal(run.enemies.filter((e) => e.alive).length, 0);
});

test('killing enemies counts kills and coins', () => {
  const run = bare({}, [{ type: 'squad', z: 30, x: 0, count: 3, hp: 1 }]);
  advance(run, 4);
  assert.equal(run.kills, 3);
  assert.equal(run.coins, 3);
  assert.equal(run.army, 5);
});

test('a rocket kills everything near its impact', () => {
  const run = bare();
  run.weapon = 'rocket';
  run.enemies = [-1, 0, 1].map((x) => ({ x, z: 12, hp: 1, alive: true }));
  advance(run, 0.5);
  assert.equal(run.kills, 3);
});

test('the laser hits every target in line at once', () => {
  const run = bare();
  run.weapon = 'laser';
  run.enemies = [10, 20, 30].map((z) => ({ x: 0, z, hp: 1, alive: true }));
  stepRun(run, MAX_STEP, 0, {});
  assert.equal(run.kills, 3);
});

test('the shotgun fires a fan of pellets', () => {
  const run = bare();
  run.weapon = 'shotgun';
  run.enemies = [{ x: 0, z: 10, hp: 1e9, alive: true }];
  stepRun(run, MAX_STEP, 0, {});
  assert.equal(run.bullets.length, 5);
});

test('reaching the end of the road starts the boss phase', () => {
  const run = bare();
  run.level = { ...run.level, length: 10 };
  advance(run, 2);
  assert.equal(run.phase, 'boss');
  assert.equal(run.z, 10);
  assert.ok(types(run).includes('bossStart'));
});

// ---- boss and results ----
import { runResult } from '../src/sim.js';

function atBoss(levelNumber, army, save = {}) {
  const run = createRun(levelNumber, save);
  run.items = [];
  run.z = run.level.length - 0.01;
  run.army = army;
  stepRun(run, MAX_STEP, 0, save);
  assert.equal(run.phase, 'boss');
  return run;
}

test('the boss appears with full health when the road ends', () => {
  const run = atBoss(1, 50);
  assert.equal(run.boss.hp, run.level.boss.hp);
  assert.equal(run.boss.maxHp, run.level.boss.hp);
  assert.ok(run.boss.z > run.z);
});

test('a big army kills the boss and is paid for it', () => {
  const run = atBoss(1, 200);
  advance(run, 120);
  assert.equal(run.phase, 'won');
  assert.ok(types(run).includes('won'));
  const res = runResult(run, {});
  assert.equal(res.won, true);
  assert.equal(res.armyLeft, run.army);
  assert.equal(res.coins, Math.round(run.coins + 20 + 10 + Math.floor(3 * Math.sqrt(run.army))));
});

test('the boss wears down a tiny army and the coins are kept', () => {
  const run = atBoss(1, 1);
  run.boss.hp = 1e9;
  run.coins = 12;
  advance(run, 120);
  assert.equal(run.phase, 'lost');
  const save = { upgrades: { coins: 5 } };
  assert.equal(runResult(run, save).won, false);
  assert.equal(runResult(run, save).coins, 18);
});

test('winning the level before a weapon unlocks announces it', () => {
  const win = (n) => {
    const run = atBoss(n, 5000);
    advance(run, 200);
    assert.equal(run.phase, 'won');
    return runResult(run, {}).newWeapon;
  };
  assert.equal(win(1), 'mg');
  assert.equal(win(2), null);
  assert.equal(win(3), 'shotgun');
});

test('a bigger army fires more bullets per volley for the same total damage', () => {
  const volley = (army) => {
    const run = bare();
    run.army = army;
    run.enemies = [{ x: 0, z: 30, hp: 1e9, alive: true }];
    stepRun(run, MAX_STEP, 0, {});
    return run.bullets;
  };
  assert.equal(volley(5).length, 1);
  const many = volley(200);
  assert.equal(many.length, 6);
  const total = many.reduce((sum, b) => sum + b.damage, 0);
  assert.ok(Math.abs(total - volleyDamage(200, 'rifle', {})) < 1e-6);
  assert.ok(new Set(many.map((b) => b.x.toFixed(2))).size > 1, 'bullets start across the crowd');
});
