import React from 'react';
import type { OrchestratorSessionState, ProviderId } from '../../../shared/types';

interface DiscussionStreamProps {
  session: OrchestratorSessionState;
}

export const DiscussionStream: React.FC<DiscussionStreamProps> = ({ session }) => {
  const { consensusTurns, idea, running } = session;

  const getProviderColor = (id: ProviderId) => {
    switch (id) {
      case 'chatgpt':
        return 'var(--accent-chatgpt)';
      case 'gemini':
        return 'var(--accent-gemini)';
      case 'deepseek':
        return 'var(--accent-deepseek)';
      case 'claude':
        return 'var(--accent-claude)';
      default:
        return 'var(--text-primary)';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <span style={{ color: '#4ade80', fontSize: '10px', fontWeight: 700 }}>✔ COMPLETE</span>;
      case 'pending':
        return <span style={{ color: '#60a5fa', fontSize: '10px', fontWeight: 700 }}>⏳ IN PROGRESS</span>;
      case 'error':
        return <span style={{ color: '#ef4444', fontSize: '10px', fontWeight: 700 }}>❌ FAILED</span>;
      case 'skipped':
        return <span style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 700 }}>⏭ SKIPPED</span>;
      default:
        return null;
    }
  };

  if (consensusTurns && consensusTurns.length > 0) {
    return (
      <div className="debate-feed" style={{ overflowY: 'auto', flex: 1, padding: '12px' }}>
        {consensusTurns.map((turn) => (
          <div key={turn.turnNumber} className={`card ${turn.providerId}`} style={{ marginBottom: '12px' }}>
            <div
              className="card-header"
              style={{
                color: getProviderColor(turn.providerId),
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: '6px',
                marginBottom: '8px',
              }}
            >
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontWeight: 700 }}>TURN {turn.turnNumber}: {turn.providerId.toUpperCase()}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>({turn.role})</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {turn.durationMs > 0 && (
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {(turn.durationMs / 1000).toFixed(1)}s
                  </span>
                )}
                {getStatusBadge(turn.status)}
              </div>
            </div>
            <div className="card-body" style={{ fontSize: '12px', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
              {turn.status === 'pending' && (
                <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Awaiting response from {turn.providerId}...
                </div>
              )}
              {turn.status === 'error' && (
                <div style={{ color: '#ef4444' }}>
                  Error: {turn.error || 'Provider communication failed.'}
                </div>
              )}
              {turn.response && turn.response}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="debate-feed" style={{ overflowY: 'auto', flex: 1, padding: '12px' }}>
      {idea ? (
        <>
          <div className="card chatgpt" style={{ marginBottom: '12px' }}>
            <div className="card-header" style={{ color: 'var(--accent-chatgpt)', display: 'flex', justifyContent: 'space-between' }}>
              <span>TURN 1: CHATGPT (Lead Architect)</span>
              <span>{running ? 'Starting...' : 'Standing By'}</span>
            </div>
            <div className="card-body" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {running
                ? `Ready to generate architectural plan and system decomposition for: "${idea.slice(0, 80)}..."`
                : 'Click "Start Autonomous Pipeline" in Mission Control to begin cross-model debate.'}
            </div>
          </div>

          <div className="card gemini" style={{ marginBottom: '12px' }}>
            <div className="card-header" style={{ color: 'var(--accent-gemini)', display: 'flex', justifyContent: 'space-between' }}>
              <span>TURN 2: GEMINI (Feasibility Reviewer)</span>
              <span>Queued</span>
            </div>
            <div className="card-body" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Critiques proposed architecture, edge cases, and UI/UX feasibility risks.
            </div>
          </div>

          <div className="card deepseek" style={{ marginBottom: '12px' }}>
            <div className="card-header" style={{ color: 'var(--accent-deepseek)', display: 'flex', justifyContent: 'space-between' }}>
              <span>TURN 3: DEEPSEEK (Implementation Planner)</span>
              <span>Queued</span>
            </div>
            <div className="card-body" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Synthesizes plan into strict schema 1.0 Decision Packet with files, types, and test commands.
            </div>
          </div>

          <div className="card claude" style={{ marginBottom: '12px' }}>
            <div className="card-header" style={{ color: 'var(--accent-claude)', display: 'flex', justifyContent: 'space-between' }}>
              <span>TURN 4: CLAUDE (Safety Auditor - Quota Guard)</span>
              <span>Opt-In Only</span>
            </div>
            <div className="card-body" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Audits plan for security holes and subtle regressions without burning free quotas prematurely.
            </div>
          </div>
        </>
      ) : (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 20px', fontStyle: 'italic' }}>
          No active consensus session. Enter a project goal in Mission Control to begin.
        </div>
      )}
    </div>
  );
};
