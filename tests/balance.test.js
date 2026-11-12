import test from 'node:test';
import assert from 'node:assert/strict';
import { playLevel, spendCoins, freshSave } from './bot.js';

test('a sensible player wins levels 1-30 first time', () => {
  const save = freshSave();
  for (let n = 1; n <= 30; n++) {
    save.level = n;
    const { run, result, armyAtBoss } = playLevel(n, save);
    assert.ok(result && result.won, `level ${n} should be won (army at boss ${armyAtBoss})`);
    assert.ok(run.t < 150, `level ${n} took ${run.t}s`);
    assert.ok(armyAtBoss >= 10, `level ${n} army at boss ${armyAtBoss}`);
    save.coins += result.coins;
    spendCoins(save);
  }
});

test('a boss fight lasts long enough to enjoy but not drag', () => {
  const save = freshSave();
  for (let n = 1; n <= 30; n++) {
    save.level = n;
    const { run, result } = playLevel(n, save);
    const bossTime = run.t - run.level.length / 8;
    assert.ok(bossTime >= 1.5 && bossTime <= 25, `level ${n} boss fight ${bossTime.toFixed(1)}s`);
    save.coins += result.coins;
    spendCoins(save);
  }
});

test('a careless player who never upgrades can lose', () => {
  const save = freshSave();
  let losses = 0;
  for (let n = 1; n <= 10; n++) {
    const { result } = playLevel(n, save, { best: false, dodge: false });
    if (!result || !result.won) losses++;
  }
  assert.ok(losses >= 1, 'expected at least one loss');
});
