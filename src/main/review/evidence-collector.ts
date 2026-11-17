import fs from 'fs';
import path from 'path';
import type { CliInfo } from '../execution/cli-resolver';
import type { CollectedEvidence, DecisionPacket, ExecutionEvidence } from '../../shared/types';

export interface EvidenceCollectorParams {
  runId: string;
  iteration: number;
  packet: DecisionPacket;
  cliInfo: CliInfo;
  evidence: ExecutionEvidence;
  workspace: string;
  startTime: number;
  endTime: number;
  preGitStatus?: string[];
  postGitStatus?: string[];
}

/**
 * Sanitizes stdout/stderr to prevent secrets, tokens, or credential leaks from being sent to AI providers.
 */
export function sanitizeLogOutput(text: string): string {
  if (!text) return '';
  return text
    .replace(/(?:api[_-]?key|token|secret|password|bearer)\s*[:=]\s*['"]?[a-zA-Z0-9_\-\.]{8,}['"]?/gi, '[REDACTED_SECRET]')
    .replace(/Bearer\s+[a-zA-Z0-9_\-\.]{16,}/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/ghp_[a-zA-Z0-9]{36}/g, '[REDACTED_GH_TOKEN]');
}

/**
 * Analyzes command outputs to determine whether the verification test actually succeeded,
 * rather than relying solely on process exit code.
 */
export function evaluateTestOutput(
  stdout: string,
  stderr: string,
  exitCode: number
): { testPassed?: boolean; testOutputSummary: string } {
  const combined = `${stdout}\n${stderr}`;

  if (exitCode !== 0) {
    // If exit code is non-zero, test unequivocally failed
    return { testPassed: false, testOutputSummary: `Process exited with failure code ${exitCode}.` };
  }

  // Look for TAP / node:test style indicators across Node versions (Node 20/22 use #, Node 24 uses ℹ)
  const failMatch = combined.match(/(?:ℹ|#)\s*fail\s+(\d+)/i) || combined.match(/(\d+)\s+failing/i);
  const passMatch = combined.match(/(?:ℹ|#)\s*pass\s+(\d+)/i) || combined.match(/(\d+)\s+passing/i);
  const passCount = passMatch ? parseInt(passMatch[1], 10) : 0;
  const failCount = failMatch ? parseInt(failMatch[1], 10) : 0;

  if (failMatch && failCount > 0) {
    return { testPassed: false, testOutputSummary: `Test runner reported ${failCount} failing tests.` };
  }

  if (passMatch && failCount === 0) {
    return { testPassed: true, testOutputSummary: `Test runner reported ${passCount} passing tests (0 failures).` };
  }

  // Look for Jest / Vitest / Mocha indicators
  if (/Tests:\s+\d+\s+passed/i.test(combined) && !/failed/i.test(combined)) {
    return { testPassed: true, testOutputSummary: 'Test suite passed cleanly.' };
  }

  if (/AssertionError/i.test(combined) || /FAIL\s+[^0\s]/i.test(combined)) {
    return { testPassed: false, testOutputSummary: 'Test output contains assertion errors or failures.' };
  }

  if (/Verification command passed/i.test(combined)) {
    return { testPassed: true, testOutputSummary: 'Verification command completed with exit code 0.' };
  }

  // Ambiguous test output with exit code 0
  return { testPassed: true, testOutputSummary: 'Verification command completed with exit code 0 (no failures detected).' };
}

export class EvidenceCollector {
  public collect(params: EvidenceCollectorParams): CollectedEvidence {
    const {
      runId,
      iteration,
      packet,
      cliInfo,
      evidence,
      startTime,
      endTime,
      preGitStatus = [],
      postGitStatus = [],
    } = params;

    const missingEvidence: string[] = [];

    // Verify log existence
    if (evidence.fullLogPath && !fs.existsSync(evidence.fullLogPath)) {
      missingEvidence.push('MISSING_EXECUTION_LOG_FILE');
    }

    if (!evidence.stdoutTail && !evidence.stderrTail && evidence.exitCode !== 0) {
      missingEvidence.push('MISSING_STDERR_DIAGNOSTICS');
    }

    // Sanitize stdout / stderr tails
    const sanitizedStdout = sanitizeLogOutput(evidence.stdoutTail);
    const sanitizedStderr = sanitizeLogOutput(evidence.stderrTail);

    // Evaluate test output
    const primaryTestCommand = packet.tasks.find((t) => t.testCommand)?.testCommand;
    const testEval = primaryTestCommand
      ? evaluateTestOutput(sanitizedStdout, sanitizedStderr, evidence.exitCode)
      : { testPassed: evidence.exitCode === 0, testOutputSummary: 'No testCommand specified.' };

    return {
      runId,
      iteration,
      packetFingerprint: packet.approvalSignature || 'UNSIGNED',
      cliInfo: {
        name: cliInfo.name,
        version: cliInfo.version,
        executablePath: cliInfo.executablePath,
      },
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      durationMs: endTime - startTime,
      exitCode: evidence.exitCode,
      success: evidence.success && (testEval.testPassed ?? true),
      timedOut: Boolean(evidence.timedOut),
      cancelled: Boolean(evidence.cancelled),
      stdoutTail: sanitizedStdout,
      stderrTail: sanitizedStderr,
      preGitStatus,
      postGitStatus,
      changedFiles: evidence.changedFiles || [],
      diffStat: evidence.diffStat || '',
      testCommand: primaryTestCommand,
      testOutput: testEval.testOutputSummary,
      testPassed: testEval.testPassed,
      fullLogPath: evidence.fullLogPath,
      missingEvidence,
    };
  }
}
