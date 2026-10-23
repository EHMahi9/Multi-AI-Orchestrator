import { BaseProviderAdapter } from './base';
import type { ProviderId, ProviderStatusType } from '../../shared/types';

export class DeepSeekAdapter extends BaseProviderAdapter {
  public readonly id: ProviderId = 'deepseek';
  public readonly name = 'DeepSeek (Code Spec)';
  public readonly loginUrl = 'https://chat.deepseek.com';
  public readonly quotaProtected = false;

  public async checkStatus(): Promise<ProviderStatusType> {
    if (!this.window || this.window.isDestroyed()) {
      this.setStatus('not_configured', 'Window not initialized');
      return 'not_configured';
    }

    const probeResult = await this.evaluate<{
      hasVerification: boolean;
      hasLoginModal: boolean;
      hasPromptInput: boolean;
      isRateLimited: boolean;
      rateLimitMessage?: string;
    }>(`
      (() => {
        // 1. CAPTCHA / Security Verification Detection
        const secSelectors = [
          'div[class*="geetest"]',
          'iframe[src*="geetest"]',
          '#challenge-stage',
          'iframe[src*="turnstile"]',
          'iframe[src*="cloudflare"]'
        ];
        const hasVerification = secSelectors.some(sel => !!document.querySelector(sel));

        // 2. Login Modal or Sign-in Prompts Detection
        const loginSelectors = [
          'div[class*="login-dialog"]',
          'div[class*="loginModal"]',
          'button[class*="login-btn"]',
          'a[href*="/login"]',
          'a[href*="/sign-in"]'
        ];
        const hasLoginModal = loginSelectors.some(sel => {
          const el = document.querySelector(sel);
          return el && (el.offsetWidth > 0 || el.offsetHeight > 0);
        });

        // 3. Prompt Input Detection
        const inputSelectors = [
          '#chat-input',
          'textarea[placeholder*="DeepSeek"]',
          'textarea[placeholder*="Message"]',
          'textarea[class*="chat-input"]',
          'textarea'
        ];
        const hasPromptInput = inputSelectors.some(sel => {
          const el = document.querySelector(sel);
          return el && (el.offsetWidth > 0 || el.offsetHeight > 0);
        });

        // 4. Rate Limit / Server Busy Detection
        const bodyText = document.body ? document.body.innerText : '';
        const isRateLimited = bodyText.includes('server is busy') ||
          bodyText.includes('Too many requests') ||
          bodyText.includes('rate limit exceeded');

        return {
          hasVerification,
          hasLoginModal,
          hasPromptInput,
          isRateLimited,
          rateLimitMessage: isRateLimited ? 'DeepSeek server busy / rate limit detected' : undefined
        };
      })()
    `);

    if (!probeResult) {
      return this.status;
    }

    if (probeResult.hasVerification) {
      this.setStatus('manual_intervention_required', 'Security challenge or CAPTCHA required.');
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

    if (probeResult.hasLoginModal) {
      this.setStatus('login_required', 'DeepSeek login required. Click Show/Login to sign in.');
      return 'login_required';
    }

    this.setStatus('not_configured', 'Waiting for DeepSeek interface to stabilize...');
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
          error: `DeepSeek session is not ready (Status: ${this.status}). ${this.lastMessage || ''}`
        };
      }
    }

    // Step 1: Input prompt into DeepSeek chat textarea
    const inputScript = `
      (() => {
        const input = document.querySelector('#chat-input') ||
          document.querySelector('textarea[placeholder*="DeepSeek"]') ||
          document.querySelector('textarea');
        if (!input) return { ok: false, error: 'DeepSeek chat textarea not found.' };

        input.focus();
        input.value = ${JSON.stringify(prompt)};
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true };
      })()
    `;

    const inputResult = await this.evaluate<{ ok: boolean; error?: string }>(inputScript);
    if (!inputResult || !inputResult.ok) {
      return { ok: false, error: inputResult?.error || 'Failed to populate DeepSeek textarea.' };
    }

    await new Promise((r) => setTimeout(r, 400));

    // Step 2: Click DeepSeek send button
    const clickScript = `
      (() => {
        const sendBtn = document.querySelector('div[class*="send-button"]') ||
          document.querySelector('button[aria-label*="Send"]') ||
          document.querySelector('button[class*="send-btn"]');
        if (!sendBtn) return { ok: false, error: 'DeepSeek send button not found.' };

        (sendBtn as HTMLElement).click();
        return { ok: true };
      })()
    `;

    const clickResult = await this.evaluate<{ ok: boolean; error?: string }>(clickScript);
    if (!clickResult || !clickResult.ok) {
      return { ok: false, error: clickResult?.error || 'Failed to click DeepSeek send button.' };
    }

    // Step 3: Wait for DeepSeek response completion
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
          const stopBtn = document.querySelector('div[class*="stop-button"]') ||
            document.querySelector('button[aria-label*="Stop"]');

          const isStreaming = !!stopBtn;

          // Locate latest assistant message bubble (.ds-markdown)
          const markdownBubbles = Array.from(document.querySelectorAll('.ds-markdown, div[class*="message-content"]'));
          const lastBubble = markdownBubbles[markdownBubbles.length - 1];

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
      error: `DeepSeek response timed out after ${maxWaitSeconds} seconds.`
    };
  }
}
