// "Hold the Line" levels: the army holds its ground while the road streams
// toward it. One lane is a constant stream of cards that add soldiers; the
// other holds containers to shoot open for weapons, power tiers and coins.
// The army can only be in one lane at a time, and the horde comes down both.
//
// Like the main mode, everything is sized against a reference player: one who
// splits their time between the lanes and has the upgrades expected by now.
import {
  ROAD_HALF, RUN_SPEED, MAX_TIER, unlockedWeapons, volleyDamage, fireInterval, killRate, startArmy, bulletCount,
} from './rules.js';
import {
  mulberry32, expectedUpgrades, streamShare, THEME_COUNT, WAVE_EVERY, KILLS_PER_BULLET, MIN_ENEMY_HP,
  BOSS_SECONDS, BOSS_SECONDS_BIG,
} from './levelgen.js';

export const MEN_SIDE = 1; // right lane: soldiers
export const FIRE_SIDE = -1; // left lane: containers
const LANE_X = ROAD_HALF / 2;
const CARD_GAP = 2.6; // road units between cards
const CRATE_GAP = 50;
const REF_MEN_SHARE = 0.45; // share of the card stream the reference player collects
// Share of the containers the reference player opens: few at first, so the
// early levels can be won on soldiers alone; more later, so firepower matters.
const refOpenShare = (n) => Math.min(0.6, 0.25 + 0.04 * (n - 1));
// This mode starts gently and reaches full pressure around level 16.
export function lineEase(n) {
  return Math.min(1, EASE_BASE + EASE_PER_LEVEL * (n - 1));
}
const EASE_BASE = 0.55;
const EASE_PER_LEVEL = 0.03;
const CRATE_VOLLEYS = 0.8; // container toughness, in reference volleys
const STEP = 40; // how often the horde is re-sized along the road

export function generateLineLevel(n, unlockLevel = n) {
  const rand = mulberry32(n * 104729 + 71);
  const length = 600 + 15 * Math.min(n, 20);
  const ease = lineEase(n);
  const share = streamShare(n) * ease;
  const refSave = expectedUpgrades(n);
  const weapons = unlockedWeapons(unlockLevel).filter((w) => w !== 'rifle');

  const items = [];
  // The card stream.
  let i = 0;
  for (let z = 20; z <= length - 40; z += CARD_GAP, i++) {
    // Every card helps: mostly +1, with a +3 every so often.
    const gate = { op: 'add', value: i % 8 === 3 ? 3 : 1 };
    items.push({ type: 'card', z: Math.round(z * 10) / 10, side: MEN_SIDE, gate });
  }

  // Walk the road, tracking the reference player, to size containers and the horde.
  let ref = startArmy(refSave);
  let refTier = 1;
  let cardIndex = 0;
  const cards = items.slice();
  const hpNow = () => Math.max(MIN_ENEMY_HP, Math.round(volleyDamage(ref, 'rifle', refSave, refTier) / bulletCount(ref) / KILLS_PER_BULLET));
  const waveNow = () => killRate(ref, 'rifle', refSave, hpNow(), refTier) * WAVE_EVERY * share;
  const steps = [{ z: 0, count: waveNow(), hp: hpNow() }];
  let crateIndex = 0;
  let nextCrate = 55;
  for (let z = STEP; z <= length; z += STEP) {
    while (cardIndex < cards.length && cards[cardIndex].z <= z) {
      const g = cards[cardIndex].gate;
      ref += g.value * REF_MEN_SHARE;
      cardIndex++;
    }
    while (nextCrate <= z && nextCrate <= length - 40) {
      const kind = crateIndex % 3 === 2 ? 'coins' : 'power';
      const crate = {
        type: 'crate', z: nextCrate, x: FIRE_SIDE * LANE_X, side: FIRE_SIDE, weapon: null,
        // About a second of fire from the lanes that can reach it.
        hp: Math.max(20, Math.round(volleyDamage(Math.round(ref), 'rifle', refSave, refTier) * (CRATE_VOLLEYS + rand() * 0.4))),
      };
      if (kind === 'coins') crate.coins = 10 + 3 * n;
      else if (weapons.length > 0 && crateIndex % 4 === 1) crate.weapon = weapons[Math.floor(rand() * weapons.length)];
      if (kind === 'power') refTier = Math.min(MAX_TIER, refTier + refOpenShare(n));
      items.push(crate);
      crateIndex++;
      nextCrate += CRATE_GAP;
    }
    steps.push({ z, count: waveNow(), hp: hpNow() });
  }
  items.sort((p, q) => p.z - q.z);

  const refArmy = Math.round(ref);
  const big = n % 5 === 0;
  const refDps = volleyDamage(refArmy, 'rifle', refSave, refTier) / fireInterval('rifle', refSave);
  return {
    number: n,
    mode: 'line',
    length,
    theme: (Math.floor((n - 1) / 5) + 2) % THEME_COUNT,
    items,
    flow: { every: WAVE_EVERY, hp: hpNow(), steps },
    boss: {
      hp: Math.round(refDps * (big ? BOSS_SECONDS_BIG : BOSS_SECONDS) * ease),
      // The boss hits harder on later levels, so a slow kill (too little
      // firepower) is what loses them.
      dps: Math.max(1, Math.round(refArmy * Math.min(0.2, 0.04 + 0.012 * (n - 1)))),
      big,
    },
    refArmy,
    seconds: length / RUN_SPEED,
  };
}
