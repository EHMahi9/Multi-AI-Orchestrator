import { BaseProviderAdapter } from './base';
import type { ProviderId, ProviderStatusType } from '../../shared/types';
import { buildClientSideSendScript } from './chatgpt-dom';

export class ChatGPTAdapter extends BaseProviderAdapter {
  public readonly id: ProviderId = 'chatgpt';
  public readonly name = 'ChatGPT (Architect)';
  public readonly loginUrl = 'https://chatgpt.com';
  public readonly quotaProtected = false;

  private activeSubmissionPrompt: string | null = null;

  public async checkStatus(): Promise<ProviderStatusType> {
    if (!this.window || this.window.isDestroyed()) {
      await this.initialize();
    }
    if (!this.window || this.window.isDestroyed()) {
      return this.status;
    }

    const currentUrl = this.window.webContents.getURL() || '';

    // Check if redirected to auth domain
    if (
      currentUrl.includes('auth.openai.com') ||
      currentUrl.includes('/auth/login') ||
      currentUrl.includes('/login') ||
      currentUrl.includes('login.openai.com')
    ) {
      this.setStatus('login_required', 'Sign in required to use ChatGPT. Click Show/Login to authenticate.');
      return 'login_required';
    }

    const probeResult = await this.evaluate<{
      hasCloudflare: boolean;
      hasLoginButton: boolean;
      hasPromptInput: boolean;
      hasAuthShell: boolean;
      isRateLimited: boolean;
      rateLimitMessage?: string;
    }>(`
      (() => {
        const visible = (el) => !!el && !!(el.offsetWidth || el.offsetHeight || (el.getClientRects && el.getClientRects().length));

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
          'button[data-testid="signup-button"]',
          'a[href*="/auth/login"]',
          'a[href*="/login"]',
          'a[href*="login.openai.com"]'
        ];
        const hasLoginButton = loginSelectors.some(sel => {
          const el = document.querySelector(sel);
          return el && visible(el);
        });

        // 3. Prompt Input Detection
        const inputSelectors = [
          'form[data-chatgpt-composer] [contenteditable="true"][role="textbox"]',
          'form[data-chatgpt-composer] [data-composer-markdown][contenteditable="true"]',
          'form[data-type="unified-composer"] [contenteditable="true"][role="textbox"]',
          'form[data-type="unified-composer"] [contenteditable="true"]',
          '#prompt-textarea',
          '[data-testid="prompt-textarea"]',
          'div[contenteditable="true"][role="textbox"]',
          'div[contenteditable="true"]',
          'textarea[name="prompt-textarea"]',
          'textarea'
        ];
        const hasPromptInput = inputSelectors.some(sel => {
          const candidates = Array.from(document.querySelectorAll(sel)).filter(visible);
          return candidates.length > 0;
        });

        // 4. Authenticated Shell Detection (Logged in, but composer might not be interactive)
        const authShellSelectors = [
          'nav',
          'aside',
          '[data-testid="profile-button"]',
          'button[aria-label="User menu"]',
          'img[alt="User"]',
          '#sidebar'
        ];
        const hasAuthShell = authShellSelectors.some(sel => {
          const el = document.querySelector(sel);
          return el && visible(el);
        });

        // 5. Rate Limit Detection
        const bodyText = document.body ? (document.body.innerText || document.body.textContent || '') : '';
        const isRateLimited = bodyText.includes("You've reached our limit") ||
          bodyText.includes("Rate limit reached") ||
          bodyText.includes("Too many requests") ||
          bodyText.includes("You have reached the max");

        return {
          hasCloudflare,
          hasLoginButton,
          hasPromptInput,
          hasAuthShell,
          isRateLimited,
          rateLimitMessage: isRateLimited ? 'ChatGPT rate limit active' : undefined
        };
      })()
    `);

    if (!probeResult) {
      // Inconclusive probe, keep current status
      return this.status;
    }

    if (probeResult.hasCloudflare) {
      this.setStatus('manual_intervention_required', 'Cloudflare security verification required. Open ChatGPT window to solve challenge.');
      return 'manual_intervention_required';
    }

    if (probeResult.isRateLimited) {
      this.setStatus('rate_limited', probeResult.rateLimitMessage || 'ChatGPT rate limit active.');
      return 'rate_limited';
    }

    if (probeResult.hasPromptInput) {
      this.setStatus('ready', 'Composer and submission controls verified ready.');
      return 'ready';
    }

    if (probeResult.hasLoginButton) {
      this.setStatus('login_required', 'Sign in required to use ChatGPT. Click Show/Login to authenticate.');
      return 'login_required';
    }

    if (probeResult.hasAuthShell) {
      this.setStatus('authenticated', 'Session authenticated; waiting for composer and submission controls to become interactive.');
      return 'authenticated';
    }

    // Default fallback when page is still hydrating
    // Preserve ready or login_required if previously established
    if (this.status === 'ready') {
      return 'ready';
    }
    if (this.status === 'login_required') {
      return 'login_required';
    }

    this.setStatus('not_configured', 'Waiting for ChatGPT interface to stabilize...');
    return 'not_configured';
  }

  public async sendPrompt(
    prompt: string
  ): Promise<{ ok: boolean; response?: string; error?: string }> {
    if (this.activeSubmissionPrompt === prompt) {
      return {
        ok: false,
        error: 'A submission for this prompt is already in progress. Please wait for the current turn to complete.'
      };
    }

    if (this.status !== 'ready') {
      const current = await this.checkStatus();
      if (current !== 'ready') {
        return {
          ok: false,
          error: `ChatGPT session is not ready (Status: ${this.status.toUpperCase()}). ${this.lastMessage || ''}`
        };
      }
    }

    this.activeSubmissionPrompt = prompt;

    try {
      this.setStatus('sending', 'Inserting prompt into ChatGPT composer and submitting...');

      // Execute browser-side prompt staging, resilient send click, and observable verification
      const sendScript = buildClientSideSendScript(prompt);
      const submissionResult = await this.evaluate<{
        ok: boolean;
        stage: string;
        actionTaken?: string;
        signal?: string;
        error?: string;
      }>(sendScript, 18000);

      if (!submissionResult || !submissionResult.ok) {
        const errorMsg =
          submissionResult?.error ||
          'Prompt inserted but submission could not be confirmed. Open the ChatGPT window and send or verify the message manually.';

        this.setStatus('manual_intervention_required', errorMsg);
        return {
          ok: false,
          error: errorMsg
        };
      }

      // Observable evidence verified submission!
      this.setStatus('awaiting_response', 'Prompt submitted. Awaiting ChatGPT response...');

      // Wait for streaming response to finish and extract content
      const responseResult = await this.waitForResponse();
      if (responseResult.ok) {
        this.setStatus('ready', 'Response received.');
      } else {
        this.setStatus('error', responseResult.error || 'Response extraction failed.');
      }

      return responseResult;
    } finally {
      this.activeSubmissionPrompt = null;
    }
  }

  /**
   * Polls the page for assistant message generation completion.
   */
  private async waitForResponse(maxWaitSeconds = 120): Promise<{ ok: boolean; response?: string; error?: string }> {
    const startTime = Date.now();
    let hasStartedStreaming = false;
    let previousText = '';
    let stableTicks = 0;

    while (Date.now() - startTime < maxWaitSeconds * 1000) {
      await new Promise((r) => setTimeout(r, 1000));

      const pollScript = `
        (() => {
          // Check if stop button is present (active generation)
          const stopSelectors = [
            'button[aria-label*="Stop generating" i]',
            'button[aria-label*="Stop response" i]',
            'button[aria-label*="Stop streaming" i]',
            'button[data-testid="stop-button"]'
          ];
          const isStreaming = stopSelectors.some((sel) => {
            const el = document.querySelector(sel);
            return !!el && (el.offsetWidth > 0 || el.offsetHeight > 0);
          });

          // Find the latest assistant message
          const bubbleSelectors = [
            '[data-message-author-role="assistant"] .markdown',
            '[data-message-author-role="assistant"]',
            'article[data-testid*="conversation-turn"] .markdown',
            '[data-content-search-unit-key$=":assistant"]',
            '[data-chatgpt-search-unit-key$=":assistant"]'
          ];

          let lastBubble = null;
          for (const sel of bubbleSelectors) {
            const bubbles = Array.from(document.querySelectorAll(sel));
            if (bubbles.length > 0) {
              lastBubble = bubbles[bubbles.length - 1];
              break;
            }
          }

          let text = '';
          if (lastBubble) {
            text = lastBubble.innerText || lastBubble.textContent || '';
          }

          // Check for completion action buttons (Copy turn action button, thumbs up/down, share)
          const completionSelectors = [
            'button[data-testid="copy-turn-action-button"]',
            'button[aria-label*="Copy" i]',
            'button[data-testid="good-response-turn-action-button"]',
            'button[data-testid="share-turn-action-button"]'
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

      // Condition 1: Streaming finished and completion action button is present
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
      error: `ChatGPT response timed out after ${maxWaitSeconds} seconds.`
    };
  }
}
