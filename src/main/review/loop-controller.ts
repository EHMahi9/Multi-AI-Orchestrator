import { computeDecisionPacketHash } from '../../shared/schema';
import { validateAndCanonicalizeWorkspace } from '../execution/policy';
import { CliResolver, CliInfo } from '../execution/cli-resolver';
import { ExecutionService } from '../execution/engine';
import { EvidenceCollector } from './evidence-collector';
import { ReviewOrchestrator } from './orchestrator';
import { CorrectionPlanner } from './correction-planner';
import { ReportGenerator } from './report-generator';
import type { ProviderSessionManager } from '../providers/manager';
import type {
  CollectedEvidence,
  CorrectionProposal,
  DecisionPacket,
  ExecutionEvidence,
  IterationRecord,
  LoopRunReport,
  PipelineStage,
  ProviderId,
  ReviewConsensus,
  StructuredReview,
} from '../../shared/types';

export interface LoopControllerOptions {
  workspace: string;
  selectedProviders: Record<ProviderId, boolean>;
  providerManager?: ProviderSessionManager;
  cliResolver?: CliResolver;
  maxCorrectionIterations?: number; // Default: 3
  mockReviews?: StructuredReview[]; // For unit/integration tests
  onLog: (chunk: string) => void;
  onStageChange: (stage: PipelineStage) => void;
  onStateUpdate?: (data: {
    iteration: number;
    evidence: CollectedEvidence | null;
    consensus: ReviewConsensus | null;
    proposal: CorrectionProposal | null;
  }) => void;
}

export class LoopController {
  private executionService = new ExecutionService();
  private evidenceCollector = new EvidenceCollector();
  private reviewOrchestrator = new ReviewOrchestrator();
  private correctionPlanner = new CorrectionPlanner();
  private reportGenerator = new ReportGenerator();

  private isRunning = false;
  private isCancelled = false;
  private currentStage: PipelineStage = 'idle';
  private runId: string = '';
  private currentIteration = 0;
  private maxIterations = 3;

  private currentPacket: DecisionPacket | null = null;
  private activeProposal: CorrectionProposal | null = null;
  private iterationHistory: IterationRecord[] = [];
  private runStartTime = 0;
  private activeOptions: LoopControllerOptions | null = null;

  public getStage(): PipelineStage {
    return this.currentStage;
  }

  public getIteration(): number {
    return this.currentIteration;
  }

  public getActiveProposal(): CorrectionProposal | null {
    return this.activeProposal;
  }

  public getHistory(): IterationRecord[] {
    return [...this.iterationHistory];
  }

  /**
   * Gracefully cancels the active loop execution.
   */
  public cancel(): void {
    this.isCancelled = true;
    this.executionService.cancel();
    this.transitionStage('cancelled');
    if (this.activeOptions) {
      this.activeOptions.onLog(`\n[Autonomous Loop] Cancelled by user request.\n`);
      this.finalizeReport('CANCELLED');
    }
  }

  /**
   * Starts the autonomous closed-loop execution & review engine.
   */
  public async startLoop(
    packet: DecisionPacket,
    options: LoopControllerOptions
  ): Promise<{ ok: boolean; stage: PipelineStage; error?: string; report?: LoopRunReport }> {
    if (this.isRunning) {
      return { ok: false, stage: this.currentStage, error: 'A loop run is already active.' };
    }

    this.isRunning = true;
    this.isCancelled = false;
    this.activeOptions = options;
    this.runStartTime = Date.now();
    this.runId = `run-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    this.currentIteration = 0;
    this.maxIterations = options.maxCorrectionIterations ?? 3;
    this.iterationHistory = [];
    this.currentPacket = packet;
    this.activeProposal = null;

    options.onLog(`======================================================================\n`);
    options.onLog(`[Autonomous Closed-Loop Engine] Starting Run ID: ${this.runId}\n`);
    options.onLog(`Target Workspace: ${options.workspace}\n`);
    options.onLog(`Max Allowed Self-Correction Iterations: ${this.maxIterations}\n`);
    options.onLog(`======================================================================\n\n`);

    // Verify initial approval gate
    if (!packet.approvedByUser) {
      this.transitionStage('awaiting_initial_approval');
      this.isRunning = false;
      const err = 'Execution rejected: Initial Decision Packet has not received explicit user approval.';
      options.onLog(`[Approval Gate] ${err}\n`);
      return { ok: false, stage: 'awaiting_initial_approval', error: err };
    }

    if (!packet.approvalSignature) {
      this.transitionStage('blocked');
      this.isRunning = false;
      const err = 'Execution rejected: Initial Decision Packet lacks cryptographic approval signature.';
      options.onLog(`[Security Gate] ${err}\n`);
      return { ok: false, stage: 'blocked', error: err };
    }

    // Begin execution cycle
    return await this.runIterationCycle();
  }

  /**
   * Executes a single iteration cycle: Execution -> Evidence -> Review -> Consensus.
   */
  private async runIterationCycle(): Promise<{ ok: boolean; stage: PipelineStage; error?: string; report?: LoopRunReport }> {
    const options = this.activeOptions!;
    if (this.isCancelled) {
      return { ok: false, stage: 'cancelled', error: 'Operation cancelled.' };
    }

    const iter = this.currentIteration;
    const packet = this.currentPacket!;

    options.onLog(`\n>>> [Iteration ${iter}/${this.maxIterations}] Starting execution for: ${packet.title} <<<\n`);
    this.transitionStage('executing');

    const iterStartTime = Date.now();

    // 1. Resolve CLI tool
    const resolver = options.cliResolver || new CliResolver();
    const cliInfo: CliInfo = await resolver.resolve();
    if (!cliInfo.available) {
      this.transitionStage('blocked');
      this.isRunning = false;
      const err = `Execution blocked: ${cliInfo.error || 'Agent CLI binary unavailable.'}`;
      options.onLog(`[CLI Error] ${err}\n`);
      const report = this.finalizeReport('BLOCKED');
      return { ok: false, stage: 'blocked', error: err, report };
    }

    // 2. Execute approved task
    const executionEvidence = await this.executionService.execute({
      decisionPacket: packet,
      workspace: options.workspace,
      cliResolver: resolver,
      onLog: options.onLog,
      onTaskStart: (t, idx, total) => {
        options.onLog(`[Task ${idx}/${total}] Beginning: ${t.title}\n`);
      },
    });

    if (this.isCancelled) {
      this.isRunning = false;
      const report = this.finalizeReport('CANCELLED');
      return { ok: false, stage: 'cancelled', report };
    }

    const iterEndTime = Date.now();

    // 3. Evidence Collection
    this.transitionStage('collecting_evidence');
    options.onLog(`[Evidence Collection] Packaging execution facts, diffs, and test outcomes...\n`);

    const collectedEvidence = this.evidenceCollector.collect({
      runId: this.runId,
      iteration: iter,
      packet,
      cliInfo,
      evidence: executionEvidence,
      workspace: options.workspace,
      startTime: iterStartTime,
      endTime: iterEndTime,
      preGitStatus: [],
      postGitStatus: executionEvidence.changedFiles,
    });

    options.onStateUpdate?.({
      iteration: iter,
      evidence: collectedEvidence,
      consensus: null,
      proposal: null,
    });

    // 4. Multi-AI Review & Consensus
    this.transitionStage('reviewing');
    const consensus = await this.reviewOrchestrator.reviewExecution({
      packet,
      evidence: collectedEvidence,
      selectedProviders: options.selectedProviders,
      providerManager: options.providerManager,
      mockReviews: options.mockReviews,
      onLog: options.onLog,
    });

    options.onStateUpdate?.({
      iteration: iter,
      evidence: collectedEvidence,
      consensus,
      proposal: null,
    });

    // Record iteration
    const record: IterationRecord = {
      iteration: iter,
      evidence: collectedEvidence,
      consensus,
      durationMs: iterEndTime - iterStartTime,
    };
    this.iterationHistory.push(record);

    // 5. Evaluate Consensus Verdict
    if (consensus.verdict === 'PASS') {
      this.transitionStage('completed');
      this.isRunning = false;
      options.onLog(`\n🎉 [Loop Complete] Consensus verified all criteria! Execution succeeded.\n`);
      const report = this.finalizeReport('PASS');
      return { ok: true, stage: 'completed', report };
    }

    if (consensus.verdict === 'BLOCKED') {
      this.transitionStage('blocked');
      this.isRunning = false;
      options.onLog(`\n⛔ [Loop Blocked] Consensus blocked continuation: ${consensus.rationale}\n`);
      const report = this.finalizeReport('BLOCKED');
      return { ok: false, stage: 'blocked', error: consensus.rationale, report };
    }

    // Verdict is REVISION_REQUIRED
    if (iter >= this.maxIterations) {
      this.transitionStage('revision_limit_reached');
      this.isRunning = false;
      options.onLog(`\n🛑 [Revision Limit Reached] Reached maximum allowed correction limit (${this.maxIterations}). Stopping loop.\n`);
      const report = this.finalizeReport('REVISION_LIMIT_REACHED');
      return { ok: false, stage: 'revision_limit_reached', error: 'Maximum correction limit reached.', report };
    }

    // 6. Plan Correction & Await User Confirmation
    const nextIteration = iter + 1;
    this.currentIteration = nextIteration;
    options.onLog(`[Correction Planner] Formulating bounded correction proposal for iteration ${nextIteration}...\n`);

    const proposal = this.correctionPlanner.planCorrection({
      iteration: nextIteration,
      originalPacket: packet,
      consensus,
      evidence: collectedEvidence,
    });

    this.activeProposal = proposal;
    record.correctionProposal = proposal;

    options.onStateUpdate?.({
      iteration: nextIteration,
      evidence: collectedEvidence,
      consensus,
      proposal,
    });

    this.transitionStage('awaiting_correction_approval');
    options.onLog(`----------------------------------------------------------------------\n`);
    options.onLog(`⚠️ [User Approval Required] Correction Iteration ${nextIteration}/${this.maxIterations} proposed.\n`);
    options.onLog(`Target Files: ${proposal.proposedPacket.tasks.flatMap((t) => t.files).join(', ')}\n`);
    options.onLog(`Explanation: ${proposal.explanation}\n`);
    options.onLog(`Click "Approve & Execute Correction" in Mission Control to proceed.\n`);
    options.onLog(`----------------------------------------------------------------------\n\n`);

    // Pause loop execution awaiting explicit user approval call
    this.isRunning = false;
    return { ok: true, stage: 'awaiting_correction_approval' };
  }

  /**
   * User explicitly approves the proposed correction.
   * Generates a fresh SHA-256 approval signature and resumes the autonomous loop.
   */
  public async approveCorrection(): Promise<{ ok: boolean; stage: PipelineStage; error?: string; report?: LoopRunReport }> {
    if (!this.activeProposal || this.currentStage !== 'awaiting_correction_approval') {
      return { ok: false, stage: this.currentStage, error: 'No correction proposal currently awaiting approval.' };
    }

    const options = this.activeOptions;
    if (!options) {
      return { ok: false, stage: this.currentStage, error: 'Loop context not initialized.' };
    }

    const packet = this.activeProposal.proposedPacket;
    packet.approvedByUser = true;
    packet.approvedWorkspace = options.workspace;
    packet.approvalSignature = computeDecisionPacketHash(packet);

    this.activeProposal.approved = true;
    this.activeProposal.approvalSignature = packet.approvalSignature;
    this.currentPacket = packet;
    this.isRunning = true;

    options.onLog(`✔ [Correction Approved] User authorized Iteration ${this.activeProposal.iteration}.\n`);
    options.onLog(`[Security Fingerprint] SHA-256: ${packet.approvalSignature}\n`);

    this.transitionStage('correction_ready');

    // Resume execution cycle with approved correction packet
    return await this.runIterationCycle();
  }

  /**
   * User rejects the proposed correction, cleanly halting the loop.
   */
  public async rejectCorrection(): Promise<{ ok: boolean; stage: PipelineStage; report?: LoopRunReport }> {
    this.transitionStage('cancelled');
    this.isRunning = false;
    if (this.activeOptions) {
      this.activeOptions.onLog(`✖ [Correction Rejected] User declined correction proposal. Loop halted.\n`);
      const report = this.finalizeReport('CANCELLED');
      return { ok: true, stage: 'cancelled', report };
    }
    return { ok: true, stage: 'cancelled' };
  }

  /**
   * Processes external execution evidence submitted by an external agent (such as Google Antigravity),
   * feeding the changes into the Multi-AI review cycle (ChatGPT, Gemini, DeepSeek, Claude).
   */
  public async processExternalEvidence(
    executionEvidence: ExecutionEvidence,
    startTime?: number
  ): Promise<{ ok: boolean; stage: PipelineStage; error?: string; consensus?: ReviewConsensus; report?: LoopRunReport }> {
    const options = this.activeOptions;
    if (!options || !this.currentPacket) {
      return { ok: false, stage: this.currentStage, error: 'No active loop run configured to receive external evidence.' };
    }

    const iter = this.currentIteration;
    const packet = this.currentPacket;
    const iterStartTime = startTime || Date.now() - (executionEvidence.durationMs || 5000);
    const iterEndTime = Date.now();

    options.onLog(`\n[Antigravity Bridge] Processing execution evidence from Antigravity agent (Iteration ${iter})...\n`);
    this.transitionStage('collecting_evidence');

    const cliInfo: CliInfo = {
      name: 'antigravity-ide',
      executablePath: 'internal-ide-agent',
      version: 'gemini-agent',
      available: true,
    };

    const collectedEvidence = this.evidenceCollector.collect({
      runId: this.runId,
      iteration: iter,
      packet,
      cliInfo,
      evidence: executionEvidence,
      workspace: options.workspace,
      startTime: iterStartTime,
      endTime: iterEndTime,
      preGitStatus: [],
      postGitStatus: executionEvidence.changedFiles || [],
    });

    options.onStateUpdate?.({
      iteration: iter,
      evidence: collectedEvidence,
      consensus: null,
      proposal: null,
    });

    // Multi-AI Review & Consensus
    this.transitionStage('reviewing');
    options.onLog(`[Multi-AI Review] Presenting Antigravity code changes and test output to AI Reviewers...\n`);

    const consensus = await this.reviewOrchestrator.reviewExecution({
      packet,
      evidence: collectedEvidence,
      selectedProviders: options.selectedProviders,
      providerManager: options.providerManager,
      mockReviews: options.mockReviews,
      onLog: options.onLog,
    });

    options.onStateUpdate?.({
      iteration: iter,
      evidence: collectedEvidence,
      consensus,
      proposal: null,
    });

    const record: IterationRecord = {
      iteration: iter,
      evidence: collectedEvidence,
      consensus,
      durationMs: iterEndTime - iterStartTime,
    };
    this.iterationHistory.push(record);

    if (consensus.verdict === 'PASS') {
      this.transitionStage('completed');
      this.isRunning = false;
      options.onLog(`\n🎉 [Consensus PASS] ChatGPT and AI reviewers verified all criteria! Execution succeeded.\n`);
      const report = this.finalizeReport('PASS');
      return { ok: true, stage: 'completed', consensus, report };
    }

    if (consensus.verdict === 'BLOCKED') {
      this.transitionStage('blocked');
      this.isRunning = false;
      options.onLog(`\n⛔ [Consensus BLOCKED] Review blocked continuation: ${consensus.rationale}\n`);
      const report = this.finalizeReport('BLOCKED');
      return { ok: false, stage: 'blocked', consensus, error: consensus.rationale, report };
    }

    // Verdict is REVISION_REQUIRED
    if (iter >= this.maxIterations) {
      this.transitionStage('revision_limit_reached');
      this.isRunning = false;
      options.onLog(`\n🛑 [Revision Limit Reached] Reached maximum correction limit (${this.maxIterations}). Stopping loop.\n`);
      const report = this.finalizeReport('REVISION_LIMIT_REACHED');
      return { ok: false, stage: 'revision_limit_reached', consensus, error: 'Maximum correction limit reached.', report };
    }

    const nextIteration = iter + 1;
    this.currentIteration = nextIteration;
    options.onLog(`[Correction Planner] Formulating revision proposal for iteration ${nextIteration} based on reviewer feedback...\n`);

    const proposal = this.correctionPlanner.planCorrection({
      iteration: nextIteration,
      originalPacket: packet,
      consensus,
      evidence: collectedEvidence,
    });

    this.activeProposal = proposal;
    record.correctionProposal = proposal;
    this.transitionStage('awaiting_correction_approval');

    options.onStateUpdate?.({
      iteration: nextIteration,
      evidence: collectedEvidence,
      consensus,
      proposal,
    });

    return { ok: true, stage: 'awaiting_correction_approval', consensus };
  }

  private transitionStage(newStage: PipelineStage): void {
    this.currentStage = newStage;
    this.activeOptions?.onStageChange(newStage);
  }

  private finalizeReport(outcome: 'PASS' | 'BLOCKED' | 'REVISION_LIMIT_REACHED' | 'FAILED' | 'CANCELLED'): LoopRunReport {
    const endTime = Date.now();
    const options = this.activeOptions!;

    const lastConsensus = this.iterationHistory[this.iterationHistory.length - 1]?.consensus;
    const unresolvedFindings = outcome === 'PASS' ? [] : (lastConsensus ? lastConsensus.findings : []);

    const report: LoopRunReport = {
      runId: this.runId,
      workspace: options.workspace,
      startTime: new Date(this.runStartTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      totalDurationMs: endTime - this.runStartTime,
      finalStage: this.currentStage,
      outcome,
      initialPacketFingerprint: this.iterationHistory[0]?.evidence.packetFingerprint || 'UNSIGNED',
      totalIterations: this.iterationHistory.length,
      iterations: this.iterationHistory,
      unresolvedFindings,
      finalDecisionPacket: this.currentPacket,
      persistedReportPath: '',
    };

    try {
      const saved = this.reportGenerator.generateAndSave(report, options.workspace);
      report.persistedReportPath = saved.jsonPath;
      options.onLog(`[Audit Report] Saved execution audit report: ${saved.jsonPath}\n`);
      options.onLog(`[Audit Report] Markdown summary available: ${saved.mdPath}\n`);
    } catch (err: any) {
      options.onLog(`[Audit Warning] Failed to write report file: ${err.message}\n`);
    }

    return report;
  }
}
