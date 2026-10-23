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
  onRunApproved?: () => void;
  onApproveCorrection?: () => void;
  onRejectCorrection?: () => void;
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
  onRunApproved,
  onApproveCorrection,
  onRejectCorrection,
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
                  <div style={{ background: '#052e16', border: '1px solid #16a34a', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ color: '#4ade80', fontSize: '12.5px', fontWeight: 700 }}>
                        ✔ Decision Packet Approved by User
                      </div>
                      <div style={{ color: '#86efac', fontSize: '11px', marginTop: '2px' }}>
                        Ready for agent execution via <code>{session.cliTool.name}</code> in <code>{session.workspace}</code>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ background: '#16a34a', borderColor: '#22c55e', color: '#fff', fontSize: '11.5px', padding: '6px 14px' }}
                      onClick={onRunApproved}
                      disabled={session.running}
                    >
                      ⚡ Run Approved Tasks
                    </button>
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
          <div className="card" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 290px)' }}>
            {session.evidence ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ color: session.evidence.success ? '#4ade80' : '#ef4444', fontSize: '14px', fontWeight: 700 }}>
                    {session.evidence.success ? '✔ Execution Succeeded' : '✖ Execution Failed / Blocked'}
                  </h4>
                  <div style={{ display: 'flex', gap: '8px', fontSize: '11px' }}>
                    <span style={{ background: '#1e293b', padding: '2px 8px', borderRadius: '4px', color: '#cbd5e1' }}>
                      Exit Code: {session.evidence.exitCode}
                    </span>
                    <span style={{ background: '#1e293b', padding: '2px 8px', borderRadius: '4px', color: '#cbd5e1' }}>
                      Duration: {(session.evidence.durationMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                </div>

                {session.evidence.blockedReason && (
                  <div style={{ background: '#450a0a', border: '1px solid #dc2626', borderRadius: '6px', padding: '8px 12px', marginBottom: '12px', color: '#fca5a5', fontSize: '11.5px' }}>
                    <strong>BLOCKED REASON:</strong> {session.evidence.blockedReason}
                  </div>
                )}

                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>
                    Changed Files ({session.evidence.changedFiles.length}):
                  </div>
                  {session.evidence.changedFiles.length > 0 ? (
                    <ul style={{ paddingLeft: '18px', color: '#e2e8f0', fontSize: '12px' }}>
                      {session.evidence.changedFiles.map((f, i) => (
                        <li key={i}><code>{f}</code></li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontSize: '11.5px', fontStyle: 'italic' }}>
                      No workspace files were modified.
                    </div>
                  )}
                </div>

                {session.evidence.diffStat && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>
                      Git Diff Stat:
                    </div>
                    <pre style={{ background: '#070a0f', padding: '10px', borderRadius: '6px', color: '#cbd5e1', fontSize: '11px', overflowX: 'auto' }}>
                      {session.evidence.diffStat}
                    </pre>
                  </div>
                )}

                {session.evidence.fullLogPath && (
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                    Execution Log: <code>{session.evidence.fullLogPath}</code>
                  </div>
                )}

                {session.evidence.stdoutTail && (
                  <div>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>
                      Output Stream Tail:
                    </div>
                    <pre style={{ background: '#070a0f', padding: '10px', borderRadius: '6px', color: '#4ade80', fontSize: '11px', overflowX: 'auto', maxHeight: '180px' }}>
                      {session.evidence.stdoutTail}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: '24px', textAlign: 'center' }}>
                Real execution evidence (exit code, test outputs, git diff) will appear after task execution.
              </div>
            )}
          </div>
        )}

        {activeTab === 'review' && (
          <div className="card" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 290px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
              <div>
                <h3 style={{ fontSize: '15px', color: '#f8fafc', fontWeight: 700 }}>
                  Autonomous Closed-Loop Review Engine
                </h3>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Stage: <span className={`stage-badge ${session.stage}`}>{session.stage.replace(/_/g, ' ')}</span> | Iteration: <strong style={{ color: '#38bdf8' }}>{session.reviewIteration}</strong> / {session.maxRetries || 3}
                </div>
              </div>
              {session.finalReportPath && (
                <div style={{ fontSize: '10.5px', color: '#a78bfa' }}>
                  Audit Report: <code>{session.finalReportPath.split(/[/\\]/).pop()}</code>
                </div>
              )}
            </div>

            {/* Awaiting Correction Approval Card */}
            {session.stage === 'awaiting_correction_approval' && session.correctionProposal && (
              <div style={{ background: '#1c1917', border: '1px solid #f59e0b', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h4 style={{ color: '#fbbf24', fontSize: '13px', fontWeight: 700 }}>
                      ⚠️ User Approval Required: Correction Iteration {session.correctionProposal.iteration}
                    </h4>
                    <p style={{ color: '#cbd5e1', fontSize: '12px', marginTop: '4px', lineHeight: 1.5 }}>
                      {session.correctionProposal.explanation}
                    </p>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
                      Target Scope: <code>{session.correctionProposal.proposedPacket.tasks.flatMap((t) => t.files).join(', ') || 'N/A'}</code>
                    </div>
                    {session.correctionProposal.expectedVerification && (
                      <div style={{ fontSize: '11px', color: '#86efac', marginTop: '4px' }}>
                        Verification Check: <code>{session.correctionProposal.expectedVerification}</code>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '180px' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ background: '#16a34a', borderColor: '#22c55e', color: '#fff', fontSize: '11px', padding: '6px 12px' }}
                      onClick={onApproveCorrection}
                      disabled={session.running}
                    >
                      ✔ Approve & Execute Fix
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ fontSize: '11px', padding: '6px 12px' }}
                      onClick={onRejectCorrection}
                      disabled={session.running}
                    >
                      ✖ Decline / Stop Loop
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Review Consensus Card */}
            {session.reviewConsensus ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        padding: '3px 10px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        background:
                          session.reviewConsensus.verdict === 'PASS'
                            ? '#052e16'
                            : session.reviewConsensus.verdict === 'BLOCKED'
                            ? '#450a0a'
                            : '#451a03',
                        color:
                          session.reviewConsensus.verdict === 'PASS'
                            ? '#4ade80'
                            : session.reviewConsensus.verdict === 'BLOCKED'
                            ? '#f87171'
                            : '#fbbf24',
                        border: `1px solid ${
                          session.reviewConsensus.verdict === 'PASS'
                            ? '#16a34a'
                            : session.reviewConsensus.verdict === 'BLOCKED'
                            ? '#dc2626'
                            : '#d97706'
                        }`,
                      }}
                    >
                      {!session.reviewConsensus.quorumReached
                        ? 'INSUFFICIENT QUORUM'
                        : session.reviewConsensus.participatingProviders.length === 1
                        ? `SINGLE-PROVIDER: ${session.reviewConsensus.verdict}`
                        : `MULTI-AI CONSENSUS: ${session.reviewConsensus.verdict}`}
                    </span>
                    <span style={{ fontSize: '12px', color: '#e2e8f0', fontWeight: 600 }}>
                      {session.reviewConsensus.summary}
                    </span>
                  </div>
                  <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                    Risk: <strong style={{ color: session.reviewConsensus.riskLevel === 'critical' ? '#f87171' : '#38bdf8' }}>{session.reviewConsensus.riskLevel.toUpperCase()}</strong>
                  </span>
                </div>

                <div style={{ background: '#0a0d12', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-subtle)', marginBottom: '14px', fontSize: '11.5px', color: '#94a3b8' }}>
                  <div><strong>Review Evaluation:</strong> {session.reviewConsensus.rationale}</div>
                  {session.reviewConsensus.failedProviders && session.reviewConsensus.failedProviders.length > 0 && (
                    <div style={{ marginTop: '6px', color: '#f87171', fontSize: '11px' }}>
                      <strong>Unavailable / Excluded Reviewers:</strong> {session.reviewConsensus.failedProviders.join(', ')} (login required or session unready)
                    </div>
                  )}
                </div>

                {/* Review Findings List */}
                <h4 style={{ color: 'var(--accent-antigravity)', fontSize: '11px', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>
                  Review Findings ({session.reviewConsensus.findings.length}):
                </h4>
                {session.reviewConsensus.findings.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                    {session.reviewConsensus.findings.map((f, i) => (
                      <div
                        key={i}
                        style={{
                          background: '#070a0f',
                          border: `1px solid ${
                            f.severity === 'critical'
                              ? '#dc2626'
                              : f.severity === 'high'
                              ? '#ea580c'
                              : f.severity === 'medium'
                              ? '#d97706'
                              : 'var(--border-subtle)'
                          }`,
                          borderRadius: '6px',
                          padding: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: f.severity === 'critical' ? '#f87171' : f.severity === 'high' ? '#fb923c' : '#facc15' }}>
                            [{f.severity.toUpperCase()}] {f.id}
                          </span>
                          {f.reproducible && (
                            <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>
                              reproducible
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: '12px', color: '#e2e8f0', marginBottom: '6px' }}>{f.description}</p>
                        <div style={{ fontSize: '11px', color: '#86efac' }}>
                          <strong>Recommended Action:</strong> {f.recommendedAction}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: '#4ade80', fontSize: '12px', fontStyle: 'italic', marginBottom: '16px' }}>
                    ✔ No defects or findings identified. All checks verified clean.
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: '24px', textAlign: 'center' }}>
                Multi-AI review verdicts and findings will be generated automatically after execution.
              </div>
            )}

            {/* Iteration History Table */}
            {session.iterationHistory && session.iterationHistory.length > 0 && (
              <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                <h4 style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Iteration History:
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {session.iterationHistory.map((it, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: '#090d14',
                        padding: '6px 10px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <span style={{ color: '#cbd5e1' }}>
                        Iteration {it.iteration}
                      </span>
                      <span style={{ color: it.consensus.verdict === 'PASS' ? '#4ade80' : it.consensus.verdict === 'BLOCKED' ? '#f87171' : '#fbbf24' }}>
                        {it.consensus.verdict}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                        Exit: {it.evidence.exitCode} ({(it.evidence.durationMs / 1000).toFixed(1)}s)
                      </span>
                    </div>
                  ))}
                </div>
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
