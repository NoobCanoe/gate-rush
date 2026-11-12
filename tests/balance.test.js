import test from 'node:test';
import assert from 'node:assert/strict';
import { playLevel, spendCoins, freshSave } from './bot.js';
import { RUN_SPEED } from '../src/rules.js';

test('a sensible player wins levels 1-100 first time', () => {
  const save = freshSave();
  for (let n = 1; n <= 100; n++) {
    save.level = n;
    const { run, result, armyAtBoss } = playLevel(n, save);
    assert.ok(result && result.won, `level ${n} should be won (army at boss ${armyAtBoss})`);
    assert.ok(run.t < 150, `level ${n} took ${run.t}s`);
    assert.ok(armyAtBoss >= 10, `level ${n} army at boss ${armyAtBoss}`);
    save.coins += result.coins;
    spendCoins(save);
  }
});

test('boss fights stay short through level 100', () => {
  const save = freshSave();
  for (let n = 1; n <= 100; n++) {
    save.level = n;
    const { run, result } = playLevel(n, save);
    const bossTime = run.t - run.level.length / RUN_SPEED;
    assert.ok(bossTime >= 0.8 && bossTime <= 25, `level ${n} boss fight ${bossTime.toFixed(1)}s`);
    save.coins += result.coins;
    spendCoins(save);
  }
});

test('a careless player who never upgrades can lose', () => {
  const save = freshSave();
  let losses = 0;
  for (let n = 1; n <= 20; n++) {
    const { result } = playLevel(n, save, { best: false, dodge: false });
    if (!result || !result.won) losses++;
  }
  assert.ok(losses >= 1, 'expected at least one loss');
});

test('a sensible player mows down a crowd every level', () => {
  const save = freshSave();
  for (let n = 1; n <= 30; n++) {
    save.level = n;
    const { run, result } = playLevel(n, save);
    assert.ok(run.kills >= 250, `level ${n} only ${run.kills} kills`);
    save.coins += result.coins;
    spendCoins(save);
  }
});

test('the enemy stream never overwhelms a player with no upgrades', async () => {
  const { createRun, stepRun, MAX_STEP } = await import('../src/sim.js');
  const { applyGate } = await import('../src/rules.js');
  for (let n = 1; n <= 20; n++) {
    const run = createRun(n, {});
    run.items = run.items.filter((it) => it.type === 'gates'); // only the stream and the gates
    let lost = 0;
    while (run.phase === 'run') {
      const gate = run.items.find((it) => it.alive && !it.passed && it.z > run.z && it.z - run.z < 20);
      const steer = gate ? (applyGate(run.army, gate.left) > applyGate(run.army, gate.right) ? -0.5 : 0.5) : 0;
      stepRun(run, MAX_STEP, steer, {});
      for (const e of run.events) if (e.type === 'soldierLost') lost += e.lost;
      run.events.length = 0;
    }
    assert.equal(run.phase, 'boss', `level ${n} overrun`);
    assert.ok(lost <= 15, `level ${n} lost ${lost} soldiers to the stream`);
    assert.ok(run.spawned >= 400, `level ${n} only ${run.spawned} enemies`);
  }
});
