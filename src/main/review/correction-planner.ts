import { parseAndValidateCommand } from '../execution/policy';
import type {
  CollectedEvidence,
  CorrectionProposal,
  DecisionPacket,
  DecisionTask,
  ReviewConsensus,
} from '../../shared/types';

export class CorrectionPlanner {
  /**
   * Plans a bounded, scoped correction proposal strictly linked to findings.
   * Does NOT auto-approve. Requires user confirmation before execution.
   */
  public planCorrection(params: {
    iteration: number;
    originalPacket: DecisionPacket;
    consensus: ReviewConsensus;
    evidence: CollectedEvidence;
  }): CorrectionProposal {
    const { iteration, originalPacket, consensus, evidence } = params;

    // Collect all original authorized files
    const authorizedFiles = new Set<string>(originalPacket.tasks.flatMap((t) => t.files));

    // Linked finding IDs
    const linkedFindingIds = consensus.findings.map((f) => f.id);

    // Formulate targeted task description addressing findings
    const findingSummaries = consensus.findings
      .map((f) => `[${f.id}] (${f.severity}) ${f.description} -> Action: ${f.recommendedAction}`)
      .join('\n');

    const primaryTestCommand = originalPacket.tasks.find((t) => t.testCommand)?.testCommand;

    // Validate test command policy
    let safeTestCommand = primaryTestCommand;
    if (safeTestCommand) {
      const policyCheck = parseAndValidateCommand(safeTestCommand);
      if (!policyCheck.valid) {
        safeTestCommand = undefined;
      }
    }

    const correctionTasks: DecisionTask[] = [
      {
        id: `correction-task-${iteration}`,
        title: `Remediate defects identified in Review Iteration ${iteration}`,
        files: Array.from(authorizedFiles), // strictly bounded to original authorized files
        description: `Apply targeted code modifications to resolve review findings:\n${findingSummaries}\n\nExecution Failure Diagnostic:\n${evidence.stderrTail || evidence.stdoutTail || 'None'}\n\nEnsure all regression checks pass.`,
        testCommand: safeTestCommand,
      },
    ];

    const proposedPacket: DecisionPacket = {
      version: '1.0',
      title: `[Correction ${iteration}] ${originalPacket.title}`,
      summary: `Automated correction proposal for iteration ${iteration}. Targets: ${consensus.requiredCorrections.join(', ') || 'Resolver defects'}.`,
      decisions: [
        ...originalPacket.decisions,
        `Correction Iteration ${iteration}: Resolve ${consensus.findings.length} findings without expanding workspace scope.`,
      ],
      tasks: correctionTasks,
      criteria: [
        ...originalPacket.criteria,
        `Resolve review finding IDs: ${linkedFindingIds.join(', ') || 'None'}`,
      ],
      unresolvedRisks: consensus.findings
        .filter((f) => f.severity === 'medium' || f.severity === 'low')
        .map((f) => `Unresolved finding ${f.id}: ${f.description}`),
      consensusTimestamp: new Date().toISOString(),
      approvedByUser: false, // Explicitly unapproved!
      approvalSignature: undefined,
      approvedWorkspace: originalPacket.approvedWorkspace,
    };

    return {
      iteration,
      linkedFindingIds,
      explanation: `Identified ${consensus.findings.length} defects requiring correction (Iteration ${iteration}/3). Scope is strictly constrained to original task files (${Array.from(authorizedFiles).join(', ')}).`,
      expectedVerification: safeTestCommand
        ? `Execute "${safeTestCommand}" and verify 0 failures and exit code 0.`
        : 'Verify files exist and compile without errors.',
      originalPacketFingerprint: originalPacket.approvalSignature || 'UNSIGNED',
      proposedPacket,
      requiresUserApproval: true,
      approved: false,
    };
  }
}
