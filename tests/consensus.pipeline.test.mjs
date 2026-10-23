import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDecisionPacket, extractJsonFromText } from '../dist-electron/shared/schema.js';
import { ConsensusOrchestrator } from '../dist-electron/main/consensus/orchestrator.js';

// ----------------------------------------------------------------------------
// 1. Schema Validation Tests
// ----------------------------------------------------------------------------
test('Schema: extractJsonFromText handles markdown fenced blocks and substrings', () => {
  const fenced = `Here is our implementation plan:
\`\`\`json
{
  "version": "1.0",
  "title": "Dark Mode Toggle",
  "summary": "Implement dark theme",
  "decisions": ["Use CSS variables"],
  "tasks": [{ "id": "t1", "title": "Add theme CSS", "files": ["styles.css"], "description": "Add styles" }],
  "criteria": ["Theme persists"],
  "unresolvedRisks": []
}
\`\`\`
Hope this helps!`;

  const extracted = extractJsonFromText(fenced);
  assert.equal(extracted.ok, true);
  assert.equal(extracted.data.version, '1.0');
  assert.equal(extracted.data.title, 'Dark Mode Toggle');

  // Substring bracket extraction without markdown ticks
  const plain = `Some notes before { "version": "1.0", "title": "Raw JSON", "summary": "test", "decisions": ["d1"], "tasks": [{ "id": "t1", "title": "Task", "files": [], "description": "desc" }], "criteria": [], "unresolvedRisks": [] } some notes after`;
  const plainExtracted = extractJsonFromText(plain);
  assert.equal(plainExtracted.ok, true);
  assert.equal(plainExtracted.data.title, 'Raw JSON');
});

test('Schema: validateDecisionPacket validates complete valid packet', () => {
  const valid = {
    version: '1.0',
    title: 'Dark Theme Feature',
    summary: 'Add dark theme support with local persistence',
    decisions: ['Use CSS Custom Properties', 'Persist preference in localStorage'],
    tasks: [
      {
        id: 'task-1',
        title: 'Create ThemeContext',
        files: ['src/context/ThemeContext.tsx'],
        description: 'Implement React context provider for dark/light state',
        testCommand: 'npm test tests/theme.test.tsx',
      },
      {
        id: 'task-2',
        title: 'Add Toggle Widget',
        files: ['src/components/ThemeToggle.tsx'],
        description: 'Header toggle button with sun/moon icons',
      },
    ],
    criteria: ['Theme switches instantly', 'Selection persists on reload'],
    unresolvedRisks: ['Check high contrast mode compatibility'],
  };

  const res = validateDecisionPacket(valid);
  assert.equal(res.valid, true);
  assert.equal(res.errors.length, 0);
  assert.ok(res.packet);
  assert.equal(res.packet.title, 'Dark Theme Feature');
  assert.equal(res.packet.tasks.length, 2);
});

test('Schema: validateDecisionPacket rejects malformed structures', () => {
  // Wrong version
  const wrongVer = validateDecisionPacket({ version: '2.0', title: 'T', summary: 'S', decisions: ['D'], tasks: [{ id: '1', title: 'T', files: [], description: 'D' }], criteria: [], unresolvedRisks: [] });
  assert.equal(wrongVer.valid, false);
  assert.match(wrongVer.errors.join('; '), /expected "1.0"/);

  // Missing decisions array
  const noDecisions = validateDecisionPacket({ version: '1.0', title: 'T', summary: 'S', decisions: [], tasks: [{ id: '1', title: 'T', files: [], description: 'D' }], criteria: [], unresolvedRisks: [] });
  assert.equal(noDecisions.valid, false);
  assert.match(noDecisions.errors.join('; '), /decisions/i);

  // Missing tasks
  const noTasks = validateDecisionPacket({ version: '1.0', title: 'T', summary: 'S', decisions: ['D'], tasks: [], criteria: [], unresolvedRisks: [] });
  assert.equal(noTasks.valid, false);
  assert.match(noTasks.errors.join('; '), /tasks/i);
});

// ----------------------------------------------------------------------------
// 2. Mock Provider Manager Helper for Deterministic Pipeline Tests
// ----------------------------------------------------------------------------
function createMockProviderManager(overrides = {}) {
  const defaultStates = {
    chatgpt: { id: 'chatgpt', name: 'ChatGPT', status: 'ready', enabled: true, quotaProtected: false },
    gemini: { id: 'gemini', name: 'Gemini', status: 'ready', enabled: true, quotaProtected: false },
    deepseek: { id: 'deepseek', name: 'DeepSeek', status: 'ready', enabled: true, quotaProtected: false },
    claude: { id: 'claude', name: 'Claude', status: 'ready', enabled: true, quotaProtected: true },
  };

  const states = { ...defaultStates, ...(overrides.states || {}) };

  return {
    async checkStatus(id) {
      return states[id] || { id, name: id, status: 'not_configured', enabled: false, quotaProtected: false };
    },
    async sendPrompt(id, prompt) {
      if (overrides.sendPrompt) {
        return overrides.sendPrompt(id, prompt);
      }

      // Default mock successful responses
      if (id === 'chatgpt') {
        return {
          ok: true,
          response: 'Architecture Proposal:\n1. Create modular theme engine.\n2. Use CSS variables for color tokens.\n3. Implement React context.'
        };
      }
      if (id === 'gemini') {
        return {
          ok: true,
          response: 'Feasibility Review:\nProposal looks solid. Ensure system theme preference (prefers-color-scheme) is checked before fallback.'
        };
      }
      if (id === 'deepseek') {
        return {
          ok: true,
          response: `Implementation Plan:
We will add ThemeContext and ThemeToggle.
\`\`\`json
{
  "version": "1.0",
  "title": "Dark Mode Toggle Implementation",
  "summary": "Add ThemeContext with CSS variable switching and local storage persistence.",
  "decisions": [
    "Use CSS variables for theme tokens",
    "Persist theme preference in localStorage"
  ],
  "tasks": [
    {
      "id": "task-1",
      "title": "Theme Provider",
      "files": ["src/context/ThemeContext.tsx"],
      "description": "Create ThemeContext and useTheme hook",
      "testCommand": "npm test"
    }
  ],
  "criteria": [
    "Toggle updates UI immediately",
    "Theme persists across reload"
  ],
  "unresolvedRisks": []
}
\`\`\``
        };
      }
      if (id === 'claude') {
        return {
          ok: true,
          response: 'Auditor Verdict: Plan approved. Verified no CSS injection risks and accessibility attributes on toggle button.'
        };
      }

      return { ok: false, error: `Unknown provider ${id}` };
    }
  };
}

// ----------------------------------------------------------------------------
// 3. Deterministic Pipeline Execution Tests
// ----------------------------------------------------------------------------
test('Consensus Pipeline: Successful consensus flow halting at approval gate', async () => {
  const orchestrator = new ConsensusOrchestrator();
  const mockPm = createMockProviderManager();
  const logs = [];
  const turns = [];
  let currentStage = 'idle';

  const result = await orchestrator.run({
    idea: 'Add dark mode toggle',
    workspace: 'D:\\TestProject',
    selectedProviders: { chatgpt: true, gemini: true, deepseek: true, claude: false },
    providerManager: mockPm,
    onLog: (chunk) => logs.push(chunk),
    onTurnUpdate: (turn) => turns.push(turn),
    onStageChange: (stage) => { currentStage = stage; },
  });

  assert.equal(result.ok, true);
  // Must halt at awaiting_confirmation (Milestone 3 exit gate!)
  assert.equal(result.stage, 'awaiting_confirmation');
  assert.equal(currentStage, 'awaiting_confirmation');
  assert.ok(result.packet);
  assert.equal(result.packet.version, '1.0');
  assert.equal(result.packet.title, 'Dark Mode Toggle Implementation');
  assert.equal(result.packet.tasks.length, 1);
  assert.equal(result.packet.approvedByUser, false);

  // Turns: Turn 1 (ChatGPT), Turn 2 (Gemini), Turn 3 (DeepSeek), Turn 4 (Claude skipped)
  assert.equal(result.turns.length, 4);
  assert.equal(result.turns[0].status, 'success');
  assert.equal(result.turns[1].status, 'success');
  assert.equal(result.turns[2].status, 'success');
  assert.equal(result.turns[3].status, 'skipped'); // Claude skipped by default
});

test('Consensus Pipeline: Optional Claude Auditor executes when enabled', async () => {
  const orchestrator = new ConsensusOrchestrator();
  const mockPm = createMockProviderManager();

  const result = await orchestrator.run({
    idea: 'Add dark mode toggle',
    workspace: 'D:\\TestProject',
    selectedProviders: { chatgpt: true, gemini: true, deepseek: true, claude: true }, // Claude enabled
    providerManager: mockPm,
    onLog: () => {},
    onTurnUpdate: () => {},
    onStageChange: () => {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.turns.length, 4);
  assert.equal(result.turns[3].providerId, 'claude');
  assert.equal(result.turns[3].status, 'success');
  assert.match(result.turns[3].response, /Auditor Verdict/i);
});

test('Consensus Pipeline: Preflight fails cleanly if required provider is not ready', async () => {
  const orchestrator = new ConsensusOrchestrator();
  // ChatGPT is logged out
  const mockPm = createMockProviderManager({
    states: {
      chatgpt: { id: 'chatgpt', name: 'ChatGPT', status: 'login_required', enabled: true, quotaProtected: false }
    }
  });

  const logs = [];
  const result = await orchestrator.run({
    idea: 'Add feature',
    workspace: 'D:\\TestProject',
    selectedProviders: { chatgpt: true, gemini: true, deepseek: true, claude: false },
    providerManager: mockPm,
    onLog: (chunk) => logs.push(chunk),
    onTurnUpdate: () => {},
    onStageChange: () => {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.stage, 'failed');
  assert.match(result.error, /login_required/i);
  assert.equal(result.packet, null);
  // Zero fabricated responses
  assert.equal(result.turns.length, 0);
});

test('Consensus Pipeline: Handles provider failure during discussion', async () => {
  const orchestrator = new ConsensusOrchestrator();
  // ChatGPT fails with rate limit or network error
  const mockPm = createMockProviderManager({
    sendPrompt: async (id) => {
      if (id === 'chatgpt') {
        return { ok: false, error: 'Rate limit exceeded: 429 Too Many Requests' };
      }
      return { ok: true, response: 'ok' };
    }
  });

  const result = await orchestrator.run({
    idea: 'Add feature',
    workspace: 'D:\\TestProject',
    selectedProviders: { chatgpt: true, gemini: true, deepseek: true, claude: false },
    providerManager: mockPm,
    onLog: () => {},
    onTurnUpdate: () => {},
    onStageChange: () => {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.stage, 'failed');
  assert.match(result.error, /Rate limit/);
  assert.equal(result.turns[0].status, 'error');
});

test('Consensus Pipeline: Rejects malformed JSON from synthesizer', async () => {
  const orchestrator = new ConsensusOrchestrator();
  const mockPm = createMockProviderManager({
    sendPrompt: async (id) => {
      if (id === 'deepseek') {
        // Returns text without valid JSON
        return {
          ok: true,
          response: 'Here is what we should do: create files and run tests. No JSON block provided.'
        };
      }
      return { ok: true, response: 'Architectural notes.' };
    }
  });

  const result = await orchestrator.run({
    idea: 'Add feature',
    workspace: 'D:\\TestProject',
    selectedProviders: { chatgpt: true, gemini: true, deepseek: true, claude: false },
    providerManager: mockPm,
    onLog: () => {},
    onTurnUpdate: () => {},
    onStageChange: () => {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.stage, 'failed');
  assert.match(result.error, /Failed to extract JSON/);
});
