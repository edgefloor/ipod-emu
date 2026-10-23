import { Ipod } from '../src/device';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { device, browser } from './helpers';
import { MainMenuScreen, BrowserScreen, MusicScreen, SongsScreen, musicGroups } from '../src/screens/library';
import { MenuScreen, ListScreen } from '../src/screens/base';
import { SettingsScreen, ChoiceScreen, ConfirmScreen } from '../src/screens/settings';
import { BrickScreen } from '../src/screens/brick';
import { ClockScreen } from '../src/screens/clock';
import { DEFAULTS, loadSettings, normalizeSettings, persist } from '../src/settings';
import { ICON_PIXELS } from '../src/icons';
import { DEMO_LIBRARY } from '../src/data';

test('home follows the recovered flat menu, with browser additions kept together', () => {
  const d = device();
  const home = new MainMenuScreen(d);
  assert.deepEqual(home.visibleRows.map(r => r.title), ['Playlists','Artists','Songs','Settings','About','Browser']);
  d.current = d.deck.songs[0];
  assert.equal(home.visibleRows[5].title, 'Now Playing');
  assert.equal(new BrowserScreen(d).rows[0].title, 'Apple Music');
});
test('settings and timer orders match the recovered resource definitions', () => {
  const d = device(); const settings = new SettingsScreen(d); d.push(settings);
  assert.deepEqual(settings.rows.map(r => r.title), ['Shuffle','Repeat','Backlight Timer','Contrast','Clicker','Sleep Timer','Startup Volume','Language','Reset All Settings']);
  settings.sel = 2; settings.onCenter();
  const choices = d.top() as ChoiceScreen<number>;
  assert.deepEqual(choices.rows.map(r => r.title), ['Off','1 Sec','2 Sec','3 Sec','5 Sec','Always On']);
  assert.equal(choices.sel, 5);
  choices.sel = 0; choices.onCenter();
  assert.equal(d.top(), settings); assert.equal(loadSettings().backlight, 0);
  assert.equal(browser.document.querySelector('#screen')!.classList.contains('backlit'), false);
  settings.onCenter(); assert.equal((d.top() as MenuScreen).sel, 0);
  (d.top() as MenuScreen).sel = 5; d.select();
  assert.equal(d.settings.backlight, -1);
  assert.equal(browser.document.querySelector('#screen')!.classList.contains('backlit'), true);
});
test('timed backlight choice persists, while cancel leaves it unchanged', () => {
  const d = device(); const settings = new SettingsScreen(d); d.push(settings);
  settings.sel = 2; settings.onCenter(); (d.top() as MenuScreen).sel = 2; d.select();
  assert.equal(loadSettings().backlight, 2); clearTimeout(d.dimTimer);
  settings.onCenter(); (d.top() as MenuScreen).sel = 4; d.pop();
  assert.equal(d.settings.backlight, 2);
});
test('sleep timer pauses once at its deadline and Off cancels it', () => {
  const d = device(); const settings = new SettingsScreen(d); d.push(settings);
  settings.sel = 5; settings.onCenter();
  assert.deepEqual((d.top() as MenuScreen).rows.map(r => r.title), ['Off','5 Minutes','10 Minutes','15 Minutes','30 Minutes','60 Minutes']);
  (d.top() as MenuScreen).sel = 1; d.select(); assert.equal(d.sleepMinutes, 5);
  let paused = 0;
  Object.defineProperty(d.audio, 'playing', { get: () => true });
  d.audio.toggle = () => { paused++; return false; };
  const deadline = d.sleepDeadline!; d.checkSleepTimer(deadline - 1); assert.equal(paused, 0);
  d.checkSleepTimer(deadline); d.checkSleepTimer(deadline + 1); assert.equal(paused, 1);
  d.setSleepTimer(5); d.setSleepTimer(-1); d.checkSleepTimer(deadline + 999999); assert.equal(paused, 1);
});
test('reset is a Cancel-first list and applies defaults only after confirmation', () => {
  const d = device(); d.settings.shuffle = true; persist(d.settings);
  d.push(new ConfirmScreen(d)); d.select(); assert.equal(d.settings.shuffle, true);
  d.push(new ConfirmScreen(d)); (d.top() as MenuScreen).sel = 1; d.select();
  assert.deepEqual(d.settings, DEFAULTS); assert.deepEqual(loadSettings(), DEFAULTS);
});
test('settings reject malformed storage and retain valid older preferences', () => {
  assert.deepEqual(normalizeSettings({ volume: -5, repeat: 'garbage', backlight: 999, clicker: 'no', contrast: null }), DEFAULTS);
  assert.equal(normalizeSettings({ clicker: false, volume: .4 }).volume, .4);
  assert.equal(normalizeSettings(null).backlight, -1);
});
test('startup volume applies on creation without altering its stored preference', () => {
  device(); persist({ ...DEFAULTS, startupVolume: .25 });
  const next = new Ipod();
  assert.equal(next.audio.volume, .25); assert.equal(next.settings.startupVolume, .25);
});
test('shuffle and Songs Play retain the explicitly selected track', () => {
  const d = device(); d.audio.boot = () => {}; d.settings.shuffle = true;
  const songs = d.deck.songs; d.play(songs, 1); assert.equal(d.current, songs[1]);
  assert.equal(d.sequence[d.position], songs[1]);
  const list = new SongsScreen(d, songs, 'Songs'); list.sel = 3; list.onPlay(); assert.equal(d.current, songs[3]);
});
test('scrolling inside a visible window keeps the window stable', () => {
  const list = new MenuScreen(device(), 'Songs', Array.from({ length: 10 }, () => ({ title: 'Song' })));
  list.scrollTop = 4; list.sel = 8; assert.equal(list.visibleRange, 4);
  list.moveSel(-1); assert.equal(list.scrollTop, 4);
});
test('album browsing scopes playback to that album', () => {
  const d = device(); d.audio.boot = () => {};
  const albums = musicGroups(d, DEMO_LIBRARY.songs, 'albumName', 'Albums');
  albums.rows.find(r => r.title === 'Night Bus')!.onSelect!(); d.select();
  assert.equal(d.sequence.length, 2); assert.ok(d.sequence.every(s => s.albumName === 'Night Bus'));
  assert.equal(new MusicScreen(d).rows.length, 6);
});
test('browser Backlight toggles without the select button waking it first', () => {
  const d = device(); const menu = new BrowserScreen(d); menu.sel = 4; d.push(menu);
  d.select(); assert.equal(browser.document.querySelector('#screen')!.classList.contains('backlit'), false);
  d.select(); assert.equal(browser.document.querySelector('#screen')!.classList.contains('backlit'), true);
});
test('wheel and buttons retain distinct feedback paths', () => {
  const d = device(); const heard: string[] = [];
  d.audio.buttonPress = () => heard.push('button'); d.audio.wheelTick = () => heard.push('wheel');
  d.menu(); d.select(); d.next(); d.previous(); d.playPause(); d.wheelStepBy(1);
  assert.deepEqual(heard, ['button','button','button','button','button','wheel']);
});
test('clock crosses midnight using local time', () => {
  const clock = new ClockScreen(device()); clock.render();
  clock.update(new Date(2026,5,27,23,59,59)); assert.equal(clock.timeEl.textContent, '23:59:59');
  clock.update(new Date(2026,5,28)); assert.equal(clock.timeEl.textContent, '0:00:00'); assert.equal(clock.dateEl.textContent, '28 June 2026');
});
test('Brick handles walls, bricks, paddle, loss and restart', () => {
  const g = new BrickScreen(device()); g.device.audio.blip = () => {};
  assert.equal(g.bricks.length, 36); g.launched = true;
  g.ball = {x:50,y:1.1,dx:10,dy:-48}; g.advance(.01); assert.ok(g.ball.dy > 0); assert.equal(g.ball.dx,10);
  g.ball = {x:5,y:10,dx:0,dy:-48}; g.advance(.04); assert.equal(g.score,1); assert.ok(g.ball.dy > 0);
  g.ball = {x:50,y:94,dx:0,dy:48}; g.advance(.04); assert.equal(g.score,1); assert.ok(g.ball.dy < 0);
  for (let i=0; i<3; i++) { g.launched=true; g.ball={x:2,y:101,dx:0,dy:48}; g.advance(.05); }
  assert.ok(g.over); g.onCenter(); assert.equal(g.lives,3); assert.equal(g.score,0); assert.ok(g.launched);
});
test('Brick clearing a board retains score; motion is frame-rate independent', () => {
  const d = device(); d.audio.blip = () => {};
  const g = new BrickScreen(d); g.bricks.forEach(b => b.alive=false); g.bricks[0].alive=true; g.score=35; g.launched=true;
  g.ball={x:5,y:10,dx:0,dy:-48}; g.advance(.04); assert.equal(g.level,2); assert.equal(g.score,36); assert.ok(g.bricks.every(b=>b.alive));
  const a=new BrickScreen(d), b=new BrickScreen(d); a.launched=b.launched=true;
  for(let i=0;i<30;i++) a.advance(1/30); for(let i=0;i<120;i++) b.advance(1/120);
  assert.ok(Math.abs(a.ball.x-b.ball.x)<.0001 && Math.abs(a.ball.y-b.ball.y)<.0001);
});
test('battery stages retain identical outline and evenly spaced segments', () => {
  const stages = [ICON_PIXELS.batteryEmpty, ICON_PIXELS.batteryQuarter, ICON_PIXELS.batteryHalf, ICON_PIXELS.batteryThreeQuarters, ICON_PIXELS.batteryFull];
  for (const [stage, rows] of stages.entries()) {
    assert.equal(rows.length,10); assert.ok(rows.every(row=>row.length===25)); assert.equal(rows[0], stages[0][0]);
    for(let segment=0;segment<4;segment++) assert.equal(rows[4].slice(5+segment*4,8+segment*4), segment<stage?'333':'111');
  }
});
test('touch transitions render immediately and leave no temporary panes', () => {
  const d=device(); d.push(new SettingsScreen(d)); d.pop(); d.push(new SongsScreen(d,d.deck.songs,'Songs'));
  assert.equal(browser.document.querySelectorAll('.pane').length,0); assert.equal(d.ui.sliding,false);
  assert.equal(browser.document.querySelector('#statusbar-title')!.textContent,'Songs');
});

test('empty folders retain a harmless visible row after construction', () => {
  const d = device(); const list = new ListScreen(d, 'Empty', []); d.push(list);
  assert.equal(list.visibleRows.length, 1); assert.equal(list.visibleRows[0].title, '(empty)');
  list.onCenter(); assert.equal(d.current, null); assert.equal(d.top(), list);
});
