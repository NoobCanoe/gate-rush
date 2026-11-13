// Menus and HUD, as DOM overlays on top of the game canvas.
import {
  WEAPONS, UPGRADES, upgradeCost, unlockedWeapons, startArmy, formatCount,
} from './rules.js';

const WEAPON_BLURB = {
  rifle: 'Steady and reliable.',
  mg: 'A storm of fast shots.',
  shotgun: 'A wide blast that shreds squads up close.',
  rocket: 'Slow, but the explosion hits everything nearby.',
  laser: 'A beam that cuts through every target in line.',
};

const ICON_SOUND_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';
const ICON_SOUND_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm18.3-.3-1.4-1.4L17 10.2l-2.9-2.9-1.4 1.4 2.9 2.9-2.9 2.9 1.4 1.4 2.9-2.9 2.9 2.9 1.4-1.4-2.9-2.9 2.9-2.9z"/></svg>';

const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const hasProgress = (save) => save.level > 1 || save.lineLevel > 1 || save.coins > 0
  || Object.values(save.upgrades).some((v) => v > 0) || Object.keys(save.weaponLevels).length > 0;

export function createUI(root, handlers) {
  root.innerHTML = `
    <div class="hud" hidden>
      <div class="hud-row">
        <div class="pill" data-hud="level"></div>
        <div class="pill coin-pill"><span class="coin"></span><span data-hud="coins">0</span></div>
        <span class="hud-buttons">
          <button class="icon-btn" data-action="pause" aria-label="Pause">${ICON_PAUSE}</button>
          <button class="icon-btn" data-action="mute" aria-label="Sound"></button>
        </span>
      </div>
      <div class="bar"><div class="bar-fill" data-hud="bar"></div></div>
      <div class="pill weapon-pill" data-hud="weapon"></div>
      <div class="tip" data-hud="tip" hidden></div>
    </div>
    <div class="screen" hidden></div>`;
  const hud = root.querySelector('.hud');
  const screen = root.querySelector('.screen');
  const el = (name) => root.querySelector(`[data-hud="${name}"]`);
  const muteBtn = root.querySelector('[data-action="mute"]');
  let onCard = null;
  const shown = {};

  const setText = (name, text) => {
    if (shown[name] === text) return;
    shown[name] = text;
    el(name).textContent = text;
  };

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    const action = btn.dataset.action;
    if (action === 'mute') handlers.onToggleMute();
    else if (action === 'play') handlers.onPlay(btn.dataset.mode || undefined);
    else if (action === 'shop') handlers.onShop();
    else if (action === 'continue') handlers.onContinue();
    else if (action === 'pause') handlers.onPause();
    else if (action === 'resume') handlers.onResume();
    else if (action === 'restart') handlers.onRestart();
    else if (action === 'quit') handlers.onQuit();
    else if (action === 'ask-reset') handlers.onAskReset();
    else if (action === 'reset') handlers.onReset();
    else if (action === 'title') handlers.onTitle();
    else if (action === 'buy') handlers.onBuy(btn.dataset.kind, btn.dataset.weapon || undefined);
    else if (action === 'card' && onCard) { const done = onCard; onCard = null; done(); }
  });

  function setScreen(html, kind) {
    screen.className = 'screen ' + kind;
    screen.innerHTML = html;
    screen.hidden = false;
  }

  function shopRows(save) {
    const row = (kind, weaponId, name, effect, level) => {
      const cost = upgradeCost(kind, level);
      const can = save.coins >= cost;
      return `<button class="row${can ? '' : ' dim'}" data-action="buy" data-kind="${kind}"${weaponId ? ` data-weapon="${weaponId}"` : ''}${can ? '' : ' disabled'}>
        <span class="row-text"><b>${esc(name)}</b><small>${esc(effect)}</small></span>
        <span class="row-cost"><span class="coin"></span>${formatCount(cost)}</span>
      </button>`;
    };
    const u = save.upgrades;
    let html = '';
    html += row('army', null, UPGRADES.army.name, `Start with ${startArmy(save)} soldiers → ${startArmy(save) + 2}`, u.army);
    html += row('fireRate', null, UPGRADES.fireRate.name, `+${u.fireRate * 8}% → +${(u.fireRate + 1) * 8}%`, u.fireRate);
    html += row('damage', null, UPGRADES.damage.name, `+${u.damage * 10}% → +${(u.damage + 1) * 10}%`, u.damage);
    html += row('coins', null, UPGRADES.coins.name, `+${u.coins * 10}% → +${(u.coins + 1) * 10}%`, u.coins);
    for (const id of unlockedWeapons(save.level)) {
      const lv = save.weaponLevels[id] || 0;
      html += row('weapon', id, `${WEAPONS[id].name} power`, `Level ${lv + 1} → ${lv + 2} (+15% damage)`, lv);
    }
    return html;
  }

  const ui = {
    setMuted(muted) {
      muteBtn.innerHTML = muted ? ICON_SOUND_OFF : ICON_SOUND_ON;
      muteBtn.setAttribute('aria-label', muted ? 'Turn sound on' : 'Turn sound off');
    },

    showTitle(save) {
      hud.hidden = true;
      setScreen(`
        <h1 class="logo">GATE<br>RUSH</h1>
        <button class="btn primary mode" data-action="play" data-mode="rush">
          <b>Gate Rush</b><small>Level ${save.level} · run the road and pick the better gate</small>
        </button>
        <button class="btn primary mode alt" data-action="play" data-mode="line">
          <b>Hold the Line</b><small>Level ${save.lineLevel} · stand your ground: soldiers or firepower?</small>
        </button>
        ${hasProgress(save) ? '<button class="btn" data-action="shop">Upgrades</button>' : ''}
        ${hasProgress(save) ? '<button class="link" data-action="ask-reset">Start over</button>' : ''}`, 'title');
    },

    // Shown over a frozen run. The HUD stays visible behind it.
    showPause(levelNumber) {
      setScreen(`
        <h2>Paused</h2>
        <p class="sub">Level ${levelNumber}</p>
        <button class="btn primary" data-action="resume">Resume</button>
        <button class="btn" data-action="restart">Restart level</button>
        <button class="btn" data-action="quit">Quit to upgrades</button>
        <p class="hint">Restarting or quitting gives up the coins from this attempt.</p>`, 'pause');
    },

    hidePause() {
      screen.hidden = true;
      screen.innerHTML = '';
    },

    showConfirmReset(save) {
      hud.hidden = true;
      setScreen(`
        <h2>Start over?</h2>
        <p class="hint">This erases your ${formatCount(save.coins)} coins, all upgrades and your progress in both modes (levels ${save.level} and ${save.lineLevel}). It can't be undone.</p>
        <button class="btn danger" data-action="reset">Erase everything</button>
        <button class="btn primary" data-action="title">Keep playing</button>`, 'confirm');
    },

    showShop(save, playLevel = save.level, modeName = 'Gate Rush') {
      hud.hidden = true;
      const list = screen.querySelector('.rows');
      const scroll = list ? list.scrollTop : 0;
      setScreen(`
        <h2>Upgrades</h2>
        <div class="wallet"><span class="coin"></span>${formatCount(save.coins)}</div>
        <div class="rows">${shopRows(save)}</div>
        <button class="btn primary" data-action="play">Play level ${playLevel}</button>
        <button class="link" data-action="title">${esc(modeName)} · change mode</button>`, 'shop');
      screen.querySelector('.rows').scrollTop = scroll;
    },

    showResult(result, save, levelNumber) {
      hud.hidden = true;
      const stats = `
        <div class="stats">
          <div><span>Coins earned</span><b><span class="coin"></span>${formatCount(result.coins)}</b></div>
          <div><span>Enemies defeated</span><b>${formatCount(result.kills)}</b></div>
          ${result.won ? `<div><span>Army left</span><b>${formatCount(result.armyLeft)}</b></div>` : ''}
        </div>`;
      if (result.won) {
        setScreen(`<h2>Level ${levelNumber} cleared!</h2>${stats}
          <button class="btn primary" data-action="continue">Continue</button>`, 'result win');
      } else {
        setScreen(`<h2>So close!</h2><p class="sub">You keep your coins.</p>${stats}
          <button class="btn primary" data-action="play">Try again</button>
          <button class="btn" data-action="shop">Upgrades</button>`, 'result lose');
      }
    },

    showNewWeapon(weaponId, onDone) {
      hud.hidden = true;
      onCard = onDone;
      setScreen(`
        <p class="sub">New weapon!</p>
        <h2 class="weapon-name">${esc(WEAPONS[weaponId].name)}</h2>
        <p class="hint">${esc(WEAPON_BLURB[weaponId])}<br>Shoot its container open on the road to pick it up.</p>
        <button class="btn primary" data-action="card">Continue</button>`, 'card');
    },

    showHud(run) {
      screen.hidden = true;
      screen.innerHTML = '';
      hud.hidden = false;
      ui.showTip('');
      ui.updateHud(run);
    },

    // A short instruction under the HUD; fades out after a few seconds.
    showTip(text) {
      const tip = el('tip');
      tip.hidden = !text;
      tip.textContent = text;
      if (text) {
        tip.style.animation = 'none';
        void tip.offsetWidth; // restart the fade
        tip.style.animation = '';
      }
    },

    updateHud(run) {
      setText('level', `LEVEL ${run.level.number}`);
      setText('coins', formatCount(run.coins));
      setText('weapon', WEAPONS[run.weapon].name + ' ' + '★'.repeat(run.tier));
      const bar = el('bar');
      const bossing = run.boss && (run.phase === 'boss' || run.phase === 'won');
      const frac = bossing ? Math.max(0, run.boss.hp / run.boss.maxHp) : Math.min(1, run.z / run.level.length);
      const key = (bossing ? 'b' : 'r') + Math.round(frac * 200);
      if (shown.bar !== key) {
        shown.bar = key;
        bar.style.transform = `scaleX(${frac})`;
        bar.classList.toggle('boss', !!bossing);
      }
    },

    showMessage(text) {
      hud.hidden = true;
      setScreen(`<p class="hint">${esc(text)}</p>`, 'title');
    },

    hide() {
      hud.hidden = true;
      screen.hidden = true;
    },
  };
  return ui;
}
