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
  const baseProviderJs = path.join(projectRoot, 'dist-electron', 'main', 'providers', 'base.js');
  const chatgptProviderJs = path.join(projectRoot, 'dist-electron', 'main', 'providers', 'chatgpt.js');
  const geminiProviderJs = path.join(projectRoot, 'dist-electron', 'main', 'providers', 'gemini.js');
  const deepseekProviderJs = path.join(projectRoot, 'dist-electron', 'main', 'providers', 'deepseek.js');
  const claudeProviderJs = path.join(projectRoot, 'dist-electron', 'main', 'providers', 'claude.js');
  const managerJs = path.join(projectRoot, 'dist-electron', 'main', 'providers', 'manager.js');

  assert.ok(fs.existsSync(distHtml), 'dist/index.html must exist');
  assert.ok(fs.statSync(distHtml).size > 100, 'dist/index.html must be populated');

  assert.ok(fs.existsSync(mainJs), 'dist-electron/main/main.js must exist');
  assert.ok(fs.statSync(mainJs).size > 500, 'main.js must be populated');

  assert.ok(fs.existsSync(preloadJs), 'dist-electron/preload/index.js must exist');
  assert.ok(fs.statSync(preloadJs).size > 200, 'preload/index.js must be populated');

  assert.ok(fs.existsSync(securityJs), 'dist-electron/main/security.js must exist');
  assert.ok(fs.existsSync(baseProviderJs), 'providers/base.js must exist');
  assert.ok(fs.existsSync(chatgptProviderJs), 'providers/chatgpt.js must exist');
  assert.ok(fs.existsSync(geminiProviderJs), 'providers/gemini.js must exist');
  assert.ok(fs.existsSync(deepseekProviderJs), 'providers/deepseek.js must exist');
  assert.ok(fs.existsSync(claudeProviderJs), 'providers/claude.js must exist');
  assert.ok(fs.existsSync(managerJs), 'providers/manager.js must exist');
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
    'provider:open-login',
    'provider:check-status',
    'provider:send-prompt',
    'provider:status-changed',
  ];

  for (const channel of expectedChannels) {
    assert.ok(
      preloadSource.includes(channel) || mainSource.includes(channel),
      `IPC channel "${channel}" must be defined in main or preload`
    );
  }

  assert.ok(
    preloadSource.includes("contextBridge.exposeInMainWorld('electronAPI'"),
    "Preload must safely expose 'electronAPI' via contextBridge"
  );
});

// 4. Milestone 2 Session Isolation & Partition Partitioning
test('Milestone 2: Isolated persistent partitions separate from user Chrome', async () => {
  const { ChatGPTAdapter } = await import('../dist-electron/main/providers/chatgpt.js');
  const { GeminiAdapter } = await import('../dist-electron/main/providers/gemini.js');
  const { DeepSeekAdapter } = await import('../dist-electron/main/providers/deepseek.js');
  const { ClaudeAdapter } = await import('../dist-electron/main/providers/claude.js');

  const adapters = [
    new ChatGPTAdapter(),
    new GeminiAdapter(),
    new DeepSeekAdapter(),
    new ClaudeAdapter(),
  ];

  for (const adapter of adapters) {
    // Partition must be prefixed with 'persist:' for cross-restart retention
    assert.equal(adapter.partition, `persist:ai-provider-${adapter.id}`);
    // Partition must NEVER touch user default Chrome profile
    assert.ok(!adapter.partition.includes('User Data'), 'Partition must not reference Chrome User Data');
    adapter.destroy();
  }
});

// 5. Milestone 2 Explicit Session States
test('Milestone 2: Explicit Session States supported in type system', () => {
  const typesSource = fs.readFileSync(path.join(projectRoot, 'src', 'shared', 'types.ts'), 'utf-8');

  const requiredStates = [
    'not_configured',
    'login_required',
    'ready',
    'rate_limited',
    'manual_intervention_required',
    'error',
    'disabled',
  ];

  for (const st of requiredStates) {
    assert.ok(
      typesSource.includes(`'${st}'`),
      `ProviderStatusType must include explicit state: "${st}"`
    );
  }
});

// 6. Provider Session Manager Incremental Registration
test('Milestone 2: ProviderSessionManager manages ChatGPT first', async () => {
  const { ProviderSessionManager } = await import('../dist-electron/main/providers/manager.js');
  const manager = new ProviderSessionManager();

  const states = manager.getAllStates();
  assert.ok(states.chatgpt, 'ChatGPT provider state must exist');
  assert.ok(states.gemini, 'Gemini provider state must exist');
  assert.ok(states.deepseek, 'DeepSeek provider state must exist');
  assert.ok(states.claude, 'Claude provider state must exist');

  // Verify ChatGPT adapter is registered
  const chatgpt = manager.getProvider('chatgpt');
  assert.ok(chatgpt, 'ChatGPT adapter must be registered in ProviderSessionManager');
  assert.equal(chatgpt.id, 'chatgpt');

  // Verify Claude has Quota Guard
  assert.equal(states.claude.quotaProtected, true, 'Claude must have quotaProtected: true');

  manager.destroyAll();
});
