#!/usr/bin/env node
/**
 * Model Context Protocol (MCP) Stdio Server for Multi-AI Orchestrator ↔ Google Antigravity
 * Protocol: JSON-RPC 2.0 over stdio
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const WORKSPACE = process.env.ORCHESTRATOR_WORKSPACE || path.resolve(process.cwd());
const BRIDGE_DIR = path.join(WORKSPACE, '.orchestrator', 'bridge');

function ensureBridge() {
  if (!fs.existsSync(BRIDGE_DIR)) {
    fs.mkdirSync(BRIDGE_DIR, { recursive: true });
  }
}

function readJsonFile(filename) {
  const filepath = path.join(BRIDGE_DIR, filename);
  if (fs.existsSync(filepath)) {
    try {
      return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    } catch {
      return null;
    }
  }
  return null;
}

function writeJsonFile(filename, data) {
  ensureBridge();
  const filepath = path.join(BRIDGE_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
}

const TOOLS = [
  {
    name: 'orchestrator_get_status',
    description: 'Check current Multi-AI Orchestrator status and determine whether an approved task or correction is ready for execution.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'orchestrator_claim_task',
    description: 'Claim the active approved Decision Packet or Correction Proposal formulated by ChatGPT and the Multi-AI council.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'orchestrator_submit_evidence',
    description: 'Submit execution evidence (tests, changed files, git diff, logs) to the Orchestrator for ChatGPT and peer review.',
    inputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether local execution and verification tests succeeded' },
        exitCode: { type: 'number', description: 'Exit code of the test command' },
        testOutput: { type: 'string', description: 'Terminal stdout/stderr from test suite' },
        changedFiles: { type: 'array', items: { type: 'string' }, description: 'List of files modified or created' },
        diffStat: { type: 'string', description: 'git diff --stat summary' },
        stdoutTail: { type: 'string', description: 'Standard output tail' },
        stderrTail: { type: 'string', description: 'Standard error tail' },
      },
      required: ['success', 'exitCode'],
    },
  },
  {
    name: 'orchestrator_get_review',
    description: 'Retrieve the latest review verdict, findings, and feedback from ChatGPT, Gemini, DeepSeek, and Claude.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

function handleToolCall(name, args) {
  ensureBridge();

  if (name === 'orchestrator_get_status') {
    const status = readJsonFile('status.json') || {
      bridgeVersion: '1.0',
      stage: 'idle',
      hasPendingTask: fs.existsSync(path.join(BRIDGE_DIR, 'pending_task.json')),
      hasCorrectionProposal: fs.existsSync(path.join(BRIDGE_DIR, 'correction_proposal.json')),
      hasReviewVerdict: fs.existsSync(path.join(BRIDGE_DIR, 'review_verdict.json')),
      lastUpdated: new Date().toISOString(),
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
    };
  }

  if (name === 'orchestrator_claim_task') {
    const correction = readJsonFile('correction_proposal.json');
    if (correction) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              type: 'CORRECTION_PROPOSAL',
              iteration: correction.iteration,
              instructions: correction.revisedTasks,
              rationale: correction.rationale,
              originalPacket: correction.originalPacket,
            }, null, 2),
          },
        ],
      };
    }

    const task = readJsonFile('pending_task.json');
    if (task) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              type: 'INITIAL_TASK',
              title: task.title,
              summary: task.summary,
              decisions: task.decisions,
              tasks: task.tasks,
              approvalSignature: task.approvalSignature,
            }, null, 2),
          },
        ],
      };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'No approved task currently waiting in the orchestrator queue.' }) }],
    };
  }

  if (name === 'orchestrator_submit_evidence') {
    const evidence = {
      success: Boolean(args.success),
      exitCode: Number(args.exitCode ?? 0),
      testOutput: args.testOutput || '',
      changedFiles: Array.isArray(args.changedFiles) ? args.changedFiles : [],
      diffStat: args.diffStat || '',
      stdoutTail: args.stdoutTail || '',
      stderrTail: args.stderrTail || '',
      durationMs: Number(args.durationMs || 5000),
      submittedAt: new Date().toISOString(),
      submittedBy: 'Google-Antigravity-Agent',
    };

    writeJsonFile('evidence.json', evidence);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'EVIDENCE_SUBMITTED',
            message: 'Execution evidence successfully recorded. Multi-AI review cycle initiated.',
            evidenceSummary: {
              success: evidence.success,
              exitCode: evidence.exitCode,
              changedFilesCount: evidence.changedFiles.length,
            },
          }, null, 2),
        },
      ],
    };
  }

  if (name === 'orchestrator_get_review') {
    const review = readJsonFile('review_verdict.json');
    if (review) {
      return {
        content: [{ type: 'text', text: JSON.stringify(review, null, 2) }],
      };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify({ status: 'AWAITING_REVIEW', message: 'Review from ChatGPT and peer models is currently in progress.' }) }],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}

function processRpcMessage(msg) {
  if (!msg || typeof msg !== 'object') return;

  const { id, method, params } = msg;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'multi-ai-orchestrator-bridge',
          version: '1.0.0',
        },
      },
    };
  }

  if (method === 'notifications/initialized') {
    return null; // No response needed for notification
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: TOOLS,
      },
    };
  }

  if (method === 'tools/call') {
    try {
      const toolResult = handleToolCall(params?.name, params?.arguments || {});
      return {
        jsonrpc: '2.0',
        id,
        result: toolResult,
      };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: err.message,
        },
      };
    }
  }

  if (id !== undefined) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32601,
        message: `Method not found: ${method}`,
      },
    };
  }

  return null;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on('line', (line) => {
  if (!line || !line.trim()) return;
  try {
    const req = JSON.parse(line.trim());
    const res = processRpcMessage(req);
    if (res) {
      process.stdout.write(JSON.stringify(res) + '\n');
    }
  } catch (err) {
    // Ignore invalid JSON lines
  }
});
