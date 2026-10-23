// Antigravity Local Execution Engine for Multi-AI Orchestrator
// Directly spawns `agy -p "<task>" --json` and runs verification test suites
// Collects real OS execution evidence (exit codes, stdout, stderr, git diffs).

const { spawn, exec } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

function runProcess(command, args, cwd, onLog = () => {}, timeoutMs = 240000) {
  return new Promise((resolve) => {
    const start = Date.now();
    let stdout = '';
    let stderr = '';

    onLog(`[Command] Running: ${command} ${args.join(' ')}\n(Workspace: ${cwd})\n\n`);

    const child = spawn(command, args, {
      cwd,
      shell: true,
      windowsHide: true
    });

    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch (_) {}
      const timeoutMsg = `\n[TIMEOUT] Process halted after ${timeoutMs / 1000}s\n`;
      stderr += timeoutMsg;
      onLog(timeoutMsg);
      resolve({
        exitCode: 124,
        stdout,
        stderr,
        durationMs: Date.now() - start
      });
    }, timeoutMs);

    child.stdout?.on('data', (d) => {
      const chunk = d.toString();
      stdout += chunk;
      onLog(chunk);
    });

    child.stderr?.on('data', (d) => {
      const chunk = d.toString();
      stderr += chunk;
      onLog(chunk);
    });

    child.on('close', (exitCode) => {
      clearTimeout(timer);
      onLog(`\n[Process Exited] Exit code: ${exitCode ?? 0} in ${(Date.now() - start)}ms\n`);
      resolve({
        exitCode: exitCode ?? 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        durationMs: Date.now() - start
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      const errMsg = err.message || String(err);
      stderr += errMsg;
      onLog(`\n[Process Error] ${errMsg}\n`);
      resolve({
        exitCode: 1,
        stdout,
        stderr,
        durationMs: Date.now() - start
      });
    });
  });
}

function getChangedFiles(cwd) {
  return new Promise((resolve) => {
    exec('git status --porcelain', { cwd }, (err, stdout) => {
      if (err || !stdout) return resolve([]);
      const files = stdout
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => l.replace(/^[AMD?RCU\s]+\s+/, ''));
      resolve(files);
    });
  });
}

function getGitDiffStat(cwd) {
  return new Promise((resolve) => {
    exec('git diff --stat', { cwd }, (err, stdout) => {
      if (err || !stdout) return resolve('');
      resolve(stdout.trim());
    });
  });
}

async function executeAntigravityTask({ task, workspace, testCommand, onLog = () => {} }) {
  const targetCwd = workspace || process.cwd();

  onLog(`\n=======================================================\n`);
  onLog(`[Antigravity] Starting Task Implementation\n`);
  onLog(`Task Directive: ${task.slice(0, 160)}...\n`);
  onLog(`=======================================================\n\n`);

  // Run Antigravity CLI
  const agyResult = await runProcess(
    'agy',
    ['-p', `"${task.replace(/"/g, '\\"')}"`, '--json'],
    targetCwd,
    onLog,
    300000
  );

  // Run verification test if provided
  let testResult = null;
  if (testCommand) {
    onLog(`\n[Verification] Executing Test Command: ${testCommand}\n`);
    testResult = await runProcess(testCommand, [], targetCwd, onLog, 60000);
  }

  const changedFiles = await getChangedFiles(targetCwd);
  const diffStat = await getGitDiffStat(targetCwd);

  const testsPassed = testResult ? testResult.exitCode === 0 : agyResult.exitCode === 0;

  return {
    ok: true,
    executionId: `exec_${Date.now()}`,
    timestamp: new Date().toISOString(),
    exitCode: testResult ? testResult.exitCode : agyResult.exitCode,
    stdout: (agyResult.stdout + '\n' + (testResult?.stdout || '')).trim(),
    stderr: (agyResult.stderr + '\n' + (testResult?.stderr || '')).trim(),
    changedFiles,
    diffStat,
    testsPassed,
    agyResult,
    testResult
  };
}

module.exports = { executeAntigravityTask, runProcess, getChangedFiles };
