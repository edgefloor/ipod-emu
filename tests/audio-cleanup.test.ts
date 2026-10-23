import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers';
import { AudioEngine } from '../src/audio';
import { DEFAULTS } from '../src/settings';

test('repeated demo play/pause/stop releases gain connections', () => {
  let connected = 0;
  const engine = new AudioEngine(DEFAULTS);
  engine.ctx = {
    state: 'running', currentTime: 0, destination: {},
    createBufferSource: () => ({ buffer: null, connect: (node: unknown) => node, start() {}, stop() {}, disconnect() {} }),
    createGain: () => ({ gain: { value: 0 }, connect() { connected++; }, disconnect() { connected--; } })
  } as unknown as AudioContext;
  engine.requestBuffer = () => ({} as AudioBuffer);
  for (let i = 0; i < 100; i++) {
    engine.boot({ id: i, trackName: 'Demo', artistName: 'Test', duration: 30 });
    engine.toggle();
    engine.toggle();
    engine.stop();
  }
  assert.equal(connected, 0);
});
