import React, { useState } from 'react';
import type { OrchestratorSessionState, ProviderId } from '../../../shared/types';

interface MissionControlProps {
  session: OrchestratorSessionState;
  onStart: (idea: string, workspace: string, providers: Record<ProviderId, boolean>, maxRetries: number) => void;
  onStop: () => void;
  onSelectWorkspace: () => void;
}

export const MissionControl: React.FC<MissionControlProps> = ({
  session,
  onStart,
  onStop,
  onSelectWorkspace,
}) => {
  const [idea, setIdea] = useState(session.idea);
  const [workspace, setWorkspace] = useState(session.workspace);
  const [providers, setProviders] = useState<Record<ProviderId, boolean>>(session.selectedProviders);
  const [maxRetries, setMaxRetries] = useState<number>(session.maxRetries || 3);

  // Sync workspace if updated externally
  React.useEffect(() => {
    setWorkspace(session.workspace);
  }, [session.workspace]);

  const toggleProvider = (id: ProviderId) => {
    setProviders(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleStart = () => {
    if (!idea.trim()) {
      alert('Please enter a development goal or requirement.');
      return;
    }
    onStart(idea.trim(), workspace, providers, maxRetries);
  };

  return (
    <div className="mission-form">
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
          <label className="form-label">Participating AI Models</label>
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
                fontSize: '11px'
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
              checked={providers.chatgpt}
              onChange={() => toggleProvider('chatgpt')}
              disabled={session.running}
            />
            ChatGPT (Architect)
          </label>
          <label className="toggle-chip">
            <input
              type="checkbox"
              checked={providers.gemini}
              onChange={() => toggleProvider('gemini')}
              disabled={session.running}
            />
            Gemini (Feasibility)
          </label>
          <label className="toggle-chip">
            <input
              type="checkbox"
              checked={providers.deepseek}
              onChange={() => toggleProvider('deepseek')}
              disabled={session.running}
            />
            DeepSeek (Code Spec)
          </label>
          <label className="toggle-chip claude">
            <input
              type="checkbox"
              checked={providers.claude}
              onChange={() => toggleProvider('claude')}
              disabled={session.running}
            />
            Claude (Auditor)
            <span className="quota-indicator">⚡ Quota Guard</span>
          </label>
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
