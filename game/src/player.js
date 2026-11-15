// Player movement: acceleration, friction, gravity, crouch and jump,
// resolved as a box against the world's colliders one axis at a time.
import * as THREE from 'three';

const RADIUS = 0.34, STAND_H = 1.72, CROUCH_H = 1.12, STAND_EYE = 1.6, CROUCH_EYE = 1.02;
const WALK = 5.4, CROUCH_SPEED = 2.4, GROUND_ACCEL = 44, AIR_ACCEL = 9, FRICTION = 9, GRAVITY = 21, JUMP = 6.4;

export function createPlayer(colliders, spawn) {
  const p = {
    position: new THREE.Vector3(spawn.x, 0, spawn.z), velocity: new THREE.Vector3(),
    yaw: spawn.yaw ?? 0, pitch: 0, eye: STAND_EYE, onGround: true, crouching: false, height: STAND_H,
  };
  const probe = new THREE.Box3();
  const wish = new THREE.Vector3();
  function overlaps(x, y, z, h, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + h - lift, z + RADIUS);
    for (const c of colliders) if (probe.intersectsBox(c)) return c;
    return null;
  }
  function look(dx, dy, s = 0.0022) {
    p.yaw -= dx * s;
    p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch - dy * s));
  }
  function recoil(pk, yk) { p.pitch = Math.min(1.45, p.pitch + pk); p.yaw += yk; }
  function step(dt, keys) {
    const crouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouch && !p.crouching) { p.crouching = true; p.height = CROUCH_H; }
    else if (!crouch && p.crouching && !overlaps(p.position.x, p.position.y, p.position.z, STAND_H, 0.02)) {
      p.crouching = false; p.height = STAND_H;
    }
    p.eye += ((p.crouching ? CROUCH_EYE : STAND_EYE) - p.eye) * Math.min(1, dt * 12);
    const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const str = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (fwd || str) {
      const s = Math.sin(p.yaw), c = Math.cos(p.yaw);
      wish.set(-s * fwd + c * str, 0, -c * fwd - s * str).normalize();
    }
    const speed = p.crouching ? CROUCH_SPEED : WALK;
    const blend = Math.min(1, (p.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    p.velocity.x += (wish.x * speed - p.velocity.x) * blend;
    p.velocity.z += (wish.z * speed - p.velocity.z) * blend;
    if (p.onGround && !wish.lengthSq()) { const d = Math.max(0, 1 - FRICTION * dt); p.velocity.x *= d; p.velocity.z *= d; }
    if (keys.has('Space') && p.onGround) { p.velocity.y = JUMP; p.onGround = false; }
    p.velocity.y -= GRAVITY * dt;
    const nx = p.position.x + p.velocity.x * dt;
    if (!overlaps(nx, p.position.y, p.position.z, p.height, 0.04)) p.position.x = nx; else p.velocity.x = 0;
    const nz = p.position.z + p.velocity.z * dt;
    if (!overlaps(p.position.x, p.position.y, nz, p.height, 0.04)) p.position.z = nz; else p.velocity.z = 0;
    p.position.y += p.velocity.y * dt;
    p.onGround = false;
    const hit = overlaps(p.position.x, p.position.y, p.position.z, p.height, 0);
    if (hit && p.velocity.y <= 0) { p.position.y = hit.max.y; p.velocity.y = 0; p.onGround = true; }
    else if (hit) { p.position.y = hit.min.y - p.height; p.velocity.y = 0; }
    if (p.position.y < 0) { p.position.y = 0; p.velocity.y = 0; p.onGround = true; }
    p.velocity.y = Math.max(-30, p.velocity.y);
  }
  function reset(spawnPos) {
    p.position.set(spawnPos.x, 0, spawnPos.z); p.velocity.set(0, 0, 0);
    p.yaw = spawnPos.yaw ?? 0; p.pitch = 0; p.crouching = false; p.height = STAND_H; p.eye = STAND_EYE;
  }
  return { state: p, step, look, recoil, reset, groundSpeed() { return Math.hypot(p.velocity.x, p.velocity.z); } };
}
