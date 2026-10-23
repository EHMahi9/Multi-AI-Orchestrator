import { spawn, exec, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { CliResolver, CliInfo } from './cli-resolver';
import { validateAndCanonicalizeWorkspace, isCommandPolicyCompliant } from './policy';
import { validateDecisionPacket } from '../../shared/schema';
import type { DecisionPacket, DecisionTask, ExecutionEvidence } from '../../shared/types';

export interface ExecutionOptions {
  decisionPacket: DecisionPacket;
  workspace: string;
  cliResolver?: CliResolver;
  onLog: (chunk: string) => void;
  onTaskStart?: (task: DecisionTask, index: number, total: number) => void;
}

export class ExecutionService {
  private activeChild: ChildProcess | null = null;
  private cancelled = false;

  /**
   * Gracefully cancels the currently running execution child process.
   * Strictly targets ONLY the child process tree spawned by this service.
   */
  public cancel(): void {
    this.cancelled = true;
    if (this.activeChild && !this.activeChild.killed && this.activeChild.pid) {
      const pid = this.activeChild.pid;
      if (process.platform === 'win32') {
        // Kill only the specific child process tree by PID
        exec(`taskkill /PID ${pid} /T /F`, () => {});
      } else {
        try {
          process.kill(-pid, 'SIGTERM');
        } catch {
          this.activeChild.kill('SIGTERM');
        }
      }
    }
  }

  /**
   * Executes an approved Decision Packet within the specified workspace.
   */
  public async execute(options: ExecutionOptions): Promise<ExecutionEvidence> {
    const { decisionPacket, workspace, onLog, onTaskStart } = options;
    const startTime = Date.now();

    if (this.cancelled) {
      const err = 'Execution cancelled before start.';
      onLog(`[Execution Cancelled] ${err}\n`);
      return {
        success: false,
        exitCode: 130,
        stdoutTail: '',
        stderrTail: err,
        changedFiles: [],
        diffStat: '',
        durationMs: 0,
        fullLogPath: '',
        cancelled: true,
      };
    }

    // ------------------------------------------------------------------------
    // Step 1: Strict User Approval & Schema Validation Gating
    // ------------------------------------------------------------------------
    if (!decisionPacket || !decisionPacket.approvedByUser) {
      const err = 'Execution rejected: Decision Packet has not received explicit user approval.';
      onLog(`[Execution Gated] ${err}\n`);
      return this.createBlockedEvidence(err, 'UNAPPROVED_PACKET', startTime);
    }

    const schemaCheck = validateDecisionPacket(decisionPacket);
    if (!schemaCheck.valid || !schemaCheck.packet) {
      const err = `Execution rejected: Decision Packet is malformed (${schemaCheck.errors.join(', ')}).`;
      onLog(`[Execution Gated] ${err}\n`);
      return this.createBlockedEvidence(err, 'INVALID_SCHEMA', startTime);
    }

    // ------------------------------------------------------------------------
    // Step 2: Canonical Workspace Validation & Traversal Defense
    // ------------------------------------------------------------------------
    const wsCheck = validateAndCanonicalizeWorkspace(workspace);
    if (!wsCheck.valid || !wsCheck.canonicalPath) {
      const err = `Execution rejected: Workspace path is invalid or prohibited (${wsCheck.error}).`;
      onLog(`[Workspace Security] ${err}\n`);
      return this.createBlockedEvidence(err, 'INVALID_WORKSPACE', startTime);
    }
    const targetDir = wsCheck.canonicalPath;

    // ------------------------------------------------------------------------
    // Step 3: CLI Binary Resolution
    // ------------------------------------------------------------------------
    const resolver = options.cliResolver || new CliResolver();
    const cliInfo: CliInfo = await resolver.resolve();
    if (!cliInfo.available) {
      const err = `Execution BLOCKED: ${cliInfo.error || 'Agent CLI not found.'}`;
      onLog(`[CLI Resolver] ${err}\n`);
      return this.createBlockedEvidence(err, 'CLI_NOT_FOUND', startTime);
    }

    onLog(`[Execution Engine] Active agent CLI: ${cliInfo.name} (${cliInfo.version}) at ${cliInfo.executablePath}\n`);
    onLog(`[Execution Engine] Target workspace: ${targetDir}\n`);

    // Ensure .orchestrator log directory exists in workspace
    const logDir = path.join(targetDir, '.orchestrator', 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const logFilePath = path.join(logDir, `run-${Date.now()}.log`);
    const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

    // ------------------------------------------------------------------------
    // Step 4: Pre-Execution Git State Capture
    // ------------------------------------------------------------------------
    const preGitStatus = await this.runGitCommand(['status', '--porcelain'], targetDir);
    onLog(`[Git Pre-State] Working tree status captured (${preGitStatus.split('\n').filter(Boolean).length} tracked items).\n`);

    let stdoutAccumulator = '';
    let stderrAccumulator = '';
    let overallSuccess = true;
    let finalExitCode = 0;

    const totalTasks = decisionPacket.tasks.length;
    onLog(`[Execution Plan] Executing ${totalTasks} approved tasks...\n\n`);

    // ------------------------------------------------------------------------
    // Step 5: Execute Approved Tasks Sequentially
    // ------------------------------------------------------------------------
    for (let i = 0; i < totalTasks; i++) {
      if (this.cancelled) {
        onLog(`\n[Execution Cancelled] Operation stopped by user.\n`);
        finalExitCode = 130;
        overallSuccess = false;
        break;
      }

      const task = decisionPacket.tasks[i];
      onTaskStart?.(task, i + 1, totalTasks);
      onLog(`----------------------------------------------------------------------\n`);
      onLog(`[Task ${i + 1}/${totalTasks}] ${task.title}\n`);
      onLog(`Files: ${task.files.join(', ') || 'N/A'}\n`);
      onLog(`----------------------------------------------------------------------\n`);

      // Construct safe instruction text
      const taskInstruction = `Approved Task: ${task.title}\nDescription:\n${task.description}\nTarget Files: ${task.files.join(', ')}\nTest Command: ${task.testCommand || 'None'}`;

      // Execute via agent CLI without shell concatenation
      const taskResult = await this.spawnCliTask(cliInfo, taskInstruction, targetDir, (chunk) => {
        stdoutAccumulator += chunk;
        onLog(chunk);
        logStream.write(chunk);
      }, (chunk) => {
        stderrAccumulator += chunk;
        onLog(chunk);
        logStream.write(chunk);
      });

      if (!taskResult.success) {
        overallSuccess = false;
        finalExitCode = taskResult.exitCode;
        onLog(`\n[Task Failed] ${task.title} exited with code ${taskResult.exitCode}\n`);
        break;
      }

      // Check task testCommand policy compliance
      if (task.testCommand && !this.cancelled) {
        const policy = isCommandPolicyCompliant(task.testCommand);
        if (!policy.compliant) {
          onLog(`[Policy Alert] Suggested testCommand "${task.testCommand}" was blocked by safety policy: ${policy.reason}\n`);
        } else {
          onLog(`[Running Verification] Executing test command: ${task.testCommand}\n`);
          const testTokens = task.testCommand.split(' ');
          const testRunner = testTokens[0];
          const testArgs = testTokens.slice(1);

          const testResult = await this.spawnSafeSubprocess(testRunner, testArgs, targetDir, (chunk) => {
            stdoutAccumulator += chunk;
            onLog(chunk);
            logStream.write(chunk);
          });

          if (!testResult.success) {
            onLog(`[Verification Failed] Test command failed with exit code ${testResult.exitCode}\n`);
            overallSuccess = false;
            finalExitCode = testResult.exitCode;
            break;
          } else {
            onLog(`✔ Verification command passed!\n`);
          }
        }
      }
    }

    logStream.end();

    // ------------------------------------------------------------------------
    // Step 6: Post-Execution Git Evidence Collection
    // ------------------------------------------------------------------------
    const diffStat = await this.runGitCommand(['diff', '--stat'], targetDir);
    const postStatus = await this.runGitCommand(['status', '--porcelain'], targetDir);

    const changedFiles = postStatus
      .split('\n')
      .map((line) => line.trim().slice(3))
      .filter(Boolean);

    const durationMs = Date.now() - startTime;
    onLog(`\n======================================================================\n`);
    onLog(`[Execution Complete] Duration: ${(durationMs / 1000).toFixed(1)}s | Exit Code: ${finalExitCode}\n`);
    onLog(`[Changed Files (${changedFiles.length})]: ${changedFiles.join(', ') || 'None'}\n`);
    if (diffStat) {
      onLog(`[Git Diff Stat]:\n${diffStat}\n`);
    }
    onLog(`Log saved: ${logFilePath}\n`);
    onLog(`======================================================================\n`);

    return {
      success: overallSuccess && !this.cancelled,
      exitCode: finalExitCode,
      stdoutTail: stdoutAccumulator.slice(-1500),
      stderrTail: stderrAccumulator.slice(-1500),
      changedFiles,
      diffStat,
      durationMs,
      fullLogPath: logFilePath,
      cancelled: this.cancelled,
    };
  }

  /**
   * Spawns the CLI task using safe argument arrays.
   * Never passes user or AI text through string concatenation in a shell.
   */
  private spawnCliTask(
    cliInfo: CliInfo,
    prompt: string,
    cwd: string,
    onStdout: (data: string) => void,
    onStderr: (data: string) => void
  ): Promise<{ success: boolean; exitCode: number }> {
    return new Promise((resolve) => {
      // Discrete argument array: NO --yolo, preserving all safety prompts
      const args: string[] = ['-p', prompt, '-o', 'text'];

      const isWin = process.platform === 'win32';
      let child: ChildProcess;

      if (isWin && cliInfo.executablePath.endsWith('.cmd')) {
        // Execute cmd.exe with discrete tokens (no shell string concatenation)
        child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', cliInfo.executablePath, ...args], {
          cwd,
          shell: false,
          windowsHide: true,
        });
      } else {
        child = spawn(cliInfo.executablePath, args, {
          cwd,
          shell: false,
        });
      }

      this.activeChild = child;

      child.stdout?.on('data', (d) => onStdout(d.toString()));
      child.stderr?.on('data', (d) => onStderr(d.toString()));

      child.on('error', (err) => {
        onStderr(`[Spawn Error] Failed to launch CLI process: ${err.message}\n`);
        resolve({ success: false, exitCode: 1 });
      });

      child.on('close', (code) => {
        this.activeChild = null;
        resolve({ success: code === 0, exitCode: code ?? 0 });
      });
    });
  }

  /**
   * Executes a verified safe verification command (e.g. npm test) with discrete argument tokens.
   */
  private spawnSafeSubprocess(
    executable: string,
    args: string[],
    cwd: string,
    onOutput: (data: string) => void
  ): Promise<{ success: boolean; exitCode: number }> {
    return new Promise((resolve) => {
      const isWin = process.platform === 'win32';
      const runner = isWin && (executable === 'npm' || executable === 'npx') ? `${executable}.cmd` : executable;

      const child = spawn(runner, args, {
        cwd,
        shell: false,
      });

      this.activeChild = child;

      child.stdout?.on('data', (d) => onOutput(d.toString()));
      child.stderr?.on('data', (d) => onOutput(d.toString()));

      child.on('close', (code) => {
        this.activeChild = null;
        resolve({ success: code === 0, exitCode: code ?? 0 });
      });

      child.on('error', () => {
        resolve({ success: false, exitCode: 1 });
      });
    });
  }

  private runGitCommand(args: string[], cwd: string): Promise<string> {
    return new Promise((resolve) => {
      exec(`git ${args.join(' ')}`, { cwd, timeout: 5000 }, (_err, stdout) => {
        resolve(stdout ? stdout.trim() : '');
      });
    });
  }

  private createBlockedEvidence(
    reason: string,
    blockedCode: string,
    startTime: number
  ): ExecutionEvidence {
    return {
      success: false,
      exitCode: 1,
      stdoutTail: '',
      stderrTail: reason,
      changedFiles: [],
      diffStat: '',
      durationMs: Date.now() - startTime,
      fullLogPath: '',
      blockedReason: blockedCode,
    };
  }
}
