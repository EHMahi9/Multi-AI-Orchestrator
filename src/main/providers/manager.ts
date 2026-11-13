import type { BrowserWindow } from 'electron';
import type { BaseProviderAdapter } from './base';
import { ChatGPTAdapter } from './chatgpt';
import { GeminiAdapter } from './gemini';
import { DeepSeekAdapter } from './deepseek';
import { ClaudeAdapter } from './claude';
import { SHOWCASE_TURNS, SHOWCASE_DECISION_PACKET, SHOWCASE_STRUCTURED_REVIEW } from './showcase-data';
import type { ProviderId, ProviderState, ProviderStatusType } from '../../shared/types';

export class ProviderSessionManager {
  private providers: Map<ProviderId, BaseProviderAdapter> = new Map();
  private mainWindow: BrowserWindow | null = null;
  private showcaseMode: boolean =
    process.env.SHOWCASE_MODE === 'true' ||
    process.env.SHOWCASE_MODE === '1' ||
    (typeof process !== 'undefined' && process.argv && process.argv.includes('--showcase'));

  constructor() {
    // Provider 1: ChatGPT (Lead Architect)
    const chatgpt = new ChatGPTAdapter();
    this.registerProvider(chatgpt);

    // Provider 2: Gemini (Feasibility & UX Reviewer)
    const gemini = new GeminiAdapter();
    this.registerProvider(gemini);

    // Provider 3: DeepSeek (Code Spec Specialist)
    const deepseek = new DeepSeekAdapter();
    this.registerProvider(deepseek);

    // Provider 4: Claude (Strict Quota Guard / Auditor)
    const claude = new ClaudeAdapter();
    this.registerProvider(claude);
  }

  public setShowcaseMode(enabled: boolean): void {
    this.showcaseMode = enabled;
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      for (const id of ['chatgpt', 'gemini', 'deepseek', 'claude'] as ProviderId[]) {
        this.broadcastProviderState(this.getStatus(id));
      }
    }
  }

  public isShowcaseMode(): boolean {
    return this.showcaseMode;
  }

  public setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win;
  }

  private registerProvider(adapter: BaseProviderAdapter): void {
    this.providers.set(adapter.id, adapter);

    adapter.onStatusChanged((state) => {
      if (!this.showcaseMode) {
        this.broadcastProviderState(state);
      }
    });
  }

  public broadcastProviderState(state: ProviderState): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('provider:status-changed', state);
    }
  }

  public getProvider(id: ProviderId): BaseProviderAdapter | undefined {
    return this.providers.get(id);
  }

  public getStatus(id: ProviderId): ProviderState {
    const names: Record<ProviderId, string> = {
      chatgpt: 'ChatGPT (Architect)',
      gemini: 'Gemini (Feasibility)',
      deepseek: 'DeepSeek (Code Spec)',
      claude: 'Claude (Auditor)',
    };

    if (this.showcaseMode) {
      return {
        id,
        name: names[id] || id.toUpperCase(),
        enabled: true,
        status: 'ready',
        quotaProtected: id === 'claude',
        lastMessage: 'SQAT Showcase Mode: Ready (Zero-latency failover active)',
      };
    }

    const provider = this.providers.get(id);
    if (!provider) {
      return {
        id,
        name: id.toUpperCase(),
        enabled: false,
        status: 'not_configured',
        quotaProtected: id === 'claude',
        lastMessage: 'Provider not registered.',
      };
    }
    return provider.getState();
  }

  public async openLogin(id: ProviderId): Promise<boolean> {
    if (this.showcaseMode) {
      return true;
    }
    const provider = this.providers.get(id);
    if (!provider) {
      console.warn(`[ProviderManager] Provider "${id}" not yet implemented in this incremental stage.`);
      return false;
    }
    await provider.showWindow();
    return true;
  }

  public async clearSession(id: ProviderId): Promise<boolean> {
    if (this.showcaseMode) {
      return true;
    }
    const provider = this.providers.get(id);
    if (!provider) {
      return false;
    }
    await provider.clearSession();
    return true;
  }

  public async checkStatus(id: ProviderId): Promise<ProviderState> {
    if (this.showcaseMode) {
      return this.getStatus(id);
    }
    const provider = this.providers.get(id);
    if (!provider) {
      return {
        id,
        name: id.toUpperCase(),
        enabled: false,
        status: 'not_configured',
        quotaProtected: id === 'claude',
        lastMessage: 'Provider integration pending in Milestone 2 incremental sequence.',
      };
    }
    await provider.checkStatus();
    return provider.getState();
  }

  public async sendPrompt(
    id: ProviderId,
    prompt: string
  ): Promise<{ ok: boolean; response?: string; error?: string }> {
    if (this.showcaseMode) {
      // Realistic autonomous response timing for stage presentation
      await new Promise((resolve) => setTimeout(resolve, 1400));

      // Handle Review Loop prompt
      if (
        prompt.includes('COLLECTED EXECUTION EVIDENCE') ||
        prompt.includes('AI Peer Reviewer') ||
        prompt.includes('evaluate the evidence')
      ) {
        return {
          ok: true,
          response: '```json\n' + JSON.stringify(SHOWCASE_STRUCTURED_REVIEW, null, 2) + '\n```',
        };
      }

      // Handle Turn prompts from showcase data
      const matchedTurn = SHOWCASE_TURNS.find((t) => t.providerId === id);
      if (matchedTurn) {
        return {
          ok: true,
          response: matchedTurn.content,
        };
      }

      // Fallback valid schema response
      return {
        ok: true,
        response: '```json\n' + JSON.stringify(SHOWCASE_DECISION_PACKET, null, 2) + '\n```',
      };
    }

    const provider = this.providers.get(id);
    if (!provider) {
      return {
        ok: false,
        error: `Provider "${id}" is not yet enabled.`,
      };
    }
    return await provider.sendPrompt(prompt);
  }

  public getAllStates(): Record<ProviderId, ProviderState> {
    if (this.showcaseMode) {
      return {
        chatgpt: this.getStatus('chatgpt'),
        gemini: this.getStatus('gemini'),
        deepseek: this.getStatus('deepseek'),
        claude: this.getStatus('claude'),
      };
    }

    const defaultStates: Record<ProviderId, ProviderState> = {
      chatgpt: this.providers.get('chatgpt')?.getState() || {
        id: 'chatgpt',
        name: 'ChatGPT (Architect)',
        enabled: true,
        status: 'not_configured',
        quotaProtected: false,
      },
      gemini: this.providers.get('gemini')?.getState() || {
        id: 'gemini',
        name: 'Gemini (Feasibility)',
        enabled: true,
        status: 'not_configured',
        quotaProtected: false,
      },
      deepseek: this.providers.get('deepseek')?.getState() || {
        id: 'deepseek',
        name: 'DeepSeek (Code Spec)',
        enabled: true,
        status: 'not_configured',
        quotaProtected: false,
      },
      claude: this.providers.get('claude')?.getState() || {
        id: 'claude',
        name: 'Claude (Auditor)',
        enabled: false,
        status: 'disabled',
        quotaProtected: true,
        lastMessage: 'Awaiting incremental activation with Quota Guard',
      },
    };

    return defaultStates;
  }

  public destroyAll(): void {
    this.providers.forEach((provider) => {
      provider.destroy();
    });
    this.providers.clear();
  }
}
