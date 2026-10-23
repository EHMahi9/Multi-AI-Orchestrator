import fs from 'fs';
import path from 'path';

export interface WorkspaceValidationResult {
  valid: boolean;
  canonicalPath?: string;
  error?: string;
}

export interface CommandPolicyResult {
  compliant: boolean;
  reason?: string;
}

// Protected path fragments that can NEVER be targeted for automated execution
const PROTECTED_PATH_SUBSTRINGS = [
  'backups\\v0.1.9',
  'backups/v0.1.9',
  'Windows\\System32',
  'windows/system32',
  'Program Files',
];

/**
 * Validates and canonicalizes a workspace directory to prevent directory traversal
 * and protected system location modifications.
 */
export function validateAndCanonicalizeWorkspace(workspacePath: string): WorkspaceValidationResult {
  if (!workspacePath || typeof workspacePath !== 'string' || !workspacePath.trim()) {
    return { valid: false, error: 'Workspace path must be a non-empty string.' };
  }

  const resolved = path.resolve(workspacePath.trim());

  // Check traversal safety
  if (resolved.includes('..')) {
    return { valid: false, error: 'Directory traversal sequence ("..") is forbidden.' };
  }

  // Check protected directory list
  for (const protectedSubstr of PROTECTED_PATH_SUBSTRINGS) {
    if (resolved.toLowerCase().includes(protectedSubstr.toLowerCase())) {
      return {
        valid: false,
        error: `Targeting protected path or baseline backup is strictly forbidden: ${protectedSubstr}`,
      };
    }
  }

  try {
    if (!fs.existsSync(resolved)) {
      return { valid: false, error: `Workspace directory does not exist: ${resolved}` };
    }

    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return { valid: false, error: `Workspace path is a file, not a directory: ${resolved}` };
    }

    // Resolve real physical path (resolving any symlinks or relative references)
    const canonical = fs.realpathSync(resolved);
    return { valid: true, canonicalPath: canonical };
  } catch (err: any) {
    return { valid: false, error: `Failed to verify workspace canonical path: ${err.message}` };
  }
}

/**
 * Verifies whether a model-suggested testCommand is safe to execute.
 * Model-generated shell commands are NEVER implicitly trusted.
 */
export function isCommandPolicyCompliant(command?: string): CommandPolicyResult {
  if (!command || !command.trim()) {
    return { compliant: true }; // No test command specified
  }

  const trimmed = command.trim();

  // Deny dangerous shell chaining and pipe operators
  const dangerousOperators = ['&', '|', ';', '`', '$', '>', '<'];
  for (const op of dangerousOperators) {
    if (trimmed.includes(op)) {
      return {
        compliant: false,
        reason: `Command contains forbidden shell operator "${op}". Model shell interpolation is blocked.`,
      };
    }
  }

  // Whitelist safe test runner prefixes
  const SAFE_PREFIXES = [
    'npm test',
    'npm run test',
    'npm run typecheck',
    'npm run build',
    'node --test',
    'pnpm test',
    'yarn test',
    'git status',
    'git diff',
  ];

  const matchesPrefix = SAFE_PREFIXES.some((prefix) =>
    trimmed === prefix || trimmed.startsWith(`${prefix} `)
  );

  if (!matchesPrefix) {
    return {
      compliant: false,
      reason: `Command "${trimmed}" is not within the verified safe command policy whitelist (npm test, node --test, etc.).`,
    };
  }

  return { compliant: true };
}
