// Run state and its update. No browser APIs, no rendering: the renderer,
// audio and UI read this state and the events it emits.
import {
  ROAD_HALF, RUN_SPEED, WEAPONS, applyGate, gateIsGood, gateLabel, startArmy,
  volleyDamage, fireInterval, coinMult, WEAPON_ORDER,
} from './rules.js';
import { generateLevel } from './levelgen.js';

export const MAX_STEP = 1 / 30;
const MAX_FRAME = 0.25;
const STEER_SPEED = 14;
const SPAWN_AHEAD = 45;
const ENEMY_SPEED = 3;
const ENEMY_DRIFT = 1.5;
const BULLET_SPEED = 60;
const AIM_HALF_WIDTH = 3;
const BEAM_HALF_WIDTH = 1.5;
const SPREAD_ANGLES = [-0.21, -0.105, 0, 0.105, 0.21]; // radians, about ±12°
const RADIUS = { enemy: 0.8, barrel: 1.1, crate: 1.1, boss: 2.6 };
const BOSS_START_AHEAD = 20;
const BOSS_SPEED = 2;
const BOSS_SPEED_BIG = 1.6;
const BOSS_CONTACT = 3;

export function prepItem(item) {
  return { ...item, alive: true, passed: false, maxHp: item.hp };
}

export function createRun(levelNumber, save) {
  const level = generateLevel(levelNumber);
  return {
    level,
    phase: 'run',
    t: 0,
    x: 0,
    z: 0,
    army: startArmy(save),
    weapon: 'rifle',
    coins: 0,
    kills: 0,
    fireTimer: 0,
    items: level.items.map(prepItem),
    enemies: [],
    bullets: [],
    boss: null,
    events: [],
  };
}

export function stepRun(run, dt, steer, save) {
  let left = Math.min(Math.max(dt, 0), MAX_FRAME);
  if (!Number.isFinite(left)) return;
  const s = Math.max(-1, Math.min(1, Number.isFinite(steer) ? steer : 0));
  while (left > 1e-9) {
    const h = Math.min(left, MAX_STEP);
    left -= h;
    if (run.phase === 'won' || run.phase === 'lost') return;
    subStep(run, h, s, save);
  }
}

function subStep(run, h, steer, save) {
  run.t += h;
  moveArmy(run, h, steer);
  if (run.phase === 'run') {
    run.z += RUN_SPEED * h;
    if (run.z >= run.level.length) {
      run.z = run.level.length;
      run.phase = 'boss';
      const b = run.level.boss;
      run.boss = {
        hp: b.hp, maxHp: b.hp, x: 0, z: run.z + BOSS_START_AHEAD, dps: b.dps, big: b.big,
        contact: false, alive: true, lossAcc: 0,
      };
      run.events.push({ type: 'bossStart' });
    }
  }
  crossItems(run);
  moveEnemies(run, h);
  moveBullets(run, h);
  fire(run, h, save);
  if (run.phase === 'boss') moveBoss(run, h);
  if (run.phase === 'won') return;
  if (run.army <= 0 && run.phase !== 'lost') {
    run.army = 0;
    run.phase = 'lost';
    run.events.push({ type: 'lost' });
  }
}

function moveArmy(run, h, steer) {
  const limit = ROAD_HALF - 0.5;
  const target = steer * ROAD_HALF;
  const dx = target - run.x;
  const max = STEER_SPEED * h;
  run.x += Math.max(-max, Math.min(max, dx));
  run.x = Math.max(-limit, Math.min(limit, run.x));
}

function loseSoldiers(run, n, type) {
  const lost = Math.min(run.army, n);
  if (lost <= 0) return;
  run.army -= lost;
  run.events.push({ type, lost, x: run.x, z: run.z });
}

function crossItems(run) {
  for (const it of run.items) {
    if (it.type === 'squad') {
      if (it.alive && it.z - run.z < SPAWN_AHEAD) spawnSquad(run, it);
      continue;
    }
    if (it.passed || it.z > run.z) continue;
    it.passed = true;
    if (!it.alive) continue;
    if (it.type === 'gates') {
      const gate = run.x < 0 ? it.left : it.right;
      run.army = applyGate(run.army, gate);
      it.alive = false;
      it.taken = run.x < 0 ? 'left' : 'right';
      run.events.push({
        type: 'gate', good: gateIsGood(gate), label: gateLabel(gate), army: run.army, x: run.x, z: it.z,
      });
    } else if (Math.abs(run.x - it.x) < 1.2) {
      it.alive = false;
      loseSoldiers(run, Math.ceil(it.hp / 40), 'crash');
    }
  }
}

function spawnSquad(run, squad) {
  squad.alive = false;
  const cols = Math.ceil(Math.sqrt(squad.count));
  for (let i = 0; i < squad.count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = squad.x + (col - (cols - 1) / 2) * 0.8;
    run.enemies.push({
      x: Math.max(-ROAD_HALF + 0.4, Math.min(ROAD_HALF - 0.4, x)),
      z: squad.z + row * 0.8,
      hp: squad.hp,
      maxHp: squad.hp,
      alive: true,
    });
  }
}

function moveEnemies(run, h) {
  let anyDead = false;
  for (const e of run.enemies) {
    if (!e.alive) { anyDead = true; continue; }
    e.z -= ENEMY_SPEED * h;
    const dx = run.x - e.x;
    const max = ENEMY_DRIFT * h;
    e.x += Math.max(-max, Math.min(max, dx));
    if (e.z - run.z < 1) {
      e.alive = false;
      anyDead = true;
      if (Math.abs(e.x - run.x) < 2.5) loseSoldiers(run, 1, 'soldierLost');
    }
  }
  if (anyDead) run.enemies = run.enemies.filter((e) => e.alive);
}

function moveBoss(run, h) {
  const boss = run.boss;
  if (boss.hp <= 0) {
    boss.alive = false;
    run.phase = 'won';
    run.events.push({ type: 'won', x: boss.x, z: boss.z });
    return;
  }
  if (boss.z - run.z > BOSS_CONTACT) {
    boss.z = Math.max(run.z + BOSS_CONTACT, boss.z - (boss.big ? BOSS_SPEED_BIG : BOSS_SPEED) * h);
    return;
  }
  boss.contact = true;
  boss.lossAcc += boss.dps * h;
  const n = Math.floor(boss.lossAcc);
  if (n > 0) {
    boss.lossAcc -= n;
    loseSoldiers(run, n, 'soldierLost');
  }
}

// Everything that can be shot, as { kind, ref, x, z, r }.
function targets(run) {
  const out = [];
  for (const e of run.enemies) {
    if (e.alive && e.z > run.z) out.push({ kind: 'enemy', ref: e, x: e.x, z: e.z, r: RADIUS.enemy });
  }
  for (const it of run.items) {
    if ((it.type === 'barrel' || it.type === 'crate') && it.alive && !it.passed) {
      out.push({ kind: it.type, ref: it, x: it.x, z: it.z, r: RADIUS[it.type] });
    }
  }
  if (run.boss && run.boss.alive) {
    out.push({ kind: 'boss', ref: run.boss, x: run.boss.x, z: run.boss.z, r: RADIUS.boss });
  }
  return out;
}

function damage(run, target, amount) {
  const ref = target.ref;
  if (!ref.alive) return;
  ref.hp -= amount;
  run.events.push({ type: 'hit', kind: target.kind, x: target.x, z: target.z, damage: amount });
  if (ref.hp > 0) return;
  if (target.kind === 'boss') { ref.hp = 0; return; } // moveBoss ends the run
  ref.alive = false;
  if (target.kind === 'enemy') {
    run.kills += 1;
    run.coins += 1;
    run.events.push({ type: 'kill', x: target.x, z: target.z });
  } else if (target.kind === 'barrel') {
    run.coins += ref.coins;
    run.events.push({ type: 'barrelDown', x: target.x, z: target.z, coins: ref.coins });
  } else if (target.kind === 'crate') {
    run.weapon = ref.weapon;
    run.fireTimer = 0;
    run.events.push({ type: 'weapon', weapon: ref.weapon, x: target.x, z: target.z });
  }
}

function fire(run, h, save) {
  run.fireTimer -= h;
  if (run.fireTimer > 0 || run.army <= 0) return;
  const weapon = WEAPONS[run.weapon];
  const all = targets(run);
  let best = null;
  for (const t of all) {
    const dz = t.z - run.z;
    if (dz > weapon.range) continue;
    if (t.kind !== 'boss' && Math.abs(t.x - run.x) > AIM_HALF_WIDTH) continue;
    if (!best || dz < best.z - run.z) best = t;
  }
  if (!best) {
    run.fireTimer = 0;
    return;
  }
  run.fireTimer += fireInterval(run.weapon, save);
  if (run.fireTimer < 0) run.fireTimer = 0;
  const total = volleyDamage(run.army, run.weapon, save);
  const ox = run.x;
  const oz = run.z + 0.5;
  run.events.push({ type: 'shot', weapon: run.weapon, x: ox, z: oz, range: weapon.range });

  if (weapon.kind === 'beam') {
    for (const t of all) {
      const dz = t.z - run.z;
      if (dz <= weapon.range && Math.abs(t.x - run.x) <= BEAM_HALF_WIDTH + (t.kind === 'boss' ? t.r : 0)) {
        damage(run, t, total);
      }
    }
    return;
  }

  // Plain bullets come from across the crowd: more soldiers, more tracers,
  // same total damage.
  const shots = [];
  if (weapon.kind === 'spread') {
    for (const a of SPREAD_ANGLES) shots.push({ dx: 0, angle: a });
  } else if (weapon.kind === 'bullet') {
    const n = Math.max(1, Math.min(6, Math.ceil(run.army / 12)));
    const half = Math.min(2.5, Math.sqrt(run.army) * 0.2);
    for (let i = 0; i < n; i++) shots.push({ dx: n === 1 ? 0 : -half + (2 * half * i) / (n - 1), angle: 0 });
  } else {
    shots.push({ dx: 0, angle: 0 });
  }
  for (const shot of shots) {
    const sx = Math.max(-ROAD_HALF, Math.min(ROAD_HALF, ox + shot.dx));
    const aim = Math.atan2(best.x - sx, best.z - oz) + shot.angle;
    run.bullets.push({
      x: sx,
      z: oz,
      vx: Math.sin(aim) * BULLET_SPEED,
      vz: Math.cos(aim) * BULLET_SPEED,
      damage: total / shots.length,
      kind: weapon.kind,
      splash: weapon.splash || 0,
      ttl: (weapon.range + 4) / BULLET_SPEED,
    });
  }
}

function moveBullets(run, h) {
  if (run.bullets.length === 0) return;
  const all = targets(run);
  for (const b of run.bullets) {
    const pz = b.z;
    b.x += b.vx * h;
    b.z += b.vz * h;
    b.ttl -= h;
    let hit = null;
    for (const t of all) {
      if (!t.ref.alive) continue;
      if (t.z < pz - t.r || t.z > b.z + t.r) continue;
      if (Math.abs(t.x - b.x) > t.r + 0.3) continue;
      if (!hit || t.z < hit.z) hit = t;
    }
    if (!hit) continue;
    b.ttl = 0;
    if (b.kind === 'rocket') {
      run.events.push({ type: 'explosion', x: hit.x, z: hit.z, radius: b.splash });
      for (const t of all) {
        if (Math.hypot(t.x - hit.x, t.z - hit.z) <= b.splash + (t.kind === 'boss' ? t.r : 0)) {
          damage(run, t, b.damage);
        }
      }
    } else {
      damage(run, hit, b.damage);
    }
  }
  run.bullets = run.bullets.filter((b) => b.ttl > 0);
}

export function runResult(run, save) {
  const won = run.phase === 'won';
  const n = run.level.number;
  const base = won ? run.coins + 20 + 10 * n + Math.floor(3 * Math.sqrt(run.army)) : run.coins;
  const next = WEAPON_ORDER.find((id) => WEAPONS[id].unlock === n + 1);
  return {
    won,
    coins: Math.round(base * coinMult(save)),
    kills: run.kills,
    armyLeft: run.army,
    newWeapon: won && next ? next : null,
  };
}
