// HARBOUR LINE map: a container yard at dusk. Two bomb sites — A "Crane Dock"
// west, B "Warehouse" east — joined by three lanes: West Row, Mid (the crane
// gantry) and East Row. Containers, crates and a gantry crane make the cover
// and the sightlines; every box is a collider and a bullet stop.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoint graph: bots walk these nodes. Edges are listed per node.
export const WAYPOINTS = [
  { x: 0, z: 15 },    // 0 attacker spawn
  { x: -8, z: 12 },   // 1
  { x: 8, z: 12 },    // 2
  { x: 0, z: 8 },     // 3 mid entry
  { x: -14, z: 6 },   // 4 west lane
  { x: 14, z: 6 },    // 5 east lane
  { x: 0, z: 2 },     // 6 mid
  { x: -16, z: -2 },  // 7 west to A
  { x: 16, z: -2 },   // 8 east to B
  { x: 0, z: -4 },    // 9 mid cross
  { x: -16, z: -10 }, // 10 site A
  { x: 16, z: -10 },  // 11 site B
  { x: -8, z: -8 },   // 12 A approach
  { x: 8, z: -8 },    // 13 B approach
  { x: 0, z: -14 },   // 14 defender spawn
  { x: -8, z: -14 },  // 15
  { x: 8, z: -14 },   // 16
  { x: -19, z: 2 },   // 17 west edge
  { x: 19, z: 2 },    // 18 east edge
];
export const EDGES = [
  [1, 2, 3], [0, 3, 4], [0, 3, 5], [1, 2, 4, 5, 6], [1, 6, 7, 17], [2, 6, 8, 18],
  [3, 4, 5, 9, 17, 18], [4, 10, 12], [5, 11, 13], [6, 7, 8, 12, 13, 14],
  [7, 12], [8, 13], [9, 10, 11, 14, 15, 16], [9, 14], [9, 15, 16],
  [12, 15], [13, 16], [4, 7], [5, 8],
];
export const SITES = {
  A: { name: 'Crane Dock', x: -16, z: -10, r: 4.2 },
  B: { name: 'Warehouse', x: 16, z: -10, r: 4.2 },
};
export const SPAWNS = {
  atk: [{ x: -3, z: 15, yaw: 0 }, { x: 0, z: 16, yaw: 0 }, { x: 3, z: 15, yaw: 0 }, { x: -6, z: 13, yaw: 0.3 }],
  def: [{ x: -3, z: -14, yaw: Math.PI }, { x: 0, z: -15, yaw: Math.PI }, { x: 3, z: -14, yaw: Math.PI }, { x: 6, z: -13, yaw: Math.PI }],
};

export function createWorld(scene) {
  const group = new THREE.Group(); scene.add(group);
  const mats = {};
  const mk = (name, color, rough = 0.9, metal = 0.05) => {
    mats[name] = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    return mats[name];
  };
  mk('ground', 0x5d6663); mk('concrete', 0x8d9296); mk('dark', 0x2b3438);
  mk('rust', 0xc65a2e, 0.8, 0.15); mk('teal', 0x2e7f8c, 0.75, 0.1);
  mk('amber', 0xf2a33c, 0.7, 0.1); mk('steel', 0x6b7a80, 0.5, 0.55);
  mk('siteA', 0xc65a2e); mk('siteB', 0x2e7f8c);
  const colliders = [], shootables = [];
  function box(w, h, d, x, y, z, m, shoot = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[m]);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh); colliders.push(new THREE.Box3().setFromObject(mesh));
    if (shoot) shootables.push(mesh); return mesh;
  }
  function crate(w, h, d, x, z, m) { box(w, h, d, x, h / 2, z, m); }
  // Ground + perimeter (44 x 36 m)
  box(46, 0.4, 38, 0, -0.2, 0, 'ground');
  box(0.6, 5, 38, -22.3, 2.5, 0, 'dark'); box(0.6, 5, 38, 22.3, 2.5, 0, 'dark');
  box(46, 5, 0.6, 0, 2.5, -18.3, 'dark'); box(46, 5, 0.6, 0, 2.5, 18.3, 'dark');
  // Site pads (painted, walkable, no collider)
  const padA = new THREE.Mesh(new THREE.BoxGeometry(8, 0.06, 8), mats.siteA);
  padA.position.set(-16, 0.03, -10); padA.receiveShadow = true; group.add(padA);
  const padB = new THREE.Mesh(new THREE.BoxGeometry(8, 0.06, 8), mats.siteB);
  padB.position.set(16, 0.03, -10); padB.receiveShadow = true; group.add(padB);
  // Site markers: glowing pylons + letter boards (boxes, no text textures needed)
  for (const [sx, sz, m] of [[-19.5, -13.5, 'siteA'], [19.5, -13.5, 'siteB']]) {
    box(0.4, 3.2, 0.4, sx, 1.6, sz, m); box(0.4, 3.2, 0.4, sx, 1.6, sz + 0, m);
  }
  // Containers: West Row / Mid / East Row — the lane cover
  crate(6, 2.6, 2.6, -10, 8, 'rust'); crate(6, 2.6, 2.6, 10, 8, 'teal');
  crate(6, 2.6, 2.6, -10, -4, 'teal'); crate(6, 2.6, 2.6, 10, -4, 'rust');
  crate(2.6, 2.6, 6, -4, 2, 'amber'); crate(2.6, 2.6, 6, 4, 2, 'rust');
  crate(6, 2.6, 2.6, -14, -13, 'rust'); crate(6, 2.6, 2.6, 14, -13, 'teal');
  crate(4, 1.2, 2, -18, 6, 'concrete'); crate(4, 1.2, 2, 18, 6, 'concrete');
  crate(3, 1.2, 3, -6, -10, 'concrete'); crate(3, 1.2, 3, 6, -10, 'concrete');
  crate(2, 2.4, 2, 0, -8, 'dark'); crate(2, 1.1, 2, -2, 10, 'concrete'); crate(2, 1.1, 2, 2, 10, 'concrete');
  // Stacked container over the west lane (second level)
  box(6, 2.6, 2.6, -10, 3.9, 8, 'teal');
  // Gantry crane over Mid: two legs + beam, the map's landmark
  box(0.8, 9, 0.8, -3.5, 4.5, -4, 'amber'); box(0.8, 9, 0.8, 3.5, 4.5, -4, 'amber');
  box(8.4, 0.9, 1.2, 0, 8.6, -4, 'amber');
  box(1.6, 1.4, 1.6, 0, 7.6, -4, 'dark');
  // Warehouse shell at B, crane cabin at A (walls with a gap each)
  box(10, 4.5, 0.5, 16, 2.25, -17.8, 'concrete');
  box(0.5, 4.5, 6, 21.8, 2.25, -14, 'concrete');
  box(10, 4.5, 0.5, -16, 2.25, -17.8, 'steel');
  // Lamp posts (sodium glow) + barrels
  const lampMat = new THREE.MeshBasicMaterial({ color: PALETTE.amber });
  for (const [x, z] of [[-12, 0], [12, 0], [0, 12], [0, -12], [-19, -6], [19, -6]]) {
    box(0.25, 4.2, 0.25, x, 2.1, z, 'dark');
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), lampMat);
    lamp.position.set(x, 4.35, z); group.add(lamp);
    const pl = new THREE.PointLight(PALETTE.amber, 14, 14, 1.8); pl.position.set(x, 4.2, z); scene.add(pl);
  }
  for (const [x, z] of [[-8, -12], [8, -12], [-16, 4], [16, 4], [0, 16]]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 12), mats.rust);
    b.position.set(x, 0.55, z); b.castShadow = true; group.add(b);
    colliders.push(new THREE.Box3().setFromObject(b)); shootables.push(b);
  }
  // Dusk sky: hemisphere + low amber sun + cool fill, long shadows
  scene.add(new THREE.HemisphereLight(0x8fb8c4, 0x1a2226, 0.9));
  const sun = new THREE.DirectionalLight(0xffb066, 2.4);
  sun.position.set(-14, 18, 10); sun.target.position.set(0, 0, -4);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -28; sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 28; sun.shadow.camera.bottom = -28; sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0005; scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0x5a8fa0, 0.5); fill.position.set(12, 10, -12); scene.add(fill);
  return { colliders, shootables, group };
}

// BFS over the waypoint graph; returns node indices from `from` to `to`.
export function findPath(from, to) {
  if (from === to) return [to];
  const prev = new Array(WAYPOINTS.length).fill(-1);
  const q = [from]; prev[from] = from;
  while (q.length) {
    const n = q.shift();
    for (const m of EDGES[n] ?? []) {
      if (prev[m] === -1) { prev[m] = n; if (m === to) { const path = [to]; let c = to; while (c !== from) { c = prev[c]; path.unshift(c); } return path; } q.push(m); }
    }
  }
  return [to];
}
export function nearestWaypoint(x, z) {
  let best = 0, bd = 1e9;
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const d = (WAYPOINTS[i].x - x) ** 2 + (WAYPOINTS[i].z - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
