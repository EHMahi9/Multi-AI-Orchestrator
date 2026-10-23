import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { exec } from 'child_process';
import { setupWindowSecurity, validateWorkspacePath } from './security';
import { ProviderSessionManager } from './providers/manager';
import { ConsensusOrchestrator } from './consensus/orchestrator';
import { ExecutionService } from './execution/engine';
import { LoopController } from './review/loop-controller';
import { computeDecisionPacketHash } from '../shared/schema';
import type { AppMetadata, OrchestratorSessionState, ProviderId, ProviderState } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const providerManager = new ProviderSessionManager();
const executionService = new ExecutionService();
const loopController = new LoopController();
let currentOrchestrator: ConsensusOrchestrator | null = null;

// Initial session state
let sessionState: OrchestratorSessionState = {
  stage: 'idle',
  running: false,
  paused: false,
  idea: '',
  workspace: process.cwd(),
  startingProvider: 'gemini',
  selectedProviders: {
    chatgpt: true,
    gemini: true,
    deepseek: true,
    claude: false,
  },
  providerStates: {
    chatgpt: { id: 'chatgpt', name: 'ChatGPT (Architect)', enabled: true, status: 'not_configured', quotaProtected: false },
    gemini: { id: 'gemini', name: 'Gemini (Feasibility)', enabled: true, status: 'not_configured', quotaProtected: false },
    deepseek: { id: 'deepseek', name: 'DeepSeek (Code Spec)', enabled: true, status: 'not_configured', quotaProtected: false },
    claude: { id: 'claude', name: 'Claude (Auditor)', enabled: false, status: 'disabled', quotaProtected: true },
  },
  decisionPacket: null,
  consensusTurns: [],
  evidence: null,
  reviewVerdict: null,
  reviewIteration: 0,
  maxRetries: 3,
  cliTool: {
    name: 'gemini',
    version: 'detecting...',
    available: false,
  },
  runId: null,
  collectedEvidence: null,
  reviewConsensus: null,
  correctionProposal: null,
  iterationHistory: [],
  finalReportPath: null,
};

function broadcastState(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pipeline:state-changed', sessionState);
  }
}

function broadcastLog(chunk: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pipeline:log-chunk', chunk);
  }
}

// Preflight check for local agent CLI (detects gemini or agy)
function detectAgentCli(): Promise<{ name: string; version: string; available: boolean }> {
  return new Promise((resolve) => {
    // Priority: gemini CLI (installed v0.60.0), then agy
    exec('gemini --version', (err, stdout) => {
      if (!err && stdout.trim()) {
        const ver = stdout.trim();
        sessionState.cliTool = { name: 'gemini', version: ver, available: true };
        return resolve(sessionState.cliTool);
      }

      exec('agy --version', (errAgy, stdoutAgy) => {
        if (!errAgy && stdoutAgy.trim()) {
          sessionState.cliTool = { name: 'agy', version: stdoutAgy.trim(), available: true };
        } else {
          sessionState.cliTool = { name: 'none', version: 'Not found on PATH', available: false };
        }
        resolve(sessionState.cliTool);
      });
    });
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0a0d12',
    title: 'Multi-AI Autonomous Development Controller',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  setupWindowSecurity(mainWindow, isDev);

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  providerManager.setMainWindow(mainWindow);

  mainWindow.on('closed', () => {
    providerManager.setMainWindow(null);
    mainWindow = null;
  });
}

// --------------------------------------------------------------------------
// IPC Handlers
// --------------------------------------------------------------------------

ipcMain.handle('app:get-metadata', (): AppMetadata => {
  return {
    name: app.getName(),
    version: app.getVersion(),
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    platform: process.platform,
    arch: process.arch,
  };
});

ipcMain.handle('session:get-state', (): OrchestratorSessionState => {
  sessionState.providerStates = providerManager.getAllStates();
  return sessionState;
});

ipcMain.handle('provider:open-login', async (_event, providerId: ProviderId): Promise<boolean> => {
  const result = await providerManager.openLogin(providerId);
  const state = await providerManager.checkStatus(providerId);
  sessionState.providerStates[providerId] = state;
  broadcastState();
  return result;
});

ipcMain.handle('provider:check-status', async (_event, providerId: ProviderId): Promise<ProviderState> => {
  const state = await providerManager.checkStatus(providerId);
  sessionState.providerStates[providerId] = state;
  broadcastState();
  return state;
});

ipcMain.handle('provider:send-prompt', async (_event, params: { providerId: ProviderId; prompt: string }) => {
  if (!params || !params.providerId || typeof params.prompt !== 'string') {
    return { ok: false, error: 'Invalid prompt arguments.' };
  }
  return await providerManager.sendPrompt(params.providerId, params.prompt);
});

ipcMain.handle('cli:check-status', async () => {
  const result = await detectAgentCli();
  broadcastState();
  return result;
});

ipcMain.handle('dialog:select-workspace', async (): Promise<string | null> => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Target Project Workspace',
    properties: ['openDirectory', 'createDirectory'],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const selected = result.filePaths[0];
    const validation = validateWorkspacePath(selected);
    if (validation.valid && validation.normalized) {
      sessionState.workspace = validation.normalized;
      broadcastState();
      return validation.normalized;
    }
  }
  return null;
});

ipcMain.handle('pipeline:start', async (_event, params: {
  idea: string;
  workspace: string;
  providers: Record<ProviderId, boolean>;
  startingProvider?: ProviderId;
  maxRetries?: number;
}) => {
  if (sessionState.running) {
    return { ok: false, error: 'Pipeline is already running.' };
  }

  if (!params.idea?.trim()) {
    return { ok: false, error: 'Project goal or requirement is required.' };
  }

  const wsCheck = validateWorkspacePath(params.workspace || sessionState.workspace);
  if (!wsCheck.valid) {
    return { ok: false, error: wsCheck.error };
  }

  sessionState.running = true;
  sessionState.paused = false;
  sessionState.stage = 'preflight';
  sessionState.idea = params.idea.trim();
  sessionState.workspace = wsCheck.normalized!;
  sessionState.selectedProviders = params.providers;
  if (params.startingProvider) {
    sessionState.startingProvider = params.startingProvider;
  }
  sessionState.consensusTurns = [];
  sessionState.decisionPacket = null;
  sessionState.maxRetries = params.maxRetries || 3;
  broadcastState();

  currentOrchestrator = new ConsensusOrchestrator();

  // Execute consensus pipeline asynchronously without blocking IPC return
  (async () => {
    try {
      const result = await currentOrchestrator!.run({
        idea: sessionState.idea,
        workspace: sessionState.workspace,
        selectedProviders: sessionState.selectedProviders,
        startingProvider: sessionState.startingProvider,
        providerManager,
        onLog: (chunk) => broadcastLog(chunk),
        onTurnUpdate: (turn) => {
          const idx = sessionState.consensusTurns.findIndex((t) => t.turnNumber === turn.turnNumber);
          if (idx !== -1) {
            sessionState.consensusTurns[idx] = turn;
          } else {
            sessionState.consensusTurns.push(turn);
          }
          broadcastState();
        },
        onStageChange: (stage) => {
          sessionState.stage = stage;
          broadcastState();
        },
      });

      if (result.ok && result.packet) {
        sessionState.decisionPacket = result.packet;
        sessionState.stage = 'awaiting_confirmation';
      } else {
        sessionState.stage = result.stage;
        sessionState.running = false;
      }
    } catch (err: any) {
      sessionState.stage = 'failed';
      sessionState.running = false;
      broadcastLog(`\n[Fatal Error in Pipeline] ${err.message}\n`);
    } finally {
      broadcastState();
    }
  })();

  return { ok: true };
});

ipcMain.handle('pipeline:stop', async () => {
  if (currentOrchestrator) {
    currentOrchestrator.abort();
  }
  sessionState.running = false;
  sessionState.paused = false;
  sessionState.stage = 'cancelled';
  broadcastState();
  broadcastLog(`\n[Pipeline] Stopped by user request.\n`);
  return { ok: true };
});

ipcMain.handle('pipeline:approve-packet', async () => {
  if (sessionState.decisionPacket) {
    sessionState.decisionPacket.approvedByUser = true;
    sessionState.decisionPacket.approvalSignature = computeDecisionPacketHash(sessionState.decisionPacket);
    sessionState.decisionPacket.approvedWorkspace = sessionState.workspace;
    sessionState.stage = 'completed';
    sessionState.running = false;
    broadcastState();
    broadcastLog(`\n[Decision Packet Approved] User confirmed architecture and tasks.\n`);
    broadcastLog(`[Security Fingerprint] SHA-256: ${sessionState.decisionPacket.approvalSignature}\n`);
    broadcastLog(`[Milestone 4 Engine Ready] User may now click "Run Approved Tasks" to trigger local agent execution.\n`);
    return { ok: true };
  }
  return { ok: false, error: 'No Decision Packet available to approve.' };
});

ipcMain.handle('pipeline:reject-packet', async () => {
  sessionState.stage = 'cancelled';
  sessionState.running = false;
  broadcastState();
  broadcastLog(`\n[Decision Packet Rejected] User requested revision. Adjust goal in Mission Control and rerun.\n`);
  return { ok: true };
});

ipcMain.handle('execution:run-approved', async () => {
  if (!sessionState.decisionPacket || !sessionState.decisionPacket.approvedByUser) {
    return { ok: false, error: 'No approved Decision Packet available for execution.' };
  }

  sessionState.running = true;
  sessionState.stage = 'executing';
  broadcastState();

  (async () => {
    try {
      const result = await loopController.startLoop(sessionState.decisionPacket!, {
        workspace: sessionState.workspace,
        selectedProviders: sessionState.selectedProviders,
        providerManager,
        maxCorrectionIterations: sessionState.maxRetries || 3,
        onLog: (chunk) => broadcastLog(chunk),
        onStageChange: (stage) => {
          sessionState.stage = stage;
          broadcastState();
        },
        onStateUpdate: (data) => {
          sessionState.reviewIteration = data.iteration;
          sessionState.collectedEvidence = data.evidence;
          sessionState.reviewConsensus = data.consensus;
          sessionState.correctionProposal = data.proposal;
          sessionState.iterationHistory = loopController.getHistory();
          broadcastState();
        },
      });

      sessionState.stage = result.stage;
      sessionState.running = result.stage === 'awaiting_correction_approval' ? false : false;
      if (result.report) {
        sessionState.finalReportPath = result.report.persistedReportPath;
        if (result.report.iterations.length > 0) {
          const lastEvidence = result.report.iterations[result.report.iterations.length - 1].evidence;
          sessionState.evidence = {
            success: lastEvidence.success,
            exitCode: lastEvidence.exitCode,
            stdoutTail: lastEvidence.stdoutTail,
            stderrTail: lastEvidence.stderrTail,
            changedFiles: lastEvidence.changedFiles,
            diffStat: lastEvidence.diffStat,
            durationMs: lastEvidence.durationMs,
            fullLogPath: lastEvidence.fullLogPath,
            cancelled: lastEvidence.cancelled,
            timedOut: lastEvidence.timedOut,
          };
        }
      }
    } catch (err: any) {
      sessionState.stage = 'failed';
      sessionState.running = false;
      broadcastLog(`\n[Fatal Loop Error] ${err.message}\n`);
    } finally {
      broadcastState();
    }
  })();

  return { ok: true };
});

ipcMain.handle('execution:approve-correction', async () => {
  sessionState.running = true;
  broadcastState();

  (async () => {
    try {
      const result = await loopController.approveCorrection();
      sessionState.stage = result.stage;
      sessionState.running = result.stage === 'awaiting_correction_approval' ? false : false;
      if (result.report) {
        sessionState.finalReportPath = result.report.persistedReportPath;
      }
    } catch (err: any) {
      sessionState.stage = 'failed';
      sessionState.running = false;
      broadcastLog(`\n[Fatal Error Approving Correction] ${err.message}\n`);
    } finally {
      broadcastState();
    }
  })();

  return { ok: true };
});

ipcMain.handle('execution:reject-correction', async () => {
  const result = await loopController.rejectCorrection();
  sessionState.stage = result.stage;
  sessionState.running = false;
  if (result.report) {
    sessionState.finalReportPath = result.report.persistedReportPath;
  }
  broadcastState();
  return { ok: true };
});

ipcMain.handle('execution:cancel', async () => {
  loopController.cancel();
  executionService.cancel();
  sessionState.stage = 'cancelled';
  sessionState.running = false;
  broadcastState();
  return { ok: true };
});

ipcMain.handle('pipeline:pause', async () => {
  if (sessionState.running) {
    sessionState.paused = true;
    broadcastState();
    broadcastLog(`[Pipeline] Paused.\n`);
  }
  return { ok: true };
});

ipcMain.handle('pipeline:resume', async () => {
  if (sessionState.running && sessionState.paused) {
    sessionState.paused = false;
    broadcastState();
    broadcastLog(`[Pipeline] Resumed.\n`);
  }
  return { ok: true };
});

// App Lifecycle
app.whenReady().then(async () => {
  await detectAgentCli();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Periodic background status check for active unauthenticated windows
  setInterval(() => {
    for (const id of ['chatgpt', 'gemini', 'deepseek'] as ProviderId[]) {
      const prov = providerManager.getProvider(id);
      if (prov) {
        const currentStatus = prov.getState().status;
        if (
          currentStatus === 'not_configured' ||
          currentStatus === 'login_required' ||
          currentStatus === 'manual_intervention_required'
        ) {
          prov
            .checkStatus()
            .then(() => {
              sessionState.providerStates[id] = prov.getState();
              broadcastState();
            })
            .catch(() => {});
        }
      }
    }
  }, 4000);
});

app.on('before-quit', () => {
  (app as any).isQuitting = true;
  providerManager.destroyAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
