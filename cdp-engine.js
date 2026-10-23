// CDP Automation Engine for Multi-AI Orchestrator
// Connects to Google Chrome via Chrome DevTools Protocol (CDP)
// Automates ChatGPT, Gemini, DeepSeek, and Claude without extensions or paid API keys.

const puppeteer = require('puppeteer-core');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');

const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = process.env.CDP_PORT || 9222;
const USER_DATA_DIR = process.env.CHROME_USER_DATA || path.join(os.homedir(), '.chrome-ai-session');

class CDPEngine {
  constructor() {
    this.browser = null;
    this.pages = {
      chatgpt: null,
      gemini: null,
      deepseek: null,
      claude: null
    };
    this.connected = false;
  }

  async isCDPPortOpen() {
    return new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${CDP_PORT}/json/version`, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(1000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  async launchOrConnectChrome() {
    let isOpen = await this.isCDPPortOpen();

    if (!isOpen) {
      console.log(`[CDP Engine] Launching AI Dedicated Chrome with remote debugging on port ${CDP_PORT}...`);
      console.log(`[CDP Engine] Session profile stored at: ${USER_DATA_DIR}`);
      spawn(CHROME_PATH, [
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${USER_DATA_DIR}`,
        '--no-first-run',
        '--no-default-browser-check',
        'https://chatgpt.com',
        'https://gemini.google.com/app',
        'https://chat.deepseek.com',
        'https://claude.ai'
      ], {
        detached: true,
        stdio: 'ignore'
      }).unref();

      // Wait for Chrome port to become responsive
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 600));
        if (await this.isCDPPortOpen()) {
          isOpen = true;
          break;
        }
      }
    }

    if (!isOpen) {
      throw new Error(`Could not connect to Chrome on port ${CDP_PORT}. Ensure Chrome is installed at ${CHROME_PATH}`);
    }

    console.log(`[CDP Engine] Connecting to Chrome at http://127.0.0.1:${CDP_PORT}...`);
    this.browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${CDP_PORT}`,
      defaultViewport: null
    });

    this.connected = true;
    console.log('[CDP Engine] Connected successfully to Chrome!');
    await this.scanAndAttachPages();
    return true;
  }

  async scanAndAttachPages() {
    if (!this.browser) return;
    const pages = await this.browser.pages();

    for (const page of pages) {
      const url = page.url();
      if (url.includes('chatgpt.com')) this.pages.chatgpt = page;
      if (url.includes('gemini.google.com')) this.pages.gemini = page;
      if (url.includes('deepseek.com')) this.pages.deepseek = page;
      if (url.includes('claude.ai')) this.pages.claude = page;
    }
  }

  async getPageForProvider(provider) {
    await this.scanAndAttachPages();
    let page = this.pages[provider];

    if (!page) {
      const targetUrls = {
        chatgpt: 'https://chatgpt.com',
        gemini: 'https://gemini.google.com/app',
        deepseek: 'https://chat.deepseek.com',
        claude: 'https://claude.ai'
      };

      console.log(`[CDP Engine] Tab for ${provider} not found. Opening ${targetUrls[provider]}...`);
      page = await this.browser.newPage();
      await page.goto(targetUrls[provider], { waitUntil: 'domcontentloaded', timeout: 30000 });
      this.pages[provider] = page;
      await new Promise(r => setTimeout(r, 2000));
    }

    return page;
  }

  async getStatus() {
    const isAvailable = await this.isCDPPortOpen();
    if (this.browser && isAvailable) {
      try {
        await this.scanAndAttachPages();
      } catch (_) {}
    }
    return {
      connected: this.connected && isAvailable,
      tabs: {
        chatgpt: !!this.pages.chatgpt,
        gemini: !!this.pages.gemini,
        deepseek: !!this.pages.deepseek,
        claude: !!this.pages.claude
      }
    };
  }

  async executeTurn(provider, prompt, onProgress = () => {}) {
    const page = await this.getPageForProvider(provider);
    await page.bringToFront();

    onProgress({ stage: 'focusing_tab', provider, promptLength: prompt.length });

    if (provider === 'chatgpt') {
      return await this._runChatGPT(page, prompt, onProgress);
    } else if (provider === 'gemini') {
      return await this._runGemini(page, prompt, onProgress);
    } else if (provider === 'deepseek') {
      return await this._runDeepSeek(page, prompt, onProgress);
    } else if (provider === 'claude') {
      return await this._runClaude(page, prompt, onProgress);
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  async _runChatGPT(page, prompt, onProgress) {
    onProgress({ stage: 'staging_prompt', provider: 'chatgpt' });

    await page.evaluate(async (text) => {
      const composer = document.querySelector('#prompt-textarea') ||
        document.querySelector('div[contenteditable="true"][role="textbox"]') ||
        document.querySelector('textarea');
      if (!composer) throw new Error('ChatGPT composer not found');

      composer.focus();
      if (composer.matches('textarea, input')) {
        composer.value = text;
        composer.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        const transfer = new DataTransfer();
        transfer.setData('text/plain', text);
        composer.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true }));
        composer.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, prompt);

    await new Promise(r => setTimeout(r, 600));

    // Click send
    onProgress({ stage: 'submitting', provider: 'chatgpt' });
    await page.evaluate(() => {
      const sendBtn = document.querySelector('button[data-testid="send-button"]') ||
        document.querySelector('button[aria-label*="Send" i]') ||
        document.querySelector('#composer-submit-button');
      if (sendBtn) sendBtn.click();
      else {
        const composer = document.querySelector('#prompt-textarea') || document.querySelector('div[contenteditable="true"]');
        composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      }
    });

    onProgress({ stage: 'waiting_for_response', provider: 'chatgpt' });

    // Poll until response completes
    const start = Date.now();
    let lastText = '';
    let stableCount = 0;

    while (Date.now() - start < 180000) {
      await new Promise(r => setTimeout(r, 1000));

      const res = await page.evaluate(() => {
        const isGenerating = !!document.querySelector('button[data-testid="stop-button"], button[aria-label*="Stop" i]');
        const bubbles = [...document.querySelectorAll('[data-message-author-role="assistant"], .agent-turn, [data-turn="assistant"]')];
        const lastBubble = bubbles[bubbles.length - 1];
        const text = lastBubble ? (lastBubble.innerText || lastBubble.textContent || '').trim() : '';
        return { isGenerating, text };
      });

      if (res.text && res.text.length > 10) {
        if (res.text === lastText && !res.isGenerating) {
          stableCount++;
          if (stableCount >= 2) {
            onProgress({ stage: 'completed', provider: 'chatgpt', responseLength: res.text.length });
            return res.text;
          }
        } else {
          lastText = res.text;
          stableCount = 0;
          onProgress({ stage: 'streaming', provider: 'chatgpt', currentLength: res.text.length });
        }
      }
    }

    if (lastText) return lastText;
    throw new Error('ChatGPT generation timed out.');
  }

  async _runGemini(page, prompt, onProgress) {
    onProgress({ stage: 'staging_prompt', provider: 'gemini' });

    await page.evaluate(async (text) => {
      const editor = document.querySelector('.ql-editor[contenteditable="true"]') ||
        document.querySelector('rich-textarea div[contenteditable="true"]');
      if (!editor) throw new Error('Gemini editor not found');

      editor.focus();
      const transfer = new DataTransfer();
      transfer.setData('text/plain', text);
      editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true }));
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }, prompt);

    await new Promise(r => setTimeout(r, 600));

    onProgress({ stage: 'submitting', provider: 'gemini' });
    await page.evaluate(() => {
      const sendBtn = document.querySelector('.send-button') ||
        document.querySelector('button[aria-label*="Send" i], button[aria-label*="পাঠান" i]') ||
        document.querySelector('[data-test-id="send-button-container"] button');
      if (sendBtn) sendBtn.click();
    });

    onProgress({ stage: 'waiting_for_response', provider: 'gemini' });

    const start = Date.now();
    let lastText = '';
    let stableCount = 0;

    while (Date.now() - start < 180000) {
      await new Promise(r => setTimeout(r, 1000));

      const res = await page.evaluate(() => {
        const isGenerating = !!document.querySelector('button[data-test-id="stop-button"], button[aria-label*="Stop" i], mat-progress-spinner');
        const responses = [...document.querySelectorAll('model-response, message-content, .model-response-text')];
        const last = responses[responses.length - 1];
        const text = last ? (last.innerText || last.textContent || '').trim() : '';
        return { isGenerating, text };
      });

      if (res.text && res.text.length > 10) {
        if (res.text === lastText && !res.isGenerating) {
          stableCount++;
          if (stableCount >= 2) {
            onProgress({ stage: 'completed', provider: 'gemini', responseLength: res.text.length });
            return res.text;
          }
        } else {
          lastText = res.text;
          stableCount = 0;
          onProgress({ stage: 'streaming', provider: 'gemini', currentLength: res.text.length });
        }
      }
    }

    if (lastText) return lastText;
    throw new Error('Gemini generation timed out.');
  }

  async _runDeepSeek(page, prompt, onProgress) {
    onProgress({ stage: 'staging_prompt', provider: 'deepseek' });

    await page.evaluate(async (text) => {
      const composer = document.querySelector('#chat-input') ||
        document.querySelector('textarea.chat-input') ||
        document.querySelector('textarea');
      if (!composer) throw new Error('DeepSeek composer not found');

      composer.focus();
      composer.value = text;
      composer.dispatchEvent(new Event('input', { bubbles: true }));
      composer.dispatchEvent(new Event('change', { bubbles: true }));
    }, prompt);

    await new Promise(r => setTimeout(r, 600));

    onProgress({ stage: 'submitting', provider: 'deepseek' });
    await page.evaluate(() => {
      const sendBtn = document.querySelector('div[role="button"][aria-label*="Send" i]') ||
        document.querySelector('button[aria-label*="Send" i]') ||
        document.querySelector('button.send-btn');
      if (sendBtn) sendBtn.click();
      else {
        const composer = document.querySelector('#chat-input') || document.querySelector('textarea');
        composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      }
    });

    onProgress({ stage: 'waiting_for_response', provider: 'deepseek' });

    const start = Date.now();
    let lastText = '';
    let stableCount = 0;

    while (Date.now() - start < 180000) {
      await new Promise(r => setTimeout(r, 1000));

      const res = await page.evaluate(() => {
        const isGenerating = !!document.querySelector('button[aria-label*="Stop" i], div[role="button"][aria-label*="Stop" i], .ds-stop-btn');
        const bubbles = [...document.querySelectorAll('.ds-markdown, [class*="ds-markdown"], .chat-message-assistant')];
        const last = bubbles[bubbles.length - 1];
        const text = last ? (last.innerText || last.textContent || '').trim() : '';
        return { isGenerating, text };
      });

      if (res.text && res.text.length > 10) {
        if (res.text === lastText && !res.isGenerating) {
          stableCount++;
          if (stableCount >= 2) {
            onProgress({ stage: 'completed', provider: 'deepseek', responseLength: res.text.length });
            return res.text;
          }
        } else {
          lastText = res.text;
          stableCount = 0;
          onProgress({ stage: 'streaming', provider: 'deepseek', currentLength: res.text.length });
        }
      }
    }

    if (lastText) return lastText;
    throw new Error('DeepSeek generation timed out.');
  }

  async _runClaude(page, prompt, onProgress) {
    onProgress({ stage: 'staging_prompt', provider: 'claude' });

    // Check if Claude is showing a rate-limit modal or limit reached banner
    const isRateLimited = await page.evaluate(() => {
      const pageText = document.body ? document.body.innerText : '';
      return /out of free messages|message limit reached|resets at|try again in/i.test(pageText);
    });

    if (isRateLimited) {
      throw new Error('Claude free tier message limit reached on web.');
    }

    await page.evaluate(async (text) => {
      const composer = document.querySelector('div[contenteditable="true"].ProseMirror') ||
        document.querySelector('div[contenteditable="true"]') ||
        document.querySelector('div[role="textbox"]') ||
        document.querySelector('textarea');
      if (!composer) throw new Error('Claude composer not found');

      composer.focus();
      const transfer = new DataTransfer();
      transfer.setData('text/plain', text);
      composer.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true }));
      composer.dispatchEvent(new Event('input', { bubbles: true }));
    }, prompt);

    await new Promise(r => setTimeout(r, 600));

    onProgress({ stage: 'submitting', provider: 'claude' });
    await page.evaluate(() => {
      const sendBtn = document.querySelector('button[aria-label*="Send message" i]') ||
        document.querySelector('button[aria-label*="Send" i]') ||
        document.querySelector('button:has(svg path[d*="M1.946"])');
      if (sendBtn) sendBtn.click();
      else {
        const composer = document.querySelector('div[contenteditable="true"]');
        if (composer) {
          composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        }
      }
    });

    onProgress({ stage: 'waiting_for_response', provider: 'claude' });

    const start = Date.now();
    let lastText = '';
    let stableCount = 0;

    while (Date.now() - start < 180000) {
      await new Promise(r => setTimeout(r, 1000));

      const res = await page.evaluate(() => {
        const isGenerating = !!document.querySelector('button[aria-label*="Stop Response" i], button[aria-label*="Stop" i], div[data-is-streaming="true"]');
        const bubbles = [...document.querySelectorAll('[data-message-author-role="assistant"], .font-claude-message, .standard-markdown')];
        const last = bubbles[bubbles.length - 1];
        const text = last ? (last.innerText || last.textContent || '').trim() : '';

        const rateLimitBanner = /out of free messages|message limit reached|resets at/i.test(document.body ? document.body.innerText : '');
        return { isGenerating, text, rateLimitBanner };
      });

      if (res.rateLimitBanner && !res.text) {
        throw new Error('Claude free tier message limit reached on web.');
      }

      if (res.text && res.text.length > 10) {
        if (res.text === lastText && !res.isGenerating) {
          stableCount++;
          if (stableCount >= 2) {
            onProgress({ stage: 'completed', provider: 'claude', responseLength: res.text.length });
            return res.text;
          }
        } else {
          lastText = res.text;
          stableCount = 0;
          onProgress({ stage: 'streaming', provider: 'claude', currentLength: res.text.length });
        }
      }
    }

    if (lastText) return lastText;
    throw new Error('Claude generation timed out.');
  }
}

module.exports = { CDPEngine };
