import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scriptMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
assert.ok(scriptMatch, 'index.html should contain a module script');

const tempPath = join(tmpdir(), `combat-engine-index-${process.pid}.mjs`);
writeFileSync(tempPath, scriptMatch[1], 'utf8');
try {
  const syntax = spawnSync(process.execPath, ['--check', tempPath], { encoding: 'utf8' });
  assert.equal(
    syntax.status,
    0,
    `index.html module script should parse\n${syntax.stderr || syntax.stdout}`
  );
} finally {
  unlinkSync(tempPath);
}

assert.match(html, /function isPveMode\(\)/, 'PVE mode guard should exist');
assert.match(html, /submitAiAndExecutePveTurn/, 'PVE should submit AI and execute local turns');
assert.match(html, /configMode === 'pve'/, 'PVE config route should be handled');

const removeLoadoutMatch = html.match(/function removeLoadoutAt\([\s\S]*?\n}\n\nfunction renderConfigScreen/);
assert.ok(removeLoadoutMatch, 'removeLoadoutAt should be present');
assert.doesNotMatch(
  removeLoadoutMatch[0],
  /getMyCharacterIds\(\)/,
  'removeLoadoutAt should only edit config loadout state, not battle submit status'
);

console.log('pve_ui_static_test: passed');
