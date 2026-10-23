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

export type ProviderStatusType = 'ready' | 'needs_auth' | 'rate_limited' | 'disabled' | 'error';

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
  rawText?: string;
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
}
