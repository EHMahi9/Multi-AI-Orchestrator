import React from 'react';
import { Logo } from './Logo';
import type { OrchestratorSessionState, ProviderId } from '../../../shared/types';

interface TitlebarProps {
  session: OrchestratorSessionState;
  onOpenLogin?: (id: ProviderId) => void;
  onClearSession?: (id: ProviderId) => void;
  onToggleShowcase?: () => void;
}

export const Titlebar: React.FC<TitlebarProps> = ({ session, onOpenLogin, onClearSession, onToggleShowcase }) => {
  const { providerStates, cliTool } = session;

  const getStatusTitle = (id: ProviderId, name: string) => {
    const st = providerStates[id];
    return `${name}: ${st.status.replace('_', ' ').toUpperCase()}${st.lastMessage ? ` - ${st.lastMessage}` : ''}\n• Left-click to open session window\n• Right-click to reset & clear cookies`;
  };

  const handleContextMenu = (e: React.MouseEvent, id: ProviderId, name: string) => {
    e.preventDefault();
    if (window.confirm(`Clear session and reset cookies for ${name}? This will allow you to sign in with a new account.`)) {
      onClearSession?.(id);
    }
  };

  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <Logo size={22} />
        <span>Multi-AI Autonomous Development Controller</span>
      </div>

      <div className="model-status-strip">
        <div
          className={`model-pill status-${providerStates.chatgpt.status}`}
          onClick={() => onOpenLogin?.('chatgpt')}
          onContextMenu={(e) => handleContextMenu(e, 'chatgpt', 'ChatGPT')}
          title={getStatusTitle('chatgpt', 'ChatGPT')}
        >
          <span className="dot"></span> ChatGPT
        </div>
        <div
          className={`model-pill status-${providerStates.gemini.status}`}
          onClick={() => onOpenLogin?.('gemini')}
          onContextMenu={(e) => handleContextMenu(e, 'gemini', 'Gemini')}
          title={getStatusTitle('gemini', 'Gemini')}
        >
          <span className="dot"></span> Gemini
        </div>
        <div
          className={`model-pill status-${providerStates.deepseek.status}`}
          onClick={() => onOpenLogin?.('deepseek')}
          onContextMenu={(e) => handleContextMenu(e, 'deepseek', 'DeepSeek')}
          title={getStatusTitle('deepseek', 'DeepSeek')}
        >
          <span className="dot"></span> DeepSeek
        </div>
        <div
          className={`model-pill status-${providerStates.claude.status}`}
          onClick={() => onOpenLogin?.('claude')}
          onContextMenu={(e) => handleContextMenu(e, 'claude', 'Claude')}
          title={getStatusTitle('claude', 'Claude (Quota Guard)')}
        >
          <span className="dot"></span> Claude
        </div>
        <div className={`model-pill ${cliTool.available ? 'active' : ''}`} title={`Agent CLI: ${cliTool.name} (v${cliTool.version})`}>
          <span className="dot"></span> CLI: {cliTool.name} {cliTool.available ? `(${cliTool.version})` : '(Missing)'}
        </div>
        <div
          className={`model-pill ${session.showcaseMode ? 'active' : ''}`}
          style={{
            cursor: 'pointer',
            borderColor: session.showcaseMode ? '#eab308' : 'var(--border-subtle)',
            background: session.showcaseMode ? 'rgba(234, 179, 8, 0.15)' : 'transparent',
            color: session.showcaseMode ? '#facc15' : 'var(--text-secondary)',
          }}
          onClick={onToggleShowcase}
          title="Click to toggle SQAT Summit High-Speed Showcase Mode"
        >
          <span className="dot" style={{ background: session.showcaseMode ? '#facc15' : 'var(--text-muted)' }}></span>
          {session.showcaseMode ? '⚡ SQAT SHOWCASE: ACTIVE' : '⚡ Showcase Mode'}
        </div>
      </div>
    </header>
  );
};
