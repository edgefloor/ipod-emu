declare module 'butterchurn' {
  interface Visualizer {
    connectAudio(node: AudioNode): void;
    disconnectAudio(node: AudioNode): void;
    loadPreset(preset: unknown, blend: number): void;
    setRendererSize(width: number, height: number): void;
    render(): void;
  }
  const butterchurn: { createVisualizer(context: AudioContext, canvas: HTMLCanvasElement, options: { width: number; height: number; pixelRatio: number; textureRatio: number; meshWidth: number; meshHeight: number }): Visualizer };
  const bundle: { default: typeof butterchurn };
  export default bundle;
}
declare module '*.json' { const preset: unknown; export default preset; }
