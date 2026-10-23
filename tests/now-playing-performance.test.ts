import test from 'node:test';
import assert from 'node:assert/strict';
import { device } from './helpers';
import { NowPlayingScreen } from '../src/screens/now-playing';

test('playback updates retain LCD nodes across a long session and refresh metadata', () => {
  const ipod = device();
  ipod.current = { id: 'long-session', trackName: 'Original title', artistName: 'Artist', duration: 240 };
  ipod.sequence = [ipod.current]; ipod.position = 0;
  const screen = new NowPlayingScreen(ipod); ipod.push(screen);
  const root = ipod.ui.contentEl.firstChild;
  const title = ipod.ui.contentEl.querySelector('.title');
  for (let i = 0; i < 1000; i++) screen.render();
  assert.ok(ipod.ui.contentEl.firstChild === root, 'timer updates must not rebuild the LCD');
  assert.ok(ipod.ui.contentEl.querySelector('.title') === title);
  ipod.current.trackName = 'Resolved title'; screen.render();
  assert.equal(ipod.ui.contentEl.querySelector('.title')?.textContent, 'Resolved title');
  ipod.volumeVisibleUntil = Date.now() + 1000; screen.render();
  assert.ok(ipod.ui.contentEl.querySelector('.np__volume'));
  ipod.volumeVisibleUntil = 0; screen.render();
  assert.ok(ipod.ui.contentEl.querySelector('[data-testid=np-progress]'));
  clearTimeout(ipod.dimTimer);
});
