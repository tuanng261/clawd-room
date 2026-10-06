// Codex (OpenAI's coding agent) support. Codex keeps each thread in
//   ~/.codex/sessions/YYYY/MM/DD/rollout-<time>-<thread id>.jsonl
// whose first line (session_meta) says what it is: a main thread, a helper
// thread (thread_source "subagent"), or an internal safety review
// ("guardian_review", skipped). This turns Codex records into the same shapes
// Claude Code transcripts have, so SessionModel, the room and the panel work
// unchanged; the session is marked agent: 'codex' so the page shows Codex's
// mascot.
//
// Read-only, like everything else here.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function defaultCodexDir() {
  return path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'sessions');
}

/** The session_meta at the top of a rollout file (null if it isn't one). */
export function readCodexMeta(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(256 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    const nl = buf.indexOf(10);
    const line = buf.toString('utf8', 0, nl > 0 && nl < n ? nl : n);
    const rec = JSON.parse(line);
    return rec?.type === 'session_meta' ? rec.payload : null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

export function codexThreadKind(meta) {
  if (!meta) return null;
  if (meta.thread_source === 'guardian_review' || meta.source?.subagent?.other === 'guardian') return 'review';
  if (meta.parent_thread_id || meta.thread_source === 'subagent') return 'helper';
  return 'main';
}

/** n distinct lines, so edits made up from Codex's diffs count as n added (or removed) lines. */
const lines = (n, tag) => Array.from({ length: Math.max(0, n) }, (_, i) => `${tag}${i}`).join('\n');

const textOf = (content) => (Array.isArray(content) ? content : [])
  .map((c) => (typeof c?.text === 'string' ? c.text : ''))
  .filter(Boolean)
  .join('\n')
  .trim();

const firstString = (src, keys) => {
  for (const k of keys) {
    const m = new RegExp(`\\b${k}\\s*:\\s*(["'\`])((?:\\\\.|(?!\\1).)*)\\1`, 's').exec(src);
    if (m) return m[2].replace(/\\n/g, '\n').replace(/\\(["'`\\])/g, '$1');
  }
  return null;
};

/** Files and +/− lines in an apply_patch body. */
function patchInfo(patch) {
  const files = [];
  let add = 0;
  let del = 0;
  for (const line of String(patch || '').split('\n')) {
    const m = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line);
    if (m) files.push({ op: m[1].toLowerCase(), path: m[2].trim() });
    else if (line.startsWith('+') && !line.startsWith('+++')) add++;
    else if (line.startsWith('-') && !line.startsWith('---')) del++;
  }
  return { files, add, del };
}

/** "codex_apps" + "figma.use_figma" → an MCP name the brand badges understand. */
function mcpName(server, tool) {
  const t = String(tool || '');
  const dot = t.indexOf('.');
  if (server === 'codex_apps' && dot > 0) return `mcp__codex_apps_${t.slice(0, dot)}__${t.slice(dot + 1)}`;
  return `mcp__${server || 'codex'}__${t.replace(/\./g, '_')}`;
}

/** mcp__codex_apps__figma_use_figma (as written in Codex's scripts) → the same form as mcpName. */
function mcpFromScript(name) {
  const m = /^mcp__codex_apps__([a-z0-9]+)_(.+)$/i.exec(name);
  return m ? `mcp__codex_apps_${m[1]}__${m[2]}` : name;
}

/**
 * A tool call inside one of Codex's `exec` scripts (it writes small JS that
 * calls tools.exec_command, tools.apply_patch…), as a Claude-style tool use.
 */
function scriptTool(code) {
  const m = /tools\.([A-Za-z0-9_]+)\s*\(/.exec(code || '');
  if (!m) return { name: 'ToolSearch', input: { query: 'its tools' } }; // just looking at what's available
  const tool = m[1];
  const args = code.slice(m.index);
  switch (tool) {
    case 'exec_command': {
      const cmd = firstString(args, ['cmd', 'command']) || '';
      return { name: 'Bash', input: { command: cmd, description: firstString(args, ['justification', 'description']) || undefined } };
    }
    case 'write_stdin': return { name: 'BashOutput', input: {} };
    case 'apply_patch': {
      const patch = firstString(args, ['input', 'patch']) || args;
      const p = patchInfo(patch);
      const f = p.files[0];
      if (f?.op === 'add') return { name: 'Write', input: { file_path: f.path, content: lines(p.add, 'n') } };
      return { name: 'Edit', input: { file_path: f?.path || 'a file', old_string: lines(p.del, 'o'), new_string: lines(p.add, 'n') } };
    }
    case 'view_image': return { name: 'Read', input: { file_path: firstString(args, ['path']) || 'image.png' } };
    case 'web__run': {
      const url = firstString(args, ['ref_id', 'url']);
      const q = firstString(args, ['q', 'query']);
      return url && /^https?:/.test(url) ? { name: 'WebFetch', input: { url } } : { name: 'WebSearch', input: { query: q || url || 'the web' } };
    }
    case 'request_permissions':
    case 'request_plugin_install':
      return { name: 'AskUserQuestion', input: { questions: [{ question: firstString(args, ['suggest_reason', 'reason']) || 'Allow this?' }] } };
    default:
      if (tool.startsWith('mcp__')) return { name: mcpFromScript(tool), input: { description: firstString(args, ['description', 'query']) || undefined } };
      return { name: tool, input: {} };
  }
}

/** A finished Codex item (from event_msg item_completed) as a Claude-style tool use + result. */
function itemTool(item) {
  switch (item.type) {
    case 'CommandExecution': {
      const cmd = Array.isArray(item.command) ? item.command[item.command.length - 1] : String(item.command || '');
      return { name: 'Bash', input: { command: cmd }, error: item.exit_code != null && item.exit_code !== 0, out: item.aggregated_output };
    }
    case 'FileChange': {
      const [file, change] = Object.entries(item.changes || {})[0] || [];
      const diff = change?.unified_diff || change?.diff || '';
      const p = patchInfo(diff);
      if (change?.type === 'add') return { name: 'Write', input: { file_path: file, content: String(change.content || '') } };
      return { name: 'Edit', input: { file_path: file, old_string: lines(p.del, 'o'), new_string: lines(p.add, 'n') } };
    }
    case 'McpToolCall': return { name: mcpName(item.server, item.tool), input: item.arguments || {}, error: item.status === 'failed' };
    case 'ImageView': return { name: 'Read', input: { file_path: String(item.path || '').replace(/^file:\/\//, '') } };
    case 'Extension':
      if (item.kind === 'web.search') {
        const url = item.action?.url;
        return url ? { name: 'WebFetch', input: { url } } : { name: 'WebSearch', input: { query: item.query || '' } };
      }
      return null;
    default: return null;
  }
}

/** Codex function calls that aren't scripts: helpers, questions, the in-app browser. */
function functionTool(name, args) {
  let a = {};
  try { a = JSON.parse(args || '{}'); } catch { /* keep {} */ }
  switch (name) {
    case 'spawn_agent': return { name: 'Agent', input: { description: a.task_name || 'helper', subagent_type: 'codex', run_in_background: true } };
    case 'send_message':
    case 'followup_task': return { name: 'SendMessage', input: { to: a.target || 'a helper' } };
    case 'wait_agent':
    case 'list_agents': return { name: 'WaitForHelpers', input: {} };
    case 'wait': return { name: 'BashOutput', input: {} };
    case 'request_user_input_async':
    case 'request_user_input': return { name: 'AskUserQuestion', input: { questions: [{ question: a.questions?.[0]?.title || a.questions?.[0]?.question || 'A question for you' }] } };
    case 'js': return { name: 'mcp__codex_browser__js', input: { description: a.title || 'Working in the browser' } };
    case 'update_plan': return { name: 'TodoWrite', input: { todos: (a.plan || []).map((p) => ({ content: p.step, status: p.status, activeForm: p.step })) } };
    case 'shell': return { name: 'Bash', input: { command: Array.isArray(a.command) ? a.command[a.command.length - 1] : String(a.command || '') } };
    default: return { name, input: a };
  }
}

/**
 * Feeds one Codex thread into a SessionModel, translated. `agent` is set for
 * helper threads (their steps go to the helper, not the main mascot).
 */
export class CodexThread {
  constructor(model, { agent = null, meta = null } = {}) {
    this.model = model;
    this.agent = agent;
    this.meta = meta;
    this.exec = new Map(); // call_id → { id, open, kind } for running scripts
    this.seq = 0;
    // A helper's file starts with a copy of its parent's history: skip that part.
    this.skipBefore = agent ? meta?.subagent_history_start_ordinal || 0 : 0;
  }

  feed(rec) {
    const p = rec?.payload;
    if (!p || typeof p !== 'object') return;
    if (this.skipBefore && typeof rec.ordinal === 'number' && rec.ordinal < this.skipBefore) return;
    const ts = rec.timestamp;
    switch (rec.type) {
      case 'session_meta': return this.onMeta(p, ts);
      case 'turn_context':
        if (p.cwd && !this.agent) this.model.cwd = p.cwd;
        if (p.model && !this.agent) this.model.model = p.model;
        return;
      case 'event_msg': return this.onEvent(p, ts);
      case 'response_item': return this.onItem(p, ts);
      case 'compacted': return this.send({ type: 'system', subtype: 'compact_boundary', timestamp: ts });
      default: return;
    }
  }

  send(rec) {
    if (this.agent) this.model.ingestAgent(this.agent.id, rec, this.agent.meta);
    else this.model.ingest(rec);
  }

  onMeta(p, ts) {
    if (this.agent) return;
    const m = this.model;
    m.agent = 'codex';
    m.cwd = p.cwd || m.cwd;
    m.version = p.cli_version || m.version;
    m.entrypoint = p.originator || m.entrypoint;
    m.touch(Date.parse(ts));
  }

  onEvent(p, ts) {
    const t = Date.parse(ts);
    switch (p.type) {
      case 'thread_settings_applied':
        if (!this.agent && p.thread_settings?.model) this.model.model = p.thread_settings.model;
        return;
      case 'task_complete':
        if (this.agent) return this.send({ type: 'assistant', timestamp: ts, message: { content: [{ type: 'text', text: p.last_agent_message || 'Done.' }], stop_reason: 'end_turn' } });
        this.model.touch(t);
        this.model.endTurn(t, false);
        this.model.rev++;
        return;
      case 'turn_aborted':
        if (this.agent) return;
        this.model.touch(t);
        this.model.endTurn(t, true);
        this.model.rev++;
        return;
      case 'item_completed': return this.onDone(p.item || {}, ts);
      default: return;
    }
  }

  /** Finished items: messages, thoughts, and the tools Codex's scripts ran. */
  onDone(item, ts) {
    switch (item.type) {
      case 'UserMessage': {
        let text = textOf(item.content);
        // Codex puts attached files first, then "## My request:" and what you actually asked.
        const ask = /##\s*My request(?: for Codex)?:\s*([\s\S]*)$/i.exec(text);
        if (ask) text = ask[1].trim();
        if (!text || text.startsWith('<')) return;
        return this.send({ type: 'user', timestamp: ts, message: { role: 'user', content: text } });
      }
      case 'AgentMessage': {
        const text = textOf(item.content);
        if (text) this.send({ type: 'assistant', timestamp: ts, message: { content: [{ type: 'text', text }], stop_reason: 'tool_use' } });
        return;
      }
      case 'Reasoning': {
        const text = (item.summary_text || []).join(' ').replace(/\*\*/g, '').trim();
        if (text) this.send({ type: 'assistant', timestamp: ts, message: { content: [{ type: 'thinking', thinking: text }] } });
        return;
      }
      case 'SubAgentActivity': return this.onHelper(item, ts);
      default: break;
    }
    const tool = itemTool(item);
    if (!tool) return;
    // The first tool a running script does is already showing as its step: finish that one.
    const open = [...this.exec.values()].find((x) => x.open && x.kind === tool.name);
    if (open) {
      open.open = false;
      return this.result(open.id, ts, tool.error, tool.out);
    }
    const id = `cx-${++this.seq}`;
    const start = item.duration?.secs != null ? new Date(Date.parse(ts) - item.duration.secs * 1000).toISOString() : ts;
    this.use(id, tool, start);
    this.result(id, ts, tool.error, tool.out);
  }

  onHelper(item, ts) {
    if (this.agent) return;
    const m = this.model;
    const callId = item.id;
    const threadId = item.agent_thread_id;
    if (!threadId) return;
    if (item.kind === 'started') {
      const ag = m.linkAgent(callId, `cx:${threadId}`, { background: true });
      ag.description = ag.description || String(item.agent_path || '').split('/').pop().replace(/_/g, ' ') || 'Helper';
      if (ag.status === 'starting') ag.status = 'running';
      ag.startedAt = ag.startedAt || Date.parse(ts);
    } else if (item.kind === 'completed') {
      const ag = m.agents.get(`cx:${threadId}`);
      if (ag) { ag.status = 'done'; ag.endedAt = Date.parse(ts); }
    }
    m.rev++;
  }

  onItem(p, ts) {
    switch (p.type) {
      case 'custom_tool_call': {
        if (p.name !== 'exec') return this.use(p.call_id, { name: p.name, input: {} }, ts);
        const tool = scriptTool(p.input);
        this.exec.set(p.call_id, { id: p.call_id, open: true, kind: tool.name });
        return this.use(p.call_id, tool, ts);
      }
      case 'custom_tool_call_output': {
        const x = this.exec.get(p.call_id);
        this.exec.delete(p.call_id);
        const out = textOf(p.output) || (typeof p.output === 'string' ? p.output : '');
        if (!x || x.open) this.result(p.call_id, ts, /Script (failed|error)|\bError:/i.test(out.slice(0, 400)), out);
        return;
      }
      case 'function_call': return this.use(p.call_id, functionTool(p.name, p.arguments), ts);
      case 'function_call_output': {
        const out = typeof p.output === 'string' ? p.output : textOf(p.output);
        return this.result(p.call_id, ts, /"error"|failed/i.test(String(out).slice(0, 300)), out);
      }
      case 'web_search_call': {
        const id = p.id || `cx-${++this.seq}`;
        this.use(id, { name: 'WebSearch', input: { query: p.action?.query || '' } }, ts);
        return this.result(id, ts, false, '');
      }
      default: return;
    }
  }

  use(id, tool, ts) {
    this.send({ type: 'assistant', timestamp: ts, message: { content: [{ type: 'tool_use', id, name: tool.name, input: tool.input || {} }], stop_reason: 'tool_use' } });
  }

  result(id, ts, isError = false, out = '') {
    this.send({ type: 'user', timestamp: ts, message: { content: [{ type: 'tool_result', tool_use_id: id, content: String(out || '').slice(0, 2000), is_error: !!isError }] } });
  }
}
