import { BaseProviderAdapter } from './base';
import type { ProviderId, ProviderStatusType } from '../../shared/types';

export class GeminiAdapter extends BaseProviderAdapter {
  public readonly id: ProviderId = 'gemini';
  public readonly name = 'Gemini (Feasibility)';
  public readonly loginUrl = 'https://gemini.google.com';
  public readonly quotaProtected = false;

  public async checkStatus(): Promise<ProviderStatusType> {
    if (!this.window || this.window.isDestroyed()) {
      await this.initialize();
    }
    if (!this.window || this.window.isDestroyed()) {
      return this.status;
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
      hasAuthShell: boolean;
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

        // 3. Authenticated Google Shell Detection
        const authShellSelectors = [
          'a[href*="accounts.google.com/SignOutOptions"]',
          'img[alt*="Google Account"]',
          '.gb_d',
          '.gb_A',
          'chat-window'
        ];
        const hasAuthShell = authShellSelectors.some(sel => {
          const el = document.querySelector(sel);
          return el && (el.offsetWidth > 0 || el.offsetHeight > 0);
        });

        // 4. Rate Limit / Quota Detection
        const bodyText = document.body ? document.body.innerText : '';
        const isRateLimited = bodyText.includes('You have reached your limit') ||
          bodyText.includes('temporarily unavailable') ||
          bodyText.includes('quota exceeded');

        return {
          hasLoginButton,
          hasPromptInput,
          hasAuthShell,
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
      this.setStatus('ready', 'Composer and submission controls verified ready.');
      return 'ready';
    }

    if (probeResult.hasLoginButton) {
      this.setStatus('login_required', 'Google sign in required to use Gemini.');
      return 'login_required';
    }

    if (probeResult.hasAuthShell) {
      this.setStatus('authenticated', 'Session authenticated; waiting for composer and submission controls to become interactive.');
      return 'authenticated';
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

    // Step 1: Input prompt into Gemini contenteditable textbox with Quill/Angular paragraph support
    const inputScript = `
      (() => {
        const input = document.querySelector('rich-textarea div[contenteditable="true"]') ||
          document.querySelector('div.ql-editor[contenteditable="true"]') ||
          document.querySelector('div[contenteditable="true"][role="textbox"]') ||
          document.querySelector('div[contenteditable="true"]');
        if (!input) return { ok: false, error: 'Gemini prompt input element not found.' };

        input.focus();
        // Trusted-Types-safe clear & paragraph structure for Quill delta sync
        input.replaceChildren();
        const lines = ${JSON.stringify(prompt)}.split('\\n');
        const fragment = document.createDocumentFragment();
        for (const line of lines) {
          const p = document.createElement('p');
          p.textContent = line || '\\u00A0';
          fragment.appendChild(p);
        }
        input.appendChild(fragment);

        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(prompt)} }));
        return { ok: true };
      })()
    `;

    const inputResult = await this.evaluate<{ ok: boolean; error?: string }>(inputScript);
    if (!inputResult || !inputResult.ok) {
      return { ok: false, error: inputResult?.error || 'Failed to populate Gemini prompt textarea.' };
    }

    await new Promise((r) => setTimeout(r, 400));

    // Step 2: Click Gemini send button with bounded retry for Angular state update
    const clickScript = `
      (() => {
        return new Promise((resolve) => {
          const startTime = Date.now();
          const checkSend = () => {
            const sendSelectors = [
              'button.send-button',
              'button[aria-label*="Send message" i]',
              'button[aria-label*="Send" i]',
              'button[aria-label*="전송"]',
              'button[data-mat-icon-name="send"]',
              '.send-button-container button',
              'button mat-icon[data-mat-icon-name="send"]',
              '.action-wrapper button[aria-label]',
              '.input-area-container button.send'
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

            if (Date.now() - startTime < 3000) {
              setTimeout(checkSend, 150);
            } else {
              if (targetBtn) {
                targetBtn.click();
                resolve({ ok: true });
              } else {
                resolve({ ok: false, error: 'Gemini send button not found or remained disabled after 3s.' });
              }
            }
          };

          checkSend();
        });
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
    let previousText = '';
    let stableTicks = 0;

    while (Date.now() - startTime < maxWaitSeconds * 1000) {
      await new Promise((r) => setTimeout(r, 1000));

      const pollScript = `
        (() => {
          // Check for active stop button or loading indicators
          const stopSelectors = [
            'button[aria-label*="Stop response" i]',
            'button[aria-label*="Stop" i]',
            'button.stop-button',
            'mat-progress-bar',
            '.thinking-indicator',
            '[data-test-id="response-loading"]',
            '.response-streaming'
          ];
          const isStreaming = stopSelectors.some((sel) => {
            const el = document.querySelector(sel);
            return !!el && (el.offsetWidth > 0 || el.offsetHeight > 0);
          });

          // Locate latest model response bubble
          const bubbleSelectors = [
            'model-response .markdown',
            '.model-response-text .markdown',
            '.model-response-text',
            'model-response message-content',
            'message-content',
            '.response-content .markdown',
            '[data-test-id="model-response"]',
            'model-response'
          ];

          let lastResponse = null;
          for (const sel of bubbleSelectors) {
            const nodes = Array.from(document.querySelectorAll(sel));
            if (nodes.length > 0) {
              lastResponse = nodes[nodes.length - 1];
              break;
            }
          }

          let text = '';
          if (lastResponse) {
            const markdownEl = lastResponse.querySelector('.markdown') || lastResponse;
            text = markdownEl.innerText || markdownEl.textContent || '';
          }

          // Check for completion action buttons in Gemini (copy, thumbs up/down, share)
          const completionSelectors = [
            'button[data-test-id="copy-button"]',
            'button[aria-label*="Copy" i]',
            'mat-icon[data-mat-icon-name="content_copy"]',
            'button[aria-label*="Good response" i]',
            'button[aria-label*="Thumb" i]'
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
      error: `Gemini response timed out after ${maxWaitSeconds} seconds.`
    };
  }
}
