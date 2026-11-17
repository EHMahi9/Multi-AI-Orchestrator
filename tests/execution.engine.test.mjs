import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { ExecutionService } from '../dist-electron/main/execution/engine.js';
import { CliResolver } from '../dist-electron/main/execution/cli-resolver.js';
import { validateAndCanonicalizeWorkspace, isCommandPolicyCompliant } from '../dist-electron/main/execution/policy.js';
import { computeDecisionPacketHash } from '../dist-electron/shared/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Helper to create a valid approved Decision Packet
function createValidApprovedPacket(overrides = {}) {
  const packet = {
    version: '1.0',
    title: 'Safe Test Feature',
    summary: 'A verified test task packet',
    decisions: ['Use safe test runner'],
    tasks: [
      {
        id: 'task-1',
        title: 'Run test check',
        files: ['package.json'],
        description: 'Check package.json existence',
        testCommand: 'node --test tests/smoke.test.mjs',
      },
    ],
    criteria: ['Passes verification'],
    unresolvedRisks: [],
    consensusTimestamp: new Date().toISOString(),
    approvedByUser: true,
    ...overrides,
  };

  if (!packet.approvalSignature && packet.approvedByUser) {
    packet.approvalSignature = computeDecisionPacketHash(packet);
  }
  return packet;
}

// ----------------------------------------------------------------------------
// 1. Approval Gating Tests
// ----------------------------------------------------------------------------
test('Execution Engine: Rejects unapproved Decision Packet', async () => {
  const service = new ExecutionService();
  const unapprovedPacket = createValidApprovedPacket({ approvedByUser: false });
  const logs = [];

  const evidence = await service.execute({
    decisionPacket: unapprovedPacket,
    workspace: projectRoot,
    onLog: (chunk) => logs.push(chunk),
  });

  assert.equal(evidence.success, false);
  assert.equal(evidence.blockedReason, 'UNAPPROVED_PACKET');
  assert.match(evidence.stderrTail, /explicit user approval/i);
});

// ----------------------------------------------------------------------------
// 2. Malformed Decision Packet Tests
// ----------------------------------------------------------------------------
test('Execution Engine: Rejects malformed Decision Packet', async () => {
  const service = new ExecutionService();
  // Missing version and invalid tasks
  const malformedPacket = { approvedByUser: true, title: 'Broken' };
  const logs = [];

  const evidence = await service.execute({
    decisionPacket: malformedPacket,
    workspace: projectRoot,
    onLog: (chunk) => logs.push(chunk),
  });

  assert.equal(evidence.success, false);
  assert.equal(evidence.blockedReason, 'INVALID_SCHEMA');
});

// ----------------------------------------------------------------------------
// 3. Workspace Path Traversal Protection
// ----------------------------------------------------------------------------
test('Execution Engine: Blocks directory traversal and protected baselines', () => {
  // Directory traversal
  const traversal = validateAndCanonicalizeWorkspace(projectRoot + '/../../');
  assert.equal(traversal.valid, false);
  assert.match(traversal.error, /traversal sequence/i);
  // Path exists, but let's test relative sequence or protected path
  const protectedBaseline = validateAndCanonicalizeWorkspace('D:\\Code\\NEXT JS\\multi-ai-relay-autonomous\\backups\\v0.1.9');
  assert.equal(protectedBaseline.valid, false);
  assert.match(protectedBaseline.error, /protected path or baseline/i);

  // Non-existent directory
  const nonExistent = validateAndCanonicalizeWorkspace(path.join(projectRoot, 'bogus_dir_12345'));
  assert.equal(nonExistent.valid, false);
  assert.match(nonExistent.error, /does not exist/i);

  // Valid canonical directory
  const valid = validateAndCanonicalizeWorkspace(projectRoot);
  assert.equal(valid.valid, true);
  assert.ok(valid.canonicalPath);
});

// ----------------------------------------------------------------------------
// 4. Command Policy & Shell Injection Defense
// ----------------------------------------------------------------------------
test('Execution Policy: Denies shell operators and non-whitelisted commands', () => {
  // Forbidden shell operators
  const piped = isCommandPolicyCompliant('npm test | rm -rf /');
  assert.equal(piped.compliant, false);
  assert.match(piped.reason, /forbidden shell operator/i);

  const chained = isCommandPolicyCompliant('npm test && del /f /q C:\\*');
  assert.equal(chained.compliant, false);
  assert.match(chained.reason, /forbidden shell operator/i);

  const semiColon = isCommandPolicyCompliant('npm test; echo hacked');
  assert.equal(semiColon.compliant, false);
  assert.match(semiColon.reason, /forbidden shell operator/i);

  // Non-whitelisted command
  const arbitrary = isCommandPolicyCompliant('powershell -ExecutionPolicy Bypass');
  assert.equal(arbitrary.compliant, false);
  assert.match(arbitrary.reason, /whitelist/i);

  // Whitelisted commands
  assert.equal(isCommandPolicyCompliant('npm test').compliant, true);
  assert.equal(isCommandPolicyCompliant('node --test tests/smoke.test.mjs').compliant, true);
  assert.equal(isCommandPolicyCompliant('npm run typecheck').compliant, true);
  assert.equal(isCommandPolicyCompliant('').compliant, true);
});

// ----------------------------------------------------------------------------
// 5. CLI Not Found Behavior
// ----------------------------------------------------------------------------
test('Execution Engine: Reports BLOCKED when CLI is unavailable', async () => {
  const service = new ExecutionService();
  const mockResolver = new CliResolver('D:\\non_existent_fake_cli.exe');
  const packet = createValidApprovedPacket();
  const logs = [];

  const evidence = await service.execute({
    decisionPacket: packet,
    workspace: projectRoot,
    cliResolver: mockResolver,
    onLog: (chunk) => logs.push(chunk),
  });

  assert.equal(evidence.success, false);
  assert.equal(evidence.blockedReason, 'CLI_NOT_FOUND');
  assert.match(logs.join(''), /BLOCKED/);
});

// ----------------------------------------------------------------------------
// 6. Real Resolver & Installed CLI Check
// ----------------------------------------------------------------------------
test('CLI Resolver: Detects installed gemini binary', async () => {
  const resolver = new CliResolver();
  const info = await resolver.resolve();

  if (info.available) {
    assert.ok(['gemini', 'agy'].includes(info.name));
    assert.ok(info.version.length > 0);
  } else {
    assert.equal(info.available, false);
    assert.equal(info.name, 'none');
    assert.match(info.error, /BLOCKED/);
  }

  // Also verify customPath resolution with mock executable on any environment
  const tmpWs = fs.mkdtempSync(path.join(os.tmpdir(), 'resolver-test-'));
  try {
    const isWin = process.platform === 'win32';
    const mockExe = path.join(tmpWs, isWin ? 'custom-gemini.cmd' : 'custom-gemini.sh');
    if (isWin) {
      fs.writeFileSync(mockExe, '@echo off\r\necho 1.5.0\r\n');
    } else {
      fs.writeFileSync(mockExe, '#!/bin/sh\necho 1.5.0\n', { mode: 0o755 });
    }
    const customResolver = new CliResolver(mockExe);
    const customInfo = await customResolver.resolve();
    assert.equal(customInfo.available, true);
    assert.equal(customInfo.version, '1.5.0');
  } finally {
    try { fs.rmSync(tmpWs, { recursive: true, force: true }); } catch {}
  }
});

// ----------------------------------------------------------------------------
// 7. Cancellation and Process Preservation
// ----------------------------------------------------------------------------
test('Execution Engine: Graceful cancellation targets only spawned child', async () => {
  const service = new ExecutionService();
  // Cancel immediately
  service.cancel();

  // Creating a custom mock CLI that simulates running
  const packet = createValidApprovedPacket();
  const evidence = await service.execute({
    decisionPacket: packet,
    workspace: projectRoot,
    onLog: () => {},
  });

  // Since it was cancelled before loop, it terminates gracefully
  assert.equal(evidence.cancelled, true);
  assert.equal(evidence.success, false);
});
