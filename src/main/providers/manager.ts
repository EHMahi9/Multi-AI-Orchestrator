import type { BrowserWindow } from 'electron';
import type { BaseProviderAdapter } from './base';
import { ChatGPTAdapter } from './chatgpt';
import { GeminiAdapter } from './gemini';
import { DeepSeekAdapter } from './deepseek';
import { ClaudeAdapter } from './claude';
import type { ProviderId, ProviderState, ProviderStatusType } from '../../shared/types';

export class ProviderSessionManager {
  private providers: Map<ProviderId, BaseProviderAdapter> = new Map();
  private mainWindow: BrowserWindow | null = null;

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

  public setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win;
  }

  private registerProvider(adapter: BaseProviderAdapter): void {
    this.providers.set(adapter.id, adapter);

    adapter.onStatusChanged((state) => {
      this.broadcastProviderState(state);
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

  public async openLogin(id: ProviderId): Promise<boolean> {
    const provider = this.providers.get(id);
    if (!provider) {
      console.warn(`[ProviderManager] Provider "${id}" not yet implemented in this incremental stage.`);
      return false;
    }
    await provider.showWindow();
    return true;
  }

  public async checkStatus(id: ProviderId): Promise<ProviderState> {
    const provider = this.providers.get(id);
    if (!provider) {
      return {
        id,
        name: id.toUpperCase(),
        enabled: false,
        status: 'not_configured',
        quotaProtected: id === 'claude',
        lastMessage: 'Provider integration pending in Milestone 2 incremental sequence.'
      };
    }
    await provider.checkStatus();
    return provider.getState();
  }

  public async sendPrompt(
    id: ProviderId,
    prompt: string
  ): Promise<{ ok: boolean; response?: string; error?: string }> {
    const provider = this.providers.get(id);
    if (!provider) {
      return {
        ok: false,
        error: `Provider "${id}" is not yet enabled. Currently active provider is ChatGPT.`
      };
    }
    return await provider.sendPrompt(prompt);
  }

  public getAllStates(): Record<ProviderId, ProviderState> {
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
        lastMessage: 'Awaiting incremental activation with Quota Guard'
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
