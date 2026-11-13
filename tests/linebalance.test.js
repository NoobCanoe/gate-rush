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
    assert.ok(r.kills >= 500, `level ${r.n} only ${r.kills} kills`);
  }
});

test('a casual player who reacts late still wins levels 1-15', () => {
  for (const r of campaign(15, 'casual')) {
    assert.ok(r.won, `level ${r.n} lost (army at boss ${r.armyAtBoss}, tier ${r.tier})`);
  }
  assert.ok(campaign(15, 'casual').some((r) => r.tier >= 2), 'a late reaction still opens some containers');
});

test('the first levels can be won on soldiers alone, later ones cannot', () => {
  const log = campaign(20, 'men');
  assert.ok(log[0].won && log[1].won, 'levels 1 and 2 are a gentle start');
  const lateLosses = log.filter((r) => r.n >= 8 && !r.won).length;
  assert.ok(lateLosses >= 9, `only ${lateLosses} losses in levels 8-20`);
});

test('only chasing firepower is not enough', () => {
  const log = campaign(20, 'fire');
  assert.ok(log.filter((r) => !r.won).length >= 16);
});
