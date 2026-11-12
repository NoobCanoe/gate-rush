import { createRun, stepRun } from './sim.js';
import { createRenderer } from './render.js';
import { createSteer, attachSteer } from './input.js';

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const steer = createSteer();
attachSteer(canvas, steer);
const save = {};
let level = 1;
let run = createRun(level, save);
renderer.setLevel(run.level);
window.addEventListener('resize', () => renderer.resize());
window.__game = { get run() { return run; }, steer };

let last = performance.now();
let endTimer = 0;
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  stepRun(run, dt, steer.value, save);
  run.events.length = 0;
  renderer.draw(run, dt);
  if (run.phase === 'won' || run.phase === 'lost') {
    endTimer += dt;
    if (endTimer > 2) {
      if (run.phase === 'won') level++;
      endTimer = 0;
      steer.reset();
      run = createRun(level, save);
      renderer.setLevel(run.level);
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
