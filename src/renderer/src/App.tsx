import React, { useState, useEffect } from 'react';
import { Titlebar } from './components/Titlebar';
import { MissionControl } from './components/MissionControl';
import { DiscussionStream } from './components/DiscussionStream';
import { ExecutionPanel } from './components/ExecutionPanel';
import type { OrchestratorSessionState, ProviderId } from '../../shared/types';

const defaultSession: OrchestratorSessionState = {
  stage: 'idle',
  running: false,
  paused: false,
  idea: '',
  workspace: '',
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
  consensusTurns: [],
  evidence: null,
  reviewVerdict: null,
  reviewIteration: 0,
  maxRetries: 3,
  cliTool: {
    name: 'detecting...',
    version: '',
    available: false,
  },
};

export const App: React.FC = () => {
  const [session, setSession] = useState<OrchestratorSessionState>(defaultSession);
  const [logs, setLogs] = useState<string>('');

  useEffect(() => {
    // Connect to Electron IPC if running inside Electron desktop container
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.getSessionState()
        .then((st) => {
          if (st) setSession(st);
        })
        .catch(console.error);

      window.electronAPI.checkCliStatus()
        .then((cli) => {
          setSession((prev) => ({ ...prev, cliTool: cli }));
        })
        .catch(console.error);

      const unbindState = window.electronAPI.onStateChange((newState) => {
        setSession(newState);
      });

      const unbindLog = window.electronAPI.onLogChunk((chunk) => {
        setLogs((prev) => prev + chunk);
      });

      const unbindProvider = window.electronAPI.onProviderStatusChanged((providerState) => {
        setSession((prev) => ({
          ...prev,
          providerStates: {
            ...prev.providerStates,
            [providerState.id]: providerState,
          },
        }));
      });

      return () => {
        unbindState();
        unbindLog();
        unbindProvider();
      };
    }
  }, []);

  const handleOpenLogin = async (id: ProviderId) => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      await window.electronAPI.openProviderLogin(id);
    }
  };

  const handleCheckStatus = async (id: ProviderId) => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const state = await window.electronAPI.checkProviderStatus(id);
      setSession((prev) => ({
        ...prev,
        providerStates: {
          ...prev.providerStates,
          [id]: state,
        },
      }));
    }
  };

  const handleStart = async (
    idea: string,
    workspace: string,
    providers: Record<ProviderId, boolean>,
    maxRetries: number
  ) => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const res = await window.electronAPI.startPipeline({
        idea,
        workspace,
        providers,
        maxRetries,
      });
      if (!res.ok) {
        alert(`Could not start pipeline: ${res.error || 'Unknown error'}`);
      }
    } else {
      alert('Running outside Electron environment. Launch with npm start to use full desktop IPC.');
    }
  };

  const handleStop = async () => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      await window.electronAPI.stopPipeline();
    }
  };

  const handleSelectWorkspace = async () => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const selected = await window.electronAPI.selectWorkspaceDirectory();
      if (selected) {
        setSession((prev) => ({ ...prev, workspace: selected }));
      }
    }
  };

  const handleApprovePacket = async () => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      await window.electronAPI.approveDecisionPacket();
    }
  };

  const handleRejectPacket = async () => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      await window.electronAPI.rejectDecisionPacket();
    }
  };

  const handleRunApproved = async () => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      await window.electronAPI.runApprovedExecution();
    }
  };

  return (
    <>
      <Titlebar session={session} onOpenLogin={handleOpenLogin} />
      <main className="workspace">
        <aside className="mission-column">
          <div className="section-header">
            <h2>Mission Control</h2>
            <span className={`stage-badge ${session.stage}`}>{session.stage}</span>
          </div>
          <MissionControl
            session={session}
            onStart={handleStart}
            onStop={handleStop}
            onSelectWorkspace={handleSelectWorkspace}
          />
          <div className="section-header" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <h2>Autonomous Consensus</h2>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Cross-Model Debate</span>
          </div>
          <DiscussionStream session={session} />
        </aside>
        <ExecutionPanel
          session={session}
          logs={logs}
          onClearLogs={() => setLogs('')}
          onOpenLogin={handleOpenLogin}
          onCheckStatus={handleCheckStatus}
          onApprovePacket={handleApprovePacket}
          onRejectPacket={handleRejectPacket}
          onRunApproved={handleRunApproved}
        />
      </main>
    </>
  );
};

export default App;
