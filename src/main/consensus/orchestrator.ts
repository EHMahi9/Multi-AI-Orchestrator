import type { ProviderSessionManager } from '../providers/manager';
import { extractJsonFromText, validateDecisionPacket } from '../../shared/schema';
import type {
  ConsensusTurn,
  DecisionPacket,
  PipelineStage,
  ProviderId,
} from '../../shared/types';

export interface RunConsensusOptions {
  idea: string;
  workspace: string;
  selectedProviders: Record<ProviderId, boolean>;
  providerManager: ProviderSessionManager;
  onLog: (chunk: string) => void;
  onTurnUpdate: (turn: ConsensusTurn) => void;
  onStageChange: (stage: PipelineStage) => void;
}

export interface ConsensusPipelineResult {
  ok: boolean;
  stage: PipelineStage;
  packet: DecisionPacket | null;
  turns: ConsensusTurn[];
  error?: string;
}

export class ConsensusOrchestrator {
  private aborted = false;

  public abort(): void {
    this.aborted = true;
  }

  public async run(options: RunConsensusOptions): Promise<ConsensusPipelineResult> {
    const { idea, workspace, selectedProviders, providerManager, onLog, onTurnUpdate, onStageChange } = options;
    const turns: ConsensusTurn[] = [];

    this.aborted = false;

    // ------------------------------------------------------------------------
    // Stage 1: Preflight Verification
    // ------------------------------------------------------------------------
    onStageChange('preflight');
    onLog(`[Consensus Pipeline] Starting multi-AI consensus for goal: "${idea}"\n`);
    onLog(`[Workspace] Target: ${workspace}\n`);

    // Verify minimum required providers (ChatGPT and DeepSeek must be enabled)
    if (!selectedProviders.chatgpt) {
      const err = 'ChatGPT (Lead Architect) is required for the consensus pipeline.';
      onLog(`[Preflight Error] ${err}\n`);
      onStageChange('failed');
      return { ok: false, stage: 'failed', packet: null, turns, error: err };
    }
    if (!selectedProviders.deepseek) {
      const err = 'DeepSeek (Implementation Planner) is required for schema synthesis.';
      onLog(`[Preflight Error] ${err}\n`);
      onStageChange('failed');
      return { ok: false, stage: 'failed', packet: null, turns, error: err };
    }

    // Check actual runtime statuses of active providers
    onLog(`[Preflight] Verifying provider session authentication and readiness...\n`);
    for (const [idStr, enabled] of Object.entries(selectedProviders)) {
      const id = idStr as ProviderId;
      if (!enabled) continue;

      const state = await providerManager.checkStatus(id);
      if (state.status !== 'ready') {
        const err = `Provider "${state.name}" is not ready (Status: ${state.status.toUpperCase()}). Please click "Show / Login" to authenticate before starting.`;
        onLog(`[Preflight Error] ${err}\n`);
        onStageChange('failed');
        return { ok: false, stage: 'failed', packet: null, turns, error: err };
      }
      onLog(`  ✔ ${state.name}: READY (Partition: persist:ai-provider-${id})\n`);
    }

    if (this.aborted) {
      onStageChange('cancelled');
      return { ok: false, stage: 'cancelled', packet: null, turns, error: 'Pipeline cancelled by user.' };
    }

    // ------------------------------------------------------------------------
    // Stage 2: Multi-AI Discussion Relay (Debating)
    // ------------------------------------------------------------------------
    onStageChange('debating');

    // Turn 1: ChatGPT (Lead Architect)
    const turn1Start = Date.now();
    onLog(`\n[Turn 1] ChatGPT: Generating architectural proposal and decomposition...\n`);
    const prompt1 = `You are the Lead Architect in a Multi-AI Autonomous Development relay.
Project Goal: "${idea}"
Target Workspace: "${workspace}"

Provide a comprehensive architectural proposal:
1. System overview and decomposition.
2. Key architectural decisions and trade-offs.
3. Recommended file structure breakdown.
4. Edge cases and risks to consider.

Be concise, structured, and technically precise.`;

    const turn1Record: ConsensusTurn = {
      turnNumber: 1,
      providerId: 'chatgpt',
      role: 'Lead Architect',
      prompt: prompt1,
      response: '',
      timestamp: new Date().toISOString(),
      durationMs: 0,
      status: 'pending',
    };
    onTurnUpdate(turn1Record);

    const res1 = await providerManager.sendPrompt('chatgpt', prompt1);
    turn1Record.durationMs = Date.now() - turn1Start;

    if (!res1.ok || !res1.response?.trim()) {
      turn1Record.status = 'error';
      turn1Record.error = res1.error || 'Empty response received from ChatGPT';
      turns.push(turn1Record);
      onTurnUpdate(turn1Record);
      onLog(`[Turn 1 Error] ChatGPT failed: ${turn1Record.error}\n`);
      onStageChange('failed');
      return { ok: false, stage: 'failed', packet: null, turns, error: turn1Record.error };
    }

    turn1Record.status = 'success';
    turn1Record.response = res1.response.trim();
    turns.push(turn1Record);
    onTurnUpdate(turn1Record);
    onLog(`[Turn 1 Complete] Received ${turn1Record.response.length} characters in ${(turn1Record.durationMs / 1000).toFixed(1)}s.\n`);

    if (this.aborted) {
      onStageChange('cancelled');
      return { ok: false, stage: 'cancelled', packet: null, turns, error: 'Pipeline cancelled.' };
    }

    // Turn 2: Gemini (Feasibility & UX Reviewer)
    let turn2Response = '';
    if (selectedProviders.gemini) {
      const turn2Start = Date.now();
      onLog(`\n[Turn 2] Gemini: Reviewing architectural feasibility, UX, and edge cases...\n`);
      const prompt2 = `You are the Feasibility & UX Reviewer in a Multi-AI Autonomous Development relay.
Project Goal: "${idea}"

ChatGPT (Lead Architect) proposed the following architecture:
---
${turn1Record.response}
---

Review this proposal:
1. Feasibility: Are there platform/environment limitations, dependency issues, or performance bottlenecks?
2. Security & Edge Cases: What failure modes or security risks are unaddressed?
3. Ergonomics & API Design: Are module boundaries and interfaces clean?
4. What specific modifications must the Implementation Planner enforce?`;

      const turn2Record: ConsensusTurn = {
        turnNumber: 2,
        providerId: 'gemini',
        role: 'Feasibility Reviewer',
        prompt: prompt2,
        response: '',
        timestamp: new Date().toISOString(),
        durationMs: 0,
        status: 'pending',
      };
      onTurnUpdate(turn2Record);

      const res2 = await providerManager.sendPrompt('gemini', prompt2);
      turn2Record.durationMs = Date.now() - turn2Start;

      if (!res2.ok || !res2.response?.trim()) {
        turn2Record.status = 'error';
        turn2Record.error = res2.error || 'Empty response from Gemini';
        onTurnUpdate(turn2Record);
        onLog(`[Turn 2 Warning] Gemini review failed: ${turn2Record.error}. Proceeding with architect proposal.\n`);
      } else {
        turn2Record.status = 'success';
        turn2Record.response = res2.response.trim();
        turn2Response = turn2Record.response;
        onLog(`[Turn 2 Complete] Received ${turn2Record.response.length} characters in ${(turn2Record.durationMs / 1000).toFixed(1)}s.\n`);
      }
      turns.push(turn2Record);
      onTurnUpdate(turn2Record);
    } else {
      turns.push({
        turnNumber: 2,
        providerId: 'gemini',
        role: 'Feasibility Reviewer',
        prompt: '',
        response: 'Omitted (Gemini unselected in Mission Control)',
        timestamp: new Date().toISOString(),
        durationMs: 0,
        status: 'skipped',
      });
    }

    if (this.aborted) {
      onStageChange('cancelled');
      return { ok: false, stage: 'cancelled', packet: null, turns, error: 'Pipeline cancelled.' };
    }

    // Turn 3: DeepSeek (Implementation & Test Planner)
    const turn3Start = Date.now();
    onLog(`\n[Turn 3] DeepSeek: Synthesizing plan and generating schema 1.0 Decision Packet...\n`);
    const prompt3 = `You are the Implementation & Test Planner in a Multi-AI Autonomous Development relay.
Project Goal: "${idea}"
Target Workspace: "${workspace}"

Architectural Proposal (ChatGPT):
---
${turn1Record.response}
---
Feasibility Review (Gemini):
---
${turn2Response || 'Gemini review omitted.'}
---

Synthesize these inputs into a concrete, executable plan.
You MUST end your response with a JSON object inside a \`\`\`json codeblock strictly matching this schema:
\`\`\`json
{
  "version": "1.0",
  "title": "Short title of the feature or requirement",
  "summary": "1-3 sentence summary of the implementation strategy",
  "decisions": [
    "Key agreed architectural decision 1",
    "Key agreed architectural decision 2"
  ],
  "tasks": [
    {
      "id": "task-1",
      "title": "Task title",
      "files": ["relative/path/to/file.ts"],
      "description": "Exact step-by-step instructions for what to create or modify",
      "testCommand": "npm test or relevant test command"
    }
  ],
  "criteria": [
    "Acceptance criterion 1",
    "Acceptance criterion 2"
  ],
  "unresolvedRisks": [
    "Known limitation or follow-up item"
  ]
}
\`\`\``;

    const turn3Record: ConsensusTurn = {
      turnNumber: 3,
      providerId: 'deepseek',
      role: 'Implementation Planner',
      prompt: prompt3,
      response: '',
      timestamp: new Date().toISOString(),
      durationMs: 0,
      status: 'pending',
    };
    onTurnUpdate(turn3Record);

    const res3 = await providerManager.sendPrompt('deepseek', prompt3);
    turn3Record.durationMs = Date.now() - turn3Start;

    if (!res3.ok || !res3.response?.trim()) {
      turn3Record.status = 'error';
      turn3Record.error = res3.error || 'Empty response from DeepSeek';
      turns.push(turn3Record);
      onTurnUpdate(turn3Record);
      onLog(`[Turn 3 Error] DeepSeek planning failed: ${turn3Record.error}\n`);
      onStageChange('failed');
      return { ok: false, stage: 'failed', packet: null, turns, error: turn3Record.error };
    }

    turn3Record.status = 'success';
    turn3Record.response = res3.response.trim();
    turns.push(turn3Record);
    onTurnUpdate(turn3Record);
    onLog(`[Turn 3 Complete] Received ${turn3Record.response.length} characters in ${(turn3Record.durationMs / 1000).toFixed(1)}s.\n`);

    // Turn 4: Claude (Optional Auditor - Quota Guard)
    let candidatePacketText = turn3Record.response;
    if (selectedProviders.claude) {
      const turn4Start = Date.now();
      onLog(`\n[Turn 4] Claude: Auditing Decision Packet for safety, regressions, and defects (Quota Guard active)...\n`);
      const prompt4 = `You are the Auditor in a Multi-AI Autonomous Development relay.
Project Goal: "${idea}"

Implementation Plan & Proposed Decision Packet (DeepSeek):
---
${turn3Record.response}
---

Audit this plan:
1. Verify if any task misses critical imports, types, or tests.
2. Flag any regression risk or architectural inconsistency.
3. If amendments are needed, provide the updated \`\`\`json block adhering to schema 1.0. Otherwise, confirm approval.`;

      const turn4Record: ConsensusTurn = {
        turnNumber: 4,
        providerId: 'claude',
        role: 'Auditor (Quota Guard)',
        prompt: prompt4,
        response: '',
        timestamp: new Date().toISOString(),
        durationMs: 0,
        status: 'pending',
      };
      onTurnUpdate(turn4Record);

      const res4 = await providerManager.sendPrompt('claude', prompt4);
      turn4Record.durationMs = Date.now() - turn4Start;

      if (!res4.ok || !res4.response?.trim()) {
        turn4Record.status = 'error';
        turn4Record.error = res4.error || 'Empty response from Claude';
        onTurnUpdate(turn4Record);
        onLog(`[Turn 4 Warning] Claude audit failed: ${turn4Record.error}. Falling back to DeepSeek packet.\n`);
      } else {
        turn4Record.status = 'success';
        turn4Record.response = res4.response.trim();
        // Check if Claude provided an amended JSON block
        const claudeJsonCheck = extractJsonFromText(turn4Record.response);
        if (claudeJsonCheck.ok) {
          candidatePacketText = turn4Record.response;
        }
        onLog(`[Turn 4 Complete] Audit finished in ${(turn4Record.durationMs / 1000).toFixed(1)}s.\n`);
      }
      turns.push(turn4Record);
      onTurnUpdate(turn4Record);
    } else {
      turns.push({
        turnNumber: 4,
        providerId: 'claude',
        role: 'Auditor (Quota Guard)',
        prompt: '',
        response: 'Skipped to preserve user quota (opt-in only)',
        timestamp: new Date().toISOString(),
        durationMs: 0,
        status: 'skipped',
      });
    }

    if (this.aborted) {
      onStageChange('cancelled');
      return { ok: false, stage: 'cancelled', packet: null, turns, error: 'Pipeline cancelled.' };
    }

    // ------------------------------------------------------------------------
    // Stage 3: Synthesizing & Validating Decision Packet
    // ------------------------------------------------------------------------
    onStageChange('synthesizing');
    onLog(`\n[Synthesis] Extracting and validating Decision Packet schema...\n`);

    const extracted = extractJsonFromText(candidatePacketText);
    if (!extracted.ok) {
      const err = `Failed to extract JSON from planning output: ${extracted.error}`;
      onLog(`[Synthesis Error] ${err}\n`);
      onStageChange('failed');
      return { ok: false, stage: 'failed', packet: null, turns, error: err };
    }

    const validation = validateDecisionPacket(extracted.data);
    if (!validation.valid || !validation.packet) {
      const err = `Decision Packet schema validation failed:\n  - ${validation.errors.join('\n  - ')}`;
      onLog(`[Synthesis Error] ${err}\n`);
      onStageChange('failed');
      return { ok: false, stage: 'failed', packet: null, turns, error: err };
    }

    const finalPacket = validation.packet;
    finalPacket.rawText = candidatePacketText;

    onLog(`✔ Decision Packet validated successfully! Title: "${finalPacket.title}"\n`);
    onLog(`  Decisions: ${finalPacket.decisions.length} | Tasks: ${finalPacket.tasks.length} | Criteria: ${finalPacket.criteria.length}\n`);

    // ------------------------------------------------------------------------
    // Stage 4: Approval Checkpoint (Milestone 3 Exit Gate)
    // ------------------------------------------------------------------------
    onStageChange('awaiting_confirmation');
    onLog(`\n======================================================================\n`);
    onLog(`[APPROVAL GATED] Consensus reached. Execution paused.\n`);
    onLog(`User must explicitly approve the Decision Packet in the dashboard.\n`);
    onLog(`(Milestone 3 Exit Gate: Shell execution and code edits remain strictly gated).\n`);
    onLog(`======================================================================\n`);

    return {
      ok: true,
      stage: 'awaiting_confirmation',
      packet: finalPacket,
      turns,
    };
  }
}
