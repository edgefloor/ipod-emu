import type { Ipod } from './device';
import { enableMotion } from './motion';

/** A completed tap supplies the activation that a first touch-drag cannot. */
export function installWakeScreen(device: Ipod, ready: () => void) {
  const screen = document.getElementById('wake-screen')!;
  const button = document.getElementById('wake-button') as HTMLButtonElement;
  const motion = document.getElementById('wake-motion') as HTMLInputElement;
  const status = document.getElementById('wake-status')!;
  document.getElementById('wake-motion-label')!.hidden = !window.DeviceMotionEvent;
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finish = () => {
    if (finished || (device.audio.ctx && device.audio.ctx.state !== 'running')) return;
    finished = true;
    clearTimeout(timer);
    device.audio.ctx?.removeEventListener('statechange', finish);
    screen.remove();
    document.querySelector('main')!.inert = false;
    device.wake();
    ready();
    document.getElementById('btn-select')!.focus({ preventScroll: true });
  };
  button.addEventListener('click', () => {
    // Both APIs must run in the tap handler, before any asynchronous work.
    device.audio.unlock();
    if (motion.checked) { void enableMotion(device); motion.checked = false; }
    device.audio.ctx?.addEventListener('statechange', finish);
    finish();
    if (!finished) {
      status.textContent = 'Waking up…';
      clearTimeout(timer);
      timer = setTimeout(() => { status.textContent = 'Audio is still asleep. Tap once more to wake.'; }, 2000);
    }
  });
}
