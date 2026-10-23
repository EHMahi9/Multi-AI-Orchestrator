import { contextBridge, ipcRenderer } from 'electron';
import type { IElectronAPI, OrchestratorSessionState, ProviderId } from '../shared/types';

const api: IElectronAPI = {
  getAppMetadata: () => ipcRenderer.invoke('app:get-metadata'),
  getSessionState: () => ipcRenderer.invoke('session:get-state'),
  checkCliStatus: () => ipcRenderer.invoke('cli:check-status'),
  selectWorkspaceDirectory: () => ipcRenderer.invoke('dialog:select-workspace'),

  startPipeline: (params: {
    idea: string;
    workspace: string;
    providers: Record<ProviderId, boolean>;
    maxRetries?: number;
  }) => {
    // Basic argument validation before passing to IPC
    if (!params || typeof params.idea !== 'string') {
      return Promise.resolve({ ok: false, error: 'Invalid start arguments.' });
    }
    return ipcRenderer.invoke('pipeline:start', params);
  },

  stopPipeline: () => ipcRenderer.invoke('pipeline:stop'),
  pausePipeline: () => ipcRenderer.invoke('pipeline:pause'),
  resumePipeline: () => ipcRenderer.invoke('pipeline:resume'),

  onStateChange: (callback: (state: OrchestratorSessionState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: OrchestratorSessionState) => {
      callback(state);
    };
    ipcRenderer.on('pipeline:state-changed', handler);
    return () => {
      ipcRenderer.removeListener('pipeline:state-changed', handler);
    };
  },

  onLogChunk: (callback: (chunk: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, chunk: string) => {
      callback(chunk);
    };
    ipcRenderer.on('pipeline:log-chunk', handler);
    return () => {
      ipcRenderer.removeListener('pipeline:log-chunk', handler);
    };
  }
};

contextBridge.exposeInMainWorld('electronAPI', api);
