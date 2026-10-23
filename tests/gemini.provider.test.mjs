import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiAdapter } from '../dist-electron/main/providers/gemini.js';

test('Gemini Adapter: Initialization and Configuration', () => {
  const adapter = new GeminiAdapter();

  assert.equal(adapter.id, 'gemini');
  assert.equal(adapter.name, 'Gemini (Feasibility)');
  assert.equal(adapter.loginUrl, 'https://gemini.google.com');
  assert.equal(adapter.quotaProtected, false);
  assert.equal(adapter.partition, 'persist:ai-provider-gemini');

  const initialState = adapter.getState();
  assert.equal(initialState.id, 'gemini');
  assert.equal(initialState.status, 'not_configured');
  assert.equal(initialState.enabled, true);

  adapter.destroy();
});

test('Gemini Adapter: Status change listener notification', () => {
  const adapter = new GeminiAdapter();
  let notifiedState = null;

  const unsubscribe = adapter.onStatusChanged((state) => {
    notifiedState = state;
  });

  // Simulated status change
  // @ts-ignore
  adapter.setStatus('ready', 'Gemini session active');

  assert.ok(notifiedState);
  assert.equal(notifiedState.status, 'ready');
  assert.equal(notifiedState.lastMessage, 'Gemini session active');

  unsubscribe();
  adapter.destroy();
});

test('Gemini Adapter: Prompt rejection when session not in ready state', async () => {
  const adapter = new GeminiAdapter();

  const result = await adapter.sendPrompt('Review architectural plan');
  assert.equal(result.ok, false);
  assert.match(result.error || '', /not ready/i);

  adapter.destroy();
});
