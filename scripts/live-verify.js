const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const logPath = path.join(__dirname, 'live-verify.log');
fs.writeFileSync(logPath, `Live Verify Started at ${new Date().toISOString()}\n`);

function log(...args) {
  const line = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
  console.log(line);
  fs.appendFileSync(logPath, line + '\n');
}

// Configure the exact same userData path as the real Electron app
const userData = path.join(process.env.APPDATA, 'multi-ai-controller-desktop');
app.setPath('userData', userData);

const { ProviderSessionManager } = require('../dist-electron/main/providers/manager');

app.whenReady().then(async () => {
  log('====================================================');
  log('       LIVE AI PROVIDER VERIFICATION RUNNER         ');
  log('====================================================');
  log('Target UserData Dir:', app.getPath('userData'));

  const manager = new ProviderSessionManager();
  const providers = ['claude', 'gemini', 'deepseek', 'chatgpt'];

  log('\nInitializing provider background windows with stored user sessions...');
  for (const id of providers) {
    const prov = manager.getProvider(id);
    if (prov) {
      log(`-> Initializing ${id.toUpperCase()} background window...`);
      await prov.initialize();
    }
  }

  log('\nWaiting 8s for sessions to load and DOM to mount...');
  await new Promise((r) => setTimeout(r, 8000));

  const results = {};

  for (const id of providers) {
    log(`\n----------------------------------------------------`);
    log(`[Testing Provider: ${id.toUpperCase()}]`);

    const prov = manager.getProvider(id);
    const state = await manager.checkStatus(id);
    log(`Status: ${state.status.toUpperCase()}`);
    log(`Message: ${state.lastMessage || '(none)'}`);

    if (state.status === 'ready') {
      log(`-> Sending live test prompt to ${id}...`);
      const start = Date.now();
      const res = await manager.sendPrompt(id, 'Reply with only the word "OK" and nothing else.');
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);

      if (res.ok) {
        log(`✔ [${id.toUpperCase()}] SUCCESS in ${elapsed}s!`);
        log(`  Received: ${res.response?.length} characters`);
        log(`  Preview: "${res.response?.replace(/\r?\n/g, ' ').slice(0, 160)}..."`);
        results[id] = { ok: true, elapsed, responseLength: res.response?.length };
      } else {
        log(`✖ [${id.toUpperCase()}] FAILED after ${elapsed}s: ${res.error}`);
        results[id] = { ok: false, elapsed, error: res.error };
      }
    } else {
      log(`-> Provider not ready. Current URL in window:`);
      if (prov && prov.window && !prov.window.isDestroyed()) {
        log(`   URL: ${prov.window.webContents.getURL()}`);
      }
      results[id] = { ok: false, status: state.status, reason: 'not_ready' };
    }
  }

  log(`\n====================================================`);
  log('                   SUMMARY RESULTS                  ');
  log(`====================================================`);
  log(results);

  manager.destroyAll();
  app.quit();
});
