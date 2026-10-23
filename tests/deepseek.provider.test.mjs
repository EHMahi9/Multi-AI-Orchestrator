import test from 'node:test';
import assert from 'node:assert/strict';
import { DeepSeekAdapter } from '../dist-electron/main/providers/deepseek.js';

test('DeepSeek Adapter: Initialization and Configuration', () => {
  const adapter = new DeepSeekAdapter();

  assert.equal(adapter.id, 'deepseek');
  assert.equal(adapter.name, 'DeepSeek (Code Spec)');
  assert.equal(adapter.loginUrl, 'https://chat.deepseek.com');
  assert.equal(adapter.quotaProtected, false);
  assert.equal(adapter.partition, 'persist:ai-provider-deepseek');

  const initialState = adapter.getState();
  assert.equal(initialState.id, 'deepseek');
  assert.equal(initialState.status, 'not_configured');
  assert.equal(initialState.enabled, true);

  adapter.destroy();
});

test('DeepSeek Adapter: Status change listener notification', () => {
  const adapter = new DeepSeekAdapter();
  let notifiedState = null;

  const unsubscribe = adapter.onStatusChanged((state) => {
    notifiedState = state;
  });

  // Simulated status change
  // @ts-ignore
  adapter.setStatus('ready', 'DeepSeek session active');

  assert.ok(notifiedState);
  assert.equal(notifiedState.status, 'ready');
  assert.equal(notifiedState.lastMessage, 'DeepSeek session active');

  unsubscribe();
  adapter.destroy();
});

test('DeepSeek Adapter: Prompt rejection when session not in ready state', async () => {
  const adapter = new DeepSeekAdapter();

  const result = await adapter.sendPrompt('Analyze code specification');
  assert.equal(result.ok, false);
  assert.match(result.error || '', /not ready/i);

  adapter.destroy();
});
