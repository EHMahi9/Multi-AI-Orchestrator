/**
 * ============================================================================
 * Execution Policy & Workspace Security Boundary
 * ============================================================================
 * 
 * SECURITY BOUNDARY NOTICE:
 * Application-level directory validation prevents path traversal (".."), denies
 * targeting of sensitive operating-system locations and protected backup
 * baselines, and canonicalizes symbolic links and NTFS junctions to their real
 * physical filesystem paths.
 * 
 * HOWEVER, THIS IS NOT AN OPERATING SYSTEM KERNEL SANDBOX (e.g. Windows
 * AppContainer, Docker container, or seccomp/chroot jail). Subprocesses spawned
 * by the execution engine run under the active user's OS privileges and have
 * filesystem access permitted by the user's OS account.
 * 
 * RECOMMENDED OPERATING PRACTICE:
 * Always run multi-AI execution workflows in dedicated, disposable project
 * repositories under active Git version control. Never target system directories,
 * user root profiles, or production deployments directly.
 * ============================================================================
 */

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

export interface ParsedCommand {
  valid: boolean;
  executable?: string;
  args?: string[];
  error?: string;
}

// Protected path substrings that can NEVER be targeted for automated execution
const PROTECTED_PATH_SUBSTRINGS = [
  'backups\\v0.1.9',
  'backups/v0.1.9',
  'windows\\system32',
  'windows/system32',
  'program files',
  'program files (x86)',
];

/**
 * Validates and canonicalizes a workspace directory to prevent directory traversal,
 * symlink/junction redirection into protected areas, and access to protected baselines.
 */
export function validateAndCanonicalizeWorkspace(workspacePath: string): WorkspaceValidationResult {
  if (!workspacePath || typeof workspacePath !== 'string' || !workspacePath.trim()) {
    return { valid: false, error: 'Workspace path must be a non-empty string.' };
  }

  const rawTrimmed = workspacePath.trim();
  const resolved = path.resolve(rawTrimmed);

  // 1. Check raw path for directory traversal sequences
  if (rawTrimmed.includes('..')) {
    return { valid: false, error: 'Directory traversal sequence ("..") is forbidden.' };
  }

  // 2. Check input path against protected path substrings
  const lowerResolved = resolved.toLowerCase();
  for (const protectedSubstr of PROTECTED_PATH_SUBSTRINGS) {
    if (lowerResolved.includes(protectedSubstr.toLowerCase())) {
      return {
        valid: false,
        error: `Targeting protected path or baseline backup is strictly forbidden: ${protectedSubstr}`,
      };
    }
  }

  // 3. Verify directory existence
  if (!fs.existsSync(resolved)) {
    return { valid: false, error: `Workspace directory does not exist: ${resolved}` };
  }

  try {
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return { valid: false, error: `Workspace path is a file, not a directory: ${resolved}` };
    }

    // 4. Resolve real physical canonical path (resolves symlinks, NTFS junctions)
    const canonical = fs.realpathSync(resolved);
    const lowerCanonical = canonical.toLowerCase();

    // 5. Re-verify canonical physical destination against protected path substrings
    for (const protectedSubstr of PROTECTED_PATH_SUBSTRINGS) {
      if (lowerCanonical.includes(protectedSubstr.toLowerCase())) {
        return {
          valid: false,
          error: `Canonical path resolves to protected directory or backup: ${protectedSubstr}`,
        };
      }
    }

    return { valid: true, canonicalPath: canonical };
  } catch (err: any) {
    return { valid: false, error: `Failed to verify workspace canonical path: ${err.message}` };
  }
}

/**
 * Quote-aware command-line tokenizer that handles single quotes, double quotes,
 * and escapes without shell interpretation.
 */
export function tokenizeCommandLine(raw: string): { ok: boolean; tokens?: string[]; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, tokens: [] };
  }

  // Deny dangerous shell metacharacters before tokenizing
  const FORBIDDEN_SHELL_CHARS = ['&', '|', ';', '`', '$', '>', '<', '\n', '\r'];
  for (const ch of FORBIDDEN_SHELL_CHARS) {
    if (trimmed.includes(ch)) {
      return {
        ok: false,
        error: `Command contains forbidden shell operator "${ch}". Model shell interpolation is blocked.`,
      };
    }
  }

  const tokens: string[] = [];
  let current = '';
  let inDouble = false;
  let inSingle = false;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];

    if (ch === '\\' && !inSingle && i + 1 < trimmed.length) {
      // Escape next character inside double quotes or outside quotes
      i++;
      current += trimmed[i];
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (/\s/.test(ch) && !inDouble && !inSingle) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }

  if (inDouble || inSingle) {
    return { ok: false, error: 'Unclosed quotation mark in command line.' };
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return { ok: true, tokens };
}

// Permitted executable names
const ALLOWED_EXECUTABLES = new Set(['npm', 'npx', 'node', 'pnpm', 'yarn', 'git']);

/**
 * Parses and validates a model-proposed test command string into safe structured executable + arguments.
 * Model-generated commands are NEVER implicitly trusted or passed to a shell interpreter.
 */
export function parseAndValidateCommand(rawCommand?: string): ParsedCommand {
  if (!rawCommand || !rawCommand.trim()) {
    return { valid: true };
  }

  const tokenized = tokenizeCommandLine(rawCommand);
  if (!tokenized.ok || !tokenized.tokens) {
    return { valid: false, error: tokenized.error || 'Failed to parse command.' };
  }

  const tokens = tokenized.tokens;
  if (tokens.length === 0) {
    return { valid: true };
  }

  const executable = tokens[0].toLowerCase();
  const args = tokens.slice(1);

  // Check executable allowlist
  if (!ALLOWED_EXECUTABLES.has(executable)) {
    return {
      valid: false,
      error: `Executable "${executable}" is not permitted by command policy allowlist/whitelist. Allowed: ${Array.from(ALLOWED_EXECUTABLES).join(', ')}.`,
    };
  }

  // Validate subcommands based on executable type
  if (executable === 'npm' || executable === 'pnpm' || executable === 'yarn') {
    const sub = args[0]?.toLowerCase();
    if (sub !== 'test' && sub !== 'run') {
      return {
        valid: false,
        error: `Only "test" or "run" subcommands are permitted for ${executable}. Received: "${sub || 'none'}".`,
      };
    }
    if (sub === 'run') {
      const script = args[1]?.toLowerCase();
      const ALLOWED_SCRIPTS = ['test', 'typecheck', 'build', 'lint'];
      if (!script || !ALLOWED_SCRIPTS.includes(script)) {
        return {
          valid: false,
          error: `Script "${script || 'none'}" is not in the approved scripts list (${ALLOWED_SCRIPTS.join(', ')}).`,
        };
      }
    }
  } else if (executable === 'node') {
    // Only node --test is permitted
    if (args[0] !== '--test') {
      return {
        valid: false,
        error: `Only "node --test" is permitted for test verification. Received: "${args.join(' ')}".`,
      };
    }
    // Check file arguments for path traversal
    for (const arg of args.slice(1)) {
      if (arg.includes('..')) {
        return { valid: false, error: 'Path traversal ("..") in test arguments is forbidden.' };
      }
    }
  } else if (executable === 'git') {
    const sub = args[0]?.toLowerCase();
    const ALLOWED_GIT = ['status', 'diff', 'log'];
    if (!sub || !ALLOWED_GIT.includes(sub)) {
      return {
        valid: false,
        error: `Only git ${ALLOWED_GIT.join('/')} are permitted. Received: "${sub || 'none'}".`,
      };
    }
  }

  return {
    valid: true,
    executable: tokens[0],
    args,
  };
}

/**
 * Backward-compatible helper checking whether a testCommand complies with safety policy.
 */
export function isCommandPolicyCompliant(command?: string): CommandPolicyResult {
  const result = parseAndValidateCommand(command);
  return {
    compliant: result.valid,
    reason: result.error,
  };
}
