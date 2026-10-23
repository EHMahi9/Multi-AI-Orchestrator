import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface CliInfo {
  name: string;
  executablePath: string;
  version: string;
  available: boolean;
  error?: string;
}

export class CliResolver {
  private customPath?: string;

  constructor(customPath?: string) {
    this.customPath = customPath;
  }

  public setCustomPath(customPath: string): void {
    this.customPath = customPath;
  }

  /**
   * Resolves the agent CLI executable path and verifies its version.
   * Priority: customPath -> gemini (.cmd on Win) -> agy (.cmd on Win)
   */
  public async resolve(): Promise<CliInfo> {
    if (this.customPath) {
      if (fs.existsSync(this.customPath)) {
        const ver = await this.queryVersion(this.customPath);
        if (ver) {
          return {
            name: path.basename(this.customPath),
            executablePath: this.customPath,
            version: ver,
            available: true,
          };
        }
        return {
          name: path.basename(this.customPath),
          executablePath: this.customPath,
          version: 'unknown',
          available: false,
          error: `Custom CLI executable failed version check: ${this.customPath}`,
        };
      }
      return {
        name: 'custom',
        executablePath: this.customPath,
        version: 'not_found',
        available: false,
        error: `Custom CLI executable does not exist: ${this.customPath}`,
      };
    }

    // Standard candidate list for Windows and Unix
    const isWin = process.platform === 'win32';
    const npmGlobalDir = isWin && process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : '';

    const candidates = [
      // Direct npm global path (most reliable on Windows)
      ...(npmGlobalDir ? [path.join(npmGlobalDir, 'gemini.cmd')] : []),
      'gemini',
      ...(npmGlobalDir ? [path.join(npmGlobalDir, 'agy.cmd')] : []),
      'agy',
    ];

    for (const candidate of candidates) {
      const ver = await this.queryVersion(candidate);
      if (ver) {
        const name = candidate.includes('gemini') ? 'gemini' : 'agy';
        return {
          name,
          executablePath: candidate,
          version: ver,
          available: true,
        };
      }
    }

    return {
      name: 'none',
      executablePath: '',
      version: 'not_found',
      available: false,
      error: 'Neither "gemini" nor "agy" agent CLI was found on system PATH. Execution is BLOCKED.',
    };
  }

  private queryVersion(cliPath: string): Promise<string | null> {
    return new Promise((resolve) => {
      exec(`"${cliPath}" --version`, { timeout: 5000 }, (err, stdout) => {
        if (!err && stdout && stdout.trim()) {
          // First line of output is version number (e.g. 0.60.0)
          const lines = stdout.trim().split('\n');
          return resolve(lines[0].trim());
        }
        resolve(null);
      });
    });
  }
}
