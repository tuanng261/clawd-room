// Room themes: names, colours, floors and the drawings shown on their screens and
// posters. Each theme's furniture and floor plan lives in rooms/layouts.js.
//   lab (code) · studio (video) · art (design) · class (study) · cozy (other)

import * as THREE from 'three';
import { hash, rng } from './util.js';

export const KIND_THEME = { code: 'lab', video: 'studio', design: 'art', study: 'class', cozy: 'cozy' };

export const THEMES = {
  cozy: { id: 'cozy', name: 'Cozy room', floor: 'wood', wall: '#f0ece2', wainscot: '#e6dccb', trim: '#d6c7ad', accessory: null, board: 'white' },
  lab: { id: 'lab', name: 'Code lab', floor: 'tiles', wall: '#eceae3', wainscot: '#dad6cb', trim: '#c4beaf', accessory: 'glasses', board: 'white' },
  studio: { id: 'studio', name: 'Video studio', floor: 'darkwood', wall: '#ebe4d8', wainscot: '#4a4536', trim: '#3d3929', accessory: 'headphones', board: 'cork' },
  art: { id: 'art', name: 'Art room', floor: 'paint', wall: '#f4efe5', wainscot: '#ebdbbc', trim: '#d4a27f', accessory: 'beret', board: 'cork' },
  class: { id: 'class', name: 'Classroom', floor: 'checker', wall: '#efebdf', wainscot: '#d4a27f', trim: '#b88760', accessory: 'gradcap', board: 'chalk' },
};

// ── floors ────────────────────────────────────────────────────

export function floorTexture(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const R = rng(7);
  if (kind === 'tiles' || kind === 'checker') {
    const a = kind === 'tiles' ? '#e4e1d8' : '#efe7d6';
    const b = kind === 'tiles' ? '#d8d4c9' : '#d9c4a5';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      g.fillStyle = (x + y) % 2 && kind === 'checker' ? b : a;
      g.fillRect(x * 16, y * 16, 16, 16);
      g.fillStyle = kind === 'tiles' ? b : 'rgba(0,0,0,0)';
      g.fillRect(x * 16, y * 16, 16, 1);
      g.fillRect(x * 16, y * 16, 1, 16);
    }
  } else {
    const dark = kind === 'darkwood';
    const tones = dark ? ['#7a5940', '#71523a', '#80604a', '#6b4d36'] : ['#e8c99c', '#e2c193', '#ecd0a6', '#ddb98a'];
    for (let y = 0; y < 64; y += 8) {
      let x = -Math.floor(R() * 24);
      while (x < 64) {
        const w = 20 + Math.floor(R() * 24);
        g.fillStyle = tones[Math.floor(R() * tones.length)];
        g.fillRect(x, y, w, 8);
        g.fillStyle = dark ? '#5c4230' : '#c99f70';
        g.fillRect(x, y, 1, 8);
        x += w;
      }
      g.fillStyle = dark ? '#5c4230' : '#c99f70';
      g.fillRect(0, y + 7, 64, 1);
    }
    if (kind === 'paint') {
      const cols = ['#d97757', '#788c5d', '#6a9bcc', '#d4a27f', '#c15f3c'];
      for (let i = 0; i < 9; i++) {
        g.fillStyle = cols[i % cols.length];
        const x = Math.floor(R() * 60);
        const y = Math.floor(R() * 60);
        g.fillRect(x, y, 2 + Math.floor(R() * 2), 2);
        g.fillRect(x + 2, y + 2, 1, 1);
      }
    }
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

const MARKER = '"Marker Felt", "Chalkboard SE", "Comic Sans MS", cursive';

// ── screens ──────────────────────────────────────────────────

export function deskScreenFor(themeId) {
  return { studio: drawTimeline, art: drawDesign, class: drawNotes }[themeId] || null;
}

export function terminalScreenFor(themeId) {
  return { studio: drawRender, art: drawPrinter }[themeId] || null;
}

export function drawTimeline(g, w, h, st, t) {
  g.fillStyle = '#1f1e1d';
  g.fillRect(0, 0, w, h);
  const ph = h * 0.52;
  // Preview frame.
  const fx = w * 0.22;
  const fw = w * 0.56;
  const sky = g.createLinearGradient(0, 8, 0, ph);
  sky.addColorStop(0, '#6a9bcc'); sky.addColorStop(1, '#ebdbbc');
  g.fillStyle = sky; g.fillRect(fx, 8, fw, ph - 12);
  const play = st.mode === 'edit' ? t : 0;
  g.fillStyle = '#d97757';
  g.beginPath(); g.arc(fx + fw * (0.3 + ((play * 0.05) % 0.5)), 8 + ph * 0.35, ph * 0.12, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#788c5d';
  g.beginPath(); g.moveTo(fx, ph - 4); g.lineTo(fx + fw * 0.35, 8 + ph * 0.5); g.lineTo(fx + fw * 0.7, ph - 4); g.fill();
  g.fillStyle = '#8a9e6b';
  g.beginPath(); g.moveTo(fx + fw * 0.4, ph - 4); g.lineTo(fx + fw * 0.75, 8 + ph * 0.6); g.lineTo(fx + fw, ph - 4); g.fill();
  g.fillStyle = '#f0eee6'; g.font = '600 12px ui-monospace, Menlo, monospace';
  const secs = Math.floor(play * 2) % 60;
  g.fillText(`00:00:${String(secs).padStart(2, '0')}:${String(Math.floor(play * 24) % 24).padStart(2, '0')}`, fx, ph + 4 + 10);
  g.fillText(st.file || 'teaser.prproj', fx + fw - 120, ph + 14);
  // Tracks.
  const ty = ph + 24;
  const rows = 4;
  const rh = (h - ty - 6) / rows;
  const R = rng(hash(st.file || 'clip'));
  const cols = ['#d97757', '#d4a27f', '#6a9bcc', '#788c5d'];
  for (let r = 0; r < rows; r++) {
    g.fillStyle = '#33312c'; g.fillRect(0, ty + r * rh, 34, rh - 3);
    g.fillStyle = '#9a968a'; g.font = '10px ui-monospace, Menlo, monospace';
    g.fillText(r < 2 ? `V${2 - r}` : `A${r - 1}`, 8, ty + r * rh + rh / 2 + 3);
    let x = 40;
    while (x < w - 10) {
      const cw = 30 + R() * 90;
      g.fillStyle = cols[(r + Math.floor(x)) % cols.length];
      if (r >= 2) {
        g.fillStyle = '#788c5d';
        for (let k = 0; k < cw - 4; k += 4) { const a = R() * (rh - 10); g.fillRect(x + k, ty + r * rh + (rh - 3) / 2 - a / 2, 2, a); }
      } else {
        g.fillRect(x, ty + r * rh + 2, cw - 4, rh - 7);
      }
      x += cw + (R() < 0.2 ? 14 : 0);
    }
  }
  const px = 40 + (((st.typed || 0) * 22) % (w - 50));
  g.fillStyle = '#ffffff';
  g.fillRect(px, ty - 6, 2, h - ty);
}

export function drawDesign(g, w, h, st, t) {
  g.fillStyle = '#e8e6dc'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#3d3929'; g.fillRect(0, 0, 30, h);
  for (let i = 0; i < 6; i++) { g.fillStyle = i === 1 ? '#d97757' : '#5e5a4c'; g.fillRect(8, 14 + i * 26, 14, 14); }
  g.fillStyle = '#faf9f5'; g.fillRect(w - 96, 0, 96, h);
  for (let i = 0; i < 6; i++) { g.fillStyle = '#d6d2c6'; g.fillRect(w - 86, 18 + i * 20, 60 - (i % 3) * 10, 8); }
  ['#d97757', '#d4a27f', '#788c5d', '#6a9bcc', '#3d3929'].forEach((c, i) => { g.fillStyle = c; g.fillRect(w - 86 + i * 15, h - 30, 12, 12); });
  const R = rng(hash(st.file || 'design'));
  const boards = [[48, 22, (w - 170) * 0.55, h - 50], [60 + (w - 170) * 0.55, 40, (w - 170) * 0.42, h * 0.55]];
  const shapes = [];
  boards.forEach(([x, y, bw, bh]) => {
    g.fillStyle = '#ffffff'; g.fillRect(x, y, bw, bh);
    g.fillStyle = '#b0aea5'; g.font = '9px ui-sans-serif, sans-serif'; g.fillText('Frame', x, y - 4);
    for (let i = 0; i < 4; i++) {
      const sx = x + 8 + R() * (bw - 50);
      const sy = y + 8 + R() * (bh - 40);
      const sw = 20 + R() * 40;
      const sh = 12 + R() * 28;
      g.fillStyle = ['#d97757', '#d4a27f', '#788c5d', '#6a9bcc', '#3d3929'][Math.floor(R() * 5)];
      if (R() < 0.35) { g.beginPath(); g.arc(sx + sw / 2, sy + sh / 2, Math.min(sw, sh) / 2, 0, Math.PI * 2); g.fill(); } else g.fillRect(sx, sy, sw, sh);
      shapes.push([sx, sy, sw, sh]);
    }
  });
  // Selection box hops between shapes while editing.
  const k = st.mode === 'edit' ? Math.floor(t * 0.8) % shapes.length : 0;
  const [sx, sy, sw, sh] = shapes[k];
  g.strokeStyle = '#6a9bcc'; g.lineWidth = 2; g.strokeRect(sx - 3, sy - 3, sw + 6, sh + 6);
  g.fillStyle = '#ffffff';
  for (const [hx, hy] of [[sx - 3, sy - 3], [sx + sw + 3, sy - 3], [sx - 3, sy + sh + 3], [sx + sw + 3, sy + sh + 3]]) {
    g.fillRect(hx - 3, hy - 3, 6, 6); g.strokeRect(hx - 3, hy - 3, 6, 6);
  }
}

export function drawNotes(g, w, h, st, t) {
  g.fillStyle = '#faf9f5'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e8e6dc'; g.fillRect(0, 0, w, 26);
  g.fillStyle = '#5e5a4c'; g.font = '600 12px ui-sans-serif, sans-serif'; g.fillText(st.file || 'notes.md', 12, 17);
  const R = rng(hash(st.file || 'notes'));
  let y = 46;
  const typed = st.mode === 'edit' ? Math.floor(st.typed || 0) : 99;
  let line = 0;
  while (y < h - 10) {
    const heading = line % 6 === 0;
    const len = heading ? 120 + R() * 80 : 160 + R() * (w - 220);
    if (line > 8 + typed) break;
    if (!heading && R() < 0.15) { g.fillStyle = '#f3e1c4'; g.fillRect(20, y - 9, len, 13); }
    g.fillStyle = heading ? '#c15f3c' : '#8a877d';
    g.fillRect(heading ? 14 : 24, y - 6, len, heading ? 9 : 5);
    if (!heading && R() < 0.2) { g.strokeStyle = '#788c5d'; g.lineWidth = 2; g.strokeRect(14, y - 8, 7, 7); }
    y += heading ? 26 : 16;
    line++;
  }
}

export function drawRender(g, w, h, st, t) {
  g.fillStyle = '#1a1714'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#f0a678'; g.font = '700 14px ui-monospace, Menlo, monospace';
  g.fillText('RENDER QUEUE', 14, 24);
  const name = (st.command || 'export teaser').replace(/\s+/g, ' ').slice(0, 26);
  const jobs = [[name, st.status === 'running' ? Math.min(0.97, (st.elapsed || 0) / 25) : st.status ? 1 : 0.0], ['proxy_clips', 1], ['thumbnail.png', 1]];
  jobs.forEach(([label, p], i) => {
    const y = 52 + i * 52;
    g.fillStyle = '#d6c7ad'; g.font = '12px ui-monospace, Menlo, monospace';
    g.fillText(label, 14, y);
    g.fillStyle = '#33312c'; g.fillRect(14, y + 8, w - 28, 12);
    g.fillStyle = p >= 1 ? '#788c5d' : '#d97757'; g.fillRect(14, y + 8, (w - 28) * p, 12);
    g.fillStyle = '#9a968a'; g.fillText(p >= 1 ? '✓ done' : `${Math.round(p * 100)}%`, w - 70, y);
  });
}

export function drawTests(g, w, h, term, t) {
  g.fillStyle = '#1f1e1d'; g.fillRect(0, 0, w, h);
  g.font = '12px ui-monospace, Menlo, monospace';
  const failed = term?.status === 'error';
  const running = term?.status === 'running';
  for (let i = 0; i < 12; i++) {
    const bad = failed && i === 7;
    g.fillStyle = bad ? '#e0675a' : running && i > 8 ? '#9a968a' : '#a9b98c';
    g.fillText(bad ? '✗' : running && i > 8 ? '…' : '✓', 10, 20 + i * 19);
    g.fillStyle = '#6b685e';
    g.fillRect(28, 12 + i * 19, 40 + ((i * 37) % 70), 6);
  }
}

export function drawBuildStatus(g, w, h, term, t) {
  const status = term?.status;
  const col = status === 'error' ? '#bf4d43' : status === 'running' ? '#d4a27f' : '#788c5d';
  g.fillStyle = '#1f1e1d'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#9a968a'; g.font = '700 16px ui-monospace, Menlo, monospace'; g.fillText('BUILD', 16, 30);
  g.fillStyle = col; g.font = '800 34px ui-monospace, Menlo, monospace';
  g.fillText(status === 'error' ? '✗ FAILING' : status === 'running' ? 'RUNNING' : '✓ PASSING', 16, 78);
  for (let i = 0; i < 14; i++) {
    const hgt = 10 + ((i * 53) % 40) + (status === 'running' && i === 13 ? Math.sin(t * 6) * 6 : 0);
    g.fillStyle = i === 13 ? col : '#5e5a4c';
    g.fillRect(16 + i * 16, h - 16 - hgt, 10, hgt);
  }
}

export function drawPreview(g, w, h, editing, t) {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#d97757'); sky.addColorStop(1, '#ebdbbc');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.fillStyle = '#3d3929';
  g.fillRect(w * 0.36, h * 0.35, w * 0.28, h * 0.65);
  g.fillStyle = '#1f1e1d';
  g.fillRect(w * 0.42, h * 0.48, w * 0.04, h * 0.12);
  g.fillRect(w * 0.54, h * 0.48, w * 0.04, h * 0.12);
  if (!editing) {
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath(); g.moveTo(w * 0.45, h * 0.3); g.lineTo(w * 0.6, h * 0.5); g.lineTo(w * 0.45, h * 0.7); g.fill();
  } else {
    g.fillStyle = '#e0675a'; g.fillRect(10, 10, 10, 10);
  }
}

export function drawPainting(g, w, h, p, seed, pal) {
  g.fillStyle = '#faf9f5'; g.fillRect(0, 0, w, h);
  const R = rng(seed);
  // Pencil sketch first, colour fills in as Clawd paints.
  g.strokeStyle = '#b0aea5'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(w * 0.68, h * 0.32, h * 0.13, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(0, h * 0.72); g.quadraticCurveTo(w * 0.35, h * 0.45, w, h * 0.7); g.stroke();
  const strokes = Math.floor(p * 60);
  for (let i = 0; i < strokes; i++) {
    const zone = i % 3;
    const x = R() * w;
    const y = zone === 0 ? R() * h * 0.5 : zone === 1 ? h * 0.6 + R() * h * 0.4 : h * 0.2 + R() * h * 0.25;
    g.fillStyle = zone === 0 ? '#6a9bcc' : zone === 1 ? '#788c5d' : pal.door;
    if (zone === 2) { g.beginPath(); g.arc(w * 0.68 + (R() - 0.5) * h * 0.2, h * 0.32 + (R() - 0.5) * h * 0.2, 6 + R() * 6, 0, Math.PI * 2); g.fill(); } else g.fillRect(x, y, 14 + R() * 18, 5 + R() * 5);
  }
}

export function drawPrint(g, w, h, i) {
  g.fillStyle = '#faf9f5'; g.fillRect(0, 0, w, h);
  const cols = ['#d97757', '#6a9bcc', '#788c5d', '#d4a27f', '#3d3929'];
  if (i === 0) { g.fillStyle = cols[0]; g.beginPath(); g.arc(w / 2, h * 0.42, w * 0.3, 0, Math.PI * 2); g.fill(); g.fillStyle = cols[4]; g.fillRect(w * 0.15, h * 0.75, w * 0.7, h * 0.06); }
  if (i === 1) { for (let k = 0; k < 4; k++) { g.fillStyle = cols[k]; g.fillRect(k * w / 4, 0, w / 4, h); } }
  if (i === 2) { g.fillStyle = cols[2]; g.fillRect(w * 0.2, h * 0.2, w * 0.6, h * 0.6); g.fillStyle = cols[3]; g.beginPath(); g.arc(w * 0.62, h * 0.4, w * 0.18, 0, Math.PI * 2); g.fill(); }
}

export function drawWorldMap(g, w, h) {
  g.fillStyle = '#9fbfdc'; g.fillRect(0, 0, w, h);
  const R = rng(5);
  const land = ['#a9b98c', '#8a9e6b', '#ebdbbc'];
  for (let i = 0; i < 14; i++) {
    g.fillStyle = land[i % 3];
    g.beginPath();
    const x = R() * w;
    const y = h * 0.15 + R() * h * 0.7;
    for (let k = 0; k < 4; k++) g.ellipse(x + R() * 24 - 12, y + R() * 14 - 7, 8 + R() * 18, 6 + R() * 10, R() * 3, 0, Math.PI * 2);
    g.fill();
  }
}

export function drawPeriodic(g, w, h) {
  g.fillStyle = '#faf9f5'; g.fillRect(0, 0, w, h);
  const cols = ['#d97757', '#d4a27f', '#788c5d', '#6a9bcc', '#ebdbbc', '#b0aea5'];
  const cw = w / 18;
  const ch = h / 8;
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 18; c++) {
      const skip = (r === 0 && c > 0 && c < 17) || (r < 3 && c > 1 && c < 12);
      if (skip) continue;
      g.fillStyle = cols[(c < 2 ? 0 : c > 11 ? 2 + (c % 2) : 1 + (r % 2))];
      g.fillRect(c * cw + 1, r * ch + h * 0.06 + 1, cw - 2, ch - 2);
    }
  }
}

// ── whiteboard doodles ───────────────────────────────────────

export function boardDoodle(g, x, y, w, h, themeId, chalk) {
  const ink = chalk ? '#f0eee6' : '#5e5a4c';
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.font = `20px ${MARKER}`;
  if (themeId === 'lab') {
    const boxes = [['UI', 0.1, 0.1], ['API', 0.55, 0.1], ['DB', 0.55, 0.62]];
    boxes.forEach(([label, bx, by]) => { g.strokeRect(x + bx * w, y + by * h, w * 0.32, h * 0.26); g.fillText(label, x + bx * w + 12, y + by * h + h * 0.17); });
    g.beginPath(); g.moveTo(x + w * 0.42, y + h * 0.23); g.lineTo(x + w * 0.55, y + h * 0.23); g.stroke();
    g.beginPath(); g.moveTo(x + w * 0.71, y + h * 0.36); g.lineTo(x + w * 0.71, y + h * 0.62); g.stroke();
  } else if (themeId === 'studio') {
    for (let i = 0; i < 3; i++) {
      const fx = x + (i % 2) * w * 0.5;
      const fy = y + Math.floor(i / 2) * h * 0.52;
      g.strokeRect(fx, fy, w * 0.44, h * 0.4);
      g.beginPath(); g.arc(fx + w * 0.3, fy + h * 0.12, 6, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(fx + 4, fy + h * 0.36); g.lineTo(fx + w * 0.18, fy + h * 0.2); g.lineTo(fx + w * 0.3, fy + h * 0.36); g.stroke();
    }
    g.fillText('scene 4?', x + w * 0.52, y + h * 0.8);
  } else if (themeId === 'art') {
    ['#d97757', '#d4a27f', '#788c5d', '#6a9bcc'].forEach((c, i) => { g.fillStyle = c; g.fillRect(x + i * w * 0.24, y, w * 0.2, h * 0.3); });
    g.fillStyle = ink; g.font = `700 46px Georgia, serif`; g.fillText('Aa', x + 4, y + h * 0.82);
    g.beginPath(); g.moveTo(x + w * 0.5, y + h * 0.7); g.bezierCurveTo(x + w * 0.65, y + h * 0.4, x + w * 0.8, y + h, x + w * 0.98, y + h * 0.6); g.stroke();
  } else if (themeId === 'class') {
    g.font = `26px ${MARKER}`;
    g.fillText('E = mc²', x + 6, y + h * 0.3);
    g.fillText('a² + b² = c²', x + 6, y + h * 0.65);
    g.beginPath(); g.moveTo(x + 6, y + h * 0.8); g.lineTo(x + w * 0.4, y + h * 0.95); g.lineTo(x + w * 0.4, y + h * 0.8); g.closePath(); g.stroke();
  }
}

// ── extra drawings for the room layouts ───────────────────────

export function drawPrinter(g, w, h, st, t) {
  g.fillStyle = '#1f1e1d'; g.fillRect(0, 0, w, h);
  const running = st.status === 'running';
  g.fillStyle = running ? '#e8a07f' : st.status === 'error' ? '#e0675a' : '#a9b98c';
  g.font = '700 18px ui-monospace, Menlo, monospace';
  g.fillText(running ? 'PRINTING' : st.status === 'error' ? 'JAMMED' : 'READY', 10, 30);
  g.fillStyle = '#33312c'; g.fillRect(10, h - 34, w - 20, 14);
  const p = running ? Math.min(0.95, (st.elapsed || 0) / 20) : st.status ? 1 : 0;
  g.fillStyle = '#d97757'; g.fillRect(10, h - 34, (w - 20) * p, 14);
}

export function drawLogs(g, w, h, ctx, t) {
  g.fillStyle = '#1f1e1d'; g.fillRect(0, 0, w, h);
  g.font = '11px ui-monospace, Menlo, monospace';
  const running = ctx.term?.status === 'running';
  for (let i = 0; i < 14; i++) {
    const k = Math.floor(t * (running ? 4 : 0.5)) + i;
    g.fillStyle = k % 7 === 0 ? '#e8a07f' : '#6b685e';
    g.fillRect(8, 10 + i * 20, 30 + ((k * 53) % 120), 7);
  }
}

export function drawNetwork(g, w, h) {
  g.fillStyle = '#1f1e1d'; g.fillRect(0, 0, w, h);
  const R = (() => { let s = 9; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const nodes = Array.from({ length: 12 }, () => [16 + R() * (w - 32), 14 + R() * (h - 28)]);
  g.strokeStyle = '#5e5a4c'; g.lineWidth = 2;
  nodes.forEach(([x, y], i) => { const [x2, y2] = nodes[(i * 5 + 3) % nodes.length]; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke(); });
  nodes.forEach(([x, y], i) => { g.fillStyle = i % 4 ? '#a9b98c' : '#d97757'; g.fillRect(x - 4, y - 4, 8, 8); });
}

export function drawFilmPoster(g, w, h) {
  g.fillStyle = '#1f1e1d'; g.fillRect(0, 0, w, h);
  const sky = g.createLinearGradient(0, 0, 0, h * 0.7);
  sky.addColorStop(0, '#c15f3c'); sky.addColorStop(1, '#ebdbbc');
  g.fillStyle = sky; g.fillRect(8, 8, w - 16, h * 0.68);
  // Clawd, pixel style, as the movie star.
  const px = Math.max(3, Math.floor(w / 26));
  const ox = w / 2 - 8.5 * px;
  const oy = h * 0.32;
  const rows = ['  ############  ', '  ##.######.##  ', '################', '  ############  ', '   # #    # #   '];
  rows.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === ' ') return;
    g.fillStyle = ch === '.' ? '#1f1e1d' : '#d97757';
    g.fillRect(ox + c * px, oy + r * px * 1.6, px, px * 1.6);
  }));
  g.fillStyle = '#ebdbbc'; g.font = `800 ${Math.round(h * 0.09)}px ui-sans-serif, sans-serif`; g.textAlign = 'center';
  g.fillText('CLAWD', w / 2, h * 0.84);
  g.fillStyle = '#b0aea5'; g.font = `${Math.round(h * 0.045)}px ui-sans-serif, sans-serif`;
  g.fillText('NOW SHIPPING', w / 2, h * 0.92);
}

export function drawBrowser(g, w, h, web, t) {
  g.fillStyle = '#faf9f5'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e8e6dc'; g.fillRect(0, 0, w, 26);
  ['#d97757', '#d4a27f', '#a9b98c'].forEach((c, i) => { g.fillStyle = c; g.fillRect(8 + i * 12, 9, 8, 8); });
  g.fillStyle = '#ffffff'; g.fillRect(52, 5, w - 64, 16);
  g.fillStyle = '#8a877d'; g.font = '11px ui-sans-serif, sans-serif';
  const url = (web?.url || web?.text || 'claude.ai').replace(/^https?:\/\//, '').slice(0, 40);
  g.fillText(url, 58, 17);
  g.fillStyle = '#3d3929'; g.fillRect(16, 40, w * 0.55, 12);
  for (let i = 0; i < 6; i++) { g.fillStyle = '#b0aea5'; g.fillRect(16, 64 + i * 16, w - 40 - ((i * 37) % 60), 6); }
  if (web?.active) { g.fillStyle = '#d97757'; g.fillRect(16, h - 18, ((t * 60) % (w - 32)), 4); }
}
