import React from 'react';
import type { OrchestratorSessionState } from '../../../shared/types';

interface DiscussionStreamProps {
  session: OrchestratorSessionState;
}

export const DiscussionStream: React.FC<DiscussionStreamProps> = ({ session }) => {
  return (
    <div className="debate-feed">
      {session.idea ? (
        <>
          <div className="card chatgpt">
            <div className="card-header" style={{ color: 'var(--accent-chatgpt)' }}>
              <span>CHATGPT (Lead Architect)</span>
              <span>Awaiting Execution (Milestone 2)</span>
            </div>
            <div className="card-body">
              {session.running
                ? `Ready to generate architectural plan and system decomposition for: "${session.idea.slice(0, 80)}..."`
                : 'Enter your project goal above and launch the pipeline to start the multi-AI planning session.'}
            </div>
          </div>

          <div className="card gemini">
            <div className="card-header" style={{ color: 'var(--accent-gemini)' }}>
              <span>GEMINI (Feasibility & UX Reviewer)</span>
              <span>Turn 2</span>
            </div>
            <div className="card-body">
              Will critique ChatGPT proposed architecture, edge cases, and feasibility risks.
            </div>
          </div>

          <div className="card deepseek">
            <div className="card-header" style={{ color: 'var(--accent-deepseek)' }}>
              <span>DEEPSEEK (Code & Test Specialist)</span>
              <span>Turn 3</span>
            </div>
            <div className="card-body">
              Will scrutinize data structures, TypeScript types, and propose strict test runner commands.
            </div>
          </div>
        </>
      ) : (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 20px', fontStyle: 'italic' }}>
          No active discussion. Enter a project goal in Mission Control to begin.
        </div>
      )}
    </div>
  );
};
