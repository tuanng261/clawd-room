// Serves the web app and streams session state to it over Server-Sent Events.
// Binds to 127.0.0.1 by default: transcripts contain prompts, commands and paths.

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

export function createServer({ watcher, demo, port = 4747, host = '127.0.0.1' }) {
  const clients = new Set();

  const getModel = (id) => (id === 'demo' ? demo?.model : watcher.sessions.get(id));
  const list = (now) => {
    const l = watcher.list(now);
    if (demo?.model) l.push(demo.model.summary(now));
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
  demo?.on('change', markDirty);
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
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Content-Length': st.size,
        'Cache-Control': 'no-cache',
      });
      fs.createReadStream(file).pipe(res);
    });
  }

  const inside = (root, p) => {
    const full = path.resolve(root, '.' + path.sep + p);
    return full === root || full.startsWith(root + path.sep) ? full : null;
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(url.pathname);
    if (p === '/api/stream') return stream(req, res);
    if (p === '/api/sessions') {
      res.writeHead(200, { 'Content-Type': MIME['.json'] });
      return res.end(JSON.stringify(list(Date.now()), null, 2));
    }
    if (p.startsWith('/api/session/')) {
      const m = getModel(p.slice('/api/session/'.length));
      res.writeHead(m ? 200 : 404, { 'Content-Type': MIME['.json'] });
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
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}
