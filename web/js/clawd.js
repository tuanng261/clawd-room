// Clawd, Claude Code's mascot, rebuilt in 3D from the terminal sprite:
//
//    ▐▛███▜▌      wide body with two tall eye slots,
//   ▝▜█████▛▘     stubby arms sticking out sideways,
//     ▘▘ ▝▝       and four little legs.
//
// Everything is procedural: each pose sets target joint angles and a facial
// expression, and the joints ease toward them, so poses blend for free. On top
// of the pose, a feeling (feelings.js) adds brows, a mouth, sweat or a 💢, a
// way of moving, and now and then an emoji.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { clamp, damp, dampAngle, esc } from './util.js';
import { icon } from './icons.js';
import { FEELINGS } from './feelings.js';
import { buildItem, GRIP } from './items.js';
import { glow, toon } from './materials.js';

export const U = 0.2; // one sprite pixel (half a terminal character wide)
export const HEIGHT = 5 * U;

const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const G = {
  torso: B(6 * U, 4 * U, 3.6 * U),
  eye: B(0.5 * U, U, 0.06),
  bar: B(0.62 * U, 0.17 * U, 0.06),
  stub: B(0.17 * U, 0.3 * U, 0.06),
  blush: B(0.75 * U, 0.3 * U, 0.04),
  arm: B(1.05 * U, U, 1.7 * U),
  leg: B(0.62 * U, 1.02 * U, 1.2 * U),
  cap: B(2.9 * U, 0.85 * U, 2.7 * U),
  capBand: B(2.96 * U, 0.2 * U, 2.76 * U),
  brim: B(3.0 * U, 0.17 * U, 1.3 * U),
  cover: B(2.7 * U, 0.08 * U, 1.9 * U),
  page: B(1.25 * U, 0.1 * U, 1.75 * U),
  pad: B(1.2 * U, 0.1 * U, 1.5 * U),
  padLine: B(0.9 * U, 0.03 * U, 0.08 * U),
  pencil: B(0.14 * U, 0.14 * U, 1.2 * U),
  pencilTip: B(0.1 * U, 0.1 * U, 0.2 * U),
  frameH: B(1.0 * U, 0.16 * U, 0.16 * U),
  frameV: B(0.16 * U, 1.0 * U, 0.16 * U),
  lens: B(0.7 * U, 0.7 * U, 0.04 * U),
  handle: B(0.16 * U, 0.75 * U, 0.16 * U),
  marker: B(0.22 * U, 0.22 * U, 0.95 * U),
  bulb: B(0.62 * U, 0.62 * U, 0.62 * U),
  bulbBase: B(0.42 * U, 0.3 * U, 0.42 * U),
  ray: B(0.12 * U, 0.4 * U, 0.12 * U),
  sweat: B(0.26 * U, 0.42 * U, 0.12 * U),
  shadow: new THREE.CircleGeometry(0.66, 24),
  // Feelings: brows, a shine in the eyes, mouths, the 💢 vein.
  brow: B(0.78 * U, 0.2 * U, 0.05),
  glint: B(0.2 * U, 0.26 * U, 0.02),
  mouthBar: B(0.86 * U, 0.17 * U, 0.05),
  mouthStub: B(0.17 * U, 0.3 * U, 0.05),
  mouthO: B(0.36 * U, 0.42 * U, 0.05),
  mouthOpen: B(1.0 * U, 0.52 * U, 0.05),
  tongue: B(0.56 * U, 0.2 * U, 0.02),
  mouthYawn: B(0.52 * U, 0.72 * U, 0.05),
  wave: B(0.22 * U, 0.15 * U, 0.05),
  veinBar: B(0.3 * U, 0.09 * U, 0.04),
};

const MAT = {
  eye: toon('#1d1512'),
  blush: toon('#e8a07f'),
  page: toon('#fbf6ec'),
  metal: toon('#a9b4c0'),
  lens: new THREE.MeshBasicMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.55 }),
  wood: toon('#8a5a3c'),
  pad: toon('#ebdbbc'),
  line: toon('#7b8496'),
  pencil: toon('#d4a27f'),
  marker: toon('#c15f3c'),
  bulb: glow('#ffe7a8'),
  bulbBase: toon('#9aa3ad'),
  ray: glow('#f5c77e'),
  sweat: glow('#a9c8e6'),
  blue: toon('#6a9bcc'),
  glint: glow('#ffffff'),
  tongue: toon('#ef8f87'),
  vein: glow('#a8231b'),
  veinBright: glow('#ff5a4a'),
};

let shadowTex = null;
function blobShadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 2, 16, 16, 15);
  grd.addColorStop(0, 'rgba(30,18,40,0.5)');
  grd.addColorStop(0.7, 'rgba(30,18,40,0.25)');
  grd.addColorStop(1, 'rgba(30,18,40,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  shadowTex = new THREE.CanvasTexture(c);
  shadowTex.magFilter = THREE.NearestFilter;
  return shadowTex;
}

// Which pose each station uses.
export const STATION_POSE = {
  desk: 'type', terminal: 'type', bookshelf: 'read', cabinet: 'search', globe: 'look',
  whiteboard: 'draw', workbench: 'tinker', portal: 'summon', stage: 'wave',
};

// Facial expressions: per-eye scale/offset/tilt, plus blush, sweat and "happy" (∩ ∩) eyes.
const FACES = {
  neutral: { sx: 1, sy: 1, dx: 0, dy: 0, rot: 0 },
  focus: { sx: 1, sy: 0.55, dx: 0, dy: -0.12, rot: 0 },
  hmm: { sx: 1, sy: 0.9, dx: 0.22, dy: 0.24, rot: 0, rightSy: 0.6 },
  hmmLeft: { sx: 1, sy: 0.9, dx: -0.22, dy: 0.24, rot: 0, leftSy: 0.6 },
  lookdown: { sx: 1, sy: 0.65, dx: 0, dy: -0.28, rot: 0 },
  happy: { sx: 1, sy: 1, dx: 0, dy: 0.05, rot: 0, happy: true, blush: true, mouth: 'smile' },
  surprised: { sx: 1.35, sy: 1.15, dx: 0, dy: 0.06, rot: 0, mouth: 'o' },
  worried: { sx: 1, sy: 0.8, dx: 0, dy: 0, rot: 0.38, sweat: true },
  sleepy: { sx: 1.1, sy: 0.12, dx: 0, dy: -0.15, rot: 0 },
  curious: { sx: 1, sy: 1.12, dx: 0, dy: 0.05, rot: 0, rightSy: 0.8, blush: true },
};

const POSE_PROP = { read: 'book', search: 'magnifier', draw: 'marker', tinker: 'wrench' };

// Looping poses with a moment that matters (the hammer lands, the shutter
// clicks…): [period in seconds, where in the loop it happens]. Clawd plays
// small effects itself; throws and launches are passed to the room.
const BEATS = {
  hammer: [0.9, 0.7], toss: [1.8, 0.42], launch: [3.2, 0.2], catch: [3.0, 0.05], shelve: [2.2, 0.6],
  photo: [1.5, 0.8], sing: [0.55, 0], listen: [1.6, 0.3], antenna: [0.8, 0], sweep: [0.62, 0.3],
  paint: [1.6, 0.45], unbox: [1.3, 0.5], watch: [2.4, 0.15], snip: [0.9, 0.1], perform: [1.1, 0.05],
  checklist: [1.4, 0.15], knobs: [2.2, 0.5], tap: [0.8, 0.12], write: [2.5, 0.9],
  count: [1.8, 0.5], frame: [2.6, 0.6], sleuth: [5.0, 0.7], recall: [2.6, 0.5], wordsmith: [3.6, 0.75],
};
const MATH_BITS = ['+', '−', '×', '=', '%', '42', '÷', '7'];
// Which built-in props each hand-held item replaces.
const HAND_PROPS = { R: ['magnifier', 'marker', 'wrench', 'pencil'], L: ['pad'], F: ['book'] };
const THINK_STEPS = ['scratch', 'notes', 'tap', 'look'];

// Where the camera is (world yaw and pitch), so items held up face the viewer.
let VIEW_YAW = Math.PI / 4;
let VIEW_PITCH = 0.6;
export function setViewYaw(yaw, pitch = VIEW_PITCH) { VIEW_YAW = yaw; VIEW_PITCH = pitch; }

const lerp = (a, b, k) => a + (b - a) * k;
const easeOutBack = (x) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);
const PULL_T = 1.75; // seconds for the whole "pull out a tool" move
const ITEM_SCALE = 1.4;

// Tiny cubes: sparkles, code bits while typing, smoke when something fails.
const SPARK_GEO = new THREE.BoxGeometry(0.045, 0.045, 0.045);
const SPARK = {
  gold: glow('#ffe7a8'), white: glow('#ffffff'), clay: glow('#f0a678'), olive: glow('#b5c98f'),
  sky: glow('#a9c8e6'), green: glow('#a3e635'), smoke: toon('#b0aea5'), pink: glow('#f2a7c3'), steam: toon('#f4f1ea'),
};

export class Sparks {
  constructor(parent, n = 36) {
    this.pool = [];
    this.i = 0;
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(SPARK_GEO, SPARK.gold);
      m.visible = false;
      m.userData = { life: 0, max: 1, vx: 0, vy: 0, vz: 0, s: 1, float: false };
      parent.add(m);
      this.pool.push(m);
    }
  }

  emit(x, y, z, { n = 8, speed = 0.9, up = 0.4, life = 0.6, mats = ['gold', 'white'], size = 1, float = false, dir = null } = {}) {
    for (let k = 0; k < n; k++) {
      const m = this.pool[this.i++ % this.pool.length];
      const d = m.userData;
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.5 + Math.random() * 0.5);
      m.position.set(x + (Math.random() - 0.5) * 0.06, y + (Math.random() - 0.5) * 0.04, z + (Math.random() - 0.5) * 0.06);
      if (dir) {
        d.vx = dir[0] + (Math.random() - 0.5) * 0.2;
        d.vy = dir[1] + Math.random() * 0.15;
        d.vz = dir[2] + (Math.random() - 0.5) * 0.15;
      } else {
        d.vx = Math.cos(a) * sp;
        d.vy = up * (0.6 + Math.random() * 0.8);
        d.vz = Math.sin(a) * sp * 0.6;
      }
      d.life = 0;
      d.max = life * (0.75 + Math.random() * 0.5);
      d.s = size * (0.8 + Math.random() * 0.5);
      d.float = float;
      m.material = SPARK[mats[k % mats.length]] || SPARK.gold;
      m.visible = true;
    }
  }

  update(dt) {
    for (const m of this.pool) {
      if (!m.visible) continue;
      const d = m.userData;
      d.life += dt;
      const k = d.life / d.max;
      if (k >= 1) { m.visible = false; continue; }
      m.position.x += d.vx * dt;
      m.position.y += d.vy * dt;
      m.position.z += d.vz * dt;
      d.vy += (d.float ? 0.25 : -1.8) * dt; // smoke drifts up, sparks fall
      d.vx *= 0.97;
      d.vz *= 0.97;
      const sc = d.float ? d.s * (0.6 + k * 1.8) * (1 - k * k) : d.s * (1 - k * k);
      m.scale.setScalar(Math.max(0.001, sc));
      m.rotation.x += dt * 4;
      m.rotation.y += dt * 3;
    }
  }
}

export class Clawd {
  constructor({ color = '#d97757', scale = 1, hat = null, id = 'main', speed = 3, skin = 'clawd' } = {}) {
    this.id = id;
    this.scale = scale;
    this.speed = speed;
    this.root = new THREE.Group();
    this.root.userData.workerId = id;
    this.lift = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.lift);
    this.lift.add(this.body);

    // Codex gets its own look on the same body: a charcoal little terminal with a
    // light screen for a face and a cursor blinking on its head.
    this.skin = skin;
    this.mat = toon(skin === 'codex' ? '#2f3238' : color, { unique: true });
    const torso = new THREE.Mesh(G.torso, this.mat);
    torso.position.y = 3 * U;
    torso.castShadow = true;
    torso.receiveShadow = true;
    this.body.add(torso);
    if (skin === 'codex') {
      const screen = new THREE.Mesh(B(5.0 * U, 2.7 * U, 0.02), toon('#eef1ef'));
      screen.position.set(0, 3.35 * U, 1.8 * U + 0.01);
      this.body.add(screen);
      this.cursor = new THREE.Mesh(B(0.95 * U, 0.4 * U, 0.7 * U), glow('#7fd1b9'));
      this.cursor.position.set(1.7 * U, 5.2 * U, 0.6 * U);
      this.body.add(this.cursor);
    }

    // Eyes: a tall slot, or ∩ when happy.
    const front = 1.8 * U + (skin === 'codex' ? 0.03 : 0.012); // the face (Codex's is on its screen)
    this.eyes = [-1, 1].map((side) => {
      const g = new THREE.Group();
      g.position.set(side * 1.75 * U, 3.5 * U, front);
      const slot = new THREE.Mesh(G.eye, MAT.eye);
      const glint = new THREE.Mesh(G.glint, MAT.glint); // shiny eyes (excited, hopeful)
      glint.position.set(0.1 * U, 0.22 * U, 0.035);
      glint.visible = false;
      slot.add(glint);
      const happy = new THREE.Group();
      const top = new THREE.Mesh(G.bar, MAT.eye);
      top.position.y = 0.16 * U;
      const l = new THREE.Mesh(G.stub, MAT.eye);
      l.position.set(-0.23 * U, -0.02 * U, 0);
      const r = new THREE.Mesh(G.stub, MAT.eye);
      r.position.set(0.23 * U, -0.02 * U, 0);
      happy.add(top, l, r);
      happy.visible = false;
      g.add(slot, happy);
      this.body.add(g);
      return { g, slot, happy, glint, side };
    });
    this.blush = [-1, 1].map((side) => {
      const m = new THREE.Mesh(G.blush, MAT.blush);
      m.position.set(side * 2.35 * U, 2.75 * U, 1.8 * U + (skin === 'codex' ? 0.03 : 0.01));
      m.visible = false;
      this.body.add(m);
      return m;
    });
    this.sweat = new THREE.Mesh(G.sweat, MAT.sweat); // on the face's top corner, sliding down
    this.sweat.position.set(2.55 * U, 4.6 * U, front + 0.02);
    this.sweat.visible = false;
    this.body.add(this.sweat);

    // Feelings: brows and a mouth only show up when a feeling calls for them
    // (the sprite has neither), plus a 💢 for when nothing works.
    this.brows = [-1, 1].map((side) => {
      const mesh = new THREE.Mesh(G.brow, MAT.eye);
      mesh.position.set(side * 1.75 * U, 4.32 * U, front);
      mesh.visible = false;
      this.body.add(mesh);
      return { mesh, side };
    });
    this.browBase = 4.32;
    this.browState = { a: 0, l: 0, q: 0, show: 0 };
    this.mouths = {};
    const mouth = new THREE.Group();
    mouth.position.set(0, 2.42 * U, front);
    const part = (shape, geo, x, y, mat = MAT.eye, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x * U, y * U, z);
      (this.mouths[shape] ||= new THREE.Group()).add(m);
      return m;
    };
    part('smile', G.mouthBar, 0, -0.1); part('smile', G.mouthStub, -0.345, 0.06); part('smile', G.mouthStub, 0.345, 0.06);
    part('frown', G.mouthBar, 0, 0.1); part('frown', G.mouthStub, -0.345, -0.06); part('frown', G.mouthStub, 0.345, -0.06);
    part('flat', G.mouthBar, 0, 0);
    part('o', G.mouthO, 0, 0);
    part('grin', G.mouthOpen, 0, 0); part('grin', G.tongue, 0, -0.13, MAT.tongue, 0.03);
    this.waves = [0, 1, 2, 3].map((i) => part('wavy', G.wave, -0.33 + i * 0.22, i % 2 ? 0.05 : -0.05));
    part('yawn', G.mouthYawn, 0, -0.05);
    for (const m of Object.values(this.mouths)) { m.visible = false; mouth.add(m); }
    this.body.add(mouth);
    this.mouthShape = null;
    this.mouthAt = 0;
    this.vein = new THREE.Group();
    const veinMat = skin === 'codex' ? MAT.veinBright : MAT.vein; // deep red on orange, bright red on charcoal
    for (const qx of [-1, 1]) {
      for (const qy of [-1, 1]) {
        const h = new THREE.Mesh(G.veinBar, veinMat);
        h.position.set(qx * 0.2 * U, qy * 0.07 * U, 0);
        const v = new THREE.Mesh(G.veinBar, veinMat);
        v.rotation.z = Math.PI / 2;
        v.position.set(qx * 0.07 * U, qy * 0.2 * U, 0);
        this.vein.add(h, v);
      }
    }
    this.vein.position.set(2.45 * U, 4.55 * U, front + 0.005);
    this.vein.visible = false;
    this.body.add(this.vein);

    // Arm pivots sit on the sides of the torso; the stub sticks outward.
    this.arms = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 3 * U, 2.5 * U, 0);
      const arm = new THREE.Mesh(G.arm, this.mat);
      arm.position.x = side * 0.5 * U;
      arm.castShadow = true;
      pivot.add(arm);
      this.body.add(pivot);
      return pivot;
    });

    // Four legs in a row, like the sprite. Pivots at the hip.
    this.legs = [-2.25, -1.25, 1.25, 2.25].map((x) => {
      const pivot = new THREE.Group();
      pivot.position.set(x * U, U, 0);
      const leg = new THREE.Mesh(G.leg, this.mat);
      leg.position.y = -0.5 * U;
      leg.castShadow = true;
      pivot.add(leg);
      this.body.add(pivot);
      return pivot;
    });

    if (hat) this.addHat(hat);
    this.buildProps();
    this.buildBulb();

    // Items pulled out for tools, plus sparkles and other little effects.
    this.itemHold = new THREE.Group();
    this.lift.add(this.itemHold);
    this.items = new Map();
    this.item = null;
    this.pull = null;
    this.nextPull = null;
    this.fx = new Sparks(this.lift);
    this.hand = null; // item held while working (hammer, scissors, mic…)
    this.handKey = '';
    this.handCache = new Map();
    this.handAt = -10;
    this.beatN = null;
    this.target = null; // room point the current work aims at (for throws)
    this.onAction = null; // room hook: throws, launches, catches
    this.bitAcc = 0;
    this.bitsTone = 'code';
    this.floats = [];

    const blob = new THREE.Mesh(
      G.shadow,
      new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.012;
    blob.renderOrder = 1;
    this.root.add(blob);
    this.blob = blob;

    // Floating label + bubble (HTML, projected from 3D).
    this.tagEl = document.createElement('div');
    this.tagEl.className = 'tag-anchor';
    this.tag = new CSS2DObject(this.tagEl);
    this.tag.position.set(0, HEIGHT + 0.42, 0);
    this.lift.add(this.tag);
    this.bubbleEl = document.createElement('div');
    this.bubbleEl.className = 'bubble-anchor';
    this.bubble = new CSS2DObject(this.bubbleEl);
    this.bubble.position.set(0, HEIGHT + 0.12, 0);
    this.lift.add(this.bubble);
    // Thought bubbles sit on top of the label, so they share its anchor point.
    this.thoughtEl = document.createElement('div');
    this.thoughtEl.className = 'bubble-anchor';
    this.thoughtObj = new CSS2DObject(this.thoughtEl);
    this.thoughtObj.position.copy(this.tag.position);
    this.lift.add(this.thoughtObj);
    // "You got: Bash!" label shown while an item is held up.
    this.getEl = document.createElement('div');
    this.getEl.className = 'tag-anchor';
    this.getObj = new CSS2DObject(this.getEl);
    this.getObj.position.set(0, HEIGHT + 1.02, 0);
    this.lift.add(this.getObj);
    this.tagKey = '';
    this.bubbleKey = '';

    // Motion state.
    this.pos = new THREE.Vector2();
    this.heading = Math.PI / 4;
    this.face = null;
    this.path = [];
    this.walked = 0;
    this.phase = 0;
    this.seat = 0;
    this.pose = 'idle';
    this.poseAt = 0;
    this.now = 0;
    this.blinkAt = 1 + Math.random() * 3;
    this.shakeUntil = 0;
    this.hopUntil = 0;
    this.moodUntil = 0;
    this.mood = null;
    // Feelings (feelings.js): the ongoing one, a short reaction on top, emoji pops.
    this.feel = null;
    this.reaction = null;
    this.popAt = Infinity;
    this.emojiAt = -10;
    this.emojiFeel = null;
    this.emojiGap = id === 'main' ? 7 : 12; // seconds between emoji (helpers are quieter)
    this.fxAt = {};
    this.seed = Math.random() * 10;
    this.tempo = 1; // feelings speed up or slow down how Clawd moves
    this.clock = 0;
    this.poseClock = 0;
    this.ideaAt = -10;
    this.appear = 0;
    this.vanishing = false;
    this.onArrive = null;
    this.j = { armLy: 0, armLz: 0, armRy: 0, armRz: 0, legs: [0, 0, 0, 0], lean: 0, twist: 0, tilt: 0, squash: 1, hop: 0 };
    this.eyeState = { sx: 1, sy: 1, dx: 0, dy: 0, rot: 0, lsy: 1, rsy: 1, open: 1 };
    this.root.scale.setScalar(0.0001);
  }

  addHat(color) {
    const hatMat = toon(color);
    const band = toon('#ffffff');
    const hat = new THREE.Group();
    const top = new THREE.Mesh(G.cap, hatMat);
    top.position.y = 0.42 * U;
    const ring = new THREE.Mesh(G.capBand, band);
    ring.position.y = 0.12 * U;
    const brim = new THREE.Mesh(G.brim, hatMat);
    brim.position.set(0, 0.06 * U, 1.75 * U);
    for (const m of [top, ring, brim]) { m.castShadow = true; hat.add(m); }
    hat.position.set(0, 5 * U, -0.15 * U);
    this.body.add(hat);
  }

  /** Room accessory: glasses (lab), headphones (studio), beret (art room), graduation cap (classroom). */
  wear(kind) {
    if (!kind) return;
    const g = new THREE.Group();
    const dark = toon('#1f1e1d');
    const add = (geo, m, x, y, z, ry = 0, rz = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.rotation.set(0, ry, rz);
      mesh.castShadow = true;
      g.add(mesh);
      return mesh;
    };
    const front = 1.8 * U + 0.035;
    if (kind === 'glasses') {
      for (const side of [-1, 1]) {
        const cx = side * 1.75 * U;
        const cy = 3.5 * U;
        add(B(1.15 * U, 0.15 * U, 0.05), dark, cx, cy + 0.74 * U, front);
        add(B(1.15 * U, 0.15 * U, 0.05), dark, cx, cy - 0.74 * U, front);
        add(B(0.15 * U, 1.6 * U, 0.05), dark, cx - 0.57 * U, cy, front);
        add(B(0.15 * U, 1.6 * U, 0.05), dark, cx + 0.57 * U, cy, front);
      }
      add(B(2.3 * U, 0.15 * U, 0.05), dark, 0, 3.5 * U + 0.4 * U, front);
      this.browBase = 4.6; // brows go above the frames
    } else if (kind === 'headphones') {
      const cup = toon('#d97757');
      add(B(6.5 * U, 0.3 * U, 0.7 * U), dark, 0, 5.15 * U, 0);
      for (const side of [-1, 1]) {
        add(B(0.3 * U, 1.5 * U, 0.7 * U), dark, side * 3.15 * U, 4.45 * U, 0);
        add(B(0.55 * U, 1.1 * U, 1.15 * U), cup, side * 3.25 * U, 3.6 * U, 0);
      }
    } else if (kind === 'beret') {
      const beret = add(new THREE.CylinderGeometry(1.75 * U, 1.9 * U, 0.5 * U, 10), toon('#c15f3c'), 0.5 * U, 5.25 * U, 0, 0, -0.18);
      beret.scale.z = 0.9;
      add(B(0.22 * U, 0.35 * U, 0.22 * U), toon('#c15f3c'), 0.35 * U, 5.62 * U, 0);
    } else if (kind === 'gradcap') {
      const slate = toon('#3d3929');
      add(B(2.7 * U, 0.6 * U, 2.5 * U), slate, 0, 5.3 * U, 0);
      add(B(4.2 * U, 0.18 * U, 4.2 * U), slate, 0, 5.68 * U, 0, Math.PI / 4);
      const kraft = toon('#d4a27f');
      add(B(0.32 * U, 0.14 * U, 0.32 * U), kraft, 0, 5.82 * U, 0);
      add(B(0.08 * U, 0.08 * U, 1.45 * U), kraft, 0, 5.82 * U, 0.75 * U);
      add(B(0.09 * U, 1.0 * U, 0.09 * U), kraft, 0, 5.35 * U, 1.45 * U);
      add(B(0.26 * U, 0.4 * U, 0.26 * U), kraft, 0, 4.75 * U, 1.45 * U);
    }
    this.body.add(g);
    this.accessory = g;
  }

  buildProps() {
    const left = this.arms[0];
    const right = this.arms[1];
    this.props = {};
    // Open book, held in front of the belly.
    const book = new THREE.Group();
    const cover = new THREE.Mesh(G.cover, MAT.blue);
    const pl = new THREE.Mesh(G.page, MAT.page);
    const pr = new THREE.Mesh(G.page, MAT.page);
    pl.position.set(-0.66 * U, 0.08 * U, 0); pl.rotation.z = 0.12;
    pr.position.set(0.66 * U, 0.08 * U, 0); pr.rotation.z = -0.12;
    book.add(cover, pl, pr);
    book.position.set(0, 2.0 * U, 2.6 * U);
    book.rotation.x = -0.8; // pages tilted up toward the eyes
    this.body.add(book);
    this.props.book = book;
    this.pageFlip = pr;
    // Square pixel magnifying glass in the right hand.
    const mag = new THREE.Group();
    for (const [geo, x, y] of [[G.frameH, 0, 0.5], [G.frameH, 0, -0.42], [G.frameV, -0.42, 0.04], [G.frameV, 0.42, 0.04]]) {
      const m = new THREE.Mesh(geo, MAT.metal);
      m.position.set(x * U, y * U + 0.95 * U, 0);
      mag.add(m);
    }
    const lens = new THREE.Mesh(G.lens, MAT.lens);
    lens.position.y = 0.99 * U;
    const handle = new THREE.Mesh(G.handle, MAT.wood);
    handle.position.y = 0.1 * U;
    mag.add(lens, handle);
    mag.position.set(1.15 * U, 0.15 * U, 0.6 * U);
    right.add(mag);
    this.props.magnifier = mag;
    // Marker for the whiteboard.
    const marker = new THREE.Mesh(G.marker, MAT.marker);
    marker.position.set(1.2 * U, 0.1 * U, 0.55 * U);
    right.add(marker);
    this.props.marker = marker;
    // Pixel wrench.
    const wrench = new THREE.Group();
    const shaft = new THREE.Mesh(G.handle, MAT.metal);
    shaft.scale.y = 1.4;
    const jawL = new THREE.Mesh(G.stub, MAT.metal);
    const jawR = new THREE.Mesh(G.stub, MAT.metal);
    jawL.scale.set(1.4, 1.2, 2.5);
    jawR.scale.set(1.4, 1.2, 2.5);
    jawL.position.set(-0.17 * U, 0.6 * U, 0);
    jawR.position.set(0.17 * U, 0.6 * U, 0);
    wrench.add(shaft, jawL, jawR);
    wrench.position.set(1.2 * U, 0.2 * U, 0.5 * U);
    wrench.rotation.x = 0.5;
    right.add(wrench);
    this.props.wrench = wrench;
    // Notepad (left hand) and pencil (right hand) for thinking.
    const pad = new THREE.Group();
    pad.add(new THREE.Mesh(G.pad, MAT.pad));
    for (let i = 0; i < 3; i++) {
      const ln = new THREE.Mesh(G.padLine, MAT.line);
      ln.position.set(0, 0.06 * U, (-0.4 + i * 0.35) * U);
      pad.add(ln);
    }
    pad.position.set(-1.2 * U, 0.1 * U, 0.75 * U);
    pad.rotation.set(-0.5, 0, 0.25);
    left.add(pad);
    this.props.pad = pad;
    const pencil = new THREE.Group();
    pencil.add(new THREE.Mesh(G.pencil, MAT.pencil));
    const tip = new THREE.Mesh(G.pencilTip, MAT.eye);
    tip.position.z = 0.68 * U;
    pencil.add(tip);
    pencil.position.set(1.15 * U, 0.15 * U, 0.6 * U);
    pencil.rotation.x = 0.35;
    right.add(pencil);
    this.props.pencil = pencil;
    for (const p of Object.values(this.props)) p.visible = false;
  }

  buildBulb() {
    const bulb = new THREE.Group();
    const glass = new THREE.Mesh(G.bulb, MAT.bulb);
    glass.position.y = 0.5 * U;
    const base = new THREE.Mesh(G.bulbBase, MAT.bulbBase);
    bulb.add(glass, base);
    for (let i = 0; i < 6; i++) {
      const ray = new THREE.Mesh(G.ray, MAT.ray);
      const a = (i / 6) * Math.PI * 2;
      ray.position.set(Math.sin(a) * 0.75 * U, 0.5 * U + Math.cos(a) * 0.75 * U, 0);
      ray.rotation.z = -a;
      bulb.add(ray);
    }
    bulb.position.set(0, HEIGHT + 0.42, 0);
    bulb.visible = false;
    this.lift.add(bulb);
    this.bulb = bulb;
  }

  // ── commands ───────────────────────────────────────────────

  place(x, z, heading = this.heading) {
    this.pos.set(x, z);
    this.heading = heading;
    this.root.position.set(x, 0, z);
    this.root.rotation.y = heading;
  }

  /** Follow a list of points (room coordinates). */
  walk(points, { face = null, seat = 0, onArrive = null } = {}) {
    this.path = points.map((p) => new THREE.Vector2(p.x, p.y ?? p.z));
    this.face = face;
    this.seatTarget = seat;
    this.onArrive = onArrive;
    this.walked = 0;
    if (!this.path.length) this.arrive();
  }

  get walking() { return this.path.length > 0; }

  arrive() {
    this.seat = this.seatTarget || 0;
    const cb = this.onArrive;
    this.onArrive = null;
    cb?.();
  }

  setPose(pose) {
    if (pose === this.pose) return;
    this.pose = pose;
    this.poseAt = this.now;
    this.poseClock = this.clock;
  }

  /** Removing a parent doesn't detach CSS2D children, so do it explicitly. */
  dispose() {
    this.tag.removeFromParent();
    this.bubble.removeFromParent();
    this.thoughtObj.removeFromParent();
    this.getObj.removeFromParent();
    for (const f of this.floats) f.obj.removeFromParent();
    this.root.removeFromParent();
    this.mat.dispose();
  }

  shake() {
    this.shakeUntil = this.now + 0.7; // the face comes from the feeling (startled, frustrated…)
    this.fx.emit(0, HEIGHT + 0.1, 0, { n: 9, speed: 0.45, up: 0.35, life: 1.0, mats: ['smoke'], size: 2.4, float: true });
  }

  /**
   * Pull a tool out from behind and hold it up for a moment, then put it away:
   * kind is an item from items.js, label the tool's name, brand its badge.
   */
  pullOut({ kind, brand = null, label = '' }) {
    if (this.pull && this.now - this.pull.at < PULL_T - 0.3) { this.nextPull = { kind, brand, label }; return; }
    const key = `${kind}|${brand?.mono || ''}|${brand?.bg || ''}`;
    let item = this.items.get(key);
    if (!item) {
      item = buildItem(kind, brand);
      this.items.set(key, item);
      this.itemHold.add(item);
    }
    if (this.item && this.item !== item) this.item.visible = false;
    this.item = item;
    item.visible = false;
    item.scale.setScalar(0.001);
    this.pull = { at: this.now, kind, brand, label, sparked: false, shown: false };
  }

  /**
   * Hold an item while working (null to put it away). Cached per item, so
   * switching back and forth is free.
   */
  equip(kind, brand = null) {
    const key = kind ? `${kind}|${brand?.mono || ''}|${brand?.bg || ''}` : '';
    if (key === this.handKey) return;
    this.handKey = key;
    if (this.hand) this.hand.removeFromParent();
    this.hand = null;
    if (!kind) return;
    let it = this.handCache.get(key);
    const grip = GRIP[kind] || GRIP.default;
    if (!it) {
      it = buildItem(kind, brand);
      it.position.set(...grip.pos);
      it.rotation.set(...grip.rot);
      it.userData.scale = grip.scale;
      this.handCache.set(key, it);
    }
    it.userData.where = grip.where;
    (grip.where === 'L' ? this.arms[0] : grip.where === 'F' ? this.body : this.arms[1]).add(it);
    it.scale.setScalar(0.001);
    this.hand = it;
    this.handAt = this.now;
  }

  /** Being petted: a happy hop, a blush and hearts. Returns how many pets in a row. */
  pet() {
    this.petCount = this.now - (this.petAt ?? -10) < 2.5 ? (this.petCount || 0) + 1 : 1;
    this.petAt = this.now;
    this.hop();
    this.react('loved', 2.2, { pop: this.petCount >= 3 }); // hearts first; keep petting for the 🥰
    this.fx.emit(0, HEIGHT + 0.1, 0.2, { n: 8, speed: 0.55, up: 0.9, life: 0.9, mats: ['pink', 'white', 'pink'] });
    this.float('♥', 'love');
    return this.petCount;
  }

  /** Look over at something in the room (room coordinates) for a moment. */
  glance(x, z, seconds = 1.8) {
    this.glanceAt = { x, z, until: this.now + seconds };
    this.hop();
  }

  /** A little number or word that floats up from Clawd's head and fades ("+12 −3", "✓ 4s"). */
  float(html, tone = '') {
    const el = document.createElement('div');
    el.className = 'tag-anchor';
    el.innerHTML = `<div class="floaty ${tone}">${html}</div>`;
    const obj = new CSS2DObject(el);
    obj.position.set((Math.random() - 0.5) * 0.35, HEIGHT + 0.2, 0.15);
    this.lift.add(obj);
    this.floats.push({ obj, until: this.now + 1.9 });
  }

  hop() { this.hopUntil = this.now + 0.6; }

  /** A lightbulb pops over Clawd's head (a new thought just landed). */
  idea() {
    this.ideaAt = this.now;
    this.hop();
    this.setMood('surprised', 0.5);
  }

  setMood(name, seconds) {
    this.mood = name;
    this.moodUntil = this.now + seconds;
  }

  /** The ongoing feeling (feelings.js). A new one pops its emoji: always for strong feelings, sometimes for calm ones. */
  setFeeling(id) {
    if (id === this.feel) return;
    this.feel = id;
    const F = FEELINGS[id];
    if (!F) { this.popAt = Infinity; return; }
    const show = F.strong || Math.random() < (this.id === 'main' ? 0.45 : 0.3);
    this.popAt = show ? this.now + 0.9 : F.every ? this.now + F.every * (0.5 + Math.random() * 0.5) : Infinity;
  }

  /** A short burst of feeling (a step broke, a fix landed…): face, body and emoji at once. */
  react(id, seconds = 2.5, { pop = true } = {}) {
    if (!FEELINGS[id]) return;
    this.reaction = { id, at: this.now, until: this.now + seconds };
    if (id === 'startled' || id === 'triumphant' || id === 'eager' || id === 'relieved') this.hop();
    if (id === 'triumphant' || id === 'proud') this.fx.emit(0, HEIGHT + 0.15, 0.1, { n: 12, speed: 0.9, up: 0.8, mats: ['gold', 'white', 'gold'] });
    if (pop) this.popEmoji(id, true);
  }

  /** What Clawd feels this moment: a reaction while it lasts, else the ongoing feeling. */
  get feeling() {
    return this.reaction && this.now < this.reaction.until ? this.reaction.id : this.feel;
  }

  /** An emoji pops up beside the head for a moment (not too often). */
  popEmoji(id, urgent = false) {
    const F = FEELINGS[id];
    if (!F?.emoji?.length || this.vanishing || this.appear < 1) return false;
    if (this.now - this.emojiAt < (urgent ? 0.6 : this.emojiGap)) return false;
    this.emojiAt = this.now;
    this.emojiFeel = id;
    // One at a time: a new emoji replaces the one still showing.
    this.floats = this.floats.filter((f) => (f.beside ? (f.obj.removeFromParent(), false) : true));
    const el = document.createElement('div');
    el.className = 'emo-anchor';
    el.innerHTML = `<div class="emopop${this.scale < 1 ? ' small' : ''}">${F.emoji[Math.floor(Math.random() * F.emoji.length)]}</div>`;
    const obj = new CSS2DObject(el);
    this.lift.add(obj);
    this.floats.push({ obj, until: this.now + 2.5, beside: true });
    this.placeBeside();
    return true;
  }

  /** Emoji sit just left of the head on screen, whichever way Clawd faces and however close the camera is. */
  placeBeside() {
    const h = this.heading;
    const rx = Math.cos(VIEW_YAW); // the camera's right, in the room…
    const rz = -Math.sin(VIEW_YAW);
    const lx = rx * Math.cos(h) - rz * Math.sin(h); // …turned into Clawd's own frame
    const lz = rx * Math.sin(h) + rz * Math.cos(h);
    for (const f of this.floats) if (f.beside) f.obj.position.set(-lx * 0.68, HEIGHT * 0.74, -lz * 0.68);
  }

  /** A yawn every few seconds, for the feelings that yawn. */
  yawning(t) { return (t + this.seed) % 9 > 7.6; }

  vanish(cb) {
    this.vanishing = true;
    this.onVanished = cb;
    this.setBubble(null);
    this.tagEl.style.opacity = '0';
  }

  /** Label above the head. `timerFrom` (ms epoch) adds a ticking clock. */
  setTag({ text, sub = '', iconName = 'dots', tone = '', timerFrom = null, helper = false, hat = null, brand = null } = {}) {
    const key = [text, sub, iconName, tone, helper, hat, brand?.mono, brand?.bg].join('|');
    this.timerFrom = timerFrom;
    if (key === this.tagKey) return;
    this.tagKey = key;
    if (!text) { this.tagEl.innerHTML = ''; this.timerEl = null; return; }
    const style = hat ? ` style="--hat:${hat}"` : '';
    const ti = brand
      ? `<span class="ti brand${brand.mono.length > 2 ? ' tiny' : ''}" style="background:${brand.bg};color:${brand.fg}">${esc(brand.mono)}</span>`
      : `<span class="ti">${icon(iconName)}</span>`;
    this.tagEl.innerHTML = helper
      ? `<div class="tag helper ${tone}"${style}>${ti}<span><span class="tx">${esc(text)}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</span></div>`
      : `<div class="tag ${tone}">${ti}<span class="tx">${esc(text)}</span><span class="tm"></span></div>`;
    this.timerEl = this.tagEl.querySelector('.tm');
    this.timerText = null;
  }

  tickTimer(now, fmt) {
    if (!this.timerEl) return;
    const v = this.timerFrom ? fmt(now - this.timerFrom) : '';
    if (v !== this.timerText) { this.timerText = v; this.timerEl.textContent = v; }
  }

  /** Bubble beside the head: think | thought (with text) | ask | err | ok | zzz | null */
  setBubble(kind, text = '') {
    const key = kind + '|' + text;
    if (key === this.bubbleKey) return;
    this.bubbleKey = key;
    this.thoughtEl.innerHTML = kind === 'thought' ? `<div class="bubble thought"><span>${esc(text)}</span></div>` : '';
    const html = {
      think: '<div class="bubble"><i></i><i></i><i></i></div>',
      ask: '<div class="bubble ask">?</div>',
      err: '<div class="bubble err">!</div>',
      ok: '<div class="bubble ok">✓</div>',
      zzz: '<div class="bubble zzz"><span>z</span><span>z</span><span>z</span></div>',
    }[kind] || '';
    this.bubbleEl.innerHTML = html;
  }

  // ── per frame ──────────────────────────────────────────────

  update(dt, t) {
    this.now = t;
    // Pop in / pop out.
    if (this.vanishing) {
      this.appear = Math.max(0, this.appear - dt * 3.2);
      if (this.appear === 0 && this.onVanished) { const cb = this.onVanished; this.onVanished = null; cb(); }
    } else {
      this.appear = Math.min(1, this.appear + dt * 2.6);
    }
    const a = this.appear;
    const pop = a < 1 ? 1 + Math.sin(a * Math.PI) * 0.18 : 1;
    this.root.scale.setScalar(Math.max(0.0001, this.scale * a * pop));

    // Movement along the path.
    let moving = false;
    if (this.path.length) {
      const target = this.path[0];
      const dx = target.x - this.pos.x;
      const dz = target.y - this.pos.y;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.05) {
        this.path.shift();
        if (!this.path.length) this.arrive();
      } else {
        moving = true;
        const last = this.path.length === 1;
        const speed = this.speed * (last ? clamp(dist / 0.7, 0.4, 1) : 1);
        const step = Math.min(dist, speed * dt);
        this.pos.x += (dx / dist) * step;
        this.pos.y += (dz / dist) * step;
        this.walked += step;
        this.phase += step * 7.5;
        this.heading = dampAngle(this.heading, Math.atan2(dx, dz), 14, dt);
      }
    } else if (this.face != null) {
      this.heading = dampAngle(this.heading, this.face, 9, dt);
    }
    this.root.position.set(this.pos.x, 0, this.pos.y);
    this.root.rotation.y = this.heading;

    // Feelings change the pace: frustration types faster, boredom drags.
    const feel = FEELINGS[this.feeling] || null;
    this.tempo = damp(this.tempo, feel?.body.tempo || 1, 3, dt);
    this.clock += dt * this.tempo;

    // Joint targets + expression for the current pose.
    const j = { armLy: 0.1, armLz: -0.12, armRy: -0.1, armRz: 0.12, legs: [0, 0, 0, 0], lean: 0, twist: 0, tilt: 0, squash: 1, hop: 0, face: 'neutral', prop: null };
    const pc = this.clock;
    const pt = pc - this.poseClock;
    if (moving) {
      const s = Math.sin(this.phase);
      j.legs = [s * 0.75, -s * 0.75, s * 0.75, -s * 0.75];
      j.armLy = s * 0.5;
      j.armRy = s * 0.5;
      j.armLz = -0.25;
      j.armRz = 0.25;
      j.lean = 0.1;
      j.hop = Math.abs(Math.cos(this.phase)) * 0.06;
    } else {
      this.applyPose(j, pc, pt);
      j.prop = j.prop ?? POSE_PROP[this.pose] ?? null;
      // Typing sends little bits of code (or green terminal text) up into the screen.
      if (this.pose === 'type') {
        this.bitAcc += dt;
        if (this.bitAcc > 0.15) {
          this.bitAcc = 0;
          const mats = this.bitsTone === 'term' ? ['green', 'white'] : ['clay', 'olive', 'sky', 'gold'];
          this.fx.emit((Math.random() - 0.5) * 0.5, 0.62, 0.42, { n: 1, life: 0.75, mats: [mats[Math.floor(Math.random() * mats.length)]], dir: [0, 0.55, 0.42], size: 0.85 });
        }
      }
    }
    this.applyPull(j, t);
    if (this.glanceAt && t < this.glanceAt.until && !moving) {
      // Turn the head (well, the whole body) and eyes toward what you clicked.
      let rel = Math.atan2(this.glanceAt.x - this.pos.x, this.glanceAt.z - this.pos.y) - this.heading;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      j.twist = clamp(rel, -1.1, 1.1) * 0.6;
      j.gaze = clamp(rel * 0.45, -0.3, 0.3);
      j.face = 'curious';
    }
    const held = this.hand && !this.pull ? this.hand.userData.where : null;
    for (const [name, obj] of Object.entries(this.props)) {
      obj.visible = (j.prop === name || (j.prop === 'notes' && (name === 'pad' || name === 'pencil'))) && !(held && HAND_PROPS[held].includes(name));
    }
    if (this.hand) {
      // Hidden while being pulled out overhead, and between throws.
      const show = !this.pull && !j.hideHand;
      this.hand.visible = show;
      if (show) {
        const k = Math.min(1, (t - Math.max(this.handAt, this.pullEndAt ?? -10)) / 0.22);
        this.hand.scale.setScalar(Math.max(0.001, this.hand.userData.scale * (k < 1 ? easeOutBack(k) : 1)));
      }
    }
    if (!moving) this.beat(pc, pt);
    if (feel) {
      this.feelBody(j, feel, t, moving);
      this.feelFx(feel, t, moving);
    }
    // Now and then, show how it feels (not over a reaction's own emoji).
    if (t >= this.popAt) {
      const F = FEELINGS[this.feel];
      const shown = this.emojiFeel === this.feel && t - this.emojiAt < 12;
      const popped = !!F && (shown || (!(this.reaction && t < this.reaction.until) && this.popEmoji(this.feel)));
      this.popAt = !F ? Infinity : popped ? (F.every ? t + F.every * (0.75 + Math.random() * 0.5) : Infinity) : t + 2;
    }

    if (t < this.shakeUntil) j.twist += Math.sin(t * 42) * 0.16 * ((this.shakeUntil - t) / 0.7);
    if (t < this.hopUntil) j.hop += Math.sin(((this.hopUntil - t) / 0.6) * Math.PI) * 0.28;
    if (this.mood && t < this.moodUntil) j.face = this.mood;
    else if (this.mood === 'surprised') this.setMood('happy', 1.2); // "oh!" → pleased
    else this.mood = null;

    // Breathing.
    j.squash *= 1 + Math.sin(t * 2.3 + this.scale * 7) * 0.014;
    if (this.cursor) this.cursor.visible = Math.floor(t * 1.8) % 2 === 0; // Codex's cursor blinks

    // Ease every joint toward its target.
    const J = this.j;
    for (const key of ['armLy', 'armLz', 'armRy', 'armRz', 'lean', 'twist', 'tilt', 'squash']) J[key] = damp(J[key], j[key], 20, dt);
    J.hop = damp(J.hop, j.hop, 26, dt);
    for (let i = 0; i < 4; i++) J.legs[i] = damp(J.legs[i], j.legs[i], 20, dt);

    this.arms[0].rotation.set(0, J.armLy, J.armLz);
    this.arms[1].rotation.set(0, J.armRy, J.armRz);
    this.legs.forEach((l, i) => { l.rotation.x = J.legs[i]; });
    this.body.rotation.set(J.lean, J.twist, J.tilt);
    this.body.scale.set(1 + (1 - J.squash) * 0.5, J.squash, 1 + (1 - J.squash) * 0.5);

    this.updateFace(j.face, dt, t, j.gaze || 0, this.pull ? null : feel?.face); // the ta-da moment stays a ta-da
    this.fx.update(dt);
    // Floating numbers fade by themselves (CSS); drop them when done.
    if (this.floats.length) this.placeBeside();
    if (this.floats.length && this.floats[0].until < t) {
      this.floats = this.floats.filter((f) => (f.until < t ? (f.obj.removeFromParent(), false) : true));
    }

    // Lightbulb pop.
    const since = t - this.ideaAt;
    this.bulb.visible = since < 1.7;
    if (this.bulb.visible) {
      const s = since < 0.25 ? (since / 0.25) * 1.25 : since > 1.4 ? Math.max(0, (1.7 - since) / 0.3) : 1 + Math.sin(since * 14) * 0.06;
      this.bulb.scale.setScalar(Math.max(0.001, s));
      this.bulb.position.y = HEIGHT + 0.42 + Math.min(since, 0.3) * 0.5;
    }

    const seatGoal = this.path.length ? 0 : this.seat;
    this.lift.position.y = damp(this.lift.position.y, seatGoal, 9, dt);
    this.body.position.y = J.hop;
    this.blob.scale.setScalar(1 - Math.min(0.4, J.hop * 1.2));
    this.blob.position.y = 0.012 + (this.lift.position.y > 0.05 ? this.lift.position.y + 0.005 : 0);
    this.blob.material.opacity = this.lift.position.y > 0.05 ? 0.5 : 0.9;
  }

  /** Fire the pose's beat once per loop: small effects here, bigger ones in the room. */
  beat(t, pt) {
    const B = BEATS[this.pose];
    if (!B) { this.beatN = null; return; }
    const n = Math.floor((pt - B[1] * B[0]) / B[0]);
    if (n === this.beatN) return;
    const first = this.beatN === null;
    this.beatN = n;
    if (first || n < 0) return;
    const fx = this.fx;
    const y = this.lift.position.y;
    switch (this.pose) {
      case 'hammer': fx.emit(0.32, 0.32, 0.55, { n: 7, speed: 0.9, up: 0.7, life: 0.4, mats: ['gold', 'white', 'clay'] }); break;
      case 'photo': fx.emit(0.05, 0.66, 0.68, { n: 10, speed: 1.2, up: 0.4, life: 0.25, mats: ['white', 'white', 'gold'], size: 1.4 }); break;
      case 'sing': fx.emit(0.12, 0.72, 0.55, { n: 3, life: 0.8, mats: ['sky', 'white'], dir: [0, 0.15, 0.9], size: 0.9 }); break;
      case 'listen': this.float('♪', 'note'); break;
      case 'antenna': for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; fx.emit(0.32, 1.25, 0.1, { n: 1, life: 0.5, mats: ['sky'], dir: [Math.cos(a) * 0.9, 0.3 + Math.sin(a) * 0.4, Math.sin(a) * 0.5], size: 0.8 }); } break;
      case 'sweep': fx.emit(0.3, 0.06 - y, 0.75, { n: 4, speed: 0.35, up: 0.25, life: 0.8, mats: ['smoke'], size: 1.6, float: true }); break;
      case 'paint': fx.emit(0.36, 0.55, 0.62, { n: 3, speed: 0.15, up: -0.2, life: 0.7, mats: ['clay', 'sky', 'olive', 'gold'], size: 0.9 }); break;
      case 'unbox': fx.emit(0, 0.42, 0.6, { n: 6, speed: 0.6, up: 1.0, life: 0.6, mats: ['gold', 'white', 'sky', 'clay'] }); break;
      case 'watch': fx.emit(-0.26, 0.55, 0.25, { n: 2, speed: 0.25, up: 0.9, life: 0.6, mats: ['white', 'gold'], size: 1.2 }); break;
      case 'snip': fx.emit(0.3, 0.42, 0.55, { n: 2, speed: 0.2, up: -0.1, life: 0.8, mats: ['smoke', 'white'], size: 0.8 }); break;
      case 'perform': fx.emit((Math.random() - 0.5) * 0.6, 1.1, 0.4, { n: 5, speed: 0.6, up: 0.3, life: 0.3, mats: ['white', 'gold'], size: 1.2 }); break;
      case 'checklist': fx.emit(-0.2, 0.62, 0.42, { n: 3, speed: 0.4, up: 0.5, life: 0.4, mats: ['olive', 'white'] }); break;
      case 'tap': fx.emit(0.2, 0.62, 0.62, { n: 2, speed: 0.3, up: 0.2, life: 0.25, mats: ['sky', 'white'], size: 0.8 }); break;
      case 'count': this.float(MATH_BITS[n % MATH_BITS.length], 'note'); break;
      case 'frame': fx.emit(0, 0.95, 0.55, { n: 8, speed: 0.9, up: 0.3, life: 0.22, mats: ['white', 'gold'], size: 1.2 }); break;
      case 'sleuth': this.float('?', 'note'); break;
      case 'recall': this.float('…', 'note'); break;
      case 'wordsmith': fx.emit(0.25, 0.55, 0.5, { n: 3, speed: 0.4, up: 0.4, life: 0.5, mats: ['smoke', 'white'], size: 0.9 }); break;
      default: break;
    }
    this.onAction?.(this.pose, this);
  }

  /** The "pull out a tool" move, layered over whatever pose Clawd is in. */
  applyPull(j, t) {
    const P = this.pull;
    const it = this.item;
    if (!P || !it) return;
    const p = t - P.at;
    if (p >= PULL_T) {
      it.visible = false;
      this.pull = null;
      this.pullEndAt = t;
      this.getEl.innerHTML = '';
      this.tagEl.classList.remove('away');
      this.thoughtEl.classList.remove('away');
      if (this.nextPull) { const n = this.nextPull; this.nextPull = null; this.pullOut(n); }
      return;
    }
    this.tagEl.classList.add('away'); // the item takes the label's spot for a moment
    this.thoughtEl.classList.add('away');
    j.prop = null;
    const top = HEIGHT + 0.36;
    if (p < 0.2) {
      // Reach behind…
      j.armRy = 0.95; j.armRz = -0.3;
      j.twist -= 0.28;
      j.lean = -0.05;
      j.face = 'focus';
      it.visible = false;
    } else if (p < 0.5) {
      // …and whip it up overhead.
      const k = (p - 0.2) / 0.3;
      const e = easeOutBack(Math.min(1, k));
      j.armRy = -0.2; j.armRz = 1.9;
      j.armLy = 0.2; j.armLz = -1.3;
      j.face = 'surprised';
      it.visible = true;
      it.position.set(lerp(0.75, 0, e), lerp(0.45, top, e) + Math.sin(k * Math.PI) * 0.22, lerp(-0.55, 0.06, e));
      it.scale.setScalar(Math.max(0.001, Math.min(e, 1.2)) * ITEM_SCALE);
      if (!P.sparked && k > 0.8) {
        P.sparked = true;
        this.fx.emit(0, top + 0.25, 0.06, { n: 14, speed: 1.15, up: 0.75, mats: ['gold', 'white', 'gold'] });
      }
    } else if (p < 1.45) {
      // Ta-da! Hold it up so you can see what it is.
      const q = p - 0.5;
      j.armLy = 0.15; j.armLz = -1.7 + Math.sin(t * 9) * 0.12;
      j.armRy = -0.15; j.armRz = 1.7 - Math.sin(t * 9) * 0.12;
      j.face = 'happy';
      j.hop += q < 0.28 ? Math.sin((q / 0.28) * Math.PI) * 0.15 : 0;
      it.visible = true;
      it.position.set(0, top + Math.sin(q * 5) * 0.035, 0.06);
      it.scale.setScalar(ITEM_SCALE * (1 + Math.max(0, 0.1 - q)));
    } else {
      // Put it away (into the right hand, then gone).
      const k = Math.min(1, (p - 1.45) / (PULL_T - 1.45));
      it.position.set(lerp(0, 0.72, k), lerp(top, 0.55, k), lerp(0.06, 0.3, k));
      it.scale.setScalar(Math.max(0.001, ITEM_SCALE * (1 - k * k)));
    }
    // Turn the item toward the camera (and tip it back a little, since we look down on the room).
    it.rotation.order = 'YXZ';
    it.rotation.y = VIEW_YAW - this.heading + Math.sin(p * 4.2) * 0.22;
    it.rotation.x = -VIEW_PITCH * 0.7;
    if (!P.shown && p > 0.38) {
      P.shown = true;
      const b = P.brand;
      const badge = b ? `<span class="bdg${b.mono.length > 2 ? ' tiny' : ''}" style="background:${b.bg};color:${b.fg}">${esc(b.mono)}</span>` : '';
      this.getEl.innerHTML = P.label ? `<div class="getlbl">${badge}<span>${esc(P.label)}</span></div>` : '';
    }
  }

  /** The pose's expression (FACES), with the feeling's face (O, from feelings.js) on top. */
  updateFace(name, dt, t, gaze = 0, O = null) {
    const f = FACES[name] || FACES.neutral;
    const E = this.eyeState;
    const yawn = !!O?.yawn && this.yawning(t);
    // A feeling that opens the eyes wins over a pose's ∩ ∩.
    const happy = !yawn && (O ? !!O.happy || (!!f.happy && O.eyes == null && !O.uneven) : !!f.happy);
    const open = yawn ? 0.15 : Math.max(0.1, f.sy * (O?.eyes ?? 1));
    let sy = open;
    // Blink every few seconds (not while sleepy or happy).
    if (t > this.blinkAt) {
      if (t > this.blinkAt + 0.12) this.blinkAt = t + 2 + Math.random() * 3.5;
      else if (!happy && name !== 'sleepy') sy = 0.1;
    }
    E.sx = damp(E.sx, f.sx, 25, dt);
    E.sy = damp(E.sy, sy, 30, dt);
    E.open = damp(E.open, open, 14, dt);
    E.dx = damp(E.dx, f.dx + gaze, 14, dt);
    E.dy = damp(E.dy, f.dy + (O?.look || 0), 14, dt);
    E.rot = damp(E.rot, f.rot, 16, dt);
    E.lsy = damp(E.lsy, (f.leftSy ?? 1) * (O?.uneven?.[0] ?? 1), 16, dt);
    E.rsy = damp(E.rsy, (f.rightSy ?? 1) * (O?.uneven?.[1] ?? 1), 16, dt);
    for (const e of this.eyes) {
      e.slot.visible = !happy;
      e.happy.visible = happy;
      e.glint.visible = !!O?.glint && E.sy > 0.45;
      e.g.position.x = e.side * 1.75 * U + E.dx * U;
      e.g.position.y = 3.5 * U + E.dy * U;
      e.slot.scale.set(E.sx, E.sy * (e.side < 0 ? E.lsy : E.rsy), 1);
      e.g.rotation.z = -e.side * E.rot;
    }
    for (const b of this.blush) b.visible = !!(f.blush || O?.blush);
    const sweat = f.sweat || O?.sweat;
    this.sweat.visible = !!sweat;
    if (sweat) this.sweat.position.y = 4.55 * U - ((t * 0.6) % 1) * 0.22;
    this.updateBrows(O, dt);
    this.setMouth(yawn ? 'yawn' : O?.mouth || f.mouth || null, t);
    // 💢 on the forehead, throbbing.
    this.vein.visible = !!O?.vein;
    if (O?.vein) this.vein.scale.setScalar(0.85 + Math.abs(Math.sin(t * 5)) * 0.35);
  }

  /** Brows: angled (cross or worried), raised or lowered, one up when puzzled; gone when the feeling has none. */
  updateBrows(O, dt) {
    const S = this.browState;
    S.show = damp(S.show, O && (O.brow || O.lift || O.quirk) ? 1 : 0, 12, dt);
    S.a = damp(S.a, O?.brow || 0, 14, dt);
    S.l = damp(S.l, O?.lift || 0, 14, dt);
    S.q = damp(S.q, O?.quirk || 0, 14, dt);
    const E = this.eyeState;
    for (const b of this.brows) {
      const m = b.mesh;
      m.visible = S.show > 0.03;
      if (!m.visible) continue;
      const up = b.side > 0 ? S.q : -S.q * 0.25;
      // Above the eye however open it is, following where the eyes look.
      m.position.x = b.side * 1.75 * U + E.dx * 0.4 * U;
      m.position.y = (this.browBase + (S.l + up) * 0.9 + E.dy * 0.5 + (E.open - 1) * 0.4) * U;
      m.rotation.z = b.side * (S.a + (b.side > 0 ? S.q * 0.3 : 0));
      m.scale.set(S.show, S.show, 1);
    }
  }

  /** Show one mouth shape (or none), popping in when it changes; a nervous mouth wobbles. */
  setMouth(shape, t) {
    if (shape !== this.mouthShape) {
      if (this.mouthShape) this.mouths[this.mouthShape].visible = false;
      this.mouthShape = this.mouths[shape] ? shape : null;
      this.mouthAt = t;
      if (this.mouthShape) this.mouths[this.mouthShape].visible = true;
    }
    if (!this.mouthShape) return;
    const k = Math.min(1, (t - this.mouthAt) / 0.16);
    this.mouths[this.mouthShape].scale.setScalar(Math.max(0.001, k < 1 ? easeOutBack(k) : 1));
    if (this.mouthShape === 'wavy') this.waves.forEach((w, i) => { w.position.y = ((i % 2 ? 0.05 : -0.05) + Math.sin(t * 13 + i * 1.7) * 0.035) * U; });
  }

  /** How a feeling shows in the body: bouncing, trembling, slumping, puffing up, cheering… */
  feelBody(j, F, t, moving) {
    const b = F.body;
    const c = this.clock;
    const seated = this.seat > 0 && !moving;
    if (b.bounce) j.hop += Math.abs(Math.sin(c * 7.5)) * b.bounce * (seated ? 0.4 : 1);
    if (b.sway) j.tilt += Math.sin(c * 2.1) * b.sway;
    if (b.wobble) { j.tilt += Math.sin(t * 2.4) * b.wobble; j.twist += Math.cos(t * 2.4) * b.wobble * 0.7; }
    if (b.tremble) j.twist += Math.sin(t * 47) * 0.02 * b.tremble;
    if (b.lean) j.lean += b.lean;
    if (b.slump) { j.squash *= 1 - 0.05 * b.slump; j.lean += 0.07 * b.slump; }
    if (b.puff) { j.squash *= 1 + b.puff * 0.6; j.lean -= b.puff; }
    if (moving) return;
    const R = this.reaction && t < this.reaction.until ? this.reaction : null;
    const since = R ? t - R.at : Infinity;
    if (b.cheer && R) { j.armLz = -1.75 + Math.sin(t * 10) * 0.2; j.armRz = 1.75 - Math.sin(t * 10) * 0.2; j.armLy = 0.1; j.armRy = -0.1; }
    if (b.scratch && since < 2.2) { j.armRy = -0.35; j.armRz = 2.0 + Math.sin(t * 17) * 0.13; j.tilt -= 0.08; }
    if (b.exhale && since < 0.9) j.squash *= 1 - Math.sin((since / 0.9) * Math.PI) * 0.07;
    if (F.face.yawn && this.yawning(t)) { j.squash *= 1.05; j.lean -= 0.08; }
    if (b.stomp && !seated) {
      const k = ((t + this.seed) % 2.8) / 2.8;
      if (k < 0.16) { const s = Math.sin((k / 0.16) * Math.PI); j.legs[1] = -0.75 * s; j.legs[2] = -0.75 * s; }
    }
  }

  /** The little effects that go with a feeling: steam, tears, sparkles, notes, dizzy stars, stomping dust. */
  feelFx(F, t, moving) {
    const b = F.body;
    const fx = this.fx;
    const y = this.body.position.y;
    const due = (key, gap) => {
      if (t - (this.fxAt[key] ?? -99) < gap) return false;
      this.fxAt[key] = t;
      return true;
    };
    if (b.steam && due('steam', 0.8)) fx.emit((Math.random() - 0.5) * 0.4, HEIGHT + 0.04 + y, 0, { n: 2, speed: 0.15, up: 0.55, life: 0.9, mats: ['steam'], size: 2, float: true });
    if (F.face.tears && due('tears', 0.55)) {
      const side = Math.random() < 0.5 ? -1 : 1;
      fx.emit(side * 1.75 * U, 3.0 * U + y, 1.9 * U, { n: 1, life: 0.7, mats: ['sky'], dir: [side * 0.05, -0.15, 0.2], size: 0.9 });
    }
    if (b.sparkle && due('sparkle', 1.3)) fx.emit((Math.random() - 0.5) * 0.8, HEIGHT * (0.6 + Math.random() * 0.5) + y, 0.25, { n: 3, speed: 0.35, up: 0.4, life: 0.6, mats: ['gold', 'white'] });
    if (b.notes && !moving && due('notes', 3.8)) this.float('♪', 'note');
    if (b.stars && due('stars', 0.12)) {
      const a = t * 4;
      fx.emit(Math.cos(a) * 0.42, HEIGHT + 0.12 + y, Math.sin(a) * 0.42, { n: 1, speed: 0.02, up: 0.02, life: 0.45, mats: ['gold'], size: 1.1, float: true });
    }
    if (b.stomp && !moving && this.seat <= 0) {
      const n = Math.floor((t + this.seed) / 2.8);
      if (n !== this.stompN && ((t + this.seed) % 2.8) / 2.8 > 0.16) { // the foot just came down
        if (this.stompN != null) fx.emit(0.15, 0.03, 0.2, { n: 5, speed: 0.4, up: 0.2, life: 0.5, mats: ['smoke'], size: 1.6, float: true });
        this.stompN = n;
      }
    }
  }

  applyPose(j, t, pt) {
    switch (this.pose) {
      case 'type': {
        j.armLy = 1.0 + Math.sin(t * 23) * 0.12;
        j.armRy = -1.0 + Math.sin(t * 23 + 2) * 0.12;
        j.armLz = -0.05 + Math.max(0, Math.sin(t * 17)) * 0.18;
        j.armRz = 0.05 - Math.max(0, Math.sin(t * 19 + 1)) * 0.18;
        j.lean = 0.1;
        j.hop = Math.abs(Math.sin(t * 11)) * 0.008;
        j.face = 'focus';
        if (this.seat > 0) j.legs = [-0.5, -0.4, -0.5, -0.4].map((v, i) => v + Math.sin(t * 3 + i) * 0.15);
        break;
      }
      case 'read': {
        j.armLy = 1.25; j.armRy = -1.25;
        j.armLz = 0.18; j.armRz = -0.18;
        j.lean = 0.16;
        j.tilt = Math.sin(t * 0.9) * 0.05;
        j.face = 'lookdown';
        // Eyes sweep along each line, then hop back to the start of the next.
        const ln = (pt * 0.85) % 1;
        j.gaze = ln < 0.8 ? -0.28 + (ln / 0.8) * 0.56 : 0.28 - ((ln - 0.8) / 0.2) * 0.56;
        const flip = (pt % 3.2) / 3.2;
        if (this.pageFlip) this.pageFlip.rotation.z = flip > 0.85 ? -0.12 - ((flip - 0.85) / 0.15) * 2.6 : -0.12;
        break;
      }
      case 'search': {
        j.lean = 0.3;
        j.twist = Math.sin(t * 1.7) * 0.4;
        j.armRy = -0.9; j.armRz = 0.25 + Math.sin(t * 3.4) * 0.12;
        j.armLy = 0.5; j.armLz = -0.3;
        j.face = Math.sin(t * 1.7) > 0 ? 'hmm' : 'hmmLeft';
        break;
      }
      case 'look': {
        j.lean = 0.12;
        j.armRy = -0.95; j.armRz = 0.55 + Math.sin(t * 2.6) * 0.18;
        j.armLy = 0.3; j.armLz = -0.2;
        j.tilt = Math.sin(t * 0.7) * 0.06;
        j.face = 'curious';
        break;
      }
      case 'draw': {
        j.armRy = -0.55; j.armRz = 1.05 + Math.sin(t * 7) * 0.22;
        j.armLy = 0.2; j.armLz = -0.35;
        j.twist = Math.sin(t * 3.5) * 0.08;
        j.lean = -0.04;
        j.face = 'focus';
        // Every few seconds, step back and squint at the board.
        if (pt % 6 > 4.6) { j.armRz = 0.3; j.armLz = 0.2; j.lean = -0.12; j.face = 'hmm'; }
        break;
      }
      case 'tinker': {
        j.armRy = -0.85; j.armRz = 0.35 + Math.abs(Math.sin(t * 7.5)) * 0.95;
        j.armLy = 0.9; j.armLz = 0.05;
        j.lean = 0.16;
        j.hop = Math.abs(Math.sin(t * 7.5)) < 0.12 ? 0.015 : 0;
        j.face = 'focus';
        break;
      }
      case 'summon': {
        j.armLz = -1.45 + Math.sin(t * 6) * 0.3;
        j.armRz = 1.45 + Math.sin(t * 6 + 1.2) * 0.3;
        j.armLy = 0.2; j.armRy = -0.2;
        j.hop = Math.abs(Math.sin(t * 3)) * 0.06;
        j.face = 'happy';
        break;
      }
      case 'write': {
        // Writing by hand: pencil on a pad, reading it back now and then.
        j.prop = 'notes';
        j.armLy = 1.15; j.armLz = 0.1;
        j.armRy = -1.05 + Math.sin(t * 15) * 0.14;
        j.armRz = 0.2 + Math.max(0, Math.sin(t * 9)) * 0.12;
        j.lean = 0.16;
        j.face = 'lookdown';
        if (pt % 5 > 4.2) { j.lean = 0.04; j.face = 'hmm'; }
        if (this.seat > 0) j.legs = [-1.3, -1.25, -1.3, -1.25].map((v, i) => v + Math.sin(t * 2 + i) * 0.06);
        break;
      }
      case 'paint': {
        // Big brush strokes, stepping back to look every few seconds.
        const k = (pt % 1.6) / 1.6;
        j.armRy = -0.75; j.armRz = 0.35 + Math.sin(k * Math.PI * 2) * 0.75;
        j.armLy = 0.55; j.armLz = -0.25;
        j.twist = Math.sin(k * Math.PI * 2) * 0.16;
        j.lean = 0.06;
        j.face = 'focus';
        if (pt % 6.4 > 5.4) { j.armRz = 0.2; j.lean = -0.12; j.tilt = 0.12; j.face = 'happy'; }
        break;
      }
      case 'checklist': {
        // Clipboard up, ticking things off, glancing at the bench.
        const k = (pt % 1.4) / 1.4;
        j.prop = 'pencil';
        j.armLy = 1.1; j.armLz = 0.18;
        j.armRy = -1.0; j.armRz = k < 0.3 ? 0.2 - Math.sin((k / 0.3) * Math.PI) * 0.35 : 0.2;
        j.lean = 0.08;
        j.face = k > 0.6 ? 'hmm' : 'lookdown';
        if (pt % 4.2 > 3.2) { j.twist = 0.35; j.armRz = 0.25; j.face = 'curious'; }
        break;
      }
      case 'hammer': {
        // Wind up, strike, a little bounce.
        const k = (pt % 0.9) / 0.9;
        j.armRy = -0.8;
        j.armRz = k < 0.55 ? 0.2 + (k / 0.55) * 1.6 : k < 0.7 ? 1.8 - ((k - 0.55) / 0.15) * 2.2 : -0.35;
        j.armLy = 0.9; j.armLz = 0.08;
        j.lean = k < 0.55 ? 0.0 : 0.22;
        j.face = 'focus';
        if (k >= 0.7 && k < 0.8) j.squash = 0.96;
        break;
      }
      case 'snip': {
        // Snip snip: scissors in one hand, the film strip in the other.
        j.armRy = -1.0 + Math.sin(t * 1.8) * 0.12;
        j.armRz = 0.35 + Math.sin(t * 15) * 0.16;
        j.armLy = 0.95; j.armLz = 0.25;
        j.lean = 0.12;
        j.face = 'focus';
        if (this.seat > 0) j.legs = [-1.3, -1.3, -1.3, -1.3];
        break;
      }
      case 'unbox': {
        // Bent over the parcel, digging things out.
        j.lean = 0.42;
        j.armLy = 1.2 + Math.sin(t * 6) * 0.2; j.armRy = -1.2 - Math.sin(t * 6 + 1) * 0.2;
        j.armLz = -0.25; j.armRz = 0.25;
        j.face = pt % 3 > 2.4 ? 'surprised' : 'lookdown';
        break;
      }
      case 'shelve': {
        // Reach up and slot the new book onto the shelf, then admire it.
        const k = (pt % 2.2) / 2.2;
        j.armRy = -0.65;
        j.armRz = k < 0.5 ? 0.4 + (k / 0.5) * 1.6 : k < 0.75 ? 2.0 : 0.5;
        j.armLz = -0.2;
        j.hop = k > 0.4 && k < 0.62 ? 0.05 : 0;
        j.face = k < 0.75 ? 'focus' : 'happy';
        j.hideHand = k > 0.6;
        break;
      }
      case 'toss': {
        // Wind up and throw (paper ball into the bin, paper plane out the door…).
        const k = (pt % 1.8) / 1.8;
        if (k < 0.35) { j.armRy = 0.6; j.armRz = 0.95; j.twist = -0.22; j.lean = -0.05; j.face = 'focus'; }
        else if (k < 0.5) { j.armRy = -1.25; j.armRz = 0.6; j.twist = 0.16; j.lean = 0.14; j.face = 'focus'; }
        else { j.armRy = -0.3; j.armRz = 0.15; j.face = 'curious'; }
        j.hideHand = k > 0.42 && k < 0.92;
        break;
      }
      case 'launch': {
        // Press the big button, then cheer the rocket up.
        const k = (pt % 3.2) / 3.2;
        if (k < 0.2) { j.armRy = -1.05; j.armRz = -0.1 - (k / 0.2) * 0.35; j.lean = 0.18; j.face = 'focus'; }
        else {
          j.armLz = -1.6 + Math.sin(t * 9) * 0.15; j.armRz = 1.6 - Math.sin(t * 9) * 0.15;
          j.lean = -0.16;
          j.face = 'happy';
          j.hop = k < 0.4 ? Math.sin(((k - 0.2) / 0.2) * Math.PI) * 0.16 : 0;
        }
        break;
      }
      case 'antenna': {
        // Walkie-talkie up high, listening for a reply.
        j.armRy = -0.35; j.armRz = 1.45 + Math.sin(t * 3) * 0.1;
        j.armLz = -0.3; j.armLy = 0.35;
        j.tilt = Math.sin(t * 1.5) * 0.08;
        j.face = 'curious';
        break;
      }
      case 'catch': {
        // Arms up… the parcel drops in… got it.
        const k = (pt % 3) / 3;
        if (k < 0.45) { j.armLz = -1.5; j.armRz = 1.5; j.lean = -0.18; j.face = 'surprised'; j.hideHand = true; }
        else if (k < 0.6) { j.armLz = -0.5; j.armRz = 0.5; j.armLy = 0.9; j.armRy = -0.9; j.squash = 0.93; j.face = 'happy'; }
        else { j.armLy = 1.25; j.armRy = -1.25; j.armLz = 0.25; j.armRz = -0.25; j.face = 'happy'; }
        break;
      }
      case 'carry': {
        // A box in both arms, bobbing a little.
        j.armLy = 1.25; j.armRy = -1.25; j.armLz = 0.25; j.armRz = -0.25;
        j.lean = -0.06;
        j.hop = Math.abs(Math.sin(t * 5)) * 0.02;
        j.legs = [Math.sin(t * 5) * 0.2, -Math.sin(t * 5) * 0.2, Math.sin(t * 5) * 0.2, -Math.sin(t * 5) * 0.2];
        j.face = 'focus';
        break;
      }
      case 'sweep': {
        // Broom side to side.
        j.armLy = 1.0; j.armRy = -1.0;
        j.armLz = -0.15 + Math.sin(t * 5) * 0.22; j.armRz = 0.15 + Math.sin(t * 5) * 0.22;
        j.twist = Math.sin(t * 5) * 0.3;
        j.lean = 0.16;
        j.face = 'focus';
        break;
      }
      case 'perform': {
        // On the green screen: strike a pose for the camera, then another.
        const P = [[-1.7, 1.7, 0, 'happy'], [-0.2, 1.95, 0.12, 'curious'], [-1.95, 0.2, -0.12, 'happy'], [-1.1, 1.1, 0, 'surprised']][Math.floor(pt / 1.1) % 4];
        j.armLz = P[0]; j.armRz = P[1]; j.tilt = P[2]; j.face = P[3];
        j.hop = pt % 1.1 < 0.18 ? Math.sin(((pt % 1.1) / 0.18) * Math.PI) * 0.1 : 0;
        break;
      }
      case 'sing': {
        // Mic close, swaying, eyes closed.
        j.armRy = -1.15; j.armRz = 0.8;
        j.armLz = -0.6 + Math.sin(t * 2) * 0.3; j.armLy = 0.2;
        j.twist = Math.sin(t * 1.6) * 0.18; j.tilt = Math.sin(t * 1.6) * 0.06;
        j.face = 'happy';
        break;
      }
      case 'listen': {
        // Hand to the headphones, nodding along.
        j.armRy = -0.2; j.armRz = 1.75;
        j.armLz = -0.15;
        j.tilt = Math.sin(t * 4) * 0.06;
        j.lean = Math.abs(Math.sin(t * 4)) * 0.05;
        j.face = pt % 4 > 3 ? 'hmm' : 'sleepy';
        if (this.seat > 0) j.legs = [-1.35, -1.3, -1.35, -1.3];
        break;
      }
      case 'knobs': {
        // Fiddling with dials and switches.
        j.armLy = 1.05 + Math.sin(t * 5) * 0.12; j.armRy = -1.05 + Math.sin(t * 5 + 2) * 0.12;
        j.armLz = 0.05 + Math.sin(t * 7) * 0.1; j.armRz = -0.05 - Math.sin(t * 7 + 1) * 0.1;
        j.lean = 0.1;
        j.face = pt % 5 > 4 ? 'hmm' : 'focus';
        break;
      }
      case 'watch': {
        // Popcorn and a screen.
        const k = (pt % 2.4) / 2.4;
        j.armLy = 1.0; j.armLz = 0.25;
        j.armRy = -1.15; j.armRz = k < 0.3 ? 0.95 : 0.25;
        j.lean = -0.08;
        j.face = pt % 7 > 6 ? 'surprised' : 'focus';
        if (this.seat > 0) j.legs = [-1.35, -1.35, -1.35, -1.35];
        break;
      }
      case 'photo': {
        // Camera up to the eye; click.
        const k = (pt % 1.5) / 1.5;
        j.armLy = 1.3; j.armRy = -1.3; j.armLz = 0.45; j.armRz = -0.45;
        j.lean = 0.05;
        j.face = 'focus';
        if (k > 0.8 && k < 0.88) j.squash = 0.97;
        break;
      }
      case 'present': {
        // Holding something up for you to see.
        j.armLz = -1.25; j.armRz = 1.25; j.armLy = 0.5; j.armRy = -0.5;
        j.hop = Math.abs(Math.sin(t * 2.5)) * 0.03;
        j.face = 'happy';
        break;
      }
      case 'tap': {
        // Poking at a screen.
        const k = (pt % 0.8) / 0.8;
        j.armRy = -1.15; j.armRz = 0.55 + (k < 0.2 ? -0.25 : 0);
        j.lean = 0.12 + (k < 0.2 ? 0.05 : 0);
        j.armLz = -0.15;
        j.face = 'curious';
        break;
      }
      case 'peek': {
        // Leaning in, hand shading the eyes.
        j.lean = 0.26;
        j.armRy = -0.4; j.armRz = 1.25;
        j.armLz = -0.25;
        j.twist = Math.sin(t * 0.8) * 0.2;
        j.face = 'curious';
        break;
      }
      case 'inspect': {
        // A photo held close, head tilting.
        j.armRy = -1.2; j.armRz = 0.9;
        j.armLy = 0.5; j.armLz = 0.1;
        j.tilt = Math.sin(t * 0.9) * 0.12;
        j.lean = 0.05;
        j.face = Math.sin(t * 0.9) > 0 ? 'hmm' : 'curious';
        break;
      }
      // ── thinking, by mood (see thinking.js) ──
      case 'letter': {
        // Reading your message: a letter held up, eyes running along the lines.
        j.armLy = 1.25; j.armRy = -1.25; j.armLz = 0.35; j.armRz = -0.35;
        j.lean = 0.08;
        const ln = (pt * 0.7) % 1;
        j.gaze = ln < 0.82 ? -0.26 + (ln / 0.82) * 0.52 : 0.26 - ((ln - 0.82) / 0.18) * 0.52;
        j.face = pt % 6 > 5.2 ? 'curious' : 'lookdown';
        break;
      }
      case 'sleuth': {
        // Hunting a bug: bent low with the magnifier, shuffling, the odd "!".
        j.lean = 0.36;
        j.armRy = -0.95; j.armRz = -0.25 + Math.sin(t * 2.2) * 0.12;
        j.armLy = 0.3; j.armLz = 0.15;
        j.twist = Math.sin(t * 0.9) * 0.45;
        j.legs = [Math.sin(t * 3) * 0.15, -Math.sin(t * 3) * 0.15, Math.sin(t * 3) * 0.15, -Math.sin(t * 3) * 0.15];
        j.face = Math.sin(t * 0.9) > 0 ? 'hmm' : 'hmmLeft';
        if (pt % 5 > 4.3) { j.lean = 0.1; j.face = 'surprised'; j.hop = 0.05; }
        break;
      }
      case 'weigh': {
        // Weighing two options: arms like the pans of a scale, eyes on the higher one.
        const w = Math.sin(t * 1.5);
        j.armLz = -0.25 - w * 0.55; j.armRz = 0.25 - w * 0.55;
        j.armLy = 0.35; j.armRy = -0.35;
        j.tilt = w * 0.1;
        j.face = w > 0 ? 'hmmLeft' : 'hmm';
        break;
      }
      case 'count': {
        // Crunching numbers: calculator in one hand, tapping away with the other.
        j.armLy = 1.15; j.armLz = 0.2;
        j.armRy = -1.05; j.armRz = 0.15 + Math.abs(Math.sin(t * 11)) * 0.18;
        j.lean = 0.1;
        j.face = pt % 4 > 3.2 ? 'hmm' : 'lookdown';
        break;
      }
      case 'frame': {
        // Storyboarding: hands up like a director's frame, panning across the room.
        j.armLy = 1.0; j.armRy = -1.0; j.armLz = -0.95; j.armRz = 0.95;
        j.twist = Math.sin(t * 0.7) * 0.5;
        j.lean = -0.04;
        j.face = 'focus';
        break;
      }
      case 'sketch': {
        // Picturing a design: look up at the room, then sketch what it should be.
        j.prop = 'notes';
        j.armLy = 1.1; j.armLz = 0.12;
        if (pt % 3.2 < 1.4) { j.armRy = -0.7; j.armRz = 0.25; j.lean = -0.08; j.twist = Math.sin(t * 1.2) * 0.3; j.face = 'curious'; }
        else { j.armRy = -1.05 + Math.sin(t * 13) * 0.16; j.armRz = 0.25 + Math.max(0, Math.sin(t * 8)) * 0.12; j.lean = 0.16; j.face = 'lookdown'; }
        break;
      }
      case 'wordsmith': {
        // Finding the right words: pencil to the chin, write, shake the head, try again.
        j.prop = 'notes';
        j.armLy = 1.1; j.armLz = 0.12;
        const k = pt % 3.6;
        if (k < 1.2) { j.armRy = -1.25; j.armRz = 0.7 + Math.abs(Math.sin(t * 7)) * 0.08; j.face = 'hmmLeft'; }
        else if (k < 2.6) { j.armRy = -1.05 + Math.sin(t * 15) * 0.14; j.armRz = 0.2 + Math.max(0, Math.sin(t * 9)) * 0.12; j.lean = 0.15; j.face = 'lookdown'; }
        else { j.armRy = -0.9; j.armRz = 0.2; j.twist = Math.sin(t * 16) * 0.12; j.face = 'worried'; }
        break;
      }
      case 'recall': {
        // Trying to remember: a hand to the temple, eyes drifting up.
        j.armRy = -0.25; j.armRz = 1.55 + Math.sin(t * 2) * 0.05;
        j.armLz = -0.12;
        j.tilt = Math.sin(t * 0.6) * 0.07;
        j.gaze = -0.22;
        j.face = 'hmmLeft';
        break;
      }
      case 'pace': {
        // Between laps of pacing: a hand on the chin, looking at the floor.
        j.armRy = -1.2; j.armRz = 0.7;
        j.armLz = -0.2;
        j.lean = 0.06;
        j.face = 'lookdown';
        j.tilt = Math.sin(t * 1.4) * 0.05;
        break;
      }
      case 'wait': {
        // A long command: arms folded, foot tapping, the odd look at the watch.
        const cyc = pt % 7;
        j.armLy = 1.15; j.armRy = -1.15;
        j.armLz = 0.32; j.armRz = -0.32;
        j.twist = Math.sin(t * 0.8) * 0.08;
        j.face = 'neutral';
        if (this.seat > 0) j.legs = [-0.6 + Math.sin(t * 4) * 0.25, -0.5, -0.6 + Math.sin(t * 4 + Math.PI) * 0.25, -0.5];
        else j.legs = [0, 0, 0, -Math.max(0, Math.sin(t * 7)) * 0.45];
        if (cyc > 5.2 && cyc < 6.4) {
          j.armLy = 1.45; j.armLz = 0.75;
          j.armRy = -0.6; j.armRz = 0.1;
          j.face = 'lookdown';
          j.lean = 0.08;
        } else if (cyc > 2.4 && cyc < 3.0) {
          j.squash = 0.95; // sigh
          j.face = 'sleepy';
        }
        break;
      }
      case 'ponder':
        this.thinkRoutine(j, t, pt);
        break;
      case 'think': {
        // Deep thought in the armchair: chin on hand, eyes up, the odd head scratch.
        j.legs = [-1.35, -1.35, -1.35, -1.35];
        j.armRy = -1.05; j.armRz = 0.8;
        j.armLy = 0.35; j.armLz = -0.45;
        j.lean = -0.12;
        j.tilt = Math.sin(t * 0.8) * 0.08;
        j.face = 'hmm';
        if (pt % 7 > 5) { j.armRy = -0.3; j.armRz = 2.05 + Math.sin(t * 16) * 0.12; j.face = 'hmmLeft'; }
        break;
      }
      case 'rest': {
        j.legs = [-1.35, -1.3, -1.35, -1.3];
        j.armLz = -0.5; j.armRz = 0.5;
        j.lean = -0.1;
        j.twist = Math.sin(t * 0.4) * 0.15;
        break;
      }
      case 'sleep': {
        j.legs = [-1.4, -1.4, -1.4, -1.4];
        j.armLz = -0.7; j.armRz = 0.7;
        j.squash = 0.9 + Math.sin(t * 1.3) * 0.02;
        j.lean = -0.08;
        j.face = 'sleepy';
        break;
      }
      case 'wave': {
        j.armRy = -0.25; j.armRz = 1.9 + Math.sin(t * 9) * 0.45;
        j.armLz = -0.2;
        j.hop = pt % 2.4 < 0.35 ? Math.sin(((pt % 2.4) / 0.35) * Math.PI) * 0.12 : 0;
        j.tilt = Math.sin(t * 2) * 0.05;
        j.face = 'curious';
        break;
      }
      case 'celebrate': {
        j.armLz = -1.8 + Math.sin(t * 10) * 0.2;
        j.armRz = 1.8 - Math.sin(t * 10) * 0.2;
        j.hop = Math.abs(Math.sin(t * 6)) * 0.24;
        j.squash = 1 + Math.sin(t * 12) * 0.03;
        j.face = 'happy';
        break;
      }
      default: {
        // idle: breathe and glance around now and then
        j.twist = Math.sin(t * 0.55) * 0.18 + Math.sin(t * 1.7) * 0.04;
        j.armLz = -0.12 + Math.sin(t * 1.2) * 0.04;
        j.armRz = 0.12 - Math.sin(t * 1.2) * 0.04;
        j.face = Math.sin(t * 0.55) > 0.6 ? 'hmm' : Math.sin(t * 0.55) < -0.6 ? 'hmmLeft' : 'neutral';
      }
    }
  }

  /** Short thinking in place: scratch head → scribble notes → tap chin → look around. */
  thinkRoutine(j, t, pt) {
    const step = THINK_STEPS[Math.floor(pt / 3.2) % THINK_STEPS.length];
    const k = (pt % 3.2) / 3.2;
    if (step === 'scratch') {
      j.armRy = -0.35;
      j.armRz = 2.0 + Math.sin(t * 17) * 0.13; // hand up at the top corner, scratching
      j.armLz = -0.1;
      j.tilt = -0.09;
      j.twist = 0.12;
      j.face = 'hmm';
    } else if (step === 'notes') {
      j.prop = 'notes';
      j.armLy = 1.15; j.armLz = 0.1; // holding the notepad
      j.armRy = -1.05 + Math.sin(t * 15) * 0.14; // scribbling
      j.armRz = 0.2 + Math.max(0, Math.sin(t * 9)) * 0.12;
      j.lean = 0.14;
      j.face = 'lookdown';
      if (k > 0.8) { j.lean = 0.02; j.face = 'hmm'; } // pause and read it back
    } else if (step === 'tap') {
      j.armRy = -1.25; j.armRz = 0.68 + Math.abs(Math.sin(t * 8)) * 0.1; // tapping chin
      j.armLy = 0.6; j.armLz = 0.25;
      j.tilt = Math.sin(t * 1.3) * 0.08;
      j.face = 'hmmLeft';
    } else {
      j.twist = Math.sin(pt * 2.2) * 0.55; // looking around
      j.armLz = -0.15; j.armRz = 0.15;
      j.face = Math.sin(pt * 2.2) > 0 ? 'hmm' : 'hmmLeft';
    }
  }
}
