/* ===== Helpers ===== */

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatRelativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'just now';
}

function getEnvelopeStage(env) {
  if (env.priority) return 'COMPLETE';
  if (env.task) return 'PRIORITY';
  if (env.intake) return 'TASK';
  return 'INTAKE';
}

/* ===== Badge / tag HTML builders ===== */

function priorityBarColor(score) {
  return { 1: 'bg-slate-500', 2: 'bg-sky-500', 3: 'bg-amber-500', 4: 'bg-red-500' }[score] || 'bg-slate-500';
}

function stageClasses(stage) {
  return {
    INTAKE:   'text-slate-400 bg-slate-800 border-slate-700',
    TASK:     'text-sky-400 bg-sky-950 border-sky-800',
    PRIORITY: 'text-amber-400 bg-amber-950 border-amber-800',
    COMPLETE: 'text-emerald-400 bg-emerald-950 border-emerald-800',
  }[stage] || 'text-slate-400 bg-slate-800 border-slate-700';
}

function deptConfig(dept) {
  return {
    IT:      { cls: 'text-cyan-400 bg-cyan-950 border-cyan-800',     dot: 'bg-cyan-400' },
    HR:      { cls: 'text-violet-400 bg-violet-950 border-violet-800', dot: 'bg-violet-400' },
    Finance: { cls: 'text-amber-400 bg-amber-950 border-amber-800',  dot: 'bg-amber-400' },
  }[dept] || { cls: 'text-slate-400 bg-slate-800 border-slate-700', dot: 'bg-slate-400' };
}

function priorityConfig(score) {
  return {
    1: { cls: 'text-slate-400 bg-slate-800 border-slate-700', dot: 'bg-slate-500', label: 'LOW' },
    2: { cls: 'text-sky-400 bg-sky-950 border-sky-800',       dot: 'bg-sky-400',   label: 'MED' },
    3: { cls: 'text-amber-400 bg-amber-950 border-amber-800', dot: 'bg-amber-400', label: 'HIGH' },
    4: { cls: 'text-red-400 bg-red-950 border-red-800',       dot: 'bg-red-400',   label: 'CRIT' },
  }[score] || { cls: 'text-slate-400 bg-slate-800 border-slate-700', dot: 'bg-slate-500', label: 'LOW' };
}

function renderDeptTag(dept, size = 'sm') {
  const { cls, dot } = deptConfig(dept);
  const pad = size === 'sm' ? 'px-1.5 py-[3px] text-[10px]' : 'px-2 py-1 text-xs';
  return `<span class="inline-flex items-center gap-1 border font-mono font-semibold rounded ${cls} ${pad}">
    <span class="w-1 h-1 rounded-full flex-shrink-0 ${dot}"></span>${escapeHtml(dept)}
  </span>`;
}

function renderAutonomyBadge(isAuto, size = 'sm') {
  const pad = size === 'sm' ? 'px-1.5 py-[3px] text-[10px]' : 'px-2 py-1 text-xs';
  if (isAuto) {
    return `<span class="inline-flex items-center gap-1 border font-mono font-semibold rounded text-emerald-400 bg-emerald-950 border-emerald-800 ${pad}">
      <span class="relative flex h-1.5 w-1.5 flex-shrink-0">
        <span class="ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
      </span>AUTO
    </span>`;
  }
  return `<span class="inline-flex items-center gap-1 border font-mono font-semibold rounded text-red-400 bg-red-950 border-red-800 ${pad}">
    <span class="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-red-400"></span>REVIEW
  </span>`;
}

function renderPriorityBadge(score, size = 'sm') {
  const { cls, dot, label } = priorityConfig(score);
  const pad = size === 'sm' ? 'px-1.5 py-[3px] text-[10px] gap-1' : 'px-2 py-1 text-xs gap-1.5';
  return `<span class="inline-flex items-center border font-mono font-semibold rounded ${cls} ${pad}">
    <span class="w-1 h-1 rounded-full flex-shrink-0 ${dot}"></span>
    <span class="opacity-50">P</span><span>${score}</span><span class="opacity-50">${label}</span>
  </span>`;
}

function renderConfidenceBar(value) {
  const pct = Math.round(value * 100);
  const color = pct >= 90 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-500';
  return `<div class="flex items-center gap-2 w-full">
    <div class="flex-1 h-[3px] rounded-full overflow-hidden" style="background:#0f1d35">
      <div class="conf-bar ${color}" style="width:0%" data-pct="${pct}%"></div>
    </div>
    <span class="text-[11px] font-mono text-slate-400 w-7 text-right">${pct}%</span>
  </div>`;
}

/* ===== Stats Bar ===== */

function renderStatsBar(envelopes) {
  const bar = document.getElementById('stats-bar');
  if (!bar) return;
  const total = envelopes.length;
  const autonomous = envelopes.filter(e => e.intake?.isAutonomous).length;
  const autoRate = total > 0 ? Math.round((autonomous / total) * 100) : 0;
  const totalPri = envelopes.reduce((a, e) => a + (e.priority?.priority_score ?? 0), 0);
  const avgPri = total > 0 ? (totalPri / total).toFixed(1) : '—';
  const critical = envelopes.filter(e => e.priority?.priority_score === 4).length;
  const depts = envelopes.reduce((a, e) => {
    if (e.intake?.department) a[e.intake.department] = (a[e.intake.department] ?? 0) + 1;
    return a;
  }, {});

  const deptBadges = ['IT', 'HR', 'Finance'].map(d => {
    const { cls } = deptConfig(d);
    return `<span class="inline-flex items-center gap-1 text-[10px] font-mono font-semibold border px-1.5 py-0.5 rounded ${cls}">
      ${d}<span class="opacity-70">${depts[d] ?? 0}</span>
    </span>`;
  }).join('');

  bar.innerHTML = `<div class="flex items-stretch divide-x divide-[rgba(148,163,184,0.08)]">
    <div class="px-4 py-3 flex items-center gap-2.5 flex-shrink-0">
      <span class="relative flex h-2 w-2">
        <span class="ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span>
        <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
      </span>
      <span class="text-[10px] font-mono text-slate-400 tracking-widest">LIVE</span>
    </div>
    <div class="px-5 py-3 flex flex-col justify-center gap-0.5">
      <span class="text-[10px] font-mono text-slate-500 tracking-widest">PROCESSED TODAY</span>
      <span class="text-lg font-bold text-white leading-none" style="font-family:Syne,sans-serif">${total}</span>
    </div>
    <div class="px-5 py-3 flex flex-col justify-center gap-0.5">
      <span class="text-[10px] font-mono text-slate-500 tracking-widest">AUTO RATE</span>
      <div class="flex items-baseline gap-1">
        <span class="text-lg font-bold text-emerald-400 leading-none" style="font-family:Syne,sans-serif">${autoRate}%</span>
        <span class="text-[10px] font-mono text-slate-500">${autonomous}/${total}</span>
      </div>
    </div>
    <div class="px-5 py-3 flex flex-col justify-center gap-0.5">
      <span class="text-[10px] font-mono text-slate-500 tracking-widest">AVG PRIORITY</span>
      <span class="text-lg font-bold text-amber-400 leading-none" style="font-family:Syne,sans-serif">${avgPri}</span>
    </div>
    <div class="px-5 py-3 flex flex-col justify-center gap-0.5">
      <span class="text-[10px] font-mono text-slate-500 tracking-widest">CRITICAL</span>
      <span class="text-lg font-bold leading-none ${critical > 0 ? 'text-red-400' : 'text-slate-600'}" style="font-family:Syne,sans-serif">${critical}</span>
    </div>
    <div class="px-5 py-3 flex flex-col justify-center gap-1.5">
      <span class="text-[10px] font-mono text-slate-500 tracking-widest">DEPARTMENTS</span>
      <div class="flex items-center gap-2">${deptBadges}</div>
    </div>
    <div class="flex-1"></div>
    <div class="px-4 py-3 flex items-center gap-1.5 flex-shrink-0">
      <span class="text-[9px] font-mono text-slate-600 tracking-widest">POLL 5s</span>
      <span class="w-1 h-1 rounded-full bg-cyan-500 opacity-50"></span>
    </div>
  </div>`;
}

/* ===== Envelope Card ===== */

function renderCard(env, index) {
  const stage = getEnvelopeStage(env);
  const score = env.priority?.priority_score ?? 1;
  const barColor = priorityBarColor(score);
  const stageCls = stageClasses(stage);
  const dept = env.intake?.department;
  const isAuto = env.intake?.isAutonomous;
  const preview = env.raw_text.length > 110 ? env.raw_text.slice(0, 107) + '…' : env.raw_text;

  return `<div class="card-interactive flex overflow-hidden" onclick="openDrawerById('${escapeHtml(env.envelope_id)}')" data-env-id="${escapeHtml(env.envelope_id)}">
    <div class="w-[3px] flex-shrink-0 ${barColor}"></div>
    <div class="flex-1 p-4 min-w-0">
      <div class="flex items-start justify-between gap-3 mb-2.5">
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-[10px] font-mono font-semibold border px-1.5 py-[3px] rounded ${stageCls}">${stage}</span>
          ${dept ? renderDeptTag(dept) : ''}
          ${isAuto !== undefined ? renderAutonomyBadge(isAuto) : ''}
        </div>
        <span class="font-id text-[11px] text-cyan-400 whitespace-nowrap flex-shrink-0">${escapeHtml(env.envelope_id)}</span>
      </div>
      <p class="text-sm text-slate-300 leading-relaxed mb-3 line-clamp-2">${escapeHtml(preview)}</p>
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5 flex-wrap">
          ${env.priority ? renderPriorityBadge(score) : '<span class="text-[10px] font-mono text-slate-600">● processing</span>'}
          ${env.errors.length > 0 ? `<span class="text-[10px] font-mono text-red-400 border border-red-800 px-1.5 py-[3px] rounded bg-red-950">${env.errors.length} ERR</span>` : ''}
        </div>
        <div class="flex items-center gap-2 text-[10px] font-mono text-slate-500 flex-shrink-0">
          <span>${formatTime(env.received_at)}</span>
          <span class="text-slate-700">·</span>
          <span>${formatRelativeTime(env.received_at)}</span>
        </div>
      </div>
    </div>
  </div>`;
}

/* ===== Drawer ===== */

let _drawerEnv = null;
let _showRaw = false;

function openDrawerById(id) {
  const env = (window.ENVELOPES || []).find(e => e.envelope_id === id);
  if (env) openDrawer(env);
}

function openDrawer(env) {
  _drawerEnv = env;
  _showRaw = false;
  renderDrawerContent(env);
  document.getElementById('drawer-backdrop').classList.remove('hidden');
  requestAnimationFrame(() => {
    document.getElementById('drawer-panel').style.transform = 'translateX(0)';
  });
  setTimeout(animateConfBars, 50);
}

function closeDrawer() {
  document.getElementById('drawer-panel').style.transform = 'translateX(100%)';
  setTimeout(() => document.getElementById('drawer-backdrop').classList.add('hidden'), 300);
}

function renderDrawerContent(env) {
  const dept = env.intake?.department;
  const isAuto = env.intake?.isAutonomous;
  const score = env.priority?.priority_score;

  // Header
  document.getElementById('drawer-header').innerHTML = `
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="font-id text-cyan-400 text-xs tracking-[0.12em] mb-1">${escapeHtml(env.envelope_id)}</div>
        <h2 class="heading-display text-white text-[15px] leading-snug">${escapeHtml(env.task?.title ?? 'Awaiting processing…')}</h2>
        <div class="flex items-center gap-1.5 mt-2 flex-wrap">
          ${dept ? renderDeptTag(dept, 'md') : ''}
          ${isAuto !== undefined ? renderAutonomyBadge(isAuto, 'md') : ''}
          ${score ? renderPriorityBadge(score, 'md') : ''}
        </div>
      </div>
      <button onclick="closeDrawer()" class="w-8 h-8 rounded border border-[rgba(148,163,184,0.15)] text-slate-400 hover:text-white hover:border-slate-500 transition-all flex items-center justify-center text-base leading-none flex-shrink-0">×</button>
    </div>`;

  // Body
  document.getElementById('drawer-content').innerHTML = `
    <div class="p-3 rounded-md border border-[rgba(148,163,184,0.07)]" style="background:#0f1d3599">
      <div class="text-[9px] font-mono text-slate-600 tracking-widest mb-1.5">RAW REQUEST</div>
      <p class="text-xs text-slate-300 leading-relaxed">${escapeHtml(env.raw_text)}</p>
    </div>
    ${env.intake ? renderSection('INTAKE', renderIntake(env.intake), renderConfidenceBar(env.intake.confidence)) : ''}
    ${env.task ? renderSection('TASK', renderTask(env.task)) : ''}
    ${env.priority ? renderSection('PRIORITY', renderPriority(env.priority), renderPriorityBadge(env.priority.priority_score)) : ''}
    ${env.errors.length > 0 ? renderSection('ERRORS', env.errors.map(e => `<div class="text-[11px] font-mono text-red-300 bg-red-950 border border-red-900 rounded p-2.5 leading-relaxed">${escapeHtml(e)}</div>`).join('')) : ''}
    <div id="raw-json-block" class="hidden rounded-md border border-[rgba(148,163,184,0.07)] overflow-hidden">
      <div class="text-[9px] font-mono text-slate-600 px-3 py-2 tracking-widest border-b border-[rgba(148,163,184,0.07)]" style="background:#0f1d3599">RAW JSON</div>
      <pre class="text-[10px] font-mono text-slate-400 p-4 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all max-h-80 overflow-y-auto">${escapeHtml(JSON.stringify(env, null, 2))}</pre>
    </div>`;

  // Footer
  document.getElementById('drawer-footer').innerHTML = `
    <button onclick="toggleRawJson()" class="text-[10px] font-mono text-slate-500 hover:text-cyan-400 transition-colors tracking-wider" id="raw-json-btn">{ } VIEW RAW JSON</button>
    <span class="text-[9px] font-mono text-slate-700">${new Date(env.received_at).toLocaleString()}</span>`;
}

function renderSection(title, body, badge = '') {
  return `<div class="border border-[rgba(148,163,184,0.07)] rounded-md overflow-hidden">
    <button onclick="toggleSection(this)" class="w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors" style="background:#0f1d3580" onmouseover="this.style.background='#0f1d35cc'" onmouseout="this.style.background='#0f1d3580'">
      <div class="flex items-center gap-2">
        <span class="section-arrow text-[8px] text-slate-600 inline-block transition-transform" style="transform:rotate(90deg)">▶</span>
        <span class="text-[10px] font-mono font-semibold text-slate-400 tracking-widest">${title}</span>
      </div>
      ${badge ? `<div onclick="event.stopPropagation()">${badge}</div>` : ''}
    </button>
    <div class="section-content expanded">
      <div class="px-4 py-3 space-y-2.5">${body}</div>
    </div>
  </div>`;
}

function renderField(label, value) {
  return `<div class="flex gap-3">
    <span class="text-[10px] font-mono text-slate-500 w-28 flex-shrink-0 pt-0.5 tracking-wide">${label}</span>
    <div class="text-[11px] font-mono text-slate-300 break-all leading-relaxed min-w-0">${value}</div>
  </div>`;
}

function renderIntake(intake) {
  return [
    renderField('department', escapeHtml(intake.department)),
    renderField('task_type', escapeHtml(intake.task_type)),
    renderField('isAutonomous', `<span class="${intake.isAutonomous ? 'text-emerald-400' : 'text-red-400'}">${intake.isAutonomous}</span>`),
    renderField('confidence', renderConfidenceBar(intake.confidence)),
    renderField('reasoning', `<span class="text-slate-400 text-[11px] leading-relaxed font-sans">${escapeHtml(intake.reasoning)}</span>`),
    renderField('processed_at', escapeHtml(new Date(intake.processed_at).toLocaleString())),
  ].join('');
}

function renderTask(task) {
  return [
    renderField('task_id', `<span class="text-cyan-400/70">${escapeHtml(task.task_id)}</span>`),
    renderField('title', escapeHtml(task.title)),
    renderField('description', `<span class="text-slate-400 font-sans text-[11px] leading-relaxed">${escapeHtml(task.description)}</span>`),
    renderField('requester', escapeHtml(task.requester_name)),
    renderField('deadline', escapeHtml(task.stated_deadline)),
    renderField('action', `<span class="text-slate-400 font-sans text-[11px] leading-relaxed">${escapeHtml(task.action_required)}</span>`),
    renderField('success', `<span class="text-slate-400 font-sans text-[11px] leading-relaxed">${escapeHtml(task.success_criteria)}</span>`),
    renderField('structured_at', escapeHtml(new Date(task.structured_at).toLocaleString())),
  ].join('');
}

function renderPriority(priority) {
  const { label } = priorityConfig(priority.priority_score);
  const features = priority.top_features_used.map(f =>
    `<span class="text-[9px] font-mono border border-[rgba(148,163,184,0.1)] px-1.5 py-0.5 rounded text-slate-400" style="background:#0f1d35">${escapeHtml(f)}</span>`
  ).join('');
  return [
    renderField('score', `<span class="font-semibold">${priority.priority_score} — <span class="uppercase">${label}</span></span>`),
    renderField('confidence', renderConfidenceBar(priority.confidence)),
    renderField('model', escapeHtml(priority.model_version)),
    renderField('features', `<div class="flex flex-wrap gap-1 mt-0.5">${features}</div>`),
    renderField('scored_at', escapeHtml(new Date(priority.scored_at).toLocaleString())),
  ].join('');
}

function toggleSection(btn) {
  const content = btn.nextElementSibling;
  const arrow = btn.querySelector('.section-arrow');
  const isOpen = content.classList.contains('expanded');
  content.classList.toggle('expanded', !isOpen);
  content.classList.toggle('collapsed', isOpen);
  arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
}

function toggleRawJson() {
  _showRaw = !_showRaw;
  document.getElementById('raw-json-block').classList.toggle('hidden', !_showRaw);
  document.getElementById('raw-json-btn').textContent = _showRaw ? '— HIDE RAW JSON' : '{ } VIEW RAW JSON';
}

function animateConfBars() {
  document.querySelectorAll('.conf-bar').forEach(bar => {
    const pct = bar.dataset.pct;
    requestAnimationFrame(() => { bar.style.width = pct; });
  });
}

/* ===== Keyboard shortcut ===== */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeDrawer();
});
