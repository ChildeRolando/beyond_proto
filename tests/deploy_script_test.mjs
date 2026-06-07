import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const bashCandidates = [
  'C:\\msys64\\usr\\bin\\bash.exe',
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
  'bash',
];

const bash = bashCandidates.find((candidate) => {
  if (candidate === 'bash') return true;
  return existsSync(candidate);
});

function run(command, args, cwd, options = {}) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function git(args, cwd) {
  return run('git', args, cwd).trim();
}

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

const tmp = mkdtempSync(join(tmpdir(), 'combat-deploy-test-'));

try {
  copyFileSync(join(repoRoot, 'deploy.sh'), join(tmp, 'deploy.sh'));

  git(['init'], tmp);
  git(['config', 'user.email', 'deploy-test@example.invalid'], tmp);
  git(['config', 'user.name', 'Deploy Test'], tmp);

  write(join(tmp, 'app.js'), 'console.log("base");\n');
  write(join(tmp, 'server', 'static.js'), 'console.log("server base");\n');
  write(join(tmp, 'old.js'), 'console.log("old");\n');
  write(join(tmp, 'rename-old.js'), 'console.log("rename");\n');
  write(join(tmp, 'docs', 'manual.md'), '# docs\n');
  write(join(tmp, 'assets', 'icon.png'), 'asset\n');
  write(join(tmp, 'ngrok.exe'), 'binary\n');

  git(['add', '.'], tmp);
  git(['commit', '-m', 'base'], tmp);
  const baseHash = git(['rev-parse', 'HEAD'], tmp);

  write(join(tmp, 'server', 'static.js'), 'console.log("server changed");\n');
  git(['mv', 'rename-old.js', 'rename-new.js'], tmp);
  git(['add', 'server/static.js'], tmp);
  git(['commit', '-m', 'server change'], tmp);

  write(join(tmp, 'app.js'), 'console.log("dirty");\n');
  unlinkSync(join(tmp, 'old.js'));
  write(join(tmp, 'docs', 'manual.md'), '# changed docs\n');
  write(join(tmp, 'assets', 'icon.png'), 'changed asset\n');
  write(join(tmp, '.claude', 'settings.local.json'), '{}\n');
  write(join(tmp, 'tmp.txt'), 'untracked\n');

  const output = run(bash, ['deploy.sh'], tmp, {
    env: {
      ...process.env,
      DEPLOY_DRY_RUN: 'true',
      DEPLOY_LAST_HASH: baseHash,
      DEPLOY_REMOTE_DIR: 'C:/remote/combat-engine',
      DEPLOY_SERVER: 'deploy-test@example.invalid',
      DEPLOY_SKIP_RESTART: 'true',
      DEPLOY_SSH_KEY: 'dummy-key',
    },
  });

  assert.match(output, /Last deployed:/);
  assert.match(output, /Files to push: 4/);
  assert.match(output, /Files to remove: 2/);
  assert.match(output, /app\.js/);
  assert.match(output, /rename-new\.js/);
  assert.match(output, /rename-old\.js/);
  assert.match(output, /server\/static\.js/);
  assert.match(output, /tmp\.txt/);
  assert.match(output, /old\.js/);
  assert.doesNotMatch(output, /docs\/manual\.md/);
  assert.doesNotMatch(output, /assets\/icon\.png/);
  assert.doesNotMatch(output, /\.claude\/settings\.local\.json/);
  assert.doesNotMatch(output, /ngrok\.exe/);

  console.log('deploy_script_test passed');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
