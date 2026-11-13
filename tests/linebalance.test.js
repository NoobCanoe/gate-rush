import test from 'node:test';
import assert from 'node:assert/strict';
import { playLine, spendCoins, freshSave } from './bot.js';

function campaign(to, strategy) {
  const save = freshSave();
  const log = [];
  for (let n = 1; n <= to; n++) {
    save.level = n;
    const { run, result, armyAtBoss } = playLine(n, save, strategy);
    log.push({ n, won: !!(result && result.won), armyAtBoss, tier: run.tier, time: run.t, kills: run.kills });
    if (result) save.coins += result.coins;
    spendCoins(save);
  }
  return log;
}

test('balancing soldiers and firepower wins lane levels 1-30', () => {
  for (const r of campaign(30, 'smart')) {
    assert.ok(r.won, `level ${r.n} lost (army at boss ${r.armyAtBoss}, tier ${r.tier})`);
    assert.ok(r.time < 150, `level ${r.n} took ${r.time}s`);
    assert.ok(r.kills >= 800, `level ${r.n} only ${r.kills} kills`);
  }
});

test('only collecting soldiers is not enough', () => {
  const log = campaign(20, 'men');
  assert.ok(log.filter((r) => !r.won).length >= 16);
  assert.ok(log.every((r) => r.tier === 1));
});

test('only chasing firepower is not enough', () => {
  const log = campaign(20, 'fire');
  assert.ok(log.every((r) => !r.won));
});
