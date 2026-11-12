// Draws the simulation state with Three.js. Holds no game rules.
// Sim coordinates (x across, z forward) map to Three.js (x, y up, -z).
import * as THREE from '../vendor/three.module.min.js';
import { ROAD_HALF, DRAW_CAP, WEAPONS, gateIsGood, gateLabel, formatCount } from './rules.js';

const THEMES = [
  { sky: 0x8fd3ff, road: 0xd9d4c7, side: 0x3aa0d8, rail: 0x55606e, fog: 0x8fd3ff },
  { sky: 0xffc98f, road: 0xe2c9a0, side: 0xd98a4a, rail: 0x7a4a2a, fog: 0xffc98f },
  { sky: 0xa9f0c0, road: 0xcfd8cf, side: 0x3f9b5a, rail: 0x2f5f3f, fog: 0xa9f0c0 },
  { sky: 0x3a3f7a, road: 0x9aa0c8, side: 0x1c2050, rail: 0x6a70c0, fog: 0x3a3f7a },
];
const COLORS = {
  soldier: 0x9aa7b8, helmet: 0x2f7dff, enemy: 0xd8b0a8, enemyHat: 0xe23b3b,
  good: 0x2b8cff, bad: 0xff3b3b, barrel: 0x9a5a2a, boss: 0xd9482b,
};
const WEAPON_COLORS = { rifle: 0xffe066, mg: 0xffa53a, shotgun: 0xff7a59, rocket: 0xff4d4d, laser: 0x6ff7ff };
const FONT = "900 %px -apple-system, 'Arial Rounded MT Bold', 'Helvetica Neue', Arial, sans-serif";
const ENEMY_CAP = 400;
const BULLET_CAP = 240;
const PARTICLE_CAP = 260;
const NUMBER_POOL = 18;

function makeLabel(w, h, worldH) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set((w / h) * worldH, worldH, 1);
  let last = null;
  return {
    sprite,
    material,
    set(text, color = '#ffffff') {
      const key = text + color;
      if (key === last) return;
      last = key;
      ctx.clearRect(0, 0, w, h);
      const lines = String(text).split('\n');
      const size = Math.floor((h / lines.length) * 0.82);
      ctx.font = FONT.replace('%', size);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.22;
      ctx.strokeStyle = 'rgba(20,24,40,0.9)';
      ctx.fillStyle = color;
      lines.forEach((line, i) => {
        const y = (h / lines.length) * (i + 0.5);
        ctx.strokeText(line, w / 2, y, w * 0.94);
        ctx.fillText(line, w / 2, y, w * 0.94);
      });
      texture.needsUpdate = true;
    },
  };
}

export function createRenderer(canvas) {
  let gl;
  try {
    gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch {
    return { ok: false, setLevel() {}, draw() {}, resize() {}, shake() {}, popNumber() {}, burst() {}, beam() {} };
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(4, 10, 6);
  scene.add(sun);

  const dummy = new THREE.Object3D();
  const instanced = (geometry, color, cap) => {
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color }), cap);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  };

  // --- crowds ---
  const bodyGeo = new THREE.CapsuleGeometry(0.17, 0.3, 3, 8);
  const hatGeo = new THREE.SphereGeometry(0.19, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const soldierBody = instanced(bodyGeo, COLORS.soldier, DRAW_CAP);
  const soldierHat = instanced(hatGeo, COLORS.helmet, DRAW_CAP);
  const enemyBody = instanced(bodyGeo, COLORS.enemy, ENEMY_CAP);
  const enemyHat = instanced(hatGeo, COLORS.enemyHat, ENEMY_CAP);

  // Sunflower-spiral formation offsets, unit spacing.
  const formation = [];
  for (let i = 0; i < DRAW_CAP; i++) {
    const r = Math.sqrt(i + 0.5);
    const a = i * 2.39996323;
    formation.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  let shownCount = 0;
  let crowdDepth = 0;
  const armyLabel = makeLabel(256, 96, 1.15);
  armyLabel.sprite.renderOrder = 10;
  scene.add(armyLabel.sprite);

  // --- bullets, beam, particles, floating numbers ---
  const bullets = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.14, 6, 5),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    BULLET_CAP,
  );
  bullets.frustumCulled = false;
  bullets.count = 0;
  scene.add(bullets);
  const bulletColor = new THREE.Color();

  const beamMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.25, 1),
    new THREE.MeshBasicMaterial({ color: WEAPON_COLORS.laser, transparent: true, opacity: 0.85, fog: false }),
  );
  beamMesh.visible = false;
  scene.add(beamMesh);
  let beamLife = 0;

  const particleMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.22, 0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    PARTICLE_CAP,
  );
  particleMesh.frustumCulled = false;
  particleMesh.count = 0;
  scene.add(particleMesh);
  const particles = [];
  const particleColor = new THREE.Color();

  const numbers = [];
  for (let i = 0; i < NUMBER_POOL; i++) {
    const label = makeLabel(192, 80, 1.1);
    label.sprite.visible = false;
    label.sprite.renderOrder = 11;
    scene.add(label.sprite);
    numbers.push({ label, life: 0 });
  }
  let numberCursor = 0;

  // --- per-level objects ---
  let levelGroup = null;
  let itemViews = [];
  let boss = null;
  let shakeAmount = 0;
  let time = 0;

  function buildBoss(big) {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: COLORS.boss });
    const dark = new THREE.MeshLambertMaterial({ color: 0x7a1f14 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xf0c0a0 });
    const box = (w, h, d, m, x, y, z) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    };
    box(2.6, 2.6, 1.6, mat, 0, 3.1, 0);
    box(1.5, 1.4, 1.4, skin, 0, 5.1, 0);
    box(1.7, 0.5, 1.6, dark, 0, 5.95, 0);
    box(0.3, 0.3, 0.1, dark, -0.35, 5.2, 0.72);
    box(0.3, 0.3, 0.1, dark, 0.35, 5.2, 0.72);
    const armL = box(0.8, 2.4, 0.8, skin, -1.8, 3.1, 0);
    const armR = box(0.8, 2.4, 0.8, skin, 1.8, 3.1, 0);
    const legL = box(0.95, 1.9, 0.95, dark, -0.7, 0.95, 0);
    const legR = box(0.95, 1.9, 0.95, dark, 0.7, 0.95, 0);
    const scale = big ? 1.35 : 1;
    g.scale.setScalar(scale);
    const hp = makeLabel(384, 96, 1.6);
    hp.sprite.renderOrder = 12;
    g.visible = false;
    hp.sprite.visible = false;
    return { group: g, hp, armL, armR, legL, legR, scale };
  }

  function setLevel(level) {
    if (levelGroup) {
      scene.remove(levelGroup);
      levelGroup.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
      });
    }
    levelGroup = new THREE.Group();
    scene.add(levelGroup);
    const theme = THEMES[level.theme % THEMES.length];
    scene.background = new THREE.Color(theme.sky);
    scene.fog = new THREE.Fog(theme.fog, 60, 170);

    const total = level.length + 90;
    const mid = -(total / 2 - 30);
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(ROAD_HALF * 2 + 1.4, 0.4, total),
      new THREE.MeshLambertMaterial({ color: theme.road }),
    );
    road.position.set(0, -0.2, mid);
    levelGroup.add(road);
    const side = new THREE.Mesh(
      new THREE.PlaneGeometry(600, total + 300),
      new THREE.MeshLambertMaterial({ color: theme.side }),
    );
    side.rotation.x = -Math.PI / 2;
    side.position.set(0, -1.6, mid);
    levelGroup.add(side);
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.7, total),
        new THREE.MeshLambertMaterial({ color: theme.rail }),
      );
      rail.position.set(sx * (ROAD_HALF + 0.75), 0.35, mid);
      levelGroup.add(rail);
    }
    // Lane dashes give a sense of speed.
    const dashCount = Math.floor(total / 6) * 2;
    const dashes = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.18, 0.02, 2.2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }),
      dashCount,
    );
    for (let i = 0; i < dashCount; i++) {
      dummy.position.set(i % 2 ? 1.7 : -1.7, 0.02, 28 - Math.floor(i / 2) * 6);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      dashes.setMatrixAt(i, dummy.matrix);
    }
    levelGroup.add(dashes);
    // Rail posts.
    const postCount = Math.floor(total / 12) * 2;
    const posts = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.5, 2.2, 0.5),
      new THREE.MeshLambertMaterial({ color: theme.rail }),
      postCount,
    );
    for (let i = 0; i < postCount; i++) {
      dummy.position.set((i % 2 ? 1 : -1) * (ROAD_HALF + 0.75), 1.1, 28 - Math.floor(i / 2) * 12);
      dummy.updateMatrix();
      posts.setMatrixAt(i, dummy.matrix);
    }
    levelGroup.add(posts);
    // Boss arena line.
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(ROAD_HALF * 2 + 1.4, 0.03, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    line.position.set(0, 0.02, -level.length);
    levelGroup.add(line);

    itemViews = level.items.map((it) => buildItem(it));
    boss = buildBoss(level.boss.big);
    levelGroup.add(boss.group);
    levelGroup.add(boss.hp.sprite);
    shownCount = 0;
    particles.length = 0;
    for (const n of numbers) { n.life = 0; n.label.sprite.visible = false; }
    beamLife = 0;
  }

  function buildItem(it) {
    const g = new THREE.Group();
    g.position.set(0, 0, -it.z);
    levelGroup.add(g);
    if (it.type === 'gates') {
      [[it.left, -1], [it.right, 1]].forEach(([gate, sx]) => {
        const good = gateIsGood(gate);
        const panel = new THREE.Mesh(
          new THREE.PlaneGeometry(ROAD_HALF - 0.3, 3.4),
          new THREE.MeshBasicMaterial({
            color: good ? COLORS.good : COLORS.bad, transparent: true, opacity: 0.5,
            side: THREE.DoubleSide, depthWrite: false,
          }),
        );
        panel.position.set((sx * ROAD_HALF) / 2, 1.9, 0);
        g.add(panel);
        const label = makeLabel(256, 128, 1.9);
        label.set(gateLabel(gate));
        label.sprite.position.set((sx * ROAD_HALF) / 2, 2.0, 0.1);
        g.add(label.sprite);
      });
      for (const px of [-ROAD_HALF, 0, ROAD_HALF]) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 3.9, 0.3),
          new THREE.MeshLambertMaterial({ color: 0x3a4250 }),
        );
        post.position.set(px, 1.95, 0);
        g.add(post);
      }
      return { group: g };
    }
    if (it.type === 'barrel') {
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(1, 1, 1.7, 14),
        new THREE.MeshLambertMaterial({ color: COLORS.barrel }),
      );
      body.position.set(it.x, 0.85, 0);
      g.add(body);
      for (const y of [0.4, 1.3]) {
        const band = new THREE.Mesh(
          new THREE.CylinderGeometry(1.04, 1.04, 0.14, 14),
          new THREE.MeshLambertMaterial({ color: 0x565c66 }),
        );
        band.position.set(it.x, y, 0);
        g.add(band);
      }
      const label = makeLabel(192, 96, 1.2);
      label.sprite.position.set(it.x, 2.5, 0);
      g.add(label.sprite);
      return { group: g, label, body };
    }
    if (it.type === 'crate') {
      const color = WEAPON_COLORS[it.weapon];
      const stand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.95, 1.1, 0.7, 16),
        new THREE.MeshLambertMaterial({ color: 0x2c3340 }),
      );
      stand.position.set(it.x, 0.35, 0);
      g.add(stand);
      const gun = new THREE.Group();
      const m = new THREE.MeshLambertMaterial({ color });
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.28, 0.28), m);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.6, 0.28), m);
      grip.position.set(-0.35, -0.35, 0);
      gun.add(barrel, grip);
      gun.position.set(it.x, 1.6, 0);
      g.add(gun);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.95, 0.07, 6, 24),
        new THREE.MeshBasicMaterial({ color }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(it.x, 0.75, 0);
      g.add(ring);
      const label = makeLabel(256, 128, 1.5);
      label.sprite.position.set(it.x, 3.0, 0);
      g.add(label.sprite);
      return { group: g, label, gun, name: WEAPONS[it.weapon].name };
    }
    return { group: g }; // squads have no static view
  }

  function place(mesh, i, x, y, z, s, ry = 0) {
    dummy.position.set(x, y, -z);
    dummy.rotation.set(0, ry, 0);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  function drawArmy(run, dt) {
    const want = Math.min(run.army, DRAW_CAP);
    shownCount += (want - shownCount) * Math.min(1, dt * 10);
    const n = Math.max(run.army > 0 ? 1 : 0, Math.min(DRAW_CAP, Math.round(shownCount)));
    const s = Math.max(1, 1.7 - n / 180);
    const spacing = 0.31 * s;
    const depth = Math.sqrt(n) * spacing * 1.25;
    crowdDepth = depth;
    const moving = run.phase === 'run';
    for (let i = 0; i < n; i++) {
      const f = formation[i];
      let x = run.x + f[0] * spacing * 0.9;
      x = Math.max(-ROAD_HALF, Math.min(ROAD_HALF, x));
      const z = run.z - depth + f[1] * spacing * 1.25;
      const bob = moving ? Math.abs(Math.sin(time * 11 + i * 1.7)) * 0.09 * s : 0;
      place(soldierBody, i, x, 0.32 * s + bob, z, s);
      place(soldierHat, i, x, 0.62 * s + bob, z, s);
    }
    soldierBody.count = soldierHat.count = n;
    soldierBody.instanceMatrix.needsUpdate = true;
    soldierHat.instanceMatrix.needsUpdate = true;
    armyLabel.sprite.visible = run.army > 0;
    armyLabel.set(formatCount(run.army));
    armyLabel.sprite.position.set(run.x, 1.5 * s + 0.5, -(run.z - depth));
  }

  function drawEnemies(run) {
    let n = 0;
    for (const e of run.enemies) {
      if (!e.alive || n >= ENEMY_CAP) continue;
      const bob = Math.abs(Math.sin(time * 9 + n)) * 0.08;
      place(enemyBody, n, e.x, 0.42 + bob, e.z, 1.3, Math.PI);
      place(enemyHat, n, e.x, 0.8 + bob, e.z, 1.3);
      n++;
    }
    enemyBody.count = enemyHat.count = n;
    enemyBody.instanceMatrix.needsUpdate = true;
    enemyHat.instanceMatrix.needsUpdate = true;
  }

  function drawBullets(run) {
    let n = 0;
    for (const b of run.bullets) {
      if (n >= BULLET_CAP) break;
      const big = b.kind === 'rocket' ? 2.4 : 1;
      dummy.position.set(b.x, 0.8, -b.z);
      dummy.rotation.set(0, Math.atan2(b.vx, b.vz), 0);
      dummy.scale.set(big, big, big * 3);
      dummy.updateMatrix();
      bullets.setMatrixAt(n, dummy.matrix);
      n++;
    }
    bullets.count = n;
    bullets.instanceMatrix.needsUpdate = true;
    bullets.material.color.copy(bulletColor.set(WEAPON_COLORS[run.weapon] || 0xffffff));
  }

  function drawItems(run) {
    for (let i = 0; i < run.items.length; i++) {
      const it = run.items[i];
      const view = itemViews[i];
      if (!view) continue;
      const far = it.z - run.z > 175 || it.z - run.z < -12;
      view.group.visible = it.alive && !far && it.type !== 'squad';
      if (!view.group.visible) continue;
      if (it.type === 'barrel') view.label.set(formatCount(Math.ceil(it.hp)));
      if (it.type === 'crate') {
        view.label.set(view.name + '\n' + formatCount(Math.ceil(it.hp)), '#fff3a8');
        view.gun.rotation.y = time * 2;
      }
    }
  }

  function drawBoss(run) {
    const b = run.boss;
    if (!b || !b.alive) {
      boss.group.visible = false;
      boss.hp.sprite.visible = false;
      return;
    }
    boss.group.visible = true;
    boss.hp.sprite.visible = true;
    const stomp = b.contact ? Math.sin(time * 14) : Math.sin(time * 5);
    boss.group.position.set(b.x, Math.abs(stomp) * 0.15, -b.z);
    boss.group.rotation.z = stomp * 0.04;
    boss.legL.position.z = stomp * 0.5;
    boss.legR.position.z = -stomp * 0.5;
    boss.armL.rotation.x = b.contact ? -1.2 + stomp * 0.5 : stomp * 0.4;
    boss.armR.rotation.x = b.contact ? -1.2 - stomp * 0.5 : -stomp * 0.4;
    boss.hp.set(formatCount(Math.ceil(b.hp)), '#ffd9d0');
    boss.hp.sprite.position.set(b.x, 7.4 * boss.scale, -b.z);
  }

  function drawEffects(dt) {
    // particles
    let n = 0;
    for (const p of particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= 18 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.1) { p.y = 0.1; p.vy *= -0.4; }
      if (n < PARTICLE_CAP) {
        dummy.position.set(p.x, p.y, -p.z);
        dummy.rotation.set(p.life * 9, p.life * 7, 0);
        dummy.scale.setScalar(Math.min(1, p.life * 3) * p.size);
        dummy.updateMatrix();
        particleMesh.setMatrixAt(n, dummy.matrix);
        particleMesh.setColorAt(n, particleColor.set(p.color));
        n++;
      }
    }
    if (particles.length > 0 && particles[0].life <= 0) {
      let w = 0;
      for (const p of particles) if (p.life > 0) particles[w++] = p;
      particles.length = w;
    }
    particleMesh.count = n;
    particleMesh.instanceMatrix.needsUpdate = true;
    if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;

    for (const num of numbers) {
      if (num.life <= 0) continue;
      num.life -= dt;
      num.label.sprite.position.y += dt * 2.2;
      num.label.material.opacity = Math.min(1, num.life * 3);
      if (num.life <= 0) num.label.sprite.visible = false;
    }

    if (beamLife > 0) {
      beamLife -= dt;
      beamMesh.material.opacity = Math.max(0, beamLife / 0.09) * 0.85;
      if (beamLife <= 0) beamMesh.visible = false;
    }
  }

  function draw(run, dt) {
    time += dt;
    drawArmy(run, dt);
    drawEnemies(run);
    drawBullets(run);
    drawItems(run);
    drawBoss(run);
    drawEffects(dt);

    shakeAmount = Math.max(0, shakeAmount - dt * 2.5);
    const sx = (Math.random() - 0.5) * shakeAmount;
    const sy = (Math.random() - 0.5) * shakeAmount;
    const bossView = run.phase === 'boss' || run.phase === 'won';
    // Frame the whole crowd: follow its centre and pull back as it grows.
    const camX = run.x * 0.7;
    const focusZ = run.z - crowdDepth * 0.55;
    const back = (bossView ? 12 : 9.5) + crowdDepth * 0.9;
    const up = (bossView ? 11.5 : 10.5) + crowdDepth * 0.55;
    dummy.position.set(camX + sx, up + sy, -(focusZ - back));
    camera.position.lerp(dummy.position, Math.min(1, dt * 5));
    camera.position.z = -(focusZ - (camera.position.y - sy) * (back / up));
    camera.lookAt(camera.position.x - sx, 0.5, -(focusZ + (bossView ? 10 : 8) + crowdDepth * 0.3));
    gl.render(scene, camera);
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    gl.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep the road's width in view on narrow portrait screens.
    camera.fov = w / h < 0.75 ? 62 : 48;
    camera.updateProjectionMatrix();
  }

  function burst(x, z, color, count = 8, power = 1) {
    for (let i = 0; i < count; i++) {
      if (particles.length >= PARTICLE_CAP) break;
      const a = Math.random() * Math.PI * 2;
      const sp = (2 + Math.random() * 4) * power;
      particles.push({
        x, y: 0.6 + Math.random() * 0.6, z,
        vx: Math.cos(a) * sp, vy: 4 + Math.random() * 5 * power, vz: Math.sin(a) * sp,
        life: 0.5 + Math.random() * 0.5, color, size: 0.8 + Math.random() * 0.9,
      });
    }
  }

  function popNumber(x, z, text, color = '#ffffff', y = 2.2, size = 1) {
    const num = numbers[numberCursor];
    numberCursor = (numberCursor + 1) % NUMBER_POOL;
    num.life = 0.7;
    num.label.set(text, color);
    num.label.sprite.visible = true;
    num.label.sprite.scale.set(2.64 * size, 1.1 * size, 1);
    num.label.sprite.position.set(x + (Math.random() - 0.5) * 0.8, y, -z);
    num.label.material.opacity = 1;
  }

  function beam(x, z, range) {
    beamMesh.visible = true;
    beamMesh.scale.set(1, 1, range);
    beamMesh.position.set(x, 0.8, -(z + range / 2));
    beamLife = 0.09;
  }

  resize();
  return {
    ok: true,
    setLevel,
    draw,
    resize,
    burst,
    popNumber,
    beam,
    shake(amount) { shakeAmount = Math.min(1.2, Math.max(shakeAmount, amount)); },
  };
}
