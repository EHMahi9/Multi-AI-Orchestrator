import { BaseProviderAdapter } from './base';
import type { ProviderId, ProviderStatusType } from '../../shared/types';

export class ChatGPTAdapter extends BaseProviderAdapter {
  public readonly id: ProviderId = 'chatgpt';
  public readonly name = 'ChatGPT (Architect)';
  public readonly loginUrl = 'https://chatgpt.com';
  public readonly quotaProtected = false;

  public async checkStatus(): Promise<ProviderStatusType> {
    if (!this.window || this.window.isDestroyed()) {
      this.setStatus('not_configured', 'Window not initialized');
      return 'not_configured';
    }

    const currentUrl = this.window.webContents.getURL();

    // Check if redirected to auth domain
    if (currentUrl.includes('auth.openai.com') || currentUrl.includes('/auth/login')) {
      this.setStatus('login_required', 'Login page detected. Click Show/Login to sign in.');
      return 'login_required';
    }

    const probeResult = await this.evaluate<{
      hasCloudflare: boolean;
      hasLoginButton: boolean;
      hasPromptInput: boolean;
      isRateLimited: boolean;
      rateLimitMessage?: string;
    }>(`
      (() => {
        // 1. Cloudflare / Challenge Detection
        const cfSelectors = [
          '#challenge-stage',
          'div[id*="challenge"]',
          'iframe[src*="challenges.cloudflare.com"]',
          'iframe[src*="turnstile"]'
        ];
        const hasCloudflare = cfSelectors.some(sel => !!document.querySelector(sel));

        // 2. Login Button Detection
        const loginSelectors = [
          'button[data-testid="login-button"]',
          'a[href*="/auth/login"]',
          'a[href*="/login"]',
          'button[data-testid="signup-button"]'
        ];
        const hasLoginButton = loginSelectors.some(sel => !!document.querySelector(sel));

        // 3. Prompt Input Detection
        const inputSelectors = [
          '#prompt-textarea',
          'div[contenteditable="true"][id="prompt-textarea"]',
          'div[contenteditable="true"]',
          'textarea[data-id="root"]'
        ];
        const hasPromptInput = inputSelectors.some(sel => {
          const el = document.querySelector(sel);
          return el && (el.offsetWidth > 0 || el.offsetHeight > 0);
        });

        // 4. Rate Limit Detection
        const bodyText = document.body ? document.body.innerText : '';
        const isRateLimited = bodyText.includes("You've reached our limit") ||
          bodyText.includes("Rate limit reached") ||
          bodyText.includes("Too many requests");

        return {
          hasCloudflare,
          hasLoginButton,
          hasPromptInput,
          isRateLimited,
          rateLimitMessage: isRateLimited ? 'Rate limit banner detected' : undefined
        };
      })()
    `);

    if (!probeResult) {
      // Inconclusive probe, keep current status or mark error
      return this.status;
    }

    if (probeResult.hasCloudflare) {
      this.setStatus('manual_intervention_required', 'Cloudflare security verification required.');
      return 'manual_intervention_required';
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
      this.setStatus('login_required', 'Sign in required to use ChatGPT.');
      return 'login_required';
    }

    // Default fallback if still loading initial SPA shell
    this.setStatus('not_configured', 'Waiting for ChatGPT interface to stabilize...');
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
          error: `ChatGPT session is not ready (Status: ${this.status}). ${this.lastMessage || ''}`
        };
      }
    }

    // Step 1: Input prompt into textarea
    const inputScript = `
      (() => {
        const input = document.querySelector('#prompt-textarea') ||
          document.querySelector('div[contenteditable="true"]');
        if (!input) return { ok: false, error: 'Prompt input textarea not found.' };

        input.focus();
        if (input.tagName === 'TEXTAREA') {
          input.value = ${JSON.stringify(prompt)};
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          // contenteditable handling
          input.textContent = ${JSON.stringify(prompt)};
          input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
        }
        return { ok: true };
      })()
    `;

    const inputResult = await this.evaluate<{ ok: boolean; error?: string }>(inputScript);
    if (!inputResult || !inputResult.ok) {
      return { ok: false, error: inputResult?.error || 'Failed to populate ChatGPT prompt textarea.' };
    }

    // Give React state a short moment to validate text length
    await new Promise((r) => setTimeout(r, 400));

    // Step 2: Click the send button
    const clickScript = `
      (() => {
        const sendBtn = document.querySelector('button[data-testid="send-button"]') ||
          document.querySelector('button[aria-label="Send prompt"]') ||
          document.querySelector('button[aria-label="Send message"]');
        if (!sendBtn) return { ok: false, error: 'Send button not found.' };
        if (sendBtn.disabled) return { ok: false, error: 'Send button is disabled.' };

        sendBtn.click();
        return { ok: true };
      })()
    `;

    const clickResult = await this.evaluate<{ ok: boolean; error?: string }>(clickScript);
    if (!clickResult || !clickResult.ok) {
      return { ok: false, error: clickResult?.error || 'Failed to click ChatGPT send button.' };
    }

    // Step 3: Wait for streaming response to finish and extract content
    return await this.waitForResponse();
  }

  /**
   * Polls the page for assistant message generation completion.
   */
  private async waitForResponse(maxWaitSeconds = 120): Promise<{ ok: boolean; response?: string; error?: string }> {
    const startTime = Date.now();
    let hasStartedStreaming = false;

    while (Date.now() - startTime < maxWaitSeconds * 1000) {
      await new Promise((r) => setTimeout(r, 1000));

      const pollScript = `
        (() => {
          // Check if stop button is present (active generation)
          const stopBtn = document.querySelector('button[aria-label="Stop generating"]') ||
            document.querySelector('button[data-testid="stop-button"]');

          const isStreaming = !!stopBtn;

          // Find the latest assistant message
          const assistantBubbles = Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
          const lastBubble = assistantBubbles[assistantBubbles.length - 1];

          let text = '';
          if (lastBubble) {
            text = lastBubble.innerText || lastBubble.textContent || '';
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

      // If streaming finished after having begun, return the response
      if (hasStartedStreaming && !poll.isStreaming && poll.hasContent) {
        return { ok: true, response: poll.text };
      }
    }

    return {
      ok: false,
      error: `ChatGPT response timed out after ${maxWaitSeconds} seconds.`
    };
  }
}
