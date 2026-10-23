import test from 'node:test';
import assert from 'node:assert/strict';
import { playlistId, YouTubePlayer } from '../src/integrations/youtube';
import { device } from './helpers';

test('YouTube accepts playlist links and IDs, rejects foreign URLs and video-only links', () => {
  const id = 'PL1234567890abc';
  for (const link of [id, `https://www.youtube.com/playlist?list=${id}`, `https://youtu.be/video?list=${id}`, `https://music.youtube.com/playlist?list=${id}`]) assert.equal(playlistId(link), id);
  for (const link of ['https://evil.example/?list=PL1234567890abc', 'https://youtube.com/watch?v=12345678901', '<script>alert(1)</script>', '']) assert.throws(() => playlistId(link));
});

test('YouTube controls route to the embed and synchronize actual duration and queue position', () => {
  const ipod = device();
  let playing = 2, time = 8, volume = 50, next = 0, previous = 0;
  const embed = {
    playVideoAt() { playing = 1; }, playVideo() { playing = 1; }, pauseVideo() { playing = 2; },
    nextVideo() { next++; }, previousVideo() { previous++; },
    seekTo(value: number) { time = value; }, getPlayerState: () => playing,
    getCurrentTime: () => time, getDuration: () => 240,
    getVolume: () => volume, setVolume(value: number) { volume = value; },
    getPlaylist: () => ['video-first', 'video-second'], getPlaylistIndex: () => 1,
    setLoop() {}, setShuffle() {}, destroy() {}
  };
  const player = new YouTubePlayer(embed, ipod);
  ipod.youtubePlayer = player;
  player.sync();
  assert.equal(ipod.duration, 240);
  assert.equal(ipod.current?.id, 'video-second');
  assert.equal(ipod.sequence.length, 2);
  ipod.current!.trackName = 'Actual track title';
  ipod.current!.artistName = 'Actual channel';
  player.sync();
  assert.equal(ipod.current!.trackName, 'Actual track title', 'playback events must retain loaded metadata');
  player.toggle(); assert.equal(player.playing, true);
  player.toggle(); assert.equal(player.playing, false);
  ipod.stepTrack(-1); assert.equal(time, 0); assert.equal(previous, 0);
  ipod.stepTrack(-1); assert.equal(previous, 1);
  ipod.stepTrack(1); assert.equal(next, 1);
  player.setVolume(2); assert.equal(volume, 100);
  clearTimeout(ipod.dimTimer);
});

test('YouTube playlist rows refresh titles without moving selection and select by video ID', async () => {
  const { YouTubePlaylistScreen } = await import('../src/screens/youtube-playlist');
  const ipod = device();
  let selected = '';
  ipod.youtubePlayer = { playlistName: 'My playlist', playId(id: string) { selected = id; }, playing: false } as unknown as YouTubePlayer;
  ipod.sequence = [
    { id: 'one', trackName: 'Loading title…', artistName: 'YouTube', duration: 0 },
    { id: 'two', trackName: 'Loading title…', artistName: 'YouTube', duration: 0 }
  ];
  const screen = new YouTubePlaylistScreen(ipod);
  ipod.push(screen); screen.moveSel(1);
  ipod.sequence[1].trackName = 'A real song'; screen.render();
  assert.equal(screen.sel, 1);
  assert.equal(screen.rows[1].title, 'A real song');
  screen.onPlay(); assert.equal(selected, 'two');
  clearTimeout(ipod.dimTimer);
});
