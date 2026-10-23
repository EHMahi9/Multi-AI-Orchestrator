import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { exec } from 'child_process';
import { setupWindowSecurity, validateWorkspacePath } from './security';
import type { AppMetadata, OrchestratorSessionState, ProviderId } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Initial session state
let sessionState: OrchestratorSessionState = {
  stage: 'idle',
  running: false,
  paused: false,
  idea: '',
  workspace: process.cwd(),
  selectedProviders: {
    chatgpt: true,
    gemini: true,
    deepseek: true,
    claude: false,
  },
  providerStates: {
    chatgpt: { id: 'chatgpt', name: 'ChatGPT (Architect)', enabled: true, status: 'ready', quotaProtected: false },
    gemini: { id: 'gemini', name: 'Gemini (Feasibility)', enabled: true, status: 'ready', quotaProtected: false },
    deepseek: { id: 'deepseek', name: 'DeepSeek (Code Spec)', enabled: true, status: 'ready', quotaProtected: false },
    claude: { id: 'claude', name: 'Claude (Auditor)', enabled: false, status: 'ready', quotaProtected: true },
  },
  decisionPacket: null,
  evidence: null,
  reviewVerdict: null,
  reviewIteration: 0,
  maxRetries: 3,
  cliTool: {
    name: 'gemini',
    version: 'detecting...',
    available: false,
  },
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

  mainWindow.on('closed', () => {
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
  return sessionState;
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

  // Update session state for Milestone 1 Scaffold demonstration
  sessionState.running = true;
  sessionState.paused = false;
  sessionState.stage = 'preflight';
  sessionState.idea = params.idea.trim();
  sessionState.workspace = wsCheck.normalized!;
  sessionState.selectedProviders = params.providers;
  sessionState.maxRetries = params.maxRetries || 3;
  sessionState.reviewIteration = 1;

  broadcastState();
  broadcastLog(`[Milestone 1 Scaffold] Pipeline started for goal: "${sessionState.idea}"\n`);
  broadcastLog(`[Workspace] Verified target directory: ${sessionState.workspace}\n`);
  broadcastLog(`[CLI Preflight] Active agent binary: ${sessionState.cliTool.name} (v${sessionState.cliTool.version})\n`);
  broadcastLog(`[Notice] Full multi-AI session execution and Antigravity handoff will activate in Milestones 2-5.\n\n`);

  return { ok: true };
});

ipcMain.handle('pipeline:stop', async () => {
  sessionState.running = false;
  sessionState.paused = false;
  sessionState.stage = 'cancelled';
  broadcastState();
  broadcastLog(`\n[Pipeline] Stopped by user request.\n`);
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
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
