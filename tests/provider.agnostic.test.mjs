import test from 'node:test';
import assert from 'node:assert/strict';
import { ConsensusOrchestrator } from '../dist-electron/main/consensus/orchestrator.js';

// Helper mock provider manager
function createMockProviderManager(overrides = {}) {
  const defaultStates = {
    chatgpt: { id: 'chatgpt', name: 'ChatGPT', status: 'ready', enabled: true, quotaProtected: false },
    gemini: { id: 'gemini', name: 'Gemini', status: 'ready', enabled: true, quotaProtected: false },
    deepseek: { id: 'deepseek', name: 'DeepSeek', status: 'ready', enabled: true, quotaProtected: false },
    claude: { id: 'claude', name: 'Claude', status: 'ready', enabled: true, quotaProtected: true },
  };

  const states = { ...defaultStates, ...(overrides.states || {}) };
  const callLog = [];

  return {
    callLog,
    async checkStatus(id) {
      return states[id] || { id, name: id, status: 'not_configured', enabled: false, quotaProtected: false };
    },
    getStatus(id) {
      return states[id] || { id, name: id, status: 'not_configured', enabled: false, quotaProtected: false };
    },
    async sendPrompt(id, prompt) {
      callLog.push({ id, prompt });
      if (overrides.sendPrompt) {
        return overrides.sendPrompt(id, prompt, callLog.length);
      }

      // Default mock responses
      if (id === 'gemini') {
        return {
          ok: true,
          response: `Gemini Architectural Proposal:
Modular layout with CSS variables and responsive breakpoints.
\`\`\`json
{
  "version": "1.0",
  "title": "Gemini Planned Architecture",
  "summary": "Implement responsive navigation with theme toggle",
  "decisions": ["Use CSS variables", "Component isolation"],
  "tasks": [
    {
      "id": "task-1",
      "title": "Add Nav Component",
      "files": ["src/components/Nav.tsx"],
      "description": "Create responsive nav bar",
      "testCommand": "npm test"
    }
  ],
  "criteria": ["Renders on mobile and desktop"],
  "unresolvedRisks": []
}
\`\`\``
        };
      }

      if (id === 'deepseek') {
        return {
          ok: true,
          response: `DeepSeek Synthesized Plan:
\`\`\`json
{
  "version": "1.0",
  "title": "DeepSeek Synthesized Architecture",
  "summary": "Complete implementation plan with verified tasks",
  "decisions": ["Strict typing", "Zero-dependency layout"],
  "tasks": [
    {
      "id": "task-1",
      "title": "Implement core logic",
      "files": ["src/core/logic.ts"],
      "description": "Add robust state management",
      "testCommand": "npm test"
    }
  ],
  "criteria": ["Passes all unit tests"],
  "unresolvedRisks": []
}
\`\`\``
        };
      }

      if (id === 'chatgpt') {
        return {
          ok: true,
          response: `ChatGPT Proposal:
Architecture recommendation with modular services.`
        };
      }

      if (id === 'claude') {
        return {
          ok: true,
          response: `Claude Review:
Security analysis verified.`
        };
      }

      return { ok: false, error: `Unknown provider ${id}` };
    }
  };
}

// ----------------------------------------------------------------------------
// Test 1: Gemini selected as starting provider receives Turn 1
// ----------------------------------------------------------------------------
test('Provider Agnostic: Gemini selected as starting provider receives Turn 1', async () => {
  const orchestrator = new ConsensusOrchestrator();
  const mockPm = createMockProviderManager();
  const logs = [];

  const result = await orchestrator.run({
    idea: 'Add responsive navigation',
    workspace: 'D:\\TestProject',
    selectedProviders: { chatgpt: true, gemini: true, deepseek: true, claude: false },
    startingProvider: 'gemini',
    providerManager: mockPm,
    onLog: (chunk) => logs.push(chunk),
    onTurnUpdate: () => {},
    onStageChange: () => {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.stage, 'awaiting_confirmation');
  assert.equal(result.turns[0].providerId, 'gemini');
  assert.equal(result.turns[0].turnNumber, 1);
  assert.equal(result.turns[0].role, 'Lead Architect');
  assert.equal(result.turns[0].status, 'success');
  assert.equal(mockPm.callLog[0].id, 'gemini');
});

// ----------------------------------------------------------------------------
// Test 2: DeepSeek selected as starting provider receives Turn 1
// ----------------------------------------------------------------------------
test('Provider Agnostic: DeepSeek selected as starting provider receives Turn 1', async () => {
  const orchestrator = new ConsensusOrchestrator();
  const mockPm = createMockProviderManager();

  const result = await orchestrator.run({
    idea: 'Refactor database schema',
    workspace: 'D:\\TestProject',
    selectedProviders: { chatgpt: true, gemini: true, deepseek: true, claude: false },
    startingProvider: 'deepseek',
    providerManager: mockPm,
    onLog: () => {},
    onTurnUpdate: () => {},
    onStageChange: () => {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.turns[0].providerId, 'deepseek');
  assert.equal(result.turns[0].role, 'Lead Architect');
  assert.equal(mockPm.callLog[0].id, 'deepseek');
});

// ----------------------------------------------------------------------------
// Test 3: ChatGPT selected as starting provider receives Turn 1
// ----------------------------------------------------------------------------
test('Provider Agnostic: ChatGPT selected as starting provider receives Turn 1', async () => {
  const orchestrator = new ConsensusOrchestrator();
  const mockPm = createMockProviderManager();

  const result = await orchestrator.run({
    idea: 'Build notifications',
    workspace: 'D:\\TestProject',
    selectedProviders: { chatgpt: true, gemini: true, deepseek: true, claude: false },
    startingProvider: 'chatgpt',
    providerManager: mockPm,
    onLog: () => {},
    onTurnUpdate: () => {},
    onStageChange: () => {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.turns[0].providerId, 'chatgpt');
  assert.equal(result.turns[0].role, 'Lead Architect');
  assert.equal(mockPm.callLog[0].id, 'chatgpt');
});

// ----------------------------------------------------------------------------
// Test 4: Claude can start the relay when selected
// ----------------------------------------------------------------------------
test('Provider Agnostic: Claude can start the relay when selected as starting provider', async () => {
  const orchestrator = new ConsensusOrchestrator();
  const mockPm = createMockProviderManager();

  const result = await orchestrator.run({
    idea: 'Security audit and hardening',
    workspace: 'D:\\TestProject',
    selectedProviders: { chatgpt: false, gemini: false, deepseek: true, claude: true },
    startingProvider: 'claude',
    providerManager: mockPm,
    onLog: () => {},
    onTurnUpdate: () => {},
    onStageChange: () => {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.turns[0].providerId, 'claude');
  assert.equal(result.turns[0].role, 'Lead Architect');
  assert.equal(result.turns[1].providerId, 'deepseek');
  assert.equal(result.turns[1].role, 'Implementation Synthesizer');
});

// ----------------------------------------------------------------------------
// Test 5: Pipeline does NOT require ChatGPT (Gemini + DeepSeek only)
// ----------------------------------------------------------------------------
test('Provider Agnostic: Pipeline runs cleanly without ChatGPT (Gemini + DeepSeek only)', async () => {
  const orchestrator = new ConsensusOrchestrator();
  // ChatGPT is not configured or disabled entirely
  const mockPm = createMockProviderManager({
    states: {
      chatgpt: { id: 'chatgpt', name: 'ChatGPT', status: 'not_configured', enabled: false, quotaProtected: false }
    }
  });

  const logs = [];
  const result = await orchestrator.run({
    idea: 'Implement user onboarding flow',
    workspace: 'D:\\TestProject',
    selectedProviders: { chatgpt: false, gemini: true, deepseek: true, claude: false },
    startingProvider: 'gemini',
    providerManager: mockPm,
    onLog: (chunk) => logs.push(chunk),
    onTurnUpdate: () => {},
    onStageChange: () => {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.stage, 'awaiting_confirmation');
  assert.ok(result.packet);
  assert.equal(result.packet.version, '1.0');
  // Confirm ChatGPT was NEVER called
  assert.equal(mockPm.callLog.some((c) => c.id === 'chatgpt'), false);
  // Confirm turns only contain active models
  assert.equal(result.turns.filter((t) => t.status === 'success').length, 2);
  assert.equal(result.turns[0].providerId, 'gemini');
  assert.equal(result.turns[1].providerId, 'deepseek');
});

// ----------------------------------------------------------------------------
// Test 6: Solo mode executes single model for proposal + schema 1.0 packet
// ----------------------------------------------------------------------------
test('Provider Agnostic: Solo mode executes single model for architecture and schema 1.0 packet', async () => {
  const orchestrator = new ConsensusOrchestrator();
  const mockPm = createMockProviderManager();

  const result = await orchestrator.run({
    idea: 'Implement fast search cache',
    workspace: 'D:\\TestProject',
    selectedProviders: { chatgpt: false, gemini: true, deepseek: false, claude: false },
    startingProvider: 'gemini',
    providerManager: mockPm,
    onLog: () => {},
    onTurnUpdate: () => {},
    onStageChange: () => {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.stage, 'awaiting_confirmation');
  assert.ok(result.packet);
  assert.equal(result.packet.title, 'Gemini Planned Architecture');
  assert.equal(result.turns.length, 1);
  assert.equal(result.turns[0].role, 'Autonomous Architect & Synthesizer');
  assert.equal(result.turns[0].status, 'success');
  assert.equal(mockPm.callLog.length, 1);
  assert.equal(mockPm.callLog[0].id, 'gemini');
});

// ----------------------------------------------------------------------------
// Test 7: Unavailable starting provider fails explicitly at preflight without silent substitution
// ----------------------------------------------------------------------------
test('Provider Agnostic: Unavailable starting provider fails explicitly at preflight with zero silent substitution', async () => {
  const orchestrator = new ConsensusOrchestrator();
  // Gemini is login_required
  const mockPm = createMockProviderManager({
    states: {
      gemini: { id: 'gemini', name: 'Gemini', status: 'login_required', enabled: true, quotaProtected: false, lastMessage: 'Login required.' }
    }
  });

  const logs = [];
  const result = await orchestrator.run({
    idea: 'Add payment gateway',
    workspace: 'D:\\TestProject',
    selectedProviders: { chatgpt: true, gemini: true, deepseek: true, claude: false },
    startingProvider: 'gemini',
    providerManager: mockPm,
    onLog: (chunk) => logs.push(chunk),
    onTurnUpdate: () => {},
    onStageChange: () => {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.stage, 'failed');
  assert.match(result.error, /Gemini.*is not ready/i);
  // Must NOT fall back to ChatGPT or DeepSeek
  assert.equal(mockPm.callLog.length, 0);
  assert.equal(result.turns.length, 0);
});

// ----------------------------------------------------------------------------
// Test 8: 'authenticated' state (logged in but composer unready) is not treated as 'ready'
// ----------------------------------------------------------------------------
test('Provider Agnostic: authenticated state (logged in but composer unready) blocks preflight', async () => {
  const orchestrator = new ConsensusOrchestrator();
  // DeepSeek is authenticated (logged in, but composer not interactive)
  const mockPm = createMockProviderManager({
    states: {
      deepseek: {
        id: 'deepseek',
        name: 'DeepSeek',
        status: 'authenticated',
        enabled: true,
        quotaProtected: false,
        lastMessage: 'Authenticated. Waiting for message composer to become interactive.'
      }
    }
  });

  const logs = [];
  const result = await orchestrator.run({
    idea: 'Add telemetry exporter',
    workspace: 'D:\\TestProject',
    selectedProviders: { chatgpt: false, gemini: true, deepseek: true, claude: false },
    startingProvider: 'gemini',
    providerManager: mockPm,
    onLog: (chunk) => logs.push(chunk),
    onTurnUpdate: () => {},
    onStageChange: () => {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.stage, 'failed');
  assert.match(result.error, /DeepSeek.*is not ready/i);
  assert.match(result.error, /AUTHENTICATED/i);
  assert.equal(mockPm.callLog.length, 0);
});

// ----------------------------------------------------------------------------
// Test 9: Starter send failure halts immediately without silent substitution
// ----------------------------------------------------------------------------
test('Provider Agnostic: Starter send failure halts immediately without silent substitution', async () => {
  const orchestrator = new ConsensusOrchestrator();
  const mockPm = createMockProviderManager({
    sendPrompt: async (id) => {
      if (id === 'gemini') {
        return { ok: false, error: 'Send button not found or disabled.' };
      }
      return { ok: true, response: 'Fallback should never be called' };
    }
  });

  const result = await orchestrator.run({
    idea: 'Implement real-time sync',
    workspace: 'D:\\TestProject',
    selectedProviders: { chatgpt: true, gemini: true, deepseek: true, claude: false },
    startingProvider: 'gemini',
    providerManager: mockPm,
    onLog: () => {},
    onTurnUpdate: () => {},
    onStageChange: () => {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.stage, 'failed');
  assert.match(result.error, /Turn 1 \(Gemini\) failed/i);
  assert.match(result.error, /Halting pipeline without silent substitution/i);
  // Only 1 call was made; no subsequent models were called
  assert.equal(mockPm.callLog.length, 1);
  assert.equal(mockPm.callLog[0].id, 'gemini');
  assert.equal(result.turns[0].status, 'error');
});

// ----------------------------------------------------------------------------
// Test 10: Dynamic role assignment is determined by relay position, not provider ID
// ----------------------------------------------------------------------------
test('Provider Agnostic: Roles are dynamic and not tied to hardcoded provider identities', async () => {
  const orchestrator = new ConsensusOrchestrator();
  const mockPm = createMockProviderManager();

  // Relay order: DeepSeek (starter) -> Gemini (reviewer) -> ChatGPT (synthesizer)
  const result = await orchestrator.run({
    idea: 'Build data pipeline',
    workspace: 'D:\\TestProject',
    selectedProviders: { chatgpt: true, gemini: true, deepseek: true, claude: false },
    startingProvider: 'deepseek',
    providerManager: mockPm,
    onLog: () => {},
    onTurnUpdate: () => {},
    onStageChange: () => {},
  });

  assert.equal(result.turns[0].providerId, 'deepseek');
  assert.equal(result.turns[0].role, 'Lead Architect');

  assert.equal(result.turns[1].providerId, 'chatgpt');
  assert.equal(result.turns[1].role, 'Collaborative Reviewer');

  assert.equal(result.turns[2].providerId, 'gemini');
  assert.equal(result.turns[2].role, 'Implementation Synthesizer');
});

// ----------------------------------------------------------------------------
// Test 11: Synthesizer send failure halts without silent substitution
// ----------------------------------------------------------------------------
test('Provider Agnostic: Synthesizer send failure halts without silent substitution', async () => {
  const orchestrator = new ConsensusOrchestrator();
  const mockPm = createMockProviderManager({
    sendPrompt: async (id) => {
      if (id === 'gemini') {
        return { ok: true, response: 'Architecture proposal by Gemini' };
      }
      if (id === 'deepseek') {
        return { ok: false, error: 'Rate limit exceeded on final synthesis.' };
      }
      return { ok: false, error: 'Unexpected provider' };
    }
  });

  const result = await orchestrator.run({
    idea: 'Add reporting module',
    workspace: 'D:\\TestProject',
    selectedProviders: { chatgpt: false, gemini: true, deepseek: true, claude: false },
    startingProvider: 'gemini',
    providerManager: mockPm,
    onLog: () => {},
    onTurnUpdate: () => {},
    onStageChange: () => {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.stage, 'failed');
  assert.match(result.error, /Turn 2 \(DeepSeek\) failed/i);
  assert.match(result.error, /Halting pipeline without silent substitution/i);
});

// ----------------------------------------------------------------------------
// Test 12: Zero models selected fails preflight with clear actionable error
// ----------------------------------------------------------------------------
test('Provider Agnostic: Zero models selected fails preflight with actionable error', async () => {
  const orchestrator = new ConsensusOrchestrator();
  const mockPm = createMockProviderManager();

  const result = await orchestrator.run({
    idea: 'No models selected test',
    workspace: 'D:\\TestProject',
    selectedProviders: { chatgpt: false, gemini: false, deepseek: false, claude: false },
    providerManager: mockPm,
    onLog: () => {},
    onTurnUpdate: () => {},
    onStageChange: () => {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.stage, 'failed');
  assert.match(result.error, /At least one AI model must be selected/i);
  assert.equal(mockPm.callLog.length, 0);
});
