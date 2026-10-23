import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatGPTAdapter } from '../dist-electron/main/providers/chatgpt.js';

test('ChatGPT Adapter: Initialization and Configuration', () => {
  const adapter = new ChatGPTAdapter();

  assert.equal(adapter.id, 'chatgpt');
  assert.equal(adapter.name, 'ChatGPT (Architect)');
  assert.equal(adapter.loginUrl, 'https://chatgpt.com');
  assert.equal(adapter.quotaProtected, false);
  assert.equal(adapter.partition, 'persist:ai-provider-chatgpt');

  const initialState = adapter.getState();
  assert.equal(initialState.id, 'chatgpt');
  assert.equal(initialState.status, 'not_configured');
  assert.equal(initialState.enabled, true);

  adapter.destroy();
});

test('ChatGPT Adapter: Status change listener notification', () => {
  const adapter = new ChatGPTAdapter();
  let notifiedState = null;

  const unsubscribe = adapter.onStatusChanged((state) => {
    notifiedState = state;
  });

  // Simulated status change
  // @ts-ignore access protected method for unit verification
  adapter.setStatus('ready', 'Session active and ready');

  assert.ok(notifiedState);
  assert.equal(notifiedState.status, 'ready');
  assert.equal(notifiedState.lastMessage, 'Session active and ready');

  unsubscribe();
  adapter.destroy();
});

test('ChatGPT Adapter: Prompt rejection when session not in ready state', async () => {
  const adapter = new ChatGPTAdapter();

  // Session is not_configured
  const result = await adapter.sendPrompt('Write a unit test');
  assert.equal(result.ok, false);
  assert.match(result.error || '', /not ready/i);

  adapter.destroy();
});
