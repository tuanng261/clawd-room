import { Hud } from './hud.js';
import { Zoo } from './zoo.js';
import { Room } from './room.js';
import { KIND_THEME, THEMES } from './themes.js';
import { World } from './world.js';
import { clock } from './util.js';
import { WIDGET, Widget } from './widget.js';

const world = new World(document.getElementById('stage'));
const snaps = new Map(); // sessionId → latest full snapshot
let sessions = []; // summaries for the switcher
let selected = null;
let userPicked = false;
let room = null;
let following = false;
let view = 'room'; // or 'zoo': every session at once
let zoo = null;

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

const hud = new Hud({
  onSelect: (id) => (view === 'zoo' ? openFromZoo(id) : select(id, true)),
  onCamera: camera,
  onFocus: (id) => hud.setFocus(id),
  onStyle: (style) => {
    if (!selected) return;
    store.set(`clawd.style.${selected}`, style);
    restyle();
  },
});

// Widget mode (?widget): pill / corner / full, inside the Mac app or a tab.
// The camera keeps the whole room centred and filling the view however the
// window is sized; zooming in (wheel, pinch, double-click) drifts toward Clawd.
// Each view remembers how zoomed in you left it.
const zoomKey = () => `clawd.zoom.${document.body.dataset.mode === 'mini' ? 'mini' : 'full'}`;
// Zooms saved by an earlier version could be stuck far too close: start those fresh, once.
if (store.get('clawd.zoom.v') !== '2') {
  for (const k of ['clawd.zoom.mini', 'clawd.zoom.full', 'clawd.miniZoom']) { try { localStorage.removeItem(k); } catch { /* private mode */ } }
  store.set('clawd.zoom.v', '2');
}
/** Back to the whole room, centred, in every view (the menu bar's "Reset view"). */
function resetView() {
  for (const k of ['clawd.zoom.mini', 'clawd.zoom.full']) store.set(k, '1');
  following = false;
  hud.setFollow(false);
  if (!world.autoFrame) world.setAutoFrame(subject, 1);
  world.fit(0.6);
}
const savedZoom = () => Number(store.get(zoomKey())) || 1;
const subject = (v) => (room ? room.clawdWorld(v).setY(0.85) : v.set(0, 1, 0)); // a little high so thought bubbles fit
world.onZoom = () => {
  if (world.autoFrame && !following) store.set(zoomKey(), world.autoFrame.ratio.toFixed(3));
};
world.setAutoFrame(subject, savedZoom());

/** The follow button: stick to Clawd; turning it off goes back to the framed room. */
function followCamera() {
  if (!room) return;
  world.setFollow((v) => room.clawdWorld(v));
}
function frameCamera() {
  following = false;
  hud.setFollow(false);
  world.setAutoFrame(subject, savedZoom());
}
const widget = WIDGET ? new Widget({ onMode: widgetMode, onReset: () => resetView(), onPinch: (amount, done) => world.pinchBy(amount, done), onSmartZoom: () => closeUp(), onZoo: () => (view === 'zoo' ? leaveZoo() : enterZoo()) }) : null;
world.nativePinch = document.body.classList.contains('in-app'); // the Mac app hands pinches over itself

function widgetMode(mode) {
  if (mode === 'pill' && view === 'zoo') leaveZoo(); // the pill has no 3D; the corner view can hold the whole zoo
  world.paused = mode === 'pill';
  world.maxFps = mode === 'mini' ? 30 : 0;
  world.controls.minDistance = mode === 'mini' ? 2 : 3; // zoom right up to Clawd
  world.maxRatio = mode === 'mini' ? 1 : 1.6; // the floating corner room never shrinks inside its window
  if (room) room.cards = mode === 'full';
  hud.layout();
  if (mode !== 'pill' && view === 'zoo') world.setAutoFrame(subject, 1);
  else if (mode !== 'pill') frameCamera(); // each size keeps its own zoom
}

// ── which room style to show ──────────────────────────────────

const styleChoice = (id) => store.get(`clawd.style.${id}`) || 'auto';

function detectedTheme(id) {
  const kind = snaps.get(id)?.theme?.kind || sessions.find((s) => s.id === id)?.theme?.kind;
  return KIND_THEME[kind] || 'cozy';
}

function wantedTheme(id) {
  const choice = styleChoice(id);
  return choice !== 'auto' && THEMES[choice] ? choice : detectedTheme(id);
}

function makeRoom(id, theme, from = null) {
  const summary = sessions.find((s) => s.id === id);
  const agent = snaps.get(id)?.agent || summary?.agent || 'claude'; // the snapshot is fresher (the looping demo changes agents)
  const r = new Room(world, { id, demo: !!summary?.demo, theme, agent });
  r.cards = !widget || widget.mode === 'full'; // no info cards in the small widget views
  if (from) {
    // Same session, new look: keep Clawd where he was and pop the room in.
    r.clawd.place(from.clawd.pos.x, from.clawd.pos.y, from.clawd.heading);
    r.clawd.appear = 1;
    r.clawd.drive.goal = null;
    from.dispose();
    r.transformIn();
  }
  return r;
}

/** Rebuild the room if the session's kind of work (or your choice) changed. */
function restyle() {
  if (!room || !selected) return;
  const want = wantedTheme(selected);
  if (want !== room.themeId) {
    room = makeRoom(selected, want, room);
    const snap = snaps.get(selected);
    if (snap) room.setState(snap);
    if (following) followCamera();
    const t = THEMES[want];
    hud.toast(`Room changed to the ${t.name.toLowerCase()}`, { iconName: 'sparkle', tone: 'violet' });
  }
  updateStyleHud();
}

function updateStyleHud() {
  const snap = snaps.get(selected);
  hud.setStyle({
    choice: styleChoice(selected),
    current: room?.themeId || 'cozy',
    detected: detectedTheme(selected),
    reasons: snap?.theme?.reasons || [],
    themes: THEMES,
  });
}
hud.onLayout = () => world.setInset(hud.insets());
window.addEventListener('resize', () => { hud.layout(); world.refitIfIdle(); });

/** Codex sessions: Codex's mascot, and its name wherever the page says who's working. */
function showAgent(agent = 'claude') {
  document.body.dataset.agent = agent;
  const codex = agent === 'codex';
  const head = document.querySelector('.chat-head h3');
  if (head) head.textContent = `What ${codex ? 'Codex' : 'Clawd'} is doing`;
  const sub = document.querySelector('.brand-text span');
  if (sub) sub.textContent = codex ? 'Codex · live' : 'Claude Code · live';
}

// ── choosing which session the room shows ─────────────────────

function select(id, byUser = false) {
  if (byUser) {
    userPicked = true;
    store.set('clawd.session', id);
  }
  if (id === selected && room) return;
  selected = id;
  showAgent(sessions.find((s) => s.id === id)?.agent || snaps.get(id)?.agent);
  room?.dispose();
  room = makeRoom(id, wantedTheme(id));
  hud.setSessions(sessions, selected);
  updateStyleHud();
  hud.setFocus('main');
  const snap = snaps.get(id);
  widget?.update(snap || null);
  if (snap) {
    room.setState(snap);
    hud.setSnapshot(snap);
  } else {
    hud.setSnapshot(null);
    fetch(`/api/session/${encodeURIComponent(id)}`).then((r) => r.json()).then((s) => {
      if (s?.id) onSession({ now: null, session: s });
    }).catch(() => {});
  }
  if (following) followCamera();
  else frameCamera();
}

function autoPick() {
  if (view === 'zoo') return; // the zoo shows them all; you pick by clicking an enclosure
  const current = sessions.find((s) => s.id === selected);
  if (userPicked && current) return;
  const live = sessions.filter((s) => s.live && !s.demo);
  // Keep showing a real live session; otherwise jump to whichever one is busy.
  if (current && current.live && !current.demo) return;
  const saved = store.get('clawd.session');
  const savedLive = live.find((s) => s.id === saved);
  const pick = savedLive
    || live.find((s) => s.status === 'working')
    || live.find((s) => s.status === 'thinking')
    || live[0]
    || (current ? null : sessions.find((s) => s.id === saved) || sessions.find((s) => s.demo) || sessions[0]);
  if (pick && pick.id !== selected) select(pick.id);
}

// ── live data ─────────────────────────────────────────────────

function onSessions({ now, sessions: list }) {
  clock.sync(now);
  const before = new Map(sessions.map((s) => [s.id, s]));
  sessions = list;
  for (const s of list) {
    const p = before.get(s.id);
    if (p && s.id !== selected && !s.demo && s.live && p.status !== 'idle' && s.status === 'idle') {
      hud.toast(`“${s.title}” is done and waiting for you`, { iconName: 'flag', tone: 'blue' });
    }
  }
  autoPick();
  hud.setSessions(sessions, selected);
  if (view === 'zoo') { zoo?.setSessions(sessions, snaps); widget?.setZoo(zoo.shown()); }
  // `?zoo` in the address opens straight into the zoo (the demo zoo uses it).
  if (startInZoo && sessions.length) { startInZoo = false; enterZoo(); }
}
let startInZoo = new URLSearchParams(location.search).has('zoo');

// ── the zoo: every session at once ─────────────────────────────


/** Step out of the room into the zoo, where every session is its own live enclosure. */
function enterZoo() {
  if (view === 'zoo' || document.body.dataset.mode === 'pill') return;
  view = 'zoo';
  document.body.dataset.view = 'zoo';
  world.setInset(hud.insets());
  room?.dispose();
  room = null;
  zoo = new Zoo(world, {
    makeRoom: (s, at) => {
      const r = new Room(world, { id: s.id, demo: !!s.demo, theme: wantedTheme(s.id), agent: s.agent || 'claude', at });
      r.cards = false;
      return r;
    },
  });
  zoo.setSessions(sessions, snaps);
  // Rooms we don't have the full picture of yet: ask for it.
  for (const s of sessions) if (!snaps.has(s.id)) fetch(`/api/session/${encodeURIComponent(s.id)}`).then((r) => r.json()).then((x) => { if (x?.id) onSession({ now: null, session: x }); }).catch(() => {});
  following = false;
  hud.setFollow(false);
  world.setAutoFrame(subject, 1);
  world.fit(1.0);
  updateViewBtn();
}

/** Clicked an enclosure: swoop down to it, then walk into its room. */
function openFromZoo(id) {
  const at = zoo?.penAt(id);
  if (at) world.flyTo(at, 9, 0.6);
  setTimeout(() => leaveZoo(id), at ? 550 : 0);
}

function leaveZoo(id = selected) {
  if (view !== 'zoo') return;
  view = 'room';
  document.body.dataset.view = 'room';
  world.setInset(hud.insets());
  zoo?.dispose();
  zoo = null;
  world.setFrameShape();
  const pick = id || sessions.find((s) => s.live)?.id || sessions[0]?.id;
  if (pick) { selected = null; select(pick, true); }
  updateViewBtn();
}

const viewBtn = document.getElementById('viewBtn');
function updateViewBtn() {
  if (!viewBtn) return;
  viewBtn.querySelector('b').textContent = view === 'zoo' ? 'Room' : 'Zoo';
  viewBtn.title = view === 'zoo' ? 'Back into the room' : 'See every agent at once, in the zoo';
  widget?.setZoo(view === 'zoo' ? zoo.shown() : null);
}
viewBtn?.addEventListener('click', () => (view === 'zoo' ? leaveZoo() : enterZoo()));

function onSession({ now, session }) {
  if (now) clock.sync(now);
  const prev = snaps.get(session.id);
  snaps.set(session.id, session);
  if (view === 'zoo') zoo?.update(session);
  if (session.id !== selected) return;
  notify(prev, session);
  if (room && wantedTheme(session.id) !== room.themeId) { restyle(); showAgent(session.agent); }
  else if (prev?.theme?.kind !== session.theme?.kind) updateStyleHud();
  room?.setState(session);
  hud.setSnapshot(session);
  widget?.update(session);
}

// Pop-ups only for what needs you right now; the chat already tells the rest.
function notify(prev, s) {
  if (!prev || prev.id !== s.id) return;
  const asking = (x) => x.status === 'working' && x.pending?.some((a) => a.asksUser);
  if (asking(s) && !asking(prev)) hud.toast('Claude has a question for you', { iconName: 'question', tone: 'blue' });
}

function connect() {
  const es = new EventSource('/api/stream');
  es.addEventListener('open', () => hud.setConn(true));
  es.addEventListener('error', () => hud.setConn(false));
  es.addEventListener('sessions', (e) => onSessions(JSON.parse(e.data)));
  es.addEventListener('session', (e) => onSession(JSON.parse(e.data)));
}

// ── camera + clicking on Clawds ───────────────────────────────

function camera(cmd) {
  if (cmd === 'in' || cmd === 'out') {
    world.zoom(cmd === 'in' ? 0.78 : 1.28);
    setTimeout(() => world.onZoom(), 700);
  } else if (cmd === 'fit') {
    store.set(zoomKey(), '1');
    frameCamera();
    world.fit();
  } else if (cmd === 'follow') {
    following = !following;
    hud.setFollow(following);
    if (following) followCamera();
    else frameCamera();
  }
}

// Pointer: click Clawd or a helper to pet them (and see them in the panel),
// hover furniture to see what it is, click it to poke it.
const canvas = world.renderer.domElement;
let down = null;
let moveAt = null;
let moveFrame = 0;
// Measured on screen, so dragging the floating widget around never counts as a click.
canvas.addEventListener('pointerdown', (e) => { down = [e.screenX, e.screenY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.screenX - down[0], e.screenY - down[1]) > 5) return;
  const id = world.pick(e.clientX, e.clientY);
  if (view === 'zoo') { const pen = zoo?.pick(e.clientX, e.clientY); if (pen) openFromZoo(pen); return; }
  if (id === 'main') {
    hud.setFocus('main');
    room?.petClawd();
  } else if (id?.startsWith('agent:')) {
    hud.setFocus(id.slice(6));
    room?.petHelper(id.slice(6));
  } else if (id?.startsWith('job:')) {
    room?.petWorker(id.slice(4));
  } else {
    const prop = room?.propAt(e.clientX, e.clientY);
    if (prop) room.poke(prop);
    else room?.closeCard();
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (e.buttons) { room?.hover(null); return; } // orbiting
  moveAt = [e.clientX, e.clientY];
  if (moveFrame) return;
  moveFrame = requestAnimationFrame(() => {
    moveFrame = 0;
    if (!moveAt) return;
    if (!room) { canvas.style.cursor = zoo?.pick(moveAt[0], moveAt[1]) ? 'pointer' : ''; return; }
    const who = world.pick(moveAt[0], moveAt[1]);
    const prop = who ? null : room.propAt(moveAt[0], moveAt[1]);
    room.hover(prop);
    room.hoverMascot(who);
    canvas.style.cursor = who || prop ? 'pointer' : '';
  });
});
canvas.addEventListener('pointerleave', () => { moveAt = null; room?.hover(null); room?.hoverMascot(null); canvas.style.cursor = ''; });
// Double-click the room (or double-tap with two fingers): close-up on Clawd, or back to the whole room.
function closeUp() {
  if (following || !world.autoFrame?.base) return;
  const close = world.autoFrame.ratio > 0.6;
  world.zoomToRatio(close ? 0.3 : 1);
  store.set(zoomKey(), close ? '0.3' : '1');
}
canvas.addEventListener('dblclick', closeUp);
// Escape: close a card if one is open, otherwise step out to the zoo.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (room?.carded) room.closeCard();
  else if (view === 'room') enterZoo();
});

setInterval(() => room?.tickLabels(clock.now()), 250);
hud.layout();
connect();

// Handy from the devtools console.
window.clawdRoom = { world, hud, select: (id) => select(id, true), enterZoo, leaveZoo, get zoo() { return zoo; }, get view() { return view; }, get room() { return room; }, get selected() { return selected; } };
