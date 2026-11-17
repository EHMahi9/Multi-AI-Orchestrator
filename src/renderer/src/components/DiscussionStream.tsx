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
        return <span style={{ color: 'var(--accent-success)', fontSize: '10px', fontWeight: 700 }}>COMPLETE</span>;
      case 'pending':
        return <span style={{ color: 'var(--border-active)', fontSize: '10px', fontWeight: 700 }}>IN PROGRESS</span>;
      case 'error':
        return <span style={{ color: 'var(--accent-error)', fontSize: '10px', fontWeight: 700 }}>FAILED</span>;
      case 'skipped':
        return <span style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 700 }}>SKIPPED</span>;
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

  const activeProviders = (Object.keys(session.selectedProviders) as ProviderId[]).filter(
    (id) => session.selectedProviders[id]
  );
  let starter = session.startingProvider;
  if (!starter || !session.selectedProviders[starter]) {
    starter = activeProviders[0] || 'gemini';
  }
  const orderedPreview: ProviderId[] = [
    starter,
    ...activeProviders.filter((id) => id !== starter),
  ];

  const providerNames: Record<ProviderId, string> = {
    chatgpt: 'ChatGPT',
    gemini: 'Gemini',
    deepseek: 'DeepSeek',
    claude: 'Claude',
  };

  return (
    <div className="debate-feed" style={{ overflowY: 'auto', flex: 1, padding: '12px' }}>
      {idea ? (
        <>
          {orderedPreview.map((id, index) => {
            const turnNum = index + 1;
            const isLead = index === 0;
            const isLast = index === orderedPreview.length - 1;
            const role =
              orderedPreview.length === 1
                ? 'Autonomous Architect & Synthesizer'
                : isLead
                ? 'Lead Architect'
                : isLast
                ? 'Implementation Synthesizer'
                : 'Collaborative Reviewer';

            const description =
              orderedPreview.length === 1
                ? 'Will generate solution architecture, modular breakdown, and synthesize schema 1.0 Decision Packet.'
                : isLead
                ? running
                  ? `Ready to generate architectural plan and system decomposition for: "${idea.slice(0, 80)}..."`
                  : 'Will propose solution architecture, modular breakdown, and decisions.'
                : isLast
                ? 'Will synthesize peer discussion into concrete tasks and schema 1.0 Decision Packet.'
                : 'Will review preceding proposal, critique feasibility, and contribute enhancements.';

            return (
              <div key={id} className={`card ${id}`} style={{ marginBottom: '12px' }}>
                <div
                  className="card-header"
                  style={{ color: getProviderColor(id), display: 'flex', justifyContent: 'space-between' }}
                >
                  <span>
                    TURN {turnNum}: {providerNames[id].toUpperCase()} ({role})
                  </span>
                  <span>{isLead && running ? 'Starting...' : isLead ? 'Standing By' : 'Queued'}</span>
                </div>
                <div className="card-body" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {description}
                </div>
              </div>
            );
          })}
        </>
      ) : (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 20px', fontStyle: 'italic' }}>
          No active consensus session. Enter a project goal in Mission Control to begin.
        </div>
      )}
    </div>
  );
};
