// Test helper: simple automated players.
import { createRun, stepRun, runResult, MAX_STEP } from '../src/sim.js';
import { applyGate, upgradeCost, unlockedWeapons, ROAD_HALF } from '../src/rules.js';

function steerFor(run, wantBest, dodge) {
  let tx = run.x;
  const ahead = run.items.filter((it) => it.alive && !it.passed && it.z > run.z);
  const gate = ahead.find((it) => it.type === 'gates' && it.z - run.z < 20);
  const block = ahead.find(
    (it) => (it.type === 'barrel' || it.type === 'crate') && it.z - run.z < 7 && Math.abs(it.x - run.x) < 1.7,
  );
  const crate = ahead.find((it) => it.type === 'crate' && it.z - run.z < 40);
  if (gate) {
    const l = applyGate(run.army, gate.left);
    const r = applyGate(run.army, gate.right);
    const leftBetter = l > r;
    tx = (wantBest ? leftBetter : !leftBetter) ? -2.5 : 2.5;
  } else if (block && dodge) {
    tx = block.x + (block.x >= 0 ? -2.6 : 2.6);
  } else if (crate && dodge) {
    tx = crate.x;
  }
  return tx / ROAD_HALF;
}

export function playLevel(n, save, { best = true, dodge = true } = {}) {
  const run = createRun(n, save);
  let armyAtBoss = null;
  while (run.phase !== 'won' && run.phase !== 'lost' && run.t < 400) {
    stepRun(run, MAX_STEP, steerFor(run, best, dodge), save);
    if (armyAtBoss === null && run.phase === 'boss') armyAtBoss = run.army;
  }
  return { run, result: run.phase === 'won' || run.phase === 'lost' ? runResult(run, save) : null, armyAtBoss };
}

export function spendCoins(save) {
  for (;;) {
    const options = ['army', 'fireRate', 'damage', 'coins'].map((kind) => ({
      kind, cost: upgradeCost(kind, save.upgrades[kind] || 0),
    }));
    for (const id of unlockedWeapons(save.level)) {
      options.push({ kind: 'weapon', id, cost: upgradeCost('weapon', save.weaponLevels[id] || 0) });
    }
    options.sort((a, b) => a.cost - b.cost);
    const o = options[0];
    if (o.cost > save.coins) return;
    save.coins -= o.cost;
    if (o.kind === 'weapon') save.weaponLevels[o.id] = (save.weaponLevels[o.id] || 0) + 1;
    else save.upgrades[o.kind] = (save.upgrades[o.kind] || 0) + 1;
  }
}

export const freshSave = () => ({ level: 1, coins: 0, upgrades: {}, weaponLevels: {} });
