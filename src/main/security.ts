import { BrowserWindow, shell } from 'electron';
import path from 'path';
import fs from 'fs';

// Allowed origins for external links opened by the user
const ALLOWED_EXTERNAL_HOSTS = new Set([
  'antigravity.google',
  'github.com',
  'chatgpt.com',
  'gemini.google.com',
  'chat.deepseek.com',
  'claude.ai',
]);

/**
 * Configures strict webContents security policies:
 * - Denies all unapproved popups and new windows.
 * - Restricts navigation to trusted local renderer URLs.
 * - Safely routes external doc clicks to default browser.
 */
export function setupWindowSecurity(win: BrowserWindow, isDev: boolean): void {
  win.webContents.setWindowOpenHandler((details) => {
    try {
      const url = new URL(details.url);
      if (ALLOWED_EXTERNAL_HOSTS.has(url.hostname)) {
        shell.openExternal(details.url).catch(() => {});
      }
    } catch {
      // Invalid URL rejected
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, navigationUrl) => {
    const isLocalRenderer = isDev
      ? navigationUrl.startsWith('http://localhost:5173')
      : navigationUrl.startsWith('file://');

    if (!isLocalRenderer) {
      event.preventDefault();
      console.warn(`[Security] Blocked unauthorized renderer navigation to: ${navigationUrl}`);
    }
  });
}

/**
 * Validates a target workspace path before allowing operations.
 * Must be an existing directory on the filesystem.
 */
export function validateWorkspacePath(targetPath: string): { valid: boolean; normalized?: string; error?: string } {
  if (!targetPath || typeof targetPath !== 'string') {
    return { valid: false, error: 'Workspace path must be a non-empty string.' };
  }

  const normalized = path.resolve(targetPath);
  try {
    if (!fs.existsSync(normalized)) {
      return { valid: false, error: `Directory does not exist: ${normalized}` };
    }
    const stat = fs.statSync(normalized);
    if (!stat.isDirectory()) {
      return { valid: false, error: `Path is not a directory: ${normalized}` };
    }
    return { valid: true, normalized };
  } catch (err: any) {
    return { valid: false, error: err.message || 'Failed to access workspace path.' };
  }
}
