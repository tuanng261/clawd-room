// The panels around the room. Plain DOM; re-rendered from each snapshot,
// with timers ticking separately so nothing re-renders every frame.
//
// Right column: a simple "what's happening" card (technical details fold out
// below it) and a chat feed where Clawd narrates in short, plain bubbles.

import { icon } from './icons.js';
import { badgeHtml, brandById, genericBrand } from './brands.js';
import { brandFor } from './items.js';
import { asDoing, chatBubbles, simplify } from './plain.js';
import { MOODS, moodFor } from './thinking.js';
import {
  clock, esc, fmtAgo, fmtDur, fmtTokens, hash, HAT_COLORS, mascotName, probablyNeedsApproval, STATION_COLORS, STATION_LEGEND, STATION_NAMES,
} from './util.js';
import { dotClass } from './room.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

function prettyModel(m) {
  if (!m) return '';
  const x = /claude-(?:(\d+)-(\d+)-)?([a-z]+)(?:-(\d+)(?:-(\d+))?)?/.exec(m);
  if (!x) return m;
  const name = x[3][0].toUpperCase() + x[3].slice(1);
  const ver = x[1] ? `${x[1]}.${x[2]}` : x[4] ? `${x[4]}${x[5] && x[5].length < 3 ? '.' + x[5] : ''}` : '';
  return `${name} ${ver}`.trim();
}

const STATUS_TEXT = {
  working: 'Working', thinking: 'Thinking', idle: 'Your turn', stale: 'Quiet', asking: 'Needs you',
};

function statusOf(s) {
  if (!s) return 'idle';
  if (s.status === 'working' && s.pending?.some((a) => a.asksUser || probablyNeedsApproval(a, s, clock.now()))) return 'asking';
  return s.status;
}

/** Stats for the current request. */
function turnStats(s) {
  const turn = s.turn;
  const running = !!turn && !turn.endedAt && s.status !== 'idle';
  const failed = turn?.failed ?? (s.log || []).filter((e) => e.status === 'error' && turn && e.at >= turn.startedAt).length;
  const live = (s.pending || []).length;
  return {
    running,
    done: turn?.done ?? Math.max(0, (turn?.toolCalls ?? 0) - failed - live),
    live,
    time: turn ? (running ? null : (turn.endedAt || turn.startedAt) - turn.startedAt) : null,
    steps: turn?.toolCalls ?? 0,
    failed,
    files: (s.files || []).length,
    edited: (s.files || []).filter((f) => f.edits).length,
    helpers: (s.agents || []).filter((a) => a.status === 'running' || a.status === 'starting').length,
    helperSteps: turn ? (s.agents || []).filter((a) => (a.startedAt || 0) >= turn.startedAt).reduce((n, a) => n + (a.toolCalls || 0), 0) : 0,
    jobs: (s.jobs || []).filter((j) => j.status === 'running').length,
  };
}

/** Rough time-left estimate from the pace of finished tasks. */
export function estimate(tasks, now) {
  if (!tasks?.length) return null;
  const done = tasks.filter((t) => t.status === 'completed');
  const remaining = tasks.length - done.length;
  if (!remaining) return { kind: 'done' };
  if (!done.length) return { kind: 'unknown', remaining };
  const start = Math.min(...tasks.map((t) => t.createdAt || Infinity), ...done.map((t) => t.startedAt || Infinity));
  const last = Math.max(...done.map((t) => t.completedAt || 0));
  const pace = Math.max(8000, (last - start) / done.length);
  const since = now - last;
  const ms = remaining * pace - since;
  return { kind: 'eta', ms, pace, remaining, rough: done.length < 2 };
}

function etaText(e) {
  if (!e) return '';
  if (e.kind === 'done') return 'All done';
  if (e.kind === 'unknown') return 'Estimating…';
  if (e.ms < 20000) return e.ms < -e.pace * 0.5 ? 'Taking longer than the others' : 'Any moment now';
  const m = Math.round(e.ms / 60000);
  return m < 1 ? `≈ ${Math.max(1, Math.round(e.ms / 10000)) * 10}s left` : `≈ ${m} min left`;
}

const TONES = ['bad', 'live', 'say', 'think', 'good', 'note'];

/** "[>_] Bash", "[Fi] Figma · get screenshot" — which tool, with the connector's badge. */
function toolChip(x, count = 0) {
  if (!x) return '';
  const brand = brandFor(x);
  const name = brand ? `${brand.name}${x.toolName && x.toolName !== brand.name ? ` · ${x.toolName}` : ''}` : x.toolName || x.tool || 'Tool';
  const mark = brand ? badgeHtml(brand) : `<span class="tico">${icon(x.icon || 'tool')}</span>`;
  return `<span class="toolchip" title="${esc(x.tool || name)}">${mark}<span class="nm">${esc(name)}</span>${count ? `<b class="n">${count}</b>` : ''}</span>`;
}

function deltaChip(d) {
  if (!d || (!d.add && !d.del)) return '';
  return `<span class="chip delta"><b class="add">+${d.add}</b>${d.whole ? ' lines' : ` <b class="del">−${d.del}</b>`}</span>`;
}
const BUBBLE_ICON = { read: 'book', edit: 'pencil', search: 'search', web: 'globe', plan: 'list', run: 'terminal', helper: 'agent', tool: 'tool', ask: 'question' };

export class Hud {
  constructor({ onSelect, onCamera, onFocus, onStyle }) {
    this.onSelect = onSelect;
    this.onCamera = onCamera;
    this.onFocus = onFocus;
    this.onStyle = onStyle;
    this.style = null;
    this.sessions = [];
    this.snap = null;
    this.selected = null;
    this.focus = 'main';
    this.tab = store.get('clawd.tab') || 'helpers';
    this.detailsOpen = store.get('clawd.details') === '1';
    this.progressOpen = store.get('clawd.progress') === '1';
    this.cache = {};
    this.chatSession = null;

    // The info card: simple on top, technical details fold out underneath.
    $('inspector').innerHTML = `<div id="inspMain"></div>
      <button id="detailsBtn" class="details-btn" aria-expanded="false"><span>Technical details</span><small>commands, files, full thinking</small>
        <svg class="chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>
      <div id="inspDetails" class="details" hidden><div id="detTop"></div><div id="detTabs"></div><div id="detFeed"></div></div>`;
    this.applyDetails();
    $('chatTyping').querySelector('.bi').innerHTML = icon('thought');

    const btn = $('sessionBtn');
    const menu = $('sessionMenu');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      btn.setAttribute('aria-expanded', String(!menu.hidden));
      if (!menu.hidden) this.renderMenu();
    });
    document.addEventListener('click', (e) => {
      if (!menu.hidden && !menu.contains(e.target)) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') menu.hidden = true; });
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-id]');
      if (!b) return;
      menu.hidden = true;
      this.onSelect(b.dataset.id);
    });
    $('inspector').addEventListener('click', (e) => {
      if (e.target.closest('#detailsBtn')) {
        this.detailsOpen = !this.detailsOpen;
        store.set('clawd.details', this.detailsOpen ? '1' : '0');
        this.applyDetails();
        this.renderInspector();
        this.layout();
        return;
      }
      if (e.target.closest('[data-back]')) { this.onFocus('main'); return; }
      const tab = e.target.closest('[data-tab]');
      if (tab) { this.tab = tab.dataset.tab; store.set('clawd.tab', this.tab); this.renderTabs(true); return; }
      const row = e.target.closest('[data-agent]');
      if (row) this.onFocus(row.dataset.agent);
    });
    // The request bar is one line until you open it.
    $('progress').addEventListener('click', (e) => {
      if (!e.target.closest('[data-toggle]')) return;
      this.progressOpen = !this.progressOpen;
      store.set('clawd.progress', this.progressOpen ? '1' : '0');
      this.renderProgress();
      this.layout();
    });
    document.querySelector('.mapctl').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cam]');
      if (b) this.onCamera(b.dataset.cam);
    });

    // Room style picker.
    const sbtn = $('styleBtn');
    const smenu = $('styleMenu');
    sbtn.addEventListener('click', (e) => {
      e.stopPropagation();
      smenu.hidden = !smenu.hidden;
      sbtn.setAttribute('aria-expanded', String(!smenu.hidden));
      if (!smenu.hidden) this.renderStyleMenu();
    });
    document.addEventListener('click', (e) => { if (!smenu.hidden && !smenu.contains(e.target)) smenu.hidden = true; });
    smenu.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-style]');
      if (!b) return;
      smenu.hidden = true;
      this.onStyle?.(b.dataset.style);
    });

    setInterval(() => this.tick(), 500);
    this.tick();
  }

  applyDetails() {
    $('inspDetails').hidden = !this.detailsOpen;
    $('detailsBtn').setAttribute('aria-expanded', String(this.detailsOpen));
    $('detailsBtn').classList.toggle('open', this.detailsOpen);
  }

  setStyle(info) {
    this.style = info;
    const name = info.themes[info.current]?.name || 'Cozy room';
    const btn = $('styleBtn');
    btn.querySelector('b').textContent = name;
    btn.querySelector('small').textContent = info.choice === 'auto' ? 'Room · auto' : 'Room';
    if (!$('styleMenu').hidden) this.renderStyleMenu();
  }

  renderStyleMenu() {
    const info = this.style;
    if (!info) return;
    const det = info.themes[info.detected]?.name || 'Cozy room';
    const why = info.reasons.length ? `Picked from ${info.reasons.join(', ')}` : 'Nothing specific yet, so the cozy room';
    const row = (id, title, sub, on) => `<button data-style="${id}" class="${on ? 'on' : ''}" role="option"><span class="dot ${on ? 'working' : ''}"></span><b>${esc(title)}</b><span class="when"></span><small>${esc(sub)}</small></button>`;
    const order = [['lab', 'For code'], ['studio', 'For video'], ['art', 'For design'], ['class', 'For studying'], ['cozy', 'For everything else']];
    $('styleMenu').innerHTML = `<div class="group">Room style for this session</div>`
      + row('auto', `Automatic: ${det}`, why, info.choice === 'auto')
      + order.map(([id, sub]) => row(id, info.themes[id].name, sub, info.choice === id)).join('');
  }

  setConn(on) {
    const el = $('conn');
    el.classList.toggle('on', on);
    el.querySelector('span').textContent = on ? 'Live' : 'Reconnecting…';
  }

  setFollow(on) {
    document.querySelector('[data-cam="follow"]').classList.toggle('on', on);
  }

  setSessions(list, selected) {
    this.sessions = list;
    this.selected = selected;
    const s = list.find((x) => x.id === selected);
    const btn = $('sessionBtn');
    const st = statusOf(s);
    btn.querySelector('.dot').className = `dot ${dotClass(s)}`;
    btn.querySelector('b').textContent = s ? s.title : 'Looking for sessions…';
    btn.querySelector('small').textContent = s
      ? `${s.demo ? 'Demo session' : s.project} · ${s.live ? STATUS_TEXT[st] || st : 'last active ' + fmtAgo(clock.now() - s.lastAt)}`
      : '';
    if (!$('sessionMenu').hidden) this.renderMenu();
  }

  renderMenu() {
    const now = clock.now();
    const row = (s) => {
      const cur = s.current ? s.current.text : s.status === 'thinking' ? 'Thinking…' : s.live ? 'Waiting for you' : `Idle · ${s.project}`;
      const helpers = s.helpers ? ` · ${s.helpers} helper${s.helpers > 1 ? 's' : ''}` : '';
      return `<button data-id="${esc(s.id)}" class="${s.id === this.selected ? 'on' : ''}" role="option">
        <span class="dot ${dotClass(s)}"></span><b>${esc(s.title)}</b><span class="when">${s.demo ? 'demo' : esc(fmtAgo(now - s.lastAt))}</span>
        <small>${esc(s.demo ? 'A pretend session that loops, to show what the room can do' : `${s.agent === 'codex' ? 'Codex · ' : ''}${s.project} · ${cur}${helpers}`)}</small></button>`;
    };
    const live = this.sessions.filter((s) => s.live && !s.demo);
    const rest = this.sessions.filter((s) => !s.live && !s.demo);
    const demo = this.sessions.filter((s) => s.demo);
    let html = '';
    if (live.length) html += `<div class="group">Live now</div>${live.map(row).join('')}`;
    if (rest.length) html += `<div class="group">Earlier</div>${rest.map(row).join('')}`;
    if (demo.length) html += `<div class="group">Demo</div>${demo.map(row).join('')}`;
    if (!html) html = '<div class="empty">No Claude Code sessions in the last few hours.</div>';
    $('sessionMenu').innerHTML = html;
  }

  setSnapshot(s) {
    this.snap = s;
    if (this.focus !== 'main' && !s?.agents?.some((a) => a.id === this.focus)) this.focus = 'main';
    this.renderInspector();
    this.renderProgress();
    this.renderChat();
    this.layout();
  }

  setFocus(id) {
    this.focus = id || 'main';
    this.renderInspector();
  }

  put(id, html) {
    if (this.cache[id] === html) return false;
    this.cache[id] = html;
    $(id).innerHTML = html;
    return true;
  }

  // ── info card ─────────────────────────────────────────────
  renderInspector() {
    const s = this.snap;
    if (!s) {
      this.put('inspMain', '<div class="empty">Waiting for data from Claude Code…</div>');
      return;
    }
    const agent = this.focus !== 'main' ? s.agents.find((a) => a.id === this.focus) : null;
    this.put('inspMain', agent ? this.agentSimple(s, agent) : this.mainSimple(s));
    if (this.detailsOpen) {
      this.put('detTop', agent ? this.agentDetails(s, agent) : this.mainDetails(s));
      this.renderTabs();
      this.put('detFeed', this.feedHtml(s));
    }
  }

  /** The plain version: what's happening, for how long, and the latest thought. */
  mainSimple(s) {
    const st = statusOf(s);
    const now = clock.now();
    const act = s.pending?.length ? s.pending[s.pending.length - 1] : null;
    let ic;
    let head;
    let sub;
    let brand = null;
    if (st === 'asking' && act) {
      ic = 'question';
      head = act.asksUser ? 'Waiting for your answer' : 'Probably needs your OK';
      sub = act.asksUser ? simplify(act.label, 12) : `Check Claude Code · ${simplify(act.text, 8)}`;
    } else if (st === 'working' && act) {
      ic = act.icon;
      brand = brandFor(act);
      head = simplify(asDoing(act.text), 9);
      sub = `${STATION_NAMES[act.station] || ''} · <span data-since="${act.startedAt}">${fmtDur(now - act.startedAt)}</span>${s.pending.length > 1 ? ` · ${s.pending.length} things at once` : ''}`;
    } else if (st === 'thinking') {
      ic = 'dots';
      head = MOODS[moodFor(s, now)].tag;
      sub = `for <span data-since="${s.statusSince}">${fmtDur(now - s.statusSince)}</span>`;
    } else if (st === 'stale') {
      ic = 'moon';
      head = 'This session went quiet';
      sub = `last seen ${esc(fmtAgo(now - s.lastAt))}`;
    } else {
      ic = 'user';
      head = s.turn?.interrupted ? 'Stopped. Your turn' : 'Done. Your turn';
      sub = s.turn?.endedAt ? `finished <span data-ago="${s.turn.endedAt}">${fmtAgo(now - s.turn.endedAt)}</span> · took ${fmtDur(s.turn.endedAt - s.turn.startedAt)}` : 'waiting for you';
    }
    const thought = s.thought && (!s.turn || s.thought.at >= s.turn.startedAt) ? s.thought : null;
    const mind = thought ? `<div class="mind short"><span class="mi">${icon('thought')}</span><p>${esc(simplify(thought.text, 12))}</p></div>` : '';
    return `<div class="now simple ${st}">${bigIcon(ic, brand)}<div class="what"><div class="label">${esc(head)}</div><div class="sub">${sub}</div>
        ${st === 'working' && act ? `<div class="uses">${toolChip(act)}${deltaChip(act.delta)}</div>` : ''}</div></div>
      ${mind}`;
  }

  /** The technical version: commands, paths, full texts, numbers. */
  mainDetails(s) {
    const now = clock.now();
    const act = s.pending?.length ? s.pending[s.pending.length - 1] : null;
    const cur = act ? this.actCard(act, s.pending.length > 1 ? `+${s.pending.length - 1} more at once` : '') : '';
    const thought = s.thought && (!s.turn || s.thought.at >= s.turn.startedAt) ? s.thought : null;
    const mind = thought ? `<div class="mind"><span class="k">${icon('thought')}Full thought · <span data-ago="${thought.at}">${fmtAgo(now - thought.at)}</span></span><p>${esc(thought.text)}</p></div>` : '';
    const foot = `<div class="foot"><span>${s.model ? `<b>${esc(prettyModel(s.model))}</b>` : ''}${s.context ? ` · context ${fmtTokens(s.context.tokens)}` : ''}</span><span>${esc(s.gitBranch && s.gitBranch !== 'HEAD' ? '⎇ ' + s.gitBranch : '')}</span></div>`;
    return `${cur}${mind}${foot}`;
  }

  agentSimple(s, a) {
    const now = clock.now();
    const color = HAT_COLORS[hash(a.toolUseId || a.id) % HAT_COLORS.length];
    const act = a.pending?.length ? a.pending[a.pending.length - 1] : null;
    const running = a.status === 'running' || a.status === 'starting';
    const head = running ? (act ? simplify(asDoing(act.text), 9) : 'Thinking…') : 'Finished';
    const sub = running ? `working for <span data-since="${a.startedAt}">${fmtDur(now - a.startedAt)}</span> · ${a.toolCalls} steps` : esc(simplify(a.summary || 'Handed the report back to Clawd', 12));
    return `<div class="who"><span class="avatar helper" style="--hat:${color}"></span><div class="name"><b>${esc(a.description)}</b><span>Helper${a.background ? ' · in the background' : ''}</span></div>
      <button class="back" data-back>← Clawd</button></div>
      <div class="now simple">${brandFor(act) ? bigIcon(null, brandFor(act)) : `<span class="bigicon" style="background:${color}">${icon(act?.icon || (running ? 'dots' : 'check'))}</span>`}<div class="what"><div class="label">${esc(head)}</div><div class="sub">${sub}</div>
        ${running && act ? `<div class="uses">${toolChip(act)}</div>` : ''}</div></div>
      ${a.thought ? `<div class="mind short"><span class="mi">${icon('thought')}</span><p>${esc(simplify(a.thought.text, 12))}</p></div>` : ''}`;
  }

  agentDetails(s, a) {
    const now = clock.now();
    const act = a.pending?.length ? a.pending[a.pending.length - 1] : null;
    return `<div class="meta"><span class="chip">${esc(a.type)}</span><span class="chip">${icon('bolt')}${a.toolCalls} steps</span>
      <span class="chip">${icon('clock')}${a.status === 'running' ? `<span data-since="${a.startedAt}">${fmtDur(now - a.startedAt)}</span>` : fmtDur((a.endedAt || a.lastAt) - a.startedAt)}</span></div>
      ${act ? this.actCard(act) : ''}
      ${a.thought ? `<div class="mind"><span class="k">${icon('thought')}Full thought</span><p>${esc(a.thought.text)}</p></div>` : ''}
      ${a.narration ? `<div class="say"><span class="k">Helper says</span><p>${esc(a.narration)}</p></div>` : ''}`;
  }

  actCard(act, extra = '') {
    if (!act) return '';
    const now = clock.now();
    const chips = [
      `<span class="chip">${icon('clock')}<span data-since="${act.startedAt}">${fmtDur(now - act.startedAt)}</span></span>`,
    ];
    const delta = deltaChip(act.delta);
    if (delta) chips.push(delta);
    if (act.timeoutMs) {
      const until = act.startedAt + act.timeoutMs;
      chips.push(until > now
        ? `<span class="chip warn">${icon('hourglass')}time limit in <span data-until="${until}">${fmtDur(until - now)}</span></span>`
        : `<span class="chip warn">${icon('hourglass')}past its ${fmtDur(act.timeoutMs)} limit</span>`);
    }
    if (act.background) chips.push('<span class="chip">background</span>');
    if (extra) chips.push(`<span class="chip">${esc(extra)}</span>`);
    return `<div class="now tech"><div class="uses top">${toolChip(act)}${act.tool !== act.toolName ? `<code title="${esc(act.tool)}">${esc(act.tool)}</code>` : ''}</div><div class="verb">${esc(act.verb)} · ${esc(act.label || act.tool)}</div>
      ${act.detail && act.detail !== act.label ? `<div class="detail">${esc(trim(act.detail, 400))}</div>` : ''}
      <div class="meta">${chips.join('')}</div></div>`;
  }

  feedHtml(s) {
    const now = clock.now();
    const feed = (s.log || []).filter((e) => e.kind === 'tool').slice(-8).reverse().map((e) => {
      const meta = e.status === 'running' ? 'now' : e.duration != null ? fmtDur(e.duration) : fmtAgo(now - e.at);
      const brand = e.kind === 'tool' ? brandFor(e) : null;
      const mark = brand ? badgeHtml(brand, 'fb') : `<span class="fi">${icon(e.status === 'error' ? 'alert' : e.icon)}</span>`;
      const tool = e.kind === 'tool' && e.tool ? `<span class="fk">${esc(e.tool)}</span>` : '';
      return `<div class="item ${e.kind} ${e.status || ''}">${mark}<span class="ft" title="${esc(e.detail || e.text)}">${tool}${esc(e.detail && e.kind === 'tool' ? `${e.text} · ${e.detail}` : e.text)}</span><span class="fm">${esc(meta)}</span></div>`;
    }).join('');
    return `<div class="feed"><h3>Every step</h3>${feed || '<div class="empty">Nothing yet.</div>'}</div>`;
  }

  // ── chat feed ─────────────────────────────────────────────
  renderChat() {
    const list = $('chatList');
    const s = this.snap;
    if (!s) { list.replaceChildren(); return; }
    const fresh = s.id !== this.chatSession;
    if (fresh) { list.replaceChildren(); this.chatSession = s.id; }
    const bubbles = chatBubbles(s.log, 7);
    const keys = new Set(bubbles.map((b) => b.key));
    for (const el of [...list.children]) if (!keys.has(el.dataset.key)) el.remove();
    bubbles.forEach((b, i) => {
      const html = this.bubbleHtml(b);
      let el = list.querySelector(`[data-key="${CSS.escape(b.key)}"]`);
      if (!el) {
        el = document.createElement('div');
        el.dataset.key = b.key;
        el.addEventListener('animationend', () => el.classList.remove('pop', 'bump'));
        el.innerHTML = html;
        el.dataset.html = html;
        el.className = `bub ${b.side}${b.tone ? ` t-${b.tone}` : ''} pop`;
        // On a session switch the whole conversation pops in one after another.
        if (fresh) el.style.animationDelay = `${i * 70}ms`;
        list.appendChild(el);
        return;
      }
      el.style.animationDelay = '';
      for (const t of TONES) el.classList.toggle(`t-${t}`, b.tone === t);
      if (el.dataset.html !== html) {
        el.innerHTML = html;
        el.dataset.html = html;
        el.classList.remove('bump');
        void el.offsetWidth; // restart the little bump animation
        el.classList.add('bump');
      }
    });
    if (!bubbles.length) list.innerHTML = `<div class="empty">${s.live ? `${mascotName()} will chat here as it works.` : 'Nothing happened here recently.'}</div>`;
    // Clawd is "typing" while it thinks.
    $('chatTyping').hidden = !(s.status === 'thinking' && s.live);
  }

  bubbleHtml(b) {
    if (b.side === 'you') return `<p>${esc(b.text)}</p>`;
    const ic = b.kind === 'tool' ? BUBBLE_ICON[b.group] || 'tool'
      : b.tone === 'think' ? 'thought' : b.tone === 'say' ? 'chat' : b.tone === 'good' ? 'check' : b.icon || 'sparkle';
    const brand = b.brand ? brandById(b.brand.id) || genericBrand(b.brand.name) : null;
    const mark = brand && b.tone !== 'bad' ? `<span class="bi brand">${badgeHtml(brand)}</span>` : `<span class="bi">${icon(b.tone === 'bad' ? 'alert' : ic)}</span>`;
    const cap = b.caption ? `<small class="cap">${esc(b.caption)}</small>` : '';
    return `${mark}<p>${esc(b.text)}${cap}</p>`;
  }

  // ── this request (one line; open it for the details) ────
  renderProgress() {
    const s = this.snap;
    const el = $('progress');
    el.classList.toggle('open', this.progressOpen);
    if (!s) return this.put('progress', '');
    const now = clock.now();
    const k = turnStats(s);
    const tasks = s.tasks || [];
    const done = tasks.filter((t) => t.status === 'completed').length;
    const e = tasks.length ? estimate(tasks, now) : null;
    const status = tasks.length ? etaText(e) : s.status === 'idle' ? 'Finished' : s.status === 'stale' ? 'Quiet' : k.running ? 'Working…' : '';
    const time = k.running && s.turn ? `<span data-since="${s.turn.startedAt}">${fmtDur(now - s.turn.startedAt)}</span>` : fmtDur(k.time);
    const stats = [
      s.turn ? `<span title="${k.running ? 'Time on this request so far' : 'How long the last request took'}">${icon('clock')}<b>${time}</b></span>` : '',
      `<span title="Steps done, out of all steps">${icon('check')}<b>${k.done}/${k.steps}</b>steps</span>`,
      k.failed ? `<span class="bad" title="Steps that failed">${icon('alert')}<b>${k.failed}</b>failed</span>` : '',
      k.helpers ? `<span title="Helpers working now">${icon('agent')}<b>${k.helpers}</b>helper${k.helpers > 1 ? 's' : ''}</span>` : '',
      k.files ? `<span class="minor" title="Files read or edited in this session">${icon('file')}<b>${k.files}</b>files</span>` : '',
    ].join('');
    const title = tasks.length ? `The plan · ${done}/${tasks.length}` : 'This request';
    const bar = tasks.length ? `<i class="pbar"><b style="width:${Math.round((done / tasks.length) * 100)}%"></b></i>` : '';
    const head = `<button class="phead" data-toggle aria-expanded="${this.progressOpen}">
      <svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg><h3>${esc(title)}</h3>
      <span class="pstats">${stats}</span><span class="eta"${tasks.length ? ' data-eta' : ''}>${esc(status)}</span></button>${bar}`;
    if (!this.progressOpen) return this.put('progress', head);

    const used = (s.turn?.tools || []).slice(0, 6);
    const more = (s.turn?.tools || []).length - used.length;
    const tools = used.length ? `<div class="toolsused">${used.map((x) => toolChip({ tool: x.tool, toolName: x.server ? null : x.tool, server: x.server ? x.name : null, serverName: x.name, brand: x.brand, icon: x.icon }, x.n)).join('')}${more > 0 ? `<span class="more">+${more}</span>` : ''}</div>` : '';
    let body;
    if (tasks.length) {
      const activeIdx = tasks.findIndex((t) => t.status === 'in_progress');
      const focus = activeIdx >= 0 ? activeIdx : Math.min(done, tasks.length - 1);
      const maxSteps = 7;
      const start = Math.max(0, Math.min(focus - 3, tasks.length - maxSteps));
      body = `<div class="steps">${tasks.slice(start, start + maxSteps).map((t, i) => {
        const cls = t.status === 'completed' ? 'done' : t.status === 'in_progress' ? 'active' : '';
        const inner = t.status === 'completed' ? icon('check') : String(start + i + 1);
        const label = t.status === 'in_progress' && t.activeForm ? t.activeForm : t.subject;
        return `<div class="step ${cls}" title="${esc(t.subject)}"><span class="c">${inner}</span><span class="t">${esc(label)}</span></div>`;
      }).join('')}</div>
      ${e?.kind === 'eta' ? `<div class="note">Time left is a guess from how long the finished tasks took (about ${fmtDur(e.pace)} each).</div>` : ''}`;
    } else {
      // No task list: one bar per step, coloured by where it happened.
      const turnStart = s.turn?.startedAt || 0;
      const steps = (s.log || []).filter((x) => x.kind === 'tool' && x.at >= turnStart).slice(-48);
      const strip = steps.map((x) => {
        const st = x.status === 'running' ? 'running' : x.status === 'error' ? 'failed' : 'done';
        const tip = `${x.server ? `${x.serverName} · ` : ''}${x.tool || ''}: ${x.text}${x.duration != null ? ` (${fmtDur(x.duration)})` : ''} · ${st}`;
        return `<i class="${st}" style="background:${STATION_COLORS[x.station] || '#c9c2b8'};height:${x.status === 'error' ? 40 : 55 + Math.min(45, (x.duration || 3000) / 1000 * 4)}%" title="${esc(tip)}"></i>`;
      }).join('');
      const usedSt = new Set(steps.map((x) => x.station));
      const legend = STATION_LEGEND.filter(([key]) => usedSt.has(key)).map(([key, l]) => `<span style="--c:${STATION_COLORS[key]}">${l}</span>`).join('');
      body = `<div class="strip">${strip || '<span class="empty">No steps yet.</span>'}</div>
        ${legend ? `<div class="legend">${legend}</div>` : ''}`;
    }
    this.put('progress', `${head}<div class="pbody">${body}${tools}</div>`);
  }

  // ── helpers / background / files (inside the details) ─────
  renderTabs(force = false) {
    const s = this.snap;
    if (!s || !this.detailsOpen) return;
    const now = clock.now();
    const agents = (s.agents || []).slice().reverse();
    const jobs = (s.jobs || []).slice().reverse();
    const files = s.files || [];
    const runningA = agents.filter((a) => a.status === 'running' || a.status === 'starting').length;
    const runningJ = jobs.filter((j) => j.status === 'running').length;
    const tabs = [['helpers', 'Helpers', runningA || agents.length], ['background', 'Background', runningJ || jobs.length], ['files', 'Files', files.length]];
    const bar = `<div class="tabbar">${tabs.map(([k, l, n]) => `<button data-tab="${k}" class="${this.tab === k ? 'on' : ''}">${l}<span>${n}</span></button>`).join('')}</div>`;
    let rows = '';
    const pill = (st) => `<span class="pill ${st}">${esc({ running: 'Running', starting: 'Starting', done: 'Done', failed: 'Failed', stopped: 'Stopped', stale: 'Quiet', unknown: 'Unknown' }[st] || st)}</span>`;
    const dur = (start, end, running) => running ? `<span data-since="${start}">${fmtDur(now - start)}</span>` : start ? fmtDur((end || now) - start) : '';
    if (this.tab === 'helpers') {
      rows = agents.map((a) => {
        const running = a.status === 'running' || a.status === 'starting';
        const act = a.pending?.length ? a.pending[a.pending.length - 1] : a.current;
        const color = HAT_COLORS[hash(a.toolUseId || a.id) % HAT_COLORS.length];
        return `<div class="rowi click" data-agent="${esc(a.id)}"><b style="--hat:${color}"><span class="hat"></span>${esc(a.description)}</b>
          <span class="rt">${pill(a.status)}<span>${dur(a.startedAt, a.endedAt, running)}</span></span>
          <small>${esc(running ? (act && act.status === 'running' ? act.text : 'Thinking…') : a.summary || `${a.toolCalls} steps`)}</small></div>`;
      }).join('') || '<div class="empty">No helpers in this session recently.</div>';
    } else if (this.tab === 'background') {
      rows = jobs.map((j) => `<div class="rowi"><b>${icon(j.kind === 'workflow' ? 'layers' : 'terminal')}${esc(j.label)}</b>
          <span class="rt">${pill(j.status)}<span>${dur(j.startedAt, j.endedAt, j.status === 'running')}</span></span>
          <small>${esc(j.summary || j.detail || (j.kind === 'workflow' ? 'Workflow' : 'Background command'))}</small></div>`).join('')
        || '<div class="empty">No background commands right now.</div>';
    } else {
      rows = files.map((f) => `<div class="rowi"><b>${icon(f.edits ? 'pencil' : 'book')}${esc(f.name)}</b>
          <span class="rt"><span>${f.edits ? `${f.edits} edit${f.edits > 1 ? 's' : ''}` : `${f.reads} read${f.reads > 1 ? 's' : ''}`}</span><span>${fmtAgo(now - f.lastAt)}</span></span>
          <small title="${esc(f.path)}">${esc(f.path)}</small></div>`).join('') || '<div class="empty">No files touched yet.</div>';
    }
    if (force) delete this.cache.detTabs;
    this.put('detTabs', `${bar}<div class="rows">${rows}</div>`);
  }

  // ── layout & timers ───────────────────────────────────────
  layout() {
    const narrow = window.innerWidth <= 860;
    const side = $('side').getBoundingClientRect();
    const prog = $('progress').getBoundingClientRect();
    if (narrow) {
      document.documentElement.style.setProperty('--side-h', `${Math.round(side.height)}px`);
      document.documentElement.style.setProperty('--bottom-h', `${Math.round(side.height + prog.height + 20)}px`);
    } else {
      document.documentElement.style.setProperty('--bottom-h', `${Math.round(prog.height + 14)}px`);
    }
    this.onLayout?.();
  }

  insets() {
    // Widget mode: no panels around the room, only the caption bar in the corner view.
    const mode = document.body.dataset.mode;
    if (mode === 'mini') return { left: 0, right: 0, top: 0, bottom: 46 };
    if (mode === 'pill') return { left: 0, right: 0, top: 0, bottom: 0 };
    const narrow = window.innerWidth <= 860;
    const side = $('side').getBoundingClientRect();
    const prog = $('progress').getBoundingClientRect();
    if (narrow) return { left: 0, right: 0, top: 60, bottom: window.innerHeight - Math.min(side.top, prog.top) };
    return { left: 0, right: window.innerWidth - side.left, top: 70, bottom: Math.max(0, window.innerHeight - prog.top) * 0.6 };
  }

  tick() {
    const now = clock.now();
    for (const el of document.querySelectorAll('[data-since]')) el.textContent = fmtDur(now - Number(el.dataset.since));
    for (const el of document.querySelectorAll('[data-until]')) el.textContent = fmtDur(Number(el.dataset.until) - now);
    for (const el of document.querySelectorAll('[data-ago]')) el.textContent = fmtAgo(now - Number(el.dataset.ago));
    const eta = document.querySelector('[data-eta]');
    if (eta && this.snap?.tasks?.length) eta.textContent = etaText(estimate(this.snap.tasks, now));
  }

  toast(text, { iconName = 'check', tone = '' } = {}) {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = `toast ${tone}`;
    el.innerHTML = `<span class="ti">${icon(iconName)}</span><span>${esc(text)}</span>`;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, 4200);
  }
}

function bigIcon(ic, brand) {
  if (brand) return `<span class="bigicon brand${brand.mono.length > 2 ? ' tiny' : ''}" style="background:${brand.bg};color:${brand.fg}" title="${esc(brand.name)}">${esc(brand.mono)}</span>`;
  return `<span class="bigicon">${icon(ic)}</span>`;
}

function trim(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
