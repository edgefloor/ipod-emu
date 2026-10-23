import test from 'node:test';
import assert from 'node:assert/strict';
import { ShakeDetector } from '../src/motion';
import { DiskErrorScreen } from '../src/screens/disk-error';
import { device } from './helpers';

test('normal handling and a single impact do not corrupt the disk', () => {
  const detector = new ShakeDetector();
  for (let time = 0; time < 2000; time += 100) assert.equal(detector.sample({ x: 4, y: 3, z: 9.8 }, time), false);
  assert.equal(detector.sample({ x: 40, y: 0, z: 0 }, 2100), false);
  assert.equal(detector.sample({ x: 40, y: 0, z: 0 }, 2200), false);
  assert.equal(detector.sample(null, 2300), false);
});

test('repeated hard reversals trigger once, with a cooldown', () => {
  const detector = new ShakeDetector();
  assert.equal(detector.sample({ x: 30, y: 0, z: 0 }, 100), false);
  assert.equal(detector.sample({ x: -30, y: 0, z: 0 }, 250), false);
  assert.equal(detector.sample({ x: 30, y: 0, z: 0 }, 400), true);
  for (let time = 500; time < 8000; time += 100) assert.equal(detector.sample({ x: time % 200 ? -30 : 30, y: 0, z: 0 }, time), false);
});

test('widely separated impacts do not accumulate', () => {
  const detector = new ShakeDetector();
  for (let time = 0; time < 5000; time += 1000) assert.equal(detector.sample({ x: time % 2000 ? -35 : 35, y: 0, z: 0 }, time), false);
});

test('disk recovery restores navigation without changing the library or settings', () => {
  const ipod = device();
  const original = ipod.top();
  const library = ipod.deck;
  const settings = { ...ipod.settings };
  ipod.push(new DiskErrorScreen(ipod));
  assert.match(document.getElementById('content')!.textContent!, /Hard drive corrupted/);
  ipod.top()!.onCenter();
  assert.equal(ipod.top(), original);
  assert.equal(ipod.deck, library);
  assert.deepEqual(ipod.settings, settings);
  clearTimeout(ipod.dimTimer);
});
