# Milestone 2 Technical Architecture & Session Security Design

## 1. Electron 34 vs Electron 35+ Decision

### Context & Version Selection
- **Selected Version:** Electron `34.5.8` (Chromium `132.0.6834.196`, Node.js `20.18.0`, V8 `13.2`).
- **Original High-Level Spec:** Mentioned "Electron 35+".
- **Architectural Rationale:**
  1. **Stability & npm Ecosystem:** Electron 34 is the battle-tested LTS production release in the npm registry. Electron 35 was in active pre-release/canary when this project commenced, posing risks of breaking changes in internal native bindings and unverified Windows x64 stability.
  2. **Security & API Parity:** Electron 34 contains complete support for all modern security and session primitives required by this project:
     - `session.fromPartition('persist:...')` for isolated per-provider cookie jars, cache, IndexedDB, and local storage.
     - `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true` on all web preferences.
     - Strict `setWindowOpenHandler` popup denial and external URL filtering via Node `URL`.
     - Multi-window / multi-view management with fine-grained webContents scripting via `executeJavaScript`.
  3. **Node 24 Compatibility:** Electron 34 integrates cleanly alongside the host system's Node.js `24.16.0` build environment and npm tooling.

---

## 2. Provider Terms of Service, Anti-Bot & Login Architecture

### Zero-Bypass Policy
- We **strictly forbid** and **do not attempt** automated CAPTCHA solving, Cloudflare Turnstile circumvention, or token interception.
- Attempting to bypass anti-bot mechanisms violates provider Terms of Service, risks account suspensions, and introduces brittle failure modes.

### Human-in-the-Loop Native Authentication
- Each provider runs in an isolated, persistent partition:
  - `persist:ai-provider-chatgpt` (`https://chatgpt.com`)
  - `persist:ai-provider-gemini` (`https://gemini.google.com`)
  - `persist:ai-provider-deepseek` (`https://chat.deepseek.com`)
  - `persist:ai-provider-claude` (`https://claude.ai`)
- **No Shared Profile:** Provider data is stored in the Electron app's dedicated data directory (`Partitions/ai-provider-<id>`), completely isolated from the user's daily Google Chrome profile (`%LOCALAPPDATA%\Google\Chrome\User Data`).
- **Interactive Login Modal / Window:** When a provider requires authentication or presents a security challenge, the user can click **"Show / Login"**. A dedicated browser window opens the provider in its persistent session.
- The user completes login, 2FA, SSO, or Cloudflare verification natively.
- Once authenticated, cookies and session tokens remain stored on disk in the persistent partition across application restarts.

---

## 3. Explicit Session Lifecycle States

Every provider session implements a state machine with the following explicit states:

| State | Description | Transition Trigger |
|---|---|---|
| `not_configured` | Provider is disabled or initial webview has not been initialized. | User toggles off provider or initial app load. |
| `login_required` | Provider landing page loaded, but user is unauthenticated (Sign In / Log In buttons present). | DOM probe detects authentication buttons or login redirects. |
| `ready` | User is authenticated and the chat input element is active and ready. | DOM probe detects prompt input textarea / contenteditable. |
| `rate_limited` | Provider message quota, hourly limit, or rate limit exceeded. | DOM probe detects limit warning banner or disable prompt input. |
| `manual_intervention_required` | Cloudflare challenge, Turnstile, or CAPTCHA detected. | DOM probe detects `cf-turnstile`, `challenges.cloudflare.com`, or verification iframe. |
| `error` | Network failure, DNS resolution failure, or HTTP error status. | WebContents fails to load URL (`did-fail-load`). |
| `disabled` | User explicitly opted out of using this provider. | User unchecks model in Mission Control. |

---

## 4. Single-Provider Incremental Implementation Roadmap

To maintain maximum safety and verifiable isolation, providers will be implemented and validated sequentially:
1. **Provider 1 (ChatGPT):**
   - Implement `ChatGPTAdapter` (partition `persist:ai-provider-chatgpt`, URL `https://chatgpt.com`).
   - Implement DOM selectors for prompt input (`#prompt-textarea`), submit button, streaming response indicator, and assistant message bubbles.
   - Validate session persistence across restart.
   - Validate prompt submission and response extraction independently.
2. **Provider 2 (Gemini):**
   - Implement `GeminiAdapter` (partition `persist:ai-provider-gemini`, URL `https://gemini.google.com`).
   - Verify persistence, input dispatch, and response extraction.
3. **Provider 3 (DeepSeek):**
   - Implement `DeepSeekAdapter` (partition `persist:ai-provider-deepseek`, URL `https://chat.deepseek.com`).
   - Verify persistence, input dispatch, and response extraction.
4. **Provider 4 (Claude):**
   - Implement `ClaudeAdapter` (partition `persist:ai-provider-claude`, URL `https://claude.ai`).
   - Implement strict **Quota Guard** (Claude is opt-in only, turn 4 auditing only).
5. **Session Manager Integration:**
   - Unified `ProviderSessionManager` coordinating all 4 isolated sessions, exposing typed IPC handlers to the renderer.
