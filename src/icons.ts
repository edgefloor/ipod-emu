/** Original geometric drawings informed by the reference icons' proportions.
 * These paths are authored for the browser, not decoded or traced bitmap pixels.
 * All shapes inherit LCD ink, including the selected-row inverse color.
 */
const NS = 'http://www.w3.org/2000/svg';
export type IconName = 'repeat' | 'repeatOne' | 'shuffle' | 'chevron' |
  'batteryEmpty' | 'batteryQuarter' | 'batteryHalf' | 'batteryThreeQuarters' | 'batteryFull' |
  'pause' | 'play' | 'speaker' | 'speakerLoud';

type Shape = { tag: 'path' | 'rect'; attributes: Record<string, string | number> };
const path = (d: string): Shape => ({ tag: 'path', attributes: { d } });
const line = (d: string, width = 1.5): Shape => ({
  tag: 'path', attributes: { d, fill: 'none', stroke: 'currentColor', 'stroke-width': width,
    'stroke-linejoin': 'miter', 'stroke-linecap': 'square' }
});
const rect = (x: number, y: number, width: number, height: number, opacity = 1): Shape => ({
  tag: 'rect', attributes: { x, y, width, height, opacity }
});

function battery(level: number): Shape[] {
  return [
    line('M2.5 1.5H23.5V4H25.5V8H23.5V10.5H2.5Z', 1),
    // Every stage uses the same outline, four identical bars, and a two-unit gap.
    ...Array.from({ length: 4 }, (_, i) => rect(4 + i * 5, 3, 3, 6, i < level ? 1 : .18))
  ];
}

function repeat(single: boolean): Shape[] {
  const arrows = [
    line('M2 6V4Q2 2.5 4 2.5H14'), path('M12 0L16 2.5L12 5Z'),
    line('M16 6V8Q16 9.5 14 9.5H4'), path('M6 7L2 9.5L6 12Z')
  ];
  if (single) arrows.push(path('M7 5L9 3.5H10V8H8.5V5.5L7 6Z'));
  return arrows;
}

function drawing(name: IconName): { width: number; height: number; shapes: Shape[] } {
  const levels = { batteryEmpty: 0, batteryQuarter: 1, batteryHalf: 2, batteryThreeQuarters: 3, batteryFull: 4 };
  if (name in levels) return { width: 28, height: 12, shapes: battery(levels[name as keyof typeof levels]) };
  switch (name) {
    case 'repeat': case 'repeatOne': return { width: 18, height: 12, shapes: repeat(name === 'repeatOne') };
    case 'shuffle': return { width: 18, height: 12, shapes: [
      line('M1 3H4L8 7M10 9H14'), line('M1 9H4L10 3H14'),
      path('M12 0.5L16 3L12 5.5Z M12 6.5L16 9L12 11.5Z')
    ] };
    case 'chevron': return { width: 8, height: 12, shapes: [path('M2 0L8 6L2 12L0 10L4 6L0 2Z')] };
    case 'play': return { width: 20, height: 12, shapes: [path('M6 1L16 6L6 11Z')] };
    case 'pause': return { width: 20, height: 12, shapes: [rect(5, 1, 3, 10), rect(12, 1, 3, 10)] };
    case 'speaker': case 'speakerLoud': return { width: 16, height: 12, shapes: [
      path('M1 4H4L8 1V11L4 8H1Z'),
      ...(name === 'speakerLoud' ? [line('M10 4Q12 6 10 8M12 1.5Q16 6 12 10.5', 1.2)] : [])
    ] };
    default: throw new Error(`Unknown icon: ${name}`);
  }
}

export function icon(name: IconName, label?: string): SVGSVGElement {
  const { width, height, shapes } = drawing(name);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width)); svg.setAttribute('height', String(height));
  svg.setAttribute('fill', 'currentColor');
  svg.classList.add('lcd-icon');
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); }
  else svg.setAttribute('aria-hidden', 'true');
  for (const { tag, attributes } of shapes) {
    const shape = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attributes)) shape.setAttribute(key, String(value));
    svg.append(shape);
  }
  return svg;
}
