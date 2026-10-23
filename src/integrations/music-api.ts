import type { Track } from '../types';
import type { MusicKitSDK, MusicKitInstance, MusicResource } from './musickit-types';
export function requireSDK(): MusicKitSDK {
  if (!window.MusicKit) throw new Error('MusicKit unavailable');
  return window.MusicKit;
}
let sdkPromise: Promise<MusicKitSDK> | null = null;
export function loadSDK() {
  if (window.MusicKit) return Promise.resolve(window.MusicKit);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const finish = (error?: Error) => {
      clearTimeout(timer);
      document.removeEventListener('musickitloaded', ready);
      if (error) { script.remove(); sdkPromise = null; reject(error); }
      else if (window.MusicKit) resolve(window.MusicKit);
      else { sdkPromise = null; reject(new Error("MusicKit unavailable")); }
    };
    const ready = () => finish();
    const timer = setTimeout(() => finish(new Error('MusicKit did not load. Check your connection and try again.')), 20000);
    document.addEventListener('musickitloaded', ready, { once: true });
    script.src = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
    script.onerror = () => finish(new Error('MusicKit could not load. Check your connection and try again.'));
    document.head.append(script);
  });
  return sdkPromise;
}

export function validateToken(token: string) {
  try {
    const parts = token.split('.');
    const decode = (part: string): Record<string, unknown> => {
      const value: unknown = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
      if (!value || typeof value !== 'object') throw new Error('Invalid token');
      return value as Record<string, unknown>;
    };
    const header = decode(parts[0]), payload = decode(parts[1]);
    if (parts.length !== 3 || !parts[2] || header.alg !== 'ES256' || !header.kid || !payload.iss || (typeof payload.exp !== "number" || !Number.isFinite(payload.exp))) throw 0;
    if (payload.exp * 1000 <= Date.now()) throw new Error('This developer token has expired. Generate a new one.');
  } catch (error) {
    throw new Error(error instanceof Error && error.message.startsWith('This developer') ? error.message : 'Paste a valid Apple Music developer JWT, not a private .p8 key.');
  }
}

export function song(resource: MusicResource): Track {
  const a = resource.attributes || {};
  return { id: resource.id, trackName: a.name || 'Unknown song', artistName: a.artistName || 'Unknown artist',
    albumName: a.albumName || '', genre: a.genreNames?.[0] || '', composer: a.composerName || '',
    duration: (a.durationInMillis || 0) / 1000, musicKitItem: resource };
}

export async function pages(music: Pick<MusicKitInstance, "api">, path: string | undefined) {
  const result: MusicResource[] = [], visited = new Set<string>();
  while (path) {
    // Only follow Apple library paths; never send credentials to an arbitrary next URL.
    path = path.replace(/^\//, '');
    if (!path.startsWith('v1/me/library/') || visited.has(path)) throw new Error('Invalid library pagination.');
    visited.add(path);
    const { data } = await music.api.music(path);
    result.push(...(data.data || []));
    path = data.next;
  }
  return result;
}

