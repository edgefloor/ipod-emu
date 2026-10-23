import test from 'node:test';
import assert from 'node:assert/strict';
import { YouTubeMetadataLoader } from '../src/integrations/youtube-metadata';

test('metadata reads titles and channels as text and deduplicates requests', async () => {
  let calls = 0;
  const loader = new YouTubeMetadataLoader(async () => {
    calls++; return new Response(JSON.stringify({ title: 'A & B <live>', author_name: 'Artist channel', html: '<script>bad()</script>' }));
  });
  const [a, b] = await Promise.all([loader.load('https://www.youtube.com/watch?v=test'), loader.load('https://www.youtube.com/watch?v=test')]);
  assert.deepEqual(a, { title: 'A & B <live>', author: 'Artist channel' });
  assert.deepEqual(a, b); assert.equal(calls, 1); loader.dispose();
});

test('metadata failures settle without preventing playback or returning invented titles', async () => {
  const loader = new YouTubeMetadataLoader(async () => new Response('Unavailable', { status: 404 }));
  assert.equal(await loader.load('https://www.youtube.com/watch?v=private'), null);
  loader.dispose();
  assert.equal(await loader.load('another'), null);
});

test('large playlists limit metadata requests and disposal releases queued work', async () => {
  let active = 0, peak = 0;
  const loader = new YouTubeMetadataLoader((_url, options) => new Promise((_resolve, reject) => {
    active++; peak = Math.max(active, peak);
    options!.signal!.addEventListener('abort', () => { active--; reject(new Error('aborted')); });
  }));
  const work = Array.from({ length: 30 }, (_, i) => loader.load(`video-${i}`));
  assert.equal(peak, 4);
  loader.dispose();
  assert.deepEqual(await Promise.all(work), Array(30).fill(null));
});
