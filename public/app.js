// Multi-AI Orchestrator - Client App
// Connects to SSE events from localhost:3000, drives UI updates in real-time.

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const cdpDot = document.getElementById('cdpDot');
  const cdpLabel = document.getElementById('cdpLabel');
  const btnConnectChrome = document.getElementById('btnConnectChrome');
  const badgeChatGPT = document.getElementById('badgeChatGPT');
  const badgeGemini = document.getElementById('badgeGemini');
  const badgeDeepSeek = document.getElementById('badgeDeepSeek');
  const badgeClaude = document.getElementById('badgeClaude');

  const chkChatGPT = document.getElementById('chkChatGPT');
  const chkGemini = document.getElementById('chkGemini');
  const chkDeepSeek = document.getElementById('chkDeepSeek');
  const chkClaude = document.getElementById('chkClaude');

  const missionStatusPill = document.getElementById('missionStatusPill');
  const inputIdea = document.getElementById('inputIdea');
  const inputWorkspace = document.getElementById('inputWorkspace');
  const inputMaxRetries = document.getElementById('inputMaxRetries');
  const btnStartPipeline = document.getElementById('btnStartPipeline');
  const btnStopPipeline = document.getElementById('btnStopPipeline');

  const debateTurnCounter = document.getElementById('debateTurnCounter');
  const debateStream = document.getElementById('debateStream');

  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  const decisionPacketCard = document.getElementById('decisionPacketCard');
  const evidenceContainer = document.getElementById('evidenceContainer');
  const reviewContainer = document.getElementById('reviewContainer');
  const terminalLog = document.getElementById('terminalLog');
  const chkAutoScroll = document.getElementById('chkAutoScroll');
  const btnClearLog = document.getElementById('btnClearLog');

  let state = {};

  // Setup Tabs
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const targetPane = document.getElementById(btn.dataset.tab);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  // Clear Terminal Log
  btnClearLog.addEventListener('click', () => {
    terminalLog.textContent = '';
  });

  // Connect Chrome Button
  btnConnectChrome.addEventListener('click', async () => {
    btnConnectChrome.disabled = true;
    btnConnectChrome.textContent = 'Connecting...';
    try {
      const res = await fetch('/api/connect-chrome', { method: 'POST' });
      const data = await res.json();
      if (!data.ok) {
        alert('Failed to connect Chrome: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error connecting Chrome: ' + err.message);
    } finally {
      btnConnectChrome.disabled = false;
      btnConnectChrome.textContent = 'Connect Chrome';
      checkStatus();
    }
  });

  // Start Pipeline Button
  btnStartPipeline.addEventListener('click', async () => {
    const idea = inputIdea.value.trim();
    if (!idea) {
      alert('Please enter a project goal or development requirement first.');
      inputIdea.focus();
      return;
    }

    const workspace = inputWorkspace.value.trim();
    const maxRetries = parseInt(inputMaxRetries.value, 10) || 3;
    const providers = {
      chatgpt: chkChatGPT.checked,
      gemini: chkGemini.checked,
      deepseek: chkDeepSeek.checked,
      claude: chkClaude.checked
    };

    btnStartPipeline.disabled = true;
    try {
      const res = await fetch('/api/start-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea, workspace, maxRetries, providers })
      });
      const data = await res.json();
      if (!data.ok) {
        alert('Could not start pipeline: ' + data.error);
        btnStartPipeline.disabled = false;
      }
    } catch (err) {
      alert('Network error starting pipeline: ' + err.message);
      btnStartPipeline.disabled = false;
    }
  });

  // SSE Event Source
  function initEventSource() {
    const evtSource = new EventSource('/api/events');

    evtSource.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        handleServerEvent(msg);
      } catch (err) {
        console.error('Failed to parse SSE payload:', err);
      }
    };

    evtSource.onerror = (err) => {
      console.warn('SSE connection error, reconnecting...', err);
    };
  }

  function handleServerEvent(msg) {
    const { type, data } = msg;

    if (type === 'CONNECTED' || type === 'STATE_CHANGE') {
      state = data;
      renderState(data);
    } else if (type === 'LOG_APPEND') {
      appendTerminal(data.text);
    } else if (type === 'CDP_PROGRESS') {
      appendTerminal(`[CDP] ${data.provider} -> ${data.status}\n`);
    }
  }

  function appendTerminal(text) {
    terminalLog.textContent += text;
    if (chkAutoScroll.checked) {
      terminalLog.scrollTop = terminalLog.scrollHeight;
    }
  }

  function renderState(s) {
    if (!s) return;

    // Running status
    if (s.running) {
      btnStartPipeline.disabled = true;
      btnStopPipeline.disabled = false;
      missionStatusPill.className = 'status-pill running';
      missionStatusPill.textContent = 'RUNNING';
    } else {
      btnStartPipeline.disabled = false;
      btnStopPipeline.disabled = true;
      if (s.stage === 'completed') {
        missionStatusPill.className = 'status-pill success';
        missionStatusPill.textContent = 'VERIFIED';
      } else {
        missionStatusPill.className = 'status-pill idle';
        missionStatusPill.textContent = 'IDLE';
      }
    }

    // Pipeline Stepper
    updateStepper(s.stage);

    // Multi-AI Debate Stream
    renderDebate(s.debateHistory || []);

    // Decision Packet
    renderDecisionPacket(s.decisionPacket);

    // Execution Evidence
    renderEvidence(s.executionEvidence);

    // Review History
    renderReview(s.reviewHistory || []);
  }

  function updateStepper(stage) {
    const steps = [
      'step-multi_ai_debate',
      'step-synthesizing_packet',
      'step-antigravity_executing',
      'step-ai_review',
      'step-completed'
    ];

    steps.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active', 'completed');
    });

    if (!stage || stage === 'idle') return;

    if (stage.startsWith('debate') || stage === 'multi_ai_debate') {
      document.getElementById('step-multi_ai_debate')?.classList.add('active');
    } else if (stage === 'synthesizing_packet') {
      document.getElementById('step-multi_ai_debate')?.classList.add('completed');
      document.getElementById('step-synthesizing_packet')?.classList.add('active');
    } else if (stage === 'antigravity_executing') {
      document.getElementById('step-multi_ai_debate')?.classList.add('completed');
      document.getElementById('step-synthesizing_packet')?.classList.add('completed');
      document.getElementById('step-antigravity_executing')?.classList.add('active');
    } else if (stage === 'ai_review' || stage === 'review_in_progress') {
      document.getElementById('step-multi_ai_debate')?.classList.add('completed');
      document.getElementById('step-synthesizing_packet')?.classList.add('completed');
      document.getElementById('step-antigravity_executing')?.classList.add('completed');
      document.getElementById('step-ai_review')?.classList.add('active');
    } else if (stage === 'completed') {
      steps.forEach(id => document.getElementById(id)?.classList.add('completed'));
    }
  }

  function renderDebate(history) {
    debateTurnCounter.textContent = `${history.length} turns`;
    if (!history.length) {
      debateStream.innerHTML = `<div class="empty-state">No active discussion yet. Enter your mission above and launch the pipeline.</div>`;
      return;
    }

    debateStream.innerHTML = history.map(item => {
      return `
        <div class="debate-turn-card ${item.provider}">
          <div class="turn-card-header">
            <span class="turn-author">${item.provider.toUpperCase()} (${item.role})</span>
            <span class="turn-meta">Turn ${item.turn}</span>
          </div>
          <div class="turn-card-body">${escapeHtml(item.text)}</div>
        </div>
      `;
    }).join('');
  }

  function renderDecisionPacket(packet) {
    if (!packet) {
      decisionPacketCard.innerHTML = `<div class="empty-state">Decision packet will be compiled automatically after multi-AI consensus.</div>`;
      return;
    }

    decisionPacketCard.innerHTML = `
      <h3>${escapeHtml(packet.title || 'Development Decision Packet')}</h3>
      <p style="color: var(--text-muted); font-size: 13px;">${escapeHtml(packet.summary || '')}</p>
      
      <div class="packet-section">
        <h4>Key Architectural Decisions</h4>
        <ul>${(packet.decisions || []).map(d => `<li>${escapeHtml(d)}</li>`).join('')}</ul>
      </div>

      <div class="packet-section">
        <h4>Acceptance Criteria</h4>
        <ul>${(packet.criteria || []).map(c => `<li>${escapeHtml(c)}</li>`).join('')}</ul>
      </div>

      <div class="packet-section">
        <h4>Target Implementation Tasks</h4>
        <ul>${(packet.tasks || []).map(t => `<li><strong>${escapeHtml(t.title || t)}</strong> (Target: ${escapeHtml(t.files ? t.files.join(', ') : 'src/')})</li>`).join('')}</ul>
      </div>
    `;
  }

  function renderEvidence(evidence) {
    if (!evidence) {
      evidenceContainer.innerHTML = `<div class="empty-state">Antigravity execution results (exit code, test outputs, git diff) will appear here.</div>`;
      return;
    }

    evidenceContainer.innerHTML = `
      <div class="evidence-block">
        <h4>Task Command &amp; Antigravity Execution</h4>
        <div style="font-size: 12px; margin-bottom: 8px;">
          <span>Status: <strong>${evidence.success ? '✅ Succeeded' : '❌ Failed'}</strong></span> | 
          <span>Exit Code: <strong>${evidence.exitCode}</strong></span>
        </div>
      </div>

      <div class="evidence-block">
        <h4>Automated Test Output</h4>
        <pre class="test-output-box">${escapeHtml(evidence.testOutput || 'No test output recorded.')}</pre>
      </div>

      <div class="evidence-block">
        <h4>Git Working Tree Diff</h4>
        <pre class="diff-box">${escapeHtml(evidence.gitDiff || 'No uncommitted git changes found.')}</pre>
      </div>
    `;
  }

  function renderReview(reviews) {
    if (!reviews || !reviews.length) {
      reviewContainer.innerHTML = `<div class="empty-state">AI review results and verification verdicts will appear here.</div>`;
      return;
    }

    reviewContainer.innerHTML = reviews.map((r, i) => {
      const isApproved = r.approved || (r.text && /APPROVED:\s*TRUE/i.test(r.text));
      return `
        <div class="evidence-block" style="border-left: 4px solid ${isApproved ? '#238636' : '#da3633'}">
          <h4>Review Iteration #${i + 1} - ${isApproved ? '✅ APPROVED' : '⚠️ REVISION REQUIRED'}</h4>
          <pre class="diff-box">${escapeHtml(r.text || '')}</pre>
        </div>
      `;
    }).join('');
  }

  async function checkStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (data.ok) {
        if (data.cdp?.connected) {
          cdpDot.className = 'status-dot connected';
          cdpLabel.textContent = 'Chrome: Connected';
        } else {
          cdpDot.className = 'status-dot disconnected';
          cdpLabel.textContent = 'Chrome: Disconnected';
        }

        badgeChatGPT.classList.toggle('active', !!data.cdp?.tabs?.chatgpt);
        badgeGemini.classList.toggle('active', !!data.cdp?.tabs?.gemini);
        badgeDeepSeek.classList.toggle('active', !!data.cdp?.tabs?.deepseek);
        badgeClaude.classList.toggle('active', !!data.cdp?.tabs?.claude);

        if (data.session) {
          renderState(data.session);
        }
      }
    } catch (_) {}
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return String(str || '');
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Periodic polling for CDP tabs state
  setInterval(checkStatus, 3000);
  checkStatus();
  initEventSource();
});
