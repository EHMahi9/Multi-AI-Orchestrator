import { BaseProviderAdapter } from './base';
import type { ProviderId, ProviderStatusType } from '../../shared/types';

export class GeminiAdapter extends BaseProviderAdapter {
  public readonly id: ProviderId = 'gemini';
  public readonly name = 'Gemini (Feasibility)';
  public readonly loginUrl = 'https://gemini.google.com';
  public readonly quotaProtected = false;

  public async checkStatus(): Promise<ProviderStatusType> {
    if (!this.window || this.window.isDestroyed()) {
      this.setStatus('not_configured', 'Window not initialized');
      return 'not_configured';
    }

    const currentUrl = this.window.webContents.getURL();

    // Check if redirected to Google sign-in accounts domain
    if (currentUrl.includes('accounts.google.com')) {
      if (currentUrl.includes('/challenge') || currentUrl.includes('/rejected')) {
        this.setStatus('manual_intervention_required', 'Google identity challenge or verification required.');
        return 'manual_intervention_required';
      }
      this.setStatus('login_required', 'Google sign-in required. Click Show/Login to authenticate.');
      return 'login_required';
    }

    const probeResult = await this.evaluate<{
      hasLoginButton: boolean;
      hasPromptInput: boolean;
      isRateLimited: boolean;
      rateLimitMessage?: string;
    }>(`
      (() => {
        // 1. Sign-In Detection on gemini.google.com landing
        const loginSelectors = [
          'a[href*="accounts.google.com"]',
          'button[aria-label*="Sign in"]',
          'a[data-g-action="sign in"]',
          '.sign-in-button'
        ];
        const hasLoginButton = loginSelectors.some(sel => !!document.querySelector(sel));

        // 2. Prompt Input Detection in authenticated Gemini interface
        const inputSelectors = [
          'rich-textarea div[contenteditable="true"]',
          'div[contenteditable="true"][role="textbox"]',
          'div.ql-editor[contenteditable="true"]',
          'textarea[aria-label*="prompt"]'
        ];
        const hasPromptInput = inputSelectors.some(sel => {
          const el = document.querySelector(sel);
          return el && (el.offsetWidth > 0 || el.offsetHeight > 0);
        });

        // 3. Rate Limit / Quota Detection
        const bodyText = document.body ? document.body.innerText : '';
        const isRateLimited = bodyText.includes('You have reached your limit') ||
          bodyText.includes('temporarily unavailable') ||
          bodyText.includes('quota exceeded');

        return {
          hasLoginButton,
          hasPromptInput,
          isRateLimited,
          rateLimitMessage: isRateLimited ? 'Gemini quota or rate limit detected' : undefined
        };
      })()
    `);

    if (!probeResult) {
      return this.status;
    }

    if (probeResult.isRateLimited) {
      this.setStatus('rate_limited', probeResult.rateLimitMessage || 'Rate limit active.');
      return 'rate_limited';
    }

    if (probeResult.hasPromptInput) {
      this.setStatus('ready', 'Authenticated and ready.');
      return 'ready';
    }

    if (probeResult.hasLoginButton) {
      this.setStatus('login_required', 'Google sign in required to use Gemini.');
      return 'login_required';
    }

    this.setStatus('not_configured', 'Waiting for Gemini interface to stabilize...');
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
          error: `Gemini session is not ready (Status: ${this.status}). ${this.lastMessage || ''}`
        };
      }
    }

    // Step 1: Input prompt into Gemini contenteditable textbox
    const inputScript = `
      (() => {
        const input = document.querySelector('rich-textarea div[contenteditable="true"]') ||
          document.querySelector('div[contenteditable="true"][role="textbox"]') ||
          document.querySelector('div.ql-editor[contenteditable="true"]');
        if (!input) return { ok: false, error: 'Gemini prompt input element not found.' };

        input.focus();
        input.textContent = ${JSON.stringify(prompt)};
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
        return { ok: true };
      })()
    `;

    const inputResult = await this.evaluate<{ ok: boolean; error?: string }>(inputScript);
    if (!inputResult || !inputResult.ok) {
      return { ok: false, error: inputResult?.error || 'Failed to populate Gemini prompt textarea.' };
    }

    await new Promise((r) => setTimeout(r, 400));

    // Step 2: Click Gemini send button
    const clickScript = `
      (() => {
        const sendBtn = document.querySelector('button[aria-label*="Send message"]') ||
          document.querySelector('button.send-button') ||
          document.querySelector('button[mat-icon-button][aria-label*="Send"]');
        if (!sendBtn) return { ok: false, error: 'Send button not found.' };
        if (sendBtn.disabled || sendBtn.getAttribute('aria-disabled') === 'true') {
          return { ok: false, error: 'Send button is disabled.' };
        }

        sendBtn.click();
        return { ok: true };
      })()
    `;

    const clickResult = await this.evaluate<{ ok: boolean; error?: string }>(clickScript);
    if (!clickResult || !clickResult.ok) {
      return { ok: false, error: clickResult?.error || 'Failed to click Gemini send button.' };
    }

    // Step 3: Wait for Gemini response completion
    return await this.waitForResponse();
  }

  private async waitForResponse(maxWaitSeconds = 120): Promise<{ ok: boolean; response?: string; error?: string }> {
    const startTime = Date.now();
    let hasStartedStreaming = false;

    while (Date.now() - startTime < maxWaitSeconds * 1000) {
      await new Promise((r) => setTimeout(r, 1000));

      const pollScript = `
        (() => {
          // Check for active stop button
          const stopBtn = document.querySelector('button[aria-label*="Stop response"]') ||
            document.querySelector('button.stop-button');

          const isStreaming = !!stopBtn;

          // Locate latest model response bubble
          const responseNodes = Array.from(document.querySelectorAll('message-content, model-response, .model-response-text'));
          const lastResponse = responseNodes[responseNodes.length - 1];

          let text = '';
          if (lastResponse) {
            text = (lastResponse as HTMLElement).innerText || lastResponse.textContent || '';
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
      error: `Gemini response timed out after ${maxWaitSeconds} seconds.`
    };
  }
}
