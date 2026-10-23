import React, { useState, useRef, useEffect } from 'react';
import type { OrchestratorSessionState, ProviderId } from '../../../shared/types';

interface ExecutionPanelProps {
  session: OrchestratorSessionState;
  logs: string;
  onClearLogs: () => void;
  onOpenLogin?: (id: ProviderId) => void;
  onCheckStatus?: (id: ProviderId) => void;
  onApprovePacket?: () => void;
  onRejectPacket?: () => void;
}

type TabKey = 'decision' | 'evidence' | 'review' | 'terminal';

export const ExecutionPanel: React.FC<ExecutionPanelProps> = ({
  session,
  logs,
  onClearLogs,
  onOpenLogin,
  onCheckStatus,
  onApprovePacket,
  onRejectPacket,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('terminal');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  return (
    <section className="execution-column">
      <nav className="nav-tabs">
        <div
          className={`nav-tab ${activeTab === 'decision' ? 'active' : ''}`}
          onClick={() => setActiveTab('decision')}
        >
          📋 Decision Packet
        </div>
        <div
          className={`nav-tab ${activeTab === 'evidence' ? 'active' : ''}`}
          onClick={() => setActiveTab('evidence')}
        >
          🧪 Verification Evidence
        </div>
        <div
          className={`nav-tab ${activeTab === 'review' ? 'active' : ''}`}
          onClick={() => setActiveTab('review')}
        >
          🔍 AI Review Loop
        </div>
        <div
          className={`nav-tab ${activeTab === 'terminal' ? 'active' : ''}`}
          onClick={() => setActiveTab('terminal')}
        >
          💻 Real-Time Terminal
        </div>
      </nav>

      <div className="tab-content">
        {activeTab === 'decision' && (
          <div className="card antigravity" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 290px)' }}>
            {session.decisionPacket ? (
              <>
                {session.stage === 'awaiting_confirmation' && (
                  <div style={{ background: '#1c1917', border: '1px solid #eab308', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h4 style={{ color: '#facc15', fontSize: '13px', fontWeight: 700 }}>
                          ⚠️ User Approval Checkpoint Required (Milestone 3 Exit Gate)
                        </h4>
                        <p style={{ color: '#cbd5e1', fontSize: '12px', marginTop: '4px' }}>
                          Cross-model consensus complete. Review the agreed tasks below before approving.
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ background: '#16a34a', borderColor: '#22c55e', color: '#fff', fontSize: '11px', padding: '6px 12px' }}
                          onClick={onApprovePacket}
                        >
                          ✔ Approve Decision Packet
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ fontSize: '11px', padding: '6px 12px' }}
                          onClick={onRejectPacket}
                        >
                          ✖ Reject / Revise
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {session.decisionPacket.approvedByUser && (
                  <div style={{ background: '#052e16', border: '1px solid #16a34a', borderRadius: '6px', padding: '8px 12px', marginBottom: '14px', color: '#4ade80', fontSize: '12px' }}>
                    ✔ <strong>Decision Packet Approved by User.</strong> (Milestone 3 Exit Gate: Local CLI execution remains paused until Milestone 4).
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                  <h3 style={{ fontSize: '16px', color: '#f8fafc' }}>
                    # {session.decisionPacket.title}
                  </h3>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    Schema v{session.decisionPacket.version}
                  </span>
                </div>

                <p style={{ color: 'var(--text-secondary)', marginBottom: '14px', fontSize: '12.5px', lineHeight: 1.5 }}>
                  {session.decisionPacket.summary}
                </p>

                <h4 style={{ color: 'var(--accent-antigravity)', fontSize: '11px', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.5px' }}>
                  Agreed Architectural Decisions:
                </h4>
                <ul style={{ paddingLeft: '18px', marginBottom: '14px', color: '#e2e8f0', fontSize: '12px', lineHeight: 1.5 }}>
                  {session.decisionPacket.decisions.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>

                <h4 style={{ color: 'var(--accent-antigravity)', fontSize: '11px', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.5px' }}>
                  Implementation Tasks:
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                  {session.decisionPacket.tasks.map((t) => (
                    <div key={t.id} style={{ background: '#0a0d12', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <strong style={{ color: '#60a5fa', fontSize: '12px' }}>[{t.id}] {t.title}</strong>
                        {t.testCommand && (
                          <span style={{ background: '#1e293b', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontFamily: 'monospace', color: '#cbd5e1' }}>
                            {t.testCommand}
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: '11.5px', color: '#94a3b8', marginBottom: '4px' }}>{t.description}</p>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                        Target files: <code>{t.files.join(', ')}</code>
                      </div>
                    </div>
                  ))}
                </div>

                {session.decisionPacket.criteria && session.decisionPacket.criteria.length > 0 && (
                  <>
                    <h4 style={{ color: 'var(--accent-antigravity)', fontSize: '11px', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.5px' }}>
                      Acceptance Criteria:
                    </h4>
                    <ul style={{ paddingLeft: '18px', marginBottom: '14px', color: '#e2e8f0', fontSize: '12px', lineHeight: 1.5 }}>
                      {session.decisionPacket.criteria.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </>
                )}

                {session.decisionPacket.unresolvedRisks && session.decisionPacket.unresolvedRisks.length > 0 && (
                  <>
                    <h4 style={{ color: '#f87171', fontSize: '11px', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.5px' }}>
                      Unresolved Risks & Notes:
                    </h4>
                    <ul style={{ paddingLeft: '18px', marginBottom: '14px', color: '#fca5a5', fontSize: '12px', lineHeight: 1.5 }}>
                      {session.decisionPacket.unresolvedRisks.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: '24px', textAlign: 'center' }}>
                Decision Packet will be synthesized automatically after Multi-AI planning consensus.
              </div>
            )}
          </div>
        )}

        {activeTab === 'evidence' && (
          <div className="card">
            {session.evidence ? (
              <div>
                <h4 style={{ color: '#60a5fa', marginBottom: '8px' }}>Execution Evidence</h4>
                <div>Status: {session.evidence.success ? '✅ Succeeded' : '❌ Failed'} (Exit Code: {session.evidence.exitCode})</div>
                <div style={{ marginTop: '8px' }}>Changed Files: {session.evidence.changedFiles.join(', ') || 'None'}</div>
                <pre style={{ marginTop: '10px', background: '#070a0f', padding: '10px', borderRadius: '6px', color: '#cbd5e1' }}>
                  {session.evidence.stdoutTail}
                </pre>
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: '24px', textAlign: 'center' }}>
                Real execution evidence (exit code, test outputs, git diff) will appear after Antigravity execution.
              </div>
            )}
          </div>
        )}

        {activeTab === 'review' && (
          <div className="card">
            {session.reviewVerdict ? (
              <div>
                <h4 style={{ color: session.reviewVerdict.approved ? '#22c55e' : '#ef4444' }}>
                  AI Review Verdict: {session.reviewVerdict.approved ? 'APPROVED' : 'REVISION REQUIRED'}
                </h4>
                <p style={{ marginTop: '8px', color: '#cbd5e1' }}>{session.reviewVerdict.summary}</p>
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: '24px', textAlign: 'center' }}>
                AI verification results and acceptance verdicts will appear here.
              </div>
            )}
          </div>
        )}

        {activeTab === 'terminal' && (
          <div className="terminal">
            <div className="terminal-bar">
              <span>CONTROLLER PROCESS STREAM</span>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                  />
                  Auto-scroll
                </label>
                <button
                  type="button"
                  style={{ background: '#181e28', border: '1px solid #242c38', color: '#cbd5e1', padding: '1px 6px', borderRadius: '4px', cursor: 'pointer' }}
                  onClick={onClearLogs}
                >
                  Clear
                </button>
              </div>
            </div>
            <pre className="terminal-body">
              {logs || '// Multi-AI Autonomous Development Controller initialized.\n// Standing by for user mission...'}
              <div ref={terminalEndRef} />
            </pre>
          </div>
        )}
      </div>

      {/* Embedded Session Status Drawer */}
      <footer className="webview-drawer">
        <div className="drawer-bar">
          <span>EMBEDDED AI SESSIONS (PERSISTENT ISOLATED PARTITIONS)</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Zero-Paid-API Webview Container</span>
        </div>
        <div className="webview-previews">
          {/* Provider 1: ChatGPT */}
          <div className="webview-slot">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <strong style={{ color: 'var(--accent-chatgpt)' }}>ChatGPT</strong>
              <span className={`badge-session status-${session.providerStates.chatgpt.status}`}>
                {session.providerStates.chatgpt.status.replace(/_/g, ' ')}
              </span>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              Partition: persist:ai-provider-chatgpt
            </div>
            <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '10px', padding: '3px 6px', flex: 1 }}
                onClick={() => onOpenLogin?.('chatgpt')}
              >
                🖥 Show / Login
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '10px', padding: '3px 6px' }}
                onClick={() => onCheckStatus?.('chatgpt')}
                title="Probe DOM status"
              >
                🔄
              </button>
            </div>
          </div>

          {/* Provider 2: Gemini */}
          <div className="webview-slot">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <strong style={{ color: 'var(--accent-gemini)' }}>Gemini</strong>
              <span className={`badge-session status-${session.providerStates.gemini.status}`}>
                {session.providerStates.gemini.status.replace(/_/g, ' ')}
              </span>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              Partition: persist:ai-provider-gemini
            </div>
            <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '10px', padding: '3px 6px', flex: 1 }}
                onClick={() => onOpenLogin?.('gemini')}
              >
                🖥 Show / Login
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '10px', padding: '3px 6px' }}
                onClick={() => onCheckStatus?.('gemini')}
                title="Probe DOM status"
              >
                🔄
              </button>
            </div>
          </div>

          {/* Provider 3: DeepSeek */}
          <div className="webview-slot">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <strong style={{ color: 'var(--accent-deepseek)' }}>DeepSeek</strong>
              <span className={`badge-session status-${session.providerStates.deepseek.status}`}>
                {session.providerStates.deepseek.status.replace(/_/g, ' ')}
              </span>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              Partition: persist:ai-provider-deepseek
            </div>
            <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '10px', padding: '3px 6px', flex: 1 }}
                onClick={() => onOpenLogin?.('deepseek')}
              >
                🖥 Show / Login
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '10px', padding: '3px 6px' }}
                onClick={() => onCheckStatus?.('deepseek')}
                title="Probe DOM status"
              >
                🔄
              </button>
            </div>
          </div>

          {/* Provider 4: Claude */}
          <div className="webview-slot">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <strong style={{ color: 'var(--accent-claude)' }}>Claude</strong>
              <span className={`badge-session status-${session.providerStates.claude.status}`}>
                {session.providerStates.claude.status.replace(/_/g, ' ')}
              </span>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              ⚡ Quota Guard Enabled
            </div>
            <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '10px', padding: '3px 6px', flex: 1 }}
                onClick={() => onOpenLogin?.('claude')}
              >
                🖥 Show / Login
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '10px', padding: '3px 6px' }}
                onClick={() => onCheckStatus?.('claude')}
                title="Probe DOM status"
              >
                🔄
              </button>
            </div>
          </div>
        </div>
      </footer>
    </section>
  );
};
