// Serves the web app and streams session state to it over Server-Sent Events.
// Binds to 127.0.0.1 by default: transcripts contain prompts, commands and paths.

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'web');
const THREE = path.join(ROOT, 'node_modules', 'three');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/** `demos`: pretend sessions to show alongside (or, with `demoOnly`, instead of) the real ones. */
export function createServer({ watcher, demo, demos = demo ? [demo] : [], demoOnly = false, port = 4747, host = '127.0.0.1' }) {
  const clients = new Set();

  const getModel = (id) => demos.find((d) => d.id === id)?.model || (demoOnly ? null : watcher.sessions.get(id));
  const list = (now) => {
    const l = demoOnly ? [] : watcher.list(now);
    for (const d of demos) if (d.model) l.push(d.model.summary(now));
    return l;
  };

  const send = (res, event, data) => {
    res.write(`event: ${event}\ndata: ${data}\n\n`);
  };

  // Coalesce bursts of changes: at most one snapshot per session every 120 ms.
  const dirty = new Set();
  let timer = null;
  const markDirty = (id) => {
    dirty.add(id);
    if (!timer) timer = setTimeout(flush, 120);
  };
  let lastList = '';
  function flush() {
    timer = null;
    if (!clients.size) { dirty.clear(); return; }
    const now = Date.now();
    for (const id of dirty) {
      const m = getModel(id);
      if (!m) continue;
      const payload = JSON.stringify({ now, session: m.snapshot(now) });
      for (const c of clients) send(c, 'session', payload);
    }
    dirty.clear();
    broadcastList(now);
  }
  function broadcastList(now = Date.now(), force = false) {
    const payload = JSON.stringify({ now, sessions: list(now) });
    const key = payload.replace(/"now":\d+,/, '');
    if (!force && key === lastList) return;
    lastList = key;
    for (const c of clients) send(c, 'sessions', payload);
  }

  watcher.on('change', markDirty);
  for (const d of demos) d.on('change', markDirty);
  setInterval(() => broadcastList(), 4000).unref();
  setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 15000).unref();

  function stream(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    const now = Date.now();
    const sessions = list(now);
    send(res, 'sessions', JSON.stringify({ now, sessions }));
    // Full state for anything worth showing right away.
    for (const s of sessions.filter((x) => x.live || x.demo).concat(sessions.slice(0, 1))) {
      const m = getModel(s.id);
      if (m) send(res, 'session', JSON.stringify({ now, session: m.snapshot(now) }));
    }
    clients.add(res);
    req.on('close', () => clients.delete(res));
  }

  function serveFile(res, file) {
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
      let policy = null;
      try { if (file.endsWith('.html')) policy = pagePolicy(file); } catch { res.writeHead(500); return res.end(); }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Content-Length': st.size,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        ...(policy ? { 'Content-Security-Policy': policy } : {}),
      });
      fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
    });
  }

  // The page may only run its own scripts (plus its inline import map, by hash) and talk to this server,
  // so text from a transcript can never run as code even if it slipped through unescaped.
  function pagePolicy(file) {
    const html = fs.readFileSync(file, 'utf8');
    const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
      .map((m) => `'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`);
    return [`default-src 'self'`, `script-src 'self' ${hashes.join(' ')}`, `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`, `font-src 'self' https://fonts.gstatic.com`,
      `img-src 'self' data:`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, `form-action 'none'`].join('; ');
  }

  const inside = (root, p) => {
    const full = path.resolve(root, '.' + path.sep + p);
    return full === root || full.startsWith(root + path.sep) ? full : null;
  };

  // Only answer pages that are really on this machine. A web page can point its own domain
  // at 127.0.0.1 ("DNS rebinding") and then read transcripts; its Host header gives it away.
  const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

  const JSON_HEAD = { 'Content-Type': MIME['.json'], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' };

  function handle(req, res) {
    if (!LOCAL_HOST.test(req.headers.host || '')) { res.writeHead(403); return res.end(); }
    // Read-only: nothing here changes anything, so only reading is allowed.
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    let url, p;
    try {
      url = new URL(req.url, 'http://localhost');
      p = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400);
      return res.end();
    }
    if (p.includes('\0')) { res.writeHead(400); return res.end(); } // file APIs throw on these
    if (p === '/api/stream') return stream(req, res);
    if (p === '/api/sessions') {
      res.writeHead(200, JSON_HEAD);
      return res.end(JSON.stringify(list(Date.now()), null, 2));
    }
    if (p.startsWith('/api/session/')) {
      const m = getModel(p.slice('/api/session/'.length));
      res.writeHead(m ? 200 : 404, JSON_HEAD);
      return res.end(m ? JSON.stringify(m.snapshot(Date.now()), null, 2) : '{}');
    }
    if (p.startsWith('/vendor/three/')) {
      const rel = p.slice('/vendor/three/'.length);
      if (!/^(build|examples\/jsm)\//.test(rel)) { res.writeHead(404); return res.end(); }
      const file = inside(THREE, rel);
      return file ? serveFile(res, file) : (res.writeHead(404), res.end());
    }
    const file = inside(WEB, p === '/' ? 'index.html' : p.slice(1));
    return file ? serveFile(res, file) : (res.writeHead(404), res.end());
  }

  // One odd request must never take the room down.
  const server = http.createServer((req, res) => {
    try {
      handle(req, res);
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}
