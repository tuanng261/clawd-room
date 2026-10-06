// The furniture kit. Every piece is built around its own floor centre with its
// front facing +z, so a layout can drop it anywhere and turn it to face the room.
// Wall pieces (windows, posters, boards…) are centred on their face instead.

import * as THREE from 'three';
import { block, C, cyl, drawArt, drawSky, mat, rbox, Screen } from '../props.js';
import { glow, toon } from '../materials.js';
import { rng } from '../util.js';

const group = () => new THREE.Group();

/** Build something whose front faces +x, then turn it so the front faces +z. */
function turned(build) {
  const outer = group();
  const inner = group();
  inner.rotation.y = -Math.PI / 2;
  outer.add(inner);
  return { group: outer, ...(build(inner) || {}) };
}

function leaf(parent, size, color, x, y, z, sx = 0.7, sy = 1.5, sz = 0.7, rx = 0, rz = 0) {
  const m = new THREE.Mesh(rbox(size, size, size), mat(color));
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.rotation.set(rx, 0, rz);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function screenPlane(parent, scr, w, h, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), scr.mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  parent.add(m);
  return m;
}

function monitor(parent, x, y, z, w, h, scr, { ry = 0, stand = 0.26 } = {}) {
  const m = group();
  m.position.set(x, y, z);
  m.rotation.y = ry;
  parent.add(m);
  block(m, Math.min(0.34, w * 0.4), 0.03, 0.2, C.charcoal, 0, 0, 0);
  block(m, 0.06, stand, 0.05, C.charcoal, 0, 0.02, -0.04);
  block(m, w, h, 0.05, C.charcoal, 0, stand - 0.04, 0);
  if (scr) screenPlane(m, scr, w - 0.08, h - 0.08, 0, stand - 0.04 + h / 2, 0.027);
  return m;
}

export function officeChair(color = C.charcoal) {
  const g = group();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const l = block(g, 0.05, 0.04, 0.32, C.graphite, Math.sin(a) * 0.14, 0.02, Math.cos(a) * 0.14);
    l.rotation.y = a;
  }
  block(g, 0.06, 0.3, 0.06, C.graphite, 0, 0.04, 0);
  cyl(g, 0.28, 0.28, 0.07, color, 0, 0.3, 0);
  block(g, 0.5, 0.42, 0.07, color, 0, 0.45, 0.27);
  return { group: g };
}

export function stool(color = C.oak, h = 0.45) {
  const g = group();
  cyl(g, 0.24, 0.24, 0.06, color, 0, h - 0.06, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = block(g, 0.04, h - 0.06, 0.04, C.charcoal, Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15);
    leg.rotation.set(Math.sin(a) * 0.1, 0, -Math.cos(a) * 0.1);
  }
  block(g, 0.3, 0.03, 0.03, C.charcoal, 0, h * 0.35, 0);
  return { group: g };
}

// ── plants & soft things ─────────────────────────────────────

export function plant(kind = 'big') {
  const g = group();
  const R = rng(kind.length * 7 + 3);
  if (kind === 'big') {
    cyl(g, 0.36, 0.28, 0.55, C.terracotta, 0, 0, 0);
    cyl(g, 0.33, 0.33, 0.03, '#6b4a33', 0, 0.53, 0);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + R() * 0.3;
      const lean = 0.35 + R() * 0.45;
      const len = 0.7 + R() * 0.5;
      const stem = group();
      stem.position.set(0, 0.55, 0);
      stem.rotation.set(Math.sin(a) * lean, 0, -Math.cos(a) * lean);
      g.add(stem);
      leaf(stem, 0.272, i % 3 ? C.leaf : C.leafDark, 0, len, 0, 0.75, 1.9, 0.32);
      block(stem, 0.03, len, 0.03, C.leafDark, 0, 0, 0, { cast: false });
    }
  } else if (kind === 'tall') {
    cyl(g, 0.22, 0.2, 0.42, C.white, 0, 0, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const l = block(g, 0.07, 0.75 + R() * 0.45, 0.14, i % 2 ? C.leaf : C.leafDark, Math.cos(a) * 0.08, 0.4, Math.sin(a) * 0.08);
      l.rotation.set(Math.sin(a) * 0.15, a, -Math.cos(a) * 0.15);
    }
  } else {
    cyl(g, 0.2, 0.16, 0.34, C.white, 0, 0, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      leaf(g, 0.176, i % 2 ? C.leaf : C.leafDark, Math.cos(a) * 0.08, 0.58, Math.sin(a) * 0.08, 0.6, 1.6, 0.6, Math.sin(a) * 0.5, -Math.cos(a) * 0.5);
    }
  }
  return { group: g };
}

export function rug(w, d, edge, inner, { round = 0.5 } = {}) {
  const shape = new THREE.Shape();
  const r = Math.min(round, w / 2, d / 2);
  shape.moveTo(-w / 2 + r, -d / 2);
  shape.lineTo(w / 2 - r, -d / 2);
  shape.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
  shape.lineTo(w / 2, d / 2 - r);
  shape.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
  shape.lineTo(-w / 2 + r, d / 2);
  shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
  shape.lineTo(-w / 2, -d / 2 + r);
  shape.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const g = group();
  const outer = new THREE.Mesh(geo, mat(edge));
  outer.position.y = 0.002;
  outer.receiveShadow = true;
  g.add(outer);
  if (inner) {
    const m = new THREE.Mesh(geo, mat(inner));
    m.scale.set(0.86, 1.2, 0.82);
    m.position.y = 0.006;
    m.receiveShadow = true;
    g.add(m);
  }
  return { group: g };
}

// ── wall pieces (centred on their face) ──────────────────────

export function wallWindow(w = 1.9, h = 1.15, { sill = true } = {}) {
  const g = group();
  const sky = new Screen(256, Math.round(256 * (h / w)), 0.2);
  screenPlane(g, sky, w - 0.2, h - 0.1, 0, 0, 0.01);
  for (const [bw, bh, x, y] of [[w, 0.1, 0, -h / 2], [w, 0.1, 0, h / 2 - 0.05], [0.1, h, -w / 2 + 0.05, -h / 2], [0.1, h, w / 2 - 0.05, -h / 2], [0.05, h - 0.1, 0, -h / 2 + 0.05], [w - 0.15, 0.05, 0, -0.02]]) {
    block(g, bw, bh, 0.1, C.white, x, y, 0.04, { cast: false });
  }
  if (sill) block(g, w + 0.15, 0.06, 0.24, C.white, 0, -h / 2 - 0.03, 0.1);
  return { group: g, tick: (dt) => sky.tick(dt, (c, cw, ch) => drawSky(c, cw, ch, new Date())) };
}

export function wallClock() {
  const g = group();
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 16), mat(C.white));
  face.rotation.x = Math.PI / 2;
  face.position.z = 0.03;
  g.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.04, 4, 16), mat(C.charcoal));
  rim.position.z = 0.05;
  g.add(rim);
  for (let i = 0; i < 12; i++) {
    const tick = new THREE.Mesh(rbox(0.02, i % 3 ? 0.04 : 0.07, 0.01), mat(C.charcoal));
    const a = (i / 12) * Math.PI * 2;
    tick.position.set(Math.sin(a) * 0.27, Math.cos(a) * 0.27, 0.065);
    tick.rotation.z = -a;
    g.add(tick);
  }
  const hand = (len, w, color, z) => {
    const pivot = group();
    const m = new THREE.Mesh(rbox(w, len, 0.012), mat(color));
    m.position.y = len / 2 - 0.03;
    pivot.add(m);
    pivot.position.z = z;
    g.add(pivot);
    return pivot;
  };
  const hh = hand(0.17, 0.035, C.charcoal, 0.07);
  const mh = hand(0.25, 0.025, C.charcoal, 0.075);
  const sh = hand(0.27, 0.01, C.clay, 0.08);
  return {
    group: g,
    tick() {
      const d = new Date();
      const s = d.getSeconds() + d.getMilliseconds() / 1000;
      const m = d.getMinutes() + s / 60;
      sh.rotation.z = -(s / 60) * Math.PI * 2;
      mh.rotation.z = -(m / 60) * Math.PI * 2;
      hh.rotation.z = -((d.getHours() % 12 + m / 60) / 12) * Math.PI * 2;
    },
  };
}

export function poster(w, h, draw, { frame = C.oakDark, px = 160 } = {}) {
  const g = group();
  const scr = new Screen(Math.round(px * (w / h)), px, 0.01);
  draw(scr.ctx, scr.canvas.width, scr.canvas.height);
  scr.tex.needsUpdate = true;
  if (frame) block(g, w + 0.1, h + 0.1, 0.05, frame, 0, -(h + 0.1) / 2, 0, { cast: false });
  screenPlane(g, scr, w, h, 0, 0, 0.03);
  return { group: g };
}

export function artPoster(pal) {
  return poster(1.02, 0.78, (c, w, h) => drawArt(c, w, h, pal));
}

export function door(pal, label = 'HELPERS') {
  return turned((g) => {
    block(g, 0.08, 2.15, 0.1, C.white, 0.06, 0, -0.66);
    block(g, 0.08, 2.15, 0.1, C.white, 0.06, 0, 0.66);
    block(g, 0.08, 0.1, 1.42, C.white, 0.06, 2.12, 0);
    const glowMat = new THREE.MeshBasicMaterial({ color: '#ffd9c4', toneMapped: false, transparent: true, opacity: 0 });
    const glowPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.05), glowMat);
    glowPlane.rotation.y = Math.PI / 2;
    glowPlane.position.set(0.02, 1.03, 0);
    g.add(glowPlane);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.05), mat('#3d3929'));
    back.rotation.y = Math.PI / 2;
    back.position.set(0.015, 1.03, 0);
    g.add(back);
    const hinge = group();
    hinge.position.set(0.05, 0, -0.6);
    g.add(hinge);
    block(hinge, 0.07, 2.04, 1.2, pal.door, 0.035, 0.01, 0.6);
    block(hinge, 0.012, 0.62, 0.36, '#fdf8ee', 0.075, 1.2, 0.36, { cast: false });
    block(hinge, 0.012, 0.62, 0.36, '#fdf8ee', 0.075, 1.2, 0.84, { cast: false });
    const knob = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), mat('#ebdbbc'));
    knob.position.set(0.11, 1.0, 1.05);
    hinge.add(knob);
    const sign = new Screen(256, 64, 0.01);
    sign.ctx.fillStyle = '#ffffff';
    sign.ctx.fillRect(0, 0, 256, 64);
    sign.ctx.fillStyle = pal.door;
    sign.ctx.font = '800 30px ui-sans-serif, -apple-system, sans-serif';
    sign.ctx.textAlign = 'center';
    sign.ctx.fillText(label, 128, 44);
    sign.tex.needsUpdate = true;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), sign.mat);
    plate.rotation.y = Math.PI / 2;
    plate.position.set(0.12, 2.42, 0);
    g.add(plate);
    return { hinge, glowMat };
  });
}

export function wallBoard({ style = 'white', w = 2.1, h = 1.2, bottom = 0.48 } = {}) {
  const g = group();
  const frame = style === 'chalk' ? C.oakDark : style === 'cork' ? C.oak : '#b0aea5';
  block(g, w, h, 0.07, frame, 0, bottom, 0);
  const ch = 336;
  const board = new Screen(Math.round(ch * ((w - 0.1) / (h - 0.12))), ch, 4);
  screenPlane(g, board, w - 0.1, h - 0.12, 0, bottom + h / 2, 0.04);
  if (style !== 'cork') {
    block(g, w - 0.2, 0.05, 0.16, frame, 0, bottom - 0.03, 0.08);
    const sticks = style === 'chalk' ? ['#faf9f5', '#f0eee6', '#e8a07f'] : [C.clay, C.charcoal, '#788c5d'];
    sticks.forEach((c, i) => block(g, 0.14, 0.04, 0.04, c, -0.5 + i * 0.12, bottom + 0.02, 0.1));
  }
  return { group: g, screen: board };
}

export function rollingBoard({ style = 'white' } = {}) {
  const g = group();
  const w = 1.8;
  const h = 1.05;
  const bottom = 0.55;
  for (const x of [-w / 2 - 0.04, w / 2 + 0.04]) {
    block(g, 0.05, bottom + h + 0.1, 0.05, C.steel, x, 0.06, 0);
    block(g, 0.06, 0.05, 0.62, C.steel, x, 0.06, 0);
    for (const z of [-0.28, 0.28]) cyl(g, 0.04, 0.04, 0.06, C.charcoal, x, 0, z);
  }
  block(g, w, h, 0.05, '#b0aea5', 0, bottom, 0);
  const board = new Screen(Math.round(336 * ((w - 0.08) / (h - 0.08))), 336, 4);
  screenPlane(g, board, w - 0.08, h - 0.08, 0, bottom + h / 2, 0.03);
  block(g, w - 0.3, 0.04, 0.12, '#b0aea5', 0, bottom - 0.02, 0.07);
  return { group: g, screen: board };
}

export function onAirSign() {
  const g = group();
  const sign = new Screen(192, 64, 0.01);
  sign.ctx.fillStyle = '#c15f3c';
  sign.ctx.fillRect(0, 0, 192, 64);
  sign.ctx.fillStyle = '#fff';
  sign.ctx.font = '800 34px ui-sans-serif, -apple-system, sans-serif';
  sign.ctx.textAlign = 'center';
  sign.ctx.fillText('ON AIR', 96, 45);
  sign.tex.needsUpdate = true;
  const signMat = new THREE.MeshBasicMaterial({ map: sign.tex, toneMapped: false, color: '#ffffff' });
  block(g, 1.0, 0.4, 0.06, C.charcoal, 0, -0.2, -0.03, { cast: false });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), signMat);
  face.position.z = 0.005;
  g.add(face);
  return { group: g, mat: signMat };
}

export function foamPanels(rows, cols) {
  const g = group();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tall = (r + c) % 2 === 0;
      block(g, 0.27, 0.27, tall ? 0.1 : 0.06, tall ? '#4a4536' : '#5e5a4c', (c - (cols - 1) / 2) * 0.3, (r - rows / 2) * 0.3, tall ? 0.05 : 0.03, { cast: false });
    }
  }
  return { group: g };
}

export function pennants(n, spacing = 0.42) {
  const g = group();
  const width = (n - 1) * spacing + 0.4;
  block(g, width, 0.015, 0.015, C.charcoal, 0, 0, 0.01, { cast: false });
  const cols = ['#d97757', '#d4a27f', '#788c5d', '#6a9bcc', '#c15f3c', '#ebdbbc'];
  for (let i = 0; i < n; i++) {
    const shape = new THREE.Shape();
    shape.moveTo(-0.13, 0); shape.lineTo(0.13, 0); shape.lineTo(0, -0.28); shape.lineTo(-0.13, 0);
    const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), toon(cols[i % cols.length], { side: THREE.DoubleSide }));
    flag.position.set(-width / 2 + 0.2 + i * spacing, 0, 0.02);
    g.add(flag);
  }
  return { group: g };
}

export function statusScreen(draw) {
  const g = group();
  const scr = new Screen(256, 160, 4);
  block(g, 1.3, 0.85, 0.06, C.charcoal, 0, -0.425, 0, { cast: false });
  screenPlane(g, scr, 1.2, 0.75, 0, 0, 0.035);
  return { group: g, tick: (dt, t, ctx) => scr.tick(dt, (c, w, h) => draw(c, w, h, ctx, t)) };
}

export function pegboard(kind = 'tools') {
  const g = group();
  block(g, 1.35, 0.95, 0.04, kind === 'tools' ? '#d9d4c7' : '#e6dccb', 0, -0.475, 0, { cast: false });
  if (kind === 'tools') {
    for (const [x, y, h, col] of [[-0.45, 0.05, 0.45, C.charcoal], [-0.2, -0.05, 0.6, C.clay], [0.08, 0.1, 0.35, C.steel], [0.35, 0.0, 0.5, C.charcoal]]) block(g, 0.07, h, 0.05, col, x, y - h / 2, 0.04);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 4, 10), mat(C.oak));
    coil.position.set(0.48, 0.25, 0.05);
    g.add(coil);
  } else {
    ['#d97757', '#6a9bcc', '#788c5d', '#c15f3c', '#d4a27f', '#3d3929'].forEach((col, i) => {
      block(g, 0.035, 0.38, 0.04, C.oak, -0.5 + i * 0.2, -0.15, 0.04);
      block(g, 0.05, 0.1, 0.05, col, -0.5 + i * 0.2, -0.24, 0.04);
    });
    block(g, 0.9, 0.06, 0.03, '#b0aea5', 0, 0.3, 0.04);
  }
  return { group: g };
}

export function cableTray(len) {
  const g = group();
  block(g, len, 0.08, 0.22, C.charcoal, 0, 0, 0.11, { cast: false });
  return { group: g };
}

export function ledStrip(len, color = '#e8a07f') {
  const g = group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, 0.03), glow(color));
  m.position.set(0, 0, 0.02);
  g.add(m);
  return { group: g };
}

export function polaroids(n) {
  const g = group();
  const width = n * 0.55;
  block(g, width, 0.015, 0.015, C.charcoal, 0, 0, 0.01, { cast: false });
  for (let i = 0; i < n; i++) {
    const x = -width / 2 + 0.28 + i * 0.55;
    const p = block(g, 0.26, 0.3, 0.02, '#faf9f5', x, -0.36, 0.02, { cast: false });
    p.rotation.z = (i % 2 ? 1 : -1) * 0.08;
    const pic = block(g, 0.2, 0.18, 0.01, ['#d97757', '#6a9bcc', '#788c5d', '#d4a27f'][i % 4], x, -0.3, 0.035, { cast: false });
    pic.rotation.z = p.rotation.z;
  }
  return { group: g };
}

// ── desks ────────────────────────────────────────────────────

/** The original cozy desk: one monitor, lamp, plant, mug, stool in front. */
export function cozyDesk(pal) {
  const g = group();
  block(g, 2.0, 0.08, 0.95, C.oak, 0, 0.66, 0);
  for (const [x, z] of [[-0.92, -0.38], [0.92, -0.38], [-0.92, 0.38], [0.92, 0.38]]) block(g, 0.07, 0.66, 0.07, C.charcoal, x, 0, z);
  block(g, 0.55, 0.4, 0.85, C.white, 0.6, 0.26, 0);
  block(g, 0.3, 0.03, 0.02, C.graphite, 0.6, 0.5, 0.44, { cast: false });
  const screen = new Screen(512, 304, 9);
  monitor(g, -0.12, 0.74, -0.16, 1.22, 0.76, screen);
  block(g, 0.62, 0.035, 0.2, C.white, -0.12, 0.74, 0.24);
  block(g, 0.56, 0.01, 0.15, '#d9d3c9', -0.12, 0.775, 0.24, { cast: false });
  block(g, 0.12, 0.025, 0.16, C.white, 0.36, 0.74, 0.25);
  cyl(g, 0.065, 0.06, 0.13, C.white, -0.62, 0.74, 0.22);
  cyl(g, 0.066, 0.066, 0.035, pal.door, -0.62, 0.79, 0.22);
  cyl(g, 0.09, 0.07, 0.12, C.terracotta, -0.78, 0.74, -0.24);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    leaf(g, 0.112, i % 2 ? C.leaf : C.leafDark, -0.78 + Math.cos(a) * 0.05, 0.94, -0.24 + Math.sin(a) * 0.05, 0.7, 1.4, 0.7, Math.sin(a) * 0.5, -Math.cos(a) * 0.5);
  }
  cyl(g, 0.1, 0.12, 0.03, C.charcoal, 0.8, 0.74, 0.14);
  const arm = block(g, 0.035, 0.5, 0.035, C.charcoal, 0.8, 0.76, 0.14);
  arm.rotation.z = 0.25;
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.16, 4, 1, true), mat(C.charcoal));
  shade.position.set(0.71, 1.25, 0.14);
  shade.rotation.z = 0.9;
  g.add(shade);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), glow('#fff1c9'));
  bulb.position.set(0.67, 1.21, 0.14);
  g.add(bulb);
  const st = group();
  st.position.set(-0.12, 0, 0.95);
  g.add(st);
  cyl(st, 0.3, 0.3, 0.07, pal.chair, 0, 0.3, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const l = block(st, 0.05, 0.31, 0.05, C.charcoal, Math.cos(a) * 0.18, 0, Math.sin(a) * 0.18);
    l.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
  }
  return { group: g, screen, seat: [-0.12, 0.95], seatH: 0.37 };
}

/** Lab: long desk with three monitors (code in the middle, tests and logs either side). */
export function workstation(pal) {
  const g = group();
  const W = 3.0;
  block(g, W, 0.08, 0.9, '#e8e6dc', 0, 0.66, 0);
  for (const x of [-W / 2 + 0.1, W / 2 - 0.1]) block(g, 0.08, 0.66, 0.8, C.charcoal, x, 0, 0);
  block(g, W - 0.3, 0.04, 0.04, C.charcoal, 0, 0.3, -0.35);
  const screen = new Screen(512, 304, 9);
  const left = new Screen(200, 300, 4);
  const right = new Screen(200, 300, 4);
  monitor(g, 0, 0.74, -0.18, 1.1, 0.66, screen);
  monitor(g, -0.95, 0.74, -0.12, 0.5, 0.74, left, { ry: 0.3 });
  monitor(g, 0.95, 0.74, -0.12, 0.5, 0.74, right, { ry: -0.3 });
  block(g, 0.6, 0.035, 0.2, C.charcoal, 0, 0.74, 0.24);
  block(g, 0.55, 0.01, 0.15, '#5e5a4c', 0, 0.775, 0.24, { cast: false });
  cyl(g, 0.065, 0.06, 0.13, C.clay, 1.25, 0.74, 0.22);
  // Rubber duck: the oldest debugging tool.
  const duck = group();
  duck.position.set(-1.25, 0.74, 0.18);
  duck.rotation.y = 0.6;
  g.add(duck);
  block(duck, 0.16, 0.1, 0.12, '#e8c47a', 0, 0, 0);
  block(duck, 0.09, 0.09, 0.09, '#e8c47a', 0.05, 0.1, 0);
  block(duck, 0.05, 0.025, 0.05, C.clay, 0.11, 0.12, 0);
  const chair = officeChair(pal.chair);
  chair.group.position.set(0, 0, 0.95);
  chair.group.rotation.y = Math.PI;
  g.add(chair.group);
  return { group: g, screen, side: [left, right], seat: [0, 0.95], seatH: 0.37 };
}

/** Studio: editing desk with a timeline monitor, a preview monitor and speakers. */
export function editingDesk(pal) {
  const g = group();
  block(g, 2.2, 0.08, 0.9, C.walnut, 0, 0.66, 0);
  for (const [x, z] of [[-1.0, -0.35], [1.0, -0.35], [-1.0, 0.35], [1.0, 0.35]]) block(g, 0.07, 0.66, 0.07, C.charcoal, x, 0, z);
  const screen = new Screen(512, 304, 9);
  const preview = new Screen(256, 150, 6);
  monitor(g, -0.2, 0.74, -0.15, 1.15, 0.68, screen);
  monitor(g, 0.78, 0.74, -0.1, 0.6, 0.38, preview, { ry: -0.35, stand: 0.36 });
  for (const x of [-0.98, 1.12]) {
    block(g, 0.2, 0.34, 0.22, C.charcoal, x, 0.74, -0.2);
    cyl(g, 0.06, 0.06, 0.02, '#5e5a4c', x, 0.92, -0.08);
  }
  block(g, 0.5, 0.035, 0.2, C.charcoal, -0.2, 0.74, 0.24);
  block(g, 0.22, 0.05, 0.2, '#5e5a4c', 0.35, 0.74, 0.25); // jog wheel controller
  cyl(g, 0.06, 0.06, 0.02, C.clay, 0.35, 0.79, 0.25);
  const chair = officeChair(C.charcoal);
  chair.group.position.set(-0.2, 0, 0.95);
  chair.group.rotation.y = Math.PI;
  g.add(chair.group);
  return { group: g, screen, preview, seat: [-0.2, 0.95], seatH: 0.37 };
}

/** Art room: tilted drafting table with a tablet and a screen on an arm. */
export function draftingTable(pal) {
  const g = group();
  for (const x of [-0.75, 0.75]) {
    block(g, 0.07, 0.8, 0.07, C.oak, x, 0, -0.3);
    block(g, 0.07, 0.75, 0.07, C.oak, x, 0, 0.3);
  }
  const top = block(g, 1.7, 0.05, 0.95, '#faf9f5', 0, 0.82, 0);
  top.rotation.x = 0.28;
  block(g, 1.6, 0.04, 0.12, C.oak, 0, 0.7, 0.52); // pencil ledge
  ['#d97757', '#788c5d', '#6a9bcc', '#3d3929'].forEach((c, i) => block(g, 0.02, 0.02, 0.18, c, -0.5 + i * 0.12, 0.74, 0.52));
  const paper = block(g, 0.9, 0.01, 0.6, '#ffffff', -0.2, 0.86, -0.02, { cast: false });
  paper.rotation.x = 0.28;
  const screen = new Screen(512, 304, 8);
  monitor(g, 0.55, 0.92, -0.42, 0.95, 0.58, screen, { stand: 0.42 });
  const st = stool(pal.chair, 0.5);
  st.group.position.set(0, 0, 0.95);
  g.add(st.group);
  return { group: g, screen, seat: [0, 0.95], seatH: 0.5 };
}

/** Classroom: the teacher's desk. The teacher sits behind it (−z) facing the class. */
export function teacherDesk(pal) {
  const g = group();
  block(g, 1.7, 0.08, 0.85, C.oak, 0, 0.7, 0);
  block(g, 1.7, 0.62, 0.05, C.oakDark, 0, 0.08, 0.4);
  block(g, 0.5, 0.62, 0.75, C.oakDark, 0.55, 0.08, 0);
  // Laptop faces the teacher.
  const lap = group();
  lap.position.set(-0.1, 0.78, -0.05);
  lap.rotation.y = Math.PI;
  g.add(lap);
  block(lap, 0.5, 0.02, 0.34, C.steel, 0, 0, 0);
  const screen = new Screen(320, 200, 6);
  const lid = group();
  lid.position.set(0, 0.02, -0.17);
  lid.rotation.x = -0.25;
  lap.add(lid);
  block(lid, 0.5, 0.32, 0.02, C.steel, 0, 0, 0);
  screenPlane(lid, screen, 0.46, 0.28, 0, 0.16, 0.012);
  // Apple, books and a bell.
  const apple = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 0), toon(C.terracotta));
  apple.position.set(0.6, 0.86, 0.15);
  apple.castShadow = true;
  g.add(apple);
  block(g, 0.015, 0.05, 0.015, C.walnut, 0.6, 0.92, 0.15);
  block(g, 0.05, 0.015, 0.03, '#788c5d', 0.63, 0.95, 0.15);
  for (let i = 0; i < 3; i++) block(g, 0.34 - i * 0.03, 0.06, 0.24, ['#6a9bcc', '#d97757', '#788c5d'][i], -0.62, 0.78 + i * 0.06, 0.1);
  cyl(g, 0.07, 0.09, 0.07, '#d4a27f', 0.3, 0.78, 0.25);
  const chair = officeChair(C.oakDark);
  chair.group.position.set(0, 0, -0.75);
  g.add(chair.group);
  return { group: g, screen, seat: [0, -0.75], seatH: 0.37 };
}

/** Classroom: a small student desk with its chair (the student faces −z, the board). */
export function studentDesk(seed = 1) {
  const g = group();
  const R = rng(seed * 13 + 1);
  block(g, 0.85, 0.05, 0.55, C.oak, 0, 0.58, 0);
  for (const [x, z] of [[-0.38, -0.22], [0.38, -0.22], [-0.38, 0.22], [0.38, 0.22]]) block(g, 0.05, 0.58, 0.05, C.steel, x, 0, z);
  block(g, 0.32, 0.015, 0.22, '#faf9f5', -0.12 + R() * 0.2, 0.63, 0.02, { cast: false });
  block(g, 0.03, 0.02, 0.16, ['#d97757', '#6a9bcc', '#788c5d'][seed % 3], 0.25, 0.64, 0.05);
  const chair = group();
  chair.position.set(0, 0, 0.5);
  g.add(chair);
  block(chair, 0.42, 0.04, 0.4, ['#d97757', '#6a9bcc', '#788c5d', '#d4a27f'][seed % 4], 0, 0.4, 0);
  block(chair, 0.42, 0.34, 0.04, ['#d97757', '#6a9bcc', '#788c5d', '#d4a27f'][seed % 4], 0, 0.44, 0.19);
  for (const [x, z] of [[-0.18, -0.16], [0.18, -0.16], [-0.18, 0.16], [0.18, 0.16]]) block(chair, 0.035, 0.4, 0.035, C.steel, x, 0, z);
  return { group: g };
}

// ── shelves ──────────────────────────────────────────────────

export function bookshelf(pal, { w = 1.7, h = 2.4, d = 0.6, fill = 'books', frame = C.white, top = 'plant' } = {}) {
  const g = group();
  block(g, 0.07, h, d, frame, -w / 2 + 0.035, 0, 0);
  block(g, 0.07, h, d, frame, w / 2 - 0.035, 0, 0);
  block(g, w, 0.05, d, frame, 0, h - 0.05, 0);
  block(g, w - 0.12, h - 0.05, 0.03, frame === C.white ? '#efe8dc' : '#4a4536', 0, 0, -d / 2 + 0.03, { cast: false });
  const rows = Math.max(3, Math.floor((h - 0.2) / 0.58));
  const shelfYs = Array.from({ length: rows }, (_, i) => 0.06 + i * ((h - 0.25) / rows));
  const R = rng(42 + fill.length);
  const colors = [pal.book, '#d97757', '#c15f3c', '#d4a27f', '#ebdbbc', '#3d3929', '#788c5d', '#6a9bcc', '#faf9f5', '#b0aea5', '#a8764f'];
  for (const y of shelfYs) {
    block(g, w - 0.1, 0.05, d - 0.04, frame === C.white ? C.oak : frame, 0, y, 0.01);
    let x = -w / 2 + 0.14;
    while (x < w / 2 - 0.25) {
      const pick = R();
      if (fill === 'film' && pick < 0.4) {
        const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 10), mat(pick < 0.2 ? C.steel : '#3d3929'));
        reel.rotation.x = Math.PI / 2;
        reel.position.set(x + 0.17, y + 0.22, 0.02);
        g.add(reel);
        x += 0.38;
        continue;
      }
      if ((fill === 'film' || fill === 'tech') && pick < 0.7) {
        const bw = 0.16 + R() * 0.12;
        block(g, bw, 0.12 + R() * 0.2, 0.3, pick < 0.55 ? '#3d3929' : C.steel, x + bw / 2, y + 0.05, 0.03);
        x += bw + 0.03;
        continue;
      }
      if (fill === 'paint' && pick < 0.55) {
        const col = colors[Math.floor(R() * colors.length)];
        cyl(g, 0.09, 0.09, 0.17, C.steel, x + 0.1, y + 0.05, 0.02);
        cyl(g, 0.092, 0.092, 0.05, col, x + 0.1, y + 0.13, 0.02);
        x += 0.22;
        continue;
      }
      if (R() < 0.1) { x += 0.16; continue; }
      const bw = 0.07 + R() * 0.07;
      const bh = 0.3 + R() * 0.18;
      const b = block(g, bw, bh, 0.36 + R() * 0.08, colors[Math.floor(R() * colors.length)], x + bw / 2, y + 0.05, 0.03);
      if (R() < 0.08) { b.rotation.z = -0.22; b.position.x += 0.06; }
      x += bw + 0.012;
    }
  }
  if (top === 'plant') {
    cyl(g, 0.15, 0.12, 0.22, C.terracotta, -w / 2 + 0.4, h, 0.02);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      leaf(g, 0.176, i % 2 ? C.leaf : C.leafDark, -w / 2 + 0.4 + Math.cos(a) * 0.08, h + 0.4, 0.02 + Math.sin(a) * 0.08, 0.55, 1.5, 0.55, Math.sin(a) * 0.55, -Math.cos(a) * 0.55);
    }
    block(g, 0.5, 0.06, 0.34, pal.book, w / 2 - 0.47, h, 0.05);
    block(g, 0.44, 0.06, 0.3, '#f2efe8', w / 2 - 0.47, h + 0.06, 0.05);
  } else if (top === 'fishbowl') {
    const bowl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), new THREE.MeshBasicMaterial({ color: '#cfe3f1', transparent: true, opacity: 0.55 }));
    bowl.position.set(0.3, h + 0.2, 0);
    g.add(bowl);
    block(g, 0.1, 0.06, 0.04, C.clay, 0.3, h + 0.17, 0);
    block(g, 0.04, 0.05, 0.03, C.clay, 0.24, h + 0.18, 0);
    block(g, 0.4, 0.05, 0.3, C.oakDark, -0.35, h, 0);
  } else if (top === 'clapper') {
    const cl = group();
    cl.position.set(0.25, h, 0);
    cl.rotation.y = -0.3;
    g.add(cl);
    block(cl, 0.42, 0.3, 0.03, '#1f1e1d', 0, 0, 0);
    block(cl, 0.42, 0.06, 0.035, '#faf9f5', 0, 0.3, 0);
  }
  return { group: g };
}

// ── machines for running commands ────────────────────────────

/** Cozy: a low table with a retro CRT (front +x originally). */
export function terminalTable() {
  return turned((g) => {
    block(g, 0.85, 0.06, 1.35, C.white, 0, 0.4, 0);
    for (const [x, z] of [[-0.35, -0.6], [0.35, -0.6], [-0.35, 0.6], [0.35, 0.6]]) block(g, 0.06, 0.4, 0.06, C.oakDark, x, 0, z);
    const crt = group();
    crt.position.set(-0.05, 0.46, -0.05);
    g.add(crt);
    block(crt, 0.7, 0.66, 0.84, C.beige, 0, 0, 0);
    block(crt, 0.3, 0.5, 0.6, '#ddd3c0', -0.42, 0.06, 0);
    const screen = new Screen(320, 256, 8);
    screenPlane(crt, screen, 0.62, 0.48, 0.355, 0.36, 0, Math.PI / 2);
    block(crt, 0.04, 0.06, 0.12, '#cfc5b1', 0.35, 0.02, 0.28);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.035), glow('#f0a678'));
    led.position.set(0.355, 0.07, -0.3);
    crt.add(led);
    const kb = block(g, 0.2, 0.04, 0.58, C.beige, 0.3, 0.46, 0.0);
    kb.rotation.z = 0.06;
    return { screen };
  });
}

/** Server rack (front faces +z). With `console`, there's a pull-out keyboard and a little screen. */
export function serverRack({ console: hasConsole = false, h = 2.0 } = {}) {
  const g = group();
  block(g, 0.85, h, 0.8, C.charcoal, 0, 0, 0);
  const leds = [];
  const rows = hasConsole ? 4 : 7;
  for (let row = 0; row < rows; row++) {
    const y = (hasConsole ? 1.25 : 0.18) + row * 0.25;
    block(g, 0.72, 0.2, 0.02, C.graphite, 0, y, 0.4, { cast: false });
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.02), glow('#2f2c26'));
      m.position.set(0.24 - k * 0.09, y + 0.1, 0.415);
      g.add(m);
      leds.push(m);
    }
  }
  let screen = null;
  if (hasConsole) {
    screen = new Screen(320, 220, 8);
    block(g, 0.62, 0.42, 0.04, '#1f1e1d', 0, 0.72, 0.41);
    screenPlane(g, screen, 0.56, 0.36, 0, 0.93, 0.432);
    block(g, 0.7, 0.04, 0.38, C.graphite, 0, 0.6, 0.55); // pull-out keyboard tray
    block(g, 0.6, 0.02, 0.22, '#5e5a4c', 0, 0.64, 0.58, { cast: false });
  }
  return { group: g, leds, screen };
}

/** Studio: render tower on a cart with a queue monitor. */
export function renderTower() {
  const g = group();
  block(g, 1.0, 0.05, 0.6, C.steel, 0, 0.7, 0);
  block(g, 1.0, 0.05, 0.6, C.steel, 0, 0.12, 0);
  for (const [x, z] of [[-0.46, -0.26], [0.46, -0.26], [-0.46, 0.26], [0.46, 0.26]]) {
    block(g, 0.04, 0.7, 0.04, C.steel, x, 0.05, z);
    cyl(g, 0.04, 0.04, 0.05, C.charcoal, x, 0, z);
  }
  block(g, 0.3, 0.55, 0.5, '#1f1e1d', -0.3, 0.17, 0);
  const leds = [0, 1, 2].map((i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.02), glow('#2f2c26'));
    m.position.set(-0.3 + (i - 1) * 0.06, 0.55, 0.255);
    g.add(m);
    return m;
  });
  const screen = new Screen(320, 220, 6);
  monitor(g, 0.1, 0.75, -0.05, 0.75, 0.5, screen);
  return { group: g, screen, leds };
}

/** Art room: big printer. Paper slides out while a command runs. */
export function plotter() {
  const g = group();
  for (const x of [-0.6, 0.6]) {
    block(g, 0.06, 0.55, 0.06, C.charcoal, x, 0, 0);
    block(g, 0.06, 0.04, 0.5, C.charcoal, x, 0, 0);
  }
  block(g, 1.45, 0.38, 0.5, '#e8e6dc', 0, 0.55, 0);
  block(g, 1.3, 0.04, 0.06, '#3d3929', 0, 0.78, 0.25);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.3, 8), mat('#faf9f5'));
  roll.rotation.z = Math.PI / 2;
  roll.position.set(0, 0.98, -0.12);
  g.add(roll);
  const paper = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.01, 0.5), mat('#ffffff'));
  paper.position.set(0, 0.62, 0.3);
  g.add(paper);
  const screen = new Screen(160, 100, 6);
  block(g, 0.3, 0.2, 0.04, '#1f1e1d', 0.5, 0.94, 0.22);
  screenPlane(g, screen, 0.26, 0.16, 0.5, 1.04, 0.245);
  return { group: g, screen, paper };
}

/** Classroom: computer corner. */
export function computerDesk(pal) {
  const g = group();
  block(g, 1.1, 0.05, 0.65, C.oak, 0, 0.62, 0);
  for (const [x, z] of [[-0.5, -0.27], [0.5, -0.27], [-0.5, 0.27], [0.5, 0.27]]) block(g, 0.05, 0.62, 0.05, C.charcoal, x, 0, z);
  block(g, 0.55, 0.14, 0.42, C.beige, 0, 0.67, -0.08);
  block(g, 0.5, 0.44, 0.42, C.beige, 0, 0.81, -0.08);
  const screen = new Screen(320, 256, 8);
  screenPlane(g, screen, 0.42, 0.34, 0, 1.03, 0.135);
  block(g, 0.46, 0.03, 0.15, C.beige, 0, 0.67, 0.22);
  const st = stool(pal.chair, 0.45);
  st.group.position.set(0, 0, 0.7);
  g.add(st.group);
  return { group: g, screen };
}

// ── things to search through ─────────────────────────────────

/** Cozy filing cabinet (drawers slide toward +z). */
export function fileCabinet() {
  return turned((g) => {
    block(g, 0.74, 1.25, 0.85, '#c9c4b6', 0, 0, 0);
    const drawers = [];
    for (let i = 0; i < 3; i++) {
      const d = group();
      d.position.set(0.37, 0.1 + i * 0.38, 0);
      g.add(d);
      block(d, 0.05, 0.33, 0.76, '#d9d4c6', 0, 0, 0);
      block(d, 0.04, 0.04, 0.26, C.charcoal, 0.04, 0.22, 0);
      block(d, 0.01, 0.08, 0.2, C.white, 0.03, 0.08, 0, { cast: false });
      drawers.push(d);
    }
    block(g, 0.5, 0.05, 0.36, '#d4a27f', 0, 1.25, -0.12);
    block(g, 0.48, 0.05, 0.34, '#d97757', 0.01, 1.3, -0.1);
    return { drawers, slide: (d, k) => { d.position.x = 0.37 + k * 0.22; } };
  });
}

function drawerGrid(g, cols, rows, w, h, y0, z, colors, handle = C.charcoal) {
  const drawers = [];
  const cw = w / cols;
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const d = group();
      d.position.set(-w / 2 + cw * (c + 0.5), y0 + rh * r, z);
      g.add(d);
      block(d, cw - 0.03, rh - 0.03, 0.03, colors[(r + c) % colors.length], 0, 0.015, 0);
      block(d, cw * 0.35, 0.025, 0.03, handle, 0, rh * 0.5, 0.025);
      drawers.push(d);
    }
  }
  return drawers;
}

/** Lab: a steel unit full of little parts drawers. */
export function partsDrawers() {
  const g = group();
  block(g, 1.0, 1.15, 0.45, C.steel, 0, 0, 0);
  const drawers = drawerGrid(g, 4, 5, 0.92, 1.05, 0.05, 0.23, ['#ebdbbc', '#d97757', '#faf9f5', '#d4a27f']);
  block(g, 0.6, 0.12, 0.3, C.charcoal, 0, 1.15, 0); // label maker / multimeter on top
  return { group: g, drawers, slide: (d, k) => { d.position.z = 0.23 + k * 0.12; } };
}

/** Studio: stacked flight cases; the top lid pops open while searching. */
export function roadCases() {
  const g = group();
  block(g, 1.0, 0.55, 0.6, '#1f1e1d', 0, 0, 0);
  block(g, 0.9, 0.42, 0.55, '#3d3929', 0, 0.55, 0);
  for (const [x, y] of [[-0.5, 0], [0.5, 0], [-0.45, 0.55], [0.45, 0.55]]) block(g, 0.05, x < 0 ? 0.55 : 0.42, 0.62, C.steel, x, y, 0, { cast: false });
  block(g, 0.3, 0.04, 0.05, C.steel, 0, 0.3, 0.31);
  const lid = group();
  lid.position.set(0, 0.97, -0.27);
  g.add(lid);
  block(lid, 0.9, 0.08, 0.55, '#3d3929', 0, 0, 0.27);
  block(lid, 0.2, 0.04, 0.04, C.steel, 0, 0.08, 0.5);
  return { group: g, lid };
}

/** Art room: wide flat-file drawers for prints. */
export function flatFiles() {
  const g = group();
  block(g, 1.35, 0.95, 0.85, '#e6dccb', 0, 0, 0);
  const drawers = [];
  for (let i = 0; i < 5; i++) {
    const d = group();
    d.position.set(0, 0.06 + i * 0.17, 0.42);
    g.add(d);
    block(d, 1.27, 0.14, 0.03, '#ebdbbc', 0, 0, 0);
    block(d, 0.3, 0.025, 0.03, C.oakDark, 0, 0.08, 0.025);
    drawers.push(d);
  }
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8), mat('#faf9f5'));
  roll.rotation.z = Math.PI / 2;
  roll.position.set(0, 1.0, -0.15);
  g.add(roll);
  block(g, 0.6, 0.02, 0.45, '#788c5d', 0.25, 0.95, 0.12);
  return { group: g, drawers, slide: (d, k) => { d.position.z = 0.42 + k * 0.3; } };
}

/** Classroom: library card catalog with tiny drawers. */
export function cardCatalog() {
  const g = group();
  for (const x of [-0.44, 0.44]) block(g, 0.06, 0.35, 0.5, C.oakDark, x, 0, 0);
  block(g, 0.95, 0.95, 0.5, C.oak, 0, 0.35, 0);
  const drawers = drawerGrid(g, 4, 5, 0.88, 0.88, 0.38, 0.25, ['#d4a27f', '#c99a70'], '#a8764f');
  return { group: g, drawers, slide: (d, k) => { d.position.z = 0.25 + k * 0.2; } };
}

// ── web stations ─────────────────────────────────────────────

export function globe() {
  const g = group();
  cyl(g, 0.32, 0.36, 0.06, C.walnut, 0, 0, 0);
  cyl(g, 0.045, 0.06, 0.62, C.walnut, 0, 0.06, 0);
  const tilt = group();
  tilt.position.y = 1.08;
  tilt.rotation.z = 0.41;
  g.add(tilt);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.03, 4, 20), mat('#d4a27f'));
  ring.rotation.y = Math.PI / 2;
  tilt.add(ring);
  const tex = new Screen(512, 256, 0.01);
  const c = tex.ctx;
  c.fillStyle = '#6a9bcc';
  c.fillRect(0, 0, 512, 256);
  const R = rng(5);
  const land = ['#a9b98c', '#8a9e6b', '#ebdbbc'];
  for (let i = 0; i < 26; i++) {
    c.fillStyle = land[i % 3];
    c.beginPath();
    const x = R() * 512;
    const y = 40 + R() * 176;
    for (let k = 0; k < 5; k++) c.ellipse(x + R() * 50 - 25, y + R() * 30 - 15, 14 + R() * 34, 10 + R() * 22, R() * 3, 0, Math.PI * 2);
    c.fill();
  }
  tex.tex.needsUpdate = true;
  tex.tex.magFilter = THREE.NearestFilter;
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), toon('#ffffff', { map: tex.tex }));
  sphere.castShadow = true;
  tilt.add(sphere);
  return { group: g, sphere };
}

/** Lab: a hologram globe over a projector pedestal. */
export function holoGlobe() {
  const g = group();
  cyl(g, 0.34, 0.4, 0.12, C.charcoal, 0, 0, 0);
  cyl(g, 0.22, 0.26, 0.62, '#3d3929', 0, 0.12, 0);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 4, 20), glow('#e8a07f'));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.76;
  g.add(ring);
  const sphere = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshBasicMaterial({ color: '#e8a07f', wireframe: true, toneMapped: false }));
  sphere.position.y = 1.3;
  g.add(sphere);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), glow('#f5c7a8'));
  core.position.y = 1.3;
  g.add(core);
  return { group: g, sphere };
}

/** Studio: monitor on a rolling stand, for looking things up. */
export function fieldMonitor() {
  const g = group();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const l = block(g, 0.05, 0.04, 0.4, C.charcoal, Math.sin(a) * 0.17, 0.02, Math.cos(a) * 0.17);
    l.rotation.y = a;
  }
  block(g, 0.06, 1.15, 0.06, C.charcoal, 0, 0.04, 0);
  const screen = new Screen(320, 200, 6);
  block(g, 0.86, 0.56, 0.06, C.charcoal, 0, 1.12, 0);
  screenPlane(g, screen, 0.8, 0.5, 0, 1.4, 0.032);
  return { group: g, screen };
}

/** Art room: small round table with an open laptop. */
export function laptopTable() {
  const g = group();
  cyl(g, 0.36, 0.36, 0.04, '#faf9f5', 0, 0.68, 0);
  cyl(g, 0.04, 0.05, 0.68, C.oak, 0, 0, 0);
  cyl(g, 0.2, 0.22, 0.03, C.oak, 0, 0, 0);
  block(g, 0.44, 0.02, 0.3, C.steel, 0, 0.72, 0.04);
  const screen = new Screen(320, 200, 6);
  const lid = group();
  lid.position.set(0, 0.74, -0.11);
  lid.rotation.x = -0.25;
  g.add(lid);
  block(lid, 0.44, 0.3, 0.02, C.steel, 0, 0, 0);
  screenPlane(lid, screen, 0.4, 0.26, 0, 0.15, 0.012);
  return { group: g, screen };
}

// ── benches (the "tools" station) ────────────────────────────

function benchTable(g, top = C.oak, legs = C.charcoal) {
  block(g, 1.8, 0.09, 0.9, top, 0, 0.6, 0);
  for (const [x, z] of [[-0.8, -0.36], [0.8, -0.36], [-0.8, 0.36], [0.8, 0.36]]) block(g, 0.08, 0.6, 0.08, legs, x, 0, z);
  block(g, 1.6, 0.05, 0.76, legs, 0, 0.18, 0);
}

export function workbench(pal) {
  const g = group();
  benchTable(g);
  block(g, 0.55, 0.26, 0.42, C.clay, -0.48, 0.69, -0.05);
  block(g, 0.3, 0.1, 0.06, C.charcoal, -0.48, 0.95, -0.05);
  const gears = [];
  for (const [x, r, col] of [[0.28, 0.2, '#b0aea5'], [0.58, 0.13, '#d4a27f']]) {
    const gear = group();
    gear.position.set(x, 0.72, 0);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.05, 8), mat(col));
    gear.add(disc);
    for (let k = 0; k < 10; k++) {
      const tooth = new THREE.Mesh(rbox(0.06, 0.05, 0.06), mat(col));
      const a = (k / 10) * Math.PI * 2;
      tooth.position.set(Math.cos(a) * (r + 0.02), 0, Math.sin(a) * (r + 0.02));
      tooth.rotation.y = -a;
      gear.add(tooth);
    }
    g.add(gear);
    gears.push(gear);
  }
  cyl(g, 0.1, 0.12, 0.05, C.charcoal, -0.02, 0.69, 0.15);
  const robot = block(g, 0.07, 0.36, 0.07, pal.door, -0.02, 0.74, 0.15);
  robot.rotation.x = 0.3;
  return {
    group: g,
    tick(dt, t, busy) { gears.forEach((gr, i) => { gr.rotation.y += (busy ? 2.2 : 0.05) * dt * (i ? -1.6 : 1); }); },
  };
}

export function electronicsBench() {
  const g = group();
  benchTable(g, '#e8e6dc');
  block(g, 0.75, 0.03, 0.5, '#788c5d', -0.35, 0.69, 0.0);
  for (const [x, z, w] of [[-0.55, -0.1, 0.14], [-0.3, 0.1, 0.1], [-0.15, -0.13, 0.12]]) block(g, w, 0.04, w, C.charcoal, x, 0.72, z);
  for (let i = 0; i < 5; i++) block(g, 0.5, 0.005, 0.015, '#d4a27f', -0.35, 0.722, -0.2 + i * 0.1, { cast: false });
  const leds = [0, 1, 2].map((i) => {
    const m = new THREE.Mesh(rbox(0.035, 0.035, 0.035), glow('#5e5a4c'));
    m.position.set(-0.62 + i * 0.07, 0.74, 0.17);
    g.add(m);
    return m;
  });
  const osc = group();
  osc.position.set(0.45, 0.69, -0.05);
  g.add(osc);
  block(osc, 0.5, 0.34, 0.36, '#e6dccb', 0, 0, 0);
  const scope = new Screen(128, 96, 10);
  screenPlane(osc, scope, 0.3, 0.2, 0, 0.19, 0.182);
  cyl(g, 0.08, 0.09, 0.03, C.charcoal, 0.0, 0.69, 0.27);
  const iron = block(g, 0.03, 0.03, 0.3, C.clay, 0.0, 0.76, 0.27);
  iron.rotation.x = 0.6;
  return {
    group: g,
    tick(dt, t, busy) {
      leds.forEach((m, i) => m.material.color.set(busy && Math.sin(t * 9 + i * 2) > 0 ? '#d97757' : '#5e5a4c'));
      scope.tick(dt, (c, w, h) => {
        c.fillStyle = '#1f1e1d'; c.fillRect(0, 0, w, h);
        c.strokeStyle = '#d97757'; c.lineWidth = 3; c.beginPath();
        for (let x = 0; x <= w; x += 4) {
          const y = h / 2 + Math.sin(x * 0.12 + t * (busy ? 8 : 1.5)) * h * (busy ? 0.32 : 0.12);
          if (x) c.lineTo(x, y); else c.moveTo(x, y);
        }
        c.stroke();
      });
    },
  };
}

export function scienceTable() {
  const g = group();
  benchTable(g, '#3d3929', C.oak);
  const mic = group();
  mic.position.set(-0.35, 0.69, 0.0);
  g.add(mic);
  block(mic, 0.3, 0.05, 0.24, '#faf9f5', 0, 0, 0);
  block(mic, 0.06, 0.4, 0.06, '#faf9f5', 0, 0.05, -0.08);
  block(mic, 0.18, 0.03, 0.16, C.charcoal, 0, 0.18, 0.02);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.28, 8), toon('#faf9f5'));
  tube.position.set(0, 0.42, 0.01);
  tube.rotation.x = 0.35;
  mic.add(tube);
  const liquids = [];
  ['#d97757', '#788c5d', '#6a9bcc'].forEach((col, i) => {
    const f = group();
    f.position.set(0.15 + i * 0.22, 0.69, -0.05 + (i % 2) * 0.14);
    g.add(f);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.11, 0.2, 8), toon('#dfe6ee'));
    glass.position.y = 0.1;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 8), toon('#dfe6ee'));
    neck.position.y = 0.25;
    const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.105, 0.09, 8), glow(col));
    liq.position.y = 0.05;
    f.add(glass, neck, liq);
    liquids.push(liq);
  });
  return {
    group: g,
    tick(dt, t, busy) { liquids.forEach((l, i) => { l.scale.y = 1 + (busy ? Math.abs(Math.sin(t * 4 + i)) * 0.35 : 0); }); },
  };
}

/** Studio: camera on a tripod; the lens points along +z. */
export function cameraRig() {
  const g = group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = block(g, 0.04, 1.15, 0.04, C.charcoal, Math.sin(a) * 0.22, 0, Math.cos(a) * 0.22);
    leg.rotation.set(-Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2);
  }
  block(g, 0.14, 0.1, 0.14, C.charcoal, 0, 1.08, 0);
  block(g, 0.34, 0.27, 0.48, '#3d3929', 0, 1.16, 0);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.22, 8), toon('#1f1e1d'));
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 1.3, 0.33);
  g.add(lens);
  block(g, 0.2, 0.14, 0.03, '#5e5a4c', 0.0, 1.24, -0.26);
  const recMat = new THREE.MeshBasicMaterial({ color: '#5e5a4c', toneMapped: false });
  const rec = new THREE.Mesh(rbox(0.05, 0.05, 0.05), recMat);
  rec.position.set(0.1, 1.45, 0.18);
  g.add(rec);
  return { group: g, tick(dt, t, busy, ctx) { recMat.color.set(ctx.working && Math.sin(t * 4) > 0 ? '#e0675a' : '#5e5a4c'); } };
}

export function easel(pal, seed, drawPainting) {
  const g = group();
  for (const x of [-0.32, 0.32]) {
    const leg = block(g, 0.05, 1.7, 0.05, C.oak, x, 0, 0.05);
    leg.rotation.x = -0.12;
    leg.rotation.z = x > 0 ? -0.08 : 0.08;
  }
  const back = block(g, 0.05, 1.6, 0.05, C.oak, 0, 0, -0.3);
  back.rotation.x = 0.28;
  block(g, 0.8, 0.05, 0.1, C.oak, 0, 0.55, 0.12);
  const painting = new Screen(192, 144, 3);
  block(g, 0.86, 0.66, 0.04, '#faf9f5', 0, 0.62, 0.1);
  const face = screenPlane(g, painting, 0.8, 0.6, 0, 0.95, 0.125);
  face.rotation.x = -0.1;
  let progress = 0.25;
  return {
    group: g,
    tick(dt, t, busy) {
      if (busy) progress = Math.min(1, progress + dt * 0.04);
      painting.tick(dt, (c, w, h) => drawPainting(c, w, h, progress, seed, pal));
    },
  };
}

export function paintTable() {
  const g = group();
  cyl(g, 0.28, 0.28, 0.04, C.oak, 0, 0.55, 0);
  cyl(g, 0.03, 0.04, 0.55, C.charcoal, 0, 0, 0);
  ['#d97757', '#788c5d', '#6a9bcc', '#d4a27f'].forEach((col, i) => cyl(g, 0.05, 0.05, 0.08, col, -0.12 + (i % 2) * 0.24, 0.59, -0.08 + Math.floor(i / 2) * 0.16));
  return { group: g };
}

/** Art room: the big shared table in the middle. */
export function bigWorkTable() {
  const g = group();
  block(g, 2.2, 0.08, 1.15, C.oak, 0, 0.72, 0);
  for (const [x, z] of [[-1.0, -0.48], [1.0, -0.48], [-1.0, 0.48], [1.0, 0.48]]) block(g, 0.08, 0.72, 0.08, C.oakDark, x, 0, z);
  const p1 = block(g, 0.7, 0.01, 0.5, '#ffffff', -0.45, 0.8, 0.1, { cast: false });
  p1.rotation.y = 0.15;
  block(g, 0.6, 0.012, 0.42, '#788c5d', 0.4, 0.8, -0.12, { cast: false });
  for (let i = 0; i < 3; i++) {
    cyl(g, 0.07, 0.06, 0.16, '#cfe3f1', 0.75 + i * 0.16, 0.8, 0.3);
    block(g, 0.02, 0.28, 0.02, ['#d97757', '#6a9bcc', '#3d3929'][i], 0.75 + i * 0.16, 0.86, 0.3);
  }
  ['#d97757', '#d4a27f', '#788c5d', '#6a9bcc', '#3d3929'].forEach((c, i) => block(g, 0.12, 0.012, 0.18, c, -0.95 + i * 0.14, 0.8, -0.35, { cast: false }));
  return { group: g };
}

// ── seats & beds ─────────────────────────────────────────────

export function armchair(pal) {
  const g = group();
  const fabric = mat(pal.chair);
  block(g, 1.25, 0.26, 1.05, fabric, 0, 0.1, 0);
  block(g, 1.25, 0.82, 0.26, fabric, 0, 0.1, -0.42);
  block(g, 0.22, 0.5, 1.05, fabric, -0.56, 0.1, 0);
  block(g, 0.22, 0.5, 1.05, fabric, 0.56, 0.1, 0);
  block(g, 0.86, 0.1, 0.78, mat('#faf9f5'), 0, 0.33, 0.08);
  for (const [x, z] of [[-0.5, -0.4], [0.5, -0.4], [-0.5, 0.4], [0.5, 0.4]]) cyl(g, 0.04, 0.03, 0.1, C.walnut, x, 0, z);
  return { group: g, seat: [0, 0.08], seatH: 0.43 };
}

export function beanbag(pal) {
  const g = group();
  const bag = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), toon(pal.chair));
  bag.scale.set(1.05, 0.5, 1.05);
  bag.position.y = 0.27;
  bag.castShadow = true;
  bag.receiveShadow = true;
  g.add(bag);
  return { group: g, seat: [0, 0], seatH: 0.36 };
}

export function directorsChair(pal, label = 'CLAWD') {
  const g = group();
  for (const side of [-1, 1]) {
    for (const tilt of [-0.45, 0.45]) {
      const leg = block(g, 0.05, 0.62, 0.05, C.oak, side * 0.4, 0, 0);
      leg.rotation.x = tilt;
    }
    block(g, 0.06, 0.05, 0.62, C.oak, side * 0.42, 0.68, 0);
    block(g, 0.05, 1.05, 0.05, C.oak, side * 0.4, 0, -0.3);
  }
  block(g, 0.82, 0.05, 0.58, '#3d3929', 0, 0.52, 0);
  block(g, 0.82, 0.32, 0.04, '#3d3929', 0, 0.78, -0.3);
  const tag = new Screen(160, 40, 0.01);
  tag.ctx.fillStyle = '#3d3929'; tag.ctx.fillRect(0, 0, 160, 40);
  tag.ctx.fillStyle = '#e8a07f'; tag.ctx.font = '800 26px ui-sans-serif, sans-serif'; tag.ctx.textAlign = 'center';
  tag.ctx.fillText(label, 80, 30);
  tag.tex.needsUpdate = true;
  screenPlane(g, tag, 0.6, 0.15, 0, 0.94, -0.275);
  return { group: g, seat: [0, 0], seatH: 0.56 };
}

export function couch(pal) {
  const g = group();
  const fabric = mat(pal.chair);
  block(g, 1.9, 0.22, 0.85, C.walnut, 0, 0.06, 0);
  block(g, 1.6, 0.16, 0.65, fabric, 0, 0.28, 0.08);
  block(g, 1.9, 0.55, 0.22, fabric, 0, 0.28, -0.32);
  for (const x of [-0.85, 0.85]) block(g, 0.2, 0.4, 0.85, fabric, x, 0.28, 0);
  block(g, 0.4, 0.3, 0.12, '#faf9f5', -0.5, 0.44, -0.18);
  return { group: g, seat: [-0.4, 0.08], seatH: 0.45 };
}

export function futon(pal) {
  const g = group();
  block(g, 1.95, 0.12, 0.95, C.oakDark, 0, 0.04, 0);
  block(g, 1.85, 0.18, 0.85, '#e8e6dc', 0, 0.16, 0.02);
  block(g, 1.85, 0.42, 0.18, '#e8e6dc', 0, 0.16, -0.36);
  block(g, 0.45, 0.25, 0.1, pal.chair, -0.55, 0.34, -0.22);
  block(g, 0.4, 0.22, 0.1, '#788c5d', 0.2, 0.34, -0.22);
  return { group: g, seat: [0.4, 0.05], seatH: 0.34 };
}

export function petBed(pal) {
  const g = group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.2, 6, 12), mat('#ebdbbc'));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.17;
  rim.scale.set(1, 1, 0.85);
  rim.castShadow = true;
  rim.receiveShadow = true;
  g.add(rim);
  cyl(g, 0.62, 0.64, 0.14, '#f5ece0', 0, 0, 0);
  const blanket = block(g, 0.7, 0.04, 0.5, pal.rug, 0.15, 0.14, 0.18);
  blanket.rotation.y = 0.5;
  return { group: g, seat: [0, 0], seatH: 0.12 };
}

export function poufs(pal) {
  const g = group();
  cyl(g, 0.45, 0.45, 0.3, pal.chair, 0, 0, 0);
  cyl(g, 0.32, 0.32, 0.24, '#ebdbbc', 0.72, 0, -0.25);
  cyl(g, 0.28, 0.28, 0.2, '#788c5d', -0.55, 0, 0.45);
  return { group: g, seat: [0, 0], seatH: 0.3 };
}

export function readingNook(pal) {
  const g = group();
  const r = rug(1.9, 1.5, '#d4a27f', '#ebdbbc', { round: 0.7 });
  g.add(r.group);
  cyl(g, 0.38, 0.38, 0.22, pal.chair, -0.25, 0, 0.1);
  cyl(g, 0.3, 0.3, 0.18, '#788c5d', 0.45, 0, -0.25);
  for (let i = 0; i < 3; i++) block(g, 0.3, 0.06, 0.22, ['#6a9bcc', '#d97757', '#faf9f5'][i], 0.5, 0.18 + i * 0.06, 0.4);
  return { group: g, seat: [-0.25, 0.1], seatH: 0.22 };
}

// ── studio gear ──────────────────────────────────────────────

export function softbox() {
  const g = group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = block(g, 0.035, 0.5, 0.035, C.charcoal, Math.sin(a) * 0.18, 0, Math.cos(a) * 0.18);
    leg.rotation.set(-Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35);
  }
  block(g, 0.04, 1.5, 0.04, C.charcoal, 0, 0.4, 0);
  const box = group();
  box.position.set(0, 1.85, 0.05);
  box.rotation.x = 0.25;
  g.add(box);
  block(box, 0.7, 0.55, 0.3, '#1f1e1d', 0, -0.275, -0.15);
  const faceMat = new THREE.MeshBasicMaterial({ color: '#d6cdbd', toneMapped: false });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.47), faceMat);
  face.position.z = 0.005;
  box.add(face);
  return { group: g, light: faceMat };
}

export function ringLight() {
  const g = group();
  cyl(g, 0.2, 0.22, 0.04, C.charcoal, 0, 0, 0);
  block(g, 0.04, 1.25, 0.04, C.charcoal, 0, 0.04, 0);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#9a958a', toneMapped: false });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 4, 16), ringMat);
  halo.position.set(0, 1.55, 0.02);
  g.add(halo);
  return { group: g, light: ringMat };
}

/** Studio: seamless paper backdrop with a stool on it (the set). Not solid: Clawd walks onto it. */
export function backdrop(color = '#8a9e6b') {
  const g = group();
  const W = 2.8;
  for (const x of [-W / 2 - 0.08, W / 2 + 0.08]) {
    block(g, 0.05, 2.75, 0.05, C.charcoal, x, 0, -0.25);
    block(g, 0.05, 0.04, 0.55, C.charcoal, x, 0, -0.25);
  }
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, W + 0.2, 10), mat('#3d3929'));
  roll.rotation.z = Math.PI / 2;
  roll.position.set(0, 2.65, -0.25);
  g.add(roll);
  block(g, W, 2.35, 0.02, color, 0, 0.3, -0.33, { cast: false });
  const curve = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, W, 8, 1, true, Math.PI, Math.PI / 2), toon(color, { side: THREE.DoubleSide }));
  curve.rotation.z = Math.PI / 2;
  curve.position.set(0, 0.32, -0.01);
  g.add(curve);
  block(g, W, 0.012, 1.25, color, 0, 0.0, 0.62, { cast: false });
  const st = stool(C.oak, 0.5);
  st.group.position.set(0, 0, 0.55);
  g.add(st.group);
  return { group: g, seat: [0, 0.55], seatH: 0.5 };
}

// ── odds and ends ────────────────────────────────────────────

export function coffeeCounter() {
  const g = group();
  block(g, 1.0, 0.92, 0.55, '#e8e6dc', 0, 0, 0);
  block(g, 1.05, 0.05, 0.6, C.oakDark, 0, 0.92, 0);
  block(g, 0.32, 0.42, 0.32, C.charcoal, -0.2, 0.97, -0.05);
  block(g, 0.2, 0.05, 0.12, C.clay, -0.2, 1.24, 0.1);
  cyl(g, 0.05, 0.045, 0.1, C.white, 0.2, 0.97, 0.05);
  cyl(g, 0.05, 0.045, 0.1, C.clay, 0.35, 0.97, -0.1);
  return { group: g };
}

export function bust() {
  const g = group();
  block(g, 0.45, 1.0, 0.45, '#faf9f5', 0, 0, 0);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), toon('#e8e6dc'));
  head.position.y = 1.3;
  head.scale.set(0.9, 1.15, 0.95);
  head.castShadow = true;
  g.add(head);
  block(g, 0.28, 0.12, 0.2, '#e8e6dc', 0, 1.0, 0);
  return { group: g };
}

export function trashCan() {
  const g = group();
  cyl(g, 0.17, 0.14, 0.38, C.steel, 0, 0, 0);
  // A crumpled page or two on top.
  block(g, 0.09, 0.07, 0.08, '#f4f1ea', 0.04, 0.36, -0.02);
  block(g, 0.07, 0.06, 0.07, '#f4f1ea', -0.05, 0.37, 0.04);
  return { group: g };
}

/** A microphone on a boom stand with a pop filter, over a little foam mat. */
export function micStand() {
  const g = group();
  block(g, 0.75, 0.03, 0.6, '#3d3929', 0, 0, 0.05, { cast: false });
  cyl(g, 0.16, 0.18, 0.04, C.charcoal, 0, 0.03, -0.1);
  block(g, 0.035, 1.15, 0.035, C.charcoal, 0, 0.07, -0.1);
  const boom = block(g, 0.03, 0.03, 0.5, C.charcoal, 0, 1.2, 0.08);
  boom.rotation.x = -0.25;
  // Capsule in a shock mount.
  block(g, 0.11, 0.2, 0.11, '#5b574f', 0, 1.2, 0.33);
  block(g, 0.13, 0.03, 0.13, '#a9b4c0', 0, 1.3, 0.33);
  // Pop filter: a thin dark disc in a ring, in front of the mic.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 16), mat(C.charcoal));
  ring.position.set(0, 1.22, 0.47);
  g.add(ring);
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.095, 16), new THREE.MeshBasicMaterial({ color: '#1f1e1d', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
  mesh.position.copy(ring.position);
  g.add(mesh);
  return { group: g };
}
