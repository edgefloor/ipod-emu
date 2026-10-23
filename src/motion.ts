import type { Ipod } from './device';
import { DiskErrorScreen } from './screens/disk-error';

type Vector = { x: number | null; y: number | null; z: number | null };

/** Three strong, alternating impulses; a bump or ordinary rotation is insufficient. */
export class ShakeDetector {
  private previous: number[] | null = null;
  private first = 0;
  private last = -Infinity;
  private count = 0;
  private cooldown = 0;
  sample(vector: Vector | null, time: number): boolean {
    if (!vector || time < this.cooldown) return false;
    const values = [vector.x, vector.y, vector.z];
    if (!values.every((value): value is number => value !== null && Number.isFinite(value))) return false;
    if (Math.hypot(...values) < 25 || time - this.last < 80) return false;
    if (time - this.first > 900) { this.count = 0; this.previous = null; }
    if (this.previous && values.reduce((dot, value, i) => dot + value * this.previous![i], 0) >= 0) return false;
    if (!this.count) this.first = time;
    this.previous = values;
    this.last = time;
    if (++this.count < 3) return false;
    this.count = 0;
    this.previous = null;
    this.cooldown = time + 8000;
    return true;
  }
}

export async function enableMotion(device: Ipod): Promise<void> {
  const motion = window.DeviceMotionEvent as (typeof DeviceMotionEvent & {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  }) | undefined;
  if (!motion) return;
  try {
    if (motion.requestPermission && await motion.requestPermission() !== 'granted') return;
  } catch { return; } // Permission denial must never block waking the player.
  const detector = new ShakeDetector();
  window.addEventListener('devicemotion', event => {
    if (document.hidden || document.getElementById('wake-screen') || device.top() instanceof DiskErrorScreen) return;
    // Gravity-inclusive readings still require >2.5g and repeated reversal.
    if (detector.sample(event.acceleration?.x != null ? event.acceleration : event.accelerationIncludingGravity, performance.now())) {
      if (device.player.playing) device.player.toggle();
      device.wake();
      device.push(new DiskErrorScreen(device));
    }
  });
}
