import React, { useState, useRef, useEffect } from 'react';
import type { OrchestratorSessionState } from '../../../shared/types';

interface ExecutionPanelProps {
  session: OrchestratorSessionState;
  logs: string;
  onClearLogs: () => void;
}

type TabKey = 'decision' | 'evidence' | 'review' | 'terminal';

export const ExecutionPanel: React.FC<ExecutionPanelProps> = ({ session, logs, onClearLogs }) => {
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
          <div className="card antigravity">
            {session.decisionPacket ? (
              <>
                <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>
                  # DECISION PACKET: {session.decisionPacket.title}
                </h3>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '12px' }}>
                  {session.decisionPacket.summary}
                </p>
                <h4 style={{ color: 'var(--accent-antigravity)', fontSize: '11px', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Agreed Architecture:
                </h4>
                <ul style={{ paddingLeft: '18px', marginBottom: '12px', color: '#e2e8f0' }}>
                  {session.decisionPacket.decisions.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
                <h4 style={{ color: 'var(--accent-antigravity)', fontSize: '11px', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Implementation Tasks:
                </h4>
                <ul style={{ paddingLeft: '18px', marginBottom: '12px', color: '#e2e8f0' }}>
                  {session.decisionPacket.tasks.map((t) => (
                    <li key={t.id}>
                      <strong>{t.title}</strong> (Files: {t.files.join(', ')})
                    </li>
                  ))}
                </ul>
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
          <span>EMBEDDED AI SESSIONS (PERSISTENT PARTITIONS)</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Storage: persist:multi-ai-session</span>
        </div>
        <div className="webview-previews">
          <div className="webview-slot">
            <span>ChatGPT Session</span>
            <span className="badge-session">Ready (Milestone 2)</span>
          </div>
          <div className="webview-slot">
            <span>Gemini Session</span>
            <span className="badge-session">Ready (Milestone 2)</span>
          </div>
          <div className="webview-slot">
            <span>DeepSeek Session</span>
            <span className="badge-session">Ready (Milestone 2)</span>
          </div>
          <div className="webview-slot">
            <span>Claude Session</span>
            <span className="badge-session" style={{ color: 'var(--accent-claude)' }}>Opt-In (Milestone 2)</span>
          </div>
        </div>
      </footer>
    </section>
  );
};
