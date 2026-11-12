import test from 'node:test';
import assert from 'node:assert/strict';
import { playLevel, spendCoins, freshSave } from './bot.js';
import { RUN_SPEED } from '../src/rules.js';

// Plays levels from..to in order, buying upgrades between them.
function campaign(to, options, { upgrade = true } = {}) {
  const save = freshSave();
  const log = [];
  for (let n = 1; n <= to; n++) {
    save.level = n;
    const { run, result, armyAtBoss } = playLevel(n, save, options);
    const won = !!(result && result.won);
    log.push({
      n, won, armyAtBoss, kills: run.kills, spawned: run.spawned, armyLeft: run.army, tier: run.tier,
      bossTime: run.t - run.level.length / RUN_SPEED, time: run.t,
    });
    if (result) save.coins += result.coins;
    if (upgrade) spendCoins(save);
  }
  return log;
}

test('a player who picks well and upgrades wins levels 1-60 first time', () => {
  for (const r of campaign(60, { pick: 'best' })) {
    assert.ok(r.won, `level ${r.n} lost (army at boss ${r.armyAtBoss})`);
    assert.ok(r.time < 150, `level ${r.n} took ${r.time}s`);
    assert.ok(r.bossTime <= 25, `level ${r.n} boss fight ${r.bossTime.toFixed(1)}s`);
    assert.ok(r.kills >= 1000, `level ${r.n} only ${r.kills} kills`);
  }
});

test('picking well is enough on the first levels even with no upgrades', () => {
  for (const r of campaign(3, { pick: 'best' }, { upgrade: false })) {
    assert.ok(r.won, `level ${r.n} lost without upgrades`);
  }
});

test('a player who keeps picking the worse gate mostly loses', () => {
  const log = campaign(20, { pick: 'worst' });
  const losses = log.filter((r) => !r.won).length;
  assert.ok(losses >= 16, `only ${losses} losses in 20 levels`);
});

test('mixed picks are punished but survivable', () => {
  const mixed = campaign(20, { pick: 'alternate' });
  const good = campaign(20, { pick: 'best' });
  const wins = mixed.filter((r) => r.won).length;
  assert.ok(wins >= 12 && wins <= 19, `mixed picks won ${wins} of 20`);
  const sum = (log) => log.reduce((t, r) => t + (r.armyAtBoss || 0), 0);
  assert.ok(sum(mixed) < sum(good) * 0.6, 'mixed picks reach the boss with a much smaller army');
});

test('ignoring the containers leaves the player weaker', () => {
  const withCrates = campaign(10, { pick: 'best' });
  assert.ok(withCrates.every((r) => r.tier >= 2), 'a good player opens at least one container per level');
});

test('even a player who picks well cannot stop every enemy', () => {
  const log = campaign(20, { pick: 'best' });
  const kills = log.reduce((t, r) => t + r.kills, 0);
  const spawned = log.reduce((t, r) => t + r.spawned, 0);
  assert.ok(kills / spawned < 0.98 && kills / spawned > 0.8, `stopped ${(100 * kills / spawned).toFixed(1)}% of the stream`);
});
