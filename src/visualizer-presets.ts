/** Original MilkDrop-format presets. Audio comes from Butterchurn's waveform/FFT. */
const base = { decay: .94, gammaadj: 1.3, wave_a: 0, warp: 0, zoom: 1.002, rot: 0, ob_a: 0, ib_a: 0, mv_a: 0 };
const emptyShapes = Array.from({ length: 4 }, () => ({ baseVals: { enabled: 0 } }));
const wave = (point: string, index: number, spectrum = false) => ({
  baseVals: { enabled: 1, samples: 512, spectrum: Number(spectrum), thick: 1, additive: 1, scaling: 1, smoothing: .65, a: .65 },
  init_eqs_str: 'a.level=.04;',
  frame_eqs_str: `a.q3=${index};`,
  point_eqs_str: point,
});
const preset = (waves: unknown[], extra = {}) => ({
  baseVals: { ...base, ...extra }, shapes: emptyShapes, waves,
  frame_eqs_str: 'a.q1=a.time;a.q2=Math.min(2,a.bass_att);',
  init_eqs_str: '', pixel_eqs_str: '', warp: '', comp: '',
});
export const liquid = preset(Array.from({ length: 4 }, (_, i) => wave(`
  a.x=a.sample;
  a.y=.5+.15*Math.sin(a.sample*7+a.q1*.35+a.q3*.3)+.08*Math.sin(a.sample*13-a.q1*.23+a.q3*.2)+a.value1*.12+a.q3*.018;
  a.r=.08+.06*a.q3;a.g=.55+.35*Math.sin(a.sample*2+a.q1*.1);a.b=1;a.a=.5;
`, i)), { decay: .965, zoom: 1.001 });
export const serpentine = preset(Array.from({ length: 4 }, (_, i) => wave(`
  a.t=a.sample*6.28318;
  a.radius=.23+.06*Math.sin(a.t*3+a.q1*.6)+.025*a.q3+a.value1*.12;
  a.x=.5+a.radius*Math.cos(a.t+a.q1*.15);
  a.y=.5+a.radius*.7*Math.sin(a.t*2+a.q1*.2);
  a.r=.5+.5*Math.sin(a.t+a.q1*.2);a.g=.5+.5*Math.sin(a.t+2.1+a.q1*.2);a.b=.5+.5*Math.sin(a.t+4.2+a.q1*.2);a.a=.65;
`, i)), { decay: .955, zoom: 1.006, rot: .003 });
// Each group of 32 points traces the front, roof and side of one spectral bar.
export const cubist = preset([wave(`
  a.bin=Math.min(15,Math.floor(a.sample*16));
  a.part=Math.floor(a.sample*512)%32;
  if(a.part===0){a.level=.04+Math.min(.46,Math.abs(a.value1)*.55);}
  a.h=a.level;
  a.left=.08+a.bin*.052;a.right=a.left+.036;a.bottom=.24;
  a.corner=Math.floor(a.part/2);
  a.cx=[0,1,1,0,0,0,0,1,1,1,1,1,1,1,0,0][a.corner];
  a.cy=[0,0,1,1,0,1,1,1,1,0,0,1,0,0,0,0][a.corner];
  a.depth=[0,0,0,0,0,0,1,1,0,0,1,1,1,0,0,0][a.corner];
  a.x=a.left+a.cx*.036+a.depth*.014;
  a.y=a.bottom+a.cy*a.h+a.depth*.024;
  a.r=.3+.65*a.bin/15;a.g=.8-.4*a.bin/15;a.b=1;a.a=a.corner<14?.9:0;
`, 0, true)], { decay: .1, zoom: 1 });
