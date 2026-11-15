// Keyboard + mouse (pointer lock). Plain browser APIs; in ?shot= mode the
// game never asks for the lock, so headless captures still render.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const state = { keys, locked: false, firing: false, clicked: false, lookX: 0, lookY: 0, pressed: new Set() };
  function setKey(e, down) {
    if (down) { if (!keys.has(e.code)) state.pressed.add(e.code); keys.add(e.code); }
    else keys.delete(e.code);
    if (e.code === 'Space') e.preventDefault();
  }
  window.addEventListener('keydown', (e) => setKey(e, true));
  window.addEventListener('keyup', (e) => setKey(e, false));
  window.addEventListener('blur', () => { keys.clear(); state.firing = false; });
  window.addEventListener('mousemove', (e) => {
    if (!state.locked) return;
    state.lookX += e.movementX; state.lookY += e.movementY;
  });
  window.addEventListener('mousedown', (e) => { if (state.locked && e.button === 0) { state.firing = true; state.clicked = true; } });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) state.firing = false; });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) { keys.clear(); state.firing = false; }
    onLockChange(state.locked);
  });
  return {
    state,
    requestLock() { try { canvas.requestPointerLock(); } catch { /* headless */ } },
    takeLook() { const x = state.lookX, y = state.lookY; state.lookX = 0; state.lookY = 0; return { x, y }; },
    takeClick() { const c = state.clicked; state.clicked = false; return c; },
    takePressed() { const p = new Set(state.pressed); state.pressed.clear(); return p; },
  };
}
