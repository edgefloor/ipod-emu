import type { MusicKitSDK } from './integrations/musickit-types';
import type { Ipod } from './device';
declare global {
  interface Window {
    MusicKit?: MusicKitSDK;
    ipod: Ipod;
    webkitAudioContext?: typeof AudioContext;
    webkitOfflineAudioContext?: typeof OfflineAudioContext;
  }
  interface Navigator { audioSession?: { type: string } }
  interface HTMLElementEventMap { wheelscroll: CustomEvent<{ step: number; degrees: number; speed: number }> }
}
