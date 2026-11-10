import { BrowserWindow, session, app, Menu, MenuItem } from 'electron';
import type { ProviderId, ProviderState, ProviderStatusType } from '../../shared/types';

export abstract class BaseProviderAdapter {
  public abstract readonly id: ProviderId;
  public abstract readonly name: string;
  public abstract readonly loginUrl: string;
  public abstract readonly quotaProtected: boolean;

  protected window: BrowserWindow | null = null;
  protected status: ProviderStatusType = 'not_configured';
  protected lastMessage?: string;
  private statusListeners: Array<(state: ProviderState) => void> = [];

  public get partition(): string {
    return `persist:ai-provider-${this.id}`;
  }

  public getState(): ProviderState {
    return {
      id: this.id,
      name: this.name,
      enabled: this.status !== 'disabled',
      status: this.status,
      quotaProtected: this.quotaProtected,
      lastMessage: this.lastMessage,
    };
  }

  public onStatusChanged(listener: (state: ProviderState) => void): () => void {
    this.statusListeners.push(listener);
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== listener);
    };
  }

  protected setStatus(status: ProviderStatusType, message?: string): void {
    const changed = this.status !== status || this.lastMessage !== message;
    this.status = status;
    if (message !== undefined) {
      this.lastMessage = message;
    }
    if (changed) {
      const state = this.getState();
      this.statusListeners.forEach((listener) => {
        try {
          listener(state);
        } catch (err) {
          console.error(`[${this.id}] Error in status listener:`, err);
        }
      });
    }
  }

  /**
   * Initializes the persistent, isolated BrowserWindow for this provider.
   * By default, it stays hidden in the background.
   */
  public async initialize(): Promise<void> {
    if (this.window && !this.window.isDestroyed()) {
      return;
    }

    // Safety guard for unit test environments where Electron native session is unavailable
    if (!session || typeof session.fromPartition !== 'function') {
      return;
    }

    const providerSession = session.fromPartition(this.partition, { cache: true });

    // Use a clean, standard Chrome desktop user agent (stripping Electron/x.x token)
    // to avoid false-positive anti-bot flags
    const defaultUa = providerSession.getUserAgent();
    const cleanUa = defaultUa.replace(/Electron\/[0-9\.]+\s?/, '');
    providerSession.setUserAgent(cleanUa);

    this.window = new BrowserWindow({
      width: 1100,
      height: 800,
      title: `${this.name} - AI Provider Session`,
      show: false,
      paintWhenInitiallyHidden: true,
      webPreferences: {
        session: providerSession,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
      },
    });

    // When the user clicks the X button on the provider window, hide it rather
    // than destroying the session so background operations continue.
    this.window.on('close', (event) => {
      // @ts-ignore custom flag attached to app
      if (!app.isQuitting) {
        event.preventDefault();
        this.window?.hide();
      }
    });

    // Context menu for interactive provider windows (Reload, Go to Home, Reset Session)
    this.window.webContents.on('context-menu', (_e, params) => {
      if (!this.window || this.window.isDestroyed()) return;
      const menu = new Menu();
      menu.append(new MenuItem({
        label: 'Reload Page (F5)',
        click: () => this.window?.webContents.reload()
      }));
      menu.append(new MenuItem({
        label: `Go to ${this.name} Home`,
        click: () => this.window?.loadURL(this.loginUrl)
      }));
      if (this.id === 'chatgpt') {
        menu.append(new MenuItem({
          label: 'Go to ChatGPT Direct Login',
          click: () => this.window?.loadURL('https://chatgpt.com/auth/login')
        }));
      }
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({
        label: 'Clear Session & Log in Fresh (Reset Cookies)',
        click: async () => {
          await this.clearSession();
        }
      }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({
        label: 'Inspect Element (DevTools)',
        click: () => this.window?.webContents.inspectElement(params.x, params.y)
      }));
      menu.popup();
    });

    this.window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      console.warn(`[${this.id}] Page load failed (${errorCode}): ${errorDescription}`);
      this.setStatus('error', `Failed to load (${errorCode}): ${errorDescription}`);
    });

    this.window.webContents.on('did-finish-load', async () => {
      await this.checkStatus();
      // Progressive probes to accommodate client-side SPA mounting
      setTimeout(() => this.checkStatus().catch(() => {}), 1200);
      setTimeout(() => this.checkStatus().catch(() => {}), 2500);
    });

    this.window.webContents.on('did-navigate', async () => {
      await this.checkStatus().catch(() => {});
    });

    this.window.webContents.on('did-navigate-in-page', async () => {
      await this.checkStatus().catch(() => {});
    });

    this.window.on('focus', async () => {
      await this.checkStatus().catch(() => {});
    });

    try {
      this.setStatus('not_configured', 'Loading session...');
      await this.window.loadURL(this.loginUrl);
    } catch (err: any) {
      this.setStatus('error', err.message || 'Failed to load login URL');
    }
  }

  /**
   * Displays the provider window so the user can log in or solve challenges interactively.
   */
  public async showWindow(): Promise<void> {
    if (!this.window || this.window.isDestroyed()) {
      await this.initialize();
    }
    if (this.window && !this.window.isDestroyed()) {
      this.window.show();
      this.window.focus();
      await this.checkStatus().catch(() => {});
      setTimeout(() => this.checkStatus().catch(() => {}), 1200);
    }
  }

  /**
   * Hides the provider window into the background.
   */
  public hideWindow(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide();
    }
  }

  /**
   * Clears cookies and storage for this provider partition, resetting it for a fresh login.
   */
  public async clearSession(): Promise<void> {
    if (this.window && !this.window.isDestroyed()) {
      const ses = this.window.webContents.session;
      await ses.clearStorageData({
        storages: ['cookies', 'localstorage', 'indexdb', 'websql', 'serviceworkers', 'cachestorage']
      });
      await this.window.loadURL(this.loginUrl);
      this.setStatus('login_required', 'Session cleared. Ready for fresh login.');
      this.window.show();
      this.window.focus();
    } else if (session && typeof session.fromPartition === 'function') {
      const provSession = session.fromPartition(this.partition, { cache: true });
      await provSession.clearStorageData();
      this.setStatus('login_required', 'Session cleared. Ready for fresh login.');
    }
  }

  /**
   * Safely executes JavaScript inside the provider webContents with timeout and error handling.
   */
  protected async evaluate<T>(script: string, timeoutMs = 8000): Promise<T | null> {
    if (!this.window || this.window.isDestroyed()) {
      return null;
    }

    try {
      const resultPromise = this.window.webContents.executeJavaScript(script, true);
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Evaluation timed out')), timeoutMs)
      );
      return (await Promise.race([resultPromise, timeoutPromise])) as T;
    } catch (err: any) {
      console.warn(`[${this.id}] JavaScript evaluation error:`, err.message);
      return null;
    }
  }

  /**
   * Probes DOM elements to determine current session status.
   */
  public abstract checkStatus(): Promise<ProviderStatusType>;

  /**
   * Dispatches a prompt to the provider and waits for the full assistant reply.
   */
  public abstract sendPrompt(
    prompt: string
  ): Promise<{ ok: boolean; response?: string; error?: string }>;

  /**
   * Cleans up resources on application shutdown.
   */
  public destroy(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
      this.window = null;
    }
  }
}
