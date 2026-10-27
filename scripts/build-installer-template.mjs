import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The install/update/removal engine is the exact Tauri CLI 2.11.1 template.
// Only the presentation callbacks/page declarations below may differ.
const root = fileURLToPath(new URL('../', import.meta.url));
const basePath = path.join(root, 'src-tauri/installer/tauri-base.nsi');
const outputPath = path.join(root, 'src-tauri/installer/installer.nsi');
const baselineSha256 = 'ee84148e405adc4d736a46456dd8345a644751bd1f28a335dd7fd833a32d7c3e';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const raw = await readFile(basePath);
if (sha256(raw) !== baselineSha256) throw new Error('Tauri CLI 2.11.1 base has changed; review the upstream template before regenerating.');
const base = raw.toString('utf8').replaceAll('\r\n', '\n');
let template = base;
const patches = [];
function replaceOnce(name, from, to) {
  if (template.split(from).length !== 2) throw new Error(`Expected one anchor for ${name}`);
  template = template.replace(from, () => to);
  patches.push({ name, from, to });
}

replaceOnce('UI declarations before pages',
  '; Installer pages, must be ordered as they appear',
  '!include "${MOON_INSTALLER_ROOT}\\ui.nsh"\n\n; Installer pages, must be ordered as they appear');

replaceOnce('Custom welcome',
  '; 1. Welcome Page\n!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive\n!insertmacro MUI_PAGE_WELCOME',
  '; 1. Welcome Page\nPage custom MoonWelcome MoonPageLeave');

replaceOnce('Maintenance presentation after upstream selection',
  '    ${NSD_SetFocus} $R2\n    nsDialogs::Show',
  '    !insertmacro MoonMaintenanceLayout\n    ${NSD_SetFocus} $R2\n    nsDialogs::Show');

replaceOnce('Native directory validation with redesigned controls',
  '; 5. Choose install directory page\n!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive\n!insertmacro MUI_PAGE_DIRECTORY',
  '; 5. Choose install directory page\n!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive\n!define MUI_PAGE_CUSTOMFUNCTION_SHOW MoonDirectoryShow\n!define MUI_PAGE_CUSTOMFUNCTION_LEAVE MoonDirectoryLeave\n!insertmacro MUI_PAGE_DIRECTORY');

replaceOnce('Start menu choice integrated into directory page',
  '; 6. Start menu shortcut page\nVar AppStartMenuFolder\n!if "${STARTMENUFOLDER}" != ""\n  !define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive\n  !define MUI_STARTMENUPAGE_DEFAULTFOLDER "${STARTMENUFOLDER}"\n!else\n  !define MUI_PAGE_CUSTOMFUNCTION_PRE Skip\n!endif\n!insertmacro MUI_PAGE_STARTMENU Application $AppStartMenuFolder',
  '; 6. The MUI Start Menu machinery remains available for shortcut creation/removal.\n; Its choice is now part of the redesigned native directory page.\nVar AppStartMenuFolder\n!define MUI_PAGE_CUSTOMFUNCTION_PRE Skip\n!if "${STARTMENUFOLDER}" != ""\n  !define MUI_STARTMENUPAGE_DEFAULTFOLDER "${STARTMENUFOLDER}"\n!endif\n!insertmacro MUI_PAGE_STARTMENU Application $AppStartMenuFolder');

replaceOnce('Review and real installation progress',
  '; 7. Installation page\n!insertmacro MUI_PAGE_INSTFILES',
  '; 7. Review, then installation with the original NSIS progress controls.\nPage custom MoonReview MoonPageLeave\n!define MUI_PAGE_CUSTOMFUNCTION_SHOW MoonInstallShow\n!define MUI_PAGE_CUSTOMFUNCTION_LEAVE MoonInstallLeave\n!insertmacro MUI_PAGE_INSTFILES');

const finishStart = base.indexOf('; 8. Finish page\n');
const finishEnd = base.indexOf('Function RunMainBinary\n', finishStart);
if (finishStart < 0 || finishEnd < 0) throw new Error('Finish page anchors missing');
replaceOnce('Custom completion page', base.slice(finishStart, finishEnd),
  '; 8. Completion page; native launch/shortcut functions remain unchanged.\nPage custom MoonFinish MoonFinishLeave\n\n');

const unStart = base.indexOf('; Uninstaller Pages\n');
const unEnd = base.indexOf(';Languages\n', unStart);
if (unStart < 0 || unEnd < 0) throw new Error('Uninstall page anchors missing');
replaceOnce('Custom removal confirmation and completion', base.slice(unStart, unEnd),
  '; Uninstaller Pages\nVar DeleteAppDataCheckbox\nVar DeleteAppDataCheckboxState\nUninstPage custom un.MoonConfirm un.MoonConfirmLeave\n!define MUI_PAGE_CUSTOMFUNCTION_SHOW un.MoonInstallShow\n!define MUI_PAGE_CUSTOMFUNCTION_LEAVE un.MoonInstallLeave\n!insertmacro MUI_UNPAGE_INSTFILES\nUninstPage custom un.MoonFinish\n\n');

replaceOnce('Presentation functions and native cleanup callbacks after languages',
  '{{#each language_files}}\n  !include "{{this}}"\n{{/each}}\n\nFunction .onInit',
  '{{#each language_files}}\n  !include "{{this}}"\n{{/each}}\n\n!include "${MOON_INSTALLER_ROOT}\\ui-functions.nsh"\n\nFunction .onGUIEnd\n  Call MoonGuiEnd\nFunctionEnd\n\nFunction un.onGUIEnd\n  Call un.MoonGuiEnd\nFunctionEnd\n\nFunction .onInstFailed\n  Call MoonFailure\nFunctionEnd\n\nFunction un.onUninstFailed\n  Call un.MoonFailure\nFunctionEnd\n\nFunction .onInit');

// Reverse every approved presentation patch to prove there are no unrelated edits.
let reversed = template;
for (const patch of [...patches].reverse()) {
  if (reversed.split(patch.to).length !== 2) throw new Error(`Reverse patch ambiguity: ${patch.name}`);
  reversed = reversed.replace(patch.to, () => patch.from);
}
if (reversed !== base) throw new Error('Unexpected edits outside presentation patches');

function blocks(source, kind, end) {
  return new Map([...source.matchAll(new RegExp(`^${kind} ([^\\n]+)\\n[\\s\\S]*?^${end}$`, 'gm'))].map(match => [match[1], match[0]]));
}
const baseSections = blocks(base, 'Section', 'SectionEnd');
const finalSections = blocks(template, 'Section', 'SectionEnd');
for (const [name, section] of baseSections) {
  if (finalSections.get(name) !== section) throw new Error(`Install engine section changed: ${name}`);
}
const baseFunctions = blocks(base, 'Function', 'FunctionEnd');
const finalFunctions = blocks(template, 'Function', 'FunctionEnd');
const removedPresentationFunctions = new Set(['un.ConfirmShow ; Add add a `Delete app data` check box', 'un.ConfirmLeave']);
const preservedFunctions = [];
for (const [name, fn] of baseFunctions) {
  if (removedPresentationFunctions.has(name)) continue;
  const actual = finalFunctions.get(name)?.replace('    !insertmacro MoonMaintenanceLayout\n', '');
  if (actual !== fn) throw new Error(`Install engine function changed: ${name}`);
  preservedFunctions.push(name);
}
const checkOnly = process.argv.includes('--check');
if (checkOnly) {
  const existing = (await readFile(outputPath, 'utf8')).replaceAll('\r\n', '\n');
  if (existing !== template) throw new Error('installer.nsi is stale; run node scripts/build-installer-template.mjs');
} else {
  await writeFile(outputPath, template, 'utf8');
}
const report = {
  upstream: 'https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.1/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi',
  upstreamTag: 'tauri-cli-v2.11.1', baselineSha256,
  templateSha256: sha256(template), presentationPatches: patches.map(patch => patch.name),
  engineSections: [...baseSections.keys()], engineSectionsSha256: sha256([...baseSections.values()].join('\n')),
  preservedFunctions, preservedFunctionsSha256: sha256(preservedFunctions.map(name => baseFunctions.get(name)).join('\n')),
  unchangedEngine: true, reversiblePresentationOnly: true,
};
await mkdir(path.join(root, '.moon-qa/installer'), { recursive: true });
await writeFile(path.join(root, '.moon-qa/installer/template-integrity.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ checked: checkOnly, template: path.relative(root, outputPath), ...report }, null, 2));
