window.ENVELOPES = window.INITIAL_ENVELOPES || [];

function timeInQueue(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  if (mins > 0) return `${mins}m`;
  return '<1m';
}

function renderQueueItem(env, showAssign) {
  const dept = env.intake?.department;
  const score = env.priority?.priority_score ?? 1;
  const leftColors = { 1: 'bg-slate-600', 2: 'bg-sky-500', 3: 'bg-amber-500', 4: 'bg-red-500' };
  return `<div
    class="flex items-stretch rounded-md border border-[rgba(148,163,184,0.08)] bg-navy-700 hover:border-[rgba(6,182,212,0.25)] transition-all duration-150 cursor-pointer overflow-hidden group"
    onclick="openDrawerById('${escapeHtml(env.envelope_id)}')"
  >
    <div class="w-[2px] flex-shrink-0 ${leftColors[score] || 'bg-slate-600'}"></div>
    <div class="flex-1 px-3 py-2.5 min-w-0">
      <div class="flex items-start justify-between gap-2 mb-1.5">
        <p class="text-xs text-slate-200 leading-snug font-medium line-clamp-1 flex-1">${escapeHtml(env.task?.title ?? env.envelope_id)}</p>
        ${env.priority ? renderPriorityBadge(score) : ''}
      </div>
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5">
          ${dept ? renderDeptTag(dept) : ''}
          <span class="text-[10px] font-mono text-slate-600">${timeInQueue(env.received_at)}</span>
        </div>
        ${showAssign ? `<button onclick="event.stopPropagation()" class="text-[9px] font-mono text-slate-500 border border-slate-700 px-1.5 py-0.5 rounded hover:text-cyan-400 hover:border-cyan-800 transition-all opacity-0 group-hover:opacity-100">ASSIGN →</button>` : ''}
      </div>
    </div>
  </div>`;
}

function renderColumn(title, variant, envelopes) {
  const sorted = [...envelopes].sort((a, b) => (b.priority?.priority_score ?? 0) - (a.priority?.priority_score ?? 0));
  const isAuto = variant === 'autonomous';
  const headerColor = isAuto ? 'text-emerald-400 border-emerald-900/50' : 'text-red-400 border-red-900/50';
  const dotColor = isAuto ? 'bg-emerald-400' : 'bg-red-400';
  const emptyMsg = isAuto ? 'No autonomous tasks in queue' : 'No tasks pending human review';

  return `<div class="flex flex-col">
    <div class="flex items-center justify-between border-b pb-3 mb-3 ${headerColor}">
      <div class="flex items-center gap-2">
        <span class="w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}"></span>
        <span class="text-xs font-mono font-semibold tracking-widest">${title}</span>
      </div>
      <span class="text-xs font-mono opacity-60">${sorted.length}</span>
    </div>
    <div class="space-y-2 flex-1">
      ${sorted.length === 0
        ? `<div class="flex items-center justify-center py-10 text-[10px] font-mono text-slate-700 text-center">${emptyMsg}</div>`
        : sorted.map(env => renderQueueItem(env, !isAuto)).join('')}
    </div>
  </div>`;
}

function renderQueue() {
  const completed = window.ENVELOPES.filter(e => e.priority !== null);
  const autonomous = completed.filter(e => e.intake?.isAutonomous === true);
  const humanReview = completed.filter(e => e.intake?.isAutonomous === false);
  const inflight = window.ENVELOPES.length - completed.length;

  const grid = document.getElementById('queue-grid');
  const summary = document.getElementById('queue-summary');

  if (grid) {
    grid.innerHTML =
      renderColumn('AUTONOMOUS QUEUE', 'autonomous', autonomous) +
      renderColumn('HUMAN REVIEW QUEUE', 'human', humanReview);
  }

  if (summary) {
    summary.innerHTML = `
      <div class="text-[10px] font-mono text-slate-600"><span class="text-emerald-500">${autonomous.length}</span> auto-resolved</div>
      <div class="text-[10px] font-mono text-slate-600"><span class="text-red-500">${humanReview.length}</span> pending review</div>
      <div class="text-[10px] font-mono text-slate-600"><span class="text-slate-400">${inflight}</span> in-flight</div>`;
  }

  renderStatsBar(window.ENVELOPES);
}

renderQueue();

setInterval(async () => {
  try {
    const res = await fetch('/api/envelopes');
    if (res.ok) {
      window.ENVELOPES = await res.json();
      renderQueue();
    }
  } catch {}
}, 5000);
