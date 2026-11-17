import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const testDir = path.join(projectRoot, 'tests');
const testFiles = fs
  .readdirSync(testDir)
  .filter((f) => f.endsWith('.test.mjs'))
  .sort()
  .map((f) => path.join('tests', f));

const isCoverage = process.argv.includes('--coverage');
const args = isCoverage
  ? ['--experimental-test-coverage', '--test', ...testFiles]
  : ['--test', ...testFiles];

const child = spawn(process.execPath, args, {
  cwd: projectRoot,
  stdio: 'inherit',
  env: { ...process.env, FORCE_COLOR: '1' },
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});
