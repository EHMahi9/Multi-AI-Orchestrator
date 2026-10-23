import test from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeAdapter } from '../dist-electron/main/providers/claude.js';

test('Claude Adapter: Initialization and Quota Guard Configuration', () => {
  const adapter = new ClaudeAdapter();

  assert.equal(adapter.id, 'claude');
  assert.equal(adapter.name, 'Claude (Auditor)');
  assert.equal(adapter.loginUrl, 'https://claude.ai');
  // Claude must be strictly quota protected and disabled by default
  assert.equal(adapter.quotaProtected, true, 'Claude must have quotaProtected: true');
  assert.equal(adapter.partition, 'persist:ai-provider-claude');

  const initialState = adapter.getState();
  assert.equal(initialState.id, 'claude');
  assert.equal(initialState.status, 'disabled');
  assert.equal(initialState.enabled, false);
  assert.match(initialState.lastMessage || '', /quota-protected/i);

  adapter.destroy();
});

test('Claude Adapter: Status change listener notification', () => {
  const adapter = new ClaudeAdapter();
  let notifiedState = null;

  const unsubscribe = adapter.onStatusChanged((state) => {
    notifiedState = state;
  });

  // Simulated status change when user enables session
  // @ts-ignore
  adapter.setStatus('ready', 'Claude session active');

  assert.ok(notifiedState);
  assert.equal(notifiedState.status, 'ready');
  assert.equal(notifiedState.lastMessage, 'Claude session active');

  unsubscribe();
  adapter.destroy();
});

test('Claude Adapter: Prompt rejection when disabled or not ready', async () => {
  const adapter = new ClaudeAdapter();

  // Disabled initial state
  const result = await adapter.sendPrompt('Audit code for security vulnerabilities');
  assert.equal(result.ok, false);
  assert.match(result.error || '', /not ready/i);

  adapter.destroy();
});

test('Claude Adapter: waitForResponse resolves immediately when completion signal and content exist', async () => {
  const adapter = new ClaudeAdapter();
  adapter.evaluate = async () => ({
    isStreaming: false,
    hasCompletionSignal: true,
    hasContent: true,
    text: 'Claude response completed successfully with action buttons.'
  });

  // @ts-ignore
  const res = await adapter.waitForResponse(5);
  assert.equal(res.ok, true);
  assert.equal(res.response, 'Claude response completed successfully with action buttons.');
});

test('Claude Adapter: waitForResponse resolves when text stabilizes across ticks', async () => {
  const adapter = new ClaudeAdapter();
  adapter.evaluate = async () => ({
    isStreaming: false,
    hasCompletionSignal: false,
    hasContent: true,
    text: 'Stabilized Claude proposal without action button signal.'
  });

  // @ts-ignore
  const res = await adapter.waitForResponse(5);
  assert.equal(res.ok, true);
  assert.equal(res.response, 'Stabilized Claude proposal without action button signal.');
});
