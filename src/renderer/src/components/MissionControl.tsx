import React, { useState, useEffect } from 'react';
import type { OrchestratorSessionState, ProviderId } from '../../../shared/types';

interface MissionControlProps {
  session: OrchestratorSessionState;
  onStart: (
    idea: string,
    workspace: string,
    providers: Record<ProviderId, boolean>,
    startingProvider: ProviderId,
    maxRetries: number
  ) => void;
  onStop: () => void;
  onSelectWorkspace: () => void;
  onToggleShowcase?: () => void;
}

export const MissionControl: React.FC<MissionControlProps> = ({
  session,
  onStart,
  onStop,
  onSelectWorkspace,
  onToggleShowcase,
}) => {
  const [idea, setIdea] = useState(session.idea);
  const [workspace, setWorkspace] = useState(session.workspace);
  const [providers, setProviders] = useState<Record<ProviderId, boolean>>(session.selectedProviders);
  const [startingProvider, setStartingProvider] = useState<ProviderId>(
    session.startingProvider || 'gemini'
  );
  const [maxRetries, setMaxRetries] = useState<number>(session.maxRetries || 3);

  // Sync workspace and startingProvider if updated externally
  useEffect(() => {
    setWorkspace(session.workspace);
  }, [session.workspace]);

  useEffect(() => {
    if (session.startingProvider && providers[session.startingProvider]) {
      setStartingProvider(session.startingProvider);
    }
  }, [session.startingProvider]);

  const toggleProvider = (id: ProviderId) => {
    setProviders((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      // If the currently selected starting AI was unchecked, pick another active provider
      if (!next[id] && startingProvider === id) {
        const available = (Object.keys(next) as ProviderId[]).filter((p) => next[p]);
        if (available.length > 0) {
          setStartingProvider(available[0]);
        }
      }
      return next;
    });
  };

  const handleStart = () => {
    if (!idea.trim()) {
      alert('Please enter a development goal or requirement.');
      return;
    }
    const active = (Object.keys(providers) as ProviderId[]).filter((p) => providers[p]);
    if (active.length === 0) {
      alert('Please select at least one participating AI model.');
      return;
    }
    // Ensure selected starting provider is active
    let actualStarter = startingProvider;
    if (!providers[actualStarter]) {
      actualStarter = active[0];
      setStartingProvider(actualStarter);
    }
    onStart(idea.trim(), workspace, providers, actualStarter, maxRetries);
  };

  const providerNames: Record<ProviderId, string> = {
    chatgpt: 'ChatGPT',
    gemini: 'Gemini',
    deepseek: 'DeepSeek',
    claude: 'Claude',
  };

  const activeProviderList = (Object.keys(providers) as ProviderId[]).filter((id) => providers[id]);

  const handleLoadShowcaseScenario = () => {
    setIdea(
      'Implement a Zero-Trust JWT Authentication & Token Revocation Engine with Constant-Time Signature Verification, Rate Limiting, and Automated Unit Tests'
    );
    setProviders({
      chatgpt: true,
      gemini: true,
      deepseek: true,
      claude: true,
    });
    setStartingProvider('chatgpt');
    setMaxRetries(3);
    if (!session.showcaseMode && onToggleShowcase) {
      onToggleShowcase();
    }
  };

  return (
    <div className="mission-form">
      <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          type="button"
          onClick={handleLoadShowcaseScenario}
          disabled={session.running}
          style={{
            background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
            border: '1px solid #6366f1',
            color: '#c7d2fe',
            padding: '5px 10px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            width: '100%',
            justifyContent: 'center',
          }}
          title="Preload the high-impact Zero-Trust Security & QA benchmark scenario"
        >
          <span>⭐</span> Load SQAT Summit 2026 Live Demo Scenario
        </button>
      </div>

      <div className="form-group">
        <label className="form-label">Project Goal / Development Requirement</label>
        <textarea
          rows={4}
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="e.g. Implement a responsive Dark Mode theme toggle in our Next.js header using CSS variables and localStorage persistence. Include automated unit tests."
          disabled={session.running}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Target Workspace Directory</label>
        <div className="path-input-row">
          <input
            type="text"
            value={workspace}
            onChange={(e) => setWorkspace(e.target.value)}
            disabled={session.running}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onSelectWorkspace}
            disabled={session.running}
            title="Browse Directory"
          >
            📁 Browse
          </button>
        </div>
      </div>

      <div className="form-group">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label className="form-label">Participating AI Models (Open Collaboration)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Max Review Loops:</span>
            <select
              value={maxRetries}
              onChange={(e) => setMaxRetries(Number(e.target.value))}
              disabled={session.running}
              style={{
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '11px',
              }}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={5}>5</option>
            </select>
          </div>
        </div>
        <div className="model-toggles">
          <label className="toggle-chip">
            <input
              type="checkbox"
              checked={providers.gemini}
              onChange={() => toggleProvider('gemini')}
              disabled={session.running}
            />
            Gemini
          </label>
          <label className="toggle-chip">
            <input
              type="checkbox"
              checked={providers.deepseek}
              onChange={() => toggleProvider('deepseek')}
              disabled={session.running}
            />
            DeepSeek
          </label>
          <label className="toggle-chip">
            <input
              type="checkbox"
              checked={providers.chatgpt}
              onChange={() => toggleProvider('chatgpt')}
              disabled={session.running}
            />
            ChatGPT
          </label>
          <label className="toggle-chip claude">
            <input
              type="checkbox"
              checked={providers.claude}
              onChange={() => toggleProvider('claude')}
              disabled={session.running}
            />
            Claude
            <span className="quota-indicator">⚡ Quota Guard</span>
          </label>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Starting AI (Turn 1 Lead)</label>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select
            value={startingProvider}
            onChange={(e) => setStartingProvider(e.target.value as ProviderId)}
            disabled={session.running}
            style={{
              background: 'var(--bg-base)',
              color: '#fff',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '12px',
              flex: 1,
            }}
          >
            {activeProviderList.map((id) => {
              const st = session.providerStates[id]?.status;
              const statusLabel = st ? ` [${st.replace(/_/g, ' ').toUpperCase()}]` : '';
              return (
                <option key={id} value={id}>
                  {providerNames[id]} {statusLabel}
                </option>
              );
            })}
          </select>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Workflow: Open Collaboration
          </span>
        </div>
      </div>

      <div className="action-row">
        <button
          className="btn btn-primary"
          onClick={handleStart}
          disabled={session.running}
        >
          🚀 Start Autonomous Pipeline
        </button>
        <button
          className="btn btn-danger"
          onClick={onStop}
          disabled={!session.running}
        >
          ⏹ Stop
        </button>
      </div>
    </div>
  );
};
