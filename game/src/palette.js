// Harbour Line — palette, the one source of colour for 3D and CSS.
// Dusk harbour: deep teal water-sky, rust-orange cranes and containers,
// warm sodium lamps, pale concrete. Six named colours, nothing else.
export const PALETTE = {
  canvas: '#0e1a1e',
  sky: '#274b57',
  concrete: '#8d9296',
  dark: '#2b3438',
  rust: '#c65a2e',
  amber: '#f2a33c',
  teal: '#2e7f8c',
  ink: '#eef2ee',
  muted: '#9fb3b5',
  enemy: '#d84a3a',
  ally: '#4fc3a1',
};
export function mulberry32(seed) {
  let a = seed | 0;
  return function rnd() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pick(rnd, arr) { return arr[Math.floor(rnd() * arr.length)]; }
