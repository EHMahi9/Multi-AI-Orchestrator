// Multi-AI Orchestrator - Main Controller Server
// Runs on Node.js. Coordinates CDP Browser Automation, Antigravity CLI, and Live Dashboard.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { CDPEngine } = require('./cdp-engine');
const { executeAntigravityTask } = require('./antigravity-runner');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const cdp = new CDPEngine();

let sessionState = {
  running: false,
  paused: false,
  stage: 'idle',
  idea: '',
  workspace: process.cwd(),
  debateHistory: [],
  decisionPacket: null,
  executionEvidence: null,
  reviewHistory: [],
  reviewIteration: 1,
  maxReviewRetries: 3,
  logs: []
};

const sseClients = new Set();

function broadcastEvent(type, data) {
  const payload = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  for (const client of sseClients) {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch (_) {
      sseClients.delete(client);
    }
  }
}

function appendLog(text) {
  sessionState.logs.push(text);
  if (sessionState.logs.length > 500) sessionState.logs.shift();
  broadcastEvent('LOG_APPEND', { text });
}

function updateState(patch) {
  sessionState = { ...sessionState, ...patch };
  broadcastEvent('STATE_CHANGE', sessionState);
}

// -------------------------------------------------------------
// Orchestration Logic
// -------------------------------------------------------------
async function runFullPipeline({
  idea,
  workspace,
  maxDebateTurns = 3,
  maxRetries = 3,
  providers = { chatgpt: true, gemini: true, deepseek: true, claude: false }
}) {
  updateState({
    running: true,
    paused: false,
    stage: 'multi_ai_debate',
    idea,
    workspace: workspace || process.cwd(),
    providers,
    debateHistory: [],
    decisionPacket: null,
    executionEvidence: null,
    reviewHistory: [],
    reviewIteration: 1,
    maxReviewRetries: maxRetries,
    logs: []
  });

  appendLog(`[Pipeline Started] Goal: ${idea}\nWorkspace: ${sessionState.workspace}\nActive Models: ${Object.entries(providers).filter(([_, v]) => v).map(([k]) => k.toUpperCase()).join(', ')}\n\n`);

  try {
    // 1. Multi-AI Planning Debate (Token-Budgeted & Quota Protected)
    appendLog(`=== Phase 1: Multi-AI Collaborative Planning ===\n`);

    let chatgptPlan = '';
    let geminiCritique = '';
    let deepseekAnalysis = '';
    let claudeAudit = '';

    // Step 1: ChatGPT (Architect)
    if (providers.chatgpt !== false) {
      appendLog(`[Turn 1] Dispatching to ChatGPT (Lead Architect)...\n`);
      updateState({ stage: 'debating_chatgpt' });
      const chatgptStartPrompt = `You are the Lead Software Architect in a collaborative engineering team.
PROJECT GOAL:
${idea}

TASK (Be concise, direct, and actionable. Avoid pleasantries and lengthy preamble):
1. Provide a clear architectural plan and system decomposition.
2. Outline key components, data flow, and file boundaries.
3. Propose initial acceptance criteria and verification commands (e.g. npm test).
4. End with 2-3 pointed questions or trade-offs for review.`;

      try {
        chatgptPlan = await cdp.executeTurn('chatgpt', chatgptStartPrompt, (p) => {
          broadcastEvent('CDP_PROGRESS', p);
        });
        sessionState.debateHistory.push({ provider: 'chatgpt', role: 'Architect', text: chatgptPlan, turn: 1 });
        appendLog(`[ChatGPT Responded] (${chatgptPlan.length} chars)\n\n`);
        updateState({ debateHistory: sessionState.debateHistory });
      } catch (err) {
        appendLog(`[ChatGPT Warning] ${err.message}. Proceeding with remaining models...\n`);
        chatgptPlan = `Architectural Proposal for: ${idea}`;
      }
    }

    // Step 2: Gemini (Feasibility & UX Review)
    if (providers.gemini !== false) {
      appendLog(`[Turn 2] Dispatching to Gemini (Feasibility & UX Reviewer)...\n`);
      updateState({ stage: 'debating_gemini' });
      const geminiPrompt = `You are the Independent Architecture & Feasibility Reviewer (Gemini).
PROJECT GOAL:
${idea}

CHATGPT PROPOSED PLAN:
${chatgptPlan.slice(0, 1500)}

TASK (Be concise, direct, and actionable. Avoid filler text to preserve token budget):
1. Critique the proposed architecture: challenge complexity, find missing failure modes, and highlight feasibility risks.
2. Propose concrete simplifications and UX edge-case handling.
3. Validate whether the acceptance criteria are realistic.`;

      try {
        geminiCritique = await cdp.executeTurn('gemini', geminiPrompt, (p) => {
          broadcastEvent('CDP_PROGRESS', p);
        });
        sessionState.debateHistory.push({ provider: 'gemini', role: 'Feasibility Reviewer', text: geminiCritique, turn: 2 });
        appendLog(`[Gemini Responded] (${geminiCritique.length} chars)\n\n`);
        updateState({ debateHistory: sessionState.debateHistory });
      } catch (err) {
        appendLog(`[Gemini Warning] ${err.message}. Proceeding with remaining models...\n`);
        geminiCritique = `Feasibility notes: Keep implementation minimal, robust, and cleanly separated.`;
      }
    }

    // Step 3: DeepSeek (Code & Algorithmic Specialist)
    if (providers.deepseek !== false) {
      appendLog(`[Turn 3] Dispatching to DeepSeek (Code & Performance Specialist)...\n`);
      updateState({ stage: 'debating_deepseek' });
      const deepseekPrompt = `You are the Code, Algorithmic & Performance Specialist (DeepSeek).
PROJECT GOAL:
${idea}

ARCHITECTURAL PLAN (ChatGPT Summary):
${chatgptPlan.slice(0, 1000)}

FEASIBILITY CRITIQUE (Gemini Summary):
${geminiCritique.slice(0, 1000)}

TASK (Be precise, concise, and focused on code implementation):
1. Scrutinize data structures, types, and algorithmic complexity.
2. Catch edge cases, race conditions, memory pitfalls, and testing strategies.
3. Provide concrete implementation patterns and strict test runner commands.`;

      try {
        deepseekAnalysis = await cdp.executeTurn('deepseek', deepseekPrompt, (p) => {
          broadcastEvent('CDP_PROGRESS', p);
        });
        sessionState.debateHistory.push({ provider: 'deepseek', role: 'Code Specialist', text: deepseekAnalysis, turn: 3 });
        appendLog(`[DeepSeek Responded] (${deepseekAnalysis.length} chars)\n\n`);
        updateState({ debateHistory: sessionState.debateHistory });
      } catch (err) {
        appendLog(`[DeepSeek Warning] ${err.message}. Proceeding...\n`);
        deepseekAnalysis = `Ensure clean code, strict error handling, and 100% test coverage.`;
      }
    }

    // Step 4: Claude (Optional / Opt-in Security & Quality Auditor)
    if (providers.claude === true) {
      appendLog(`[Turn 4] Dispatching to Claude (Security & Verification Auditor - Opt-In)...\n`);
      updateState({ stage: 'debating_claude' });
      const claudePrompt = `You are the Senior Security & Quality Auditor (Claude).
PROJECT GOAL:
${idea}

CONSENSUS PLAN HIGHLIGHTS:
ChatGPT: ${chatgptPlan.slice(0, 800)}
DeepSeek: ${deepseekAnalysis.slice(0, 800)}

TASK (Strict Token & Quota Budget: Max 200 words):
1. Identify any critical security vulnerabilities, injection vectors, or boundary flaws.
2. Provide 2 strict non-negotiable verification assertions for Google Antigravity.`;

      try {
        claudeAudit = await cdp.executeTurn('claude', claudePrompt, (p) => {
          broadcastEvent('CDP_PROGRESS', p);
        });
        sessionState.debateHistory.push({ provider: 'claude', role: 'Security Auditor', text: claudeAudit, turn: 4 });
        appendLog(`[Claude Responded] (${claudeAudit.length} chars)\n\n`);
        updateState({ debateHistory: sessionState.debateHistory });
      } catch (err) {
        appendLog(`[Claude Quota/Limit Protected] ${err.message}. Safely bypassing Claude to protect free quota...\n\n`);
      }
    }

    // 2. Synthesize Decision Packet
    appendLog(`=== Phase 2: Decision Packet Synthesis ===\n`);
    updateState({ stage: 'synthesizing_decision' });

    const synthesisPrompt = `You are the Synthesis Lead (ChatGPT). Reconcile all contributions into a decisive, concrete DECISION PACKET for Google Antigravity to implement.

ORIGINAL GOAL:
${idea}

MULTI-AI DEBATE:
ChatGPT Plan: ${chatgptPlan.slice(0, 1000)}...
Gemini Critique: ${geminiCritique.slice(0, 1000)}...
DeepSeek Code Analysis: ${deepseekAnalysis.slice(0, 1000)}...

Format your response exactly with these sections:
# DECISION PACKET: [Title]
## Problem Summary
[Summary]
## Agreed Decisions
- [Decision 1]
- [Decision 2]
## Implementation Tasks
1. Task: [Title]
   - Files: [path/to/file]
   - Description: [Detail]
   - Test Command: [npm test or tsc --noEmit]
## Acceptance Criteria
- [Criteria 1]
- [Criteria 2]`;

    const decisionPacketMarkdown = await cdp.executeTurn('chatgpt', synthesisPrompt, (p) => {
      broadcastEvent('CDP_PROGRESS', p);
    });

    const parsedPacket = parseDecisionPacketText(decisionPacketMarkdown);
    updateState({ decisionPacket: parsedPacket });
    appendLog(`[Decision Packet Synthesized]: ${parsedPacket.title} (${parsedPacket.tasks.length} tasks, ${parsedPacket.criteria.length} criteria)\n\n`);

    // 3. Antigravity Execution & AI Review Loop
    let loopIteration = 1;
    let approved = false;

    while (loopIteration <= maxRetries && !approved) {
      appendLog(`=== Phase 3: Antigravity Execution (Iteration ${loopIteration}) ===\n`);
      updateState({
        stage: 'antigravity_execution',
        reviewIteration: loopIteration
      });

      const taskPrompt = loopIteration === 1
        ? `Implement Decision Packet: ${parsedPacket.title}\n\nProblem: ${parsedPacket.summary}\nAgreed Decisions:\n${parsedPacket.decisions.join('\n')}\n\nTasks:\n${parsedPacket.tasks.map(t => `- ${t.title} (Files: ${t.files.join(', ')})`).join('\n')}\n\nStrict Acceptance Criteria:\n${parsedPacket.criteria.join('\n')}`
        : `CORRECTIVE TASK (Iteration ${loopIteration}):\nPrevious verification rejected by ChatGPT.\n${sessionState.reviewHistory[sessionState.reviewHistory.length - 1]?.reviewText || ''}\n\nFix identified defects and ensure all acceptance criteria pass.`;

      const primaryTestCmd = parsedPacket.tasks[0]?.testCommand || 'npm test';

      const evidence = await executeAntigravityTask({
        task: taskPrompt,
        workspace: sessionState.workspace,
        testCommand: primaryTestCmd,
        onLog: (chunk) => appendLog(chunk)
      });

      updateState({ executionEvidence: evidence });

      // Phase 4: ChatGPT Review
      appendLog(`\n=== Phase 4: ChatGPT Evidence-Based Verification ===\n`);
      updateState({ stage: 'chatgpt_review' });

      const reviewPrompt = `You are the Lead Verifier (ChatGPT). Review the REAL EXECUTION EVIDENCE from Google Antigravity:
Exit Code: ${evidence.exitCode} (${evidence.exitCode === 0 ? 'SUCCESS' : 'FAILED'})
Changed Files: ${evidence.changedFiles.slice(0, 10).join(', ') || 'None'}

TEST RUNNER TAIL OUTPUT:
${(evidence.stdout || '').slice(-1500) || '(none)'}

ERROR TAIL OUTPUT (STDERR):
${(evidence.stderr || '').slice(-1200) || '(none)'}

GIT DIFF SUMMARY:
${(evidence.diffStat || '').slice(0, 600) || '(none)'}

ACCEPTANCE CRITERIA:
${parsedPacket.criteria.join('\n')}

INSTRUCTIONS (Be concise, audit real logs):
Output strictly:
APPROVED: [TRUE or FALSE]
SUMMARY: [Short evaluation]
DEFECTS: [List any defects or 'None']
CORRECTIVE ACTIONS: [Specific fixes needed if FALSE, or 'None']`;

      const reviewResponse = await cdp.executeTurn('chatgpt', reviewPrompt, (p) => {
        broadcastEvent('CDP_PROGRESS', p);
      });

      const isPass = /APPROVED:\s*(TRUE|YES)/i.test(reviewResponse) && !/APPROVED:\s*(FALSE|NO)/i.test(reviewResponse);

      const reviewEntry = {
        iteration: loopIteration,
        approved: isPass,
        reviewText: reviewResponse,
        timestamp: new Date().toISOString()
      };

      sessionState.reviewHistory.push(reviewEntry);
      updateState({ reviewHistory: sessionState.reviewHistory });
      appendLog(`[ChatGPT Review Completed]: Verdict = ${isPass ? 'APPROVED (Pass)' : 'REJECTED (Needs Fix)'}\n\n`);

      if (isPass) {
        approved = true;
        break;
      } else {
        loopIteration++;
      }
    }

    if (approved) {
      appendLog(`\n=======================================================\n`);
      appendLog(`🎉 MILESTONE VERIFIED & COMPLETED SUCCESSFULLY!\n`);
      appendLog(`=======================================================\n`);
      updateState({ stage: 'verified_complete', running: false });
    } else {
      appendLog(`\n[Halted] Reached maximum retry limit (${maxRetries}). Human intervention required.\n`);
      updateState({ stage: 'retry_limit_reached', running: false });
    }
  } catch (err) {
    const errorMsg = err.message || String(err);
    appendLog(`\n[Pipeline Error]: ${errorMsg}\n`);
    updateState({ stage: 'error', running: false, lastError: errorMsg });
  }
}

function parseDecisionPacketText(text) {
  const lines = text.split('\n');
  let title = 'Decision Packet';
  let summary = '';
  const decisions = [];
  const criteria = [];
  const tasks = [];

  let sec = '';
  for (const l of lines) {
    const trimmed = l.trim();
    if (trimmed.startsWith('# DECISION PACKET:')) title = trimmed.replace('# DECISION PACKET:', '').trim();
    else if (trimmed.startsWith('## Problem Summary')) sec = 'summary';
    else if (trimmed.startsWith('## Agreed Decisions')) sec = 'decisions';
    else if (trimmed.startsWith('## Implementation Tasks')) sec = 'tasks';
    else if (trimmed.startsWith('## Acceptance Criteria')) sec = 'criteria';
    else if (sec === 'summary' && !trimmed.startsWith('#')) summary += ' ' + trimmed;
    else if (sec === 'decisions' && (trimmed.startsWith('- ') || trimmed.startsWith('* '))) decisions.push(trimmed.slice(2));
    else if (sec === 'criteria' && (trimmed.startsWith('- ') || trimmed.startsWith('* '))) criteria.push(trimmed.slice(2));
    else if (sec === 'tasks' && /^\d+\.\s*Task:/i.test(trimmed)) {
      tasks.push({
        title: trimmed.replace(/^\d+\.\s*Task:\s*/i, ''),
        files: ['src/App.tsx'],
        testCommand: 'npm test'
      });
    }
  }

  return {
    title: title || 'Development Decision Packet',
    summary: summary.trim() || 'Synthesized architecture and implementation plan.',
    decisions: decisions.length ? decisions : ['Modular code structure', 'Zero regression'],
    criteria: criteria.length ? criteria : ['All tests pass with exit code 0'],
    tasks: tasks.length ? tasks : [{ title: 'Implement feature requirements', files: ['src/'], testCommand: 'npm test' }],
    rawText: text
  };
}

// -------------------------------------------------------------
// HTTP Server & Static File Serving
// -------------------------------------------------------------
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json'
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // SSE Events stream
  if (req.method === 'GET' && url.pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', data: sessionState })}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // API endpoints
  if (url.pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method === 'GET' && url.pathname === '/api/status') {
      const cdpStatus = await cdp.getStatus();
      res.end(JSON.stringify({ ok: true, session: sessionState, cdp: cdpStatus }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/connect-chrome') {
      try {
        await cdp.launchOrConnectChrome();
        const status = await cdp.getStatus();
        res.end(JSON.stringify({ ok: true, status }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/start-pipeline') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          if (!payload.idea?.trim()) {
            res.writeHead(400);
            return res.end(JSON.stringify({ ok: false, error: 'Idea is required.' }));
          }

          runFullPipeline(payload).catch(err => console.error('Pipeline error:', err));
          res.end(JSON.stringify({ ok: true, message: 'Pipeline started.' }));
        } catch (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ ok: false, error: 'Endpoint not found' }));
    return;
  }

  // Static files
  let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }

  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'text/plain';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

function startServer(portToTry) {
  server.listen(portToTry, async () => {
    console.log(`\n===============================================================`);
    console.log(`🚀 Multi-AI Autonomous Development Orchestrator`);
    console.log(`Live Dashboard running on: http://localhost:${portToTry}`);
    console.log(`CDP Chrome Remote Debugging target: 127.0.0.1:9222`);
    console.log(`===============================================================\n`);

    // Auto-connect if port 9222 is already open
    if (await cdp.isCDPPortOpen()) {
      try {
        console.log('[Startup] Chrome port 9222 is active. Auto-connecting...');
        await cdp.launchOrConnectChrome();
        console.log('[Startup] Connected to Chrome tabs automatically!');
      } catch (e) {
        console.warn('[Startup] Auto-connect warning:', e.message);
      }
    }
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const nextPort = Number(server.address()?.port || PORT) + 1;
    console.warn(`[Port ${PORT} in use, automatically trying http://localhost:${nextPort}...]`);
    startServer(nextPort);
  } else {
    throw err;
  }
});

startServer(PORT);
