const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({ document: { addEventListener() {} }, window: {}, console, setTimeout, clearTimeout, performance, localStorage: { setItem() {} } });
vm.runInContext(fs.readFileSync('data.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('ipod.js', 'utf8'), context);
const run = code => vm.runInContext(code, context);

test('home matches the reference hierarchy', () => {
  assert.equal(run(`new MainMenuScreen({}).visibleRows.map(r=>r.title).join(',')`), 'Music,Extras,Settings,Shuffle Songs,Backlight');
});
test('shuffle preserves the song explicitly selected', () => {
  assert.equal(run(`(() => { const d=Object.create(Ipod.prototype); d.settings={shuffle:true}; d.audio={ensureContext(){},boot(){}}; d.wake=()=>{}; d.push=()=>{}; const songs=[{id:1},{id:2},{id:3}]; const random=Math.random; Math.random=()=>0; try {d.play(songs,1);return d.current.id;}finally{Math.random=random;} })()`), 2);
});
test('backlight Off removes an existing backlight', () => {
  assert.equal(run(`(() => {let lit=true;document.getElementById=()=>({classList:{add(){lit=true},remove(){lit=false},toggle(_,on){lit=on}}});const d=Object.create(Ipod.prototype);d.settings={backlight:0};d.wake();return lit;})()`), false);
});
test('Brick includes destructible bricks', () => {
  assert.ok(run(`new BrickScreen({}).bricks?.length > 0`));
});

test('scrolling within the visible window does not jump the window', () => {
  assert.equal(run(`(() => {const s=new MenuScreen({},'Songs',Array.from({length:10},()=>({title:'Song'})));s.scrollTop=4;s.sel=8;return s.visibleRange;})()`), 4);
});
test('Music categories match the reference', () => {
  assert.equal(run(`new MusicScreen({}).rows.map(r=>r.title).join(',')`), 'Playlists,Artists,Albums,Songs,Genres,Composers');
});
test('Brick ceiling reflects vertical velocity', () => {
  assert.equal(run(`(() => {const g=new BrickScreen({audio:{blip(){}}});g.launched=true;g.ball={x:50,y:1.1,dx:10,dy:-48};g.advance(0.01);return g.ball.dy>0 && g.ball.dx===10;})()`), true);
});
test('Brick collision destroys one brick and scores once', () => {
  assert.equal(run(`(() => {const g=new BrickScreen({audio:{blip(){}}});g.launched=true;g.ball={x:5,y:10,dx:0,dy:-48};g.advance(0.04);return g.score===1 && g.bricks.filter(b=>!b.alive).length===1 && g.ball.dy>0;})()`), true);
});
test('Brick paddle bounce does not award points', () => {
  assert.equal(run(`(() => {const g=new BrickScreen({audio:{blip(){}}});g.launched=true;g.ball={x:50,y:94,dx:0,dy:48};g.advance(0.04);return g.score===0 && g.ball.dy<0;})()`), true);
});
test('Brick loses lives, ends, and restarts', () => {
  assert.equal(run(`(() => {const g=new BrickScreen({audio:{blip(){}}});g.render=()=>{};for(let i=0;i<3;i++){g.launched=true;g.ball={x:2,y:101,dx:0,dy:48};g.advance(0.05);}const ended=g.over && g.lives===0;g.onCenter();return ended && !g.over && g.lives===3 && g.launched && g.score===0;})()`), true);
});
test('Brick motion is independent of frame rate', () => {
  assert.equal(run(`(() => {const a=new BrickScreen({audio:{blip(){}}}),b=new BrickScreen({audio:{blip(){}}});a.launched=b.launched=true;for(let i=0;i<30;i++)a.advance(1/30);for(let i=0;i<120;i++)b.advance(1/120);return Math.abs(a.ball.x-b.ball.x)<0.0001 && Math.abs(a.ball.y-b.ball.y)<0.0001;})()`), true);
});
test('Clock formats local time and date and crosses midnight', () => {
  assert.equal(run(`(() => {const c=new ClockScreen({});c.timeEl={};c.dateEl={};c.update(new Date(2026,5,27,23,59,59));const before=c.timeEl.textContent==='23:59:59';c.update(new Date(2026,5,28,0,0,0));return before && c.timeEl.textContent==='0:00:00' && c.dateEl.textContent==='28 June 2026';})()`), true);
});
test('clearing all bricks starts a new board without resetting score or lives', () => {
  assert.equal(run(`(() => {const g=new BrickScreen({audio:{blip(){}}});g.bricks.forEach(b=>b.alive=false);g.bricks[0].alive=true;g.score=35;g.launched=true;g.ball={x:5,y:10,dx:0,dy:-48};g.advance(0.04);return g.score===36 && g.lives===3 && g.level===2 && !g.launched && g.bricks.every(b=>b.alive);})()`), true);
});
test('Backlight home action toggles both ways without the select button waking it first', () => {
  assert.equal(run(`(() => {let lit=true;document.getElementById=()=>({classList:{toggle(){lit=!lit}}});const d=Object.create(Ipod.prototype);d.audio={buttonPress(){}};d.wake=()=>{throw Error('Should not wake before toggling')};const menu=new MainMenuScreen(d);menu.sel=4;d.stack=[menu];d.select();const off=!lit;d.select();return off && lit;})()`), true);
});
test('grouped albums only play their own songs', () => {
  assert.equal(run(`(() => {let opened;const d={push(screen){opened=screen},play(songs){opened=songs}};const albums=musicGroups(d,window.IPOD_DATA.songs,'albumName','Albums');albums.rows.find(r=>r.title==='Night Bus').onSelect();opened.rows[0].onSelect();return opened.length===2 && opened.every(s=>s.albumName==='Night Bus');})()`), true);
});
test('wheel ticks and button presses use separate feedback paths', () => {
  assert.equal(run(`(() => {const heard=[];const d=Object.create(Ipod.prototype);d.audio={click(){heard.push('old')},wheelTick(){heard.push('wheel')},buttonPress(){heard.push('button')}};d.wake=()=>{};d.stack=[{onBack(){},onCenter(){},onNext(){},onPrevious(){},onPlay(){},onWheel(){}}];d.menu();d.select();d.next();d.previous();d.playPause();d.wheelStepBy(1);return heard.join(',');})()`), 'button,button,button,button,button,wheel');
});

test('Play in Songs starts the highlighted song even when another track is active', () => {
  assert.equal(run(`(() => {let selected;const songs=[{id:1,trackName:'One'},{id:2,trackName:'Two'}];const d={current:{id:99},play:(queue,index)=>{selected=queue[index].id;}};const screen=new SongsScreen(d,songs,'Songs');screen.sel=1;screen.onPlay();return selected;})()`), 2);
});

test('slow continuous wheel movement accumulates into navigation steps', () => {
  const steps = run(`(() => {
    const handlers={};let steps=0;
    const wheel={addEventListener:(name,fn)=>handlers[name]=fn,getBoundingClientRect:()=>({left:0,top:0,width:350,height:350}),classList:{add(){},remove(){}},setPointerCapture(){},dispatchEvent:event=>handlers[event.type]?.(event)};
    const old=document.getElementById;document.getElementById=()=>wheel;
    globalThis.CustomEvent=class {constructor(type,options){this.type=type;this.detail=options.detail;}};
    try {
      attachWheel({audio:{ensureContext(){}},wheelStepBy:step=>steps+=step});
      const pointer=angle=>({pointerId:1,button:0,clientX:175+140*Math.cos(angle*Math.PI/180),clientY:175+140*Math.sin(angle*Math.PI/180)});
      handlers.pointerdown(pointer(0));
      for(let angle=.5;angle<=90;angle+=.5) handlers.pointermove(pointer(angle));
      handlers.pointerup(pointer(90));
      return steps;
    } finally {document.getElementById=old;}
  })()`);
  assert.ok(steps > 0, `Expected navigation after a 90-degree drag, received ${steps} steps`);
});

test('touch capture transfer from a button does not terminate wheel dragging', () => {
  const steps = run(`(() => {
    const handlers={};let steps=0;
    const wheel={addEventListener:(name,fn)=>handlers[name]=fn,getBoundingClientRect:()=>({left:0,top:0,width:350,height:350}),classList:{add(){},remove(){}},setPointerCapture(){handlers.lostpointercapture({pointerId:1,target:{id:'btn-next'}});},dispatchEvent:event=>handlers[event.type]?.(event)};
    const old=document.getElementById;document.getElementById=()=>wheel;
    globalThis.CustomEvent=class {constructor(type,options){this.type=type;this.detail=options.detail;}};
    try {
      attachWheel({audio:{ensureContext(){}},wheelStepBy:step=>steps+=step});
      const pointer=angle=>({pointerId:1,button:0,clientX:175+140*Math.cos(angle*Math.PI/180),clientY:175+140*Math.sin(angle*Math.PI/180)});
      handlers.pointerdown(pointer(0));
      for(let angle=2;angle<=120;angle+=2) handlers.pointermove(pointer(angle));
      handlers.pointerup(pointer(120));
      return steps;
    } finally {document.getElementById=old;}
  })()`);
  assert.ok(steps > 0, `Capture transfer stopped navigation: ${steps} steps`);
});

test('audio retries resume after a mobile interruption', () => {
  assert.equal(run(`(() => {let resumed=0;const audio=new AudioEngine({clicker:true,volume:.5});audio.ctx={state:'interrupted',resume(){resumed++;return Promise.resolve();}};audio.ensureContext();return resumed;})()`), 1);
});

test('mobile device sizing ignores height-only changes but responds to rotation', () => {
  const result = run(`(() => {
    const oldWindow={...window}, oldRoot=document.documentElement, oldQuery=document.querySelector;
    const values={};document.documentElement={style:{setProperty:(key,value)=>values[key]=value}};
    document.querySelector=()=>null;
    window.matchMedia=()=>({matches:true});window.innerWidth=390;window.innerHeight=600;
    try {
      fitDevice();const initial=values['--device-scale'];
      window.innerHeight=820;fitDevice();const expanded=values['--device-scale'];
      window.innerWidth=820;window.innerHeight=390;fitDevice();
      return {initial,expanded,rotated:values['--device-scale']};
    } finally {Object.assign(window,oldWindow);document.documentElement=oldRoot;document.querySelector=oldQuery;}
  })()`);
  assert.equal(result.initial,result.expanded);
  assert.notEqual(result.initial,result.rotated);
});
