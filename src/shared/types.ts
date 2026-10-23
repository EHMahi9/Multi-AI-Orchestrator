// Shared types across Electron Main, Preload, and Renderer processes

export type PipelineStage =
  | 'idle'
  | 'preflight'
  | 'debating'
  | 'synthesizing'
  | 'awaiting_confirmation'
  | 'awaiting_initial_approval'
  | 'executing'
  | 'collecting_evidence'
  | 'reviewing'
  | 'awaiting_correction_approval'
  | 'correction_ready'
  | 'awaiting_verification'
  | 'completed'
  | 'revision_limit_reached'
  | 'blocked'
  | 'cancelled'
  | 'failed';

export type ProviderId = 'chatgpt' | 'gemini' | 'deepseek' | 'claude';

export type ProviderStatusType =
  | 'not_configured'
  | 'login_required'
  | 'ready'
  | 'rate_limited'
  | 'manual_intervention_required'
  | 'error'
  | 'disabled';

export interface ProviderState {
  id: ProviderId;
  name: string;
  enabled: boolean;
  status: ProviderStatusType;
  quotaProtected: boolean;
  lastMessage?: string;
}

export interface DecisionTask {
  id: string;
  title: string;
  files: string[];
  testCommand?: string;
  description: string;
}

export interface DecisionPacket {
  version: '1.0';
  title: string;
  summary: string;
  decisions: string[];
  tasks: DecisionTask[];
  criteria: string[];
  unresolvedRisks: string[];
  consensusTimestamp?: string;
  approvedByUser?: boolean;
  approvalSignature?: string;
  approvedWorkspace?: string;
  rawText?: string;
}

export interface ConsensusTurn {
  turnNumber: number;
  providerId: ProviderId;
  role: string;
  prompt: string;
  response: string;
  timestamp: string;
  durationMs: number;
  status: 'pending' | 'success' | 'error' | 'skipped';
  error?: string;
}

export interface ExecutionEvidence {
  success: boolean;
  exitCode: number;
  stdoutTail: string;
  stderrTail: string;
  changedFiles: string[];
  diffStat: string;
  durationMs: number;
  fullLogPath: string;
  cancelled?: boolean;
  timedOut?: boolean;
  blockedReason?: string;
}

// ----------------------------------------------------------------------------
// Milestone 5: Structured Review & Closed-Loop Types
// ----------------------------------------------------------------------------

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type ReviewVerdictType = 'PASS' | 'REVISION_REQUIRED' | 'BLOCKED';

export interface ReviewFinding {
  id: string;
  severity: FindingSeverity;
  description: string;
  evidenceReferences: string[];
  reproducible: boolean;
  recommendedAction: string;
}

export interface StructuredReview {
  schemaVersion: '1.0';
  providerId: ProviderId;
  role: string;
  verdict: ReviewVerdictType;
  summary: string;
  findings: ReviewFinding[];
  evidenceReferences: string[];
  requiredCorrections: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number; // 0.0 to 1.0
  missingEvidence: string[];
  timestamp: string;
  rawText?: string;
}

export interface ReviewConsensus {
  verdict: ReviewVerdictType;
  summary: string;
  quorumReached: boolean;
  participatingProviders: ProviderId[];
  failedProviders: ProviderId[];
  individualReviews: StructuredReview[];
  findings: ReviewFinding[];
  requiredCorrections: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  rationale: string;
  timestamp: string;
}

export interface CorrectionProposal {
  iteration: number;
  linkedFindingIds: string[];
  explanation: string;
  expectedVerification: string;
  originalPacketFingerprint: string;
  proposedPacket: DecisionPacket;
  requiresUserApproval: boolean;
  approved: boolean;
  approvalSignature?: string;
}

export interface CollectedEvidence {
  runId: string;
  iteration: number; // 0 = initial execution, 1..3 = corrections
  packetFingerprint: string;
  cliInfo: {
    name: string;
    version: string;
    executablePath: string;
  };
  startTime: string;
  endTime: string;
  durationMs: number;
  exitCode: number;
  success: boolean;
  timedOut: boolean;
  cancelled: boolean;
  stdoutTail: string;
  stderrTail: string;
  preGitStatus: string[];
  postGitStatus: string[];
  changedFiles: string[];
  diffStat: string;
  testCommand?: string;
  testOutput?: string;
  testPassed?: boolean;
  fullLogPath: string;
  missingEvidence: string[];
}

export interface IterationRecord {
  iteration: number;
  evidence: CollectedEvidence;
  consensus: ReviewConsensus;
  correctionProposal?: CorrectionProposal;
  durationMs: number;
}

export interface LoopRunReport {
  runId: string;
  workspace: string;
  startTime: string;
  endTime: string;
  totalDurationMs: number;
  finalStage: PipelineStage;
  outcome: 'PASS' | 'BLOCKED' | 'REVISION_LIMIT_REACHED' | 'FAILED' | 'CANCELLED';
  initialPacketFingerprint: string;
  totalIterations: number;
  iterations: IterationRecord[];
  unresolvedFindings: ReviewFinding[];
  finalDecisionPacket: DecisionPacket | null;
  persistedReportPath: string;
}

export interface ReviewVerdict {
  approved: boolean;
  summary: string;
  defects: string[];
  correctiveActions: string[];
  rawText: string;
}

export interface OrchestratorSessionState {
  stage: PipelineStage;
  running: boolean;
  paused: boolean;
  idea: string;
  workspace: string;
  selectedProviders: Record<ProviderId, boolean>;
  providerStates: Record<ProviderId, ProviderState>;
  decisionPacket: DecisionPacket | null;
  consensusTurns: ConsensusTurn[];
  evidence: ExecutionEvidence | null;
  reviewVerdict: ReviewVerdict | null;
  reviewIteration: number; // Current iteration (0 = initial, 1..3 = corrections)
  maxRetries: number; // Max correction iterations (default: 3)
  cliTool: {
    name: string;
    version: string;
    available: boolean;
  };
  // Milestone 5 extensions
  runId: string | null;
  collectedEvidence: CollectedEvidence | null;
  reviewConsensus: ReviewConsensus | null;
  correctionProposal: CorrectionProposal | null;
  iterationHistory: IterationRecord[];
  finalReportPath: string | null;
}

export interface AppMetadata {
  name: string;
  version: string;
  electronVersion: string;
  nodeVersion: string;
  platform: string;
  arch: string;
}

// Minimal, typed IPC Contract exposed via contextBridge
export interface IElectronAPI {
  getAppMetadata: () => Promise<AppMetadata>;
  getSessionState: () => Promise<OrchestratorSessionState>;
  checkCliStatus: () => Promise<{ name: string; version: string; available: boolean }>;
  selectWorkspaceDirectory: () => Promise<string | null>;
  startPipeline: (params: {
    idea: string;
    workspace: string;
    providers: Record<ProviderId, boolean>;
    maxRetries?: number;
  }) => Promise<{ ok: boolean; error?: string }>;
  stopPipeline: () => Promise<{ ok: boolean }>;
  pausePipeline: () => Promise<{ ok: boolean }>;
  resumePipeline: () => Promise<{ ok: boolean }>;
  onStateChange: (callback: (state: OrchestratorSessionState) => void) => () => void;
  onLogChunk: (callback: (chunk: string) => void) => () => void;
  approveDecisionPacket: () => Promise<{ ok: boolean }>;
  rejectDecisionPacket: () => Promise<{ ok: boolean }>;
  runApprovedExecution: () => Promise<{ ok: boolean; evidence?: ExecutionEvidence; error?: string }>;
  cancelExecution: () => Promise<{ ok: boolean }>;
  // Milestone 5: Autonomous Closed-Loop Review & Self-Correction
  startAutonomousLoop: (params?: { maxIterations?: number }) => Promise<{ ok: boolean; error?: string }>;
  approveCorrection: () => Promise<{ ok: boolean; error?: string }>;
  rejectCorrection: () => Promise<{ ok: boolean }>;
  openProviderLogin: (providerId: ProviderId) => Promise<boolean>;
  checkProviderStatus: (providerId: ProviderId) => Promise<ProviderState>;
  sendProviderPrompt: (
    providerId: ProviderId,
    prompt: string
  ) => Promise<{ ok: boolean; response?: string; error?: string }>;
  onProviderStatusChanged: (callback: (state: ProviderState) => void) => () => void;
}
