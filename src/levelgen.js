// Level number -> level description. Deterministic: the same number always
// gives the same level.
import { ROAD_HALF, unlockedWeapons } from './rules.js';

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

export function bossHp(n) {
  const big = n % 5 === 0;
  return Math.round(7500 * 1.19 ** (n - 1) * (big ? 1.6 : 1));
}

export function generateLevel(n) {
  const rand = mulberry32(n * 7919 + 13);
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const length = 480 + 12 * Math.min(n, 20);
  const maxZ = length - 30;

  // Row positions.
  const rows = [];
  for (let z = 44; z <= maxZ; z += int(34, 40)) rows.push(z);

  // Which non-gate rows carry a weapon crate.
  const otherRows = rows.map((_, i) => i).filter((i) => i % 2 === 1);
  const crateWeapons = unlockedWeapons(n).filter((w) => w !== 'rifle');
  const crateRows = new Map();
  if (crateWeapons.length > 0) {
    // Newest weapon first, early in the level, so the player gets to enjoy it.
    crateRows.set(otherRows[0], crateWeapons[crateWeapons.length - 1]);
    if (n >= 4 && otherRows.length > 3) {
      crateRows.set(otherRows[int(2, otherRows.length - 1)], pick(crateWeapons));
    }
  }

  const addLo = 5 + n * 2;
  const addHi = 15 + n * 4;
  let mulLeft = 2 + Math.floor(n / 8); // multiply gates are rationed so armies grow steadily
  const goodGate = () => {
    if (mulLeft > 0 && rand() < 0.4 && mulLeft--) return { op: 'mul', value: n >= 3 && rand() < 0.3 ? 3 : 2 };
    return { op: 'add', value: int(addLo, addHi) };
  };
  const badGate = () => {
    if (rand() < 0.3) return { op: 'div', value: 2 };
    return { op: 'sub', value: int(2, Math.max(2, Math.floor(addLo / 3))) };
  };

  const squadLo = Math.min(10, 3 + Math.floor(n * 0.4));
  const squadHi = Math.min(25, 6 + n);
  const barrel = (z, x) => ({
    type: 'barrel',
    z,
    x,
    hp: Math.round((60 + 40 * n) * (0.75 + rand() * 0.5)),
    coins: 5 + n,
  });

  const items = [];
  rows.forEach((z, i) => {
    if (i % 2 === 0) {
      const trap = i > 0 && rand() < 0.25;
      const a = goodGate();
      const b = trap ? badGate() : goodGate();
      const flip = rand() < 0.5;
      items.push({ type: 'gates', z, left: flip ? a : b, right: flip ? b : a });
      return;
    }
    if (crateRows.has(i)) {
      const x = pick(LANES);
      items.push({ type: 'crate', z, x, weapon: crateRows.get(i), hp: 80 + 30 * n });
      const other = pick(LANES.filter((l) => l !== x));
      items.push({ type: 'squad', z: z + 4, x: other, count: int(squadLo, squadHi), hp: 10 + 3 * n });
      return;
    }
    const roll = rand();
    if (roll < 0.45) {
      items.push({ type: 'squad', z, x: pick(LANES), count: int(squadLo, squadHi), hp: 10 + 3 * n });
    } else if (roll < 0.75) {
      const x = pick(LANES);
      items.push(barrel(z, x));
      if (rand() < 0.5) items.push(barrel(z, pick(LANES.filter((l) => l !== x))));
    } else {
      const x = pick(LANES);
      items.push(barrel(z, x));
      items.push({
        type: 'squad',
        z: z + 3,
        x: pick(LANES.filter((l) => l !== x)),
        count: int(squadLo, squadHi),
        hp: 10 + 3 * n,
      });
    }
  });

  for (const it of items) {
    if (it.z > maxZ) it.z = maxZ;
    if (it.x !== undefined) it.x = Math.max(-ROAD_HALF, Math.min(ROAD_HALF, it.x));
  }
  items.sort((p, q) => p.z - q.z);

  const big = n % 5 === 0;
  return {
    number: n,
    length,
    theme: Math.floor((n - 1) / 5) % THEME_COUNT,
    items,
    boss: { hp: bossHp(n), dps: 1 + Math.floor(n / 4), big },
  };
}
