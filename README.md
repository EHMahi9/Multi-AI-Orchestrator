# 🚀 Multi-AI Autonomous Development Orchestrator

100% Free, Zero-API-Cost Autonomous Collaboration &amp; Software Development Controller.

Coordinates **ChatGPT**, **Google Gemini**, and **DeepSeek** web sessions via **Chrome DevTools Protocol (CDP)**, synthesizes structured **Decision Packets**, executes implementation tasks directly in **Google Antigravity (`agy -p`)**, and runs an automated **AI Review Feedback Loop**.

---

## 🏗️ Architecture &amp; Workflow

```
┌────────────────────────────────────────────────────────┐
│ 1. User Mission Input (Web Dashboard :3000)            │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ 2. Multi-AI Autonomous Planning (via Chrome CDP)       │
│    • ChatGPT  ──> System Architecture &amp; Decomposition  │
│    • Gemini   ──> Feasibility &amp; UX Critique            │
│    • DeepSeek ──> Edge Cases, Types &amp; Implementation   │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ 3. Decision Packet Synthesis                           │
│    • Agreed Architecture &amp; Acceptance Criteria        │
│    • Target Files &amp; Automated Test Verification Plan   │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ 4. Antigravity Direct Execution                        │
│    • Runs: agy -p "<task>" --json                      │
│    • Executes verification tests: npm test             │
│    • Collects git diff + execution logs                │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ 5. AI Closed-Loop Review (ChatGPT Verification)        │
│    • If APPROVED ──> Pipeline Completed ✓              │
│    • If REJECTED ──> Feeds diff back to Antigravity ↺ │
└────────────────────────────────────────────────────────┘
```

---

## ⚡ Quick Start

### 1. One-Click Launch (Recommended)
Double-click `start.bat` in this folder:
- It launches Chrome with remote debugging on port `9222` (profile: `%USERPROFILE%\.chrome-multi-ai-profile`).
- Opens tabs for `https://chatgpt.com`, `https://gemini.google.com/app`, and `https://chat.deepseek.com`.
- Starts the Orchestrator on `http://localhost:3000`.
- Opens your browser dashboard automatically.

### 2. Manual Terminal Launch
```bash
# In your terminal
npm install
npm start
```

### 3. Log in to your accounts
On first launch, ensure you are logged into your free accounts on:
1. **ChatGPT**: [chatgpt.com](https://chatgpt.com)
2. **Gemini**: [gemini.google.com](https://gemini.google.com/app)
3. **DeepSeek**: [chat.deepseek.com](https://chat.deepseek.com)

---

## 📁 Project Structure

- `server.js` — Main HTTP &amp; Server-Sent Events (SSE) controller server.
- `cdp-engine.js` — Chrome DevTools Protocol automation engine for ChatGPT, Gemini, and DeepSeek tabs.
- `antigravity-runner.js` — Direct `agy -p` CLI process runner and test execution harness.
- `public/` — Real-time Web Dashboard (Dark Mode, Mission Control, Terminal Log, Stepper).
- `start.bat` — 1-click Windows runner script.
