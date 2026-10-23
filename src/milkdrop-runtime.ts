import bundle from 'butterchurn';
const butterchurn = bundle.default;
import preset from 'butterchurn-presets/presets/converted/Geiss - Spiral Artifact.json';

/** Owns all GPU and audio resources for one mounted background. */
export function createMilkDrop(canvas: HTMLCanvasElement, failed: () => void) {
  const context = new AudioContext();
  const gl = canvas.getContext('webgl2');
  if (!gl) { void context.close(); throw new Error('WebGL 2 is unavailable.'); }
  let source: MediaStreamAudioSourceNode | undefined;
  let stream: MediaStream | undefined;
  let stopped: (() => void) | undefined;
  let timer = 0, frame = 0, disposed = false, paused = false;
  let visualizer: ReturnType<typeof butterchurn.createVisualizer>;
  try {
    visualizer = butterchurn.createVisualizer(context, canvas, {
      width: 640, height: 480, pixelRatio: 1, textureRatio: 1, meshWidth: 32, meshHeight: 24
    });
    visualizer.loadPreset(preset, 0);
  } catch (error) { void context.close(); gl.getExtension('WEBGL_lose_context')?.loseContext(); throw error; }
  const cancel = () => { clearTimeout(timer); cancelAnimationFrame(frame); };
  const render = () => {
    if (disposed || paused || document.hidden) return;
    try { visualizer.render(); } catch { cancel(); failed(); return; }
    timer = window.setTimeout(() => { frame = requestAnimationFrame(render); }, 1000 / 24);
  };
  const wake = () => { cancel(); if (!disposed && !paused && !document.hidden) frame = requestAnimationFrame(render); };
  const resize = () => {
    const scale = Math.min(1, 960 / Math.max(innerWidth, innerHeight));
    const width = Math.max(1, Math.round(innerWidth * scale));
    const height = Math.max(1, Math.round(innerHeight * scale));
    canvas.width = width; canvas.height = height;
    visualizer.setRendererSize(width, height);
    wake();
  };
  const stopCapture = () => {
    if (stream) for (const track of stream.getTracks()) {
      if (stopped) track.removeEventListener('ended', stopped);
      track.stop();
    }
    source?.disconnect(); source = undefined; stream = undefined; stopped = undefined;
  };
  const lost = (event: Event) => { event.preventDefault(); cancel(); failed(); };
  canvas.addEventListener('webglcontextlost', lost);
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('resize', resize);
  resize();
  return {
    resumeAudio: () => context.resume(),
    connect(capture: MediaStream, onEnded: () => void) {
      stopCapture();
      stream = capture;
      source = context.createMediaStreamSource(capture);
      visualizer.connectAudio(source);
      stopped = () => { stopCapture(); onEnded(); };
      for (const track of capture.getTracks()) track.addEventListener('ended', stopped);
    },
    stopCapture,
    pause(value: boolean) { paused = value; wake(); if (paused && !document.hidden) { try { visualizer.render(); } catch { failed(); } } },
    dispose() {
      disposed = true; cancel(); stopCapture();
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('webglcontextlost', lost);
      void context.close();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  };
}
export type MilkDrop = ReturnType<typeof createMilkDrop>;
