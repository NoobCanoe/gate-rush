// Game loop and screen flow. Wires the simulation, renderer, input, audio,
// menus and saved progress together.
import { createRun, stepRun, runResult } from './sim.js';
import { createRenderer } from './render.js';
import { createSteer, attachSteer } from './input.js';
import { createAudio } from './audio.js';
import { createUI } from './ui.js';
import { loadSave, writeSave, buyUpgrade } from './save.js';
import { WEAPONS, formatCount } from './rules.js';

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const steer = createSteer();
const audio = createAudio();

let storage;
try { storage = window.localStorage; } catch { storage = undefined; }
const save = loadSave(storage);
const persist = () => writeSave(storage, save);
audio.setMuted(save.muted);

let mode = 'title'; // title | run | ending | menu
let run = createRun(save.level, save);
let result = null;
let endedLevel = 0;
let endTimer = 0;
let hitDamage = 0;
let hitAt = null;
let hitTimer = 0;
let paused = false;

const ui = createUI(document.getElementById('ui'), {
  onPlay() {
    audio.unlock();
    audio.play('tap');
    startRun();
  },
  onShop() {
    audio.unlock();
    audio.play('tap');
    ui.showShop(save);
  },
  onContinue() {
    audio.unlock();
    audio.play('tap');
    if (result && result.newWeapon) {
      audio.play('weapon');
      ui.showNewWeapon(result.newWeapon, () => { audio.play('tap'); ui.showShop(save); });
    } else {
      ui.showShop(save);
    }
  },
  onBuy(kind, weaponId) {
    audio.unlock();
    if (buyUpgrade(save, kind, weaponId)) {
      persist();
      audio.play('coin');
      ui.showShop(save);
    }
  },
  onToggleMute() {
    save.muted = !save.muted;
    audio.setMuted(save.muted);
    ui.setMuted(save.muted);
    persist();
    audio.unlock();
    audio.play('tap');
  },
});
ui.setMuted(save.muted);

function startRun() {
  run = createRun(save.level, save); // fresh, so it includes upgrades bought since the last run
  renderer.setLevel(run.level);
  steer.reset();
  result = null;
  hitDamage = 0;
  mode = 'run';
  ui.showHud(run);
}

function handleEvents() {
  for (const e of run.events) {
    switch (e.type) {
      case 'shot':
        audio.play('shot-' + e.weapon);
        if (e.weapon === 'laser') renderer.beam(e.x, e.z, e.range);
        break;
      case 'hit':
        hitDamage += e.damage;
        hitAt = e;
        if (e.kind === 'boss') audio.play('boss-hit');
        break;
      case 'kill':
        renderer.burst(e.x, e.z, 0xe23b3b, 5);
        audio.play('kill');
        break;
      case 'barrelDown':
        renderer.burst(e.x, e.z, 0x9a5a2a, 10);
        renderer.burst(e.x, e.z, 0xffd23f, 6, 1.3);
        renderer.popNumber(e.x, e.z, '+' + e.coins, '#ffd23f', 2.6, 1.2);
        audio.play('barrel');
        audio.play('coin');
        break;
      case 'explosion':
        renderer.burst(e.x, e.z, 0xff8a2a, 14, 1.4);
        renderer.shake(0.2);
        audio.play('explosion');
        break;
      case 'weapon':
        renderer.burst(e.x, e.z, 0xfff3a8, 16, 1.3);
        renderer.popNumber(e.x, e.z, WEAPONS[e.weapon].name, '#fff3a8', 3.2, 1.5);
        audio.play('weapon');
        break;
      case 'gate':
        renderer.popNumber(e.x, e.z + 2, e.label, e.good ? '#9fe4ff' : '#ff9a9a', 3.2, 1.7);
        if (e.good) renderer.burst(e.x, e.z, 0x2f7dff, 10);
        else renderer.shake(0.35);
        audio.play(e.good ? 'gate-good' : 'gate-bad');
        break;
      case 'crash':
        renderer.burst(e.x, e.z, 0x9a5a2a, 12);
        renderer.popNumber(e.x, e.z, '−' + formatCount(e.lost), '#ff9a9a', 3, 1.4);
        renderer.shake(0.5);
        audio.play('barrel');
        break;
      case 'soldierLost':
        renderer.burst(e.x, e.z, 0x2f7dff, 3);
        renderer.shake(0.15);
        audio.play('soldier-lost');
        break;
      case 'bossStart':
        renderer.shake(0.3);
        break;
      case 'won':
        for (let i = 0; i < 6; i++) renderer.burst(e.x + (i - 2.5), e.z, i % 2 ? 0xffd23f : 0xff8a2a, 20, 1.8);
        renderer.shake(1);
        audio.play('boss-down');
        setTimeout(() => audio.play('win'), 500);
        break;
      case 'lost':
        audio.play('lose');
        break;
      default:
        break;
    }
  }
  run.events.length = 0;
}

function showHitNumber(dt) {
  hitTimer -= dt;
  if (hitDamage <= 0 || hitTimer > 0 || !hitAt) return;
  renderer.popNumber(hitAt.x, hitAt.z, formatCount(Math.round(hitDamage)), '#ffffff', hitAt.kind === 'boss' ? 5 : 2.4, 1);
  hitDamage = 0;
  hitTimer = 0.14;
}

function endRun() {
  result = runResult(run, save);
  endedLevel = run.level.number;
  save.coins += result.coins;
  if (result.won) save.level += 1;
  persist();
  mode = 'ending';
  endTimer = result.won ? 1.8 : 1.1;
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  if (paused) return;
  const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
  last = now;

  if (mode === 'run') {
    stepRun(run, dt, steer.value, save);
    handleEvents();
    showHitNumber(dt);
    ui.updateHud(run);
    if (run.phase === 'won' || run.phase === 'lost') endRun();
  } else if (mode === 'ending') {
    endTimer -= dt;
    if (endTimer <= 0) {
      mode = 'menu';
      ui.showResult(result, save, endedLevel);
    }
  }
  renderer.draw(run, dt);
}

if (!renderer.ok) {
  ui.showMessage("This device can't run the 3D graphics this game needs.");
} else {
  attachSteer(canvas, steer);
  renderer.setLevel(run.level);
  ui.showTitle(save);
  requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  paused = document.hidden;
  if (paused) {
    audio.suspend();
  } else {
    last = performance.now();
    audio.resume();
  }
});
const onResize = () => renderer.resize();
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 250));
// iOS: stop pinch and double-tap zoom gestures.
for (const type of ['gesturestart', 'gesturechange', 'dblclick']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}

// Handle for play-testing from the console.
window.__game = { get run() { return run; }, get mode() { return mode; }, save, steer, audio };
