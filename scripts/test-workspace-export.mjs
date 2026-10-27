import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/workspaceExport.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { createWorkspaceCsv } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const csv = createWorkspaceCsv(['Título', 'Detalle', 'Progreso'], [['Diseño; Moon', 'Dijo "listo"\nRevisión', 72], [null, undefined, 0]]);
assert.equal(csv, '\uFEFF"Título";"Detalle";"Progreso"\r\n"Diseño; Moon";"Dijo ""listo""\nRevisión";"72"\r\n"";"";"0"');
let count = 1;
for (const value of ['=1+1', '+SUM(1)', '-2+3', '@SUM(A1)', ' \t=HYPERLINK("x")', '\r\n+1']) {
  assert.equal(createWorkspaceCsv(['Texto'], [[value]]).split('\r\n').slice(1).join('\r\n'), `"'${value.replaceAll('"', '""')}"`);
  count++;
}
assert.equal(createWorkspaceCsv(['Nombre'], [['Fabián — acción 🚀']]), '\uFEFF"Nombre"\r\n"Fabián — acción 🚀"'); count++;
console.log(`PASS · ${count} comprobaciones de exportación: UTF-8, separadores, comillas, saltos y fórmulas.`);
