import { BaseProviderAdapter } from './base';
import type { ProviderId, ProviderStatusType } from '../../shared/types';

export class DeepSeekAdapter extends BaseProviderAdapter {
  public readonly id: ProviderId = 'deepseek';
  public readonly name = 'DeepSeek (Code Spec)';
  public readonly loginUrl = 'https://chat.deepseek.com';
  public readonly quotaProtected = false;

  public async checkStatus(): Promise<ProviderStatusType> {
    if (!this.window || this.window.isDestroyed()) {
      await this.initialize();
    }
    if (!this.window || this.window.isDestroyed()) {
      return this.status;
    }

    const probeResult = await this.evaluate<{
      hasVerification: boolean;
      hasLoginModal: boolean;
      hasPromptInput: boolean;
      hasAuthShell: boolean;
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

        // 4. Authenticated DeepSeek Shell Detection
        const authShellSelectors = [
          'div[class*="user-profile"]',
          'div[class*="avatar"]',
          'div[class*="sidebar"]'
        ];
        const hasAuthShell = authShellSelectors.some(sel => {
          const el = document.querySelector(sel);
          return el && (el.offsetWidth > 0 || el.offsetHeight > 0);
        });

        // 5. Rate Limit / Server Busy Detection
        const bodyText = document.body ? document.body.innerText : '';
        const isRateLimited = bodyText.includes('server is busy') ||
          bodyText.includes('Too many requests') ||
          bodyText.includes('rate limit exceeded');

        return {
          hasVerification,
          hasLoginModal,
          hasPromptInput,
          hasAuthShell,
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
      this.setStatus('ready', 'Composer and submission controls verified ready.');
      return 'ready';
    }

    if (probeResult.hasLoginModal) {
      this.setStatus('login_required', 'DeepSeek login required. Click Show/Login to sign in.');
      return 'login_required';
    }

    if (probeResult.hasAuthShell) {
      this.setStatus('authenticated', 'Session authenticated; waiting for composer and submission controls to become interactive.');
      return 'authenticated';
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
        // Use HTMLTextAreaElement prototype setter to trigger React internal state updates
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        if (nativeSetter) {
          nativeSetter.call(input, ${JSON.stringify(prompt)});
        } else {
          input.value = ${JSON.stringify(prompt)};
        }
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(prompt)} }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true };
      })()
    `;

    const inputResult = await this.evaluate<{ ok: boolean; error?: string }>(inputScript);
    if (!inputResult || !inputResult.ok) {
      return { ok: false, error: inputResult?.error || 'Failed to populate DeepSeek textarea.' };
    }

    await new Promise((r) => setTimeout(r, 400));

    // Step 2: Click DeepSeek send button or trigger Enter submission with bounded retry
    const clickScript = `
      (() => {
        return new Promise((resolve) => {
          const startTime = Date.now();
          const checkSend = () => {
            const sendSelectors = [
              'div[class*="send-btn"]',
              'div[class*="send-button"]',
              'div[role="button"][class*="send"]',
              'button[aria-label*="Send" i]',
              'button[aria-label*="发送"]',
              'button[class*="send"]',
              '#chat-input ~ div[role="button"]',
              'div[class*="input-box"] div[role="button"]',
              '.ds-icon-button'
            ];

            let targetBtn = null;
            for (const sel of sendSelectors) {
              const btn = document.querySelector(sel);
              if (btn) {
                targetBtn = btn;
                const isDisabled = btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true';
                if (!isDisabled) {
                  btn.click();
                  resolve({ ok: true });
                  return;
                }
              }
            }

            // Fallback: Dispatch Enter key event on the textarea
            const input = document.querySelector('#chat-input') || document.querySelector('textarea');
            if (input && (input.value || '').trim().length > 0) {
              input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
              input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
              resolve({ ok: true, via: 'enter_key' });
              return;
            }

            if (Date.now() - startTime < 3000) {
              setTimeout(checkSend, 150);
            } else {
              if (targetBtn) {
                targetBtn.click();
                resolve({ ok: true });
              } else {
                resolve({ ok: false, error: 'DeepSeek send button not found or remained disabled after 3s.' });
              }
            }
          };

          checkSend();
        });
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
    let previousText = '';
    let stableTicks = 0;

    while (Date.now() - startTime < maxWaitSeconds * 1000) {
      await new Promise((r) => setTimeout(r, 1000));

      const pollScript = `
        (() => {
          // Check for active stop generating button
          const stopSelectors = [
            'div[class*="stop-button"]',
            'div[class*="stop-btn"]',
            'button[aria-label*="Stop" i]',
            'div[role="button"][class*="stop"]',
            '[data-testid="stop-button"]'
          ];
          const isStreaming = stopSelectors.some((sel) => {
            const el = document.querySelector(sel);
            return !!el && (el.offsetWidth > 0 || el.offsetHeight > 0);
          });

          // Locate latest assistant message bubble (.ds-markdown)
          const bubbleSelectors = [
            '.ds-markdown',
            'div[class*="message-content"]',
            'div[class*="ds-message"]',
            'div[class*="chat-message"]'
          ];

          let lastBubble = null;
          for (const sel of bubbleSelectors) {
            const nodes = Array.from(document.querySelectorAll(sel));
            if (nodes.length > 0) {
              lastBubble = nodes[nodes.length - 1];
              break;
            }
          }

          let text = '';
          if (lastBubble) {
            text = lastBubble.innerText || lastBubble.textContent || '';
          }

          // Check for completion action buttons in DeepSeek
          const completionSelectors = [
            'div[class*="copy"]',
            'button[class*="copy"]',
            'button[aria-label*="Copy" i]',
            'svg[class*="copy"]'
          ];
          const hasCompletionSignal = completionSelectors.some((sel) => !!document.querySelector(sel));

          return {
            isStreaming,
            hasCompletionSignal,
            hasContent: text.trim().length > 0,
            text: text.trim()
          };
        })()
      `;

      const poll = await this.evaluate<{
        isStreaming: boolean;
        hasCompletionSignal: boolean;
        hasContent: boolean;
        text: string;
      }>(pollScript);
      if (!poll) continue;

      if (poll.isStreaming || poll.hasContent) {
        hasStartedStreaming = true;
      }

      if (poll.hasContent && poll.text === previousText) {
        stableTicks++;
      } else {
        stableTicks = 0;
        previousText = poll.text;
      }

      // Condition 1: Streaming finished and completion signal present
      if (hasStartedStreaming && !poll.isStreaming && poll.hasCompletionSignal && poll.hasContent) {
        return { ok: true, response: poll.text };
      }

      // Condition 2: Streaming finished and text has stabilized for >= 2 seconds
      if (hasStartedStreaming && !poll.isStreaming && stableTicks >= 2 && poll.hasContent) {
        return { ok: true, response: poll.text };
      }

      // Condition 3: Fast finish - substantial response (> 50 chars) and stable/completed
      if (!poll.isStreaming && (poll.hasCompletionSignal || stableTicks >= 2) && poll.text.length > 50) {
        return { ok: true, response: poll.text };
      }
    }

    return {
      ok: false,
      error: `DeepSeek response timed out after ${maxWaitSeconds} seconds.`
    };
  }
}
