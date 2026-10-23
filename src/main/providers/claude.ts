import { BaseProviderAdapter } from './base';
import type { ProviderId, ProviderStatusType } from '../../shared/types';

export class ClaudeAdapter extends BaseProviderAdapter {
  public readonly id: ProviderId = 'claude';
  public readonly name = 'Claude (Auditor)';
  public readonly loginUrl = 'https://claude.ai';
  public readonly quotaProtected = true;

  constructor() {
    super();
    // Claude is opt-in and disabled by default to guard user's free quota
    this.status = 'disabled';
    this.lastMessage = 'Claude is quota-protected and disabled by default. Enable in Mission Control to activate.';
  }

  public async checkStatus(): Promise<ProviderStatusType> {
    if (!this.window || this.window.isDestroyed()) {
      return this.status;
    }

    const currentUrl = this.window.webContents.getURL();
    if (currentUrl.includes('/login')) {
      this.setStatus('login_required', 'Claude login page detected. Click Show/Login to sign in.');
      return 'login_required';
    }

    const probeResult = await this.evaluate<{
      hasCloudflare: boolean;
      hasLoginInput: boolean;
      hasPromptInput: boolean;
      isRateLimited: boolean;
      rateLimitMessage?: string;
    }>(`
      (() => {
        // 1. Cloudflare Challenge Detection
        const cfSelectors = [
          '#challenge-stage',
          'iframe[src*="challenges.cloudflare.com"]',
          'iframe[src*="turnstile"]'
        ];
        const hasCloudflare = cfSelectors.some(sel => !!document.querySelector(sel));

        // 2. Login Prompt Detection
        const loginSelectors = [
          'input[type="email"]',
          'button[data-testid="login-button"]',
          'a[href*="/login"]'
        ];
        const hasLoginInput = loginSelectors.some(sel => !!document.querySelector(sel));

        // 3. Prompt Input Detection in Claude
        const inputSelectors = [
          'div[contenteditable="true"].ProseMirror',
          'div[contenteditable="true"]',
          'fieldset div[contenteditable="true"]'
        ];
        const hasPromptInput = inputSelectors.some(sel => {
          const el = document.querySelector(sel);
          return el && (el.offsetWidth > 0 || el.offsetHeight > 0);
        });

        // 4. Rate Limit / Quota Exhaustion Detection
        const bodyText = document.body ? document.body.innerText : '';
        const isRateLimited = bodyText.includes('You are out of free messages') ||
          bodyText.includes('resets at') ||
          bodyText.includes('Usage limit reached') ||
          bodyText.includes('message limit');

        return {
          hasCloudflare,
          hasLoginInput,
          hasPromptInput,
          isRateLimited,
          rateLimitMessage: isRateLimited ? 'Claude message limit or cooldown detected' : undefined
        };
      })()
    `);

    if (!probeResult) {
      return this.status;
    }

    if (probeResult.hasCloudflare) {
      this.setStatus('manual_intervention_required', 'Cloudflare verification required.');
      return 'manual_intervention_required';
    }

    if (probeResult.isRateLimited) {
      this.setStatus('rate_limited', probeResult.rateLimitMessage || 'Claude quota exhausted.');
      return 'rate_limited';
    }

    if (probeResult.hasPromptInput) {
      this.setStatus('ready', 'Authenticated and ready.');
      return 'ready';
    }

    if (probeResult.hasLoginInput) {
      this.setStatus('login_required', 'Sign in required to use Claude.');
      return 'login_required';
    }

    this.setStatus('not_configured', 'Waiting for Claude interface to stabilize...');
    return 'not_configured';
  }

  public async sendPrompt(
    prompt: string
  ): Promise<{ ok: boolean; response?: string; error?: string }> {
    if (this.status !== 'ready') {
      const current = await this.checkStatus();
      if (current !== 'ready') {
        return {
          ok: false,
          error: `Claude session is not ready (Status: ${this.status}). ${this.lastMessage || ''}`
        };
      }
    }

    // Step 1: Input prompt into Claude ProseMirror editor
    const inputScript = `
      (() => {
        const input = document.querySelector('div[contenteditable="true"].ProseMirror') ||
          document.querySelector('div[contenteditable="true"]');
        if (!input) return { ok: false, error: 'Claude prompt input element not found.' };

        input.focus();
        input.textContent = ${JSON.stringify(prompt)};
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
        return { ok: true };
      })()
    `;

    const inputResult = await this.evaluate<{ ok: boolean; error?: string }>(inputScript);
    if (!inputResult || !inputResult.ok) {
      return { ok: false, error: inputResult?.error || 'Failed to populate Claude editor.' };
    }

    await new Promise((r) => setTimeout(r, 400));

    // Step 2: Click Claude send button
    const clickScript = `
      (() => {
        const sendBtn = document.querySelector('button[aria-label*="Send Message"]') ||
          document.querySelector('button[aria-label*="Send"]');
        if (!sendBtn) return { ok: false, error: 'Claude send button not found.' };
        if (sendBtn.disabled || sendBtn.getAttribute('aria-disabled') === 'true') {
          return { ok: false, error: 'Send button is disabled.' };
        }

        sendBtn.click();
        return { ok: true };
      })()
    `;

    const clickResult = await this.evaluate<{ ok: boolean; error?: string }>(clickScript);
    if (!clickResult || !clickResult.ok) {
      return { ok: false, error: clickResult?.error || 'Failed to click Claude send button.' };
    }

    // Step 3: Wait for Claude response completion
    return await this.waitForResponse();
  }

  private async waitForResponse(maxWaitSeconds = 120): Promise<{ ok: boolean; response?: string; error?: string }> {
    const startTime = Date.now();
    let hasStartedStreaming = false;

    while (Date.now() - startTime < maxWaitSeconds * 1000) {
      await new Promise((r) => setTimeout(r, 1000));

      const pollScript = `
        (() => {
          // Check for active stop generating button
          const stopBtn = document.querySelector('button[aria-label*="Stop response"]') ||
            document.querySelector('button[aria-label*="Stop output"]');

          const isStreaming = !!stopBtn;

          // Locate latest assistant response bubble in Claude
          const assistantBubbles = Array.from(document.querySelectorAll('.font-claude-message, [data-is-streaming]'));
          const lastBubble = assistantBubbles[assistantBubbles.length - 1];

          let text = '';
          if (lastBubble) {
            text = (lastBubble as HTMLElement).innerText || lastBubble.textContent || '';
          }

          return {
            isStreaming,
            hasContent: text.trim().length > 0,
            text: text.trim()
          };
        })()
      `;

      const poll = await this.evaluate<{ isStreaming: boolean; hasContent: boolean; text: string }>(pollScript);
      if (!poll) continue;

      if (poll.isStreaming || poll.hasContent) {
        hasStartedStreaming = true;
      }

      if (hasStartedStreaming && !poll.isStreaming && poll.hasContent) {
        return { ok: true, response: poll.text };
      }
    }

    return {
      ok: false,
      error: `Claude response timed out after ${maxWaitSeconds} seconds.`
    };
  }
}
