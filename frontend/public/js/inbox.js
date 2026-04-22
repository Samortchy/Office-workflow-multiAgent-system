const form = document.getElementById('pipeline-form');
const textarea = document.getElementById('request-text');
const charCount = document.getElementById('char-count');
const submitBtn = document.getElementById('submit-btn');
const progressEl = document.getElementById('pipeline-progress');
const successEl = document.getElementById('success-state');
const successMeta = document.getElementById('success-meta');
const clearBtn = document.getElementById('clear-btn');
const examplesBlock = document.getElementById('examples-block');
const historyBlock = document.getElementById('history-block');
const historyLabel = document.getElementById('history-label');
const historyList = document.getElementById('history-list');

const sessionHistory = [];

// Char count
textarea.addEventListener('input', () => {
  charCount.textContent = textarea.value.length;
});

// Example buttons
document.querySelectorAll('.example-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const text = btn.textContent.replace('→', '').trim();
    textarea.value = text;
    charCount.textContent = text.length;
    textarea.focus();
  });
});

// Stage helpers
function setStage(stageEl, status) {
  const node = stageEl.querySelector('.stage-node');
  const label = stageEl.querySelector('.stage-label');
  const line = stageEl.querySelector('.stage-line');

  node.className = `stage-node w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${status}`;

  if (label) {
    label.className = `stage-label text-[10px] font-mono font-semibold ${status}`;
  }
  if (line) {
    line.className = `flex-1 h-px mx-2 mb-5 stage-line transition-colors duration-300 ${status}`;
  }

  const iconMap = {
    pending:    '<span class="w-2 h-2 rounded-full border border-current opacity-30 inline-block"></span>',
    processing: `<span class="relative flex w-2 h-2">
      <span class="ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
      <span class="relative inline-flex rounded-full w-2 h-2 bg-cyan-400"></span>
    </span>`,
    complete:   '<span class="text-[10px] text-emerald-400">✓</span>',
    error:      '<span class="text-[10px] text-red-400">✕</span>',
  };
  node.innerHTML = iconMap[status] || iconMap.pending;
}

function resetStages() {
  ['intake', 'task', 'priority'].forEach(id => {
    setStage(document.getElementById(`stage-${id}`), 'pending');
  });
  document.getElementById('progress-badge').innerHTML = '';
}

async function simulateProgress() {
  const delay = ms => new Promise(r => setTimeout(r, ms));
  setStage(document.getElementById('stage-intake'), 'processing');
  await delay(900);
  setStage(document.getElementById('stage-intake'), 'complete');
  setStage(document.getElementById('stage-task'), 'processing');
  await delay(900);
  setStage(document.getElementById('stage-task'), 'complete');
  setStage(document.getElementById('stage-priority'), 'processing');
  await delay(900);
}

// Form submission
form.addEventListener('submit', async e => {
  e.preventDefault();
  const text = textarea.value.trim();
  if (!text) return;

  // UI: show processing
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="inline-block w-3.5 h-3.5 border border-cyan-500/50 border-t-cyan-400 rounded-full animate-spin"></span> RUNNING PIPELINE…`;
  progressEl.classList.remove('hidden');
  successEl.classList.add('hidden');
  examplesBlock.classList.add('hidden');
  resetStages();

  try {
    const [result] = await Promise.all([
      fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: text }),
      }).then(r => r.json()),
      simulateProgress(),
    ]);

    // All complete
    setStage(document.getElementById('stage-priority'), 'complete');
    document.getElementById('progress-badge').innerHTML =
      '<span class="text-[10px] font-mono text-emerald-400 bg-emerald-950 border border-emerald-800 px-2 py-0.5 rounded">COMPLETE</span>';

    await new Promise(r => setTimeout(r, 400));

    // Show success
    progressEl.classList.add('hidden');
    successEl.classList.remove('hidden');
    successMeta.textContent = `${result.envelope_id} — ${result.task?.title ?? ''}`;

    // Add to session history
    sessionHistory.unshift(result);
    if (sessionHistory.length > 10) sessionHistory.pop();
    renderHistory();

    // Open drawer after short delay
    openDrawer(result);

  } catch {
    // Show error on current processing stage
    ['intake', 'task', 'priority'].forEach(id => {
      const el = document.getElementById(`stage-${id}`);
      if (el.querySelector('.stage-node').classList.contains('processing')) {
        setStage(el, 'error');
      }
    });
    document.getElementById('progress-badge').innerHTML =
      '<span class="text-[10px] font-mono text-red-400 bg-red-950 border border-red-800 px-2 py-0.5 rounded">ERROR</span>';
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>▶</span> RUN PIPELINE';
  }
});

// Clear button
clearBtn.addEventListener('click', () => {
  textarea.value = '';
  charCount.textContent = '0';
  progressEl.classList.add('hidden');
  successEl.classList.add('hidden');
  examplesBlock.classList.remove('hidden');
  resetStages();
});

function renderHistory() {
  historyBlock.classList.remove('hidden');
  historyLabel.textContent = `SESSION HISTORY — ${sessionHistory.length}`;
  historyList.innerHTML = sessionHistory.map(env => `
    <button
      onclick="openDrawer(${JSON.stringify(env).replace(/</g,'\\u003c')})"
      class="w-full flex items-center gap-3 p-2.5 rounded-md border border-[rgba(148,163,184,0.07)] bg-navy-800 hover:border-[rgba(6,182,212,0.25)] hover:bg-navy-700 transition-all text-left group"
    >
      <span class="font-id text-[10px] text-cyan-400/70 flex-shrink-0">${escapeHtml(env.envelope_id)}</span>
      <span class="text-[11px] text-slate-400 truncate flex-1">${escapeHtml(env.task?.title ?? env.raw_text.slice(0, 60))}</span>
      <span class="text-[9px] font-mono text-slate-700 group-hover:text-slate-500 transition-colors">VIEW →</span>
    </button>`).join('');
}
