// Widget mode (?widget): the room as a little window in a corner of the screen
// (the Mac app in widget/ wraps it). Three sizes:
//
//   pill  one line: Clawd's face, what it's doing, a timer. No 3D at all.
//   mini  just the room, following Clawd, with a caption bar under it.
//   full  the whole app.
//
// In the Mac app the buttons ask the window to change size (it answers by
// calling clawdWidget.setMode); in a plain browser the page just switches.

import { badgeHtml } from './brands.js';
import { icon } from './icons.js';
import { brandFor } from './items.js';
import { asDoing, simplify } from './plain.js';
import { MOODS, moodFor } from './thinking.js';
import { clock, esc, fmtAgo, fmtDur, probablyNeedsApproval } from './util.js';

const params = new URLSearchParams(location.search);
export const WIDGET = params.has('widget');
const nativeApp = () => window.webkit?.messageHandlers?.clawd || null;

const SVG = {
  full: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6"/></svg>',
  mini: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12"/><path d="M12 14h6v4"/></svg>',
  pill: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  hide: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

/** What Clawd is up to, in a few words, for the caption and the pill. */
export function glance(s) {
  const now = clock.now();
  if (!s) return { tone: 'stale', head: 'Waiting for Claude Code…', sub: '', since: null, mark: icon('moon') };
  const act = s.pending?.length ? s.pending[s.pending.length - 1] : null;
  const tasks = s.tasks || [];
  const done = tasks.filter((t) => t.status === 'completed').length;
  const helpers = (s.agents || []).filter((a) => a.status === 'running' || a.status === 'starting').length;
  const sub = [
    s.project + (s.demo ? ' · demo' : ''),
    tasks.length ? `${done} of ${tasks.length} tasks` : '',
    helpers ? `${helpers} helper${helpers > 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(' · ');
  const progress = tasks.length ? done / tasks.length : null;
  if (s.status === 'stale' || (!s.live && s.status !== 'idle')) return { tone: 'stale', head: 'This session went quiet', sub, since: null, mark: icon('moon'), progress };
  if (s.status === 'working' && act && (act.asksUser || probablyNeedsApproval(act, s, now))) {
    return { tone: 'asking', head: act.asksUser ? `Needs you: ${simplify(act.label || act.text, 7)}` : 'Probably needs your OK', sub, since: act.startedAt, mark: icon('question'), progress };
  }
  if (s.status === 'working' && act) {
    const brand = brandFor(act);
    return { tone: 'working', head: simplify(asDoing(act.text), 8), sub, since: act.startedAt, mark: brand ? badgeHtml(brand) : icon(act.icon), progress };
  }
  if (s.status === 'thinking') return { tone: 'thinking', head: MOODS[moodFor(s, now)].tag, sub, since: s.statusSince, mark: icon('dots'), progress };
  const fresh = s.turn?.endedAt && now - s.turn.endedAt < 9000 && !s.turn.interrupted;
  return {
    tone: 'idle', head: fresh ? 'Done! Your turn' : 'Your turn',
    sub: s.turn?.endedAt ? `${sub} · finished ${fmtAgo(now - s.turn.endedAt)}` : sub,
    since: null, mark: icon(fresh ? 'check' : 'user'), progress,
  };
}

export class Widget {
  constructor({ onMode }) {
    this.onMode = onMode;
    this.snap = null;
    this.el = document.createElement('div');
    this.el.className = 'wdg';
    this.el.innerHTML = `<div class="wdg-grip" aria-hidden="true"><i></i></div>
      <div class="wdg-ctl">
        <button data-w="full" title="Open the full view">${SVG.full}</button>
        <button data-w="mini" title="Corner view">${SVG.mini}</button>
        <button data-w="pill" title="Shrink to a pill">${SVG.pill}</button>
        <button data-w="hide" title="Hide (bring it back from the menu bar)">${SVG.hide}</button>
      </div>
      <div class="wdg-cap"></div>
      <div class="wdg-pill" title="Click to open the corner view"></div>`;
    document.body.appendChild(this.el);
    document.body.classList.add('widget');
    if (nativeApp()) document.body.classList.add('in-app');
    this.ctl = this.el.querySelector('.wdg-ctl');
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-w]');
      if (b) this.request(b.dataset.w);
      else if (this.mode === 'pill' && e.target.closest('.wdg-pill')) this.request('mini');
    });
    // The Mac app calls this when the window changes size (and once it has loaded).
    const self = this;
    window.clawdWidget = { setMode: (m) => self.apply(m), get mode() { return self.mode; } };
    this.apply(params.get('mode') || 'mini');
    setInterval(() => this.tick(), 500);
  }

  /** Ask for a size: the Mac app resizes its window; a browser tab just switches layout. */
  request(mode) {
    const app = nativeApp();
    if (app) app.postMessage({ type: 'mode', mode });
    else if (mode !== 'hide') this.apply(mode);
  }

  apply(mode) {
    if (!['pill', 'mini', 'full'].includes(mode)) return;
    this.mode = mode;
    document.body.dataset.mode = mode;
    // In the full view the buttons sit in the top bar; otherwise in the widget itself.
    const bar = document.querySelector('.top-right');
    if (mode === 'full' && bar) bar.prepend(this.ctl);
    else this.el.insertBefore(this.ctl, this.el.querySelector('.wdg-cap'));
    for (const b of this.ctl.querySelectorAll('[data-w]')) b.hidden = b.dataset.w === mode || (b.dataset.w === 'hide' && !nativeApp());
    this.onMode?.(mode);
    this.render();
  }

  update(s) {
    this.snap = s;
    this.render();
  }

  render() {
    const g = glance(this.snap);
    const time = g.since ? `<span class="wt" data-since="${g.since}">${fmtDur(clock.now() - g.since)}</span>` : '';
    const html = `<span class="wm">${g.mark}</span><span class="wx"><b>${esc(g.head)}</b>${g.sub ? `<small>${esc(g.sub)}</small>` : ''}</span>${time}`;
    const bar = g.progress != null ? `<i class="wbar"><b style="width:${Math.round(g.progress * 100)}%"></b></i>` : '';
    this.put('.wdg-cap', `${html}${bar}`, `wdg-cap ${g.tone}`);
    this.put('.wdg-pill', `<span class="wface ${g.tone}"><i></i><i></i></span>${html}`, `wdg-pill ${g.tone}`);
    document.body.dataset.tone = g.tone;
  }

  put(sel, html, cls) {
    const el = this.el.querySelector(sel);
    if (el.dataset.html !== html) { el.dataset.html = html; el.innerHTML = html; }
    if (el.className !== cls) el.className = cls;
  }

  tick() {
    const now = clock.now();
    for (const el of this.el.querySelectorAll('[data-since]')) el.textContent = fmtDur(now - Number(el.dataset.since));
  }
}
