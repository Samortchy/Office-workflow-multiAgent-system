import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const dbPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'database', 'data.json');
try {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
} catch (e) {}

async function getEnvelopes() {
  try {
    const data = await fs.readFile(dbPath, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveEnvelope(env) {
  const current = await getEnvelopes();
  current.unshift(env);
  await fs.writeFile(dbPath, JSON.stringify(current, null, 2));
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE = process.env.API_URL || 'http://localhost:8000';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());


// ── Page routes ──────────────────────────────────────────────────────────────

// Pages no longer pre-fetch envelopes on load.
// The browser calls POST /api/pipeline and renders results client-side.

app.get('/', async (req, res) => {
  const envelopes = await getEnvelopes();
  res.render('dashboard', { page: 'dashboard', envelopes });
});

app.get('/inbox', (req, res) => {
  res.render('inbox', { page: 'inbox' });
});

app.get('/queue', async (req, res) => {
  const envelopes = await getEnvelopes();
  res.render('queue', { page: 'queue', envelopes });
});

app.get('/api/envelopes', async (req, res) => {
  const envelopes = await getEnvelopes();
  res.json(envelopes);
});


// ── API proxy ─────────────────────────────────────────────────────────────────

app.post('/api/pipeline', async (req, res) => {
  const { raw_text } = req.body;

  if (!raw_text || !raw_text.trim()) {
    return res.status(400).json({ error: 'raw_text is required' });
  }

  try {
    const r = await fetch(`${API_BASE}/api/pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_text }),
    });

    const data = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({ error: data.detail || 'Pipeline error' });
    }

    await saveEnvelope(data);
    res.json(data);
    
  } catch (err) {
    res.status(502).json({ error: `Could not reach pipeline API: ${err.message}` });
  }
});


// ── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`AWOM Dashboard  → http://localhost:${PORT}`);
  console.log(`Pipeline API    → ${API_BASE}`);
});