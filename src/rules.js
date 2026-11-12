// Pure game rules. No browser APIs, no rendering.

export const ROAD_HALF = 5;
export const RUN_SPEED = 12;
export const ARMY_CAP = 99999;
export const DRAW_CAP = 300;

export const WEAPONS = {
  rifle: { name: 'Rifle', unlock: 1, interval: 0.45, damage: 10, range: 28, kind: 'bullet' },
  mg: { name: 'Machine gun', unlock: 2, interval: 0.12, damage: 4, range: 28, kind: 'bullet' },
  shotgun: { name: 'Shotgun', unlock: 4, interval: 0.6, damage: 30, range: 16, kind: 'spread' },
  rocket: { name: 'Rocket launcher', unlock: 7, interval: 0.8, damage: 34, range: 32, kind: 'rocket', splash: 4.5 },
  laser: { name: 'Laser', unlock: 10, interval: 0.1, damage: 5, range: 34, kind: 'beam' },
};
export const WEAPON_ORDER = ['rifle', 'mg', 'shotgun', 'rocket', 'laser'];

export const UPGRADES = {
  army: { base: 20, name: 'Starting army' },
  fireRate: { base: 30, name: 'Fire rate' },
  damage: { base: 30, name: 'Damage' },
  coins: { base: 40, name: 'Coin bonus' },
  weapon: { base: 50, name: 'Weapon' },
};
const COST_GROWTH = 1.35;

const lvl = (save, kind) => {
  const v = save && save.upgrades && save.upgrades[kind];
  return Number.isFinite(v) && v > 0 ? v : 0;
};
const weaponLvl = (save, id) => {
  const v = save && save.weaponLevels && save.weaponLevels[id];
  return Number.isFinite(v) && v > 0 ? v : 0;
};

export function applyGate(army, gate) {
  let n = army;
  if (gate.op === 'add') n = army + gate.value;
  else if (gate.op === 'mul') n = army * gate.value;
  else if (gate.op === 'sub') n = army - gate.value;
  else if (gate.op === 'div') n = army / gate.value;
  if (!Number.isFinite(n)) n = army;
  return Math.max(0, Math.min(ARMY_CAP, Math.floor(n)));
}

export function gateIsGood(gate) {
  return gate.op === 'add' || gate.op === 'mul';
}

export function gateLabel(gate) {
  const sign = { add: '+', mul: '×', sub: '−', div: '÷' }[gate.op];
  return sign + gate.value;
}

export function upgradeCost(kind, level) {
  return Math.round(UPGRADES[kind].base * COST_GROWTH ** level);
}

export function startArmy(save) {
  return 5 + 2 * lvl(save, 'army');
}

export function damageMult(save) {
  return 1 + 0.1 * lvl(save, 'damage');
}

export function coinMult(save) {
  return 1 + 0.1 * lvl(save, 'coins');
}

export function weaponMult(save, weaponId) {
  return 1 + 0.15 * weaponLvl(save, weaponId);
}

export const MAX_TIER = 5;
// Power tiers come from containers and last for the run.
export function tierMult(tier) {
  return 1.4 ** (Math.max(1, Math.min(MAX_TIER, tier || 1)) - 1);
}

// Firepower grows strongly with army size, so the gates you pick matter.
function armyScale(army) {
  return army <= 20 ? army : 20 * (army / 20) ** 0.7;
}

export function volleyDamage(army, weaponId, save, tier = 1) {
  const w = WEAPONS[weaponId];
  return w.damage * damageMult(save) * weaponMult(save, weaponId) * tierMult(tier) * armyScale(army);
}

export function fireInterval(weaponId, save) {
  return WEAPONS[weaponId].interval / (1 + 0.08 * lvl(save, 'fireRate'));
}

export function unlockedWeapons(level) {
  return WEAPON_ORDER.filter((id) => WEAPONS[id].unlock <= level);
}

export function formatCount(n) {
  if (!Number.isFinite(n)) return '∞';
  if (n < 1000) return String(Math.floor(n));
  const units = ['K', 'M', 'B', 'T'];
  let v = n / 1000;
  let u = 0;
  // 999950 would print as "1000.0K": step up a unit instead.
  while (v >= 999.95 && u < units.length - 1) { v /= 1000; u++; }
  return v.toFixed(1).replace(/\.0$/, '') + units[u];
}

// Shots per volley for each kind of weapon.
export const SPREAD_PELLETS = 5;
export const bulletCount = (army) => Math.max(1, Math.min(10, Math.ceil(army / 3)));
export const rocketCount = (army) => Math.max(1, Math.min(4, Math.ceil(army / 15)));
const REACH = { bullet: 3, spread: 2, rocket: 8, beam: 40 }; // most enemies one shot can deal with

// Enemies per second an army can kill, for enemies with the given health:
// limited by its damage and by how many shots it gets off.
export function killRate(army, weaponId, save, hp, tier = 1) {
  const weapon = WEAPONS[weaponId];
  const interval = fireInterval(weaponId, save);
  const volley = volleyDamage(army, weaponId, save, tier);
  let shots = 1;
  if (weapon.kind === 'bullet') shots = bulletCount(army);
  else if (weapon.kind === 'spread') shots = SPREAD_PELLETS;
  else if (weapon.kind === 'rocket') shots = rocketCount(army);
  const perShot = Math.max(1, Math.min(REACH[weapon.kind], volley / shots / hp));
  return Math.min(volley / interval / hp, (shots / interval) * perShot);
}
