let currentFilter = 'all';
let currentSort = 'newest';
window.ENVELOPES = window.INITIAL_ENVELOPES || [];

function applyFilter(envelopes) {
  return envelopes.filter(e => {
    if (currentFilter === 'all') return true;
    if (currentFilter === 'autonomous') return e.intake?.isAutonomous === true;
    if (currentFilter === 'review') return e.intake?.isAutonomous === false;
    return e.intake?.department === currentFilter;
  });
}

function applySort(envelopes) {
  return [...envelopes].sort((a, b) => {
    if (currentSort === 'priority') return (b.priority?.priority_score ?? 0) - (a.priority?.priority_score ?? 0);
    if (currentSort === 'department') return (a.intake?.department ?? '').localeCompare(b.intake?.department ?? '');
    return new Date(b.received_at).getTime() - new Date(a.received_at).getTime();
  });
}

function renderDashboard() {
  const grid = document.getElementById('cards-grid');
  const meta = document.getElementById('envelope-meta');
  const shownCount = document.getElementById('shown-count');

  const filtered = applyFilter(window.ENVELOPES);
  const sorted = applySort(filtered);

  if (meta) meta.textContent = `${window.ENVELOPES.length} envelope${window.ENVELOPES.length !== 1 ? 's' : ''} · polling every 5s`;
  if (shownCount) shownCount.textContent = `${sorted.length} shown`;

  if (!grid) return;

  if (sorted.length === 0) {
    grid.innerHTML = `<div class="col-span-2 flex flex-col items-center justify-center py-20 text-center">
      <div class="text-3xl mb-3 opacity-20">⊡</div>
      <div class="text-xs font-mono text-slate-600">No envelopes match current filter</div>
    </div>`;
  } else {
    grid.innerHTML = sorted.map((env, i) => renderCard(env, i)).join('');
  }

  renderStatsBar(window.ENVELOPES);
}

// Filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentFilter = btn.dataset.filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active-filter'));
    btn.classList.add('active-filter');
    renderDashboard();
  });
});

// Sort buttons
document.querySelectorAll('.sort-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentSort = btn.dataset.sort;
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active-sort'));
    btn.classList.add('active-sort');
    renderDashboard();
  });
});

// Initial render
renderDashboard();

// Poll every 5s
setInterval(async () => {
  try {
    const res = await fetch('/api/envelopes');
    if (res.ok) {
      window.ENVELOPES = await res.json();
      renderDashboard();
    }
  } catch {}
}, 5000);
