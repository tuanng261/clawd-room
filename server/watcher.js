// Finds Claude Code transcripts under ~/.claude/projects (and Codex sessions
// under ~/.codex/sessions, see codex.js) and tails them.
//
//   <projects>/<project-key>/<session-id>.jsonl                      main session
//   <projects>/<project-key>/<session-id>/subagents/agent-<id>.jsonl  helper (+ .meta.json)
//   <projects>/<project-key>/<session-id>/subagents/workflows/<run>/…  workflow helpers
//
// Read-only: nothing under ~/.claude is ever written.

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CodexThread, codexThreadKind, defaultCodexDir, readCodexMeta } from './codex.js';
import { SessionModel } from './session.js';

const MAX_INITIAL_BYTES = 16 * 1024 * 1024; // only the last 16 MB of a huge transcript is replayed
const SCAN_EVERY = 6000;
const POLL_EVERY = 1200;

export function defaultProjectsDir() {
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(base, 'projects');
}

/** Incrementally reads complete JSON lines appended to a file. */
class Tail {
  constructor(file, onRecord) {
    this.file = file;
    this.onRecord = onRecord;
    this.offset = 0;
    this.rest = Buffer.alloc(0);
    this.busy = false;
    this.again = false;
  }

  async poll() {
    if (this.busy) { this.again = true; return; }
    this.busy = true;
    try {
      do {
        this.again = false;
        await this.readNew();
      } while (this.again);
    } finally {
      this.busy = false;
    }
  }

  async readNew() {
    let st;
    try { st = await fsp.stat(this.file); } catch { return; }
    if (st.size < this.offset) { this.offset = 0; this.rest = Buffer.alloc(0); }
    if (st.size === this.offset) return;
    let start = this.offset;
    let dropFirst = false;
    if (start === 0 && st.size > MAX_INITIAL_BYTES) {
      start = st.size - MAX_INITIAL_BYTES;
      dropFirst = true;
    }
    const len = st.size - start;
    const buf = Buffer.allocUnsafe(len);
    const fh = await fsp.open(this.file, 'r');
    let got = 0;
    try {
      while (got < len) {
        const { bytesRead } = await fh.read(buf, got, len - got, start + got);
        if (!bytesRead) break;
        got += bytesRead;
      }
    } finally {
      await fh.close();
    }
    this.offset = start + got;
    let data = this.rest.length ? Buffer.concat([this.rest, buf.subarray(0, got)]) : buf.subarray(0, got);
    const lastNl = data.lastIndexOf(10);
    if (lastNl === -1) { this.rest = Buffer.from(data); return; }
    this.rest = Buffer.from(data.subarray(lastNl + 1));
    const lines = data.toString('utf8', 0, lastNl).split('\n');
    if (dropFirst) lines.shift();
    for (const line of lines) {
      if (!line || line.charCodeAt(0) !== 123 /* { */) continue;
      let rec;
      try { rec = JSON.parse(line); } catch { continue; }
      try { this.onRecord(rec); } catch (err) { console.error('[clawd-room] record error:', err.message); }
    }
  }
}

export class Watcher extends EventEmitter {
  constructor({ projectsDir = defaultProjectsDir(), codexDir = defaultCodexDir(), lookbackMs = 3 * 3600e3 } = {}) {
    super();
    this.dir = projectsDir;
    this.codexDir = codexDir; // null to leave Codex out
    this.codexRoots = new Map(); // Codex thread id → SessionModel of its main thread
    this.skipped = new Set(); // files that aren't sessions (Codex safety reviews…)
    this.lookbackMs = lookbackMs;
    this.sessions = new Map(); // sessionId → SessionModel
    this.tails = new Map(); // file → Tail
    this.metaCache = new Map(); // agent meta file → parsed json
    this.timers = [];
  }

  async start() {
    await this.scan(true);
    this.timers.push(setInterval(() => this.scan(false).catch(() => {}), SCAN_EVERY));
    this.timers.push(setInterval(() => this.pollAll(), POLL_EVERY));
    try {
      this.fsw = fs.watch(this.dir, { recursive: true }, (_ev, rel) => {
        if (rel && String(rel).endsWith('.jsonl')) this.onFileChanged(path.join(this.dir, String(rel)));
      });
      this.fsw.on('error', () => {});
    } catch {
      // Recursive watch unsupported here: polling alone still works.
    }
    if (this.codexDir && fs.existsSync(this.codexDir)) {
      try {
        this.cfw = fs.watch(this.codexDir, { recursive: true }, (_ev, rel) => {
          if (rel && String(rel).endsWith('.jsonl')) this.onCodexFile(path.join(this.codexDir, String(rel))).catch(() => {});
        });
        this.cfw.on('error', () => {});
      } catch { /* polling covers it */ }
    }
  }

  stop() {
    this.timers.forEach(clearInterval);
    this.fsw?.close();
    this.cfw?.close();
  }

  // ── Codex ──────────────────────────────────────────────────────────

  /** Codex rollout files changed in the last `lookback`: only the day folders that can hold them. */
  async codexFiles(cutoff) {
    if (!this.codexDir) return [];
    const out = [];
    for (let d = new Date(cutoff); d <= new Date(Date.now() + 864e5); d = new Date(d.getTime() + 864e5)) {
      const dir = path.join(this.codexDir, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
      let entries;
      try { entries = await fsp.readdir(dir); } catch { continue; }
      for (const name of entries) if (name.startsWith('rollout-') && name.endsWith('.jsonl')) out.push(path.join(dir, name));
    }
    return out;
  }

  /** A Codex thread: its own session (main), a helper of one (subagent), or nothing (safety review). */
  async onCodexFile(file) {
    if (this.skipped.has(file)) return;
    let tail = this.tails.get(file);
    if (!tail) {
      const meta = readCodexMeta(file);
      const kind = codexThreadKind(meta);
      if (!kind || kind === 'review') { if (kind) this.skipped.add(file); return; }
      if (kind === 'main') {
        const model = new SessionModel({ id: `codex-${meta.id}`, file, projectKey: 'codex' });
        model.agent = 'codex';
        this.sessions.set(model.id, model);
        this.codexRoots.set(meta.id, model);
        const thread = new CodexThread(model, { meta });
        tail = new Tail(file, (rec) => thread.feed(rec));
        tail.sessionId = model.id;
      } else {
        const model = this.codexRoots.get(meta.session_id) || this.codexRoots.get(meta.parent_thread_id);
        if (!model) return; // its main thread isn't tracked (yet): try again on the next scan
        const name = String(meta.agent_path || '').split('/').pop().replace(/_/g, ' ') || meta.agent_nickname || 'Helper';
        const thread = new CodexThread(model, {
          meta,
          agent: { id: `cx:${meta.id}`, meta: { description: name, agentType: 'codex', requestShape: 'background' } },
        });
        tail = new Tail(file, (rec) => thread.feed(rec));
        tail.sessionId = model.id;
      }
      this.tails.set(file, tail);
    }
    await this.pollTail(tail, tail.sessionId);
  }

  classify(file) {
    const rel = path.relative(this.dir, file).split(path.sep);
    if (rel.length === 2 && rel[1].endsWith('.jsonl')) {
      return { kind: 'main', projectKey: rel[0], sessionId: rel[1].slice(0, -6) };
    }
    if (rel.length >= 4 && rel[2] === 'subagents' && rel[rel.length - 1].endsWith('.jsonl')) {
      const name = rel[rel.length - 1].slice(0, -6);
      return {
        kind: 'agent', projectKey: rel[0], sessionId: rel[1],
        agentId: name.replace(/^agent-/, ''),
        workflowRunId: rel[3] === 'workflows' ? rel[4] || null : null,
      };
    }
    return null;
  }

  async onFileChanged(file) {
    const info = this.classify(file);
    if (!info) return;
    let tail = this.tails.get(file);
    if (!tail) {
      if (info.kind === 'agent' && !this.sessions.has(info.sessionId)) {
        await this.trackMain(path.join(this.dir, info.projectKey, info.sessionId + '.jsonl'), info);
      }
      tail = info.kind === 'main' ? await this.trackMain(file, info) : this.trackAgent(file, info);
    }
    if (tail) await this.pollTail(tail, info.sessionId);
  }

  async trackMain(file, info) {
    if (this.tails.has(file)) return this.tails.get(file);
    const model = new SessionModel({ id: info.sessionId, file, projectKey: info.projectKey });
    this.sessions.set(info.sessionId, model);
    const tail = new Tail(file, (rec) => model.ingest(rec));
    tail.sessionId = info.sessionId;
    this.tails.set(file, tail);
    return tail;
  }

  trackAgent(file, info) {
    if (this.tails.has(file)) return this.tails.get(file);
    const model = this.sessions.get(info.sessionId);
    if (!model) return null;
    const metaFile = file.replace(/\.jsonl$/, '.meta.json');
    const tail = new Tail(file, (rec) => {
      let meta = this.metaCache.get(metaFile);
      if (meta === undefined) {
        try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch { meta = null; }
        if (meta) this.metaCache.set(metaFile, meta);
      }
      model.ingestAgent(info.agentId, rec, meta, { workflowRunId: info.workflowRunId });
    });
    tail.sessionId = info.sessionId;
    this.tails.set(file, tail);
    return tail;
  }

  async pollTail(tail, sessionId) {
    const model = this.sessions.get(sessionId);
    const before = model?.rev;
    await tail.poll();
    if (model && model.rev !== before) this.emit('change', sessionId);
  }

  pollAll() {
    for (const tail of this.tails.values()) this.pollTail(tail, tail.sessionId).catch(() => {});
  }

  async scan(initial) {
    const cutoff = Date.now() - this.lookbackMs;
    let projects = [];
    try { projects = await fsp.readdir(this.dir, { withFileTypes: true }); } catch { /* no Claude Code transcripts here (Codex only?) */ }
    const mains = [];
    for (const p of projects) {
      if (!p.isDirectory()) continue;
      const pdir = path.join(this.dir, p.name);
      let entries;
      try { entries = await fsp.readdir(pdir, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        if (!e.isFile() || !e.name.endsWith('.jsonl')) continue;
        const file = path.join(pdir, e.name);
        if (this.tails.has(file)) continue;
        try {
          const st = await fsp.stat(file);
          if (st.mtimeMs >= cutoff) mains.push(file);
        } catch { /* vanished */ }
      }
    }
    for (const file of mains) {
      const info = this.classify(file);
      if (!info) continue;
      const tail = await this.trackMain(file, info);
      await this.pollTail(tail, info.sessionId);
    }
    // Helpers of tracked sessions.
    for (const model of this.sessions.values()) {
      const sdir = path.join(path.dirname(model.file), model.id, 'subagents');
      for (const file of await walkJsonl(sdir, 3)) {
        if (this.tails.has(file)) continue;
        try {
          const st = await fsp.stat(file);
          if (st.mtimeMs < cutoff) continue;
        } catch { continue; }
        const info = this.classify(file);
        const tail = info && this.trackAgent(file, info);
        if (tail) await this.pollTail(tail, info.sessionId);
      }
    }
    // Codex: main threads first, so their helpers have somewhere to go.
    const codex = [];
    for (const file of await this.codexFiles(cutoff)) {
      if (this.tails.has(file) || this.skipped.has(file)) continue;
      try {
        const st = await fsp.stat(file);
        if (st.mtimeMs >= cutoff) codex.push(file);
      } catch { /* vanished */ }
    }
    const isMain = (f) => codexThreadKind(readCodexMeta(f)) === 'main';
    codex.sort((a, b) => isMain(b) - isMain(a));
    for (const file of codex) await this.onCodexFile(file);
    if (initial) this.emit('ready');
  }

  list(now = Date.now()) {
    return [...this.sessions.values()]
      .filter((m) => m.demo || (m.lastAt && now - m.lastAt < this.lookbackMs))
      .map((m) => m.summary(now))
      .sort((a, b) => (b.live - a.live) || (b.lastAt || 0) - (a.lastAt || 0));
  }
}

async function walkJsonl(dir, depth) {
  const out = [];
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
    else if (e.isDirectory() && depth > 0) out.push(...(await walkJsonl(p, depth - 1)));
  }
  return out;
}
