import React from 'react';
import type { OrchestratorSessionState, ProviderId } from '../../../shared/types';

interface TitlebarProps {
  session: OrchestratorSessionState;
  onOpenLogin?: (id: ProviderId) => void;
}

export const Titlebar: React.FC<TitlebarProps> = ({ session, onOpenLogin }) => {
  const { providerStates, cliTool } = session;

  const getStatusTitle = (id: ProviderId, name: string) => {
    const st = providerStates[id];
    return `${name}: ${st.status.replace('_', ' ').toUpperCase()}${st.lastMessage ? ` - ${st.lastMessage}` : ''} (Click to open session window)`;
  };

  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <span className="icon">⚡</span> Multi-AI Autonomous Development Controller (Desktop)
      </div>

      <div className="model-status-strip">
        <div
          className={`model-pill status-${providerStates.chatgpt.status}`}
          onClick={() => onOpenLogin?.('chatgpt')}
          title={getStatusTitle('chatgpt', 'ChatGPT')}
        >
          <span className="dot"></span> ChatGPT
        </div>
        <div
          className={`model-pill status-${providerStates.gemini.status}`}
          onClick={() => onOpenLogin?.('gemini')}
          title={getStatusTitle('gemini', 'Gemini')}
        >
          <span className="dot"></span> Gemini
        </div>
        <div
          className={`model-pill status-${providerStates.deepseek.status}`}
          onClick={() => onOpenLogin?.('deepseek')}
          title={getStatusTitle('deepseek', 'DeepSeek')}
        >
          <span className="dot"></span> DeepSeek
        </div>
        <div
          className={`model-pill status-${providerStates.claude.status}`}
          onClick={() => onOpenLogin?.('claude')}
          title={getStatusTitle('claude', 'Claude (Quota Guard)')}
        >
          <span className="dot"></span> Claude
        </div>
        <div className={`model-pill ${cliTool.available ? 'active' : ''}`} title={`Agent CLI: ${cliTool.name} (v${cliTool.version})`}>
          <span className="dot"></span> CLI: {cliTool.name} {cliTool.available ? `(${cliTool.version})` : '(Missing)'}
        </div>
      </div>
    </header>
  );
};
