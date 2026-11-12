// Level number -> level description. Deterministic: the same number always
// gives the same level.
//
// Everything in a level is sized against a "reference army": the army a
// player would have at that point after middling gate picks, with no
// upgrades. A player who picks well is ahead of it and wins comfortably; one
// who picks badly falls behind it and gets overrun.
import {
  ROAD_HALF, RUN_SPEED, applyGate, unlockedWeapons, volleyDamage, fireInterval, killRate, startArmy, bulletCount,
} from './rules.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const THEME_COUNT = 4;
const LANES = [-3.2, 0, 3.2];
const REF_START = 5;

// Upgrades a player is expected to own by a given level. The reference army
// has these, so later levels assume some visits to the shop.
export function expectedUpgrades(n) {
  const each = Math.floor(UPGRADE_PACE * Math.max(0, n - 2) ** 0.8);
  return { upgrades: { army: each, fireRate: each, damage: each } };
}
const UPGRADE_PACE = 0.7;
const WAVE_EVERY = 0.75; // seconds between ranks of the stream
const BOSS_SECONDS = 24; // how long the reference army needs to kill the boss
const BOSS_SECONDS_BIG = 36;

// Share of the reference army's kill rate that the stream demands.
const SHARE_BASE = 0.5; // level 1 is gentle
const SHARE_PER_LEVEL = 0.02;
const SHARE_MAX = 0.75;
export function streamShare(n) {
  return Math.min(SHARE_MAX, SHARE_BASE + SHARE_PER_LEVEL * (n - 1));
}

export function generateLevel(n) {
  const rand = mulberry32(n * 7919 + 13);
  const int = (lo, hi) => {
    const a = Math.round(lo);
    const b = Math.max(a, Math.round(hi));
    return a + Math.floor(rand() * (b - a + 1));
  };
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const length = 600 + 15 * Math.min(n, 20);
  const maxZ = length - 30;
  const enemyHp = 10 + 3 * n;
  const share = streamShare(n);

  const rows = [];
  for (let z = 44; z <= maxZ; z += int(34, 40)) rows.push(z);

  // Containers: spread through the level, on rows that are not gates.
  const otherRows = rows.map((_, i) => i).filter((i) => i % 2 === 1);
  const crateCount = Math.min(otherRows.length, n < 2 ? 2 : n < 6 ? 3 : 4);
  const newWeapons = unlockedWeapons(n).filter((w) => w !== 'rifle');
  const crateRows = new Map();
  for (let c = 0; c < crateCount; c++) {
    const row = otherRows[Math.floor(((c + 0.3) * otherRows.length) / crateCount)];
    let weapon = null; // null = a power tier for whatever is being carried
    if (newWeapons.length > 0) {
      if (c === 0) weapon = newWeapons[newWeapons.length - 1]; // show off the newest weapon first
      else if (c % 2 === 0) weapon = pick(newWeapons);
    }
    crateRows.set(row, weapon);
  }

  const refSave = expectedUpgrades(n);
  const refStart = startArmy(refSave);
  let ref = refStart;
  // The reference player opens about half the containers it passes.
  let refTier = 1;
  // Enemies toughen with the reference army, so firepower (army size, tiers,
  // upgrades) always decides how much of the stream gets through.
  const hpNow = () => Math.max(enemyHp, Math.round(volleyDamage(ref, 'rifle', refSave, refTier) / bulletCount(ref) / 1.5));
  const rate = () => killRate(ref, 'rifle', refSave, hpNow(), refTier);
  const volley = () => volleyDamage(ref, 'rifle', refSave, refTier);
  const steps = [{ z: 0, count: rate() * WAVE_EVERY * share, hp: hpNow() }];

  const makeGates = (first) => {
    const roll = rand();
    let a;
    let b;
    if (!first && roll < 0.32) {
      // A trap: one side helps, the other hurts.
      a = rand() < 0.5 ? { op: 'mul', value: 2 } : { op: 'add', value: int(ref * 0.3, ref * 0.7) + 3 };
      b = rand() < 0.35 ? { op: 'div', value: 2 } : { op: 'sub', value: int(ref * 0.15, ref * 0.35) + 1 };
    } else if (roll < 0.7) {
      // Multiply or add: which is better depends on the army you have now.
      const triple = n >= 3 && rand() < 0.12;
      a = { op: 'mul', value: triple ? 3 : 2 };
      b = { op: 'add', value: triple ? int(ref * 1.4, ref * 2.6) + 2 : int(ref * 0.6, ref * 1.5) + 2 };
    } else {
      // Two additions: read the numbers.
      a = { op: 'add', value: int(ref * 0.5, ref * 0.9) + 3 };
      b = { op: 'add', value: int(ref * 0.2, ref * 0.4) + 2 };
    }
    if (a.op === b.op && a.value === b.value) b = { op: b.op, value: b.value + 1 };
    return rand() < 0.5 ? [a, b] : [b, a];
  };

  const squad = (z, x) => ({
    type: 'squad', z, x, hp: hpNow(), count: Math.max(3, Math.min(60, Math.round(rate() * 1.1))),
  });
  const barrel = (z, x) => ({
    type: 'barrel', z, x, hp: Math.max(20, Math.round(volley() * (3 + rand() * 3))), coins: 5 + n,
  });

  const items = [];
  rows.forEach((z, i) => {
    if (i % 2 === 0) {
      const [left, right] = makeGates(i === 0);
      items.push({ type: 'gates', z, left, right });
      // The reference army takes the middle road between the two outcomes.
      const l = Math.max(1, applyGate(ref, left));
      const r = Math.max(1, applyGate(ref, right));
      ref = Math.max(refStart, Math.round(Math.sqrt(l * r)));
      steps.push({ z, count: rate() * WAVE_EVERY * share, hp: hpNow() });
      return;
    }
    if (crateRows.has(i)) {
      const x = pick(LANES);
      // Tough enough to need a couple of seconds of aimed fire.
      const hp = Math.max(30, Math.round(volley() * (1.6 + rand() * 0.8)));
      items.push({ type: 'crate', z, x, weapon: crateRows.get(i), hp });
      refTier += 0.5;
      steps.push({ z, count: rate() * WAVE_EVERY * share, hp: hpNow() });
      return;
    }
    const roll = rand();
    if (roll < 0.45) {
      items.push(squad(z, pick(LANES)));
    } else if (roll < 0.75) {
      const x = pick(LANES);
      items.push(barrel(z, x));
      if (rand() < 0.5) items.push(barrel(z, pick(LANES.filter((l) => l !== x))));
    } else {
      const x = pick(LANES);
      items.push(barrel(z, x));
      items.push(squad(z + 3, pick(LANES.filter((l) => l !== x))));
    }
  });

  for (const it of items) {
    if (it.z > maxZ) it.z = maxZ;
    if (it.x !== undefined) it.x = Math.max(-ROAD_HALF, Math.min(ROAD_HALF, it.x));
  }
  items.sort((p, q) => p.z - q.z);

  const big = n % 5 === 0;
  const refDps = volley() / fireInterval('rifle', refSave);
  return {
    number: n,
    length,
    theme: Math.floor((n - 1) / 5) % THEME_COUNT,
    items,
    // A steady stream of enemy ranks for the whole run, fixed by the level.
    flow: { every: WAVE_EVERY, hp: enemyHp, steps },
    boss: {
      hp: Math.round(refDps * (big ? BOSS_SECONDS_BIG : BOSS_SECONDS)),
      // Soldiers lost per second once the boss reaches the army.
      dps: Math.max(1, Math.round(ref * 0.04)),
      big,
    },
    refArmy: ref,
    seconds: length / RUN_SPEED,
  };
}
