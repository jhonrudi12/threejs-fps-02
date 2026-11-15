// One place for all game state: rounds, score, economy, bomb, grenades.
// No rendering here, no DOM — main.js reads this and pushes it to the HUD.
// Round flow: buy (15 s) -> play (100 s) -> end (5 s) -> next buy.
// First to 5 round wins takes the match; attackers plant, defenders defuse.
import * as THREE from 'three';
import { WEAPONS, GRENADES } from './weapons.js';

export const ROUND_TIME = 100, BUY_TIME = 15, BOMB_TIME = 35, WIN_ROUNDS = 5;
export const PRICES = { win: 3250, loss: 1900, kill: 300, plant: 300 };

export function createSim() {
  const state = {
    phase: 'buy', round: 1, score: { atk: 0, def: 0 }, money: 800,
    timeLeft: BUY_TIME, winner: null, winReason: '', matchOver: false,
    bomb: { planted: false, site: null, x: 0, z: 0, timer: BOMB_TIME, plant: 0, defuse: 0, planter: null },
    loadout: { owned: ['pistol'], current: 'pistol', mags: {}, grenades: { frag: 0, smoke: 0 } },
    kills: 0, deaths: 0, feed: [],
    smokes: [], // {x,y,z,r,left,mesh}
    grenades: [], // {pos,vel,kind,fuse}
  };
  for (const k of Object.keys(WEAPONS)) state.loadout.mags[k] = { mag: WEAPONS[k].mag, reserve: WEAPONS[k].reserve };
  state.loadout.mags.pistol = { mag: 12, reserve: 36 };

  function resetLoadoutAmmo() {
    for (const k of Object.keys(WEAPONS)) {
      const m = state.loadout.mags[k];
      m.mag = WEAPONS[k].mag; m.reserve = WEAPONS[k].reserve;
    }
  }
  function buy(id) {
    const w = WEAPONS[id]; if (!w || state.phase !== 'buy') return false;
    if (state.loadout.owned.includes(id)) { state.loadout.current = id; return true; }
    if (state.money < w.price) return false;
    state.money -= w.price; state.loadout.owned.push(id); state.loadout.current = id;
    return true;
  }
  function buyGrenade(kind) {
    if (state.phase !== 'buy' || state.money < GRENADES[kind].price) return false;
    if (state.loadout.grenades[kind] >= 2) return false;
    state.money -= GRENADES[kind].price; state.loadout.grenades[kind]++;
    return true;
  }
  function startRound() {
    state.phase = 'play'; state.timeLeft = ROUND_TIME;
    state.bomb = { planted: false, site: null, x: 0, z: 0, timer: BOMB_TIME, plant: 0, defuse: 0, planter: null };
    resetLoadoutAmmo();
  }
  function startBuy() {
    state.phase = 'buy'; state.timeLeft = BUY_TIME;
    if (state.round > 1) state.loadout.grenades = { frag: 0, smoke: 0 };
  }
  function endRound(winner, reason) {
    if (state.phase === 'end') return;
    state.phase = 'end'; state.winner = winner; state.winReason = reason; state.timeLeft = 5;
    state.score[winner]++;
    state.money += winner === 'atk' ? PRICES.win : PRICES.loss;
    if (state.score.atk >= WIN_ROUNDS || state.score.def >= WIN_ROUNDS) state.matchOver = true;
  }
  function nextRound() {
    if (state.matchOver) { state.round = 1; state.score = { atk: 0, def: 0 }; state.money = 800; state.matchOver = false; state.loadout.owned = ['pistol']; state.loadout.current = 'pistol'; }
    else state.round++;
    startBuy();
  }
  function addFeed(text) { state.feed.unshift(text); if (state.feed.length > 5) state.feed.pop(); }
  function step(dt, events) {
    state.timeLeft -= dt;
    if (state.phase === 'buy' && state.timeLeft <= 0) startRound();
    else if (state.phase === 'play' && state.timeLeft <= 0) endRound('def', 'Time expired — site held');
    else if (state.phase === 'end' && state.timeLeft <= 0) nextRound();
    if (state.bomb.planted) {
      state.bomb.timer -= dt;
      if (state.bomb.timer <= 0) endRound('atk', 'Charge detonated');
    }
    for (const s of state.smokes) s.left -= dt;
    state.smokes = state.smokes.filter((s) => s.left > 0);
    // Grenade physics: gravity, ground bounce, fuse.
    for (const g of state.grenades) {
      g.vel.y -= 14 * dt;
      g.pos.addScaledVector(g.vel, dt);
      if (g.pos.y < 0.12) { g.pos.y = 0.12; g.vel.y *= -0.35; g.vel.x *= 0.7; g.vel.z *= 0.7; }
      g.fuse -= dt;
      if (g.fuse <= 0) events.onGrenade(g);
    }
    state.grenades = state.grenades.filter((g) => g.fuse > 0);
  }
  return {
    state, buy, buyGrenade, startRound, startBuy, endRound, nextRound, addFeed, step,
    throwGrenade(kind, from, dir) {
      if (state.loadout.grenades[kind] <= 0 || state.phase !== 'play') return false;
      state.loadout.grenades[kind]--;
      state.grenades.push({ pos: from.clone(), vel: dir.clone().multiplyScalar(16).add(new THREE.Vector3(0, 5, 0)), kind, fuse: kind === 'frag' ? 1.6 : 1.2 });
      return true;
    },
    addSmoke(x, y, z) { state.smokes.push({ x, y, z, r: 3.4, left: 15 }); },
  };
}
