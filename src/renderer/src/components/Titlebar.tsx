import React from 'react';
import type { OrchestratorSessionState } from '../../../shared/types';

interface TitlebarProps {
  session: OrchestratorSessionState;
}

export const Titlebar: React.FC<TitlebarProps> = ({ session }) => {
  const { providerStates, cliTool } = session;

  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <span className="icon">⚡</span> Multi-AI Autonomous Development Controller (Desktop)
      </div>

      <div className="model-status-strip">
        <div className={`model-pill ${providerStates.chatgpt.enabled ? 'active' : ''}`} title="ChatGPT Session">
          <span className="dot"></span> ChatGPT
        </div>
        <div className={`model-pill ${providerStates.gemini.enabled ? 'active' : ''}`} title="Gemini Session">
          <span className="dot"></span> Gemini
        </div>
        <div className={`model-pill ${providerStates.deepseek.enabled ? 'active' : ''}`} title="DeepSeek Session">
          <span className="dot"></span> DeepSeek
        </div>
        <div className={`model-pill ${providerStates.claude.enabled ? 'active' : ''}`} title="Claude Session (Opt-In / Quota Guard)">
          <span className="dot"></span> Claude
        </div>
        <div className={`model-pill ${cliTool.available ? 'active' : ''}`} title={`Agent CLI: ${cliTool.name} (v${cliTool.version})`}>
          <span className="dot"></span> CLI: {cliTool.name} {cliTool.available ? `(${cliTool.version})` : '(Missing)'}
        </div>
      </div>
    </header>
  );
};
