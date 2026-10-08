// Widget mode (?widget): the room as a little window in a corner of the screen
// (the Mac app in widget/ wraps it). Three sizes:
//
//   pill  one line: Clawd's face, what it's doing, a timer. No 3D at all.
//   mini  just the room, floating on the desktop, with a small label under it
//         (its buttons are on the label, and you drag the label to move it;
//         dragging the room spins it, like everywhere else).
//   full  the whole app.
//
// In the Mac app the buttons ask the window to change size (it answers by
// calling clawdWidget.setMode); in a plain browser the page just switches.

import { badgeHtml } from './brands.js';
import { FEELINGS, feelingFor } from './feelings.js';
import { icon } from './icons.js';
import { brandFor } from './items.js';
import { asDoing, simplify } from './plain.js';
import { MOODS, moodFor } from './thinking.js';
import { clock, esc, fmtAgo, fmtDur, probablyNeedsApproval, runningInBackground, stillWorking } from './util.js';

const params = new URLSearchParams(location.search);
export const WIDGET = params.has('widget');
const nativeApp = () => window.webkit?.messageHandlers?.clawd || null;

const SVG = {
  full: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6"/></svg>',
  mini: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12"/><path d="M12 14h6v4"/></svg>',
  pill: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  hide: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  zoo: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="7" height="7"/><rect x="14" y="4" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
  room: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14"/></svg>',
};

// The pill has no 3D Clawd, so its little face shows the feeling (style.css .wface.f-*).
const PILL_FACE = {
  relieved: 'happy', triumphant: 'happy', proud: 'happy', content: 'happy', loved: 'happy', joyful: 'happy', sheepish: 'happy',
  nervous: 'worry', cautious: 'worry', exhausted: 'worry', deflated: 'worry', hopeful: 'worry',
  frustrated: 'cross', impatient: 'cross', determined: 'cross',
  eager: 'wide', excited: 'wide', startled: 'wide', curious: 'wide', inspired: 'wide',
  bored: 'sleepy', tired: 'sleepy', sleepy: 'sleepy',
  focused: 'squint', thoughtful: 'squint', puzzled: 'squint', patient: 'squint', dazed: 'squint',
};

/** What Clawd is up to, in a few words, for the caption and the pill. */
export function glance(s) {
  const now = clock.now();
  return { ...glanceText(s, now), feel: feelingFor(s, now) };
}

function glanceText(s, now) {
  if (!s) return { tone: 'stale', head: 'Waiting for Claude Code…', sub: '', since: null, mark: icon('moon') };
  const act = s.pending?.length ? s.pending[s.pending.length - 1] : null;
  const tasks = s.tasks || [];
  const done = tasks.filter((t) => t.status === 'completed').length;
  const helpers = (s.agents || []).filter((a) => a.status === 'running' || a.status === 'starting').length;
  const background = runningInBackground(s);
  const sub = [
    s.project + (s.demo ? ' · demo' : ''),
    tasks.length ? `${done} of ${tasks.length} tasks` : '',
    helpers ? `${helpers} helper${helpers > 1 ? 's' : ''}` : '',
    background ? `${background} in the background` : '',
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
  if (background && !fresh) {
    const rest = [s.project + (s.demo ? ' · demo' : ''), tasks.length ? `${done} of ${tasks.length} tasks` : '', 'your turn'].filter(Boolean).join(' · ');
    return { tone: 'working', head: stillWorking(background), sub: rest, since: null, mark: icon('terminal'), progress };
  }
  return {
    tone: 'idle', head: fresh ? 'Done! Your turn' : 'Your turn',
    sub: s.turn?.endedAt ? `${sub} · finished ${fmtAgo(now - s.turn.endedAt)}` : sub,
    since: null, mark: icon(fresh ? 'check' : 'user'), progress,
  };
}

/** The zoo in a few words: how many agents are busy, and whether any of them needs you. */
function zooGlance(list) {
  const live = list.filter((s) => s.live);
  const busy = live.filter((s) => s.status === 'working' || s.status === 'thinking').length;
  const asking = live.filter((s) => s.status === 'working' && s.current?.asksUser).length;
  const sub = `Clawd’s Zoo · ${list.length} agent${list.length === 1 ? '' : 's'} · click one to walk in`;
  if (asking) return { tone: 'asking', head: `${asking} ${asking === 1 ? 'agent needs' : 'agents need'} you`, sub, since: null, mark: icon('question'), progress: null, feel: null };
  if (busy) return { tone: 'working', head: `${busy} of ${list.length} agents at work`, sub, since: null, mark: SVG.zoo, progress: null, feel: null };
  return { tone: 'idle', head: 'Every agent is resting', sub, since: null, mark: SVG.zoo, progress: null, feel: null };
}

export class Widget {
  constructor({ onMode, onReset, onPinch, onSmartZoom, onZoo }) {
    this.onMode = onMode;
    this.onZoo = onZoo;
    this.zoo = null; // the sessions in the zoo, while it's open
    this.onReset = onReset;
    this.onPinch = onPinch;
    this.onSmartZoom = onSmartZoom;
    // If WebKit ever hands the page a pinch itself, note it in the app's log (helps tell where pinches go).
    document.addEventListener('gesturestart', () => nativeApp()?.postMessage({ type: 'log', text: 'the page got a pinch (gesturestart)' }), { capture: true });
    this.snap = null;
    this.el = document.createElement('div');
    this.el.className = 'wdg';
    this.el.innerHTML = `<div class="wdg-grip" aria-hidden="true"><i></i></div>
      <div class="wdg-ctl">
        <button data-w="zoo" title="See every agent at once">${SVG.zoo}</button>
        <button data-w="full" title="Open the full view">${SVG.full}</button>
        <button data-w="mini" title="Corner view">${SVG.mini}</button>
        <button data-w="pill" title="Shrink to a pill">${SVG.pill}</button>
        <button data-w="hide" title="Hide (bring it back from the menu bar)">${SVG.hide}</button>
      </div>
      <div class="wdg-cap"><div class="wcb"></div></div>
      <div class="wdg-pill" title="Click to open the corner view"></div>
      <div class="wdg-emo" aria-hidden="true"></div>`;
    document.body.appendChild(this.el);
    document.body.classList.add('widget');
    if (nativeApp()) document.body.classList.add('in-app');
    this.ctl = this.el.querySelector('.wdg-ctl');
    this.cap = this.el.querySelector('.wdg-cap');
    this.emoEl = this.el.querySelector('.wdg-emo');
    this.feel = undefined;
    this.emoAt = 0;
    // The buttons move to the top bar in the full view, so they listen for themselves.
    this.ctl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-w]');
      if (!b) return;
      e.stopPropagation();
      if (b.dataset.w === 'zoo') this.onZoo?.();
      else this.request(b.dataset.w);
    });
    this.el.addEventListener('click', (e) => {
      if (this.mode === 'pill' && e.target.closest('.wdg-pill')) this.request('mini');
    });
    // The Mac app calls this when the window changes size (and once it has loaded).
    const self = this;
    window.clawdWidget = {
      setMode: (m) => self.apply(m),
      reset: () => self.onReset?.(),
      pinch: (amount, done) => self.onPinch?.(amount, done), // trackpad pinch, from the Mac app
      smartZoom: () => self.onSmartZoom?.(), // two-finger double tap
      get mode() { return self.mode; },
    };
    window.addEventListener('resize', () => this.reportGrip());
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
    // The buttons sit in the top bar in the full view, on the label in the corner view.
    if (mode === 'full' && bar) bar.prepend(this.ctl);
    else if (mode === 'mini') this.cap.append(this.ctl);
    else this.el.insertBefore(this.ctl, this.cap);
    // The zoo button only lives in the corner view (the full view has its own, in the top bar).
    for (const b of this.ctl.querySelectorAll('[data-w]')) b.hidden = b.dataset.w === mode || (b.dataset.w === 'hide' && !nativeApp()) || (b.dataset.w === 'zoo' && mode !== 'mini');
    this.onMode?.(mode);
    this.render();
  }

  update(s) {
    this.snap = s;
    this.render();
  }

  /** The zoo opened (with the sessions it shows), changed, or closed (null). */
  setZoo(list) {
    this.zoo = list;
    const b = this.ctl.querySelector('[data-w="zoo"]');
    b.innerHTML = list ? SVG.room : SVG.zoo;
    b.title = list ? 'Back into one room' : 'See every agent at once';
    this.render();
  }

  render() {
    const g = this.zoo ? zooGlance(this.zoo) : glance(this.snap);
    const time = g.since ? `<span class="wt" data-since="${g.since}">${fmtDur(clock.now() - g.since)}</span>` : '';
    const html = `<span class="wm">${g.mark}</span><span class="wx"><b>${esc(g.head)}</b>${g.sub ? `<small>${esc(g.sub)}</small>` : ''}</span>${time}`;
    const bar = g.progress != null ? `<i class="wbar"><b style="width:${Math.round(g.progress * 100)}%"></b></i>` : '';
    this.put('.wdg-cap .wcb', `${html}${bar}`, 'wcb');
    if (this.cap.className !== `wdg-cap ${g.tone}`) this.cap.className = `wdg-cap ${g.tone}`;
    this.put('.wdg-pill', `<span class="wface ${g.tone} f-${PILL_FACE[g.feel] || 'plain'}"><i></i><i></i></span>${html}`, `wdg-pill ${g.tone}`);
    document.body.dataset.tone = g.tone;
    this.feelPop(g.feel);
    this.reportGrip();
  }

  /** Tell the Mac app where the label is (minus its buttons): that's what you drag the floating room by. */
  reportGrip() {
    const app = nativeApp();
    if (!app || this.mode !== 'mini') return;
    const r = this.cap.getBoundingClientRect();
    const right = Math.min(r.right, this.ctl.getBoundingClientRect().left - 2);
    const box = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(Math.max(0, right - r.left)), h: Math.round(r.height) };
    const key = JSON.stringify(box);
    if (key === this.gripKey) return;
    this.gripKey = key;
    app.postMessage({ type: 'grip', ...box });
  }

  /** A new strong feeling pops its emoji over the pill's face (now and then, like Clawd's own). */
  feelPop(feel) {
    if (feel === this.feel) return;
    const first = this.feel === undefined;
    this.feel = feel;
    const F = FEELINGS[feel];
    if (first || !F?.strong || Date.now() - this.emoAt < 6000) return;
    this.emoAt = Date.now();
    this.emoEl.innerHTML = `<b>${F.emoji[Math.floor(Math.random() * F.emoji.length)]}</b>`;
  }

  put(sel, html, cls) {
    const el = this.el.querySelector(sel);
    if (el.dataset.html !== html) { el.dataset.html = html; el.innerHTML = html; }
    if (el.className !== cls) el.className = cls;
  }

  tick() {
    const now = clock.now();
    for (const el of this.el.querySelectorAll('[data-since]')) el.textContent = fmtDur(now - Number(el.dataset.since));
    if (feelingFor(this.snap, now) !== this.feel) this.render(); // feelings change with time too (impatient, bored…)
  }
}
