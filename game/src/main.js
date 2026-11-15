// Harbour Line — boot, fixed-step loop, shooting, bomb, grenades, rounds.
// The simulation (sim.js + bots.js) owns the rules; this file owns the
// renderer, the raycasts and the DOM. ?shot=start|play|end&seed=N renders a
// composed frame without pointer lock and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE, mulberry32 } from './palette.js';
import { createWorld, SITES, SPAWNS, nearestWaypoint } from './world.js';
import { createPlayer } from './player.js';
import { createInput } from './input.js';
import { createViewModel, WEAPONS } from './weapons.js';
import { createBots } from './bots.js';
import { createHud } from './hud.js';
import { createSim, ROUND_TIME } from './sim.js';
import { createAudio } from './audio.js';

const FIXED = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;
const rnd = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 30, 85);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const sim = createSim();
const hud = createHud();
const audio = createAudio();
const input = createInput(renderer.domElement, onLockChange);
const player = createPlayer(world.colliders, SPAWNS.atk[0]);
const view = createViewModel(camera);
const bots = createBots(scene, world.colliders, world.shootables, {});
const raycaster = new THREE.Raycaster(); raycaster.far = 120;
const _dir = new THREE.Vector3(), _from = new THREE.Vector3(), _tmp = new THREE.Vector3();
const smokeMat = new THREE.MeshBasicMaterial({ color: 0xcfd8d8, transparent: true, opacity: 0.55, depthWrite: false });
const smokeMeshes = [];

let hp = 100, playerDead = false, frozen = false, started = false;
let plantHold = 0, elapsed = 0, accumulator = 0, lastTime = performance.now();
let current = 'rifle';
sim.state.loadout.owned = ['pistol', 'rifle'];
sim.state.loadout.current = 'rifle';
sim.state.money = 800;

const playerTarget = { alive: true, pos: player.state.position, isPlayer: true };
function enemiesOf(bot) {
  const list = [];
  if (bot.team === 'atk') { for (const b of bots.bots) if (b.team === 'def') list.push(b); list.push(playerTarget); }
  else { for (const b of bots.bots) if (b.team === 'atk') list.push(b); list.push(playerTarget); }
  return list;
}
function botPosOf(e) { return e.isPlayer ? player.state.position : e.pos; }

function spawnRound() {
  const atkSites = [10, 11, 10], defSites = [10, 11, 12, 13];
  bots.spawnTeams(rnd, atkSites, defSites);
  player.reset(SPAWNS.atk[0]);
  hp = 100; playerDead = false; playerTarget.alive = true; plantHold = 0;
  view.setWeapon(current);
  syncHud();
}
spawnRound();

function syncHud() {
  const s = sim.state, m = s.loadout.mags[current];
  hud.setAmmo(m.mag, m.reserve, WEAPONS[current].name);
  hud.setHealth(hp); hud.setTimer(s.timeLeft, s.phase);
  hud.setScore(s.score.atk, s.score.def, s.round);
  hud.setMoney(s.money);
  hud.setAlive(bots.aliveCount('atk') + (playerDead ? 0 : 1), bots.aliveCount('def'));
  const b = s.bomb;
  if (b.planted) hud.setBomb(`CHARGE PLANTED — ${Math.ceil(b.timer)}s · defuse in progress ${Math.round(b.defuse * 20)}%`, 'defuse');
  else if (s.phase === 'play') hud.setBomb(plantHold > 0 ? `PLANTING ${Math.round(plantHold / 3 * 100)}% — hold E` : 'PLANT AT CRANE DOCK (A) OR WAREHOUSE (B)');
  else hud.setBomb('');
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) { started = true; audio.unlock(); hud.hideOverlay(); hud.hideBuy(); }
  else if (sim.state.phase === 'buy') hud.showBuy(sim.state.money, sim.state.loadout.owned, current, onBuy);
  else if (!sim.state.matchOver && sim.state.phase !== 'end') hud.showOverlay(started ? 'paused' : 'start');
}
hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (sim.state.phase === 'end' || sim.state.matchOver) { sim.nextRound(); spawnRound(); }
  input.requestLock();
});
function onBuy(id) {
  const s = sim.state;
  if (id === 'frag' || id === 'smoke') { if (sim.buyGrenade(id)) audio.reload(); }
  else if (sim.buy(id)) { current = id; view.setWeapon(id); audio.reload(); }
  hud.showBuy(s.money, s.loadout.owned, current, onBuy);
  syncHud();
}
hud.onBuyKey(onBuy);

function shoot() {
  const w = WEAPONS[current], m = sim.state.loadout.mags[current];
  if (view.state.cooldown > 0 || view.state.reloadLeft > 0 || m.mag <= 0) { if (m.mag <= 0) audio.dry(); return; }
  m.mag--; view.state.cooldown = w.gap; view.pullTrigger(); audio.shot(w.kind);
  camera.getWorldDirection(_dir);
  const spread = w.spread + Math.min(1, player.groundSpeed() / 5.4) * w.moveSpread + (player.state.crouching ? -0.001 : 0);
  _dir.x += (rnd() * 2 - 1) * spread; _dir.y += (rnd() * 2 - 1) * spread; _dir.z += (rnd() * 2 - 1) * spread;
  _dir.normalize();
  scene.updateMatrixWorld(true);
  raycaster.far = w.range; // bot fire shrinks the shared raycaster's far; restore it
  raycaster.set(camera.position, _dir);
  const targets = world.shootables.concat(bots.hitMeshes());
  const hit = raycaster.intersectObjects(targets, false)[0];
  bots.hear(player.state.position.x, player.state.position.z, elapsed);
  // A smoke cloud between muzzle and target swallows the shot.
  let smoked = false;
  if (hit) for (const s of sim.state.smokes) {
    _tmp.set(s.x - camera.position.x, s.y - camera.position.y, s.z - camera.position.z);
    const t = _tmp.dot(_dir);
    if (t > 0 && t < hit.distance) {
      const px = _tmp.x - _dir.x * t, py = _tmp.y - _dir.y * t, pz = _tmp.z - _dir.z * t;
      if (px * px + py * py + pz * pz < s.r * s.r) { smoked = true; break; }
    }
  }
  if (hit && !smoked && hit.object.userData.bot) {
    const bot = hit.object.userData.bot;
    const head = hit.object.userData.part === 'head';
    const dmg = Math.round(w.damage * (head ? w.headMul : 1));
    const killed = bots.damage(bot, dmg, head);
    hud.hitMarker(killed, shot ? 4000 : 120); audio.hit();
    if (killed) {
      sim.state.kills++; sim.state.money += 300;
      sim.addFeed(`You eliminated an enemy (+$300)`);
      hud.feed(`You eliminated an enemy · +$300`); audio.kill();
    }
  }
  player.recoil(w.recoil * (0.8 + rnd() * 0.5), (rnd() * 2 - 1) * w.recoil * 0.4);
  syncHud();
}
function reload() {
  const w = WEAPONS[current], m = sim.state.loadout.mags[current];
  if (view.state.reloadLeft > 0 || m.mag === w.mag || m.reserve === 0) return;
  view.startReload(w.reload); audio.reload();
  const need = w.mag - m.mag, take = Math.min(need, m.reserve);
  setTimeout(() => { m.mag += take; m.reserve -= take; syncHud(); }, w.reload * 1000);
}
// Grenade detonation: frag damages by distance, smoke lays a sight-blocking cloud.
function onGrenade(g) {
  if (g.kind === 'frag') {
    audio.boom();
    const flash = new THREE.PointLight(0xffaa33, 60, 18, 1.6);
    flash.position.copy(g.pos); scene.add(flash);
    setTimeout(() => scene.remove(flash), 180);
    const hurt = (pos, hpObj, isPlayer) => {
      const d = Math.hypot(pos.x - g.pos.x, pos.z - g.pos.z) + Math.abs((pos.y || 0) - g.pos.y) * 0.5;
      if (d > 7) return;
      const dmg = Math.round(95 * (1 - d / 7));
      if (isPlayer) damagePlayer(dmg, null); else if (bots.damage(hpObj, dmg, false)) { sim.state.money += 300; hud.feed('Frag eliminated an enemy · +$300'); }
    };
    for (const b of bots.bots) if (b.alive) hurt(b.pos, b, false);
    hurt(player.state.position, null, true);
  } else {
    sim.addSmoke(g.pos.x, Math.max(1, g.pos.y), g.pos.z);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(3.4, 18, 12), smokeMat);
    mesh.position.set(g.pos.x, Math.max(1.2, g.pos.y), g.pos.z); scene.add(mesh); smokeMeshes.push(mesh);
  }
}
function damagePlayer(amount, fromBot) {
  if (playerDead || sim.state.phase !== 'play') return;
  hp -= amount; audio.hurt(); syncHud();
  if (hp <= 0) {
    hp = 0; playerDead = true; playerTarget.alive = false;
    hud.feed('You were eliminated'); syncHud();
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
// Bot fire: a ray from the bot; a wall stops it, otherwise a hit chance that
// falls with distance and rises if the target stands still.
function botShoot(bot, origin, dir, dist) {
  const foe = bot.target; if (!foe) return;
  raycaster.set(origin, dir); raycaster.far = dist + 2;
  if (raycaster.intersectObjects(world.shootables, false).length) return;
  const foePos = botPosOf(foe);
  const moving = foe.isPlayer ? player.groundSpeed() : 3;
  let p = Math.max(0.06, 0.5 - dist * 0.011 - moving * 0.03);
  if (foe.isPlayer && player.state.crouching) p *= 0.7;
  if (Math.random() < p) {
    const dmg = 9 + Math.floor(Math.random() * 7);
    if (foe.isPlayer) damagePlayer(dmg, bot);
    else if (bots.damage(foe, dmg, false)) {
      sim.addFeed(`${foe.team === 'atk' ? 'Teammate' : 'Enemy'} down`);
      hud.feed(foe.team === 'atk' ? 'A teammate was eliminated' : 'A teammate eliminated an enemy');
    }
  }
}

const botCtx = {
  enemiesOf,
  bomb: sim.state.bomb,
  bombSite: null,
  plantAllowed: (bot) => !sim.state.bomb.planted && sim.state.phase === 'play',
  plantProgress: (p) => { sim.state.bomb.plant = p; },
  onPlanted: (bot, site) => {
    const s = sim.state;
    s.bomb.planted = true; s.bomb.site = site.name; s.bomb.x = site.x; s.bomb.z = site.z; s.bomb.timer = 35; s.bomb.planter = bot;
    s.money += 300; hud.feed('Charge planted at ' + site.name + ' · +$300'); audio.beep(); syncHud();
  },
  defuseProgress: (p) => { sim.state.bomb.defuse = p; },
  onDefused: () => { sim.endRound('def', 'Charge defused'); hud.feed('The charge was defused'); },
  botShoot,
};
function nearestSite(x, z) {
  const da = Math.hypot(x - SITES.A.x, z - SITES.A.z), db = Math.hypot(x - SITES.B.x, z - SITES.B.z);
  return da < db ? SITES.A : SITES.B;
}
function step(dt) {
  elapsed += dt;
  const s = sim.state;
  const prevPhase = s.phase;
  sim.step(dt, { onGrenade });
  botCtx.bomb = s.bomb;
  botCtx.smoke = s.smokes;
  if (s.phase !== prevPhase) {
    if (s.phase === 'play') { audio.round(); if (!shot) hud.hideBuy(); }
    if (s.phase === 'buy') { spawnRound(); if (!shot) hud.showBuy(s.money, s.loadout.owned, current, onBuy); }
    if (s.phase === 'end') {
      const won = s.winner === 'atk';
      if (!shot) hud.showOverlay('end', { title: won ? 'ROUND WON' : 'ROUND LOST', copy: `${s.winReason}. Harbour ${s.score.atk} — ${s.score.def} Dock. ${s.matchOver ? 'Match over — click to play again.' : 'Next buy phase in a moment.'}`, action: s.matchOver ? 'Play again' : 'Continue' });
      if (document.pointerLockElement) document.exitPointerLock();
      audio.round();
    }
  }
  if (s.phase === 'play' && !playerDead) {
    player.step(dt, input.state.keys);
    // Plant: hold E inside a site.
    const site = nearestSite(player.state.position.x, player.state.position.z);
    const inSite = Math.hypot(player.state.position.x - site.x, player.state.position.z - site.z) < site.r;
    if (input.state.keys.has('KeyE') && inSite && !s.bomb.planted) {
      plantHold += dt;
      if (plantHold >= 3) {
        s.bomb.planted = true; s.bomb.site = site.name; s.bomb.x = site.x; s.bomb.z = site.z; s.bomb.timer = 35;
        s.money += 300; hud.feed(`You planted at ${site.name} · +$300`); audio.beep(); plantHold = 0;
      }
    } else plantHold = Math.max(0, plantHold - dt * 2);
    // Attacker bots push toward the nearer site; defenders hold theirs.
    const atkBots = bots.bots.filter((b) => b.alive && b.team === 'atk');
    botCtx.bombSite = atkBots.length ? nearestSite(atkBots[0].pos.x, atkBots[0].pos.z) : site;
  }
  view.step(dt);
  bots.step(dt, elapsed, botCtx);
  // Smoke expiry removes its mesh.
  for (let i = smokeMeshes.length - 1; i >= 0; i--) {
    const mesh = smokeMeshes[i];
    const alive = s.smokes.some((sm) => Math.abs(sm.x - mesh.position.x) < 0.1 && Math.abs(sm.z - mesh.position.z) < 0.1);
    if (!alive) { scene.remove(mesh); smokeMeshes.splice(i, 1); }
  }
  // Round end by elimination.
  if (s.phase === 'play') {
    const atkAlive = bots.aliveCount('atk') + (playerDead ? 0 : 1);
    const defAlive = bots.aliveCount('def');
    if (defAlive === 0) sim.endRound('atk', 'Enemy team eliminated');
    else if (atkAlive === 0 && !s.bomb.planted) sim.endRound('def', 'Your team was eliminated');
  }
  syncHud();
}
function syncCamera() {
  camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
  camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1); lastTime = now;
  if (!frozen) {
    const look = input.takeLook(); player.look(look.x, look.y);
    const pressed = input.takePressed();
    if (sim.state.phase === 'play' && !playerDead) {
      const w = WEAPONS[current];
      if (input.state.firing && (w.auto || input.takeClick())) shoot();
      if (pressed.has('KeyR')) reload();
      if (pressed.has('KeyQ')) { const d = camera.getWorldDirection(_tmp); if (sim.throwGrenade('frag', camera.position, d)) audio.reload(); }
      if (pressed.has('KeyF')) { const d = camera.getWorldDirection(_tmp); if (sim.throwGrenade('smoke', camera.position, d)) audio.reload(); }
      for (const [i, id] of ['pistol', 'smg', 'rifle', 'sniper'].entries()) {
        if (pressed.has(`Digit${i + 1}`) && sim.state.loadout.owned.includes(id)) { current = id; view.setWeapon(id); syncHud(); }
      }
    }
    if (sim.state.phase === 'buy') {
      const map = { Digit1: 'pistol', Digit2: 'smg', Digit3: 'rifle', Digit4: 'sniper', Digit5: 'frag', Digit6: 'smoke' };
      for (const [k, id] of Object.entries(map)) if (pressed.has(k)) onBuy(id);
      if (pressed.has('KeyB')) hud.hideBuy();
    } else if (pressed.has('KeyB') && sim.state.phase === 'play') hud.showBuy(sim.state.money, sim.state.loadout.owned, current, onBuy);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED && steps < 5) { step(FIXED); accumulator -= FIXED; steps++; }
    if (accumulator > FIXED * 5) accumulator = 0;
    const w = WEAPONS[current];
    hud.setCrosshair((w.spread + Math.min(1, player.groundSpeed() / 5.4) * w.moveSpread) * 900);
    syncCamera();
  }
  renderer.render(scene, camera);
}
function settle(n) { for (let i = 0; i < n; i++) step(FIXED); }
function aimAt(x, y, z) {
  const p = player.state;
  const dx = x - p.position.x, dy = y - (p.position.y + p.eye), dz = z - p.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}
function runShot(name) {
  hud.hideOverlay(); hud.hideBuy();
  const s = sim.state;
  if (name === 'start') {
    s.phase = 'buy'; s.timeLeft = 15;
    player.reset({ x: -2, z: 14, yaw: -0.15 });
    settle(10); aimAt(0, 2, -10);
    hud.showBuy(s.money, s.loadout.owned, current, onBuy);
  } else if (name === 'play') {
    s.phase = 'play'; s.timeLeft = 78; s.money = 1250;
    player.reset({ x: 0, z: 6, yaw: 0 });
    // Stage two enemies in Mid sightline, one teammate beside the player.
    const foes = bots.bots.filter((b) => b.team === 'def');
    foes[0].pos.set(-1.5, 0, -4); foes[0].yaw = Math.PI;
    foes[1].pos.set(3.5, 0, -6); foes[1].yaw = Math.PI;
    const mate = bots.bots.find((b) => b.team === 'atk');
    mate.pos.set(-2.2, 0, 7); mate.yaw = 0;
    settle(14);
    aimAt(foes[0].pos.x, 1.3, foes[0].pos.z);
    // Three torso hits kill (3 x 34 > 100 HP). Clear the cooldown directly
    // so all three land on the staged, stationary target.
    for (let i = 0; i < 3; i++) { view.state.cooldown = 0; shoot(); }
    view.state.flash = 0; // muzzle flash must not freeze into the capture
  } else {
    s.phase = 'end'; s.winner = 'atk'; s.winReason = 'Charge detonated'; s.score.atk = 3; s.score.def = 2; s.round = 6;
    player.reset({ x: -8, z: -2, yaw: 0.7 });
    settle(10); aimAt(-16, 1.5, -10);
    hud.showOverlay('end', { title: 'ROUND WON', copy: 'Charge detonated. Harbour 3 — 2 Dock. Next buy phase in a moment.', action: 'Continue' });
  }
  syncHud(); syncCamera();
  let painted = 0;
  (function paint() {
    requestAnimationFrame(paint);
    syncCamera(); renderer.render(scene, camera);
    if (++painted === 2) { window.__shotReady = true; frozen = true; }
  })();
}
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight);
});
window.__game = { sim, player, bots, hud, shoot, reload, spawnRound, camera, get hp() { return hp; } };
syncCamera();
if (shot) runShot(shot); else requestAnimationFrame(frame);
