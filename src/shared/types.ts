// Shared types across Electron Main, Preload, and Renderer processes

export type PipelineStage =
  | 'idle'
  | 'preflight'
  | 'debating'
  | 'synthesizing'
  | 'awaiting_confirmation'
  | 'executing'
  | 'testing'
  | 'reviewing'
  | 'correcting'
  | 'completed'
  | 'failed'
  | 'cancelled';

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
  reviewIteration: number;
  maxRetries: number;
  cliTool: {
    name: string;
    version: string;
    available: boolean;
  };
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
  openProviderLogin: (providerId: ProviderId) => Promise<boolean>;
  checkProviderStatus: (providerId: ProviderId) => Promise<ProviderState>;
  sendProviderPrompt: (
    providerId: ProviderId,
    prompt: string
  ) => Promise<{ ok: boolean; response?: string; error?: string }>;
  onProviderStatusChanged: (callback: (state: ProviderState) => void) => () => void;
}
