/**
 * CC→Odoo Statement Importer — Web Server
 *
 * CRITICAL: API routes are registered BEFORE express.static —
 * otherwise the static middleware intercepts /api/ requests and
 * returns the HTML file instead of JSON (causing parse errors).
 *
 * Usage:  npm install  →  node server.js
 * Open:   http://localhost:3004
 */

const express = require('express');
const axios   = require('axios');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3004;

// ── Body parser only — NO static middleware yet ───────────────────────────────
app.use(express.json({ limit: '10mb' }));

// ── State Storage ──────────────────────────────────────────────────────────────
const STATE_FILE = path.join(__dirname, 'cc-state.json');

function readState() {
  try   { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return {}; }
}
function writeState(data) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), 'utf8'); }
  catch(e) { console.error('[State] Write failed:', e.message); }
}

// GET /api/state/:key
app.get('/api/state/:key', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const state = readState();
    const key   = decodeURIComponent(req.params.key);
    if (key in state) res.json({ ok: true, value: state[key] });
    else              res.json({ ok: false });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/state/:key   body: { value: any }
app.post('/api/state/:key', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const state = readState();
    const key   = decodeURIComponent(req.params.key);
    state[key]  = req.body.value;
    writeState(state);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// DELETE /api/state
app.delete('/api/state', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try { writeState({}); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Odoo JSON-RPC Proxy ────────────────────────────────────────────────────────
app.post('/api/odoo/rpc', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const { url, endpoint, params } = req.body;
  if (!url || !endpoint)
    return res.status(400).json({ error: { message: 'url and endpoint are required' } });

  const incomingCookie = req.headers.cookie || '';
  try {
    const odooRes = await axios.post(
      url.replace(/\/$/, '') + endpoint,
      { jsonrpc: '2.0', method: 'call', id: 1, params },
      {
        headers: {
          'Content-Type': 'application/json',
          ...(incomingCookie ? { Cookie: incomingCookie } : {})
        },
        timeout: 30000,
        validateStatus: () => true
      }
    );
    // Forward Odoo session cookies (strip Secure/SameSite for non-HTTPS)
    (odooRes.headers['set-cookie'] || []).forEach(c => {
      res.append('Set-Cookie', c.replace(/;\s*Secure/gi,'').replace(/;\s*SameSite=[^;]*/gi,''));
    });
    res.json(odooRes.data);
  } catch(err) {
    const msg =
      err.code === 'ECONNREFUSED' ? `Cannot reach Odoo at ${url}` :
      err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED' ? 'Odoo request timed out' :
      err.message || 'Proxy error';
    console.error('[Odoo Proxy]', msg);
    res.status(502).json({ error: { message: msg } });
  }
});

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, app: 'CC→Odoo', port: PORT, uptime: process.uptime() })
);

// ── Serve HTML app at root ─────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  const html = path.join(__dirname, 'cc-odoo-app-v2.html');
  if (fs.existsSync(html)) res.sendFile(html);
  else res.status(404).send('cc-odoo-app-v2.html not found in server folder.');
});

// ── Static files — AFTER all API routes ───────────────────────────────────────
app.use(express.static(__dirname));

// ── Catch-all: unknown /api/ routes return JSON not HTML ──────────────────────
app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, error: `Unknown route: ${req.method} ${req.path}` });
});

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║     CC→Odoo Statement Importer Server    ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`\n✅  http://localhost:${PORT}/cc-odoo-app-v2.html\n`);
});
