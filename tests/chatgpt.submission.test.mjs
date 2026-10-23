import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findComposerElement,
  findSendButtonElement,
  checkSubmissionEvidenceDOM,
  probeChatGPTStatusDOM,
  normalizeText,
  readComposerText,
  buildClientSideSendScript
} from '../dist-electron/main/providers/chatgpt-dom.js';
import { ChatGPTAdapter } from '../dist-electron/main/providers/chatgpt.js';

// ----------------------------------------------------------------------------
// Deterministic Mock DOM Fixture Implementation
// (Clearly labeled as MOCKED DOM - not a live browser session)
// ----------------------------------------------------------------------------

class MockElement {
  constructor(tagName, attrs = {}, children = [], text = '') {
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attrs };
    this.children = [];
    this.innerText = text;
    this.textContent = text;
    this.value = attrs.value || '';
    this.disabled = Boolean(attrs.disabled);
    this.visible = attrs.visible !== false;
    this.offsetWidth = this.visible ? 100 : 0;
    this.offsetHeight = this.visible ? 30 : 0;
    this.id = attrs.id || '';
    this.className = attrs.class || '';
    this.clicked = false;
    this.isFocused = false;
    this.parent = null;
    this.dispatchedEvents = [];

    for (const child of children) {
      this.appendChild(child);
    }
  }

  appendChild(child) {
    child.parent = this;
    this.children.push(child);
  }

  getAttribute(name) {
    if (name === 'aria-disabled') return this.attributes['aria-disabled'] ?? (this.disabled ? 'true' : null);
    if (name === 'aria-hidden') return this.attributes['aria-hidden'] ?? null;
    return this.attributes[name] ?? null;
  }

  setAttribute(name, val) {
    this.attributes[name] = String(val);
    if (name === 'disabled') this.disabled = true;
    if (name === 'id') this.id = String(val);
    if (name === 'class') this.className = String(val);
  }

  removeAttribute(name) {
    delete this.attributes[name];
    if (name === 'disabled') this.disabled = false;
  }

  click() {
    this.clicked = true;
  }

  focus() {
    this.isFocused = true;
  }

  dispatchEvent(evt) {
    this.dispatchedEvents.push(evt);
    return true;
  }

  closest(selector) {
    let curr = this.parent;
    while (curr) {
      if (curr.matches && curr.matches(selector)) return curr;
      curr = curr.parent;
    }
    return null;
  }

  matches(selector) {
    const sel = selector.toLowerCase().trim();
    if (sel === 'textarea') return this.tagName === 'TEXTAREA';
    if (sel === 'input') return this.tagName === 'INPUT';
    if (sel === 'form') return this.tagName === 'FORM';
    if (sel === 'button') return this.tagName === 'BUTTON';

    if (sel.startsWith('#') && this.id) {
      return this.id.toLowerCase() === sel.substring(1);
    }

    if (sel.includes('[data-testid=')) {
      const match = sel.match(/\[data-testid=["']?([^"']+)["']?\]/);
      if (match && this.getAttribute('data-testid') === match[1]) return true;
    }

    if (sel.includes('[contenteditable="true"]')) {
      if (this.getAttribute('contenteditable') === 'true') return true;
    }

    return false;
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    const sel = selector.trim();

    const check = (node) => {
      let matched = false;
      const tag = node.tagName.toLowerCase();

      if (sel === 'textarea' && tag === 'textarea') matched = true;
      else if (sel === 'input' && tag === 'input') matched = true;
      else if (sel === 'button' && tag === 'button') matched = true;
      else if (sel === 'form' && tag === 'form') matched = true;
      else if (sel.startsWith('#')) {
        const idName = sel.substring(1);
        if (node.id === idName) matched = true;
      } else if (sel.includes('[data-testid=')) {
        const match = sel.match(/\[data-testid=["']?([^"']+)["']?\]/);
        if (match && node.getAttribute('data-testid') === match[1]) matched = true;
      } else if (sel.includes('[data-testid*=')) {
        const match = sel.match(/\[data-testid\*=["']?([^"']+)["']?\]/);
        const actual = node.getAttribute('data-testid') || '';
        if (match && actual.includes(match[1])) matched = true;
      } else if (sel.includes('[data-message-author-role=')) {
        const match = sel.match(/\[data-message-author-role=["']?([^"']+)["']?\]/);
        if (match && node.getAttribute('data-message-author-role') === match[1]) matched = true;
      } else if (sel.includes('[aria-label=')) {
        const match = sel.match(/\[aria-label=["']?([^"']+)["']?(\s+i)?\]/i);
        const actual = node.getAttribute('aria-label') || '';
        if (match && actual.toLowerCase() === match[1].toLowerCase()) matched = true;
      } else if (sel.includes('[aria-label*=')) {
        const match = sel.match(/\[aria-label\*=["']?([^"']+)["']?(\s+i)?\]/i);
        const actual = node.getAttribute('aria-label') || '';
        if (match && actual.toLowerCase().includes(match[1].toLowerCase())) matched = true;
      } else if (sel.includes('[contenteditable="true"]')) {
        if (node.getAttribute('contenteditable') === 'true') matched = true;
      } else if (sel.includes('[type="submit"]')) {
        if (node.getAttribute('type') === 'submit') matched = true;
      } else if (sel.includes('a[href*=')) {
        const match = sel.match(/a\[href\*=["']?([^"']+)["']?\]/);
        if (tag === 'a' && match && (node.getAttribute('href') || '').includes(match[1])) matched = true;
      }

      if (matched) results.push(node);

      for (const child of node.children) {
        check(child);
      }
    };

    for (const child of this.children) {
      check(child);
    }

    return results;
  }
}

class MockDocument extends MockElement {
  constructor(children = []) {
    super('DOCUMENT', {}, children);
    this.body = new MockElement('BODY', {}, children);
  }

  querySelector(selector) {
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
}

// ----------------------------------------------------------------------------
// Test 1: Current supported Send control found
// ----------------------------------------------------------------------------
test('ChatGPT Submission 1 (Mocked): Current supported Send control found (data-testid="send-button")', () => {
  const composer = new MockElement('DIV', { id: 'prompt-textarea', contenteditable: 'true' });
  const sendButton = new MockElement('BUTTON', { 'data-testid': 'send-button', 'aria-label': 'Send prompt' });
  const form = new MockElement('FORM', {}, [composer, sendButton]);
  const doc = new MockDocument([form]);

  const match = findSendButtonElement(doc, composer);
  assert.ok(match, 'Send button must be found');
  assert.equal(match.disabled, false);
  assert.equal(match.selector, 'button[data-testid="send-button"]');
  assert.equal(match.button, sendButton);
});

// ----------------------------------------------------------------------------
// Test 2: Alternative supported Send controls found
// ----------------------------------------------------------------------------
test('ChatGPT Submission 2 (Mocked): Alternative supported Send controls found across UI variations', () => {
  // Case A: button[aria-label="Send prompt"]
  const compA = new MockElement('TEXTAREA', { id: 'prompt-textarea' });
  const btnA = new MockElement('BUTTON', { 'aria-label': 'Send prompt' });
  const docA = new MockDocument([new MockElement('FORM', {}, [compA, btnA])]);
  const matchA = findSendButtonElement(docA, compA);
  assert.ok(matchA);
  assert.equal(matchA.button, btnA);

  // Case B: #composer-submit-button
  const compB = new MockElement('DIV', { id: 'prompt-textarea', contenteditable: 'true' });
  const btnB = new MockElement('BUTTON', { id: 'composer-submit-button' });
  const docB = new MockDocument([new MockElement('FORM', {}, [compB, btnB])]);
  const matchB = findSendButtonElement(docB, compB);
  assert.ok(matchB);
  assert.equal(matchB.button, btnB);

  // Case C: button[data-testid="fruitjuice-send-button"]
  const compC = new MockElement('DIV', { id: 'prompt-textarea', contenteditable: 'true' });
  const btnC = new MockElement('BUTTON', { 'data-testid': 'fruitjuice-send-button' });
  const docC = new MockDocument([new MockElement('FORM', {}, [compC, btnC])]);
  const matchC = findSendButtonElement(docC, compC);
  assert.ok(matchC);
  assert.equal(matchC.button, btnC);

  // Case D: form button[type="submit"]
  const compD = new MockElement('TEXTAREA', { id: 'prompt-textarea' });
  const btnD = new MockElement('BUTTON', { type: 'submit' });
  const docD = new MockDocument([new MockElement('FORM', {}, [compD, btnD])]);
  const matchD = findSendButtonElement(docD, compD);
  assert.ok(matchD);
  assert.equal(matchD.button, btnD);
});

// ----------------------------------------------------------------------------
// Test 3: Composer present but Send button unavailable
// ----------------------------------------------------------------------------
test('ChatGPT Submission 3 (Mocked): Composer present but Send button unavailable', () => {
  const composer = new MockElement('DIV', { id: 'prompt-textarea', contenteditable: 'true' });
  // Only speech dictation button present (composer is empty or in voice mode)
  const voiceBtn = new MockElement('BUTTON', { 'data-testid': 'composer-speech-button' });
  const form = new MockElement('FORM', {}, [composer, voiceBtn]);
  const doc = new MockDocument([form]);

  const match = findSendButtonElement(doc, composer);
  assert.equal(match, null, 'Should not match voice or unrelated buttons as Send');
});

// ----------------------------------------------------------------------------
// Test 4: Disabled Send button
// ----------------------------------------------------------------------------
test('ChatGPT Submission 4 (Mocked): Disabled Send button is recognized as disabled', () => {
  const composer = new MockElement('TEXTAREA', { id: 'prompt-textarea' });
  const disabledBtn = new MockElement('BUTTON', { 'data-testid': 'send-button', disabled: true });
  const form = new MockElement('FORM', {}, [composer, disabledBtn]);
  const doc = new MockDocument([form]);

  const match = findSendButtonElement(doc, composer);
  assert.ok(match);
  assert.equal(match.disabled, true, 'Must flag that button is currently disabled');
});

// ----------------------------------------------------------------------------
// Test 5: Wrong or inactive composer
// ----------------------------------------------------------------------------
test('ChatGPT Submission 5 (Mocked): Ignores inactive or hidden inputs and selects active composer', () => {
  const hiddenHomeInput = new MockElement('INPUT', { id: 'pending-home-input', visible: false });
  const activeComposer = new MockElement('DIV', { id: 'prompt-textarea', contenteditable: 'true', visible: true });
  const doc = new MockDocument([hiddenHomeInput, activeComposer]);

  const found = findComposerElement(doc);
  assert.ok(found);
  assert.equal(found, activeComposer, 'Must choose active visible composer');
});

// ----------------------------------------------------------------------------
// Test 6: Prompt inserted but not submitted
// ----------------------------------------------------------------------------
test('ChatGPT Submission 6 (Mocked): Detects unconfirmed submission and returns clear error', () => {
  const doc = new MockDocument([]);
  // Initial user count is 0, no messages added, no stop button
  const evidence = checkSubmissionEvidenceDOM(doc, 0, 'Test Prompt');
  assert.equal(evidence.confirmed, false);
  assert.equal(evidence.signal, 'none');
});

// ----------------------------------------------------------------------------
// Test 7: Submission confirmed via observable signals
// ----------------------------------------------------------------------------
test('ChatGPT Submission 7 (Mocked): Confirms submission via observable DOM signals', () => {
  // Signal A: User message count increased
  const userMsg = new MockElement('DIV', { 'data-message-author-role': 'user' }, [], 'Hello Architect');
  const docA = new MockDocument([userMsg]);
  const evA = checkSubmissionEvidenceDOM(docA, 0, 'Hello Architect');
  assert.equal(evA.confirmed, true);
  assert.equal(evA.signal, 'user_message_count_increased');

  // Signal B: Stop button appeared
  const stopBtn = new MockElement('BUTTON', { 'data-testid': 'stop-button' });
  const docB = new MockDocument([stopBtn]);
  const evB = checkSubmissionEvidenceDOM(docB, 0, 'Hello Architect');
  assert.equal(evB.confirmed, true);
  assert.equal(evB.signal, 'stop_button_visible');

  // Signal C: Assistant streaming begins
  const assistantMsg = new MockElement('DIV', { 'data-message-author-role': 'assistant' }, [], 'Thinking...');
  const docC = new MockDocument([assistantMsg]);
  const evC = checkSubmissionEvidenceDOM(docC, 0, 'Hello Architect');
  assert.equal(evC.confirmed, true);
  assert.equal(evC.signal, 'assistant_streaming_active');
});

// ----------------------------------------------------------------------------
// Test 8: Submission result uncertain
// ----------------------------------------------------------------------------
test('ChatGPT Submission 8 (Mocked): Submission result uncertain marks manual_intervention_required', async () => {
  const adapter = new ChatGPTAdapter();

  // Mock evaluate to simulate failed submission confirmation
  adapter.evaluate = async (script) => {
    if (script.includes('sendSelectors') || script.includes('buildClientSideSendScript')) {
      return {
        ok: false,
        stage: 'verify_submission',
        error: 'Prompt inserted but submission could not be confirmed. Open the ChatGPT window and send or verify the message manually.'
      };
    }
    return null;
  };

  // Mock status to ready
  adapter.setStatus('ready', 'Authenticated');

  const result = await adapter.sendPrompt('Create a module');
  assert.equal(result.ok, false);
  assert.match(result.error, /Prompt inserted but submission could not be confirmed/);
  assert.equal(adapter.getState().status, 'manual_intervention_required');

  adapter.destroy();
});

// ----------------------------------------------------------------------------
// Test 9: Delayed UI updates (React re-render handling)
// ----------------------------------------------------------------------------
test('ChatGPT Submission 9 (Mocked): Client script includes bounded retry for delayed React button rendering', () => {
  const script = buildClientSideSendScript('Test Delayed Render');
  assert.ok(script.includes('startFind = Date.now()'), 'Must contain bounded retry start timestamp');
  assert.ok(script.includes('4500'), 'Must retry for up to 4500ms to allow React button re-render');
  assert.ok(script.includes('keyboard_enter'), 'Must include validated Enter fallback');
  assert.ok(script.includes('7000'), 'Must include 7000ms bounded observable evidence check');
});

// ----------------------------------------------------------------------------
// Test 10: Retry without duplicate messages
// ----------------------------------------------------------------------------
test('ChatGPT Submission 10 (Mocked): Prevents duplicate send when submission is active', async () => {
  const adapter = new ChatGPTAdapter();

  // Simulate long running send
  let evaluateResolve;
  adapter.evaluate = () => new Promise((resolve) => { evaluateResolve = resolve; });
  adapter.setStatus('ready', 'Authenticated');

  const promptPromise1 = adapter.sendPrompt('Identical Prompt');

  // Immediately attempt second identical send while first is in flight
  const result2 = await adapter.sendPrompt('Identical Prompt');
  assert.equal(result2.ok, false);
  assert.match(result2.error, /already in progress/i);

  // Clean up
  evaluateResolve({ ok: false, error: 'Cancelled' });
  await promptPromise1;
  adapter.destroy();
});

// ----------------------------------------------------------------------------
// Test 11: Login-required and manual-intervention states
// ----------------------------------------------------------------------------
test('ChatGPT Submission 11 (Mocked): Probe detects login-required, Cloudflare, rate-limit, and ready states', () => {
  // A. Redirect to auth domain
  const resAuth = probeChatGPTStatusDOM(new MockDocument(), 'https://auth.openai.com/u/login');
  assert.equal(resAuth.status, 'login_required');

  // B. Login button in DOM
  const loginBtn = new MockElement('BUTTON', { 'data-testid': 'login-button' });
  const resLogin = probeChatGPTStatusDOM(new MockDocument([loginBtn]), 'https://chatgpt.com');
  assert.equal(resLogin.status, 'login_required');

  // C. Cloudflare challenge
  const cfChallenge = new MockElement('DIV', { id: 'challenge-stage' });
  const resCF = probeChatGPTStatusDOM(new MockDocument([cfChallenge]), 'https://chatgpt.com');
  assert.equal(resCF.status, 'manual_intervention_required');

  // D. Rate limit text
  const docRateLimit = new MockDocument([]);
  docRateLimit.body.textContent = "You've reached our limit on ChatGPT.";
  const resRL = probeChatGPTStatusDOM(docRateLimit, 'https://chatgpt.com');
  assert.equal(resRL.status, 'rate_limited');

  // E. Prompt input present (Ready)
  const composer = new MockElement('DIV', { id: 'prompt-textarea', contenteditable: 'true' });
  const resReady = probeChatGPTStatusDOM(new MockDocument([composer]), 'https://chatgpt.com');
  assert.equal(resReady.status, 'ready');

  // F. Blank / stabilizing state
  const resStabilizing = probeChatGPTStatusDOM(new MockDocument([]), 'https://chatgpt.com');
  assert.equal(resStabilizing.status, 'not_configured');
  assert.match(resStabilizing.message, /stabilize/i);
});

// ----------------------------------------------------------------------------
// Test 12: Accurate error reporting
// ----------------------------------------------------------------------------
test('ChatGPT Submission 12 (Mocked): Failed send preserves actionable guidance for user', async () => {
  const adapter = new ChatGPTAdapter();

  adapter.evaluate = async () => ({
    ok: false,
    stage: 'verify_submission',
    error: 'Prompt inserted but submission could not be confirmed. Open the ChatGPT window and send or verify the message manually.'
  });

  adapter.setStatus('ready', 'Authenticated');
  const res = await adapter.sendPrompt('Architectural proposal');

  assert.equal(res.ok, false);
  assert.equal(
    res.error,
    'Prompt inserted but submission could not be confirmed. Open the ChatGPT window and send or verify the message manually.'
  );

  const state = adapter.getState();
  assert.equal(state.status, 'manual_intervention_required');
  assert.equal(
    state.lastMessage,
    'Prompt inserted but submission could not be confirmed. Open the ChatGPT window and send or verify the message manually.'
  );

  adapter.destroy();
});
