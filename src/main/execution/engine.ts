import { spawn, exec, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { CliResolver, CliInfo } from './cli-resolver';
import { validateAndCanonicalizeWorkspace, parseAndValidateCommand } from './policy';
import { validateDecisionPacket, computeDecisionPacketHash } from '../../shared/schema';
import type { DecisionPacket, DecisionTask, ExecutionEvidence } from '../../shared/types';

export interface ExecutionOptions {
  decisionPacket: DecisionPacket;
  workspace: string;
  cliResolver?: CliResolver;
  timeoutMs?: number; // Configurable execution timeout (default: 300_000 ms / 5 min)
  onLog: (chunk: string) => void;
  onTaskStart?: (task: DecisionTask, index: number, total: number) => void;
}

/**
 * Safely formats an argument for Windows cmd.exe /s /c invocation.
 * Wraps arguments containing spaces or quotes in double quotes and escapes internal quotes.
 */
function quoteCmdArg(arg: string): string {
  if (typeof arg !== 'string') return '';
  if (/[ \t\n\v"]/.test(arg)) {
    return `"${arg.replace(/"/g, '""')}"`;
  }
  return arg;
}

export class ExecutionService {
  private activeChild: ChildProcess | null = null;
  private cancelled = false;
  private timedOut = false;

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
   * Returns whether an execution subprocess is currently active.
   */
  public isRunning(): boolean {
    return this.activeChild !== null && !this.activeChild.killed;
  }

  /**
   * Executes an approved Decision Packet within the specified workspace.
   */
  public async execute(options: ExecutionOptions): Promise<ExecutionEvidence> {
    const { decisionPacket, workspace, onLog, onTaskStart } = options;
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs ?? 300_000;

    this.timedOut = false;

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
        blockedReason: 'USER_CANCELLED',
      };
    }

    // ------------------------------------------------------------------------
    // Step 1: Strict User Approval & Cryptographic Integrity Gating
    // ------------------------------------------------------------------------
    if (!decisionPacket || !decisionPacket.approvedByUser) {
      const err = 'Execution rejected: Decision Packet has not received explicit user approval.';
      onLog(`[Execution Gated] ${err}\n`);
      return this.createBlockedEvidence(err, 'UNAPPROVED_PACKET', startTime);
    }

    // Validate schema
    const schemaCheck = validateDecisionPacket(decisionPacket);
    if (!schemaCheck.valid || !schemaCheck.packet) {
      const err = `Execution rejected: Decision Packet is malformed (${schemaCheck.errors.join(', ')}).`;
      onLog(`[Execution Gated] ${err}\n`);
      return this.createBlockedEvidence(err, 'INVALID_SCHEMA', startTime);
    }

    // Verify approval cryptographic signature exists
    if (!decisionPacket.approvalSignature) {
      const err = 'Execution rejected: Decision Packet lacks required cryptographic approval signature.';
      onLog(`[Execution Gated] ${err}\n`);
      return this.createBlockedEvidence(err, 'MISSING_APPROVAL_SIGNATURE', startTime);
    }

    // Verify packet has not been altered since user approval
    const computedHash = computeDecisionPacketHash(decisionPacket);
    if (computedHash !== decisionPacket.approvalSignature) {
      const err = `Execution rejected: Decision Packet was modified after approval. Expected signature ${decisionPacket.approvalSignature.slice(0, 8)}..., computed ${computedHash.slice(0, 8)}... User re-approval required.`;
      onLog(`[Security Alert] ${err}\n`);
      return this.createBlockedEvidence(err, 'TAMPERED_PACKET', startTime);
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

    // Check workspace binding if recorded during approval
    if (decisionPacket.approvedWorkspace) {
      const approvedCanonical = validateAndCanonicalizeWorkspace(decisionPacket.approvedWorkspace);
      if (!approvedCanonical.valid || approvedCanonical.canonicalPath !== targetDir) {
        const err = `Execution rejected: Target workspace "${targetDir}" does not match approved workspace "${decisionPacket.approvedWorkspace}".`;
        onLog(`[Security Alert] ${err}\n`);
        return this.createBlockedEvidence(err, 'WORKSPACE_MISMATCH', startTime);
      }
    }

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
    onLog(`[Security Bound] Approval Signature Verified: ${decisionPacket.approvalSignature.slice(0, 16)}...\n`);
    onLog(`[Execution Watchdog] Timeout limit configured: ${timeoutMs / 1000}s\n`);

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
    // Step 5: Start Watchdog Timer & Execute Tasks Sequentially
    // ------------------------------------------------------------------------
    const watchdogTimer = setTimeout(() => {
      this.timedOut = true;
      onLog(`\n[Execution Watchdog] TIMEOUT: Execution exceeded limit of ${timeoutMs / 1000}s. Cancelling running process tree...\n`);
      this.cancel();
    }, timeoutMs);

    try {
      for (let i = 0; i < totalTasks; i++) {
        if (this.cancelled || this.timedOut) {
          finalExitCode = this.timedOut ? 124 : 130;
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

        // Execute via agent CLI using safe process invocation
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
          finalExitCode = this.timedOut ? 124 : (this.cancelled ? 130 : taskResult.exitCode);
          onLog(`\n[Task Failed] ${task.title} exited with code ${finalExitCode}\n`);
          break;
        }

        // Check task testCommand policy compliance using structured parser
        if (task.testCommand && !this.cancelled && !this.timedOut) {
          const parsedCmd = parseAndValidateCommand(task.testCommand);
          if (!parsedCmd.valid || !parsedCmd.executable) {
            onLog(`[Policy Alert] Suggested testCommand "${task.testCommand}" was blocked by safety policy: ${parsedCmd.error}\n`);
          } else {
            onLog(`[Running Verification] Executing test command: ${parsedCmd.executable} ${(parsedCmd.args || []).join(' ')}\n`);

            const testResult = await this.spawnSafeSubprocess(
              parsedCmd.executable,
              parsedCmd.args || [],
              targetDir,
              (chunk) => {
                stdoutAccumulator += chunk;
                onLog(chunk);
                logStream.write(chunk);
              }
            );

            if (!testResult.success) {
              finalExitCode = this.timedOut ? 124 : (this.cancelled ? 130 : testResult.exitCode);
              onLog(`[Verification Failed] Test command failed with exit code ${finalExitCode}\n`);
              overallSuccess = false;
              break;
            } else {
              onLog(`✔ Verification command passed!\n`);
            }
          }
        }
      }
    } finally {
      clearTimeout(watchdogTimer);
      logStream.end();
    }

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
      success: overallSuccess && !this.cancelled && !this.timedOut,
      exitCode: this.timedOut ? 124 : (this.cancelled && finalExitCode === 0 ? 130 : finalExitCode),
      stdoutTail: stdoutAccumulator.slice(-1500),
      stderrTail: stderrAccumulator.slice(-1500),
      changedFiles,
      diffStat,
      durationMs,
      fullLogPath: logFilePath,
      cancelled: this.cancelled && !this.timedOut,
      timedOut: this.timedOut,
      blockedReason: this.timedOut
        ? 'EXECUTION_TIMEOUT'
        : (this.cancelled ? 'USER_CANCELLED' : undefined),
    };
  }

  /**
   * Spawns the CLI task using robust argument escaping and Windows cmd wrapper handling.
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
        // On Windows, cmd.exe /d /s /c strips the outermost quotes.
        // We format each argument and wrap the complete command line in outer quotes
        // with windowsVerbatimArguments: true so libuv passes it directly to cmd.exe.
        const formattedArgs = args.map(quoteCmdArg);
        const fullCmdLine = `""${cliInfo.executablePath}" ${formattedArgs.join(' ')}"`;

        child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', fullCmdLine], {
          cwd,
          shell: false,
          windowsVerbatimArguments: true,
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
   * Executes a verified safe verification command (e.g. npm test) with structured tokens.
   */
  private spawnSafeSubprocess(
    executable: string,
    args: string[],
    cwd: string,
    onOutput: (data: string) => void
  ): Promise<{ success: boolean; exitCode: number }> {
    return new Promise((resolve) => {
      const isWin = process.platform === 'win32';
      let runner = executable;
      if (isWin && (executable === 'npm' || executable === 'npx' || executable === 'pnpm' || executable === 'yarn')) {
        runner = `${executable}.cmd`;
      }

      let child: ChildProcess;
      if (isWin && runner.endsWith('.cmd')) {
        const formattedArgs = args.map(quoteCmdArg);
        const fullCmdLine = `""${runner}" ${formattedArgs.join(' ')}"`;
        child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', fullCmdLine], {
          cwd,
          shell: false,
          windowsVerbatimArguments: true,
          windowsHide: true,
        });
      } else {
        child = spawn(runner, args, {
          cwd,
          shell: false,
        });
      }

      this.activeChild = child;

      child.stdout?.on('data', (d) => onOutput(d.toString()));
      child.stderr?.on('data', (d) => onOutput(d.toString()));

      child.on('close', (code) => {
        this.activeChild = null;
        resolve({ success: code === 0, exitCode: code ?? 0 });
      });

      child.on('error', () => {
        this.activeChild = null;
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
