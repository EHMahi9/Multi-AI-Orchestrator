import crypto from 'node:crypto';
import type { DecisionPacket, DecisionTask } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  packet?: DecisionPacket;
}

/**
 * Computes a deterministic SHA-256 fingerprint of a DecisionPacket's execution-relevant fields.
 * Any alteration to title, summary, decisions, tasks (id, title, files, description, testCommand),
 * criteria, or unresolved risks changes this hash.
 */
export function computeDecisionPacketHash(packet: DecisionPacket): string {
  if (!packet || typeof packet !== 'object') {
    throw new Error('Cannot hash invalid or null DecisionPacket.');
  }

  // Canonicalize fields deterministically
  const canonical = {
    version: packet.version || '1.0',
    title: (packet.title || '').trim(),
    summary: (packet.summary || '').trim(),
    decisions: Array.isArray(packet.decisions)
      ? packet.decisions.map((d) => String(d).trim())
      : [],
    tasks: Array.isArray(packet.tasks)
      ? packet.tasks.map((t) => ({
          id: String(t.id || '').trim(),
          title: String(t.title || '').trim(),
          files: Array.isArray(t.files) ? t.files.map((f) => String(f).trim()).sort() : [],
          description: String(t.description || '').trim(),
          testCommand: t.testCommand ? String(t.testCommand).trim() : null,
        }))
      : [],
    criteria: Array.isArray(packet.criteria)
      ? packet.criteria.map((c) => String(c).trim())
      : [],
    unresolvedRisks: Array.isArray(packet.unresolvedRisks)
      ? packet.unresolvedRisks.map((r) => String(r).trim())
      : [],
  };

  const serialized = JSON.stringify(canonical);
  return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
}

/**
 * Extracts a JSON object from raw markdown, conversational text, or codeblocks.
 */
export function extractJsonFromText(raw: string): { ok: boolean; data?: any; error?: string } {
  if (!raw || typeof raw !== 'string') {
    return { ok: false, error: 'Raw text is empty or invalid.' };
  }

  // 1. Try markdown fenced code block: ```json ... ```
  const jsonBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1].trim());
      return { ok: true, data: parsed };
    } catch (err: any) {
      // Continue to bracket search if fenced block had syntax error
    }
  }

  // 2. Try outermost curly braces: { ... }
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = raw.substring(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(candidate);
      return { ok: true, data: parsed };
    } catch (err: any) {
      return { ok: false, error: `Failed to parse JSON substring: ${err.message}` };
    }
  }

  return { ok: false, error: 'No JSON object structure found in response.' };
}

/**
 * Validates that an object strictly adheres to DecisionPacket version 1.0 schema.
 */
export function validateDecisionPacket(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: ['Decision packet must be a non-null object.'] };
  }

  const data = input as Record<string, any>;

  // version check
  if (data.version !== '1.0') {
    errors.push(`Invalid version: expected "1.0", got "${data.version}".`);
  }

  // title check
  if (typeof data.title !== 'string' || !data.title.trim()) {
    errors.push('Field "title" must be a non-empty string.');
  }

  // summary check
  if (typeof data.summary !== 'string' || !data.summary.trim()) {
    errors.push('Field "summary" must be a non-empty string.');
  }

  // decisions check
  if (!Array.isArray(data.decisions) || data.decisions.length === 0) {
    errors.push('Field "decisions" must be a non-empty array of strings.');
  } else {
    data.decisions.forEach((item: any, idx: number) => {
      if (typeof item !== 'string' || !item.trim()) {
        errors.push(`Decision at index ${idx} must be a non-empty string.`);
      }
    });
  }

  // tasks check
  if (!Array.isArray(data.tasks) || data.tasks.length === 0) {
    errors.push('Field "tasks" must be a non-empty array of task objects.');
  } else {
    data.tasks.forEach((task: any, idx: number) => {
      if (!task || typeof task !== 'object') {
        errors.push(`Task at index ${idx} must be an object.`);
        return;
      }
      if (typeof task.id !== 'string' || !task.id.trim()) {
        errors.push(`Task at index ${idx} is missing a valid "id".`);
      }
      if (typeof task.title !== 'string' || !task.title.trim()) {
        errors.push(`Task at index ${idx} is missing a valid "title".`);
      }
      if (!Array.isArray(task.files)) {
        errors.push(`Task at index ${idx} "files" must be an array of filepath strings.`);
      }
      if (typeof task.description !== 'string' || !task.description.trim()) {
        errors.push(`Task at index ${idx} is missing a valid "description".`);
      }
      if (task.testCommand !== undefined && typeof task.testCommand !== 'string') {
        errors.push(`Task at index ${idx} "testCommand" must be a string if provided.`);
      }
    });
  }

  // criteria check
  if (!Array.isArray(data.criteria)) {
    errors.push('Field "criteria" must be an array of strings.');
  }

  // unresolvedRisks check
  if (!Array.isArray(data.unresolvedRisks)) {
    errors.push('Field "unresolvedRisks" must be an array of strings.');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const packet: DecisionPacket = {
    version: '1.0',
    title: data.title.trim(),
    summary: data.summary.trim(),
    decisions: data.decisions.map((d: any) => String(d).trim()),
    tasks: data.tasks.map((t: any): DecisionTask => ({
      id: String(t.id).trim(),
      title: String(t.title).trim(),
      files: Array.isArray(t.files) ? t.files.map((f: any) => String(f).trim()) : [],
      description: String(t.description).trim(),
      testCommand: t.testCommand ? String(t.testCommand).trim() : undefined,
    })),
    criteria: Array.isArray(data.criteria) ? data.criteria.map((c: any) => String(c).trim()) : [],
    unresolvedRisks: Array.isArray(data.unresolvedRisks) ? data.unresolvedRisks.map((r: any) => String(r).trim()) : [],
    consensusTimestamp: data.consensusTimestamp || new Date().toISOString(),
    approvedByUser: Boolean(data.approvedByUser),
    approvalSignature: typeof data.approvalSignature === 'string' ? data.approvalSignature : undefined,
    approvedWorkspace: typeof data.approvedWorkspace === 'string' ? data.approvedWorkspace : undefined,
    rawText: data.rawText,
  };

  return { valid: true, errors: [], packet };
}
