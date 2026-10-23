import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ExecutionService } from '../dist-electron/main/execution/engine.js';
import { CliResolver } from '../dist-electron/main/execution/cli-resolver.js';
import { computeDecisionPacketHash } from '../dist-electron/shared/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function run() {
  console.log('====================================================');
  console.log('    ANTIGRAVITY CLI REAL EXECUTION ENGINE TEST      ');
  console.log('====================================================');

  // 1. Resolve CLI
  const resolver = new CliResolver();
  const cliInfo = await resolver.resolve();
  console.log('1. CLI Resolver Result:');
  console.log('   Available:', cliInfo.available);
  console.log('   Name:', cliInfo.name);
  console.log('   Version:', cliInfo.version);
  console.log('   Executable:', cliInfo.executablePath);

  if (!cliInfo.available) {
    console.error('FAIL: CLI is not available on this machine.');
    process.exit(1);
  }

  // 2. Prepare a valid, approved Decision Packet
  const packet = {
    version: '1.0',
    title: 'Live Antigravity Integration Test',
    summary: 'Verify that ExecutionService correctly invokes the real agent CLI',
    decisions: ['Invoke local CLI in headless non-interactive mode'],
    tasks: [
      {
        id: 'task-live-1',
        title: 'Echo Integration Test',
        files: ['package.json'],
        description: 'Print "ANTIGRAVITY_INTEGRATION_SUCCESS" to stdout.',
        testCommand: 'git status',
      },
    ],
    criteria: ['CLI exits with 0', 'Integration token printed to output'],
    unresolvedRisks: [],
    consensusTimestamp: new Date().toISOString(),
    approvedByUser: true,
  };

  // Sign the packet cryptographically
  packet.approvalSignature = computeDecisionPacketHash(packet);
  console.log('\n2. Generated Approved & Cryptographically Signed Decision Packet:');
  console.log('   Title:', packet.title);
  console.log('   Signature:', packet.approvalSignature.slice(0, 16) + '...');

  // 3. Instantiate ExecutionService
  const executionService = new ExecutionService();
  console.log('\n3. Spawning Execution via ExecutionService...');
  const start = Date.now();
  const logs = [];

  const evidence = await executionService.execute({
    decisionPacket: packet,
    workspace: projectRoot,
    cliResolver: resolver,
    onLog: (chunk) => {
      logs.push(chunk);
      process.stdout.write(chunk);
    },
    onTaskStart: (task, index, total) => {
      console.log(`\n>>> [Event: onTaskStart] Starting Task ${index}/${total}: "${task.title}"\n`);
    },
  });

  const durationSec = ((Date.now() - start) / 1000).toFixed(1);

  console.log('\n====================================================');
  console.log('               EXECUTION EVIDENCE RETURNED          ');
  console.log('====================================================');
  console.log('Success:', evidence.success);
  console.log('Exit Code:', evidence.exitCode);
  console.log('Duration:', `${durationSec}s`);
  console.log('Log File:', evidence.fullLogPath);
  console.log('Diff Stat:\n' + (evidence.diffStat || '(no diff)'));
  console.log('Changed Files:', evidence.changedFiles);
  console.log('Stdout Tail:\n' + evidence.stdoutTail);

  if (evidence.success && evidence.exitCode === 0) {
    console.log('\n✔ ANTIGRAVITY EXECUTION ENGINE FULLY OPERATIONAL AND VERIFIED!');
    process.exit(0);
  } else {
    console.error('\n✖ Execution failed. Reason:', evidence.blockedReason || 'Exit code ' + evidence.exitCode);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Unhandled error during test:', err);
  process.exit(1);
});
