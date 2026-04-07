/**
 * CC→Odoo Statement Importer — Web Server
 * Serves the app and proxies all Odoo API calls server-side (no CORS).
 * Compatible with the same /api/state/ API used by the TDS app.
 *
 * Usage:
 *   npm install
 *   node server.js
 *   Open http://localhost:3004
 */

const express  = require('express');
const axios    = require('axios');
const fs       = require('fs');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 3004;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));           // serve HTML, assets from same folder

// ── State Storage (JSON file — same API as TDS app's Firebase endpoints) ──────
const STATE_FILE = path.join(__dirname, 'cc-state.json');

function readState() {
  try   { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return {}; }
}
function writeState(data) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// GET /api/state/:key
app.get('/api/state/:key', (req, res) => {
  const state = readState();
  const key   = decodeURIComponent(req.params.key);
  if (key in state) res.json({ ok: true,  value: state[key] });
  else              res.json({ ok: false });
});

// POST /api/state/:key  { value: ... }
app.post('/api/state/:key', (req, res) => {
  const state = readState();
  const key   = decodeURIComponent(req.params.key);
  state[key]  = req.body.value;
  writeState(state);
  res.json({ ok: true });
});

// DELETE /api/state  (clear all)
app.delete('/api/state', (_req, res) => {
  writeState({});
  res.json({ ok: true });
});

// ── Odoo JSON-RPC Proxy ───────────────────────────────────────────────────────
// POST /api/odoo/rpc  { url, endpoint, params, cookie? }
// Forwards the call to Odoo server-side so the browser never hits Odoo directly.
// Session cookies are forwarded transparently — the first authenticate call
// sets a session cookie that subsequent calls reuse.

app.post('/api/odoo/rpc', async (req, res) => {
  const { url, endpoint, params } = req.body;

  if (!url || !endpoint) {
    return res.status(400).json({
      error: { message: 'Request body must include: url, endpoint, params' }
    });
  }

  // Forward the browser's session cookie to Odoo so the session persists
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
        validateStatus: () => true  // don't throw on non-2xx
      }
    );

    // Forward Odoo's Set-Cookie back to the browser
    // Strip Secure + SameSite flags so cookies work on localhost/non-HTTPS
    const setCookies = odooRes.headers['set-cookie'] || [];
    setCookies.forEach(cookie => {
      const cleaned = cookie
        .replace(/;\s*Secure/gi, '')
        .replace(/;\s*SameSite=[^;]*/gi, '');
      res.append('Set-Cookie', cleaned);
    });

    res.json(odooRes.data);

  } catch (err) {
    const msg = err.code === 'ECONNREFUSED'
      ? `Cannot connect to Odoo at ${url} — check the URL in Settings`
      : err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED'
      ? `Odoo request timed out — server may be slow or URL is wrong`
      : err.message || 'Proxy error';

    console.error('[Odoo Proxy Error]', msg);
    res.status(502).json({ error: { message: msg } });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'CC→Odoo', port: PORT }));

// ── Serve index ───────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  const html = path.join(__dirname, 'cc-odoo-app-v2.html');
  if (fs.existsSync(html)) res.sendFile(html);
  else res.status(404).send('cc-odoo-app-v2.html not found in server folder');
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║       CC→Odoo Statement Importer Server      ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`\n✅  Running at → http://localhost:${PORT}`);
  console.log(`📄  Open       → http://localhost:${PORT}/cc-odoo-app-v2.html\n`);
});
