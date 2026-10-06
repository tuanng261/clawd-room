// SessionModel replays one Claude Code transcript (plus its subagent transcripts)
// into a small live state: what Clawd is doing now, the task list, helpers,
// background jobs, files touched and a short activity log.

import path from 'node:path';
import { brandOf, describeTool, learnServer, learnTool, serverLabel } from './describe.js';
import { ThemeDetector } from './theme.js';

const LOG_MAX = 120;
const LIVE_WINDOW = 3 * 60e3;        // any record in the last 3 min → live
const BUSY_WINDOW = 20 * 60e3;       // mid-turn sessions stay live this long without records
const AGENT_STALE = 15 * 60e3;       // a helper silent this long is presumed gone
const RECENT_AGENT = 30 * 60e3;      // finished helpers stay listed this long

const ts = (rec) => {
  const t = Date.parse(rec?.timestamp);
  return Number.isFinite(t) ? t : null;
};

export function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (b?.type === 'text' ? b.text || '' : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

export function firstLine(s, n = 140) {
  const line = String(s ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('<')) || String(s ?? '').trim();
  const flat = line.replace(/\s+/g, ' ');
  return flat.length > n ? flat.slice(0, n - 1) + '…' : flat;
}

function tag(text, name) {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(text);
  return m ? m[1].trim() : null;
}

function finalStatus(s) {
  s = String(s || 'completed').toLowerCase();
  if (/fail|error/.test(s)) return 'failed';
  if (/kill|stop|cancel|abort/.test(s)) return 'stopped';
  return 'done';
}

const newWorker = () => ({
  state: 'idle', // 'thinking' | 'working' | 'idle'
  since: null,
  pending: new Map(), // toolUseId → activity
  current: null, // latest activity, possibly finished
  narration: null, // { text, at }
  thought: null, // { text, at } — Claude Code's summary of a thinking block, when it saved one
  toolCalls: 0,
  lastAt: null,
});

function setState(worker, state, t) {
  if (worker.state !== state) {
    worker.state = state;
    worker.since = t;
  } else if (worker.since == null) {
    worker.since = t;
  }
}

const serializeAct = (a) =>
  a && {
    id: a.id, tool: a.tool, toolName: a.toolName || a.tool, station: a.station, icon: a.icon, verb: a.verb, label: a.label,
    server: a.server ? serverLabel(a.server) : null, brand: a.server ? brandOf(a.server) : null, delta: a.delta || null,
    activity: a.activity || null,
    text: a.text || `${a.verb} ${a.label}`.trim(),
    detail: a.detail || null, status: a.status, startedAt: a.startedAt, endedAt: a.endedAt,
    background: !!a.background, asksUser: !!a.asksUser, error: a.error || null,
    timeoutMs: a.timeoutMs || null, file: a.file || null, fileOp: a.fileOp || null,
  };

export class SessionModel {
  constructor({ id, file, projectKey }) {
    this.id = id;
    this.file = file;
    this.projectKey = projectKey;
    this.cwd = null;
    this.title = null;
    this.aiTitle = null;
    this.gitBranch = null;
    this.model = null;
    this.version = null;
    this.entrypoint = null;
    this.firstAt = null;
    this.lastAt = null;
    this.lastPrompt = null;
    this.turn = null;
    this.main = newWorker();
    this.tasks = new Map();
    this.pendingTaskCreates = new Map();
    this.agents = new Map();
    this.agentByToolUse = new Map();
    this.jobs = new Map();
    this.files = new Map();
    this.stats = { toolCalls: 0, errors: 0, reads: 0, edits: 0, commands: 0, searches: 0, web: 0, helpers: 0 };
    this.context = null;
    this.log = [];
    this.logSeq = 0;
    this.rev = 0;
    this.demo = false;
    this.seenNotes = new Set();
    this.permissionMode = null;
    this.kind = new ThemeDetector(); // what sort of work this is → which room to show
    this.agent = null; // 'codex' for Codex sessions (see codex.js); Claude Code otherwise
  }

  touch(t) {
    if (t == null) return this.lastAt;
    if (!this.firstAt || t < this.firstAt) this.firstAt = t;
    if (!this.lastAt || t > this.lastAt) this.lastAt = t;
    return t;
  }

  pushLog(entry) {
    const e = { id: ++this.logSeq, ...entry };
    this.log.push(e);
    if (this.log.length > LOG_MAX) this.log.splice(0, this.log.length - LOG_MAX);
    return e;
  }

  // ── main transcript ────────────────────────────────────────────────

  ingest(rec) {
    if (!rec || typeof rec !== 'object' || rec.isSidechain) return;
    const t = this.touch(ts(rec)) ?? this.lastAt ?? Date.now();
    if (rec.cwd) this.cwd = rec.cwd;
    if (rec.gitBranch) this.gitBranch = rec.gitBranch;
    if (rec.version) this.version = rec.version;
    if (rec.entrypoint) this.entrypoint = rec.entrypoint;
    switch (rec.type) {
      case 'custom-title': if (rec.customTitle) this.title = rec.customTitle; break;
      case 'ai-title': if (rec.aiTitle) this.aiTitle = rec.aiTitle; break;
      case 'summary': if (rec.summary && !this.aiTitle) this.aiTitle = rec.summary; break;
      case 'last-prompt': if (rec.lastPrompt) this.lastPrompt = rec.lastPrompt; break;
      case 'permission-mode': if (rec.permissionMode) this.permissionMode = rec.permissionMode; break;
      // Notifications that arrive while Claude is busy are queued, not sent as user messages.
      case 'queue-operation':
        if (rec.operation === 'enqueue' && typeof rec.content === 'string') this.onQueued(rec.content, t);
        break;
      case 'attachment':
        if (rec.attachment?.type === 'queued_command' && typeof rec.attachment.prompt === 'string') this.onQueued(rec.attachment.prompt, t);
        else this.learnTools(rec.attachment);
        break;
      case 'user': this.onUser(rec, t, this.main, null); break;
      case 'assistant': this.onAssistant(rec, t, this.main, null); break;
      case 'system': this.onSystem(rec, t); break;
      default: break;
    }
    this.rev++;
  }

  /** Tool lists and MCP instructions tell us which app each connector is. */
  learnTools(a) {
    if (!a) return;
    if (a.type === 'deferred_tools_delta' && Array.isArray(a.addedNames)) {
      for (const n of a.addedNames) learnTool(n);
    } else if (a.type === 'deferred_tools_record' && Array.isArray(a.entries)) {
      for (const e of a.entries) learnTool(e?.name, typeof e?.description === 'string' ? e.description.slice(0, 300) : '');
    } else if (a.type === 'mcp_instructions_delta' && Array.isArray(a.addedBlocks)) {
      for (const b of a.addedBlocks) {
        if (typeof b !== 'string') continue;
        const nl = b.indexOf('\n');
        const head = (nl > 0 ? b.slice(0, nl) : b).replace(/^#+\s*/, '');
        learnServer(head, { text: b.slice(nl + 1, nl + 1200) });
      }
    }
  }

  // ── subagent transcripts ───────────────────────────────────────────

  ingestAgent(agentId, rec, meta, extra = {}) {
    if (!rec || typeof rec !== 'object') return;
    let ag = this.agents.get(agentId);
    if (!ag && meta?.toolUseId) ag = this.linkAgent(meta.toolUseId, agentId);
    if (!ag) ag = this.newAgent(agentId);
    if (meta) {
      if (meta.description && !ag.description) ag.description = meta.description;
      if (meta.agentType) ag.type = meta.agentType;
      if (meta.requestShape === 'background') ag.background = true;
    }
    if (extra.workflowRunId) ag.workflowRunId = extra.workflowRunId;
    const t = ts(rec) ?? ag.worker.lastAt ?? Date.now();
    this.touch(t);
    ag.worker.lastAt = Math.max(ag.worker.lastAt || 0, t);
    if (!ag.startedAt || t < ag.startedAt) ag.startedAt = t;
    // A finished helper that gets new records was resumed.
    if ((ag.status === 'starting') || (ag.endedAt && t > ag.endedAt + 1000 && rec.type === 'assistant')) {
      if (ag.endedAt) for (const k of [...this.seenNotes]) if (k.startsWith(agentId + '|')) this.seenNotes.delete(k);
      ag.status = 'running';
      ag.endedAt = null;
    }
    if (rec.type === 'user') this.onUser(rec, t, ag.worker, ag);
    else if (rec.type === 'assistant') this.onAssistant(rec, t, ag.worker, ag);
    this.rev++;
  }

  newAgent(id, init = {}) {
    const ag = {
      id, toolUseId: null, description: null, type: 'general-purpose', status: 'running',
      startedAt: null, endedAt: null, background: false, prompt: null, summary: null,
      workflowRunId: null, worker: newWorker(), ...init,
    };
    this.agents.set(id, ag);
    return ag;
  }

  /** Attach a real agentId to the placeholder created when the Agent tool was called. */
  linkAgent(toolUseId, agentId, extra = {}) {
    const phId = this.agentByToolUse.get(toolUseId);
    const ph = phId ? this.agents.get(phId) : null;
    let real = this.agents.get(agentId);
    if (ph && ph !== real) {
      if (real) {
        real.description = real.description || ph.description;
        real.type = ph.type || real.type;
        real.prompt = real.prompt || ph.prompt;
        real.startedAt = Math.min(real.startedAt || Infinity, ph.startedAt || Infinity);
        real.background = real.background || ph.background;
      } else {
        real = ph;
        real.id = agentId;
      }
      this.agents.delete(phId);
      this.agents.set(agentId, real);
    }
    if (!real) real = this.newAgent(agentId);
    real.toolUseId = toolUseId;
    for (const [k, v] of Object.entries(extra)) if (v != null) real[k] = v;
    this.agentByToolUse.set(toolUseId, agentId);
    return real;
  }

  // ── record handlers ────────────────────────────────────────────────

  onUser(rec, t, worker, agent) {
    if (rec.isMeta) return;
    if (rec.isSidechain && !agent) return; // legacy inline subagent records
    const content = rec.message?.content;
    const results = Array.isArray(content) ? content.filter((b) => b?.type === 'tool_result') : [];
    if (results.length) {
      for (const r of results) this.onToolResult(r, rec, t, worker, agent);
      return;
    }
    const text = textOf(content).trim();
    if (!text) return;
    if (agent) {
      if (!agent.prompt) agent.prompt = firstLine(text, 300);
      return;
    }
    if (text.includes('<task-notification>')) return this.onTaskNotification(text, t);
    if (text.startsWith('<agent-message')) return this.onAgentMessage(text, t);
    if (text.startsWith('[Request interrupted')) return this.endTurn(t, true);
    if (text.startsWith('<command-name>') || text.includes('<command-name>')) {
      const cmd = tag(text, 'command-name');
      if (cmd) this.startTurn(t, cmd);
      return;
    }
    if (/^<(local-command|bash-|system-reminder)/.test(text)) return;
    this.startTurn(t, text);
  }

  onAssistant(rec, t, worker, agent) {
    const m = rec.message || {};
    if (!agent && m.model && m.model !== '<synthetic>') this.model = m.model;
    if (!agent && m.usage) {
      const u = m.usage;
      const tokens = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.output_tokens || 0);
      if (tokens > 0) this.context = { tokens, at: t };
    }
    const blocks = Array.isArray(m.content) ? m.content : [];
    let hasText = false;
    let hasTool = false;
    for (const b of blocks) {
      if (!b) continue;
      if (b.type === 'thinking' || b.type === 'redacted_thinking') {
        if (!worker.pending.size) setState(worker, 'thinking', t);
        const thought = typeof b.thinking === 'string' ? b.thinking.trim() : '';
        if (thought) {
          worker.thought = { text: thought.slice(0, 1600), at: t };
          if (!agent) this.pushLog({ at: t, kind: 'think', icon: 'thought', text: firstLine(thought, 180), detail: thought.slice(0, 600) });
        }
      } else if (b.type === 'text' && b.text && b.text.trim()) {
        hasText = true;
        worker.narration = { text: b.text.trim().slice(0, 1200), at: t };
        if (!agent) this.pushLog({ at: t, kind: 'say', icon: 'chat', text: firstLine(b.text, 180) });
      } else if (b.type === 'tool_use') {
        hasTool = true;
        this.onToolUse(b, t, worker, agent);
      }
    }
    if (m.stop_reason === 'end_turn' && hasText && !hasTool) {
      if (agent) {
        setState(worker, 'idle', t);
        for (const a of worker.pending.values()) { a.status = 'done'; a.endedAt = t; }
        worker.pending.clear();
        if (agent.status === 'running' || agent.status === 'starting') {
          agent.status = 'done';
          agent.endedAt = t;
        }
      } else {
        this.endTurn(t, false);
      }
    }
  }

  onSystem(rec, t) {
    if (rec.subtype === 'stop_hook_summary' || rec.subtype === 'turn_duration') {
      if (this.main.state !== 'idle' && !this.main.pending.size) this.endTurn(t, false);
    } else if (rec.subtype === 'compact_boundary') {
      for (const n of rec.compactMetadata?.preCompactDiscoveredTools || []) learnTool(n);
      this.pushLog({ at: t, kind: 'note', icon: 'compress', text: 'Tidied up memory (context compacted)' });
    }
  }

  startTurn(t, prompt, auto = false) {
    for (const a of this.main.pending.values()) { a.status = 'abandoned'; a.endedAt = t; }
    this.main.pending.clear();
    this.turn = { startedAt: t, prompt: firstLine(prompt, 300), endedAt: null, toolCalls: 0, done: 0, failed: 0, tools: {}, interrupted: false, auto };
    if (!auto) {
      this.lastPrompt = prompt;
      this.kind.prompt(prompt);
    }
    setState(this.main, 'thinking', t);
    this.pushLog({ at: t, kind: 'prompt', icon: auto ? 'bell' : 'user', text: firstLine(prompt, 160) });
  }

  endTurn(t, interrupted) {
    for (const a of this.main.pending.values()) { a.status = interrupted ? 'stopped' : 'done'; a.endedAt = t; }
    this.main.pending.clear();
    if (this.turn && !this.turn.endedAt) {
      this.turn.endedAt = t;
      this.turn.interrupted = interrupted;
    }
    if (this.main.state !== 'idle') {
      this.pushLog({ at: t, kind: 'end', icon: interrupted ? 'stop' : 'flag', text: interrupted ? 'Stopped by you' : 'Done — your turn' });
    }
    setState(this.main, 'idle', t);
  }

  onToolUse(b, t, worker, agent) {
    const d = describeTool(b.name, b.input);
    this.kind.tool(b.name, b.input);
    const act = { id: b.id, tool: b.name, ...d, startedAt: t, endedAt: null, status: 'running', agentId: agent?.id || null };
    worker.pending.set(b.id, act);
    worker.current = act;
    worker.toolCalls++;
    setState(worker, 'working', t);
    this.stats.toolCalls++;
    if (!agent && this.turn) {
      this.turn.toolCalls++;
      // Tally which tools this request used (connectors count per app).
      const key = d.server ? `mcp:${d.server}` : d.toolName;
      const tally = this.turn.tools[key] || (this.turn.tools[key] = { key, n: 0, tool: d.toolName, server: d.server || null, icon: d.icon, station: d.station });
      tally.n++;
    }

    if (d.file) {
      const f = this.files.get(d.file) || { path: d.file, name: path.basename(d.file), reads: 0, edits: 0, lastAt: t };
      if (d.fileOp === 'read') f.reads++; else f.edits++;
      f.lastAt = t;
      this.files.set(d.file, f);
    }
    if (d.station === 'bookshelf') this.stats.reads++;
    else if (d.station === 'desk') this.stats.edits++;
    else if (d.station === 'terminal') this.stats.commands++;
    else if (d.station === 'cabinet') this.stats.searches++;
    else if (d.station === 'globe') this.stats.web++;

    this.onPlanTool(b, t);

    if (b.name === 'Agent' || b.name === 'Task') {
      const i = b.input || {};
      const id = 'tu:' + b.id;
      this.newAgent(id, {
        toolUseId: b.id, description: i.description || null, type: i.subagent_type || 'general-purpose',
        status: 'starting', startedAt: t, background: i.run_in_background === true, prompt: firstLine(i.prompt, 300),
        parentId: agent?.id || null,
      });
      this.agentByToolUse.set(b.id, id);
      this.stats.helpers++;
    }

    if (!agent) {
      act.logId = this.pushLog({
        at: t, kind: 'tool', icon: d.icon, station: d.station, text: d.text || `${d.verb} ${d.label}`.trim(), detail: d.detail || null,
        status: 'running', toolUseId: b.id, tool: d.toolName, server: d.server || null, delta: d.delta || null, bg: !!d.background,
        activity: d.activity,
      }).id;
    }
  }

  onToolResult(r, rec, t, worker, agent) {
    const id = r.tool_use_id;
    const act = worker.pending.get(id);
    const tur = rec.toolUseResult && typeof rec.toolUseResult === 'object' ? rec.toolUseResult : null;
    const text = textOf(r.content) || (typeof r.content === 'string' ? r.content : '');
    if (act) {
      worker.pending.delete(id);
      act.endedAt = t;
      act.status = r.is_error ? 'error' : 'done';
      if (r.is_error) {
        this.stats.errors++;
        act.error = firstLine(text.replace(/<\/?tool_use_error>/g, ''), 200);
      }
      if (act.logId) {
        const e = this.log.find((x) => x.id === act.logId);
        if (e) { e.status = act.status; e.duration = t - act.startedAt; if (act.error) e.error = act.error; }
      }
      if (!worker.pending.size) setState(worker, 'thinking', t);
      if (!agent && this.turn && act.startedAt >= this.turn.startedAt) {
        if (r.is_error) this.turn.failed++; else this.turn.done++;
      }
    }

    if (tur?.backgroundTaskId) {
      this.jobs.set(tur.backgroundTaskId, {
        id: tur.backgroundTaskId, kind: 'shell', label: act?.label || 'Background command', detail: act?.detail || null,
        startedAt: t, endedAt: null, status: 'running', toolUseId: id, agentId: agent?.id || null,
      });
      if (!agent) this.pushLog({ at: t, kind: 'job', icon: 'terminal', text: `In the background: ${act?.label || 'a command'}` });
    }
    if (tur?.status === 'async_launched' && tur.taskType === 'local_workflow') {
      this.jobs.set(tur.taskId, {
        id: tur.taskId, kind: 'workflow', label: tur.workflowName || 'Workflow', detail: tur.summary || null,
        startedAt: t, endedAt: null, status: 'running', toolUseId: id, runId: tur.runId || null,
      });
    }
    if (tur?.isAsync && tur.agentId) {
      const ag = this.linkAgent(id, tur.agentId, { background: true, description: tur.description || null });
      if (ag.status === 'starting') ag.status = 'running';
      if (!agent) this.pushLog({ at: t, kind: 'agent', icon: 'agent', text: `Helper started: ${ag.description || 'subagent'}` });
    }
    // Foreground helper finished (the Agent tool returned its report).
    if (act && (act.tool === 'Agent' || act.tool === 'Task') && !tur?.isAsync) {
      const agId = (tur?.agentId && this.agents.has(tur.agentId)) ? tur.agentId : this.agentByToolUse.get(id);
      const ag = agId && this.agents.get(agId);
      if (ag) { ag.status = r.is_error ? 'failed' : 'done'; ag.endedAt = t; }
    }
    // Task list bookkeeping.
    const create = this.pendingTaskCreates.get(id);
    if (create) {
      this.pendingTaskCreates.delete(id);
      const taskId = String(tur?.task?.id ?? (/#(\w+)/.exec(text) || [])[1] ?? '');
      if (taskId && !r.is_error) {
        this.tasks.set(taskId, {
          id: taskId, subject: create.subject || `Task ${taskId}`, activeForm: create.activeForm || null,
          status: 'pending', createdAt: create.at, startedAt: null, completedAt: null,
        });
      }
    }
  }

  onPlanTool(b, t) {
    const i = b.input || {};
    if (b.name === 'TaskCreate') {
      this.pendingTaskCreates.set(b.id, { subject: i.subject, activeForm: i.activeForm, at: t });
    } else if (b.name === 'TaskUpdate') {
      const task = this.tasks.get(String(i.taskId));
      if (task) {
        if (i.subject) task.subject = i.subject;
        if (i.activeForm) task.activeForm = i.activeForm;
        if (i.status) this.applyTaskStatus(task, i.status, t);
      }
    } else if (b.name === 'TodoWrite' && Array.isArray(i.todos)) {
      const prev = new Map([...this.tasks.values()].map((x) => [x.subject, x]));
      this.tasks.clear();
      i.todos.forEach((td, k) => {
        const old = prev.get(td.content);
        const task = {
          id: String(k + 1), subject: td.content, activeForm: td.activeForm || null,
          status: old?.status || 'pending', createdAt: old?.createdAt ?? t,
          startedAt: old?.startedAt ?? null, completedAt: old?.completedAt ?? null,
        };
        this.tasks.set(task.id, task);
        this.applyTaskStatus(task, td.status || 'pending', t);
      });
    }
  }

  applyTaskStatus(task, status, t) {
    if (status === 'deleted') { this.tasks.delete(task.id); return; }
    if (status === 'in_progress' && task.status !== 'in_progress') task.startedAt = task.startedAt ?? t;
    if (status === 'completed' && task.status !== 'completed') {
      task.completedAt = t;
      task.startedAt = task.startedAt ?? t;
      this.pushLog({ at: t, kind: 'task', icon: 'check', text: `Checked off: ${firstLine(task.subject, 120)}` });
    }
    if (status === 'pending') task.completedAt = null;
    task.status = status;
  }

  onQueued(text, t) {
    if (text.includes('<task-notification>')) this.onTaskNotification(text, t);
    else if (text.startsWith('<agent-message')) this.onAgentMessage(text, t);
  }

  /** A helper handed its report back to the main session. */
  onAgentMessage(text, t) {
    const from = (/<agent-message from="([^"]+)"/.exec(text) || [])[1];
    const ag = from && this.agents.get(from);
    if (!ag || this.seenNotes.has('msg|' + from + '|' + (ag.worker.lastAt || 0))) return;
    this.seenNotes.add('msg|' + from + '|' + (ag.worker.lastAt || 0));
    this.pushLog({ at: t, kind: 'agent', icon: 'agent', text: `Helper reported back: ${ag.description || 'subagent'}` });
  }

  onTaskNotification(text, t) {
    const taskId = tag(text, 'task-id');
    const toolUseId = tag(text, 'tool-use-id');
    const status = finalStatus(tag(text, 'status'));
    const summary = tag(text, 'summary');
    // The same notification shows up as a queue entry, an attachment and sometimes a user message.
    const key = `${taskId}|${status}`;
    if (this.seenNotes.has(key)) return;
    this.seenNotes.add(key);
    let known = false;
    const job = taskId && this.jobs.get(taskId);
    if (job) {
      known = true;
      job.status = status;
      job.endedAt = t;
      job.summary = summary;
      if (job.kind === 'workflow' && job.runId) {
        for (const ag of this.agents.values()) {
          if (ag.workflowRunId === job.runId && !ag.endedAt) { ag.status = status; ag.endedAt = t; }
        }
      }
    }
    const agId = (taskId && this.agents.has(taskId) && taskId) || (toolUseId && this.agentByToolUse.get(toolUseId));
    const ag = agId && this.agents.get(agId);
    if (ag) {
      known = true;
      ag.status = status;
      ag.endedAt = t;
      ag.summary = summary;
    }
    if (!known && taskId) {
      this.jobs.set(taskId, { id: taskId, kind: 'task', label: summary || 'Background task', startedAt: null, endedAt: t, status, summary });
    }
    this.pushLog({ at: t, kind: 'notify', icon: status === 'done' ? 'check' : 'alert', text: summary || 'A background task finished' });
    if (this.main.state === 'idle') this.startTurn(t, summary || 'A background task finished', true);
  }

  // ── output ─────────────────────────────────────────────────────────

  projectName() {
    if (this.cwd) return path.basename(this.cwd);
    // "-Users-me-Desktop-cool-project" → "cool-project" (lossy, only a fallback)
    const parts = String(this.projectKey || '').split('-').filter(Boolean);
    return parts.slice(-2).join('-') || 'project';
  }

  displayTitle() {
    return this.title || this.aiTitle || firstLine(this.lastPrompt || this.turn?.prompt || '', 64) || 'Untitled session';
  }

  isLive(now) {
    if (this.demo) return true;
    const idle = now - (this.lastAt || 0);
    if (idle < LIVE_WINDOW) return true;
    if (this.main.state !== 'idle' && idle < BUSY_WINDOW) return true;
    for (const ag of this.agents.values()) {
      if ((ag.status === 'running' || ag.status === 'starting') && now - (ag.worker.lastAt || ag.startedAt || 0) < AGENT_STALE) return true;
    }
    return false;
  }

  summary(now = Date.now()) {
    const live = this.isLive(now);
    return {
      id: this.id,
      agent: this.agent || 'claude',
      title: this.displayTitle(),
      project: this.projectName(),
      live,
      demo: this.demo,
      status: !live && this.main.state !== 'idle' ? 'stale' : this.main.state,
      lastAt: this.lastAt,
      current: this.main.state === 'working' ? serializeAct(this.main.current) : null,
      helpers: [...this.agents.values()].filter((a) => (a.status === 'running' || a.status === 'starting') && now - (a.worker.lastAt || a.startedAt || 0) < AGENT_STALE).length,
      theme: this.kind.decide(this.cwd || this.projectName(), this.displayTitle()),
    };
  }

  snapshot(now = Date.now()) {
    const s = this.summary(now);
    const agents = [...this.agents.values()]
      .map((ag) => {
        let status = ag.status;
        const last = ag.worker.lastAt || ag.startedAt || 0;
        if ((status === 'running' || status === 'starting') && now - last > AGENT_STALE) status = 'stale';
        return {
          id: ag.id, toolUseId: ag.toolUseId || null, description: ag.description || ag.prompt || 'Helper', type: ag.type, status,
          startedAt: ag.startedAt, endedAt: ag.endedAt, background: ag.background, summary: ag.summary,
          workflowRunId: ag.workflowRunId, toolCalls: ag.worker.toolCalls, state: ag.worker.state,
          since: ag.worker.since, lastAt: ag.worker.lastAt,
          current: serializeAct(ag.worker.current),
          pending: [...ag.worker.pending.values()].map(serializeAct),
          narration: ag.worker.narration ? firstLine(ag.worker.narration.text, 200) : null,
          thought: ag.worker.thought ? { text: ag.worker.thought.text.slice(0, 400), at: ag.worker.thought.at } : null,
        };
      })
      .filter((a) => a.status === 'running' || a.status === 'starting' || now - (a.endedAt || a.lastAt || a.startedAt || 0) < RECENT_AGENT)
      .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0))
      .slice(-16);
    const jobs = [...this.jobs.values()]
      .map((j) => ({ ...j, status: j.status === 'running' && !s.live ? 'unknown' : j.status }))
      .filter((j) => j.status === 'running' || now - (j.endedAt || j.startedAt || 0) < RECENT_AGENT * 4)
      .slice(-16);
    return {
      ...s,
      cwd: this.cwd,
      gitBranch: this.gitBranch,
      model: this.model,
      version: this.version,
      entrypoint: this.entrypoint,
      permissionMode: this.permissionMode,
      firstAt: this.firstAt,
      statusSince: this.main.since,
      turn: this.turn && {
        ...this.turn,
        tools: Object.values(this.turn.tools || {})
          .map((x) => ({ ...x, name: x.server ? serverLabel(x.server) : x.tool, brand: x.server ? brandOf(x.server) : null }))
          .sort((a, b) => b.n - a.n),
      },
      current: serializeAct(this.main.current),
      pending: [...this.main.pending.values()].map(serializeAct),
      narration: this.main.narration,
      thought: this.main.thought,
      context: this.context,
      tasks: [...this.tasks.values()],
      agents,
      jobs,
      files: [...this.files.values()].sort((a, b) => b.lastAt - a.lastAt).slice(0, 30),
      stats: this.stats,
      log: this.log.slice(-70).map((e) => (e.server ? { ...e, brand: brandOf(e.server), serverName: serverLabel(e.server) } : e)),
    };
  }
}
