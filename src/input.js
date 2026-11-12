// Drag-to-steer. The value is relative to where the drag began, so touching
// anywhere on screen never makes the army jump.

export function createSteer(sensitivity = 1) {
  let activeId = null;
  let startX = 0;
  let startValue = 0;
  const steer = {
    value: 0,
    start(id, clientX) {
      if (activeId !== null) return;
      activeId = id;
      startX = clientX;
      startValue = steer.value;
    },
    move(id, clientX, width) {
      if (id !== activeId) return;
      const span = width * 0.35;
      if (!(span > 0)) return;
      const v = startValue + ((clientX - startX) / span) * sensitivity;
      steer.value = Math.max(-1, Math.min(1, v));
    },
    end(id) {
      if (id === activeId) activeId = null;
    },
    reset() {
      activeId = null;
      steer.value = 0;
    },
  };
  return steer;
}

export function attachSteer(element, steer) {
  const width = () => element.clientWidth || window.innerWidth;
  element.addEventListener('pointerdown', (e) => {
    steer.start(e.pointerId, e.clientX, width());
  });
  window.addEventListener('pointermove', (e) => steer.move(e.pointerId, e.clientX, width()));
  const end = (e) => steer.end(e.pointerId);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}
