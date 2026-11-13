// Saved progress. Storage is passed in so this works (and is tested)
// without a browser.
import { WEAPON_ORDER, WEAPONS, upgradeCost } from './rules.js';

export const SAVE_KEY = 'gate-rush-save';
export const SAVE_VERSION = 1;
const UPGRADE_KINDS = ['army', 'fireRate', 'damage', 'coins'];
const MAX_LEVEL = 9999;

export function newSave() {
  return {
    version: SAVE_VERSION,
    level: 1,
    lineLevel: 1, // progress in the Hold the Line mode
    mode: 'rush', // the mode played last
    coins: 0,
    upgrades: { army: 0, fireRate: 0, damage: 0, coins: 0 },
    weaponLevels: {},
    muted: false,
  };
}

// Back to a brand-new game, keeping only the sound setting. Mutates the save.
export function resetSave(save) {
  const fresh = newSave();
  fresh.muted = save.muted === true;
  for (const key of Object.keys(save)) delete save[key];
  return Object.assign(save, fresh);
}

const count = (v, min) => (Number.isFinite(v) && v >= min ? Math.min(Math.floor(v), 1e12) : null);

export function loadSave(storage) {
  const save = newSave();
  let raw;
  try {
    raw = JSON.parse(storage.getItem(SAVE_KEY));
  } catch {
    return save;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== SAVE_VERSION) return save;

  const level = count(raw.level, 1);
  if (level !== null) save.level = Math.min(level, MAX_LEVEL);
  const lineLevel = count(raw.lineLevel, 1);
  if (lineLevel !== null) save.lineLevel = Math.min(lineLevel, MAX_LEVEL);
  if (raw.mode === 'line') save.mode = 'line';
  const coins = count(raw.coins, 0);
  if (coins !== null) save.coins = coins;
  if (raw.upgrades && typeof raw.upgrades === 'object') {
    for (const kind of UPGRADE_KINDS) {
      const v = count(raw.upgrades[kind], 0);
      if (v !== null) save.upgrades[kind] = Math.min(v, MAX_LEVEL);
    }
  }
  if (raw.weaponLevels && typeof raw.weaponLevels === 'object') {
    for (const id of WEAPON_ORDER) {
      const v = count(raw.weaponLevels[id], 1);
      if (v !== null) save.weaponLevels[id] = Math.min(v, MAX_LEVEL);
    }
  }
  save.muted = raw.muted === true;
  return save;
}

export function writeSave(storage, save) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function buyUpgrade(save, kind, weaponId) {
  let level;
  if (kind === 'weapon') {
    if (!WEAPONS[weaponId] || WEAPONS[weaponId].unlock > save.level) return false;
    level = save.weaponLevels[weaponId] || 0;
  } else if (UPGRADE_KINDS.includes(kind)) {
    level = save.upgrades[kind] || 0;
  } else {
    return false;
  }
  const cost = upgradeCost(kind, level);
  if (cost > save.coins) return false;
  save.coins -= cost;
  if (kind === 'weapon') save.weaponLevels[weaponId] = level + 1;
  else save.upgrades[kind] = level + 1;
  return true;
}
