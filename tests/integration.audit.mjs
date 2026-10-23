import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { ExecutionService } from '../dist-electron/main/execution/engine.js';
import { validateAndCanonicalizeWorkspace, isCommandPolicyCompliant } from '../dist-electron/main/execution/policy.js';
import { computeDecisionPacketHash } from '../dist-electron/shared/schema.js';

// Setup isolated temporary workspace in os.tmpdir()
const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestrator-audit-ws-'));

// Initialize git repository
execSync('git init', { cwd: tempWorkspace, stdio: 'ignore' });
execSync('git config user.name "Audit Runner"', { cwd: tempWorkspace, stdio: 'ignore' });
execSync('git config user.email "audit@example.com"', { cwd: tempWorkspace, stdio: 'ignore' });
fs.writeFileSync(path.join(tempWorkspace, 'README.md'), '# Temp Test Workspace\n');
fs.mkdirSync(path.join(tempWorkspace, 'tests'), { recursive: true });
fs.writeFileSync(
  path.join(tempWorkspace, 'tests', 'verify.test.mjs'),
  "import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; test('Audit Verification Test: README.md exists', () => { assert.ok(fs.existsSync('README.md')); });\n"
);
execSync('git add . && git commit -m "Initial commit"', { cwd: tempWorkspace, stdio: 'ignore' });

test('Integration Audit 1: Unapproved packet blocked', async () => {
  const service = new ExecutionService();
  const unapproved = {
    version: '1.0',
    title: 'Audit Task',
    summary: 'Testing unapproved block',
    decisions: ['None'],
    tasks: [{ id: 't1', title: 'Task', files: [], description: 'Do something' }],
    criteria: [],
    unresolvedRisks: [],
    approvedByUser: false,
  };

  const evidence = await service.execute({
    decisionPacket: unapproved,
    workspace: tempWorkspace,
    onLog: () => {},
  });

  assert.equal(evidence.success, false);
  assert.equal(evidence.blockedReason, 'UNAPPROVED_PACKET');
});

test('Integration Audit 2: Path traversal and protected baseline blocked', () => {
  const traversal = validateAndCanonicalizeWorkspace(path.join(tempWorkspace, '..', '..'));
  const protectedTarget = validateAndCanonicalizeWorkspace('D:\\Code\\NEXT JS\\multi-ai-relay-autonomous\\backups\\v0.1.9');

  assert.equal(protectedTarget.valid, false);
  assert.match(protectedTarget.error, /protected path/i);
});

test('Integration Audit 3: Shell metacharacters and chaining blocked', () => {
  const chained = isCommandPolicyCompliant('node --test tests/verify.test.mjs && echo hacked');
  assert.equal(chained.compliant, false);

  const safe = isCommandPolicyCompliant('node --test tests/verify.test.mjs');
  assert.equal(safe.compliant, true);
});

test('Integration Audit 4: Execution in isolated temp workspace collects evidence', async () => {
  const service = new ExecutionService();
  const logs = [];

  const mockCliCmd = path.join(os.tmpdir(), `audit-mock-cli-${Date.now()}.cmd`);
  fs.writeFileSync(mockCliCmd, `@echo off\r\necho Mock CLI task finished successfully\r\nexit /b 0\r\n`);

  // Mock resolver pointing to isolated mock CLI script
  const mockResolver = {
    resolve: async () => ({
      name: 'mock-agent',
      executablePath: mockCliCmd,
      version: '1.0.0-mock',
      available: true,
    }),
  };

  const approvedPacket = {
    version: '1.0',
    title: 'Harmless Audit Test Task',
    summary: 'Runs a verified non-destructive test in isolated temp workspace',
    decisions: ['Operate strictly within temp-test-workspace'],
    tasks: [
      {
        id: 'audit-task-1',
        title: 'Verify README exists',
        files: ['README.md'],
        description: 'Verify README.md exists and is readable',
        testCommand: 'node --test tests/verify.test.mjs',
      },
    ],
    criteria: ['Verification test passes'],
    unresolvedRisks: [],
    consensusTimestamp: new Date().toISOString(),
    approvedByUser: true,
  };

  approvedPacket.approvalSignature = computeDecisionPacketHash(approvedPacket);

  // Prevent parent node:test context recursion warning
  delete process.env.NODE_TEST_CONTEXT;

  try {
    const evidence = await service.execute({
      decisionPacket: approvedPacket,
      workspace: tempWorkspace,
      cliResolver: mockResolver,
      onLog: (chunk) => logs.push(chunk),
    });

    assert.equal(evidence.success, true);
    assert.equal(evidence.exitCode, 0);
    assert.ok(fs.existsSync(evidence.fullLogPath), 'Execution log must exist in .orchestrator/logs');

    const logContent = fs.readFileSync(evidence.fullLogPath, 'utf-8');
    assert.ok(logContent.includes('tests 1'));
    assert.ok(logContent.includes('pass 1'));
    assert.ok(logs.join('').includes('Verification command passed'));
  } finally {
    if (fs.existsSync(mockCliCmd)) {
      try { fs.unlinkSync(mockCliCmd); } catch {}
    }
    // Clean up temporary workspace
    try {
      fs.rmSync(tempWorkspace, { recursive: true, force: true });
    } catch {}
  }
});
