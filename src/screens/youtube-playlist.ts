import type { Ipod } from '../device';
import { MenuScreen } from './base';
import { NowPlayingScreen } from './now-playing';

/** Rows are rebuilt from live metadata without resetting the wheel selection. */
export class YouTubePlaylistScreen extends MenuScreen {
  constructor(device: Ipod) { super(device, 'YouTube playlist', []); }
  render() {
    const player = this.device.youtubePlayer;
    this.title = player?.playlistName || 'YouTube';
    this.rows = player ? this.device.sequence.map(track => ({
      title: track.trackName,
      onSelect: () => {
        if (this.device.youtubePlayer !== player) return;
        player.playId(String(track.id));
        this.device.push(new NowPlayingScreen(this.device));
      }
    })) : [];
    if (!this.rows.length) this.rows = [{ title: player ? 'Loading playlist…' : 'Playlist closed' }];
    super.render();
  }
  onPlay() { this.onCenter(); }
}
