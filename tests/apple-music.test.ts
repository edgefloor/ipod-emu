import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { generateKeyPairSync, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import { validateToken, pages, song } from '../src/integrations/music-api';
import { AppleMusicPlayer } from '../src/integrations/music-player';
import type { PlaybackHost } from '../src/integrations/music-player';
import type { MusicKitInstance, MusicResource } from '../src/integrations/musickit-types';
import { DEFAULTS } from '../src/settings';
import './helpers';
const token = (exp: number) => [ {alg:'ES256',kid:'test'}, {iss:'test',exp} ].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).concat('mock-signature').join('.');

test('token preflight rejects private keys, malformed and expired JWTs', () => {
  assert.throws(()=>validateToken('-----BEGIN PRIVATE KEY-----'), /developer JWT/);
  assert.throws(()=>validateToken(token(1)), /expired/);
  assert.doesNotThrow(()=>validateToken(token(Date.now()/1000+60)));
});
test('library pagination follows next links and preserves page order', async () => {
  const calls: string[]=[];
  const music={api:{music:async (path: string)=>{calls.push(path);return {data:calls.length===1?{data:[{id:'1'}],next:'/v1/me/library/songs?offset=1'}:{data:[{id:'2'}]}};}}};
  assert.equal((await pages(music,'v1/me/library/songs')).map(x=>x.id).join(','),'1,2');
  assert.equal(calls[1],'v1/me/library/songs?offset=1');
});
test('pagination rejects foreign URLs and loops', async () => {
  for (const next of ['https://example.com/steal','/v1/me/library/songs']) {
    await assert.rejects(pages({api:{music:async()=>({data:{data:[],next}})}},'v1/me/library/songs'), /pagination/);
  }
});
test('song mapping preserves resource and duration in seconds', () => {
  const resource={id:'i.1',attributes:{name:'Song',durationInMillis:213000,genreNames:['Jazz']}};
  const mapped=song(resource);
  assert.equal(mapped.duration,213); assert.equal(mapped.musicKitItem,resource); assert.equal(mapped.genre,'Jazz');
});
function fixture() {
  const events=new Map<string, () => void>(), calls: Array<{items: MusicResource[]}> = [];
  const music: MusicKitInstance={api:{music:async()=>({data:{data:[]}})},authorize:async()=>"",unauthorize:async()=>{},repeatMode:0,shuffleMode:0,skipToPreviousItem:async()=>{},volume:1,isPlaying:false,currentPlaybackTime:47,currentPlaybackDuration:213,nowPlayingItemIndex:0,
    addEventListener:(key,fn)=>events.set(key,fn),removeEventListener:key=>events.delete(key),
    setQueue:async q=>calls.push(q),changeToMediaAtIndex:async i=>{music.nowPlayingItemIndex=i;music.isPlaying=true;},
    pause:async()=>{music.isPlaying=false;},play:async()=>{music.isPlaying=true;},stop:async()=>{music.isPlaying=false;},
    seekToTime:async n=>{music.currentPlaybackTime=n;},skipToNextItem:async()=>{music.nowPlayingItemIndex++;events.get('nowPlayingItemDidChange')?.();}};
  window.MusicKit={configure:async()=>{},getInstance:()=>music,PlayerRepeatMode:{none:0,one:1,all:2},PlayerShuffleMode:{off:0,songs:1}};
  const device: PlaybackHost={position:0,current:null,get player(){return player;},settings:{...DEFAULTS,volume:.4,repeat:'all',shuffle:true},sequence:[song({id:'1'}),song({id:'2'})],ui:{syncChrome(){}}};
  const errors: string[]=[];const player=new AppleMusicPlayer(music,device,e=>errors.push(e));
  return {music,device,player,events,calls,errors};
}
test('queue starts the selected song and uses actual time, volume and native modes', async () => {
  const {player,device,music,calls}=fixture();await player.queue(device.sequence,1);
  assert.equal(device.current?.id,'2'); assert.equal(calls[0].items.length,2); assert.equal(player.elapsed,47);assert.equal(player.duration,213);
  assert.equal(music.volume,.4);assert.equal(music.repeatMode,2);assert.equal(music.shuffleMode,1);
  await player.toggle();assert.equal(player.playing,false);
});
test('SDK queue events update the displayed track, previous restarts after three seconds', async () => {
  const {player,device}=fixture();await player.queue(device.sequence,0);await player.step(1);
  assert.equal(device.current?.id,'2');await player.step(-1);assert.equal(player.elapsed,0);
});
test('disposal stops playback and removes listeners even while a queue is loading', async () => {
  const {player,device,music,events}=fixture();let release!: () => void;
  music.setQueue=()=>new Promise<void>(resolve=>{release=resolve;});
  const pending=player.queue(device.sequence,0);await Promise.resolve();
  const disposed=player.dispose();release();await pending;await disposed;
  assert.equal(music.isPlaying,false);assert.equal(events.size,0);
});
test('playback errors do not expose SDK error messages or tokens', async () => {
  const {player,music,errors}=fixture();music.play=async()=>{throw new Error('secret-token');};await player.toggle();
  assert.equal(errors.length,1);assert.ok(!errors[0].includes('secret-token'));
});

test('local helper emits a verifiable ES256 JWT with bounded expiry and origin', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ipod-jwt-test-'));
  try {
    const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
    const key=path.join(dir,'test.p8');fs.writeFileSync(key,privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
    const output=execFileSync(process.execPath,['--import','tsx','scripts/generate-developer-token.ts','--key',key,'--team','TEST','--key-id','TEST','--origin','http://localhost:8123'],{encoding:'utf8'}).trim();
    const [header,payload,signature]=output.split('.');const claims=JSON.parse(Buffer.from(payload,'base64url').toString());
    assert.equal(claims.origin,'http://localhost:8123');assert.equal(claims.exp-claims.iat,30*86400);
    assert.ok(verify('sha256',Buffer.from(`${header}.${payload}`),{key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url')));
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
