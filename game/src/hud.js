// The DOM HUD: crosshair, hit marker, health/ammo/timer/score/money,
// alive counts, bomb status, kill feed, buy menu and round-end panel.
// It never touches the simulation; main.js pushes numbers in.
import { WEAPONS, GRENADES, BUY_ORDER } from './weapons.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const el = {
    overlay: $('overlay'), title: $('overlay-title'), copy: $('overlay-copy'), play: $('play'),
    buy: $('buy'), buyList: $('buy-list'), buyMoney: $('buy-money'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'), ammo: $('ammo'), ammoName: $('ammo-name'),
    hp: $('hp-val'), hpBar: $('hp-bar'), timer: $('timer'), score: $('score'),
    money: $('money'), alive: $('alive'), bomb: $('bomb'), feed: $('feed'),
    hit: $('hitmarker'), cross: $('crosshair'), round: $('round'),
    endTitle: $('end-title'), endCopy: $('end-copy'),
  };
  let hitTimer = 0, last = {};
  function setText(node, key, v) { if (last[key] !== v) { last[key] = v; node.textContent = v; } }
  const hud = {
    setAmmo(mag, reserve, name) {
      setText(el.ammoMag, 'mag', String(mag)); setText(el.ammoReserve, 'res', `/ ${reserve}`);
      setText(el.ammoName, 'wname', name); el.ammo.classList.toggle('empty', mag === 0);
    },
    setHealth(hp) {
      setText(el.hp, 'hp', String(Math.max(0, Math.ceil(hp))));
      el.hpBar.style.width = `${Math.max(0, hp)}%`;
      el.hpBar.classList.toggle('low', hp <= 30);
    },
    setTimer(sec, phase) {
      const s = Math.max(0, Math.ceil(sec));
      setText(el.timer, 't', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      el.timer.classList.toggle('urgent', phase === 'play' && sec <= 15);
    },
    setScore(atk, def, round) {
      setText(el.score, 'sc', `HARBOUR ${atk} — ${def} DOCK`);
      setText(el.round, 'rd', `ROUND ${round}`);
    },
    setMoney(m) { setText(el.money, 'm', `$${m}`); setText(el.buyMoney, 'bm', `$${m}`); },
    setAlive(atk, def) { setText(el.alive, 'al', `YOU ${atk} · ENEMY ${def}`); },
    setBomb(text, cls) { setText(el.bomb, 'b', text); el.bomb.className = cls || ''; },
    setCrosshair(spreadPx) {
      const g = Math.round(4 + spreadPx);
      el.cross.style.setProperty('--gap', `${g}px`);
    },
    hitMarker(killed, holdMs = 90) {
      el.hit.classList.add('on'); el.hit.classList.toggle('kill', !!killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => el.hit.classList.remove('on', 'kill'), holdMs);
    },
    feed(text) {
      const div = document.createElement('div'); div.textContent = text;
      el.feed.prepend(div);
      while (el.feed.children.length > 5) el.feed.lastChild.remove();
      setTimeout(() => div.remove(), 6000);
    },
    showOverlay(mode, data) {
      el.buy.hidden = true;
      if (mode === 'start') {
        el.title.textContent = 'HARBOUR LINE';
        el.copy.textContent = 'A dusk container yard. Two sites, one charge. Click to play — attackers plant, defenders defuse.';
        el.play.textContent = 'Click to play'; el.overlay.hidden = false;
      } else if (mode === 'paused') {
        el.title.textContent = 'Paused'; el.copy.textContent = 'Click to resume the round.';
        el.play.textContent = 'Resume'; el.overlay.hidden = false;
      } else if (mode === 'end') {
        el.title.textContent = data.title; el.copy.textContent = data.copy;
        el.play.textContent = data.action; el.overlay.hidden = false;
      }
    },
    hideOverlay() { el.overlay.hidden = true; el.buy.hidden = true; },
    showBuy(money, owned, current, onBuy) {
      el.overlay.hidden = true; el.buy.hidden = false;
      el.buyList.innerHTML = '';
      const rows = [];
      for (const id of BUY_ORDER) {
        const w = WEAPONS[id];
        const has = owned.includes(id);
        rows.push({ id, label: `${w.name} — ${w.damage} dmg · ${w.mag} rnd`, price: has ? (current === id ? 'EQUIPPED' : 'OWNED') : `$${w.price}`, key: BUY_ORDER.indexOf(id) + 1 });
      }
      rows.push({ id: 'frag', label: `${GRENADES.frag.name} — area damage`, price: `$${GRENADES.frag.price}`, key: 5 });
      rows.push({ id: 'smoke', label: `${GRENADES.smoke.name} — blocks sight`, price: `$${GRENADES.smoke.price}`, key: 6 });
      for (const r of rows) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'buy-row';
        b.innerHTML = `<span class="buy-key">${r.key}</span><span>${r.label}</span><b>${r.price}</b>`;
        b.addEventListener('click', () => onBuy(r.id));
        el.buyList.appendChild(b);
      }
      this.setMoney(money);
    },
    hideBuy() { el.buy.hidden = true; },
    onPlay(h) { el.play.addEventListener('click', h); },
    onBuyKey(h) { el._buyKey = h; },
    buyKey(id) { if (el._buyKey) el._buyKey(id); },
  };
  return hud;
}
