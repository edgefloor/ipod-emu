import type { Ipod } from './device';
import { MenuScreen } from './screens/base';

/** Opt-in, local-only trace for diagnosing device-specific Web Audio activation. */
export function installAudioDiagnostics(device: Ipod): void {
  const started = performance.now();
  const entries: Array<Record<string, unknown>> = [];
  const state = () => ({
    audio: device.audio.ctx?.state ?? 'not created',
    clock: Number((device.audio.ctx?.currentTime ?? 0).toFixed(3)),
    active: navigator.userActivation?.isActive,
    activated: navigator.userActivation?.hasBeenActive,
    primer: !!device.audio.outputPrimer,
    pendingFeedback: !!device.audio.pendingFeedback,
    nextClick: device.audio.nextClickAt,
    selected: device.stack.at(-1) instanceof MenuScreen ? (device.stack.at(-1) as MenuScreen).sel : undefined
  });
  const panel = document.createElement('aside');
  panel.setAttribute('aria-label', 'Audio diagnostics');
  panel.style.cssText = 'position:fixed;z-index:1000;top:env(safe-area-inset-top,0px);left:8px;right:8px;padding:10px;background:#181818;color:#fff;border:1px solid #777;border-radius:6px;font:12px/1.4 monospace;';
  const status = document.createElement('div');
  const instructions = document.createElement('div');
  instructions.textContent = 'Turn the wheel twice without tapping a button, then copy the trace.';
  const copy = document.createElement('button');
  copy.textContent = 'Copy audio trace';
  copy.style.cssText = 'margin-top:6px;padding:6px 10px;font:inherit;';
  const output = document.createElement('textarea');
  output.hidden = true;
  output.setAttribute('aria-label', 'Audio trace');
  output.style.cssText = 'width:100%;height:80px;margin-top:6px;font:10px monospace;';
  panel.append(status, instructions, copy, output); document.body.append(panel);
  let wheelSteps = 0, feedbackRequests = 0;
  const record = (event: string, extra: Record<string, unknown> = {}) => {
    entries.push({ ms: Math.round(performance.now() - started), event, ...state(), ...extra });
    if (entries.length > 150) entries.shift();
  };
  for (const name of ['pointerdown', 'touchstart', 'pointerup', 'touchend', 'pointercancel', 'click', 'keydown']) {
    document.addEventListener(name, event => {
      const target = event.target instanceof Element ? event.target.closest('[id]')?.id : undefined;
      record(name, { target, trusted: event.isTrusted });
    }, { capture: true, passive: true });
  }
  document.getElementById('wheel')!.addEventListener('wheelscroll', () => { wheelSteps++; record('wheel'); });
  const playFeedback = device.audio.playFeedback.bind(device.audio);
  device.audio.playFeedback = (buffer, volume, pan, at) => {
    feedbackRequests++; record('feedback', { volume, pan, scheduledAt: at });
    playFeedback(buffer, volume, pan, at);
  };
  let lastState = '';
  const timer = window.setInterval(() => {
    const current = state();
    status.textContent = `Audio: ${current.audio} · clock ${current.clock}s · wheel ${wheelSteps} · feedback ${feedbackRequests}`;
    if (current.audio !== lastState) { lastState = current.audio; record('state'); }
    else if (wheelSteps) record('clock');
  }, 500);
  window.addEventListener('pagehide', () => window.clearInterval(timer), { once: true });
  copy.addEventListener('click', async () => {
    const report = JSON.stringify({ userAgent: navigator.userAgent, entries }, null, 2);
    try { await navigator.clipboard.writeText(report); copy.textContent = 'Copied'; }
    catch { output.hidden = false; output.value = report; output.focus(); output.select(); copy.textContent = 'Select and copy the trace below'; }
  });
  record('ready');
}
