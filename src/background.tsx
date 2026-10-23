import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CRTWarp from './components/CRTWarp';

function Background() {
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return <>
    <div className="ambient-picture" aria-hidden="true">
      <CRTWarp color="#8fa5b2" backgroundColor="#131415" mask="aperture"
        curvature={0.25} persistence={0.4} speed={0.16} brightness={0.38}
        bloom={0.65} noise={0.035} flicker={0} interference={0.04}
        vignette={0.65} scanlineStrength={0.5} rgbShift={0.001}
        mouseReact={false} changeOnClick={false} intro={!reduced}
        paused={paused || reduced} dpr={1} fps={24} style={{}} />
    </div>
    {!reduced && <button className="ambient-toggle" type="button" aria-pressed={paused}
      onKeyDown={event => event.stopPropagation()}
      onClick={() => setPaused(value => !value)}>{paused ? 'Animate background' : 'Pause background'}</button>}
  </>;
}

export function installBackground() {
  const host = document.getElementById('ambient-root');
  if (host) createRoot(host).render(<Background />);
}
