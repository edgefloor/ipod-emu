import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { MilkDrop } from './milkdrop-runtime';
import CRTWarp from './components/CRTWarp';

function Background() {
  const [mode, setMode] = useState<'crt' | 'milkdrop' | 'off'>('crt');
  const [message, setMessage] = useState('');
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [pending, setPending] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<MilkDrop | null>(null);
  const request = useRef(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (mode !== 'milkdrop' || !canvas.current) return;
    let cancelled = false;
    const target = canvas.current;
    setMessage('Loading MilkDrop…');
    const moduleUrl = new URL('milkdrop.js', document.baseURI).href;
    void import(/* @vite-ignore */ moduleUrl).then((module: typeof import('./milkdrop-runtime')) => {
      if (cancelled) return;
      runtime.current = module.createMilkDrop(target, () => {
        setMode('off'); setMessage('The graphics renderer stopped. Select MilkDrop to try again.');
      });
      runtime.current.pause(paused || reduced);
      setReady(true); setMessage('Choose this tab and enable “Share tab audio” in the browser prompt.');
    }).catch(() => { if (!cancelled) { setMode('off'); setMessage('MilkDrop could not start. Your browser needs WebGL 2.'); } });
    return () => {
      cancelled = true; request.current += 1;
      runtime.current?.dispose(); runtime.current = null;
      setReady(false); setCapturing(false); setPending(false);
    };
    // Pause changes are applied separately, without rebuilding the renderer.
  }, [mode]);
  useEffect(() => { runtime.current?.pause(paused || reduced); }, [paused, reduced, ready]);
  useEffect(() => {
    const stop = () => { request.current += 1; runtime.current?.stopCapture(); setCapturing(false); setPending(false); };
    window.addEventListener('pagehide', stop);
    return () => window.removeEventListener('pagehide', stop);
  }, []);
  const capture = async () => {
    const current = runtime.current;
    if (!current || pending) return;
    const id = ++request.current;
    setPending(true); setMessage('Choose this tab and turn on Share tab audio.');
    let stream: MediaStream | undefined;
    try {
      // Both calls originate directly in the user's click, before any await.
      const resumed = current.resumeAudio();
      const options: DisplayMediaStreamOptions & { preferCurrentTab: boolean; selfBrowserSurface: string; audio: MediaTrackConstraints & { suppressLocalAudioPlayback: boolean } } = { video: true, audio: { suppressLocalAudioPlayback: false }, preferCurrentTab: true, selfBrowserSurface: 'include' };
      void resumed.catch(() => {});
      const shared = navigator.mediaDevices.getDisplayMedia(options);
      stream = await shared;
      if (id !== request.current) { stream.getTracks().forEach(track => track.stop()); return; }
      if (!stream.getAudioTracks().length) throw new Error('no-audio');
      await resumed;
      if (id !== request.current) { stream.getTracks().forEach(track => track.stop()); return; }
      current.connect(stream, () => { setCapturing(false); setMessage('Sharing stopped. Enable music reaction to reconnect.'); });
      setCapturing(true); setMessage('Reacting to shared tab audio. Nothing is recorded or uploaded.');
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      if (id !== request.current) return;
      setMessage(error instanceof Error && error.message === 'no-audio'
        ? 'No audio was shared. Try again, choose this tab, and enable Share tab audio. If that option is missing, this browser cannot share tab audio.'
        : 'Sharing did not start. You can try again, or keep the ambient visuals.');
    } finally { if (id === request.current) setPending(false); }
  };
  return <>
    <div className="ambient-picture" aria-hidden="true">
      {mode === 'milkdrop' && <canvas className="milkdrop-canvas" ref={canvas} />}
      {mode === 'crt' && <CRTWarp color="#8fa5b2" backgroundColor="#131415" mask="aperture"
        curvature={0.25} persistence={0.4} speed={0.16} brightness={0.38}
        bloom={0.65} noise={0.035} flicker={0} interference={0.04}
        vignette={0.65} scanlineStrength={0.5} rgbShift={0.001}
        mouseReact={false} changeOnClick={false} intro={!reduced}
        paused={paused || reduced} dpr={1} fps={24} style={{}} />}
    </div>
    <div className="ambient-controls" onKeyDown={event => event.stopPropagation()}>
      {!reduced && mode !== 'off' && <button className="ambient-toggle" type="button" aria-pressed={paused}
        onClick={() => setPaused(value => !value)}>{paused ? 'Animate background' : 'Pause background'}</button>}
      <details className="ambient-settings">
        <summary>Background</summary>
        <div className="ambient-settings-panel">
          <label htmlFor="background-mode">Visuals</label>
          <select id="background-mode" value={mode} onChange={event => { setMode(event.target.value as typeof mode); setMessage(''); }}>
            <option value="crt">CRT</option><option value="milkdrop">MilkDrop</option><option value="off">Off</option>
          </select>
          {mode === 'milkdrop' && <>
            <p>Winamp-style visuals for your YouTube music.</p>
            {typeof navigator.mediaDevices?.getDisplayMedia === 'function' ? <>
              <button type="button" disabled={!ready || pending} onClick={capturing ? () => {
                runtime.current?.stopCapture(); setCapturing(false); setMessage('Sharing stopped. Ambient visuals are still available.');
              } : capture}>{pending ? 'Waiting for browser…' : capturing ? 'Stop sharing audio' : 'Enable music reaction'}</button>
              <p>Tab audio sharing works in desktop Chrome and Edge. Select this player’s tab and include its audio. The browser also requests video sharing; we only analyze the audio.</p>
            </> : <p>This browser cannot share tab audio. Use desktop Chrome or Edge for music reaction. Here, MilkDrop is ambient only.</p>}
            {reduced && <p>Animation is paused by your reduced-motion preference.</p>}
          </>}
          {message && <p role="status">{message}</p>}
        </div>
      </details>
    </div>
  </>;
}

export function installBackground() {
  const host = document.getElementById('ambient-root');
  if (host) createRoot(host).render(<Background />);
}
