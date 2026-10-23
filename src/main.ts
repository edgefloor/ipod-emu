import { Ipod } from './device';
import { attachWheel, attachButtons, attachKeyboard, fitDevice } from './input';
import { setup } from './integrations/music-dialog';
document.addEventListener("DOMContentLoaded", () => {
  fitDevice();
  window.addEventListener("resize", fitDevice);
  const device = new Ipod();
  // Allocate the context before the first gesture; activation still happens on touch/tap.
  device.audio.ensureContext(false);
  attachWheel(device);
  attachButtons(device);
  attachKeyboard(device);
  setup(device);
  window.ipod = device; // console/test hook

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) device.audio.releaseOutput();
  });
  window.addEventListener("pagehide", () => device.audio.releaseOutput());

  // Retry on activation gestures and after interruptions, not only the first press.
  const unlock = () => device.audio.unlock();
  for (const type of ["pointerdown", "touchstart", "touchend", "pointerup", "click", "keydown"]) {
    document.addEventListener(type, unlock, { capture: true, passive: true });
  }
});
