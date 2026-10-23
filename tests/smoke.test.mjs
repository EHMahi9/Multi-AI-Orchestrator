import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// 1. Verify Build Artifacts
test('Build Artifacts: Dist and Dist-Electron files exist', () => {
  const distHtml = path.join(projectRoot, 'dist', 'index.html');
  const mainJs = path.join(projectRoot, 'dist-electron', 'main', 'main.js');
  const preloadJs = path.join(projectRoot, 'dist-electron', 'preload', 'index.js');
  const securityJs = path.join(projectRoot, 'dist-electron', 'main', 'security.js');

  assert.ok(fs.existsSync(distHtml), 'dist/index.html must exist');
  assert.ok(fs.statSync(distHtml).size > 100, 'dist/index.html must be populated');

  assert.ok(fs.existsSync(mainJs), 'dist-electron/main/main.js must exist');
  assert.ok(fs.statSync(mainJs).size > 500, 'main.js must be populated');

  assert.ok(fs.existsSync(preloadJs), 'dist-electron/preload/index.js must exist');
  assert.ok(fs.statSync(preloadJs).size > 200, 'preload/index.js must be populated');

  assert.ok(fs.existsSync(securityJs), 'dist-electron/main/security.js must exist');
});

// 2. Security Validation Tests (validateWorkspacePath)
test('Security: validateWorkspacePath tests', async () => {
  const { validateWorkspacePath } = await import('../dist-electron/main/security.js');

  // Rejects null/undefined/empty
  const emptyCheck = validateWorkspacePath('');
  assert.equal(emptyCheck.valid, false);

  // Rejects non-existent directories
  const nonExistent = validateWorkspacePath(path.join(projectRoot, 'non_existent_dir_99999'));
  assert.equal(nonExistent.valid, false);
  assert.match(nonExistent.error, /does not exist/);

  // Rejects files (must be a directory)
  const fileCheck = validateWorkspacePath(path.join(projectRoot, 'package.json'));
  assert.equal(fileCheck.valid, false);
  assert.match(fileCheck.error, /not a directory/);

  // Accepts valid existing directories
  const validDir = validateWorkspacePath(projectRoot);
  assert.equal(validDir.valid, true);
  assert.ok(validDir.normalized);
});

// 3. Preload & IPC Contract Integrity Check
test('IPC Contract: Channel definitions match IElectronAPI specification', () => {
  const preloadSource = fs.readFileSync(path.join(projectRoot, 'src', 'preload', 'index.ts'), 'utf-8');
  const mainSource = fs.readFileSync(path.join(projectRoot, 'src', 'main', 'main.ts'), 'utf-8');

  const expectedChannels = [
    'app:get-metadata',
    'session:get-state',
    'cli:check-status',
    'dialog:select-workspace',
    'pipeline:start',
    'pipeline:stop',
    'pipeline:pause',
    'pipeline:resume',
    'pipeline:state-changed',
    'pipeline:log-chunk',
  ];

  for (const channel of expectedChannels) {
    assert.ok(
      preloadSource.includes(channel),
      `Preload script must define or listen to IPC channel: "${channel}"`
    );
    assert.ok(
      mainSource.includes(channel),
      `Main process must define handler or emit to IPC channel: "${channel}"`
    );
  }

  assert.ok(
    preloadSource.includes("contextBridge.exposeInMainWorld('electronAPI'"),
    "Preload must safely expose 'electronAPI' via contextBridge"
  );
});

// 4. Provider and Session State Integrity
test('Session State: All four foundational AI providers configured', () => {
  const mainSource = fs.readFileSync(path.join(projectRoot, 'src', 'main', 'main.ts'), 'utf-8');

  assert.ok(mainSource.includes('chatgpt:'), 'ChatGPT provider must be configured');
  assert.ok(mainSource.includes('gemini:'), 'Gemini provider must be configured');
  assert.ok(mainSource.includes('deepseek:'), 'DeepSeek provider must be configured');
  assert.ok(mainSource.includes('claude:'), 'Claude provider must be configured');
  assert.ok(mainSource.includes('quotaProtected: true'), 'Claude must have quotaProtected: true enabled');
});
