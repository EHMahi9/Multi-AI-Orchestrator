import type {
  CollectedEvidence,
  FindingSeverity,
  ProviderId,
  ReviewConsensus,
  ReviewFinding,
  ReviewVerdictType,
  StructuredReview,
} from '../../shared/types';

export interface ConsensusOptions {
  minQuorum?: number; // Minimum number of successful reviews required (default: 2)
}

export class ConsensusEngine {
  /**
   * Deterministically evaluates individual provider reviews against collected evidence
   * to produce an explainable consensus verdict.
   */
  public evaluate(
    reviews: StructuredReview[],
    evidence: CollectedEvidence,
    options: ConsensusOptions = {}
  ): ReviewConsensus {
    const timestamp = new Date().toISOString();
    const participatingProviders = reviews.map((r) => r.providerId);
    const minQuorum = options.minQuorum ?? (reviews.length === 1 ? 1 : 2);
    const quorumReached = reviews.length >= minQuorum;

    // Deduplicate and aggregate findings from all reviewers
    const aggregatedFindings: ReviewFinding[] = [];
    const seenFindingDescs = new Set<string>();

    for (const review of reviews) {
      for (const f of review.findings) {
        const key = f.description.toLowerCase().trim();
        if (!seenFindingDescs.has(key)) {
          seenFindingDescs.add(key);
          aggregatedFindings.push(f);
        }
      }
    }

    // Determine overall maximum risk level
    const riskOrder: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
    let maxRisk: 'low' | 'medium' | 'high' | 'critical' = 'low';
    for (const r of reviews) {
      if (riskOrder[r.riskLevel] > riskOrder[maxRisk]) {
        maxRisk = r.riskLevel;
      }
    }
    for (const f of aggregatedFindings) {
      if (riskOrder[f.severity] > riskOrder[maxRisk]) {
        maxRisk = f.severity as any;
      }
    }

    const requiredCorrections = Array.from(
      new Set(reviews.flatMap((r) => r.requiredCorrections || []))
    );

    // Rule 1: Insufficient Quorum yields BLOCKED
    if (!quorumReached) {
      return {
        verdict: 'BLOCKED',
        summary: `Quorum not reached: received ${reviews.length} valid reviews, but minimum ${minQuorum} required.`,
        quorumReached: false,
        participatingProviders,
        failedProviders: [],
        individualReviews: reviews,
        findings: aggregatedFindings,
        requiredCorrections,
        riskLevel: maxRisk,
        rationale: `Execution blocked due to insufficient reviewer participation (${reviews.length}/${minQuorum}).`,
        timestamp,
      };
    }

    // Rule 2: Critical security or baseline violation automatically BLOCKS continuation
    const criticalFindings = aggregatedFindings.filter((f) => f.severity === 'critical');
    if (criticalFindings.length > 0) {
      const descriptions = criticalFindings.map((f) => f.description).join('; ');
      return {
        verdict: 'BLOCKED',
        summary: `Critical security findings detected (${criticalFindings.length}). Automatic execution blocked.`,
        quorumReached: true,
        participatingProviders,
        failedProviders: [],
        individualReviews: reviews,
        findings: aggregatedFindings,
        requiredCorrections,
        riskLevel: 'critical',
        rationale: `Continuation blocked due to critical security findings: ${descriptions}`,
        timestamp,
      };
    }

    // Rule 3: Execution timeouts or missing crucial evidence cannot yield PASS
    if (evidence.timedOut) {
      return {
        verdict: 'REVISION_REQUIRED',
        summary: 'Execution timed out. Corrective action required to optimize or fix long-running operations.',
        quorumReached: true,
        participatingProviders,
        failedProviders: [],
        individualReviews: reviews,
        findings: aggregatedFindings,
        requiredCorrections: [...requiredCorrections, 'Resolve task execution timeout.'],
        riskLevel: 'high',
        rationale: 'Task timed out before completion; revision required.',
        timestamp,
      };
    }

    if (evidence.missingEvidence && evidence.missingEvidence.length > 0) {
      return {
        verdict: 'BLOCKED',
        summary: `Crucial execution evidence missing: ${evidence.missingEvidence.join(', ')}.`,
        quorumReached: true,
        participatingProviders,
        failedProviders: [],
        individualReviews: reviews,
        findings: aggregatedFindings,
        requiredCorrections,
        riskLevel: 'high',
        rationale: `Cannot verify outcome because expected execution artifacts are missing (${evidence.missingEvidence.join(', ')}).`,
        timestamp,
      };
    }

    // Rule 4: If verification tests failed, verdict cannot be PASS
    if (evidence.testPassed === false || evidence.exitCode !== 0) {
      return {
        verdict: 'REVISION_REQUIRED',
        summary: `Verification test failed (exit code ${evidence.exitCode}): ${evidence.testOutput || 'Errors reported'}.`,
        quorumReached: true,
        participatingProviders,
        failedProviders: [],
        individualReviews: reviews,
        findings: aggregatedFindings,
        requiredCorrections: requiredCorrections.length > 0 ? requiredCorrections : ['Fix failing verification test assertions.'],
        riskLevel: maxRisk === 'low' ? 'medium' : maxRisk,
        rationale: `Execution failed verification checks (${evidence.testOutput || `exit code ${evidence.exitCode}`}). Self-correction needed.`,
        timestamp,
      };
    }

    // Rule 5: If any reviewer voted BLOCKED, consensus is BLOCKED
    if (reviews.some((r) => r.verdict === 'BLOCKED')) {
      const blockedReasons = reviews
        .filter((r) => r.verdict === 'BLOCKED')
        .map((r) => `${r.providerId}: ${r.summary}`)
        .join(' | ');

      return {
        verdict: 'BLOCKED',
        summary: 'One or more reviewers flagged blocking defects.',
        quorumReached: true,
        participatingProviders,
        failedProviders: [],
        individualReviews: reviews,
        findings: aggregatedFindings,
        requiredCorrections,
        riskLevel: maxRisk,
        rationale: `Reviewers blocked continuation: ${blockedReasons}`,
        timestamp,
      };
    }

    // Rule 6: If any reviewer voted REVISION_REQUIRED or high-severity findings exist
    const hasHighSeverity = aggregatedFindings.some((f) => f.severity === 'high');
    if (reviews.some((r) => r.verdict === 'REVISION_REQUIRED') || hasHighSeverity) {
      const isSingle = reviews.length === 1;
      return {
        verdict: 'REVISION_REQUIRED',
        summary: isSingle
          ? `Single-provider review (${reviews[0].providerId}) identified defects requiring correction (${aggregatedFindings.length} findings).`
          : `Multi-provider review identified defects requiring correction (${aggregatedFindings.length} findings).`,
        quorumReached: true,
        participatingProviders,
        failedProviders: [],
        individualReviews: reviews,
        findings: aggregatedFindings,
        requiredCorrections: requiredCorrections.length > 0 ? requiredCorrections : ['Address reviewer defects and re-verify.'],
        riskLevel: maxRisk,
        rationale: isSingle
          ? `Single-provider review (${reviews[0].providerId}) flagged defects that require bounded self-correction.`
          : 'Multi-provider review identified defects that require bounded self-correction.',
        timestamp,
      };
    }

    // Rule 7: All reviewers voted PASS and evidence is positive
    const isSingle = reviews.length === 1;
    return {
      verdict: 'PASS',
      summary: isSingle
        ? `Single-provider review (${reviews[0].providerId}): verified execution success and passing test evidence.`
        : `Multi-provider consensus (${reviews.length} models): verified execution success and passing test evidence.`,
      quorumReached: true,
      participatingProviders,
      failedProviders: [],
      individualReviews: reviews,
      findings: aggregatedFindings,
      requiredCorrections: [],
      riskLevel: 'low',
      rationale: isSingle
        ? `Single-provider review (${reviews[0].providerId}): all criteria met with passing test evidence. Note: Not a multi-model consensus.`
        : `Multi-provider consensus: all acceptance criteria met across ${reviews.length} models with passing test evidence.`,
      timestamp,
    };
  }
}
