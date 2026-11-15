// Weapon catalogue: one table drives HUD, buy menu, damage and view models.
// Prices are the economy; damage/recoil/spread are the gunplay.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: { name: 'P9 Sidearm', kind: 'pistol', price: 0, mag: 12, reserve: 36, damage: 26, headMul: 3, gap: 0.16, reload: 1.2, spread: 0.006, moveSpread: 0.02, recoil: 0.008, auto: false, range: 45 },
  smg: { name: 'Kestrel SMG', kind: 'smg', price: 1500, mag: 32, reserve: 96, damage: 19, headMul: 2.5, gap: 0.075, reload: 1.7, spread: 0.009, moveSpread: 0.024, recoil: 0.006, auto: true, range: 40 },
  rifle: { name: 'Harrier Rifle', kind: 'rifle', price: 2700, mag: 30, reserve: 90, damage: 34, headMul: 3, gap: 0.1, reload: 2.0, spread: 0.0025, moveSpread: 0.03, recoil: 0.011, auto: true, range: 70 },
  sniper: { name: 'Longshore DMR', kind: 'sniper', price: 4750, mag: 5, reserve: 15, damage: 95, headMul: 2, gap: 1.1, reload: 2.8, spread: 0.0008, moveSpread: 0.05, recoil: 0.035, auto: false, range: 90 },
};
export const GRENADES = {
  frag: { name: 'Frag Charge', price: 300 },
  smoke: { name: 'Smoke Canister', price: 300 },
};
export const BUY_ORDER = ['pistol', 'smg', 'rifle', 'sniper'];

// One view model, rebuilt per weapon from boxes: receiver, barrel, stock,
// grip and a sight. No textures, no external models.
export function createViewModel(camera) {
  const dark = new THREE.MeshStandardMaterial({ color: PALETTE.dark, roughness: 0.55, metalness: 0.45 });
  const steel = new THREE.MeshStandardMaterial({ color: PALETTE.concrete, roughness: 0.35, metalness: 0.6 });
  const accent = new THREE.MeshStandardMaterial({ color: PALETTE.amber, roughness: 0.5, metalness: 0.2 });
  const group = new THREE.Group();
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18),
    new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
  flash.position.set(0.24, -0.17, -0.95); flash.visible = false;
  const flashLight = new THREE.PointLight(PALETTE.amber, 0, 6);
  flashLight.position.set(0.24, -0.15, -0.6);
  camera.add(group, flash, flashLight);
  let parts = [];
  function build(kind) {
    for (const p of parts) group.remove(p);
    parts = [];
    const add = (w, h, d, x, y, z, m) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || dark);
      mesh.position.set(x, y, z); group.add(mesh); parts.push(mesh); return mesh;
    };
    if (kind === 'pistol') {
      add(0.06, 0.09, 0.26, 0, 0.01, -0.1, steel); add(0.05, 0.12, 0.06, 0, -0.08, 0.02);
      add(0.02, 0.03, 0.02, 0, 0.07, -0.2, accent);
    } else if (kind === 'smg') {
      add(0.08, 0.1, 0.4, 0, 0, -0.12, steel); add(0.04, 0.04, 0.22, 0, 0.03, -0.4);
      add(0.06, 0.14, 0.07, 0, -0.09, 0.02); add(0.07, 0.08, 0.18, 0, -0.02, 0.22);
    } else if (kind === 'sniper') {
      add(0.08, 0.09, 0.55, 0, 0, -0.15, steel); add(0.035, 0.035, 0.5, 0, 0.03, -0.5);
      add(0.05, 0.06, 0.22, 0, 0.07, -0.15, dark); add(0.07, 0.09, 0.2, 0, -0.02, 0.28);
      add(0.03, 0.03, 0.03, 0, 0.09, -0.3, accent);
    } else {
      add(0.09, 0.1, 0.42, 0, 0, -0.1, steel); add(0.045, 0.045, 0.4, 0, 0.025, -0.45);
      add(0.075, 0.08, 0.22, 0, -0.02, 0.3); add(0.05, 0.11, 0.06, 0, -0.09, -0.02);
      add(0.02, 0.04, 0.12, 0, 0.07, -0.12, accent);
    }
    group.position.set(0.24, -0.2, -0.42); group.rotation.set(0, 0, 0);
  }
  build('rifle');
  const state = { cooldown: 0, reloadLeft: 0, reloadTime: 2, flash: 0, kick: 0, kind: 'rifle' };
  return {
    state,
    setWeapon(kind) { if (kind !== state.kind) { state.kind = kind; build(kind); } },
    pullTrigger() { state.flash = 0.06; state.kick = 0.06; },
    startReload(t) { state.reloadLeft = t; state.reloadTime = t; },
    step(dt) {
      state.cooldown = Math.max(0, state.cooldown - dt);
      state.flash = Math.max(0, state.flash - dt);
      state.kick += (0 - state.kick) * Math.min(1, dt * 13);
      group.position.z = -0.42 + state.kick;
      group.rotation.x = state.kick * 2.4;
      flash.visible = state.flash > 0;
      flash.rotation.z = state.flash * 40;
      flashLight.intensity = state.flash > 0 ? 20 : 0;
      if (state.reloadLeft > 0) {
        state.reloadLeft = Math.max(0, state.reloadLeft - dt);
        group.rotation.x = -0.6 * Math.sin(Math.PI * Math.min(1, 1 - state.reloadLeft / state.reloadTime));
      }
    },
  };
}
