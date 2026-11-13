// Test helper: simple automated players.
import { createRun, stepRun, runResult, MAX_STEP } from '../src/sim.js';
import { applyGate, upgradeCost, unlockedWeapons, ROAD_HALF } from '../src/rules.js';

function steerFor(run, pick, dodge, state) {
  let tx = run.x;
  const ahead = run.items.filter((it) => it.alive && !it.passed && it.z > run.z);
  const gate = ahead.find((it) => it.type === 'gates' && it.z - run.z < 20);
  const barrel = ahead.find((it) => it.type === 'barrel' && it.z - run.z < 7 && Math.abs(it.x - run.x) < 1.7);
  const crate = ahead.find((it) => it.type === 'crate' && it.z - run.z < 40);
  if (gate) {
    if (state.gate !== gate) { state.gate = gate; state.count++; }
    const leftBetter = applyGate(run.army, gate.left) > applyGate(run.army, gate.right);
    const wantBest = pick === 'best' || (pick === 'alternate' && state.count % 2 === 0);
    tx = (wantBest ? leftBetter : !leftBetter) ? -2.5 : 2.5;
  } else if (barrel && dodge) {
    tx = barrel.x + (barrel.x >= 0 ? -2.6 : 2.6);
  } else if (crate && dodge) {
    // line up to shoot it, then step aside at the last moment if it is still standing
    tx = crate.z - run.z < 4 ? crate.x + (crate.x >= 0 ? -2.6 : 2.6) : crate.x;
  }
  return tx / (ROAD_HALF - 0.5);
}

export function playLevel(n, save, { pick = 'best', dodge = true } = {}) {
  const run = createRun(n, save);
  const state = { gate: null, count: 0 };
  let armyAtBoss = null;
  while (run.phase !== 'won' && run.phase !== 'lost' && run.t < 400) {
    stepRun(run, MAX_STEP, steerFor(run, pick, dodge, state), save);
    run.events.length = 0;
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

// ---- Hold the Line bots ----
// 'men': never leaves the card lane. 'fire': never leaves the container lane.
// 'smart': collects cards, steps across for each container, steps back.
export function playLine(n, save, strategy = 'smart') {
  const run = createRun(n, save, 'line');
  let armyAtBoss = null;
  while (run.phase !== 'won' && run.phase !== 'lost' && run.t < 400) {
    let lane = 1;
    if (strategy === 'fire') lane = -1;
    else if (strategy === 'smart') {
      const crate = run.items.find((it) => it.type === 'crate' && it.alive && !it.passed && it.z > run.z && it.z - run.z < 26);
      if (crate) lane = -1;
    }
    stepRun(run, MAX_STEP, lane * 0.55, save);
    run.events.length = 0;
    if (armyAtBoss === null && run.phase === 'boss') armyAtBoss = run.army;
  }
  return { run, result: run.phase === 'won' || run.phase === 'lost' ? runResult(run, save) : null, armyAtBoss };
}
