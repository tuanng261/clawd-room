// Copies just the parts of three.js the page uses (and what those import) into
// a target folder, so the shared app doesn't carry the whole library.
//   node widget/collect-three.mjs <dest>/node_modules/three
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE = path.join(ROOT, 'node_modules', 'three');
const dest = process.argv[2];
if (!dest) { console.error('usage: collect-three.mjs <dest>'); process.exit(1); }

const want = new Set(['build/three.module.js', 'package.json', 'LICENSE']);
// Everything under web/ that imports from three/addons/…
for (const file of fs.readdirSync(path.join(ROOT, 'web/js'), { recursive: true })) {
  if (!String(file).endsWith('.js')) continue;
  const src = fs.readFileSync(path.join(ROOT, 'web/js', String(file)), 'utf8');
  for (const m of src.matchAll(/from\s+'three\/addons\/([^']+)'/g)) want.add(`examples/jsm/${m[1]}`);
}
// …and whatever those import in turn.
const queue = [...want];
while (queue.length) {
  const rel = queue.shift();
  const full = path.join(THREE, rel);
  if (!rel.endsWith('.js') || !fs.existsSync(full)) continue;
  const src = fs.readFileSync(full, 'utf8');
  for (const m of src.matchAll(/(?:from|import)\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const next = path.relative(THREE, path.resolve(path.dirname(full), m[1]));
    if (!want.has(next)) { want.add(next); queue.push(next); }
  }
}
for (const rel of want) {
  const from = path.join(THREE, rel);
  if (!fs.existsSync(from)) continue;
  fs.mkdirSync(path.dirname(path.join(dest, rel)), { recursive: true });
  fs.copyFileSync(from, path.join(dest, rel));
}
console.log(`three.js: copied ${want.size} files`);
