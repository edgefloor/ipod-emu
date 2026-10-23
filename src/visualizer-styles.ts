/** Labels stay separate from the lazily loaded preset data. */
export const visualizerStyles = [
  { id: 'aurora', name: 'Aurora', description: 'Luminous waves and color trails.', credit: 'Geiss · Aurora' },
  { id: 'nebula', name: 'Nebula', description: 'Layered, drifting clouds of color.', credit: 'TonyMilkdrop + Flexi · Magellan’s Nebula' },
  { id: 'serpentine', name: 'Serpentine', description: 'Twisting rainbow ribbons and luminous trails.', credit: 'Original · ipod-emu' },
  { id: 'liquid', name: 'Liquid', description: 'Fluid patterns and flowing lines.', credit: 'Original · ipod-emu' },
  { id: 'cubist', name: 'Cubist', description: 'Prismatic spectrum bars that respond to frequency.', credit: 'Original · ipod-emu' },
] as const;
export type VisualizerStyle = typeof visualizerStyles[number]['id'];
