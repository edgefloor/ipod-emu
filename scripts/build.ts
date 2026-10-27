import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = resolve(root, 'dist');
// Explicit allowlist: never publish keys, local configuration, or repository files.
export const publicFiles = [
  'index.html', 'style.css', 'app.js', 'app.css', 'milkdrop.js', 'THIRD_PARTY_NOTICES.txt',
  'assets/icon.svg', 'assets/fonts/ChicagoKare-Regular.woff2', 'assets/fonts/LICENSE'
];
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await build({ entryPoints: [resolve(root, 'src/main.ts')], bundle: true, format: 'esm', target: ['es2022'], outfile: resolve(destination, 'app.js'), minify: true, legalComments: 'none' });
await build({ entryPoints: [resolve(root, 'src/milkdrop-runtime.ts')], bundle: true, format: 'esm', target: ['es2022'], outfile: resolve(destination, 'milkdrop.js'), minify: true, legalComments: 'none' });
for (const file of publicFiles.filter(file => !['app.js', 'app.css', 'milkdrop.js'].includes(file))) {
  const target = resolve(destination, file);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(root, file), target);
}
// Tie asset URLs to their contents so returning visitors receive each release.
let html = await readFile(resolve(destination, 'index.html'), 'utf8');
for (const file of ['style.css', 'app.css', 'app.js']) {
  const hash = createHash('sha256').update(await readFile(resolve(destination, file))).digest('hex').slice(0, 12);
  html = html.replaceAll(`"${file}"`, `"${file}?v=${hash}"`);
}
await writeFile(resolve(destination, 'index.html'), html);
await writeFile(resolve(destination, '.nojekyll'), '');
console.log(`Built ${publicFiles.length} public files in dist/`);
