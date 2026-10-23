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
  startingProvider?: ProviderId;
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
    // Stage 1: Preflight Verification & Provider-Agnostic Ordering
    // ------------------------------------------------------------------------
    onStageChange('preflight');
    onLog(`[Consensus Pipeline] Starting Open Collaboration consensus for goal: "${idea}"\n`);
    onLog(`[Workspace] Target: ${workspace}\n`);

    // Identify active selected providers
    const activeProviders = (Object.keys(selectedProviders) as ProviderId[]).filter(
      (id) => selectedProviders[id] === true
    );

    if (activeProviders.length === 0) {
      const err = 'At least one AI model must be selected to run the consensus pipeline.';
      onLog(`[Preflight Error] ${err}\n`);
      onStageChange('failed');
      return { ok: false, stage: 'failed', packet: null, turns, error: err };
    }

    // Resolve starting AI provider
    let starter = options.startingProvider;
    if (!starter || !selectedProviders[starter]) {
      starter = activeProviders[0];
    }

    // Build discussion relay order: starting AI first, followed by other active models
    const discussionOrder: ProviderId[] = [
      starter,
      ...activeProviders.filter((id) => id !== starter),
    ];

    onLog(`[Workflow] Mode: Open Collaboration (${discussionOrder.length} model${discussionOrder.length > 1 ? 's' : ''})\n`);
    onLog(`[Relay Order] Lead Turn: ${starter.toUpperCase()} -> Following: ${discussionOrder.slice(1).map((p) => p.toUpperCase()).join(', ') || 'Solo Mode'}\n`);

    // Verify authentication and operational readiness of all participating providers
    onLog(`[Preflight] Verifying provider session authentication and submission readiness...\n`);
    for (const id of discussionOrder) {
      const state = await providerManager.checkStatus(id);
      if (state.status !== 'ready') {
        const err = `Provider "${state.name}" is not ready (Status: ${state.status.toUpperCase()}). ${state.lastMessage || 'Please authenticate or resolve session state before starting.'}`;
        onLog(`[Preflight Error] ${err}\n`);
        onStageChange('failed');
        return { ok: false, stage: 'failed', packet: null, turns, error: err };
      }
      onLog(`  ✔ ${state.name}: READY (Session & submission capability verified)\n`);
    }

    if (this.aborted) {
      onStageChange('cancelled');
      return { ok: false, stage: 'cancelled', packet: null, turns, error: 'Pipeline cancelled by user.' };
    }

    // ------------------------------------------------------------------------
    // Stage 2: Open Collaboration Multi-AI Discussion Relay
    // ------------------------------------------------------------------------
    onStageChange('debating');

    let accumulatedDiscussion = '';
    let candidatePacketText = '';

    for (let i = 0; i < discussionOrder.length; i++) {
      const currentProviderId = discussionOrder[i];
      const turnNumber = i + 1;
      const isStarter = i === 0;
      const isFinalTurn = i === discussionOrder.length - 1;
      const providerName =
        typeof (providerManager as any).getStatus === 'function'
          ? (providerManager as any).getStatus(currentProviderId)?.name || currentProviderId.toUpperCase()
          : currentProviderId === 'chatgpt'
          ? 'ChatGPT'
          : currentProviderId === 'gemini'
          ? 'Gemini'
          : currentProviderId === 'deepseek'
          ? 'DeepSeek'
          : 'Claude';

      // Determine if Claude is at the end acting as optional Auditor
      const isClaudeAuditor = currentProviderId === 'claude' && isFinalTurn && discussionOrder.length >= 3;
      // Determine if this turn is expected to produce the synthesis JSON
      const isSynthesizerTurn = (isFinalTurn && !isClaudeAuditor) || (isClaudeAuditor && i === discussionOrder.length - 2);

      // Define Open Collaboration role and prompt dynamically based on position
      let role = '';
      let prompt = '';

      if (discussionOrder.length === 1) {
        // Solo Mode: Single model produces architecture and schema 1.0 Decision Packet
        role = 'Autonomous Architect & Synthesizer';
        prompt = `You are the Lead Architect and Planner in an Autonomous Development pipeline.
Project Goal: "${idea}"
Target Workspace: "${workspace}"

Provide a comprehensive architectural proposal and implementation plan:
1. System overview and modular decomposition.
2. Key architectural decisions and trade-offs.
3. Recommended file structure breakdown.
4. Edge cases, potential regressions, and risks to consider.

You MUST conclude your response with a JSON object inside a \`\`\`json codeblock strictly matching this schema 1.0 format:
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
      } else if (isStarter) {
        // Turn 1: Lead Architect Proposal
        role = 'Lead Architect';
        prompt = `You are the Starting AI (${providerName}) in an Open Collaboration Multi-AI Development relay.
Project Goal: "${idea}"
Target Workspace: "${workspace}"

Provide a comprehensive architectural proposal and decomposition:
1. System overview and modular breakdown.
2. Key architectural decisions and trade-offs.
3. Recommended file structure breakdown.
4. Edge cases, potential regressions, and risks to consider.

Be concise, structured, and technically precise so collaborating models can review and build upon this foundation.`;
      } else if (isClaudeAuditor) {
        // Optional Claude Auditor Turn
        role = 'Auditor (Quota Guard)';
        prompt = `You are the Auditor and Quota Guard in an Open Collaboration Multi-AI Development relay.
Project Goal: "${idea}"
Target Workspace: "${workspace}"

Preceding Collaborative Discussion & Implementation Plan:
---
${accumulatedDiscussion}
---

Audit this plan for security, architectural integrity, and edge cases. Confirm feasibility and acceptance criteria.
If you approve the plan, conclude with an Auditor Verdict.
If you recommend modifications, you may provide an amended JSON decision packet inside a \`\`\`json codeblock.`;
      } else if (isSynthesizerTurn) {
        // Final Turn or Pre-Auditor Synthesizer into Schema 1.0 Decision Packet
        role = 'Implementation Synthesizer';
        prompt = `You are the Synthesizer (${providerName}) in an Open Collaboration Multi-AI Development relay.
Project Goal: "${idea}"
Target Workspace: "${workspace}"

Full Preceding Collaborative Discussion:
---
${accumulatedDiscussion}
---

Synthesize all preceding peer contributions into a concrete, executable plan.
You MUST conclude your response with a JSON object inside a \`\`\`json codeblock strictly matching this schema 1.0 format:
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
      } else {
        // Intermediate Turn: Peer Reviewer & Enhancer
        role = 'Collaborative Reviewer';
        prompt = `You are a Collaborating Reviewer (${providerName}) in an Open Collaboration Multi-AI Development relay.
Project Goal: "${idea}"
Target Workspace: "${workspace}"

Preceding Collaborative Discussion:
---
${accumulatedDiscussion}
---

Review the preceding proposals and feedback:
1. Feasibility & Environment: Are there platform/environment limitations, dependency issues, or performance bottlenecks?
2. Security & Edge Cases: What failure modes, regressions, or missing error paths are unaddressed?
3. Architecture & Modularity: Are module boundaries, APIs, and file responsibilities clean?
4. Concrete Enhancements: What specific tasks and test requirements must the final plan enforce?`;
      }

      const turnRecord: ConsensusTurn = {
        turnNumber,
        providerId: currentProviderId,
        role,
        prompt,
        response: '',
        timestamp: new Date().toISOString(),
        durationMs: 0,
        status: 'pending',
      };
      onTurnUpdate(turnRecord);

      onLog(`\n[Turn ${turnNumber}] ${providerName} (${role}): Generating response...\n`);
      const turnStart = Date.now();
      const res = await providerManager.sendPrompt(currentProviderId, prompt);
      turnRecord.durationMs = Date.now() - turnStart;

      if (!res.ok || !res.response?.trim()) {
        turnRecord.status = 'error';
        turnRecord.error = res.error || `Empty response received from ${providerName}`;
        turns.push(turnRecord);
        onTurnUpdate(turnRecord);
        onLog(`[Turn ${turnNumber} Error] ${providerName} failed: ${turnRecord.error}\n`);

        // If the starting provider or the implementation synthesizer fails without existing packet, halt
        if (isStarter || (isSynthesizerTurn && !candidatePacketText)) {
          onStageChange('failed');
          return {
            ok: false,
            stage: 'failed',
            packet: null,
            turns,
            error: `Turn ${turnNumber} (${providerName}) failed: ${turnRecord.error}. Halting pipeline without silent substitution.`
          };
        }

        // If an intermediate reviewer fails, log and continue to remaining contributors
        accumulatedDiscussion += `\n[Turn ${turnNumber} - ${providerName}]: Review failed (${turnRecord.error})\n`;
      } else {
        turnRecord.status = 'success';
        turnRecord.response = res.response.trim();
        turns.push(turnRecord);
        onTurnUpdate(turnRecord);

        accumulatedDiscussion += `\n[Turn ${turnNumber} - ${providerName} (${role})]:\n${turnRecord.response}\n`;

        // If the turn produced a JSON codeblock, update candidatePacketText
        const jsonCheck = extractJsonFromText(turnRecord.response);
        if (jsonCheck.ok) {
          candidatePacketText = turnRecord.response;
        } else if (isFinalTurn && !candidatePacketText) {
          candidatePacketText = turnRecord.response;
        }

        onLog(`[Turn ${turnNumber} Complete] Received ${turnRecord.response.length} characters in ${(turnRecord.durationMs / 1000).toFixed(1)}s.\n`);
      }

      if (this.aborted) {
        onStageChange('cancelled');
        return { ok: false, stage: 'cancelled', packet: null, turns, error: 'Pipeline cancelled.' };
      }
    }

    // If Claude was explicitly disabled in a multi-model relay, record skipped turn for Quota Guard audit trail
    if (activeProviders.length > 1 && selectedProviders.claude === false && !turns.some((t) => t.providerId === 'claude')) {
      const skippedTurn: ConsensusTurn = {
        turnNumber: turns.length + 1,
        providerId: 'claude',
        role: 'Auditor (Quota Guard)',
        prompt: '',
        response: 'Skipped to preserve user quota (opt-in only)',
        timestamp: new Date().toISOString(),
        durationMs: 0,
        status: 'skipped',
      };
      turns.push(skippedTurn);
      onTurnUpdate(skippedTurn);
    }

    // ------------------------------------------------------------------------
    // Stage 3: Synthesizing & Validating Decision Packet
    // ------------------------------------------------------------------------
    onStageChange('synthesizing');
    onLog(`\n[Synthesis] Extracting and validating Decision Packet schema 1.0...\n`);

    if (!candidatePacketText) {
      const err = 'No candidate Decision Packet text was produced by the consensus pipeline.';
      onLog(`[Synthesis Error] ${err}\n`);
      onStageChange('failed');
      return { ok: false, stage: 'failed', packet: null, turns, error: err };
    }

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
    // Stage 4: Approval Checkpoint
    // ------------------------------------------------------------------------
    onStageChange('awaiting_confirmation');
    onLog(`\n======================================================================\n`);
    onLog(`[APPROVAL GATED] Consensus reached. Execution paused.\n`);
    onLog(`User must explicitly approve the Decision Packet in the dashboard.\n`);
    onLog(`======================================================================\n`);

    return {
      ok: true,
      stage: 'awaiting_confirmation',
      packet: finalPacket,
      turns,
    };
  }
}
