// Furniture, live screens and little effects for the room.
// Units: 1 ≈ one Clawd body width. The floor spans −5…5 on x and z.

import * as THREE from 'three';
import { rng, hash } from './util.js';
import { toon } from './materials.js';

// ── materials & geometry helpers ──────────────────────────────

const geoCache = new Map();
export function rbox(w, h, d) {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d); // hard edges: this is an arcade room
    geoCache.set(key, g);
  }
  return g;
}

export function mat(color, { emissive = null, ei = 1 } = {}) {
  return toon(color, { emissive, ei });
}

/** Box whose bottom sits at y. */
export function block(parent, w, h, d, color, x, y, z, o = {}) {
  const m = new THREE.Mesh(rbox(w, h, d), color instanceof THREE.Material ? color : mat(color, o));
  m.position.set(x, y + h / 2, z);
  if (o.ry) m.rotation.y = o.ry;
  m.castShadow = o.cast ?? true;
  m.receiveShadow = o.receive ?? true;
  parent.add(m);
  return m;
}

export function cyl(parent, rt, rb, h, color, x, y, z, o = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 8), color instanceof THREE.Material ? color : mat(color, o));
  m.position.set(x, y + h / 2, z);
  m.castShadow = o.cast ?? true;
  m.receiveShadow = o.receive ?? true;
  parent.add(m);
  return m;
}

// Claude palette: ivory/cream, clay orange, kraft, manilla, slate, with muted olive and dusty blue.
export const C = {
  white: '#faf9f5',
  cream: '#f0eee6',
  wall: '#f0ece2',
  wainscot: '#e6dccb',
  trim: '#d6c7ad',
  oak: '#d4a27f',
  oakDark: '#b88760',
  walnut: '#7d5a40',
  charcoal: '#3d3929',
  graphite: '#5e5a4c',
  steel: '#b0aea5',
  beige: '#ebdbbc',
  leaf: '#8a9e6b',
  leafDark: '#6e8352',
  terracotta: '#c15f3c',
  clay: '#d97757',
  sky: '#6a9bcc',
};

// Each session's room gets a slightly different (still Claude-coloured) accent set.
export const PALETTES = [
  { name: 'clay', rug: '#efcdb9', rugEdge: '#d97757', door: '#d97757', chair: '#d4a27f', book: '#d97757' },
  { name: 'kraft', rug: '#f1e3c9', rugEdge: '#d4a27f', door: '#c15f3c', chair: '#d97757', book: '#d4a27f' },
  { name: 'olive', rug: '#e3e6d2', rugEdge: '#8a9e6b', door: '#788c5d', chair: '#d97757', book: '#788c5d' },
  { name: 'slate', rug: '#e8e6dc', rugEdge: '#b0aea5', door: '#3d3929', chair: '#d97757', book: '#3d3929' },
  { name: 'dusk', rug: '#dfe6ee', rugEdge: '#6a9bcc', door: '#6a9bcc', chair: '#d4a27f', book: '#6a9bcc' },
];

// ── canvas textures ───────────────────────────────────────────

export class Screen {
  constructor(w, h, fps = 8) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
    this.step = 1 / fps;
    this.acc = Infinity;
  }
  tick(dt, draw, force = false) {
    this.acc += dt;
    if (!force && this.acc < this.step) return;
    this.acc = 0;
    draw(this.ctx, this.canvas.width, this.canvas.height);
    this.tex.needsUpdate = true;
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function plankTexture() {
  // Small canvas + nearest filtering = chunky pixel planks.
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const R = rng(7);
  const tones = ['#e8c99c', '#e2c193', '#ecd0a6', '#ddb98a'];
  for (let y = 0; y < 64; y += 8) {
    let x = -Math.floor(R() * 24);
    while (x < 64) {
      const w = 20 + Math.floor(R() * 24);
      g.fillStyle = tones[Math.floor(R() * tones.length)];
      g.fillRect(x, y, w, 8);
      g.fillStyle = 'rgba(150,100,60,0.18)';
      g.fillRect(x + 3 + Math.floor(R() * (w - 8)), y + 3, 4, 1);
      g.fillStyle = '#c99f70';
      g.fillRect(x, y, 1, 8);
      x += w;
    }
    g.fillStyle = '#c99f70';
    g.fillRect(0, y + 7, 64, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [o, col] of stops) grd.addColorStop(o, col);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let groundShadowTex;
export function groundShadow(size) {
  groundShadowTex ||= radialTexture([[0, 'rgba(61,57,41,0.22)'], [0.45, 'rgba(61,57,41,0.11)'], [1, 'rgba(61,57,41,0)']]);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: groundShadowTex, transparent: true, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

// ── the shell: floor, walls, window, clock, art ───────────────

export function buildShell(room, pal, look = {}) {
  const g = room.group;
  // Soft shadow under the floating diorama.
  const sh = groundShadow(16);
  sh.position.set(0.3, -0.75, 0.5);
  g.add(sh);

  const floorTop = toon('#ffffff', { map: look.floorMap || plankTexture() });
  const floorSide = mat('#b98d5e');
  const floor = new THREE.Mesh(rbox(8.6, 0.36, 8.6, 0.04), [floorSide, floorSide, floorTop, floorSide, floorSide, floorSide]);
  floor.position.set(-0.05, -0.18, -0.05);
  floor.receiveShadow = true;
  g.add(floor);
  const base = block(g, 8.3, 0.16, 8.3, '#b99468', -0.05, -0.5, -0.05, { r: 0.05, cast: false });
  base.receiveShadow = false;

  const wallMat = mat(look.wall || C.wall);
  const wainscot = look.wainscot || C.wainscot;
  const trim = look.trim || C.trim;
  // Back wall (along x, at the far z) and left wall (along z, at the far x),
  // kept in lists so the room can fade whichever one is between you and the inside.
  const back = [
    block(g, 8.6, 3.1, 0.3, wallMat, -0.05, 0, -4.2, { r: 0.03 }),
    block(g, 8.3, 0.95, 0.04, wainscot, 0.1, 0, -4.03, { cast: false }),
    block(g, 8.3, 0.07, 0.08, trim, 0.1, 0.95, -4.02, { cast: false }),
    block(g, 8.3, 0.12, 0.06, trim, 0.1, 0, -4.01, { cast: false }),
  ];
  const left = [
    block(g, 0.3, 3.1, 8.3, wallMat, -4.2, 0, 0.1, { r: 0.03 }),
    block(g, 0.04, 0.95, 8.3, wainscot, -4.03, 0, 0.1, { cast: false }),
    block(g, 0.08, 0.07, 8.3, trim, -4.02, 0.95, 0.1, { cast: false }),
    block(g, 0.06, 0.12, 8.3, trim, -4.01, 0, 0.1, { cast: false }),
  ];
  return { walls: { back, left }, parts: [sh, floor, base, ...back, ...left] };
}

export function drawArt(g, w, h, pal) {
  g.fillStyle = '#fbf6ee';
  g.fillRect(0, 0, w, h);
  g.save();
  g.translate(w / 2, h / 2 + 4);
  g.fillStyle = pal.door;
  for (let i = 0; i < 12; i++) {
    g.rotate(Math.PI / 6);
    g.beginPath();
    g.ellipse(0, -34, 9, 34, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  g.fillStyle = pal.rug;
  g.beginPath();
  g.arc(w / 2, h / 2 + 4, 14, 0, Math.PI * 2);
  g.fill();
}

export function drawSky(g, w, h, d) {
  const hr = d.getHours() + d.getMinutes() / 60;
  const night = hr < 6 || hr >= 20.5;
  const dusk = (hr >= 18 && hr < 20.5) || (hr >= 6 && hr < 7.5);
  const grd = g.createLinearGradient(0, 0, 0, h);
  if (night) { grd.addColorStop(0, '#1b2346'); grd.addColorStop(1, '#3b4a7e'); }
  else if (dusk) { grd.addColorStop(0, '#f6a77c'); grd.addColorStop(1, '#ffe2bd'); }
  else { grd.addColorStop(0, '#8fc6fb'); grd.addColorStop(1, '#dff0ff'); }
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  const R = rng(3);
  if (night) {
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(255,255,255,${0.4 + R() * 0.6})`;
      g.fillRect(R() * w, R() * h * 0.8, 1.6, 1.6);
    }
    g.fillStyle = '#f4f1dc';
    g.beginPath(); g.arc(w * 0.75, h * 0.28, 16, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#26305a';
    g.beginPath(); g.arc(w * 0.75 + 7, h * 0.28 - 4, 14, 0, Math.PI * 2); g.fill();
  } else {
    g.fillStyle = dusk ? '#fff3c8' : '#fff7d6';
    g.beginPath(); g.arc(w * 0.78, h * (dusk ? 0.62 : 0.26), 18, 0, Math.PI * 2); g.fill();
    const drift = ((d.getMinutes() * 60 + d.getSeconds()) / 3600) * w;
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (const [cx, cy, s] of [[0.2, 0.35, 1], [0.55, 0.55, 0.8], [0.9, 0.42, 0.9]]) {
      const x = ((cx * w + drift) % (w + 80)) - 40;
      const y = cy * h;
      g.beginPath();
      g.ellipse(x, y, 30 * s, 11 * s, 0, 0, Math.PI * 2);
      g.ellipse(x + 14 * s, y - 8 * s, 18 * s, 12 * s, 0, 0, Math.PI * 2);
      g.ellipse(x - 14 * s, y - 4 * s, 14 * s, 9 * s, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  // distant skyline
  g.fillStyle = night ? 'rgba(20,24,48,0.75)' : 'rgba(150,170,200,0.45)';
  let x = 0;
  const S = rng(11);
  while (x < w) {
    const bw = 18 + S() * 26;
    const bh = 18 + S() * 40;
    g.fillRect(x, h - bh, bw - 3, bh);
    x += bw;
  }
}

// ── screens ──────────────────────────────────────────────────

const CODE_COLORS = ['#d97757', '#d4a27f', '#ebdbbc', '#9fb6d6', '#a9b98c', '#f0eee6', '#e8a07f', '#b0aea5'];

export function drawEditor(g, w, h, st, t) {
  g.fillStyle = '#262624';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#1f1e1d';
  g.fillRect(0, 0, w, 30);
  const name = st.file || 'untitled';
  g.font = '600 13px ui-monospace, Menlo, monospace';
  const tw = Math.min(260, g.measureText(name).width + 36);
  g.fillStyle = '#262624';
  g.fillRect(8, 4, tw, 26);
  g.fillStyle = '#d97757';
  g.beginPath(); g.arc(20, 17, 4, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e8e6e3';
  g.fillText(name.length > 30 ? name.slice(0, 29) + '…' : name, 30, 21);
  const R = rng(hash(name));
  const lineH = 17;
  const visible = Math.floor((h - 30 - 24) / lineH);
  const total = 18 + Math.floor(R() * 40);
  const lines = [];
  let indent = 0;
  for (let i = 0; i < total + 60; i++) {
    const roll = R();
    if (roll < 0.12 && indent < 4) indent++;
    else if (roll < 0.24 && indent > 0) indent--;
    const toks = [];
    const n = roll > 0.93 ? 0 : 1 + Math.floor(R() * 4);
    for (let k = 0; k < n; k++) toks.push([18 + R() * 70, CODE_COLORS[Math.floor(R() * CODE_COLORS.length)]]);
    lines.push({ indent, toks });
  }
  const typing = st.mode === 'edit';
  const typed = typing ? Math.floor(st.typed) : 0;
  const cur = Math.min(lines.length - 1, total + typed);
  const first = Math.max(0, cur - visible + 3);
  for (let i = 0; i < visible; i++) {
    const li = first + i;
    if (li > cur) break;
    const y = 30 + 12 + i * lineH;
    if (li === cur && typing) {
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(0, y - 2, w, lineH);
    }
    g.fillStyle = '#6b685e';
    g.font = '11px ui-monospace, Menlo, monospace';
    g.fillText(String(li + 1).padStart(3, ' '), 6, y + 10);
    let x = 44 + lines[li].indent * 18;
    const toks = lines[li].toks;
    const partial = li === cur && typing ? (st.typed % 1) : 1;
    const cutoff = toks.reduce((a, [tw2]) => a + tw2 + 8, 0) * partial;
    let used = 0;
    for (const [tw2, col] of toks) {
      const ww = Math.min(tw2, cutoff - used);
      if (ww <= 0) break;
      g.fillStyle = col;
      roundRect(g, x, y + 3, ww, 8, 3);
      g.fill();
      x += tw2 + 8;
      used += tw2 + 8;
    }
    if (li === cur && typing && Math.sin(t * 9) > -0.2) {
      g.fillStyle = '#f5f5f5';
      g.fillRect(44 + lines[li].indent * 18 + cutoff, y, 2, 13);
    }
  }
  g.fillStyle = typing ? '#d97757' : '#33312c';
  g.fillRect(0, h - 22, w, 22);
  g.fillStyle = typing ? '#fff' : '#9a968a';
  g.font = '600 11px ui-sans-serif, -apple-system, sans-serif';
  g.fillText(typing ? `✎ ${st.verb || 'Editing'}  ·  Ln ${cur + 1}` : `Ln ${cur + 1}  ·  saved`, 10, h - 7);
}

const MARKER_FONT = '"Marker Felt", "Chalkboard SE", "Comic Sans MS", "Segoe Print", cursive';

/** Corkboard: tasks as pinned index cards (studio storyboard, art moodboard). */
function drawCork(g, w, h, tasks, t, look) {
  g.fillStyle = '#c99a6b';
  g.fillRect(0, 0, w, h);
  const R = rng(17);
  for (let i = 0; i < 260; i++) { g.fillStyle = R() < 0.5 ? 'rgba(120,80,40,0.25)' : 'rgba(255,240,210,0.18)'; g.fillRect(R() * w, R() * h, 3, 3); }
  const doodleW = look.doodle ? w * 0.4 : 0;
  if (look.doodle) look.doodle(g, w - doodleW, 30, doodleW - 24, h - 60, false);
  const cards = tasks.length ? tasks.slice(0, 6) : [{ subject: 'no task list yet', status: 'pending' }];
  const cols = 2;
  const cw = (w - doodleW - 48) / cols;
  cards.forEach((task, i) => {
    const x = 20 + (i % cols) * (cw + 8);
    const y = 22 + Math.floor(i / cols) * 92;
    g.save();
    g.translate(x + cw / 2, y + 40);
    g.rotate(((i * 7) % 5 - 2) * 0.02);
    g.fillStyle = task.status === 'completed' ? '#e5eadb' : task.status === 'in_progress' ? '#fbe8df' : '#faf9f5';
    g.fillRect(-cw / 2, -38, cw, 76);
    g.fillStyle = task.status === 'in_progress' ? '#d97757' : task.status === 'completed' ? '#788c5d' : '#b0aea5';
    g.fillRect(-cw / 2, -38, cw, 8);
    g.fillStyle = '#3d3929';
    g.font = `20px ${MARKER_FONT}`;
    let text = task.status === 'in_progress' && task.activeForm ? task.activeForm : task.subject;
    while (g.measureText(text).width > cw - 20 && text.length > 4) text = text.slice(0, -2);
    g.fillText(text, -cw / 2 + 10, 0);
    if (task.status === 'completed') { g.fillStyle = '#788c5d'; g.font = `700 24px ${MARKER_FONT}`; g.fillText('✓', cw / 2 - 30, 28); }
    g.fillStyle = '#c15f3c';
    g.beginPath(); g.arc(0, -40, 6, 0, Math.PI * 2); g.fill();
    g.restore();
  });
}

export function drawBoard(g, w, h, tasks, t, look = {}) {
  if (look.style === 'cork') return drawCork(g, w, h, tasks, t, look);
  const chalk = look.style === 'chalk' || !!look.chalk;
  const ink = chalk ? '#f0eee6' : '#3d3929';
  const dim = chalk ? 'rgba(240,238,230,0.5)' : '#b0aea5';
  g.fillStyle = chalk ? '#35403a' : '#fcfcfa';
  g.fillRect(0, 0, w, h);
  g.fillStyle = chalk ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
  g.fillRect(0, h - 10, w, 10);
  g.fillStyle = chalk ? '#e8a07f' : '#c15f3c';
  g.font = `700 30px ${MARKER_FONT}`;
  g.fillText(chalk ? "Today's lesson" : 'The plan', 26, 46);
  // Themed rooms doodle on the right third of the board.
  const doodleW = look.doodle ? w * 0.36 : 0;
  if (look.doodle) look.doodle(g, w - doodleW - 10, 70, doodleW - 10, h - 100, chalk);
  if (!tasks.length) {
    g.fillStyle = dim;
    g.font = `24px ${MARKER_FONT}`;
    g.fillText('(no task list yet)', 26, 104);
    if (look.doodle) return;
    g.strokeStyle = '#d97757';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const x = 330 + i * 40;
      g.moveTo(x, 210 + Math.sin(i) * 10);
      g.lineTo(x + 26, 200 + Math.cos(i * 2) * 14);
    }
    g.stroke();
    return;
  }
  const done = tasks.filter((x) => x.status === 'completed').length;
  g.fillStyle = chalk ? '#a9b98c' : '#788c5d';
  g.font = `700 24px ${MARKER_FONT}`;
  const label = `${done}/${tasks.length} done`;
  g.fillText(label, w - g.measureText(label).width - 26, 44);
  const textW = w - 110 - doodleW;
  // Keep the active task in view.
  const active = Math.max(0, tasks.findIndex((x) => x.status === 'in_progress'));
  const rows = 6;
  const start = Math.max(0, Math.min(active - 2, tasks.length - rows));
  g.lineCap = 'round';
  g.lineJoin = 'round';
  tasks.slice(start, start + rows).forEach((task, i) => {
    const y = 84 + i * 40;
    const st = task.status;
    g.lineWidth = 3;
    g.strokeStyle = st === 'in_progress' ? '#d97757' : chalk ? dim : '#5e5a4c';
    g.strokeRect(28, y - 18, 22, 22);
    if (st === 'completed') {
      g.strokeStyle = '#788c5d';
      g.lineWidth = 4.5;
      g.beginPath(); g.moveTo(31, y - 7); g.lineTo(38, y + 1); g.lineTo(54, y - 22); g.stroke();
    }
    let text = st === 'in_progress' && task.activeForm ? task.activeForm : task.subject;
    g.font = `${st === 'in_progress' ? 700 : 400} 22px ${MARKER_FONT}`;
    while (g.measureText(text).width > textW && text.length > 4) text = text.slice(0, -2);
    if (text !== (st === 'in_progress' && task.activeForm ? task.activeForm : task.subject)) text += '…';
    g.fillStyle = st === 'completed' ? dim : st === 'in_progress' ? (chalk ? '#e8a07f' : '#c15f3c') : ink;
    g.fillText(text, 64, y);
    if (st === 'completed') {
      g.strokeStyle = 'rgba(94,90,76,0.6)';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(62, y - 7); g.lineTo(66 + g.measureText(text).width, y - 9); g.stroke();
    }
    if (st === 'in_progress') {
      const bounce = Math.sin(t * 5) * 3;
      g.fillStyle = '#d97757';
      g.beginPath(); g.moveTo(12 + bounce, y - 14); g.lineTo(22 + bounce, y - 7); g.lineTo(12 + bounce, y); g.fill();
    }
  });
  if (tasks.length > rows) {
    g.fillStyle = '#9aa0ab';
    g.font = `18px ${MARKER_FONT}`;
    g.fillText(`+${tasks.length - rows} more`, w - 120, h - 22);
  }
}

export function drawTerminal(g, w, h, st, t) {
  g.fillStyle = '#1a1714';
  g.fillRect(0, 0, w, h);
  g.font = '600 14px ui-monospace, Menlo, monospace';
  const green = '#f0a678';
  const lines = [];
  const cmd = st.command || '';
  const wrap = (text, n) => {
    const out = [];
    for (let i = 0; i < text.length && out.length < 4; i += n) out.push(text.slice(i, i + n));
    return out;
  };
  wrap(`$ ${cmd}`, 33).forEach((l) => lines.push([l, green]));
  const R = rng(hash(cmd));
  if (st.status === 'running') {
    const n = Math.min(7, Math.floor(st.elapsed * 2.2));
    for (let i = 0; i < n; i++) lines.push(['▪'.repeat(3 + Math.floor(R() * 22)), 'rgba(240,166,120,0.45)']);
  } else if (st.status) {
    for (let i = 0; i < 3; i++) lines.push(['▪'.repeat(3 + Math.floor(R() * 22)), 'rgba(240,166,120,0.35)']);
    if (st.status === 'error') lines.push(['✗ failed', '#e0675a']);
    else lines.push(['✓ done', green]);
    lines.push(['$ ', green]);
  } else {
    lines.push(['$ ', green]);
  }
  const visible = lines.slice(-12);
  visible.forEach(([text, col], i) => {
    g.fillStyle = col;
    g.fillText(text, 14, 30 + i * 19);
  });
  if (Math.sin(t * 6) > 0) {
    const last = visible[visible.length - 1];
    g.fillStyle = green;
    g.fillRect(14 + g.measureText(last[0]).width + 2, 30 + (visible.length - 1) * 19 - 13, 9, 16);
  }
  // CRT scanlines + vignette.
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  const vg = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.85);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);
}

// ── effects ───────────────────────────────────────────────────

/** WareTrack-style corner brackets around whatever is active. */
export class Highlight {
  constructor(color = '#d97757') {
    this.group = new THREE.Group();
    this.mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    this.edgeMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0 });
    const unit = new THREE.BoxGeometry(1, 1, 1);
    this.bars = [];
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(unit, this.mat);
      m.renderOrder = 3;
      this.group.add(m);
      this.bars.push(m);
    }
    this.edges = new THREE.LineSegments(new THREE.EdgesGeometry(unit), this.edgeMat);
    this.group.add(this.edges);
    this.target = 0;
    this.opacity = 0;
    this.group.visible = false;
  }
  set(box) {
    if (!box) { this.target = 0; return; }
    const min = box.min;
    const max = box.max;
    const size = new THREE.Vector3().subVectors(max, min);
    this.edges.position.copy(min).addScaledVector(size, 0.5);
    this.edges.scale.copy(size);
    const L = Math.min(0.32, size.x * 0.3, size.y * 0.3, size.z * 0.3);
    const T = 0.035;
    let i = 0;
    for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
      const sx = x === min.x ? 1 : -1;
      const sy = y === min.y ? 1 : -1;
      const sz = z === min.z ? 1 : -1;
      const parts = [[L, T, T, x + sx * L / 2, y, z], [T, L, T, x, y + sy * L / 2, z], [T, T, L, x, y, z + sz * L / 2]];
      for (const [w, h, d, px, py, pz] of parts) {
        const b = this.bars[i++];
        b.scale.set(w, h, d);
        b.position.set(px, py, pz);
      }
    }
    this.target = 1;
    this.group.visible = true;
  }
  update(dt, t) {
    this.opacity += (this.target - this.opacity) * Math.min(1, dt * 6);
    this.mat.opacity = this.opacity * (0.75 + Math.sin(t * 4) * 0.2);
    this.edgeMat.opacity = this.opacity * 0.28;
    this.group.visible = this.opacity > 0.01;
  }
}

/** Animated dashed route on the floor, like the delivery routes in the video. */
export class Trail {
  constructor(color = '#d97757') {
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 }, uProgress: { value: 0 }, uLen: { value: 1 },
        uOpacity: { value: 0 }, uColor: { value: new THREE.Color(color) },
      },
      vertexShader: `
        attribute float aDist; attribute float aSide;
        varying float vDist; varying float vSide;
        void main() { vDist = aDist; vSide = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uTime, uProgress, uLen, uOpacity; uniform vec3 uColor;
        varying float vDist; varying float vSide;
        void main() {
          if (vDist < uProgress) discard;
          float d = fract((vDist - uTime * 1.6) / 0.36);
          float dash = smoothstep(0.0, 0.08, d) * (1.0 - smoothstep(0.48, 0.56, d));
          float edge = 1.0 - smoothstep(0.55, 1.0, abs(vSide));
          float head = smoothstep(uProgress, uProgress + 0.5, vDist);
          gl_FragColor = vec4(uColor, dash * edge * head * uOpacity);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.26, 0.34, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 2;
    this.target = 0;
  }
  set(points) {
    const W = 0.13;
    const pos = [];
    const dist = [];
    const side = [];
    const idx = [];
    let acc = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const a = points[Math.max(0, i - 1)];
      const b = points[Math.min(points.length - 1, i + 1)];
      const dx = b.x - a.x;
      const dz = b.y - a.y;
      const l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l;
      const nz = dx / l;
      if (i > 0) acc += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y);
      pos.push(p.x + nx * W, 0.035, p.y + nz * W, p.x - nx * W, 0.035, p.y - nz * W);
      dist.push(acc, acc);
      side.push(1, -1);
      if (i > 0) {
        const k = i * 2;
        idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 1));
    geo.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
    geo.setIndex(idx);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
    this.mat.uniforms.uLen.value = acc;
    this.mat.uniforms.uProgress.value = 0;
    const end = points[points.length - 1];
    this.ring.position.set(end.x, 0.04, end.y);
    this.target = points.length > 1 && acc > 0.6 ? 1 : 0;
  }
  hide() { this.target = 0; }
  update(dt, t, progress) {
    const u = this.mat.uniforms;
    u.uTime.value = t;
    u.uProgress.value = progress;
    u.uOpacity.value += (this.target * 0.85 - u.uOpacity.value) * Math.min(1, dt * 5);
    const pulse = (t * 1.2) % 1;
    this.ring.scale.setScalar(0.7 + pulse * 0.6);
    this.ring.material.opacity = u.uOpacity.value * (1 - pulse);
  }
}

/** Confetti for finished tasks and finished turns. */
export class Confetti {
  constructor(count = 70) {
    this.count = count;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 0.015), new THREE.MeshBasicMaterial({ toneMapped: false }), count);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.parts = [];
    this.dummy = new THREE.Object3D();
    const cols = ['#d97757', '#c15f3c', '#d4a27f', '#ebdbbc', '#788c5d', '#6a9bcc', '#faf9f5'];
    for (let i = 0; i < count; i++) this.mesh.setColorAt(i, new THREE.Color(cols[i % cols.length]));
  }
  burst(x, y, z, n = 40, power = 1) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= this.count) this.parts.shift();
      const a = Math.random() * Math.PI * 2;
      const s = (0.8 + Math.random() * 1.6) * power;
      this.parts.push({
        p: new THREE.Vector3(x, y, z),
        v: new THREE.Vector3(Math.cos(a) * s, (2.6 + Math.random() * 2.2) * power, Math.sin(a) * s),
        r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        life: 1.6 + Math.random() * 0.8,
      });
    }
  }
  update(dt) {
    const d = this.dummy;
    this.parts = this.parts.filter((p) => (p.life -= dt) > 0);
    this.parts.forEach((p, i) => {
      p.v.y -= 7 * dt;
      p.v.multiplyScalar(1 - dt * 1.2);
      p.p.addScaledVector(p.v, dt);
      if (p.p.y < 0.02) { p.p.y = 0.02; p.v.set(0, 0, 0); }
      d.position.copy(p.p);
      d.rotation.set(p.r.x * p.life * 3, p.r.y * p.life * 3, p.r.z);
      d.scale.setScalar(Math.min(1, p.life * 2));
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    });
    this.mesh.count = this.parts.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Soft spotlight disc on the floor when Clawd talks to you. */
export function spotlight() {
  const tex = radialTexture([[0, 'rgba(255,248,225,0.95)'], [0.55, 'rgba(255,240,205,0.45)'], [1, 'rgba(255,240,205,0)']]);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, toneMapped: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}
