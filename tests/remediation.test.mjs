import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { ExecutionService } from '../dist-electron/main/execution/engine.js';
import {
  validateAndCanonicalizeWorkspace,
  isCommandPolicyCompliant,
  parseAndValidateCommand,
  tokenizeCommandLine,
} from '../dist-electron/main/execution/policy.js';
import { computeDecisionPacketHash } from '../dist-electron/shared/schema.js';

// Setup isolated temporary git repository for testing
const testWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'remediation-test-ws-'));
execSync('git init', { cwd: testWorkspace, stdio: 'ignore' });
execSync('git config user.name "Remediation Tester"', { cwd: testWorkspace, stdio: 'ignore' });
execSync('git config user.email "test@example.com"', { cwd: testWorkspace, stdio: 'ignore' });
fs.writeFileSync(path.join(testWorkspace, 'README.md'), '# Remediation Test\n');
fs.mkdirSync(path.join(testWorkspace, 'tests'), { recursive: true });
fs.writeFileSync(
  path.join(testWorkspace, 'tests', 'sample.test.mjs'),
  "import test from 'node:test'; import assert from 'node:assert/strict'; test('Sample Pass', () => { assert.ok(true); });\n"
);
execSync('git add . && git commit -m "Init"', { cwd: testWorkspace, stdio: 'ignore' });

function createBasePacket(overrides = {}) {
  const packet = {
    version: '1.0',
    title: 'Hardened Pipeline Task',
    summary: 'A verified test task packet for Milestone 4.2 audit',
    decisions: ['Apply zero-trust command parsing', 'Enforce SHA-256 packet signatures'],
    tasks: [
      {
        id: 't-1',
        title: 'Run test check',
        files: ['README.md'],
        description: 'Verify file presence and test suite',
        testCommand: 'node --test tests/sample.test.mjs',
      },
    ],
    criteria: ['Criteria A'],
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

// ============================================================================
// 1. Windows CLI Path Quoting (High Finding)
// ============================================================================
test('Remediation 1: Windows CLI path containing spaces executes properly', async () => {
  const service = new ExecutionService();
  const logs = [];

  // Create mock CLI in a directory path containing SPACES
  const isWin = process.platform === 'win32';
  const spaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'space test dir '));
  const mockCli = path.join(spaceDir, isWin ? 'mock agent.cmd' : 'mock agent.sh');
  if (isWin) {
    fs.writeFileSync(mockCli, `@echo off\r\necho Mock CLI with spaces executed successfully: %*\r\nexit /b 0\r\n`);
  } else {
    fs.writeFileSync(mockCli, `#!/bin/sh\necho "Mock CLI with spaces executed successfully: $@"\nexit 0\n`, { mode: 0o755 });
  }

  const mockResolver = {
    resolve: async () => ({
      name: 'space-agent',
      executablePath: mockCli,
      version: '1.0.0-space',
      available: true,
    }),
  };

  delete process.env.NODE_TEST_CONTEXT;

  try {
    const packet = createBasePacket();
    const evidence = await service.execute({
      decisionPacket: packet,
      workspace: testWorkspace,
      cliResolver: mockResolver,
      onLog: (chunk) => logs.push(chunk),
    });

    assert.equal(evidence.success, true);
    assert.equal(evidence.exitCode, 0);
    assert.ok(logs.join('').includes('Mock CLI with spaces executed successfully'));
    assert.ok(logs.join('').includes('Verification command passed'));
  } finally {
    try { fs.rmSync(spaceDir, { recursive: true, force: true }); } catch {}
  }
});

test('Remediation 1: Non-existent executable in space path produces clean failure without crashing', async () => {
  const service = new ExecutionService();
  const mockResolver = {
    resolve: async () => ({
      name: 'missing-agent',
      executablePath: 'C:\\Users\\Admin\\AppData\\Local\\Temp\\space dir nonexistent\\fake.cmd',
      version: '1.0.0',
      available: true,
    }),
  };

  const packet = createBasePacket();
  const evidence = await service.execute({
    decisionPacket: packet,
    workspace: testWorkspace,
    cliResolver: mockResolver,
    onLog: () => {},
  });

  assert.equal(evidence.success, false);
  assert.notEqual(evidence.exitCode, 0);
});

// ============================================================================
// 2. Execution Watchdog Timeout (Medium Finding)
// ============================================================================
test('Remediation 2: Watchdog terminates hanging CLI process and reports EXECUTION_TIMEOUT', async () => {
  const service = new ExecutionService();
  const logs = [];

  // Mock CLI that simulates a long-running hang
  const isWin = process.platform === 'win32';
  const hangScript = path.join(os.tmpdir(), `hang-cli-${Date.now()}${isWin ? '.cmd' : '.sh'}`);
  if (isWin) {
    fs.writeFileSync(hangScript, `@echo off\r\nping 127.0.0.1 -n 10 > nul\r\nexit /b 0\r\n`);
  } else {
    fs.writeFileSync(hangScript, `#!/bin/sh\nexec sleep 10\n`, { mode: 0o755 });
  }

  const mockResolver = {
    resolve: async () => ({
      name: 'hanging-agent',
      executablePath: hangScript,
      version: '1.0.0',
      available: true,
    }),
  };

  try {
    const packet = createBasePacket();
    const startTime = Date.now();
    const evidence = await service.execute({
      decisionPacket: packet,
      workspace: testWorkspace,
      cliResolver: mockResolver,
      timeoutMs: 600, // Short 600ms watchdog timeout
      onLog: (chunk) => logs.push(chunk),
    });

    const elapsed = Date.now() - startTime;
    assert.equal(evidence.success, false);
    assert.equal(evidence.timedOut, true);
    assert.equal(evidence.exitCode, 124); // POSIX timeout exit code
    assert.equal(evidence.blockedReason, 'EXECUTION_TIMEOUT');
    assert.ok(logs.join('').includes('[Execution Watchdog] TIMEOUT'));
    assert.ok(elapsed < 4000, `Watchdog must terminate promptly, took ${elapsed}ms`);
  } finally {
    try { fs.unlinkSync(hangScript); } catch {}
  }
});

// ============================================================================
// 3. Decision Packet Cryptographic Integrity Binding (Medium Finding)
// ============================================================================
test('Remediation 3: Missing signature is rejected', async () => {
  const service = new ExecutionService();
  const packet = createBasePacket();
  delete packet.approvalSignature; // Remove signature

  const evidence = await service.execute({
    decisionPacket: packet,
    workspace: testWorkspace,
    onLog: () => {},
  });

  assert.equal(evidence.success, false);
  assert.equal(evidence.blockedReason, 'MISSING_APPROVAL_SIGNATURE');
});

test('Remediation 3: Tampered task description invalidates approval signature', async () => {
  const service = new ExecutionService();
  const packet = createBasePacket();
  // Tamper with task description after approval signature was generated
  packet.tasks[0].description = 'Malicious injected description!';

  const evidence = await service.execute({
    decisionPacket: packet,
    workspace: testWorkspace,
    onLog: () => {},
  });

  assert.equal(evidence.success, false);
  assert.equal(evidence.blockedReason, 'TAMPERED_PACKET');
  assert.match(evidence.stderrTail, /modified after approval/i);
});

test('Remediation 3: Tampered testCommand invalidates approval signature', async () => {
  const service = new ExecutionService();
  const packet = createBasePacket();
  // Tamper with test command
  packet.tasks[0].testCommand = 'npm test -- --bail';

  const evidence = await service.execute({
    decisionPacket: packet,
    workspace: testWorkspace,
    onLog: () => {},
  });

  assert.equal(evidence.success, false);
  assert.equal(evidence.blockedReason, 'TAMPERED_PACKET');
});

test('Remediation 3: Workspace mismatch rejects execution', async () => {
  const service = new ExecutionService();
  const packet = createBasePacket();
  packet.approvedWorkspace = 'C:\\Some\\Other\\Approved\\Directory';
  // Re-sign with original packet content
  packet.approvalSignature = computeDecisionPacketHash(packet);

  const evidence = await service.execute({
    decisionPacket: packet,
    workspace: testWorkspace,
    onLog: () => {},
  });

  assert.equal(evidence.success, false);
  assert.equal(evidence.blockedReason, 'WORKSPACE_MISMATCH');
});

// ============================================================================
// 4. Workspace Security Boundary & Documentation
// ============================================================================
test('Remediation 4: Workspace canonicalization blocks traversal and protected backups', () => {
  const traversal = validateAndCanonicalizeWorkspace(testWorkspace + '/../../');
  assert.equal(traversal.valid, false);
  assert.match(traversal.error, /traversal sequence/i);

  const baseline = validateAndCanonicalizeWorkspace('D:\\Code\\NEXT JS\\multi-ai-relay-autonomous\\backups\\v0.1.9');
  assert.equal(baseline.valid, false);
  assert.match(baseline.error, /protected path/i);

  const systemDir = validateAndCanonicalizeWorkspace('C:\\Windows\\System32');
  assert.equal(systemDir.valid, false);
  assert.match(systemDir.error, /protected path/i);
});

// ============================================================================
// 5. Test Command Argument Parsing & Zero-Trust Enforcement (Low Finding)
// ============================================================================
test('Remediation 5: Tokenizer handles double quotes, spaces, and flags without shell', () => {
  const tokenized = tokenizeCommandLine('npm test -- --grep "user authentication" -w');
  assert.equal(tokenized.ok, true);
  assert.deepEqual(tokenized.tokens, ['npm', 'test', '--', '--grep', 'user authentication', '-w']);
});

test('Remediation 5: Tokenizer rejects unclosed quotes', () => {
  const unclosed = tokenizeCommandLine('npm test --grep "unclosed quote');
  assert.equal(unclosed.ok, false);
  assert.match(unclosed.error, /unclosed/i);
});

test('Remediation 5: Parser rejects forbidden shell operators', () => {
  const piped = parseAndValidateCommand('npm test | rm -rf');
  assert.equal(piped.valid, false);
  assert.match(piped.error, /forbidden shell operator/i);

  const chained = parseAndValidateCommand('npm test && del /f /q C:\\');
  assert.equal(chained.valid, false);
  assert.match(chained.error, /forbidden shell operator/i);

  const redirected = parseAndValidateCommand('npm test > output.txt');
  assert.equal(redirected.valid, false);
  assert.match(redirected.error, /forbidden shell operator/i);
});

test('Remediation 5: Disallowed executables are rejected', () => {
  const disallowed = parseAndValidateCommand('powershell -Command "Get-Process"');
  assert.equal(disallowed.valid, false);
  assert.match(disallowed.error, /not permitted by command policy/i);

  const pythonCmd = parseAndValidateCommand('python -c "print(1)"');
  assert.equal(pythonCmd.valid, false);
  assert.match(pythonCmd.error, /not permitted by command policy/i);

  const bashCmd = parseAndValidateCommand('bash -c "id"');
  assert.equal(bashCmd.valid, false);
  assert.match(bashCmd.error, /not permitted by command policy/i);
});

test('Remediation 5: Node executable is restricted strictly to node --test', () => {
  const arbitraryNode = parseAndValidateCommand('node malicious.js');
  assert.equal(arbitraryNode.valid, false);
  assert.match(arbitraryNode.error, /Only "node --test" is permitted/i);

  const validNodeTest = parseAndValidateCommand('node --test tests/verify.test.mjs');
  assert.equal(validNodeTest.valid, true);
  assert.equal(validNodeTest.executable, 'node');
  assert.deepEqual(validNodeTest.args, ['--test', 'tests/verify.test.mjs']);
});

test('Cleanup test workspace', () => {
  try {
    fs.rmSync(testWorkspace, { recursive: true, force: true });
  } catch {}
});
