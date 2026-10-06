// The things Clawd pulls out for each tool: a book for reading, a pencil for
// edits, a little terminal for commands, a game cartridge (with the app's
// badge on the label) for MCP connectors… Built from boxes, like Clawd.
// Each item stands on its origin with its front facing +z.

import * as THREE from 'three';
import { brandById, genericBrand } from './brands.js';
import { glow, toon } from './materials.js';

const U = 0.2; // one Clawd pixel

const M = {
  dark: toon('#2f2c26'),
  slate: toon('#3d3929'),
  grey: toon('#5b574f'),
  page: toon('#fbf6ec'),
  blue: toon('#6a9bcc'),
  blueDeep: toon('#4f7fae'),
  clay: toon('#d97757'),
  clayDeep: toon('#c15f3c'),
  kraft: toon('#d4a27f'),
  manilla: toon('#ebdbbc'),
  olive: toon('#788c5d'),
  metal: toon('#a9b4c0'),
  wood: toon('#8a5a3c'),
  pink: toon('#e8a07f'),
  red: toon('#bf4d43'),
  white: toon('#ffffff'),
  gold: toon('#e8b562'),
  shell: toon('#bdb8ad'),
  shellDark: toon('#9d978b'),
  box: toon('#c99a6b'),
  sky: toon('#8fc6fb'),
  grass: toon('#9bb07a'),
  sun: toon('#f2c14e'),
  paper: new THREE.MeshToonMaterial({ color: '#f7f3ea', flatShading: true }),
  lens: new THREE.MeshBasicMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.6 }),
  glowSky: glow('#bfe0ff'),
};

const geoCache = new Map();
function box(w, h, d) {
  const k = `b${w}|${h}|${d}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w * U, h * U, d * U));
  return geoCache.get(k);
}
function cyl(rt, rb, h, seg = 8) {
  const k = `c${rt}|${rb}|${h}|${seg}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.CylinderGeometry(rt * U, rb * U, h * U, seg));
  return geoCache.get(k);
}
function plane(w, h) {
  const k = `p${w}|${h}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.PlaneGeometry(w * U, h * U));
  return geoCache.get(k);
}

function part(g, geo, mat, [x = 0, y = 0, z = 0] = [], [rx = 0, ry = 0, rz = 0] = []) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x * U, y * U, z * U);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  g.add(m);
  return m;
}

// ── canvas faces ─────────────────────────────────────────────

const texCache = new Map();
function canvasTex(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  // The pixel font may still be loading: redraw once it's there.
  document.fonts?.ready.then(() => { g.clearRect(0, 0, w, h); draw(g, w, h); tex.needsUpdate = true; });
  return tex;
}
const faceMat = (tex) => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
const PX = '"Silkscreen", ui-monospace, monospace';

function cartridgeLabel(brand) {
  const b = brand || genericBrand('MCP');
  return canvasTex(`cart|${b.id || b.mono}|${b.bg}`, 64, 64, (g, w, h) => {
    // White sticker border, then the app's colours with its monogram, big.
    g.fillStyle = '#faf9f5';
    g.fillRect(0, 0, w, h);
    g.fillStyle = b.bg;
    g.fillRect(3, 3, w - 6, h - 6);
    g.fillStyle = b.fg;
    g.font = `${b.mono.length > 2 ? 20 : 30}px ${PX}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(b.mono, w / 2, h / 2 - 2);
    const stripe = b.stripe || [b.fg];
    const sw = (w - 6) / stripe.length;
    stripe.forEach((c, i) => { g.fillStyle = c; g.fillRect(3 + i * sw, h - 14, Math.ceil(sw), 8); });
  });
}

const promptTex = () => canvasTex('prompt', 64, 44, (g, w, h) => {
  g.fillStyle = '#1f1e1d';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#a3e635';
  g.font = `14px ${PX}`;
  g.textBaseline = 'top';
  g.fillText('>_', 6, 6);
  g.fillStyle = '#788c5d';
  g.fillRect(6, 26, 34, 3);
  g.fillRect(6, 33, 22, 3);
});

const questionTex = () => canvasTex('question', 48, 32, (g, w, h) => {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#6a9bcc';
  g.font = `22px ${PX}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('?', w / 2, h / 2 + 1);
});

const clockTex = () => canvasTex('clock', 32, 32, (g, w, h) => {
  g.fillStyle = '#fbf6ec';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#3d3929';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.fillRect(Math.round(16 + Math.sin(a) * 12) - 1, Math.round(16 - Math.cos(a) * 12) - 1, 2, 2);
  }
  g.fillRect(15, 7, 2, 10); // minute hand
  g.fillRect(15, 15, 7, 2); // hour hand
});

// ── the items ────────────────────────────────────────────────

const BUILD = {
  book(g) {
    part(g, box(1.7, 2.1, 0.5), M.blue, [0, 1.05, 0]);
    part(g, box(1.5, 1.9, 0.44), M.page, [0.14, 1.05, 0]);
    part(g, box(0.22, 2.1, 0.56), M.blueDeep, [-0.86, 1.05, 0]);
    part(g, box(1.0, 0.36, 0.04), M.manilla, [0.08, 1.45, 0.27]);
  },
  pencil(g) {
    const p = new THREE.Group();
    part(p, box(0.34, 2.2, 0.34), M.kraft, [0, 1.3, 0]);
    part(p, box(0.36, 0.22, 0.36), M.metal, [0, 0.12, 0]);
    part(p, box(0.34, 0.34, 0.34), M.pink, [0, -0.15, 0]);
    part(p, cyl(0.02, 0.22, 0.55, 6), M.manilla, [0, 2.67, 0]);
    part(p, cyl(0.01, 0.07, 0.18, 6), M.dark, [0, 2.95, 0]);
    p.rotation.z = -0.35;
    p.position.y = 0.2 * U;
    g.add(p);
  },
  magnifier(g) {
    part(g, box(0.26, 1.2, 0.26), M.wood, [0, 0.6, 0]);
    const cy = 1.95;
    part(g, box(1.6, 0.24, 0.24), M.metal, [0, cy + 0.68, 0]);
    part(g, box(1.6, 0.24, 0.24), M.metal, [0, cy - 0.68, 0]);
    part(g, box(0.24, 1.6, 0.24), M.metal, [-0.68, cy, 0]);
    part(g, box(0.24, 1.6, 0.24), M.metal, [0.68, cy, 0]);
    part(g, box(1.2, 1.2, 0.05), M.lens, [0, cy, 0]);
    part(g, box(0.3, 0.3, 0.06), M.white, [-0.3, cy + 0.3, 0.03]);
  },
  terminal(g) {
    part(g, box(2.3, 1.75, 0.3), M.dark, [0, 0.9, 0]);
    part(g, plane(2.0, 1.4), faceMat(promptTex()), [0, 0.92, 0.16]);
    part(g, box(0.9, 0.18, 0.5), M.grey, [0, 0.0, 0.05]);
  },
  globe(g) {
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0 * U, 1), new THREE.MeshToonMaterial({ color: '#6a9bcc', flatShading: true }));
    ball.position.y = 1.55 * U;
    ball.castShadow = true;
    g.add(ball);
    for (const [x, y, z, s] of [[0.55, 0.3, 0.7, 0.55], [-0.6, -0.2, 0.62, 0.45], [0.1, 0.75, -0.6, 0.5], [-0.35, 0.55, 0.75, 0.3]]) {
      part(g, box(s, s * 0.8, s), M.olive, [x * 0.95, 1.55 + y * 0.95, z * 0.95]);
    }
    part(g, box(0.18, 0.55, 0.18), M.metal, [0, 0.3, 0]);
    part(g, box(1.1, 0.16, 0.8), M.wood, [0, 0.05, 0]);
  },
  clipboard(g) {
    part(g, box(1.7, 2.2, 0.14), M.kraft, [0, 1.1, 0]);
    part(g, box(1.42, 1.75, 0.04), M.page, [0, 1.0, 0.09]);
    part(g, box(0.75, 0.32, 0.24), M.metal, [0, 2.15, 0.06]);
    for (let i = 0; i < 3; i++) {
      part(g, box(0.26, 0.26, 0.04), i < 2 ? M.olive : M.grey, [-0.45, 1.55 - i * 0.48, 0.12]);
      part(g, box(0.75, 0.12, 0.03), M.slate, [0.2, 1.55 - i * 0.48, 0.12]);
    }
  },
  megaphone(g) {
    part(g, cyl(0.8, 0.3, 1.6, 8), M.clay, [0, 1.4, 0.15], [Math.PI / 2 - 0.35, 0, 0]);
    part(g, cyl(0.82, 0.82, 0.16, 8), M.white, [0, 1.68, 0.88], [Math.PI / 2 - 0.35, 0, 0]);
    part(g, box(0.3, 0.9, 0.3), M.slate, [0, 0.45, -0.05]);
  },
  sign(g) {
    part(g, box(0.24, 1.4, 0.24), M.wood, [0, 0.7, 0]);
    part(g, box(2.3, 1.6, 0.16), M.white, [0, 2.0, 0]);
    part(g, plane(2.1, 1.4), faceMat(questionTex()), [0, 2.0, 0.09]);
  },
  scroll(g) {
    part(g, cyl(0.36, 0.36, 2.2, 8), M.manilla, [0, 0.45, 0], [0, 0, Math.PI / 2]);
    part(g, cyl(0.42, 0.42, 0.2, 8), M.kraft, [-1.15, 0.45, 0], [0, 0, Math.PI / 2]);
    part(g, cyl(0.42, 0.42, 0.2, 8), M.kraft, [1.15, 0.45, 0], [0, 0, Math.PI / 2]);
    part(g, cyl(0.39, 0.39, 0.28, 8), M.clayDeep, [0, 0.45, 0], [0, 0, Math.PI / 2]);
    part(g, box(0.2, 0.7, 0.06), M.clayDeep, [0.12, -0.05, 0.36], [0, 0, 0.25]);
  },
  wrench(g) {
    part(g, box(0.32, 2.0, 0.28), M.metal, [0, 1.0, 0]);
    part(g, box(0.4, 0.6, 0.3), M.metal, [-0.3, 2.15, 0]);
    part(g, box(0.4, 0.6, 0.3), M.metal, [0.3, 2.15, 0]);
    part(g, box(0.5, 0.36, 0.32), M.clay, [0, 0.2, 0]);
  },
  cartridge(g, brand) {
    // A chunky game cartridge: light grey shell, grip ridges on top, gold pins below.
    part(g, box(2.2, 2.4, 0.42), M.shell, [0, 1.3, 0]);
    part(g, box(2.2, 0.42, 0.5), M.shellDark, [0, 2.32, -0.02]);
    for (let i = 0; i < 3; i++) part(g, box(1.7, 0.07, 0.06), M.grey, [0, 2.22 + i * 0.12, 0.25]);
    part(g, plane(1.85, 1.85), faceMat(cartridgeLabel(brand)), [0, 1.17, 0.22]);
    part(g, box(1.5, 0.22, 0.3), M.gold, [0, 0.0, 0]);
  },
  clock(g) {
    part(g, cyl(0.95, 0.95, 0.4, 12), M.red, [0, 1.2, 0], [Math.PI / 2, 0, 0]);
    part(g, plane(1.4, 1.4), faceMat(clockTex()), [0, 1.2, 0.21]);
    part(g, box(0.5, 0.35, 0.4), M.gold, [-0.6, 2.15, 0], [0, 0, 0.5]);
    part(g, box(0.5, 0.35, 0.4), M.gold, [0.6, 2.15, 0], [0, 0, -0.5]);
    part(g, box(0.2, 0.4, 0.2), M.dark, [-0.55, 0.2, 0]);
    part(g, box(0.2, 0.4, 0.2), M.dark, [0.55, 0.2, 0]);
  },
  binoculars(g) {
    for (const x of [-0.5, 0.5]) {
      part(g, cyl(0.38, 0.38, 1.3, 8), M.dark, [x, 1.0, 0], [Math.PI / 2, 0, 0]);
      part(g, cyl(0.3, 0.3, 0.06, 8), M.glowSky, [x, 1.0, 0.68], [Math.PI / 2, 0, 0]);
    }
    part(g, box(0.62, 0.3, 0.5), M.grey, [0, 1.0, 0]);
  },
  envelope(g) {
    part(g, box(2.3, 1.55, 0.1), M.white, [0, 1.0, 0]);
    part(g, box(1.35, 0.14, 0.04), M.manilla, [-0.5, 1.3, 0.07], [0, 0, -0.55]);
    part(g, box(1.35, 0.14, 0.04), M.manilla, [0.5, 1.3, 0.07], [0, 0, 0.55]);
    part(g, box(0.34, 0.34, 0.08), M.clayDeep, [0, 0.98, 0.09]);
  },
  stop(g) {
    part(g, box(0.24, 1.4, 0.24), M.metal, [0, 0.7, 0]);
    part(g, cyl(1.0, 1.0, 0.16, 8), M.red, [0, 2.1, 0], [Math.PI / 2, Math.PI / 8, 0]);
    part(g, box(1.1, 0.28, 0.04), M.white, [0, 2.1, 0.1]);
  },
  bell(g) {
    part(g, cyl(0.35, 0.95, 1.2, 8), M.gold, [0, 1.0, 0]);
    part(g, box(0.3, 0.45, 0.3), M.wood, [0, 1.8, 0]);
    part(g, box(0.3, 0.3, 0.3), M.slate, [0, 0.3, 0]);
  },
};

Object.assign(BUILD, {
  scissors(g) {
    part(g, box(0.16, 1.7, 0.07), M.metal, [-0.14, 1.35, 0.03], [0, 0, 0.2]);
    part(g, box(0.16, 1.7, 0.07), M.metal, [0.14, 1.35, -0.03], [0, 0, -0.2]);
    for (const sx of [-1, 1]) {
      part(g, box(0.6, 0.14, 0.14), M.clay, [sx * 0.34, 0.66, 0]);
      part(g, box(0.6, 0.14, 0.14), M.clay, [sx * 0.34, 0.16, 0]);
      part(g, box(0.14, 0.62, 0.14), M.clay, [sx * 0.6, 0.41, 0]);
      part(g, box(0.14, 0.62, 0.14), M.clay, [sx * 0.08, 0.41, 0]);
    }
    part(g, box(0.16, 0.16, 0.18), M.dark, [0, 0.86, 0]);
  },
  hammer(g) {
    part(g, box(0.26, 2.0, 0.26), M.wood, [0, 1.0, 0]);
    part(g, box(1.3, 0.5, 0.5), M.metal, [0.15, 2.15, 0]);
    part(g, box(0.3, 0.36, 0.36), M.dark, [-0.62, 2.15, 0]);
  },
  broom(g) {
    // Hangs down from the hands: handle up top, bristles at the bottom.
    part(g, box(0.18, 3.8, 0.18), M.wood, [0, -1.9, 0]);
    part(g, box(0.5, 0.2, 0.42), M.clay, [0, -3.85, 0]);
    part(g, box(1.4, 0.9, 0.42), M.kraft, [0, -4.4, 0]);
  },
  box(g) {
    part(g, box(1.7, 1.3, 1.4), M.box, [0, 0.65, 0]);
    part(g, box(1.72, 0.08, 0.36), M.manilla, [0, 1.32, 0]);
    part(g, box(0.7, 0.45, 0.04), M.white, [0.3, 0.7, 0.71]);
  },
  mic(g) {
    part(g, box(0.3, 1.1, 0.3), M.dark, [0, 0.55, 0]);
    part(g, box(0.62, 0.62, 0.62), M.grey, [0, 1.38, 0]);
    part(g, box(0.66, 0.1, 0.66), M.metal, [0, 1.1, 0]);
  },
  camera(g) {
    part(g, box(1.8, 1.1, 0.75), M.dark, [0, 0.55, 0]);
    part(g, cyl(0.42, 0.42, 0.6, 10), M.grey, [0.2, 0.55, 0.65], [Math.PI / 2, 0, 0]);
    part(g, cyl(0.3, 0.3, 0.05, 10), M.glowSky, [0.2, 0.55, 0.97], [Math.PI / 2, 0, 0]);
    part(g, box(0.5, 0.3, 0.4), M.grey, [-0.45, 1.25, 0]);
    part(g, box(1.82, 0.14, 0.77), M.clay, [0, 0.82, 0]);
  },
  popcorn(g) {
    part(g, cyl(0.62, 0.48, 1.1, 8), M.red, [0, 0.55, 0]);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      part(g, box(0.16, 1.1, 0.04), M.white, [Math.sin(a) * 0.56, 0.55, Math.cos(a) * 0.56], [0, a, 0]);
    }
    for (const [x, z, y] of [[0, 0, 1.25], [0.25, 0.15, 1.15], [-0.25, -0.1, 1.18], [0.1, -0.25, 1.2], [-0.15, 0.25, 1.22]]) {
      part(g, box(0.3, 0.3, 0.3), x > 0 ? M.white : M.sun, [x, y, z], [x, z, 0]);
    }
  },
  polaroid(g) {
    part(g, box(1.4, 1.65, 0.05), M.white, [0, 0.82, 0]);
    part(g, box(1.15, 1.05, 0.03), M.sky, [0, 0.98, 0.03]);
    part(g, box(1.15, 0.4, 0.035), M.grass, [0, 0.62, 0.035]);
    part(g, box(0.25, 0.25, 0.04), M.sun, [0.3, 1.28, 0.04]);
  },
  antenna(g) {
    part(g, box(0.75, 1.3, 0.38), M.dark, [0, 0.65, 0]);
    part(g, box(0.1, 1.1, 0.1), M.metal, [0.22, 1.85, 0]);
    part(g, box(0.18, 0.18, 0.18), M.red, [0.22, 2.42, 0]);
    for (let i = 0; i < 3; i++) part(g, box(0.5, 0.06, 0.04), M.grey, [0, 0.95 - i * 0.16, 0.2]);
  },
  paperBall(g) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45 * U, 0), M.paper);
    m.position.y = 0.45 * U;
    m.castShadow = true;
    g.add(m);
  },
  paperPlane(g) {
    part(g, box(0.1, 0.12, 1.6), M.white, [0, 0.2, 0]);
    part(g, box(0.9, 0.04, 1.4), M.white, [-0.42, 0.26, -0.08], [0, -0.08, -0.32]);
    part(g, box(0.9, 0.04, 1.4), M.white, [0.42, 0.26, -0.08], [0, 0.08, 0.32]);
  },
  brush(g) {
    part(g, box(0.18, 1.7, 0.18), M.wood, [0, 0.85, 0]);
    part(g, box(0.26, 0.34, 0.26), M.metal, [0, 1.85, 0]);
    part(g, box(0.28, 0.5, 0.28), M.clayDeep, [0, 2.25, 0]);
  },
  letter(g) {
    part(g, box(1.45, 1.9, 0.03), M.white, [0, 0.95, 0]);
    part(g, box(0.7, 0.1, 0.02), M.clay, [-0.25, 1.62, 0.025]);
    for (let i = 0; i < 5; i++) part(g, box(i === 4 ? 0.6 : 1.05, 0.06, 0.02), M.grey, [i === 4 ? -0.22 : 0, 1.35 - i * 0.22, 0.025]);
  },
  calculator(g) {
    part(g, box(1.1, 1.55, 0.22), M.dark, [0, 0.78, 0]);
    part(g, box(0.85, 0.36, 0.04), M.glowSky, [0, 1.3, 0.12]);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) part(g, box(0.2, 0.16, 0.05), r === 2 && c === 2 ? M.clay : M.metal, [-0.27 + c * 0.27, 0.92 - r * 0.24, 0.12]);
  },
  rocket(g) {
    part(g, cyl(0.45, 0.45, 2.0, 8), M.white, [0, 1.2, 0]);
    part(g, cyl(0.02, 0.45, 0.8, 8), M.clay, [0, 2.6, 0]);
    part(g, cyl(0.2, 0.2, 0.06, 8), M.glowSky, [0, 1.65, 0.44], [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      part(g, box(0.1, 0.7, 0.6), M.clay, [Math.sin(a) * 0.5, 0.45, Math.cos(a) * 0.5], [0, a, 0]);
    }
    part(g, cyl(0.3, 0.38, 0.25, 8), M.grey, [0, 0.12, 0]);
  },
});

/**
 * How Clawd holds each item: in the right hand (R), the left hand (L), or out
 * in front with both hands (F). Offsets are in the arm's (or body's) space.
 */
export const GRIP = {
  default: { where: 'R', pos: [0.23, -0.04, 0.12], rot: [0.2, 0, 0], scale: 0.5 },
  hammer: { where: 'R', pos: [0.24, -0.06, 0.1], rot: [0.35, 0, -0.15], scale: 0.52 },
  scissors: { where: 'R', pos: [0.24, -0.04, 0.12], rot: [1.0, 0, -0.3], scale: 0.48 },
  brush: { where: 'R', pos: [0.24, -0.06, 0.12], rot: [0.85, 0, -0.2], scale: 0.5 },
  mic: { where: 'R', pos: [0.22, -0.02, 0.14], rot: [-0.2, 0, 0.75], scale: 0.48 },
  antenna: { where: 'R', pos: [0.24, -0.06, 0.1], rot: [0, 0, 0.2], scale: 0.5 },
  paperBall: { where: 'R', pos: [0.25, -0.02, 0.1], rot: [0, 0, 0], scale: 0.55 },
  paperPlane: { where: 'R', pos: [0.24, 0.02, 0.12], rot: [0, 0, 0], scale: 0.5 },
  polaroid: { where: 'R', pos: [0.22, 0, 0.16], rot: [-0.25, -0.35, 0.25], scale: 0.48 },
  megaphone: { where: 'R', pos: [0.22, -0.05, 0.1], rot: [0, 0, 0.2], scale: 0.5 },
  stop: { where: 'R', pos: [0.22, -0.08, 0.06], rot: [0, 0, 0], scale: 0.55 },
  bell: { where: 'R', pos: [0.23, -0.05, 0.1], rot: [0, 0, 0], scale: 0.45 },
  clipboard: { where: 'L', pos: [-0.22, -0.05, 0.16], rot: [-0.55, 0.3, 0], scale: 0.56 },
  clock: { where: 'L', pos: [-0.22, -0.04, 0.14], rot: [0, 0.4, 0], scale: 0.52 },
  popcorn: { where: 'L', pos: [-0.25, -0.06, 0.16], rot: [0, 0, 0], scale: 0.64 },
  cartridge: { where: 'L', pos: [-0.22, -0.05, 0.14], rot: [-0.2, 0.3, 0], scale: 0.45 },
  box: { where: 'F', pos: [0, 0.18, 0.5], rot: [0, 0, 0], scale: 0.55 },
  camera: { where: 'F', pos: [0, 0.5, 0.44], rot: [0, 0, 0], scale: 0.52 },
  binoculars: { where: 'F', pos: [0, 0.56, 0.42], rot: [0, 0, 0], scale: 0.52 },
  envelope: { where: 'F', pos: [0, 0.55, 0.45], rot: [-0.15, 0, 0], scale: 0.5 },
  sign: { where: 'F', pos: [0, 0.3, 0.45], rot: [0, 0, 0], scale: 0.55 },
  scroll: { where: 'F', pos: [0, 0.4, 0.48], rot: [0, 0, 0], scale: 0.55 },
  broom: { where: 'F', pos: [0.1, 0.55, 0.45], rot: [0.45, 0, 0.35], scale: 0.55 },
  letter: { where: 'F', pos: [0, 0.5, 0.52], rot: [-0.3, 0, 0], scale: 0.66 },
  calculator: { where: 'L', pos: [-0.22, -0.02, 0.16], rot: [-0.55, 0.35, 0], scale: 0.5 },
};

const isConnector = (x) => !!(x && (x.server || x.tool?.startsWith('mcp__')));

/** Which item goes with a tool call (an act from the snapshot, or a log entry). */
export function itemFor(act) {
  const t = act?.tool || '';
  if (isConnector(act)) return 'cartridge';
  switch (t) {
    case 'Read': case 'NotebookRead': case 'LSP': return 'book';
    case 'Edit': case 'MultiEdit': case 'Write': case 'NotebookEdit': return 'pencil';
    case 'Grep': case 'Glob': case 'LS': case 'ToolSearch': return 'magnifier';
    case 'Bash': case 'PowerShell': case 'BashOutput': case 'TaskOutput': return 'terminal';
    case 'KillShell': case 'KillBash': case 'TaskStop': return 'stop';
    case 'Monitor': return 'binoculars';
    case 'WebSearch': case 'WebFetch': return 'globe';
    case 'TaskCreate': case 'TaskUpdate': case 'TaskList': case 'TaskGet': case 'TodoWrite': case 'EnterPlanMode': return 'clipboard';
    case 'AskUserQuestion': case 'ExitPlanMode': return 'sign';
    case 'Agent': case 'Task': case 'SendMessage': case 'Workflow': return 'megaphone';
    case 'Skill': return 'scroll';
    case 'SendUserFile': case 'Artifact': return 'envelope';
    case 'PushNotification': return 'bell';
    case 'ScheduleWakeup': case 'CronCreate': case 'CronDelete': case 'CronList': return 'clock';
    default: return 'wrench';
  }
}

/** The brand object for an act's connector (or a generic one), or null for built-in tools. */
export function brandFor(act) {
  if (!isConnector(act)) return null;
  return brandById(act.brand) || genericBrand(act.serverName || act.server || 'Connector');
}

/** A fresh item. Geometry and materials are shared, so these are cheap. */
export function buildItem(kind, brand = null) {
  const g = new THREE.Group();
  (BUILD[kind] || BUILD.wrench)(g, brand);
  g.userData.kind = kind;
  return g;
}
