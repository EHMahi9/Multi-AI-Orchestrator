import { parseAndValidateReview } from '../../shared/review-schema';
import { ConsensusEngine } from './consensus-engine';
import type { ProviderSessionManager } from '../providers/manager';
import type {
  CollectedEvidence,
  DecisionPacket,
  ProviderId,
  ReviewConsensus,
  StructuredReview,
} from '../../shared/types';

export interface ReviewPromptParams {
  role: string;
  packet: DecisionPacket;
  evidence: CollectedEvidence;
}

/**
 * Builds a structured, role-specific prompt for an AI reviewer containing sanitized execution evidence.
 */
export function buildReviewPrompt(params: ReviewPromptParams): string {
  const { role, packet, evidence } = params;

  return `You are an AI Peer Reviewer acting as "${role}".
Review the actual execution evidence collected from local autonomous code execution.

Task Title: ${packet.title}
Summary: ${packet.summary}
Agreed Decisions:
${packet.decisions.map((d) => `- ${d}`).join('\n')}

Target Files:
${packet.tasks.flatMap((t) => t.files).join(', ')}

======================================================================
COLLECTED EXECUTION EVIDENCE:
- Exit Code: ${evidence.exitCode}
- Success Status: ${evidence.success}
- Timed Out: ${evidence.timedOut}
- Cancelled: ${evidence.cancelled}
- Duration: ${(evidence.durationMs / 1000).toFixed(1)}s
- Test Command: ${evidence.testCommand || 'None'}
- Test Output: ${evidence.testOutput || 'No output'}
- Changed Files (${evidence.changedFiles.length}): ${evidence.changedFiles.join(', ') || 'None'}
- Git Diff Stat:
${evidence.diffStat || 'No diff captured.'}
- Standard Output Tail:
${evidence.stdoutTail || 'Empty'}
- Standard Error Tail:
${evidence.stderrTail || 'Empty'}
======================================================================

You MUST evaluate the evidence and respond with a JSON object in a \`\`\`json codeblock adhering strictly to this schema:
\`\`\`json
{
  "schemaVersion": "1.0",
  "verdict": "PASS" | "REVISION_REQUIRED" | "BLOCKED",
  "summary": "Short 1-2 sentence evaluation summary",
  "findings": [
    {
      "id": "FINDING-1",
      "severity": "critical" | "high" | "medium" | "low" | "info",
      "description": "Specific defect or observation",
      "evidenceReferences": ["Exit Code", "Diff Stat", etc.],
      "reproducible": true,
      "recommendedAction": "Concrete fix instruction"
    }
  ],
  "evidenceReferences": ["Exit Code 0", "All tests passing"],
  "requiredCorrections": ["Any fixes needed before approval"],
  "riskLevel": "low" | "medium" | "high" | "critical",
  "confidence": 0.95,
  "missingEvidence": []
}
\`\`\`
Rules:
1. If tests failed (exit code != 0 or assertion errors), verdict MUST be REVISION_REQUIRED.
2. If critical security or baseline violations exist, verdict MUST be BLOCKED.
3. If all checks succeeded with verified evidence, verdict is PASS.
4. Respond ONLY with the \`\`\`json block.`;
}

export class ReviewOrchestrator {
  private consensusEngine = new ConsensusEngine();

  /**
   * Conducts an evidence-driven review across available AI provider sessions.
   */
  public async reviewExecution(params: {
    packet: DecisionPacket;
    evidence: CollectedEvidence;
    selectedProviders: Record<ProviderId, boolean>;
    providerManager?: ProviderSessionManager;
    mockReviews?: StructuredReview[]; // For deterministic unit testing
    onLog: (chunk: string) => void;
  }): Promise<ReviewConsensus> {
    const { packet, evidence, selectedProviders, providerManager, mockReviews, onLog } = params;

    // If mock reviews are provided (e.g. in automated tests), evaluate them directly
    if (mockReviews && mockReviews.length > 0) {
      onLog(`[Review Orchestrator] Evaluating ${mockReviews.length} provided reviewer verdicts...\n`);
      return this.consensusEngine.evaluate(mockReviews, evidence);
    }

    const reviews: StructuredReview[] = [];
    const failedProviders: ProviderId[] = [];

    const ROLES: Record<ProviderId, string> = {
      chatgpt: 'Architect (Requirements & Completeness Reviewer)',
      gemini: 'Feasibility (Test Evidence & Execution Reviewer)',
      deepseek: 'Implementation Planner (Code Change & Regression Reviewer)',
      claude: 'Auditor (Independent Safety & Quality Reviewer)',
    };

    const activeProviders = (Object.keys(selectedProviders) as ProviderId[]).filter(
      (id) => selectedProviders[id]
    );

    onLog(`[Review Orchestrator] Initiating multi-AI evidence review across ${activeProviders.length} models...\n`);

    for (const providerId of activeProviders) {
      const role = ROLES[providerId] || 'Reviewer';

      if (!providerManager) {
        onLog(`[Review ${providerId}] Provider manager not supplied. Marking unverified.\n`);
        failedProviders.push(providerId);
        continue;
      }

      const sessionState = providerManager.getStatus(providerId);
      if (sessionState.status !== 'ready') {
        onLog(`[Review ${providerId}] Session not ready (status: ${sessionState.status}). Skipping.\n`);
        failedProviders.push(providerId);
        continue;
      }

      onLog(`[Review ${providerId}] Requesting evaluation from ${role}...\n`);
      const prompt = buildReviewPrompt({ role, packet, evidence });

      try {
        const response = await providerManager.sendPrompt(providerId, prompt);
        if (!response.ok || !response.response) {
          onLog(`[Review Error] ${providerId} failed: ${response.error || 'Empty reply'}\n`);
          failedProviders.push(providerId);
          continue;
        }

        const validation = parseAndValidateReview(response.response, providerId, role);
        if (!validation.valid || !validation.review) {
          onLog(`[Review Schema Error] ${providerId} returned invalid JSON: ${validation.errors.join(', ')}\n`);
          failedProviders.push(providerId);
          continue;
        }

        onLog(`✔ [Review ${providerId}] Verdict: ${validation.review.verdict} (${validation.review.findings.length} findings)\n`);
        reviews.push(validation.review);
      } catch (err: any) {
        onLog(`[Review Exception] Failed to query ${providerId}: ${err.message}\n`);
        failedProviders.push(providerId);
      }
    }

    onLog(`[Consensus Engine] Synthesizing consensus from ${reviews.length} completed reviews...\n`);
    const consensus = this.consensusEngine.evaluate(reviews, evidence, {
      minQuorum: activeProviders.length === 1 ? 1 : 2,
    });
    consensus.failedProviders = failedProviders;

    onLog(`======================================================================\n`);
    onLog(`[Review Consensus] Verdict: ${consensus.verdict}\n`);
    onLog(`Summary: ${consensus.summary}\n`);
    onLog(`Rationale: ${consensus.rationale}\n`);
    onLog(`Findings (${consensus.findings.length}): ${consensus.findings.map((f) => `[${f.severity}] ${f.description}`).join('; ') || 'None'}\n`);
    onLog(`======================================================================\n\n`);

    return consensus;
  }
}
