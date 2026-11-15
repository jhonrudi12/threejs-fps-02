// Bots: 3 teammates + 4 enemies. Each bot is a body (torso/head hit meshes),
// a waypoint route, a state machine (patrol / engage / hold / plant / defuse)
// and a hitscan gun with inaccuracy that grows when it moves. Bots react to
// sight (raycast LOS, range + facing) and to sound (shots raise a noise event
// they turn toward). No per-frame allocation: shared temp vectors and a
// pooled tracer list.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WAYPOINTS, EDGES, findPath, nearestWaypoint } from './world.js';

const BOT_SPEED = 3.4, BOT_HP = 100, REACT = 0.45, FIRE_GAP = 0.42;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _dir = new THREE.Vector3();
const _ray = new THREE.Raycaster();

export function createBots(scene, colliders, shootables, opts) {
  const group = new THREE.Group(); scene.add(group);
  const bots = [];
  const tracers = [];
  // Pooled tracer lines (12), reused, never allocated in the loop.
  const tracerMat = new THREE.LineBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 12; i++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(g, tracerMat); line.visible = false; line.frustumCulled = false;
    scene.add(line); tracers.push({ line, life: 0 });
  }
  let tracerIdx = 0;
  function fireTracer(from, to) {
    const t = tracers[tracerIdx]; tracerIdx = (tracerIdx + 1) % tracers.length;
    const a = t.line.geometry.attributes.position;
    a.setXYZ(0, from.x, from.y, from.z); a.setXYZ(1, to.x, to.y, to.z);
    a.needsUpdate = true; t.line.visible = true; t.life = 0.09;
  }
  const bodyGeo = new THREE.BoxGeometry(0.52, 0.78, 0.3);
  const headGeo = new THREE.SphereGeometry(0.16, 12, 10);
  const legGeo = new THREE.BoxGeometry(0.2, 0.62, 0.22);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.55);
  const bandGeo = new THREE.BoxGeometry(0.36, 0.07, 0.36);

  function makeBot(team, idx, spawn, siteNode) {
    const ally = team === 'atk';
    const vest = new THREE.MeshStandardMaterial({ color: ally ? PALETTE.ally : PALETTE.enemy, roughness: 0.6 });
    const cloth = new THREE.MeshStandardMaterial({ color: ally ? 0x2e4a44 : 0x4a2e2e, roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc9a184, roughness: 0.7 });
    const g = new THREE.Group(); g.position.set(spawn.x, 0, spawn.z);
    const torso = new THREE.Mesh(bodyGeo, vest); torso.position.y = 1.02; torso.userData.part = 'torso';
    const head = new THREE.Mesh(headGeo, skin); head.position.y = 1.56; head.userData.part = 'head';
    const band = new THREE.Mesh(bandGeo, vest); band.position.y = 1.66;
    const legL = new THREE.Mesh(legGeo, cloth); legL.position.set(-0.14, 0.31, 0);
    const legR = new THREE.Mesh(legGeo, cloth); legR.position.set(0.14, 0.31, 0);
    const gun = new THREE.Mesh(gunGeo, cloth); gun.position.set(0.2, 1.05, -0.3);
    g.add(torso, head, band, legL, legR, gun);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
    group.add(g);
    const bot = {
      team, idx, group: g, torso, head, legL, legR, gun, alive: true, hp: BOT_HP,
      pos: g.position, yaw: spawn.yaw ?? 0, state: 'patrol', target: null,
      route: [], routeI: 0, siteNode, holdNode: siteNode, fireAt: 0, reactAt: 0,
      hearX: 0, hearZ: 0, hearAt: -99, channel: 0, channelKind: '', walkPhase: 0,
      speed: BOT_SPEED * (0.9 + Math.random() * 0.2),
    };
    torso.userData.bot = bot; head.userData.bot = bot;
    bots.push(bot); return bot;
  }
  function losClear(ax, ay, az, bx, by, bz) {
    _dir.set(bx - ax, by - ay, bz - az);
    const dist = _dir.length(); if (dist < 0.01) return true;
    _dir.multiplyScalar(1 / dist);
    _ray.set(_v.set(ax, ay, az), _dir); _ray.far = dist;
    return _ray.intersectObjects(shootables, false).length === 0;
  }
  function canSee(bot, tx, ty, tz, smoke) {
    const dx = tx - bot.pos.x, dz = tz - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 42) return false;
    const facing = Math.atan2(-dx, -dz);
    let diff = Math.abs(facing - bot.yaw); if (diff > Math.PI) diff = 2 * Math.PI - diff;
    if (dist > 6 && diff > 1.15) return false;
    if (!losClear(bot.pos.x, 1.5, bot.pos.z, tx, ty, tz)) return false;
    // Smoke clouds block sight: segment vs sphere test, no allocation.
    if (smoke) for (const s of smoke) {
      const cx = s.x - bot.pos.x, cy = s.y - 1.5, cz = s.z - bot.pos.z;
      const ex = tx - bot.pos.x, ey = ty - 1.5, ez = tz - bot.pos.z;
      const len2 = ex * ex + ey * ey + ez * ez;
      const t = len2 ? Math.max(0, Math.min(1, (cx * ex + cy * ey + cz * ez) / len2)) : 0;
      const px = cx - ex * t, py = cy - ey * t, pz = cz - ez * t;
      if (px * px + py * py + pz * pz < s.r * s.r) return false;
    }
    return true;
  }
  function overlaps(x, z) {
    for (const c of colliders) {
      if (x + 0.3 > c.min.x && x - 0.3 < c.max.x && z + 0.3 > c.min.z && z - 0.3 < c.max.z && c.max.y > 0.4 && c.min.y < 1.6) return true;
    }
    return false;
  }
  function moveToward(bot, tx, tz, dt, speedMul = 1) {
    const dx = tx - bot.pos.x, dz = tz - bot.pos.z;
    const d = Math.hypot(dx, dz); if (d < 0.05) return true;
    const sp = bot.speed * speedMul * dt;
    const nx = bot.pos.x + (dx / d) * sp, nz = bot.pos.z + (dz / d) * sp;
    bot.yaw = Math.atan2(-(dx / d), -(dz / d));
    if (!overlaps(nx, bot.pos.z)) bot.pos.x = nx;
    if (!overlaps(bot.pos.x, nz)) bot.pos.z = nz;
    bot.walkPhase += dt * 9;
    const s = Math.sin(bot.walkPhase) * 0.45;
    bot.legL.rotation.x = s; bot.legR.rotation.x = -s;
    return d < 0.6;
  }
  function setRoute(bot, node) {
    bot.route = findPath(nearestWaypoint(bot.pos.x, bot.pos.z), node); bot.routeI = 0;
  }
  function hear(x, z, time) { for (const b of bots) { if (!b.alive) continue; const d = Math.hypot(b.pos.x - x, b.pos.z - z); if (d < 26) { b.hearX = x; b.hearZ = z; b.hearAt = time; } } }

  return {
    bots, hear, losClear, fireTracer,
    spawnTeams(rnd, atkSites, defSites) {
      bots.length = 0; group.clear();
      const atkSpawns = [{ x: -3, z: 15, yaw: 0 }, { x: 0, z: 16, yaw: 0 }, { x: 3, z: 15, yaw: 0 }];
      const defSpawns = [{ x: -3, z: -14, yaw: Math.PI }, { x: 0, z: -15, yaw: Math.PI }, { x: 3, z: -14, yaw: Math.PI }, { x: 6, z: -13, yaw: Math.PI }];
      atkSpawns.forEach((s, i) => { const b = makeBot('atk', i, s, atkSites[i % atkSites.length]); setRoute(b, b.siteNode); });
      defSpawns.forEach((s, i) => { const b = makeBot('def', i, s, defSites[i % defSites.length]); setRoute(b, b.siteNode); });
      return bots;
    },
    reset(rnd, atkSites, defSites) { this.spawnTeams(rnd, atkSites, defSites); },
    // One fixed step for every bot. `ctx` carries the live targets, bomb state
    // and callbacks (damage, plant, defuse, killfeed) — bots never own the rules.
    step(dt, time, ctx) {
      for (const t of tracers) { if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.line.visible = false; } }
      for (const bot of bots) {
        if (!bot.alive) continue;
        bot.group.position.set(bot.pos.x, 0, bot.pos.z);
        bot.group.rotation.y = bot.yaw;
        // Pick the nearest living enemy in sight (player counts as a target).
        let foe = null, foeDist = 1e9;
        for (const e of ctx.enemiesOf(bot)) {
          if (!e.alive) continue;
          const d = Math.hypot(e.pos.x - bot.pos.x, e.pos.z - bot.pos.z);
          if (d < foeDist && canSee(bot, e.pos.x, e.pos.y + 1.2, e.pos.z, ctx.smoke)) { foe = e; foeDist = d; }
        }
        if (foe) {
          if (bot.target !== foe) { bot.target = foe; bot.reactAt = time + REACT; }
          bot.state = 'engage';
          const dx = foe.pos.x - bot.pos.x, dz = foe.pos.z - bot.pos.z;
          bot.yaw = Math.atan2(-dx, -dz);
          // Strafe sideways while fighting, keep ~10 m distance.
          if (time > bot.reactAt && time >= bot.fireAt) {
            bot.fireAt = time + FIRE_GAP * (0.85 + Math.random() * 0.5);
            const spread = 0.03 + foeDist * 0.0016 + (bot.team === 'def' ? 0.004 : 0);
            _dir.set(dx, (foe.pos.y + 1.2) - 1.45, dz).normalize();
            _dir.x += (Math.random() * 2 - 1) * spread; _dir.y += (Math.random() * 2 - 1) * spread; _dir.z += (Math.random() * 2 - 1) * spread;
            _dir.normalize();
            _v.set(bot.pos.x, 1.45, bot.pos.z);
            fireTracer(_v, _v2.set(bot.pos.x + _dir.x * foeDist, 1.45 + _dir.y * foeDist, bot.pos.z + _dir.z * foeDist));
            ctx.botShoot(bot, _v, _dir, foeDist);
          }
          if (foeDist > 12) moveToward(bot, foe.pos.x, foe.pos.z, dt, 0.9);
          else if (foeDist < 5) moveToward(bot, bot.pos.x - dx * 0.5, bot.pos.z - dz * 0.5, dt, 0.7);
          else { bot.walkPhase += dt * 6; const s = Math.sin(time * 2 + bot.idx) > 0 ? 1 : -1; moveToward(bot, bot.pos.x + Math.cos(bot.yaw) * s, bot.pos.z - Math.sin(bot.yaw) * s, dt, 0.4); }
          continue;
        }
        bot.target = null;
        // Bomb logic: defenders rush a planted bomb to defuse; attackers plant.
        if (ctx.bomb.planted && bot.team === 'def') {
          bot.state = 'defuse';
          const d = Math.hypot(ctx.bomb.x - bot.pos.x, ctx.bomb.z - bot.pos.z);
          if (d > 1.6) { moveToward(bot, ctx.bomb.x, ctx.bomb.z, dt, 1.15); bot.channel = 0; }
          else { bot.channel += dt; ctx.defuseProgress(bot.channel / 5); if (bot.channel >= 5) ctx.onDefused(bot); }
          continue;
        }
        if (!ctx.bomb.planted && bot.team === 'atk' && ctx.bombSite) {
          const site = ctx.bombSite;
          const d = Math.hypot(site.x - bot.pos.x, site.z - bot.pos.z);
          if (d < 2.5 && ctx.plantAllowed(bot)) {
            bot.state = 'plant'; bot.channel += dt; ctx.plantProgress(bot.channel / 3, bot);
            if (bot.channel >= 3) ctx.onPlanted(bot, site); continue;
          }
          bot.channel = 0;
        }
        // Patrol: follow the route; at the end, hold and listen.
        if (bot.route.length && bot.routeI < bot.route.length) {
          const node = WAYPOINTS[bot.route[bot.routeI]];
          if (moveToward(bot, node.x, node.z, dt)) bot.routeI++;
          bot.state = 'patrol';
        } else {
          bot.state = 'hold';
          if (time - bot.hearAt < 2.5) { const dx = bot.hearX - bot.pos.x, dz = bot.hearZ - bot.pos.z; bot.yaw = Math.atan2(-dx, -dz); }
          else bot.yaw += dt * 0.25 * (bot.idx % 2 ? 1 : -1);
          bot.legL.rotation.x *= 0.8; bot.legR.rotation.x *= 0.8;
        }
      }
    },
    damage(bot, amount, head) {
      if (!bot.alive) return false;
      bot.hp -= amount; bot.channel = 0;
      if (bot.hp <= 0) {
        bot.alive = false; bot.hp = 0;
        bot.group.rotation.x = -Math.PI / 2; bot.group.position.y = 0.35;
        bot.torso.userData.bot = null; bot.head.userData.bot = null;
        return true;
      }
      return false;
    },
    aliveCount(team) { let n = 0; for (const b of bots) if (b.alive && b.team === team) n++; return n; },
    hitMeshes() { const m = []; for (const b of bots) if (b.alive) m.push(b.torso, b.head); return m; },
  };
}
