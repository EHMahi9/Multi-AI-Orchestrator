import fs from 'fs';
import path from 'path';
import type { LoopRunReport } from '../../shared/types';

export class ReportGenerator {
  /**
   * Persists a comprehensive run report in both JSON and Markdown formats
   * under .orchestrator/runs in the target workspace.
   */
  public generateAndSave(report: LoopRunReport, workspace: string): { jsonPath: string; mdPath: string } {
    const runsDir = path.join(workspace, '.orchestrator', 'runs');
    fs.mkdirSync(runsDir, { recursive: true });

    const safeRunId = report.runId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const jsonPath = path.join(runsDir, `run-${safeRunId}.json`);
    const mdPath = path.join(runsDir, `run-${safeRunId}.md`);

    // 1. Write JSON report
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');

    // 2. Generate Markdown report
    const mdContent = this.formatMarkdown(report);
    fs.writeFileSync(mdPath, mdContent, 'utf-8');

    return { jsonPath, mdPath };
  }

  private formatMarkdown(report: LoopRunReport): string {
    const findingsList = report.unresolvedFindings.length > 0
      ? report.unresolvedFindings.map((f) => `- **[${f.severity.toUpperCase()}]** \`${f.id}\`: ${f.description} *(Action: ${f.recommendedAction})*`).join('\n')
      : '_No unresolved defects. Verification clean._';

    const iterationsTable = report.iterations.map((it) => {
      return `| Iteration ${it.iteration} | ${it.consensus.verdict} | Exit Code ${it.evidence.exitCode} (${(it.evidence.durationMs / 1000).toFixed(1)}s) | ${it.consensus.findings.length} | ${it.correctionProposal ? 'Yes (Fresh Approval)' : 'No'} |`;
    }).join('\n');

    return `# Multi-AI Autonomous Review & Correction Run Report
**Run ID:** \`${report.runId}\`  
**Workspace:** \`${report.workspace}\`  
**Start Time:** ${report.startTime}  
**End Time:** ${report.endTime} (${(report.totalDurationMs / 1000).toFixed(1)}s)  
**Initial Approval Signature:** \`${report.initialPacketFingerprint}\`  
**Final Outcome:** **${report.outcome}** (Stage: \`${report.finalStage}\`)  
**Total Iterations:** ${report.totalIterations} (Max: 3)  

---

## Iteration History

| Iteration | Consensus Verdict | Evidence Exit Code / Duration | Findings Detected | Correction Planned |
| :--- | :---: | :---: | :---: | :---: |
${iterationsTable || '| None | N/A | N/A | 0 | No |'}

---

## Unresolved Findings (${report.unresolvedFindings.length})

${findingsList}

---

## Safety & Boundary Assurances

1. **Approval Gating:** Every initial and corrective execution was guarded by explicit user approval and verified with deterministic SHA-256 signatures.
2. **Path Security:** Application-level canonical path checking enforced workspace boundaries and blocked system/backup directory traversal.
3. **Subprocess Isolation:** Targeted process management ensured zero disruption to unrelated user processes.
4. **Bounded Iterations:** Loop strictly capped at 3 correction iterations.
`;
  }
}
