/** Pixel geometry transcribed from the supplied firmware reference (F07).
 * Spaces are clear; 1/2/3 are provisional ink strengths, not measured LCD gamma.
 * Only these UI symbols are included. No firmware payload or resource bundle ships.
 */
export const ICON_PIXELS = {
  repeat: [ // 0x2560
    "             ",
    "        32   ",
    "  333333333  ",
    " 3      32   ",
    " 3         3 ",
    "   23      3 ",
    "  333333333  ",
    "   23        ",
    "             ",
  ],
  repeatOne: [ // 0x2561
    "             ",
    "        32   ",
    "  333 33333  ",
    " 33 33  32   ",
    " 33 33     3 ",
    " 33 33     3 ",
    "  333 33333  ",
    "             ",
    "             ",
  ],
  shuffle: [ // 0x2564
    "             ",
    "         32  ",
    " 333   33333 ",
    "    1 3  32  ",
    "     3       ",
    "    3 1  32  ",
    " 333   33333 ",
    "         32  ",
    "             ",
  ],
  chevron: [ // 0x2565
    " 3    ",
    "333   ",
    " 333  ",
    "  333 ",
    "   333",
    "  333 ",
    " 333  ",
    "333   ",
    " 3    ",
  ],
  batteryEmpty: [ // 0x2573
    "   3333333333333333333   ",
    "   3                 3   ",
    "   3 111 111 111 111 3   ",
    "   3 111 111 111 111 33  ",
    "   3 111 111 111 111  3  ",
    "   3 111 111 111 111  3  ",
    "   3 111 111 111 111 33  ",
    "   3 111 111 111 111 3   ",
    "   3                 3   ",
    "   3333333333333333333   ",
  ],
  batteryQuarter: [ // 0x2574
    "   3333333333333333333   ",
    "   3                 3   ",
    "   3 333 111 111 111 3   ",
    "   3 333 111 111 111 33  ",
    "   3 333 111 111 111  3  ",
    "   3 333 111 111 111  3  ",
    "   3 333 111 111 111 33  ",
    "   3 333 111 111 111 3   ",
    "   3                 3   ",
    "   3333333333333333333   ",
  ],
  batteryHalf: [ // 0x2575
    "   3333333333333333333   ",
    "   3                 3   ",
    "   3 333 333 111 111 3   ",
    "   3 333 333 111 111 33  ",
    "   3 333 333 111 111  3  ",
    "   3 333 333 111 111  3  ",
    "   3 333 333 111 111 33  ",
    "   3 333 333 111 111 3   ",
    "   3                 3   ",
    "   3333333333333333333   ",
  ],
  batteryThreeQuarters: [ // 0x2576
    "   3333333333333333333   ",
    "   3                 3   ",
    "   3 333 333 333 111 3   ",
    "   3 333 333 333 111 33  ",
    "   3 333 333 333 111  3  ",
    "   3 333 333 333 111  3  ",
    "   3 333 333 333 111 33  ",
    "   3 333 333 333 111 3   ",
    "   3                 3   ",
    "   3333333333333333333   ",
  ],
  batteryFull: [ // 0x2577
    "   3333333333333333333   ",
    "   3                 3   ",
    "   3 333 333 333 333 3   ",
    "   3 333 333 333 333 33  ",
    "   3 333 333 333 333  3  ",
    "   3 333 333 333 333  3  ",
    "   3 333 333 333 333 33  ",
    "   3 333 333 333 333 3   ",
    "   3                 3   ",
    "   3333333333333333333   ",
  ],
  pause: [ // 0x3314
    "      333   333     ",
    "      333   333     ",
    "      333   333     ",
    "      333   333     ",
    "      333   333     ",
    "      333   333     ",
    "      333   333     ",
    "      333   333     ",
    "      333   333     ",
    "                    ",
  ],
  play: [ // 0x3315
    "      31            ",
    "      3331          ",
    "      333331        ",
    "      33333331      ",
    "      333333333     ",
    "      33333331      ",
    "      333331        ",
    "      3331          ",
    "      31            ",
    "                    ",
  ],
  speakerLoud: [ // 0x3318
    "     3  3 ",
    "    33   3",
    "  3333 3 3",
    "  3333 3 3",
    "  3333 3 3",
    "    33   3",
    "     3  3 ",
  ],
  speaker: [ // 0x3319
    "     3    ",
    "    33    ",
    "  3333    ",
    "  3333    ",
    "  3333    ",
    "    33    ",
    "     3    ",
  ],
} as const;
export type IconName = keyof typeof ICON_PIXELS;
export function icon(name: IconName, label?: string): SVGSVGElement {
  const rows = ICON_PIXELS[name];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${rows[0].length} ${rows.length}`);
  svg.setAttribute('width', String(rows[0].length));
  svg.setAttribute('height', String(rows.length));
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.classList.add('lcd-icon');
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); }
  else svg.setAttribute('aria-hidden', 'true');
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const value = rows[y][x];
      if (value === ' ') continue;
      const pixel = document.createElementNS(svg.namespaceURI, 'rect');
      pixel.setAttribute('x', String(x)); pixel.setAttribute('y', String(y));
      pixel.setAttribute('width', '1'); pixel.setAttribute('height', '1');
      pixel.setAttribute('fill', 'currentColor'); pixel.setAttribute('opacity', String(Number(value) / 3));
      svg.append(pixel);
    }
  }
  return svg;
}
