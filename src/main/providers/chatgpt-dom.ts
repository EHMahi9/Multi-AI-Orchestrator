import type { ProviderStatusType } from '../../shared/types';

/**
 * Normalizes text by trimming whitespace, normalizing line endings,
 * and stripping zero-width or non-breaking spaces.
 */
export function normalizeText(value: unknown): string {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * Checks whether a DOM element is visible and interactive.
 */
export function isElementVisible(el: any): boolean {
  if (!el) return false;
  if (typeof el.getAttribute === 'function' && el.getAttribute('aria-hidden') === 'true') {
    return false;
  }
  // If simulated/mocked element has visible property, respect it
  if (typeof el.visible === 'boolean') {
    return el.visible;
  }
  // Standard browser DOM metrics
  if (typeof el.getClientRects === 'function') {
    const rects = el.getClientRects();
    if (rects && rects.length > 0) return true;
  }
  return Boolean(el.offsetWidth || el.offsetHeight);
}

/**
 * Locates the active ChatGPT message composer element.
 */
export function findComposerElement(root: any): any {
  if (!root || typeof root.querySelectorAll !== 'function') return null;

  const selectors = [
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

  for (const selector of selectors) {
    const candidates = Array.from(root.querySelectorAll(selector)).filter((el: any) => {
      if (!isElementVisible(el)) return false;
      if (el.id === 'pending-home-input') return false;
      return true;
    });

    if (candidates.length > 0) {
      // Pick the last matching candidate in the document (the main composer is at bottom)
      return candidates[candidates.length - 1];
    }
  }

  return null;
}

/**
 * Reads the text content from a composer element (textarea, input, or contenteditable).
 */
export function readComposerText(el: any): string {
  if (!el) return '';
  if (el.matches && el.matches('textarea, input')) {
    return String(el.value || '');
  }
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    return String(el.value || '');
  }
  return String(el.innerText || el.textContent || '');
}

export interface SendButtonMatch {
  button: any;
  selector: string;
  disabled: boolean;
}

/**
 * Identifies the enabled or candidate Send submit button for ChatGPT.
 * Prefers data-testid, accessible aria labels, submit buttons within composer form.
 */
export function findSendButtonElement(root: any, composer?: any): SendButtonMatch | null {
  if (!root || typeof root.querySelectorAll !== 'function') return null;

  const form = composer && typeof composer.closest === 'function' ? composer.closest('form') : root.querySelector?.('form');
  const searchRoots = form ? [form, root] : [root];

  const candidateSelectors = [
    'button[data-testid="send-button"]',
    'button[data-testid*="send"]',
    'button[data-testid="fruitjuice-send-button"]',
    '#composer-submit-button',
    'button[aria-label="Send prompt" i]',
    'button[aria-label="Send message" i]',
    'button[aria-label="Send" i]',
    'button[aria-label="Submit" i]',
    'form button[type="submit"]',
    'button[type="submit"]'
  ];

  const seen = new Set();
  const allCandidates: SendButtonMatch[] = [];

  for (const searchRoot of searchRoots) {
    if (!searchRoot || typeof searchRoot.querySelectorAll !== 'function') continue;

    for (const sel of candidateSelectors) {
      const elements = Array.from(searchRoot.querySelectorAll(sel));
      for (const el of elements as any[]) {
        if (seen.has(el)) continue;
        seen.add(el);

        if (!isElementVisible(el)) continue;

        const disabled = Boolean(el.disabled || el.getAttribute?.('aria-disabled') === 'true');
        allCandidates.push({ button: el, selector: sel, disabled });
      }
    }
  }

  // Also look for button with send SVG icon inside composer form
  if (form && typeof form.querySelectorAll === 'function') {
    const formButtons = Array.from(form.querySelectorAll('button'));
    for (const btn of formButtons as any[]) {
      if (seen.has(btn) || !isElementVisible(btn)) continue;
      seen.add(btn);

      const hasSendSvg = Boolean(
        btn.querySelector?.('svg path[d*="M0.5"]') ||
        btn.querySelector?.('svg path[d*="M2.5"]') ||
        btn.querySelector?.('svg path[d*="M12 2"]') ||
        btn.querySelector?.('svg[data-icon="arrow-up"]')
      );
      const ariaLabel = String(btn.getAttribute?.('aria-label') || '').toLowerCase();

      if (hasSendSvg || ariaLabel.includes('send') || ariaLabel.includes('submit')) {
        const disabled = Boolean(btn.disabled || btn.getAttribute?.('aria-disabled') === 'true');
        allCandidates.push({ button: btn, selector: 'form-button-svg', disabled });
      }
    }
  }

  // First priority: return the first enabled candidate
  const enabledMatch = allCandidates.find((c) => !c.disabled);
  if (enabledMatch) return enabledMatch;

  // If only disabled buttons found, return the first one (caller will know it's disabled)
  if (allCandidates.length > 0) {
    return allCandidates[0];
  }

  return null;
}

export interface SubmissionEvidenceResult {
  confirmed: boolean;
  signal: string;
}

/**
 * Checks observable evidence in the DOM confirming prompt was accepted/submitted.
 */
export function checkSubmissionEvidenceDOM(
  root: any,
  initialUserCount: number,
  promptPrefix: string
): SubmissionEvidenceResult {
  if (!root || typeof root.querySelectorAll !== 'function') {
    return { confirmed: false, signal: 'invalid_root' };
  }

  // 1. Check user message elements in conversation
  const userSelectors = [
    '[data-message-author-role="user"]',
    '[data-content-search-unit-key$=":user"]',
    '[data-chatgpt-search-unit-key$=":user"]',
    '[data-turn="user"]',
    'article[data-testid^="conversation-turn-"] [data-message-author-role="user"]',
    '[data-user-message-bubble="true"]'
  ];

  let userCount = 0;
  let lastUserText = '';

  for (const sel of userSelectors) {
    const found = Array.from(root.querySelectorAll(sel)).filter(isElementVisible);
    if (found.length > 0) {
      userCount = found.length;
      const last = found[found.length - 1] as any;
      lastUserText = normalizeText(last.innerText || last.textContent);
      break;
    }
  }

  if (userCount > initialUserCount) {
    return { confirmed: true, signal: 'user_message_count_increased' };
  }

  if (promptPrefix && lastUserText && lastUserText.includes(normalizeText(promptPrefix))) {
    return { confirmed: true, signal: 'user_message_matched_content' };
  }

  // 2. Check stop generation button (active streaming)
  const stopSelectors = [
    'button[data-testid="stop-button"]',
    '[data-testid="stop-button"]',
    'button[aria-label*="Stop generating" i]',
    'button[aria-label*="Stop response" i]',
    'button[aria-label*="Stop streaming" i]',
    'button[aria-label*="Stop" i]'
  ];

  for (const sel of stopSelectors) {
    const stopBtn = root.querySelector?.(sel);
    if (stopBtn && isElementVisible(stopBtn)) {
      return { confirmed: true, signal: 'stop_button_visible' };
    }
  }

  // 3. Check assistant response streaming
  const assistantSelectors = [
    '[data-message-author-role="assistant"]',
    '[data-content-search-unit-key$=":assistant"]',
    '[data-chatgpt-search-unit-key$=":assistant"]',
    '[data-turn="assistant"]',
    '[data-testid^="conversation-turn-"][data-turn="assistant"]'
  ];

  for (const sel of assistantSelectors) {
    const assistantNodes = Array.from(root.querySelectorAll(sel)).filter(isElementVisible);
    if (assistantNodes.length > 0) {
      const lastAssistant = assistantNodes[assistantNodes.length - 1] as any;
      const text = normalizeText(lastAssistant.innerText || lastAssistant.textContent);
      if (text.length > 0) {
        return { confirmed: true, signal: 'assistant_streaming_active' };
      }
    }
  }

  return { confirmed: false, signal: 'none' };
}

export interface ProbeStatusResult {
  status: ProviderStatusType;
  message: string;
  hasPromptInput: boolean;
  hasLoginButton: boolean;
  hasCloudflare: boolean;
  isRateLimited: boolean;
}

/**
 * Probes the DOM and URL to determine genuine session readiness.
 */
export function probeChatGPTStatusDOM(root: any, currentUrl = ''): ProbeStatusResult {
  // 1. URL Domain & Auth Redirect Check
  if (currentUrl.includes('auth.openai.com') || currentUrl.includes('/auth/login') || currentUrl.includes('/login')) {
    return {
      status: 'login_required',
      message: 'Sign in required to use ChatGPT. Click Show/Login to authenticate.',
      hasPromptInput: false,
      hasLoginButton: true,
      hasCloudflare: false,
      isRateLimited: false,
    };
  }

  if (!root || typeof root.querySelectorAll !== 'function') {
    return {
      status: 'not_configured',
      message: 'Document not loaded.',
      hasPromptInput: false,
      hasLoginButton: false,
      hasCloudflare: false,
      isRateLimited: false,
    };
  }

  // 2. Cloudflare / Challenge Detection
  const cfSelectors = [
    '#challenge-stage',
    'div[id*="challenge"]',
    'iframe[src*="challenges.cloudflare.com"]',
    'iframe[src*="turnstile"]'
  ];
  const hasCloudflare = cfSelectors.some((sel) => !!root.querySelector?.(sel));
  if (hasCloudflare) {
    return {
      status: 'manual_intervention_required',
      message: 'Cloudflare security verification required. Open ChatGPT window to solve challenge.',
      hasPromptInput: false,
      hasLoginButton: false,
      hasCloudflare: true,
      isRateLimited: false,
    };
  }

  // 3. Rate Limit Detection
  const bodyText = root.body ? String(root.body.innerText || root.body.textContent || '') : '';
  const isRateLimited =
    bodyText.includes("You've reached our limit") ||
    bodyText.includes('Rate limit reached') ||
    bodyText.includes('Too many requests') ||
    bodyText.includes('You have reached the max');

  if (isRateLimited) {
    return {
      status: 'rate_limited',
      message: 'ChatGPT rate limit active. Please wait or switch models.',
      hasPromptInput: false,
      hasLoginButton: false,
      hasCloudflare: false,
      isRateLimited: true,
    };
  }

  // 4. Prompt Input & Submission Control Detection (Ready State)
  const composer = findComposerElement(root);
  const hasPromptInput = Boolean(composer);

  if (hasPromptInput) {
    return {
      status: 'ready',
      message: 'Composer and submission controls verified ready.',
      hasPromptInput: true,
      hasLoginButton: false,
      hasCloudflare: false,
      isRateLimited: false,
    };
  }

  // 5. Login Button Detection (Logged Out State)
  const loginSelectors = [
    'button[data-testid="login-button"]',
    'button[data-testid="signup-button"]',
    'a[href*="/auth/login"]',
    'a[href*="/login"]',
    'a[href*="login.openai.com"]'
  ];
  const hasLoginButton = loginSelectors.some((sel) => {
    const el = root.querySelector?.(sel);
    return el && isElementVisible(el);
  });

  if (hasLoginButton) {
    return {
      status: 'login_required',
      message: 'Sign in required to use ChatGPT. Click Show/Login to authenticate.',
      hasPromptInput: false,
      hasLoginButton: true,
      hasCloudflare: false,
      isRateLimited: false,
    };
  }

  // 6. Authenticated Chat Shell Detection (Logged In, but composer not yet active)
  const authShellSelectors = [
    'nav',
    'aside',
    '[data-testid="profile-button"]',
    'button[aria-label="User menu"]',
    'img[alt="User"]',
    '#sidebar'
  ];
  const hasAuthShell = authShellSelectors.some((sel) => {
    const el = root.querySelector?.(sel);
    return el && isElementVisible(el);
  });

  if (hasAuthShell) {
    return {
      status: 'authenticated',
      message: 'Session authenticated; waiting for composer and submission controls to become interactive.',
      hasPromptInput: false,
      hasLoginButton: false,
      hasCloudflare: false,
      isRateLimited: false,
    };
  }

  // 7. Neither composer nor login nor shell found (SPA stabilizing / hydrating)
  return {
    status: 'not_configured',
    message: 'Waiting for ChatGPT interface to stabilize...',
    hasPromptInput: false,
    hasLoginButton: false,
    hasCloudflare: false,
    isRateLimited: false,
  };
}

/**
 * Builds the browser-executable script that stages the prompt,
 * clicks Send (or falls back to Enter), and waits for observable evidence.
 */
export function buildClientSideSendScript(prompt: string): string {
  const promptJson = JSON.stringify(prompt);

  return `
    (async () => {
      const visible = (el) => !!el && !!(el.offsetWidth || el.offsetHeight || (el.getClientRects && el.getClientRects().length));

      const normalize = (val) => String(val || '')
        .replace(/\\r\\n?/g, '\\n')
        .replace(/\\u00a0/g, ' ')
        .replace(/[\\u200B-\\u200D\\uFEFF]/g, '')
        .replace(/[\\t\\f\\v ]+/g, ' ')
        .replace(/ *\\n */g, '\\n')
        .replace(/\\n{2,}/g, '\\n')
        .trim();

      // 1. Count existing user messages to establish baseline
      const userSelectors = [
        '[data-message-author-role="user"]',
        '[data-content-search-unit-key$=":user"]',
        '[data-chatgpt-search-unit-key$=":user"]',
        '[data-turn="user"]',
        'article[data-testid^="conversation-turn-"] [data-message-author-role="user"]',
        '[data-user-message-bubble="true"]'
      ];
      let initialUserCount = 0;
      for (const sel of userSelectors) {
        const found = Array.from(document.querySelectorAll(sel)).filter(visible);
        if (found.length > 0) {
          initialUserCount = found.length;
          break;
        }
      }

      // 2. Locate active composer
      const composerSelectors = [
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

      let composer = null;
      for (const sel of composerSelectors) {
        const candidates = Array.from(document.querySelectorAll(sel)).filter(visible);
        if (candidates.length > 0) {
          composer = candidates[candidates.length - 1];
          break;
        }
      }

      if (!composer) {
        return { ok: false, stage: 'find_composer', error: 'ChatGPT message composer not found.' };
      }

      // 3. Stage the prompt into the composer
      composer.focus();
      const promptText = ${promptJson};

      if (composer.matches && composer.matches('textarea, input')) {
        const proto = composer instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(composer, promptText); else composer.value = promptText;
        composer.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: promptText }));
        composer.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        composer.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      } else {
        // Rich text ProseMirror/Lexical contenteditable editor
        try {
          const transfer = new DataTransfer();
          transfer.setData('text/plain', promptText);
          transfer.setData('text/html', promptText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\\r\\n|\\r|\\n/g, '<br>'));
          const pasteEvent = new ClipboardEvent('paste', {
            clipboardData: transfer,
            bubbles: true,
            cancelable: true,
            composed: true
          });
          composer.dispatchEvent(pasteEvent);
        } catch (_) {}

        // Fallback to execCommand if paste did not stage
        const currentContent = String(composer.innerText || composer.textContent || '');
        if (!currentContent || !currentContent.includes(promptText.substring(0, 30))) {
          if (typeof document.execCommand === 'function') {
            try { document.execCommand('insertText', false, promptText); } catch (_) {}
          }
        }

        // Direct property fallback if still unpopulated
        const checkContent = String(composer.innerText || composer.textContent || '');
        if (!checkContent || !checkContent.includes(promptText.substring(0, 30))) {
          composer.textContent = promptText;
        }

        composer.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: promptText }));
        composer.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        composer.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      }

      // Allow React state a moment to process input
      await new Promise((r) => setTimeout(r, 250));

      const stagedContent = normalize(composer.value || composer.innerText || composer.textContent || '');
      if (!stagedContent) {
        return { ok: false, stage: 'stage_prompt', error: 'Failed to populate ChatGPT message composer.' };
      }

      // 4. Locate and trigger send button with bounded retry (up to 4500ms)
      const form = composer.closest ? composer.closest('form') : document.querySelector('form');
      const searchRoots = form ? [form, document] : [document];

      const sendSelectors = [
        'button[data-testid="send-button"]',
        'button[data-testid*="send"]',
        'button[data-testid="fruitjuice-send-button"]',
        '#composer-submit-button',
        'button[aria-label="Send prompt" i]',
        'button[aria-label="Send message" i]',
        'button[aria-label="Send" i]',
        'button[aria-label="Submit" i]',
        'form button[type="submit"]',
        'button[type="submit"]'
      ];

      const findSendTarget = () => {
        const seen = new Set();
        for (const root of searchRoots) {
          for (const sel of sendSelectors) {
            const btns = Array.from(root.querySelectorAll(sel));
            for (const b of btns) {
              if (seen.has(b)) continue;
              seen.add(b);
              if (!visible(b)) continue;
              const disabled = Boolean(b.disabled || b.getAttribute('aria-disabled') === 'true');
              if (!disabled) {
                return { button: b, selector: sel };
              }
            }
          }
        }
        if (form) {
          const formButtons = Array.from(form.querySelectorAll('button'));
          for (const btn of formButtons) {
            if (seen.has(btn) || !visible(btn)) continue;
            seen.add(btn);
            const hasSendSvg = Boolean(
              btn.querySelector('svg path[d*="M0.5"]') ||
              btn.querySelector('svg path[d*="M2.5"]') ||
              btn.querySelector('svg path[d*="M12 2"]') ||
              btn.querySelector('svg[data-icon="arrow-up"]')
            );
            const ariaLabel = String(btn.getAttribute('aria-label') || '').toLowerCase();
            const disabled = Boolean(btn.disabled || btn.getAttribute('aria-disabled') === 'true');
            if (!disabled && (hasSendSvg || ariaLabel.includes('send') || ariaLabel.includes('submit'))) {
              return { button: btn, selector: 'form-button-svg' };
            }
          }
        }
        return null;
      };

      const startFind = Date.now();
      let sendTarget = null;
      while (Date.now() - startFind < 4500) {
        sendTarget = findSendTarget();
        if (sendTarget) break;
        await new Promise((r) => setTimeout(r, 200));
      }

      let actionTaken = 'none';

      if (sendTarget) {
        // Re-verify immediately before click
        if (visible(sendTarget.button) && !sendTarget.button.disabled) {
          sendTarget.button.click();
          actionTaken = 'clicked_button:' + sendTarget.selector;
        }
      }

      // If Send button not found or click didn't trigger, use verified keyboard Enter fallback
      if (actionTaken === 'none') {
        composer.focus();
        const currentInComposer = normalize(composer.value || composer.innerText || composer.textContent || '');
        if (currentInComposer.length > 0) {
          const enterDown = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
            composed: true
          });
          composer.dispatchEvent(enterDown);
          composer.dispatchEvent(new KeyboardEvent('keyup', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
            composed: true
          }));
          actionTaken = 'keyboard_enter';
        }
      }

      // 5. Observable submission verification (up to 7000ms)
      const promptPrefix = normalize(promptText.substring(0, 40));
      const startVerify = Date.now();
      let confirmed = false;
      let confirmSignal = 'timeout';

      while (Date.now() - startVerify < 7000) {
        // Signal A: User message count increased or text matches
        for (const sel of userSelectors) {
          const found = Array.from(document.querySelectorAll(sel)).filter(visible);
          if (found.length > initialUserCount) {
            confirmed = true;
            confirmSignal = 'user_message_count_increased';
            break;
          }
          if (found.length > 0) {
            const lastText = normalize(found[found.length - 1].innerText || found[found.length - 1].textContent);
            if (promptPrefix && lastText.includes(promptPrefix)) {
              confirmed = true;
              confirmSignal = 'user_message_matched_content';
              break;
            }
          }
        }
        if (confirmed) break;

        // Signal B: Stop generating button appeared (active streaming)
        const stopSelectors = [
          'button[data-testid="stop-button"]',
          '[data-testid="stop-button"]',
          'button[aria-label*="Stop generating" i]',
          'button[aria-label*="Stop response" i]',
          'button[aria-label*="Stop" i]'
        ];
        for (const sel of stopSelectors) {
          const stopBtn = document.querySelector(sel);
          if (stopBtn && visible(stopBtn)) {
            confirmed = true;
            confirmSignal = 'stop_button_visible';
            break;
          }
        }
        if (confirmed) break;

        // Signal C: Assistant streaming begins
        const assistantBubbles = Array.from(document.querySelectorAll('[data-message-author-role="assistant"]')).filter(visible);
        if (assistantBubbles.length > 0) {
          const lastText = normalize(assistantBubbles[assistantBubbles.length - 1].innerText || assistantBubbles[assistantBubbles.length - 1].textContent);
          if (lastText.length > 0) {
            confirmed = true;
            confirmSignal = 'assistant_streaming_active';
            break;
          }
        }

        await new Promise((r) => setTimeout(r, 250));
      }

      if (!confirmed) {
        return {
          ok: false,
          stage: 'verify_submission',
          actionTaken,
          error: 'Prompt inserted but submission could not be confirmed. Open the ChatGPT window and send or verify the message manually.'
        };
      }

      return {
        ok: true,
        stage: 'submitted',
        actionTaken,
        signal: confirmSignal
      };
    })()
  `;
}
