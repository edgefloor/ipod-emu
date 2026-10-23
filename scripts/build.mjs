import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = resolve(root, 'dist');
// Explicit allowlist: never publish keys, local configuration, or repository files.
export const publicFiles = [
  'index.html', 'style.css', 'data.js', 'apple-music.js', 'ipod.js',
  'assets/icon.svg', 'assets/fonts/ChicagoKare-Regular.woff2', 'assets/fonts/LICENSE'
];
await rm(destination, { recursive: true, force: true });
for (const file of publicFiles) {
  const target = resolve(destination, file);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(root, file), target);
}
await writeFile(resolve(destination, '.nojekyll'), '');
console.log(`Built ${publicFiles.length} public files in dist/`);
