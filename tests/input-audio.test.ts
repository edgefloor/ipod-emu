import { test } from 'node:test';
import assert from 'node:assert/strict';
import { device, browser } from './helpers';
import { AudioEngine } from '../src/audio';
import { DEFAULTS } from '../src/settings';
import { attachWheel, fitDevice } from '../src/input';

for (const transfer of [false, true]) test(`slow wheel movement navigates with capture transfer=${transfer}`, () => {
  const d = device(); let steps = 0; d.wheelStepBy = step => { steps += step; };
  const wheel = browser.document.getElementById('wheel')!;
  wheel.getBoundingClientRect = () => new browser.DOMRect(0, 0, 350, 350);
  wheel.setPointerCapture = () => {
    if (transfer) browser.document.getElementById('btn-next')!.dispatchEvent(new browser.PointerEvent('lostpointercapture', {pointerId:1,bubbles:true}));
  };
  attachWheel(d);
  const event = (type: string, angle: number) => new browser.PointerEvent(type, {
    pointerId:1, button:0, isPrimary:true, clientX:175+140*Math.cos(angle*Math.PI/180), clientY:175+140*Math.sin(angle*Math.PI/180)
  });
  wheel.dispatchEvent(event('pointerdown',0));
  for(let angle=.5;angle<=120;angle+=.5) wheel.dispatchEvent(event('pointermove',angle));
  wheel.dispatchEvent(event('pointerup',120));
  assert.ok(steps > 0);
});
test('mobile geometry is stable during height changes and adapts to rotation', () => {
  device(); browser.innerWidth=390; browser.innerHeight=600; fitDevice();
  const initial=browser.document.documentElement.style.getPropertyValue('--device-scale');
  browser.innerHeight=820; fitDevice(); assert.equal(browser.document.documentElement.style.getPropertyValue('--device-scale'),initial);
  browser.innerWidth=820; browser.innerHeight=390; fitDevice(); assert.notEqual(browser.document.documentElement.style.getPropertyValue('--device-scale'),initial);
});
test('feedback retries a suspended or interrupted context', async () => {
  device(); let starts=0, resumed=0;
  let release!: () => void; const ready=new Promise<void>(resolve=>{release=resolve;});
  const node=()=>({connect(){return this;},disconnect(){},gain:{value:0},pan:{value:0},start(){starts++;}});
  const fake={state:'interrupted',currentTime:0,resume(){resumed++;return ready;},createBufferSource:node,createGain:node,createStereoPanner:node,destination:{}};
  const audio=new AudioEngine(DEFAULTS); audio.ctx=fake as unknown as AudioContext;
  audio.ensureContext(); assert.equal(resumed,1);
  audio.playFeedback({} as AudioBuffer,.2,0); assert.equal(starts,0);
  fake.state='running'; release(); await ready; await Promise.resolve(); assert.equal(starts,1);
});
test('only the latest pending feedback plays after activation', async () => {
  device(); const buffers: AudioBuffer[]=[]; let release!:()=>void;
  const ready=new Promise<void>(resolve=>{release=resolve;});
  const node=()=>({buffer:null as AudioBuffer|null,connect(){return this;},disconnect(){},gain:{value:0},pan:{value:0},start(){if(this.buffer) buffers.push(this.buffer);}});
  const fake={state:'suspended',currentTime:0,resume:()=>ready,createBufferSource:node,createGain:node,createStereoPanner:node,destination:{}};
  const audio=new AudioEngine(DEFAULTS); audio.ctx=fake as unknown as AudioContext;
  const first={} as AudioBuffer, second={} as AudioBuffer;
  audio.playFeedback(first,.2,0); audio.playFeedback(second,.2,0);
  fake.state='running';release();await ready;await Promise.resolve();assert.deepEqual(buffers,[second]);
});
test('feedback keeps one silent output source active without starting music', () => {
  device();let starts=0,stops=0;
  const sources: Array<{loop?:boolean}> = [];
  const audio=new AudioEngine(DEFAULTS);
  audio.ctx={state:'running',sampleRate:48000,destination:{},createBuffer:()=>({}),createBufferSource:()=>{
    const source={loop:false,connect(){},disconnect(){},start(){starts++;},stop(){stops++;}};sources.push(source);return source;
  }} as unknown as AudioContext;
  audio.unlock();audio.unlock();assert.equal(starts,1);assert.equal(sources[0].loop,true);assert.equal(audio.source,null);
  audio.releaseOutput();assert.equal(stops,1);
});

test('activation retries a primer started before the browser accepted a gesture', () => {
  device(); let starts = 0, stops = 0;
  const fake = {
    state: 'suspended', sampleRate: 48000, destination: {}, resume: async () => {},
    createBuffer: () => ({}), createBufferSource: () => ({
      loop: false, connect() {}, disconnect() {}, start() { starts++; }, stop() { stops++; }
    })
  };
  const audio = new AudioEngine(DEFAULTS); audio.ctx = fake as unknown as AudioContext;
  audio.unlock(); // pointerdown may arrive before WebKit accepts touch activation
  audio.unlock(); // retry start() inside the subsequent touchstart gesture
  assert.equal(starts, 2); assert.equal(stops, 1);
  fake.state = 'running'; audio.unlock(); assert.equal(starts, 2);
});

test('wheel detents keep the newest feedback pending while the audio clock is stopped', () => {
  device(); const heard: number[] = [];
  const fake = { state: 'suspended', currentTime: 0, resume: async () => {} };
  const audio = new AudioEngine(DEFAULTS); audio.ctx = fake as unknown as AudioContext;
  audio.tickBuffer = () => ({} as AudioBuffer);
  audio.playFeedback = (_buffer, _volume, _pan, at) => { heard.push(at ?? fake.currentTime); };
  for (let i = 0; i < 8; i++) audio.wheelTick();
  assert.equal(heard.length, 8, 'No frozen-clock queue limit may discard the newest detent');
  assert.equal(audio.nextClickAt, 0);
  fake.state = 'running'; fake.currentTime = 1; audio.wheelTick();
  assert.equal(heard.at(-1), 1);
});
