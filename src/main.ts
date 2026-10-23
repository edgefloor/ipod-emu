import { installWakeScreen } from './wake';
import { installAudioDiagnostics } from './audio-diagnostics';
import { Ipod } from './device';
import { attachWheel, attachButtons, attachKeyboard, fitDevice } from './input';
import { setup } from './integrations/music-dialog';
document.addEventListener("DOMContentLoaded", () => {
  fitDevice();
  window.addEventListener("resize", fitDevice);
  const device = new Ipod();
  // AudioContext is created by the first native gesture, never during page load.

  setup(device);
  window.ipod = device; // console/test hook

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) device.audio.releaseOutput();
  });
  window.addEventListener("pagehide", () => device.audio.releaseOutput());

  if (new URLSearchParams(location.search).has('audio-debug')) installAudioDiagnostics(device);

  installWakeScreen(device, () => {
    attachWheel(device);
    attachButtons(device);
    attachKeyboard(device);
    // Keep the existing activation hooks for returning from an interruption.
    const unlock = () => device.audio.unlock();
    for (const type of ["pointerdown", "touchstart", "touchend", "pointerup", "click", "keydown"]) {
      document.addEventListener(type, unlock, { capture: true, passive: true });
    }
  });
});
