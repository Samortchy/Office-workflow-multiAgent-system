import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { MOCK_ENVELOPES } from './data/mockData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE = process.env.API_URL || '';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

async function fetchEnvelopes() {
  if (!API_BASE) return MOCK_ENVELOPES;
  try {
    const res = await fetch(`${API_BASE}/api/envelopes`);
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return MOCK_ENVELOPES;
  }
}

app.get('/', async (req, res) => {
  const envelopes = await fetchEnvelopes();
  res.render('dashboard', { envelopes, page: 'dashboard' });
});

app.get('/inbox', (req, res) => {
  res.render('inbox', { page: 'inbox' });
});

app.get('/queue', async (req, res) => {
  const envelopes = await fetchEnvelopes();
  res.render('queue', { envelopes, page: 'queue' });
});

// Proxy / mock API endpoints for client-side polling
app.get('/api/envelopes', async (req, res) => {
  const data = await fetchEnvelopes();
  res.json(data);
});

app.post('/api/pipeline', async (req, res) => {
  const { raw_text } = req.body;
  if (API_BASE) {
    try {
      const r = await fetch(`${API_BASE}/api/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text }),
      });
      if (r.ok) return res.json(await r.json());
    } catch {}
  }
  // Mock response
  await new Promise(r => setTimeout(r, 2800));
  const id = `ENV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  res.json({
    envelope_id: id,
    raw_text,
    received_at: now,
    errors: [],
    intake: {
      department: 'IT',
      task_type: 'general_inquiry',
      isAutonomous: true,
      reasoning: 'Request classified as a routine inquiry that can be resolved via automated response.',
      confidence: 0.84,
      processed_at: now,
    },
    task: {
      task_id: `TASK-${id.slice(4)}`,
      title: 'General IT Inquiry',
      description: raw_text.slice(0, 120),
      department: 'IT',
      isAutonomous: true,
      task_type: 'general_inquiry',
      requester_name: 'Unknown',
      stated_deadline: 'None',
      action_required: 'Route to automated knowledge base. Return relevant help articles within 2 minutes.',
      success_criteria: 'User receives relevant response within SLA window.',
      structured_at: now,
    },
    priority: {
      priority_score: 2,
      priority_label: 'medium',
      confidence: 0.79,
      model_version: 'priority-agent-v2.1',
      top_features_used: ['task_type', 'is_autonomous', 'routine'],
      scored_at: now,
    },
  });
});

app.listen(PORT, () => {
  console.log(`AWOM Dashboard → http://localhost:${PORT}`);
});
