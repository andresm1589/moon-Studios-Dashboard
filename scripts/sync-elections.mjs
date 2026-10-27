import { readdir, readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const workspace = fileURLToPath(new URL('..', import.meta.url));
const source = path.resolve(workspace, '../MOON STUDIOS ELECCIONES/src/electoral');
const target = path.join(workspace, 'src/electoral');
const exists = async p => !!(await stat(p).catch(() => null));
if (!(await exists(source))) {
  if (!(await exists(path.join(target, 'ElectionWorkspace.tsx')))) throw new Error('No se encontró el módulo electoral ni su copia incluida.');
  console.log('Elecciones: usando la copia de código incluida en el dashboard.');
} else {
  const files = {};
  async function copy(relative = '') {
    for (const entry of await readdir(path.join(source, relative), { withFileTypes: true })) {
      const key = path.join(relative, entry.name);
      if (entry.isDirectory()) { await copy(key); continue; }
      if (!entry.isFile() || !/\.(?:ts|tsx|css)$/.test(entry.name)) continue;
      const content = await readFile(path.join(source, key));
      const destination = path.join(target, key);
      await mkdir(path.dirname(destination), { recursive: true });
      const previous = await readFile(destination).catch(() => null);
      if (!previous?.equals(content)) await writeFile(destination, content);
      files[key.replaceAll('\\', '/')] = createHash('sha256').update(content).digest('hex');
    }
  }
  await copy();
  await writeFile(path.join(target, 'source-manifest.json'), JSON.stringify({ source: '../MOON STUDIOS ELECCIONES/src/electoral', files }, null, 2) + '\n');
  console.log(`Elecciones: ${Object.keys(files).length} archivos compartidos sincronizados.`);
}
