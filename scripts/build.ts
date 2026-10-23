import { build } from 'esbuild';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = resolve(root, 'dist');
// Explicit allowlist: never publish keys, local configuration, or repository files.
export const publicFiles = [
  'index.html', 'style.css', 'app.js', 'app.css', 'THIRD_PARTY_NOTICES.txt',
  'assets/icon.svg', 'assets/fonts/ChicagoKare-Regular.woff2', 'assets/fonts/LICENSE'
];
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await build({ entryPoints: [resolve(root, 'src/main.ts')], bundle: true, format: 'esm', target: ['es2022'], outfile: resolve(destination, 'app.js'), minify: true, legalComments: 'none' });
for (const file of publicFiles.filter(file => file !== 'app.js' && file !== 'app.css')) {
  const target = resolve(destination, file);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(root, file), target);
}
await writeFile(resolve(destination, '.nojekyll'), '');
console.log(`Built ${publicFiles.length} public files in dist/`);
