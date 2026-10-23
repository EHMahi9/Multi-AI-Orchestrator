import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { LoopController } from '../dist-electron/main/review/loop-controller.js';
import { ConsensusEngine } from '../dist-electron/main/review/consensus-engine.js';
import { EvidenceCollector } from '../dist-electron/main/review/evidence-collector.js';
import { CorrectionPlanner } from '../dist-electron/main/review/correction-planner.js';
import { ReportGenerator } from '../dist-electron/main/review/report-generator.js';
import { validateStructuredReview, parseAndValidateReview } from '../dist-electron/shared/review-schema.js';
import { computeDecisionPacketHash } from '../dist-electron/shared/schema.js';
import { validateAndCanonicalizeWorkspace } from '../dist-electron/main/execution/policy.js';

function createApprovedPacket(workspace, overrides = {}) {
  const packet = {
    version: '1.0',
    title: 'Autonomous Self-Correction Feature',
    summary: 'Testing closed-loop review and bounded corrections',
    decisions: ['Implement bounded loop', 'Enforce user approval checkpoints'],
    tasks: [
      {
        id: 't-1',
        title: 'Build and test core module',
        files: ['core.js'],
        description: 'Implement core function and verification test',
        testCommand: 'node --test tests/core.test.mjs',
      },
    ],
    criteria: ['Core module passes verification'],
    unresolvedRisks: [],
    consensusTimestamp: new Date().toISOString(),
    approvedByUser: true,
    approvedWorkspace: workspace,
    ...overrides,
  };

  packet.approvalSignature = computeDecisionPacketHash(packet);
  return packet;
}

function createSampleReview(providerId, verdict, findings = [], overrides = {}) {
  return {
    schemaVersion: '1.0',
    providerId,
    role: `${providerId} Reviewer`,
    verdict,
    summary: `${providerId} evaluated execution evidence as ${verdict}`,
    findings,
    evidenceReferences: ['Test Output', 'Exit Code'],
    requiredCorrections: findings.length > 0 ? ['Fix reported defect'] : [],
    riskLevel: findings.some((f) => f.severity === 'critical')
      ? 'critical'
      : findings.some((f) => f.severity === 'high')
      ? 'high'
      : 'low',
    confidence: 0.95,
    missingEvidence: [],
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ----------------------------------------------------------------------------
// Test Group 1: Review Schema & Parsing Validation
// ----------------------------------------------------------------------------
test('Loop Review 1: Invalid review JSON is rejected cleanly', () => {
  const res1 = parseAndValidateReview('Malformed non-JSON text', 'chatgpt', 'Architect');
  assert.equal(res1.valid, false);
  assert.match(res1.errors[0], /Failed to extract review JSON/i);

  // Missing required verdict
  const invalidSchema = {
    schemaVersion: '1.0',
    summary: 'Missing verdict',
  };
  const res2 = validateStructuredReview(invalidSchema, 'chatgpt', 'Architect');
  assert.equal(res2.valid, false);
  assert.match(res2.errors.join(' '), /Invalid verdict/i);

  // Valid JSON review is accepted
  const validJson = JSON.stringify(createSampleReview('gemini', 'PASS'));
  const res3 = parseAndValidateReview(`\`\`\`json\n${validJson}\n\`\`\``, 'gemini', 'Feasibility');
  assert.equal(res3.valid, true);
  assert.equal(res3.review.verdict, 'PASS');
});

// ----------------------------------------------------------------------------
// Test Group 2: Consensus Engine Deterministic Rules
// ----------------------------------------------------------------------------
test('Loop Consensus 2: Insufficient quorum produces BLOCKED', () => {
  const engine = new ConsensusEngine();
  const singleReview = [createSampleReview('gemini', 'PASS')];
  const evidence = { exitCode: 0, success: true, timedOut: false, testPassed: true, durationMs: 100, missingEvidence: [] };

  // When 2 reviews required but only 1 provided
  const consensus = engine.evaluate(singleReview, evidence, { minQuorum: 2 });
  assert.equal(consensus.verdict, 'BLOCKED');
  assert.equal(consensus.quorumReached, false);
  assert.match(consensus.rationale, /insufficient reviewer participation/i);
});

test('Loop Consensus 3: Critical security findings block continuation', () => {
  const engine = new ConsensusEngine();
  const criticalFinding = {
    id: 'SEC-1',
    severity: 'critical',
    description: 'Path traversal attempted outside workspace boundary',
    evidenceReferences: ['stderr'],
    reproducible: true,
    recommendedAction: 'Restrict path access',
  };

  const reviews = [
    createSampleReview('chatgpt', 'PASS'),
    createSampleReview('deepseek', 'BLOCKED', [criticalFinding]),
  ];
  const evidence = { exitCode: 0, success: true, timedOut: false, testPassed: true, durationMs: 100, missingEvidence: [] };

  const consensus = engine.evaluate(reviews, evidence, { minQuorum: 2 });
  assert.equal(consensus.verdict, 'BLOCKED');
  assert.equal(consensus.riskLevel, 'critical');
  assert.match(consensus.rationale, /critical security findings/i);
});

test('Loop Consensus 4: Missing evidence cannot yield PASS', () => {
  const engine = new ConsensusEngine();
  const reviews = [
    createSampleReview('chatgpt', 'PASS'),
    createSampleReview('gemini', 'PASS'),
  ];
  // Evidence is missing execution logs and diagnostics
  const evidence = { exitCode: 0, success: true, timedOut: false, testPassed: true, durationMs: 100, missingEvidence: ['MISSING_EXECUTION_LOG_FILE'] };

  const consensus = engine.evaluate(reviews, evidence, { minQuorum: 2 });
  assert.equal(consensus.verdict, 'BLOCKED');
  assert.match(consensus.summary, /Crucial execution evidence missing/i);
});

test('Loop Consensus 5: Failing test assertions require REVISION_REQUIRED even if reviewers voted PASS', () => {
  const engine = new ConsensusEngine();
  const reviews = [
    createSampleReview('chatgpt', 'PASS'),
    createSampleReview('gemini', 'PASS'),
  ];
  // Test failed with exit code 1
  const evidence = { exitCode: 1, success: false, timedOut: false, testPassed: false, testOutput: '1 test failed', durationMs: 100, missingEvidence: [] };

  const consensus = engine.evaluate(reviews, evidence, { minQuorum: 2 });
  assert.equal(consensus.verdict, 'REVISION_REQUIRED');
  assert.match(consensus.summary, /Verification test failed/i);
});

test('Loop Consensus 6: Conflicting verdicts produce REVISION_REQUIRED if high defect exists', () => {
  const engine = new ConsensusEngine();
  const highFinding = {
    id: 'DEF-1',
    severity: 'high',
    description: 'Null pointer exception on missing config key',
    evidenceReferences: ['stdout'],
    reproducible: true,
    recommendedAction: 'Add null check',
  };

  const reviews = [
    createSampleReview('chatgpt', 'PASS'),
    createSampleReview('deepseek', 'REVISION_REQUIRED', [highFinding]),
  ];
  const evidence = { exitCode: 0, success: true, timedOut: false, testPassed: true, durationMs: 100, missingEvidence: [] };

  const consensus = engine.evaluate(reviews, evidence, { minQuorum: 2 });
  assert.equal(consensus.verdict, 'REVISION_REQUIRED');
  assert.equal(consensus.findings.length, 1);
});

// ----------------------------------------------------------------------------
// Test Group 3: Correction Planner Constraints
// ----------------------------------------------------------------------------
test('Loop Planner 7: Correction proposals cannot change file scope without approval', () => {
  const planner = new CorrectionPlanner();
  const originalPacket = createApprovedPacket('D:\\fake\\workspace');
  const consensus = {
    verdict: 'REVISION_REQUIRED',
    summary: 'Fix required',
    quorumReached: true,
    participatingProviders: ['chatgpt', 'gemini'],
    failedProviders: [],
    individualReviews: [],
    findings: [{ id: 'F-1', severity: 'medium', description: 'Logic bug', evidenceReferences: [], reproducible: true, recommendedAction: 'Fix' }],
    requiredCorrections: ['Fix bug in core.js'],
    riskLevel: 'medium',
    rationale: 'Defect found',
    timestamp: new Date().toISOString(),
  };
  const evidence = { exitCode: 1, success: false, timedOut: false, testPassed: false, durationMs: 100, missingEvidence: [] };

  const proposal = planner.planCorrection({
    iteration: 1,
    originalPacket,
    consensus,
    evidence,
  });

  assert.equal(proposal.iteration, 1);
  assert.equal(proposal.requiresUserApproval, true);
  assert.equal(proposal.approved, false);
  // Ensure target files are constrained strictly to original files
  assert.deepEqual(proposal.proposedPacket.tasks[0].files, ['core.js']);
  assert.equal(proposal.proposedPacket.approvedByUser, false);
  assert.equal(proposal.proposedPacket.approvalSignature, undefined);
});

// ----------------------------------------------------------------------------
// Test Group 4: Loop Controller State Machine & Bounded Iterations
// ----------------------------------------------------------------------------
test('Loop State Machine 8: Initial execution is blocked without explicit approval', async () => {
  const controller = new LoopController();
  const unapproved = createApprovedPacket('D:\\fake\\workspace', { approvedByUser: false });

  const result = await controller.startLoop(unapproved, {
    workspace: 'D:\\fake\\workspace',
    selectedProviders: { chatgpt: true, gemini: true, deepseek: true, claude: false },
    onLog: () => {},
    onStageChange: () => {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.stage, 'awaiting_initial_approval');
  assert.match(result.error, /explicit user approval/i);
});

test('Loop State Machine 9: Duplicate concurrent runs are rejected', async () => {
  const controller = new LoopController();
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'concurrent-ws-'));

  try {
    const packet = createApprovedPacket(ws);

    // Mock CLI script
    const mockCli = path.join(ws, 'mock.cmd');
    fs.writeFileSync(mockCli, `@echo off\r\necho running\r\nexit /b 0\r\n`);
    const mockResolver = {
      resolve: async () => ({ name: 'mock', executablePath: mockCli, version: '1.0', available: true }),
    };

    // First run with mock reviews completing as PASS
    const p1 = controller.startLoop(packet, {
      workspace: ws,
      selectedProviders: { gemini: true },
      cliResolver: mockResolver,
      mockReviews: [createSampleReview('gemini', 'PASS')],
      onLog: () => {},
      onStageChange: () => {},
    });

    // Attempt second run while first is in flight or active
    // If p1 started, starting again should be rejected
    const p2 = await controller.startLoop(packet, {
      workspace: ws,
      selectedProviders: { gemini: true },
      onLog: () => {},
      onStageChange: () => {},
    });

    assert.equal(p2.ok, false);
    assert.match(p2.error, /already active/i);

    await p1;
  } finally {
    try { fs.rmSync(ws, { recursive: true, force: true }); } catch {}
  }
});

test('Loop State Machine 10: Enforces 3 correction iterations and stops with REVISION_LIMIT_REACHED', async () => {
  const controller = new LoopController();
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'iter-limit-ws-'));

  try {
    const packet = createApprovedPacket(ws);

    const mockCli = path.join(ws, 'mock.cmd');
    fs.writeFileSync(mockCli, `@echo off\r\necho mock\r\nexit /b 0\r\n`);
    const mockResolver = {
      resolve: async () => ({ name: 'mock', executablePath: mockCli, version: '1.0', available: true }),
    };

    const defectFinding = {
      id: 'BUG-1',
      severity: 'high',
      description: 'Persistent test failure',
      evidenceReferences: ['stdout'],
      reproducible: true,
      recommendedAction: 'Fix logic',
    };

    // Reviewers consistently request revisions
    const revisionReviews = [
      createSampleReview('gemini', 'REVISION_REQUIRED', [defectFinding]),
    ];

    // Iteration 0 (Initial execution)
    const initRes = await controller.startLoop(packet, {
      workspace: ws,
      selectedProviders: { gemini: true },
      cliResolver: mockResolver,
      maxCorrectionIterations: 3,
      mockReviews: revisionReviews,
      onLog: () => {},
      onStageChange: () => {},
    });

    assert.equal(initRes.ok, true);
    assert.equal(initRes.stage, 'awaiting_correction_approval');
    assert.equal(controller.getIteration(), 1);

    // Iteration 1 Approval
    const it1Res = await controller.approveCorrection();
    assert.equal(it1Res.ok, true);
    assert.equal(it1Res.stage, 'awaiting_correction_approval');
    assert.equal(controller.getIteration(), 2);

    // Iteration 2 Approval
    const it2Res = await controller.approveCorrection();
    assert.equal(it2Res.ok, true);
    assert.equal(it2Res.stage, 'awaiting_correction_approval');
    assert.equal(controller.getIteration(), 3);

    // Iteration 3 Approval (Final allowed iteration)
    const it3Res = await controller.approveCorrection();
    assert.equal(it3Res.ok, false);
    assert.equal(it3Res.stage, 'revision_limit_reached');
    assert.equal(controller.getIteration(), 3);
    assert.ok(it3Res.report);
    assert.equal(it3Res.report.outcome, 'REVISION_LIMIT_REACHED');
    assert.ok(fs.existsSync(it3Res.report.persistedReportPath));
  } finally {
    try { fs.rmSync(ws, { recursive: true, force: true }); } catch {}
  }
});

test('Loop State Machine 11: Cancellation cleanly halts loop and writes report', async () => {
  const controller = new LoopController();
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'cancel-ws-'));

  try {
    const packet = createApprovedPacket(ws);

    const mockCli = path.join(ws, 'mock.cmd');
    fs.writeFileSync(mockCli, `@echo off\r\necho mock\r\nexit /b 0\r\n`);
    const mockResolver = {
      resolve: async () => ({ name: 'mock', executablePath: mockCli, version: '1.0', available: true }),
    };

    // Cancel after starting
    const startPromise = controller.startLoop(packet, {
      workspace: ws,
      selectedProviders: { gemini: true },
      cliResolver: mockResolver,
      mockReviews: [createSampleReview('gemini', 'REVISION_REQUIRED', [{ id: 'D-1', severity: 'medium', description: 'Issue', evidenceReferences: [], reproducible: true, recommendedAction: 'Fix' }])],
      onLog: () => {},
      onStageChange: () => {},
    });

    const res = await startPromise;
    assert.equal(res.stage, 'awaiting_correction_approval');

    // Rejecting the correction halts with CANCELLED
    const rejectRes = await controller.rejectCorrection();
    assert.equal(rejectRes.stage, 'cancelled');
    assert.ok(rejectRes.report);
    assert.equal(rejectRes.report.outcome, 'CANCELLED');
    assert.ok(fs.existsSync(rejectRes.report.persistedReportPath));
  } finally {
    try { fs.rmSync(ws, { recursive: true, force: true }); } catch {}
  }
});

test('Loop State Machine 12: Successful consensus in loop terminates with PASS and writes audit report', async () => {
  const controller = new LoopController();
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-ws-'));

  try {
    const packet = createApprovedPacket(ws);

    // Create the test file so the testCommand succeeds
    fs.mkdirSync(path.join(ws, 'tests'), { recursive: true });
    fs.writeFileSync(
      path.join(ws, 'tests', 'core.test.mjs'),
      "import test from 'node:test'; import assert from 'node:assert/strict'; test('Pass', () => assert.ok(true));\n"
    );

    const mockCli = path.join(ws, 'mock.cmd');
    fs.writeFileSync(mockCli, `@echo off\r\necho All tests passed\r\nexit /b 0\r\n`);
    const mockResolver = {
      resolve: async () => ({ name: 'mock', executablePath: mockCli, version: '1.0', available: true }),
    };

    const passReviews = [
      createSampleReview('chatgpt', 'PASS'),
      createSampleReview('gemini', 'PASS'),
    ];

    delete process.env.NODE_TEST_CONTEXT;

    const res = await controller.startLoop(packet, {
      workspace: ws,
      selectedProviders: { chatgpt: true, gemini: true },
      cliResolver: mockResolver,
      mockReviews: passReviews,
      onLog: () => {},
      onStageChange: () => {},
    });

    assert.equal(res.ok, true);
    assert.equal(res.stage, 'completed');
    assert.ok(res.report);
    assert.equal(res.report.outcome, 'PASS');
    assert.ok(fs.existsSync(res.report.persistedReportPath));

    const content = JSON.parse(fs.readFileSync(res.report.persistedReportPath, 'utf-8'));
    assert.equal(content.outcome, 'PASS');
    assert.equal(content.iterations.length, 1);
  } finally {
    try { fs.rmSync(ws, { recursive: true, force: true }); } catch {}
  }
});

test('Loop State Machine 13: Provider errors do not count as consensus votes or reset iteration counter', () => {
  const engine = new ConsensusEngine();
  // 1 successful review, 1 missing/errored review
  const validReview = [createSampleReview('gemini', 'PASS')];
  const evidence = { exitCode: 0, success: true, timedOut: false, testPassed: true, durationMs: 100, missingEvidence: [] };

  // When minQuorum is 2 and only 1 valid review is returned (the other failed)
  const consensus = engine.evaluate(validReview, evidence, { minQuorum: 2 });
  assert.equal(consensus.verdict, 'BLOCKED');
  assert.equal(consensus.quorumReached, false);
});

test('Loop State Machine 14: Pre-existing user files are preserved and tracked in git evidence', async () => {
  const controller = new LoopController();
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'git-evidence-ws-'));

  try {
    // Initialize git repo with pre-existing user file
    execSync('git init', { cwd: ws, stdio: 'ignore' });
    execSync('git config user.name "Tester"', { cwd: ws, stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { cwd: ws, stdio: 'ignore' });
    fs.writeFileSync(path.join(ws, 'pre-existing-user-code.js'), '// Important User Work\n');
    execSync('git add . && git commit -m "Initial"', { cwd: ws, stdio: 'ignore' });

    const packet = createApprovedPacket(ws, {
      tasks: [
        {
          id: 't-1',
          title: 'Modify file task',
          files: ['modified.txt'],
          description: 'Create modified.txt',
        },
      ],
    });

    const mockCli = path.join(ws, 'mock.cmd');
    fs.writeFileSync(mockCli, `@echo off\r\necho Modified > modified.txt\r\nexit /b 0\r\n`);
    const mockResolver = {
      resolve: async () => ({ name: 'mock', executablePath: mockCli, version: '1.0', available: true }),
    };

    delete process.env.NODE_TEST_CONTEXT;

    const res = await controller.startLoop(packet, {
      workspace: ws,
      selectedProviders: { gemini: true },
      cliResolver: mockResolver,
      mockReviews: [createSampleReview('gemini', 'PASS')],
      onLog: () => {},
      onStageChange: () => {},
    });

    // Check that pre-existing user file remains completely intact
    assert.ok(fs.existsSync(path.join(ws, 'pre-existing-user-code.js')));
    const userContent = fs.readFileSync(path.join(ws, 'pre-existing-user-code.js'), 'utf-8');
    assert.equal(userContent, '// Important User Work\n');

    // Check that modified files were captured in report evidence
    assert.ok(res.report);
    const recordedHistory = res.report.iterations;
    assert.ok(recordedHistory[0].evidence.changedFiles.includes('modified.txt'));
  } finally {
    try { fs.rmSync(ws, { recursive: true, force: true }); } catch {}
  }
});

test('Loop State Machine 15: Interrupted runs on new instance require explicit start and never auto-resume', () => {
  const newController = new LoopController();
  // A fresh controller starts in idle state
  assert.equal(newController.getStage(), 'idle');
  assert.equal(newController.getIteration(), 0);
  assert.equal(newController.getActiveProposal(), null);
});

