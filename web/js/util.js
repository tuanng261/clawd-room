export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
/** Frame-rate independent smoothing toward a target. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export function dampAngle(a, b, lambda, dt) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
}

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small deterministic PRNG so a file always gets the same fake code on screen. */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export function fmtDur(ms) {
  if (ms == null || !Number.isFinite(ms)) return '–';
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}:${String(s % 60).padStart(2, '0')}`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
}

export function fmtAgo(ms) {
  if (ms == null || !Number.isFinite(ms)) return '';
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function fmtTokens(n) {
  if (!n) return '–';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}

/** Server-synchronised clock: transcript timestamps come from this machine, the page may lag. */
export const clock = {
  offset: 0,
  synced: false,
  now() { return Date.now() + this.offset; },
  sync(serverNow) {
    if (!serverNow) return;
    const off = serverNow - Date.now();
    this.offset = this.synced ? lerp(this.offset, off, 0.2) : off;
    this.synced = true;
  },
};

export const STATION_NAMES = {
  desk: 'at the desk', terminal: 'at the terminal', bookshelf: 'at the bookshelf', cabinet: 'at the filing cabinet',
  globe: 'at the globe', whiteboard: 'at the whiteboard', workbench: 'at the workbench', portal: 'at the helper door',
  stage: 'talking to you', armchair: 'in the thinking chair', bed: 'in bed',
};

export const STATION_COLORS = {
  bookshelf: '#6a9bcc', desk: '#d97757', terminal: '#3d3929', cabinet: '#d4a27f', globe: '#788c5d',
  whiteboard: '#c15f3c', workbench: '#b0aea5', portal: '#a8764f', stage: '#6a9bcc',
};

export const STATION_LEGEND = [
  ['bookshelf', 'Reading'], ['cabinet', 'Searching'], ['desk', 'Editing'], ['terminal', 'Commands'],
  ['globe', 'Web'], ['whiteboard', 'Planning'], ['portal', 'Helpers'], ['workbench', 'Tools'],
];

export const HAT_COLORS = ['#6a9bcc', '#788c5d', '#d4a27f', '#3d3929', '#c15f3c', '#b0aea5'];

// Tools that finish in well under a second. If one is still "running" after a
// while, Claude Code is almost certainly showing you a permission prompt.
const QUICK_TOOLS = new Set(['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'NotebookRead', 'Glob', 'Grep', 'LS',
  'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'TodoWrite', 'Skill', 'ToolSearch', 'EnterPlanMode']);

export function probablyNeedsApproval(act, session, now) {
  if (!act || act.status !== 'running' || session?.permissionMode === 'bypassPermissions') return false;
  const age = now - act.startedAt;
  if (QUICK_TOOLS.has(act.tool)) return age > 20000;
  if (act.tool === 'WebFetch' || act.tool === 'WebSearch') return age > 150000;
  return false;
}

/** Who's in the room: Codex sessions get their own mascot and name (body[data-agent], set per session). */
export const isCodex = () => typeof document !== 'undefined' && document.body?.dataset.agent === 'codex';
export const mascotName = () => (isCodex() ? 'Codex' : 'Clawd');
