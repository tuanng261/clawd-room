// One room per Claude Code session. The room reads the session snapshot and
// decides where Clawd (and the helper Clawds) should be and what they do.
// The furniture and floor plan come from rooms/layouts.js, one per room type.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Clawd, setViewYaw, Sparks, STATION_POSE } from './clawd.js';
import { cardHtml, PROPS, roleIcon, tipHtml } from './interact.js';
import { ACTIVITIES, activityFor } from './activities.js';
import { FEELINGS, feelingFor, helperFeeling, reactionFor, workFeeling } from './feelings.js';
import { MOODS, moodFor, moodOfText } from './thinking.js';
import { brandFor, buildItem, itemFor } from './items.js';
import { NavGrid } from './nav.js';
import * as P from './props.js';
import * as T from './themes.js';
import { buildLayout } from './rooms/layouts.js';
import { asDoing, simplify } from './plain.js';
import { clock, damp, esc, fmtDur, hash, HAT_COLORS, mascotName, probablyNeedsApproval, runningInBackground, stillWorking } from './util.js';

const PAD = 0.42; // keep this far from furniture when walking
const THINK_BOARD_AFTER = 10000; // thinking longer than this → work it out on the board
const THINK_CHAIR_AFTER = 40000; // …and after this long, settle into the armchair
const THOUGHT_SHOW = 9000; // how long a new thought stays in the bubble
const NAP_AFTER = 90000;
const RESTING = new Set(['bed', 'stage', 'center', null, undefined]);
const MAX_HELPERS = 6; // more than this gets crowded: the rest show as "+N" on the door
const MAX_WORKERS = 4; // background tasks shown as mini Clawds (the rest: "+N more in the background")
const SAME_TOOL_GAP = 12; // seconds: a burst of the same tool only gets pulled out once

const clipText = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const REACT_T = { bounce: 0.6, spin: 1.1, wiggle: 0.9, squish: 0.75 }; // seconds per furniture reaction
const VISIT_PLAY = 5; // seconds Clawd plays with something you clicked
const isIdle = (s) => !s || s.status === 'idle' || s.status === 'stale' || !s.live;
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

// The walkable floor (a grid; the walls are just outside it).
const FLOOR = { minX: -3.65, maxX: 3.9, minZ: -3.65, maxZ: 3.9, cell: 0.2 };
// Light things Clawd shoves out of the way when they block the path (it puts them back later).
const PUSHABLE = new Set(['plant', 'trashCan', 'poufs', 'rollingBoard', 'studentDesk', 'easel', 'micStand', 'softbox', 'ringLight', 'roadCases', 'directorsChair', 'beanbag']);
const SHOVE_SAVES = 1.8; // shove something only if going around would be at least this much longer
const TIDY_AFTER = 12000; // ms of nothing to do before Clawd puts moved things back

/**
 * A piece's footprint on the floor: its own unrotated box, turned with it
 * (so a whiteboard standing at an angle blocks only where it really is).
 * cx,cz centre; ux,uz and vx,vz its own x and z axes; hx,hz half sizes.
 */
function footprint(g, shrink = 0) {
  let lb = g.userData.localBox;
  if (!lb) {
    const ry = g.rotation.y;
    g.rotation.y = 0;
    g.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(g);
    g.rotation.y = ry;
    g.updateMatrixWorld(true);
    lb = g.userData.localBox = { x0: b.min.x - g.position.x, x1: b.max.x - g.position.x, z0: b.min.z - g.position.z, z1: b.max.z - g.position.z, top: b.max.y, empty: b.isEmpty() };
  }
  const c = Math.cos(g.rotation.y);
  const s = Math.sin(g.rotation.y);
  const lx = (lb.x0 + lb.x1) / 2;
  const lz = (lb.z0 + lb.z1) / 2;
  return {
    g, top: lb.top, empty: lb.empty,
    cx: g.position.x + lx * c + lz * s, cz: g.position.z - lx * s + lz * c,
    ux: c, uz: -s, vx: s, vz: c,
    hx: Math.max(0.01, (lb.x1 - lb.x0) / 2 - shrink), hz: Math.max(0.01, (lb.z1 - lb.z0) / 2 - shrink),
  };
}
const inFoot = (f, x, z, pad = 0) => {
  const dx = x - f.cx;
  const dz = z - f.cz;
  return Math.abs(dx * f.ux + dz * f.uz) < f.hx + pad && Math.abs(dx * f.vx + dz * f.vz) < f.hz + pad;
};
const shifted = (f, dx, dz) => ({ ...f, cx: f.cx + dx, cz: f.cz + dz });
/** Do two footprints overlap (or come closer than `gap`)? Separating axes, for turned rectangles. */
function overlap(a, b, gap = 0) {
  const dx = b.cx - a.cx;
  const dz = b.cz - a.cz;
  for (const [ax, az] of [[a.ux, a.uz], [a.vx, a.vz], [b.ux, b.uz], [b.vx, b.vz]]) {
    const ra = a.hx * Math.abs(a.ux * ax + a.uz * az) + a.hz * Math.abs(a.vx * ax + a.vz * az);
    const rb = b.hx * Math.abs(b.ux * ax + b.uz * az) + b.hz * Math.abs(b.vx * ax + b.vz * az);
    if (Math.abs(dx * ax + dz * az) > ra + rb + gap) return false;
  }
  return true;
}
/** How far a footprint reaches from its centre in direction d. */
const reachOf = (f, d) => f.hx * Math.abs(f.ux * d.x + f.uz * d.y) + f.hz * Math.abs(f.vx * d.x + f.vz * d.y);
const pathLength = (from, pts) => pts.reduce((sum, q, i) => sum + q.distanceTo(i ? pts[i - 1] : from), 0);
/** Points every `step` along a path that starts at `from`. */
function dots(from, pts, step = 0.1) {
  const out = [from.clone()];
  let a = from;
  for (const b of pts) {
    const n = Math.max(1, Math.ceil(a.distanceTo(b) / step));
    for (let i = 1; i <= n; i++) out.push(a.clone().lerp(b, i / n));
    a = b;
  }
  return out;
}

// Walls fade to this when the camera is behind them, so you can see inside.
const GHOST = 0.13;
const WALLS = { back: { axis: 'z', at: -4.05 }, left: { axis: 'x', at: -4.05 } };

export class Room {
  constructor(world, { id, demo = false, theme = 'cozy', agent = 'claude', at = null }) {
    this.agent = agent; // 'codex' sessions get Codex's mascot
    this.world = world;
    this.id = id;
    this.theme = T.THEMES[theme] || T.THEMES.cozy;
    this.themeId = this.theme.id;
    this.group = new THREE.Group();
    world.scene.add(this.group);
    this.pal = P.PALETTES[demo ? 1 : hash(id) % P.PALETTES.length];
    this.nav = new NavGrid(FLOOR); // everything solid blocks the way
    this.navSqueeze = new NavGrid(FLOOR); // light things only block where they really are (brushing past)
    this.navLoose = new NavGrid(FLOOR); // …or not at all (what Clawd could shove aside)
    this.build();
    // In the zoo, rooms stand side by side: built at the middle (so everything measured stays local), then moved.
    if (at) this.group.position.set(at[0], 0, at[1]);

    this.clawd = new Clawd({ id: 'main', skin: agent === 'codex' ? 'codex' : 'clawd' });
    this.clawd.wear(this.theme.accessory);
    this.group.add(this.clawd.root);
    const bed = this.st.bed;
    this.clawd.place(bed.spot[0], bed.spot[1], bed.face);
    this.clawd.seat = bed.seat || 0;
    this.clawd.drive = { goal: 'bed', arrivedAt: 0 };
    this.helpers = new Map();
    this.workers = new Map(); // background tasks: mini Clawds in hard hats

    this.highlight = new P.Highlight();
    this.trail = new P.Trail();
    this.confetti = new P.Confetti();
    this.spot = P.spotlight();
    this.spot.position.set(this.st.stage.spot[0], 0.03, this.st.stage.spot[1]);
    this.group.add(this.highlight.group, this.trail.mesh, this.trail.ring, this.confetti.mesh, this.spot);

    this.editor = { file: null, mode: 'idle', typed: 0, verb: 'Editing' };
    this.termState = { command: '', status: null, elapsed: 0 };
    this.web = { text: '', url: '', active: false };
    this.doorAngle = 0;
    this.doorOpenUntil = 0;
    this.spinSpeed = 0.15;
    this.drawerOpen = 0;
    this.drawerIdx = 0;
    this.errorUntil = 0;
    this.highlightKey = '';
    this.state = null;
    this.t = 0; // world clock (seconds)
    this.popAt = -10;
    this.floatQ = [];
    this.lastFloatAt = -10;

    // Poking the furniture: hover brackets and tooltip, a card, little effects, visits.
    this.hoverHl = new P.Highlight('#6a9bcc');
    this.fx = new Sparks(this.group, 48);
    this.group.add(this.hoverHl.group);
    this.tipEl = document.createElement('div');
    this.tipEl.className = 'tag-anchor';
    this.tipObj = new CSS2DObject(this.tipEl);
    this.group.add(this.tipObj);
    // Hovering Clawd (or a helper) says how it feels.
    this.feelTipEl = document.createElement('div');
    this.feelTipEl.className = 'tag-anchor';
    this.feelTipObj = new CSS2DObject(this.feelTipEl);
    this.group.add(this.feelTipObj);
    this.mascotHover = null;
    this.feelTipKey = '';
    // The card is a screen-level element so it can stay clear of the panels.
    this.cardEl = document.createElement('div');
    this.cardEl.className = 'propcard';
    this.cardEl.hidden = true;
    document.body.appendChild(this.cardEl);
    this.hovered = null;
    this.carded = null;
    this.cardUntil = 0;
    this.cardTick = 0;
    this.reacts = new Map();
    this.flyers = [];
    this.clawd.onAction = (pose, c) => this.clawdAction(c, pose);
    this.visit = null;
    this.cups = 0;
    this.globeBoostUntil = 0;
    this.drawerPokeUntil = 0;

    // A connector's cartridge floats over the station while Clawd uses it.
    this.holo = { group: new THREE.Group(), item: null, key: '', show: 0, station: null };
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 16), new THREE.MeshBasicMaterial({ color: '#ffe7a8', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    this.holo.ring = ring;
    this.group.add(this.holo.group, ring);

    // "+3 more helpers" badge over the door when the room is full.
    this.moreEl = document.createElement('div');
    this.moreEl.className = 'tag-anchor';
    this.more = new CSS2DObject(this.moreEl);
    const [dx, dz] = this.L.door.inside;
    this.more.position.set(dx + 0.05, 2.85, dz - 0.3);
    this.group.add(this.more);

    this.tick = this.tick.bind(this);
    world.tickers.add(this.tick);
  }

  build() {
    const theme = this.theme;
    this.look = {
      floorMap: theme.floor === 'wood' ? null : T.floorTexture(theme.floor),
      wall: theme.wall, wainscot: theme.wainscot, trim: theme.trim,
      style: theme.board || 'white',
      doodle: theme.id === 'cozy' ? null : (g, x, y, w, h, chalk) => T.boardDoodle(g, x, y, w, h, theme.id, chalk),
    };
    const shell = P.buildShell(this, this.pal, this.look);
    this.L = buildLayout(theme.id, this, this.pal);
    this.st = this.L.stations;
    this.drawDesk = T.deskScreenFor(theme.id) || P.drawEditor;
    this.drawTerm = T.terminalScreenFor(theme.id) || P.drawTerminal;

    // Walkable floor: everything solid is blocked (plus a margin).
    this.group.updateMatrixWorld(true);
    this.setupProps();
    this.markPushables();
    this.mapFloor();
    this.setupWalls(shell);

    // Boxes for the "working here" brackets.
    this.bounds = {};
    for (const [role, piece] of Object.entries(this.L.roles)) {
      this.bounds[role] = new THREE.Box3().setFromObject(piece.group).expandByScalar(0.08);
    }
    // Two spots either side of the middle, for pacing while unsure.
    const mid = this.st.center;
    for (const [key, side] of [['pace:a', 1], ['pace:b', -1]]) {
      let x = mid.spot[0] + Math.cos(mid.face) * 0.95 * side;
      let z = mid.spot[1] - Math.sin(mid.face) * 0.95 * side;
      if (!this.nav.walkable(x, z)) {
        const [c, r] = this.nav.nearestFree(x, z);
        x = this.nav.cx(c);
        z = this.nav.cz(r);
      }
      this.st[key] = { spot: [x, z], face: mid.face };
    }
    // Spots tucked against (or inside) their furniture get a way in from the open side,
    // so nobody walks through a desk, a whiteboard or the back of a chair to get there.
    for (const st of Object.values(this.st)) {
      if (st.approach && this.nav.walkable(st.approach[0], st.approach[1])) continue;
      st.approach = this.wayOut(st.spot[0], st.spot[1], st.face) || st.approach;
    }
    // Spots for helper Clawds beside each station.
    this.slots = {};
    for (const [name, st] of Object.entries(this.st)) this.slots[name] = this.slotsAround(st);
  }

  /** Block every solid piece on the walking grids, and keep their footprints for line checks. */
  mapFloor() {
    this.nav.blocked.fill(0);
    this.navSqueeze.blocked.fill(0);
    this.navLoose.blocked.fill(0);
    this.bodies = [];
    for (const g of this.L.solids) {
      const f = footprint(g);
      if (f.empty) continue;
      const light = g.userData.prop?.pushable;
      this.nav.blockFoot(f, PAD);
      this.navSqueeze.blockFoot(f, light ? 0.14 : PAD);
      if (!light) this.navLoose.blockFoot(f, PAD);
      if (f.top > 0.12) this.bodies.push(footprint(g, 0.04));
    }
  }

  /** Which pieces Clawd may shove: light ones, unless a fixed spot is drawn right onto them. */
  markPushables() {
    for (const p of this.props) {
      if (!PUSHABLE.has(p.kind) || !this.L.solids.includes(p.group)) continue;
      const f = footprint(p.group);
      const pinned = Object.values(this.st).some((st) => !st.rel && inFoot(f, st.spot[0], st.spot[1], 0.35));
      if (pinned) continue;
      p.pushable = true;
      p.home = p.group.position.clone();
    }
  }

  /** Can you walk straight from a to b without going through furniture? (The piece you start in, and `ignore`, don't count.) */
  lineClear(ax, az, bx, bz, ignore = null) {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.05));
    for (const b of this.bodies) {
      if (b.g === ignore || inFoot(b, ax, az)) continue;
      for (let i = 1; i <= n; i++) {
        if (inFoot(b, ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n)) return false;
      }
    }
    return true;
  }

  /**
   * From a spot pressed against furniture (sitting in a chair, standing at a desk),
   * the nearest open floor straight forward, back or sideways, without going
   * through anything. Null if the spot is already open floor.
   */
  wayOut(x, z, face) {
    if (this.nav.walkable(x, z)) return null;
    let best = null;
    for (const turn of [0, Math.PI, Math.PI / 2, -Math.PI / 2]) {
      const dx = Math.sin(face + turn);
      const dz = Math.cos(face + turn);
      for (let d = 0.1; d <= 2.4; d += 0.1) {
        const px = x + dx * d;
        const pz = z + dz * d;
        if (!this.nav.inside(this.nav.col(px), this.nav.row(pz))) break;
        if (!this.nav.walkable(px, pz)) continue;
        if ((!best || d < best.d) && this.lineClear(x, z, px, pz)) best = { d, p: [px, pz] };
        break;
      }
    }
    return best?.p || null;
  }

  /** The way from where a Clawd is to a spot: out of its seat first, around everything, in from the open side. */
  route(from, heading, spot, approach = null) {
    const exit = this.wayOut(from.x, from.y, heading);
    const start = exit ? new THREE.Vector2(exit[0], exit[1]) : from;
    const goal = approach || spot;
    // No way around? Squeeze past the light things (brushing them); walk straight only as a last resort.
    const path = this.nav.path(start.x, start.y, goal.x, goal.y)
      || this.navSqueeze.path(start.x, start.y, goal.x, goal.y)
      || this.navLoose.path(start.x, start.y, goal.x, goal.y) || [];
    if (exit) path.unshift(start.clone());
    if (!path.length || path[path.length - 1].distanceTo(goal) > 0.05) path.push(goal.clone());
    if (approach && approach.distanceTo(spot) > 0.01) path.push(spot.clone());
    return path;
  }

  // ── moving things out of the way ─────────────────────────────

  /**
   * Is something light in the way (the only way through, or a much shorter
   * one)? Then plan to shove it aside: which piece, where to, and where Clawd
   * stands to push it. Null if the way is fine as it is (or nothing can be done).
   */
  planShove(c, key, spot, approach) {
    const exit = this.wayOut(c.pos.x, c.pos.y, c.heading);
    const start = exit ? new THREE.Vector2(exit[0], exit[1]) : c.pos.clone();
    const goal = approach || spot;
    const loose = this.navLoose.path(start.x, start.y, goal.x, goal.y);
    if (!loose) return null;
    const around = this.nav.path(start.x, start.y, goal.x, goal.y);
    if (around && pathLength(start, around) - pathLength(start, loose) < SHOVE_SAVES) return null;
    // The first light piece that short way runs into. Rather not the one we're heading
    // for (its spot moves with it), unless there's truly no other way.
    const pts = dots(start, loose);
    const feet = this.props.filter((q) => q.pushable).map((q) => [q, footprint(q.group)]);
    for (const spare of around ? [true] : [true, false]) {
      for (let i = 0; i < pts.length; i++) {
        const p = feet.find(([q, f]) => (!spare || q.role !== key) && inFoot(f, pts[i].x, pts[i].y, PAD * 0.9))?.[0];
        if (!p) continue;
        const along = pts[Math.min(i + 3, pts.length - 1)].clone().sub(pts[Math.max(i - 3, 0)]).normalize();
        const plan = this.shoveFor(p, along, pts.slice(i), start);
        if (plan) return { ...plan, exit: exit ? start : null, text: `Moving the ${p.info.name.toLowerCase()} out of the way` };
        break; // can't move the first thing in the way: no point shoving the next
      }
    }
    return null;
  }

  /** Where to push piece p so it's out of the way: a little off to the side of where we're walking, if there's room. */
  shoveFor(p, along, corridor, start) {
    const f = footprint(p.group);
    const from = new THREE.Vector2(f.cx, f.cz);
    for (const turn of [0.7, -0.7, 1.15, -1.15, Math.PI / 2, -Math.PI / 2, 0.35, -0.35]) {
      const dir = along.clone().rotateAround(new THREE.Vector2(), turn);
      for (const dist of [0.8, 1.1, 1.4, 1.8]) {
        const to = from.clone().addScaledVector(dir, dist);
        if (!this.spotFree(p, to) || !this.slideClear(p, from, to)) continue;
        const there = shifted(f, to.x - f.cx, to.y - f.cz);
        if (corridor.some((v) => inFoot(there, v.x, v.y, PAD))) continue;
        const hold = this.holdFor(p, f, from, dir, dist, start);
        if (hold) return { p, from, to, dir, dist, ...hold };
      }
    }
    return null;
  }

  /**
   * Where Clawd takes hold of piece p to move it `dist` along `dir`: behind it
   * to push, or (if there's no room behind) in front, pulling it along while
   * stepping backwards. Includes the walk there from `start`.
   */
  holdFor(p, f, from, dir, dist, start) {
    const reach = reachOf(f, dir) + 0.5;
    for (const pull of [false, true]) {
      const stand = this.openNear(from.clone().addScaledVector(dir, pull ? reach : -reach));
      if (!stand) continue;
      const end = stand.clone().addScaledVector(dir, dist);
      if (!this.lineClear(stand.x, stand.y, end.x, end.y, p.group)) continue;
      if (pull && !this.nav.walkable(end.x, end.y)) continue; // backing into open floor
      const walk = this.nav.path(start.x, start.y, stand.x, stand.y);
      if (walk) return { stand, pull, walk };
    }
    return null;
  }

  /** That point if it's open floor, else the nearest open floor within a step of it. */
  openNear(v) {
    if (this.nav.walkable(v.x, v.y)) return v;
    const [c, r] = this.nav.nearestFree(v.x, v.y);
    const q = new THREE.Vector2(this.nav.cx(c), this.nav.cz(r));
    return q.distanceTo(v) < 0.35 && this.nav.walkable(q.x, q.y) ? q : null;
  }

  /** Could piece p stand with its middle at `to`: on the floor, clear of other furniture, off everyone's spots? */
  spotFree(p, to) {
    const f0 = footprint(p.group);
    const f = shifted(f0, to.x - f0.cx, to.y - f0.cz);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = f.cx + sx * f.hx * f.ux + sz * f.hz * f.vx;
        const z = f.cz + sx * f.hx * f.uz + sz * f.hz * f.vz;
        if (x < -3.95 || x > 3.95 || z < -3.95 || z > 3.95) return false;
      }
    }
    if (this.bodies.some((b) => b.g !== p.group && overlap(f, b, 0.08))) return false;
    const near = (pt, r) => pt && inFoot(f, pt[0], pt[1], r);
    for (const [key, st] of Object.entries(this.st)) {
      if (key === 'tidy' || key === 'visit' || st.rel?.g === p.group) continue; // its own spots move with it
      if (near(st.spot, 0.45) || near(st.approach, 0.4)) return false;
    }
    return !near(this.L.door.front, 0.6) && !near(this.L.door.inside, 0.6);
  }

  /** Nothing in the way while the piece slides from `from` to `to`? */
  slideClear(p, from, to) {
    const f = footprint(p.group);
    for (let k = 0.25; k < 1; k += 0.25) {
      const m = shifted(f, (to.x - from.x) * k, (to.y - from.y) * k);
      if (this.bodies.some((b) => b.g !== p.group && overlap(m, b))) return false;
    }
    return true;
  }

  /** Walk over to the piece, then push it (the room decides where to go next once it's done). */
  goShove(c, sh) {
    c.pushing = { ...sh, phase: 'walk' };
    const path = [...(sh.exit ? [sh.exit.clone()] : []), ...sh.walk];
    if (!path.length || path[path.length - 1].distanceTo(sh.stand) > 0.05) path.push(sh.stand.clone());
    const face = sh.pull ? Math.atan2(-sh.dir.x, -sh.dir.y) : Math.atan2(sh.dir.x, sh.dir.y);
    c.walk(path, { face, onArrive: () => this.startShove(c, c.pushing) });
    this.trail.set([c.pos.clone(), ...path]);
  }

  startShove(c, sh) {
    if (!sh) return;
    c.pushing = { ...sh, phase: 'push', t0: this.t, dur: 0.9 + sh.dist * (sh.pull ? 0.8 : 0.6), gFrom: sh.p.group.position.clone(), cFrom: c.pos.clone() };
    c.face = sh.pull ? Math.atan2(-sh.dir.x, -sh.dir.y) : Math.atan2(sh.dir.x, sh.dir.y);
    c.setPose(sh.pull ? 'pull' : 'push');
    this.trail.hide();
  }

  /** Lean in for a beat, then the piece slides (wobbling, kicking up dust) with Clawd right behind it. */
  updateShove() {
    const c = this.clawd;
    const P = c.pushing;
    if (P?.phase !== 'push') return;
    const k = Math.min(1, (this.t - P.t0) / P.dur);
    const e = k < 0.2 ? 0 : easeInOut((k - 0.2) / 0.8);
    const g = P.p.group;
    const dx = P.dir.x * P.dist * e;
    const dz = P.dir.y * P.dist * e;
    g.position.set(P.gFrom.x + dx, P.gFrom.y, P.gFrom.z + dz);
    const sliding = e > 0 && e < 1;
    g.rotation.z = P.p.base.rotZ + (sliding ? Math.sin(this.t * 24) * 0.03 : 0);
    c.pos.set(P.cFrom.x + dx, P.cFrom.y + dz);
    if (sliding && this.t - (P.dustAt || 0) > 0.14) {
      P.dustAt = this.t;
      this.fx.emit(P.from.x + dx + (Math.random() - 0.5) * 0.5, 0.05, P.from.y + dz + (Math.random() - 0.5) * 0.5, { n: 2, speed: 0.25, up: 0.15, life: 0.55, mats: ['smoke'], size: 1.5, float: true });
    }
    if (k < 1) return;
    this.finishShove(P);
    c.pushing = null;
    c.drive.goal = null; // go on to wherever we were heading
    c.setPose('idle');
  }

  /** The piece is in its new place: walls of the walking grid, its spots and its card all follow. */
  finishShove(P) {
    const p = P.p;
    const g = p.group;
    g.rotation.z = p.base.rotZ;
    p.base.pos.copy(g.position);
    g.updateMatrixWorld(true);
    p.box.setFromObject(g);
    this.mapFloor();
    for (const [key, st] of Object.entries(this.st)) {
      const r = st.rel;
      if (r?.g === g) {
        const cs = Math.cos(g.rotation.y);
        const sn = Math.sin(g.rotation.y);
        const tx = (x, z) => [g.position.x + x * cs + z * sn, g.position.z - x * sn + z * cs];
        st.spot = tx(r.lx, r.lz);
        st.approach = r.approach ? tx(r.approach[0], r.approach[1]) : null;
        if (!st.approach || !this.nav.walkable(st.approach[0], st.approach[1])) st.approach = this.wayOut(st.spot[0], st.spot[1], st.face);
        this.slots[key] = this.slotsAround(st);
      } else if (key.startsWith('at:') && this.props[Number(key.split(':')[1])] === p) {
        delete this.st[key]; // worked out again next time it's needed
        delete this.slots[key];
        delete this.bounds[key];
      }
    }
    if (p.role && this.bounds[p.role]) this.bounds[p.role].setFromObject(g).expandByScalar(0.08);
    this.highlightKey = '';
    if (this.chore?.p === p) this.chore = null;
  }

  /**
   * With nothing to do, put back whatever got shoved aside, one thing at a
   * time, as long as it can slide straight home and Clawd can still get to bed.
   */
  tidyIntent() {
    const c = this.clawd;
    if (c.pushing) return { station: null, pose: c.pose, tag: { text: c.pushing.text, iconName: 'sparkle', tone: 'idle' }, feel: 'content' };
    if (!this.chore) {
      for (const p of this.props) {
        if (!p.pushable || p.group.position.distanceTo(p.home) < 0.2 || (p.noTidyUntil || 0) > this.t) continue;
        this.chore = this.tidyPlan(p);
        if (this.chore) break;
        p.noTidyUntil = this.t + 60; // can't right now: try again in a while
      }
    }
    if (!this.chore) return null;
    const ch = this.chore;
    this.st.tidy = { spot: [ch.stand.x, ch.stand.y], face: ch.pull ? Math.atan2(-ch.dir.x, -ch.dir.y) : Math.atan2(ch.dir.x, ch.dir.y) };
    return { station: 'tidy', pose: 'idle', tag: { text: ch.text, iconName: 'sparkle', tone: 'idle' }, feel: 'content' };
  }

  tidyPlan(p) {
    const f = footprint(p.group);
    const from = new THREE.Vector2(f.cx, f.cz);
    const to = from.clone().add(new THREE.Vector2(p.home.x - p.group.position.x, p.home.z - p.group.position.z));
    const dist = from.distanceTo(to);
    const dir = to.clone().sub(from).normalize();
    if (!this.spotFree(p, to) || !this.slideClear(p, from, to)) return null;
    const c = this.clawd;
    const exit = this.wayOut(c.pos.x, c.pos.y, c.heading);
    const hold = this.holdFor(p, f, from, dir, dist, exit ? new THREE.Vector2(exit[0], exit[1]) : c.pos.clone());
    if (!hold) return null;
    const { stand, pull } = hold;
    // Put back, would it wall Clawd off from its bed? Then leave it where it is.
    const tmp = (this.navTmp ||= new NavGrid(FLOOR));
    tmp.blocked.set(this.navLoose.blocked);
    for (const q of this.props) {
      if (!q.pushable) continue;
      const fq = footprint(q.group);
      tmp.blockFoot(q === p ? shifted(fq, to.x - from.x, to.y - from.y) : fq, PAD);
    }
    const end = stand.clone().addScaledVector(dir, dist);
    const bed = this.st.bed.approach || this.st.bed.spot;
    if (!tmp.path(end.x, end.y, bed[0], bed[1])) return null;
    return { p, from, to, dir, dist, stand, pull, text: `Putting the ${p.info.name.toLowerCase()} back` };
  }

  /** Six spots beside a station for helpers who share it. */
  slotsAround(st) {
    const right = new THREE.Vector2(Math.cos(st.face), -Math.sin(st.face));
    const back = new THREE.Vector2(-Math.sin(st.face), -Math.cos(st.face));
    const base = new THREE.Vector2(st.spot[0], st.spot[1]);
    if (st.seat && st.approach) base.lerp(new THREE.Vector2(st.approach[0], st.approach[1]), 0.6);
    const out = [];
    for (const [r, b] of [[0.95, 0.15], [-0.95, 0.15], [1.8, 0.4], [-1.8, 0.4], [0.5, 1.1], [-0.5, 1.1]]) {
      const p = base.clone().addScaledVector(right, r).addScaledVector(back, b);
      if (!this.nav.walkable(p.x, p.y)) {
        const [c, rr] = this.nav.nearestFree(p.x, p.y);
        p.set(this.nav.cx(c), this.nav.cz(rr));
      }
      out.push(p);
    }
    return out;
  }

  /**
   * Each wall, plus whatever hangs on it (windows, posters, boards, the door):
   * thin pieces flush against the wall that are mounted up off the floor (or
   * aren't furniture at all). Furniture standing against a wall stays solid,
   * so you can always see it.
   */
  setupWalls(shell) {
    const own = new Set(shell.parts);
    const furniture = new Set(this.L.solids);
    const hung = { back: [], left: [] };
    const box = new THREE.Box3();
    for (const obj of this.group.children) {
      if (own.has(obj)) continue;
      box.setFromObject(obj);
      if (box.isEmpty()) continue;
      const onWall = !furniture.has(obj) || box.min.y > 0.15;
      if (!onWall) continue;
      if (box.max.z < -3.45 && box.max.z - box.min.z < 0.5) hung.back.push(obj);
      else if (box.max.x < -3.45 && box.max.x - box.min.x < 0.5) hung.left.push(obj);
    }
    this.walls = Object.entries(WALLS).map(([side, plane]) => ({
      side, ...plane, objs: [...shell.walls[side], ...hung[side]], fade: 1, ghost: false, mats: [],
    }));
    for (const w of this.walls) for (const o of w.objs) o.userData.wall = w;
    this.ghostMats = new Map();
  }

  /** Every clickable piece of furniture, what it is, and which station (if any) it is. */
  setupProps() {
    const roleOf = new Map(Object.entries(this.L.roles).map(([role, piece]) => [piece.group, role]));
    this.props = [];
    for (const obj of this.group.children) {
      const info = PROPS[obj.userData.kind];
      if (!info) continue;
      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) continue;
      const prop = {
        group: obj, kind: obj.userData.kind, info, role: roleOf.get(obj) || null, box,
        base: { pos: obj.position.clone(), rotY: obj.rotation.y, rotZ: obj.rotation.z, scale: obj.scale.clone() },
      };
      obj.userData.prop = prop;
      this.props.push(prop);
    }
    // The armchair and bed stations sit on (or right next to) a piece.
    for (const role of ['armchair', 'bed']) {
      const st = this.st[role];
      if (!st) continue;
      let best = null;
      let bestD = 1.3;
      for (const p of this.props) {
        if (p.role) continue;
        const b = p.box;
        const inside = st.spot[0] > b.min.x - 0.1 && st.spot[0] < b.max.x + 0.1 && st.spot[1] > b.min.z - 0.1 && st.spot[1] < b.max.z + 0.1;
        const d = inside ? 0 : Math.hypot((b.min.x + b.max.x) / 2 - st.spot[0], (b.min.z + b.max.z) / 2 - st.spot[1]);
        if (d < bestD) { best = p; bestD = d; }
      }
      if (best) best.role = role;
    }
    this.propGroups = this.props.map((p) => p.group);
    this.roleProp = {};
    for (const p of this.props) if (p.role) this.roleProp[p.role] = p;
  }

  /** Fade a wall (and what hangs on it) when the camera is on its outside. */
  updateWalls(dt) {
    const cam = this.world.camera.position.clone().sub(this.group.position); // as seen from this room (zoo rooms aren't at the middle)
    const len = Math.hypot(cam.x, cam.y, cam.z) || 1;
    for (const w of this.walls) {
      // How far in front of the wall's inside face the camera is (≈ −1 … 1).
      const side = ((w.axis === 'z' ? cam.z : cam.x) - w.at) / len;
      const want = side > 0.04 ? 1 : side < -0.12 ? GHOST : GHOST + (1 - GHOST) * ((side + 0.12) / 0.16);
      w.fade = damp(w.fade, want, 7, dt);
      const ghost = w.fade < 0.985;
      if (ghost !== w.ghost) this.swapWall(w, ghost);
      if (ghost) for (const m of w.mats) m.opacity = m.userData.base * w.fade;
    }
  }

  /** See-through copies of the wall's materials while faded; the originals come back after. */
  swapWall(w, ghost) {
    w.ghost = ghost;
    const seen = new Set();
    const ghostOf = (m) => {
      let g = this.ghostMats.get(m);
      if (!g) {
        g = m.clone();
        g.userData.base = m.transparent ? m.opacity : 1;
        g.transparent = true;
        g.depthWrite = false;
        this.ghostMats.set(m, g);
      }
      if (!seen.has(g)) { seen.add(g); g.userData.base = m.transparent ? m.opacity : 1; }
      return g;
    };
    for (const root of w.objs) {
      root.traverse((o) => {
        if (!o.isMesh) return;
        if (ghost) {
          o.userData.solidMat = o.material;
          o.material = Array.isArray(o.material) ? o.material.map(ghostOf) : ghostOf(o.material);
          o.userData.cast = o.castShadow;
          o.castShadow = false;
        } else if (o.userData.solidMat) {
          o.material = o.userData.solidMat;
          o.castShadow = o.userData.cast ?? o.castShadow;
          delete o.userData.solidMat;
        }
      });
    }
    w.mats = ghost ? [...seen] : [];
  }

  /** Where in the world the main Clawd is right now. */
  clawdWorld(target = new THREE.Vector3()) {
    return target.set(this.clawd.pos.x, 0.5, this.clawd.pos.y).add(this.group.position);
  }

  // ── state from the server ────────────────────────────────────

  setState(s) {
    const prev = this.state;
    this.state = s;
    const done = (s.tasks || []).filter((t) => t.status === 'completed').map((t) => t.id + '|' + t.subject);
    if (s.thought?.at && s.thought.at !== this.lastThoughtAt) {
      if (prev && clock.now() - s.thought.at < 15000) this.clawd.idea();
      this.lastThoughtAt = s.thought.at;
    }
    const tools = (s.log || []).filter((e) => e.kind === 'tool');
    const tidied = (s.log || []).filter((e) => e.kind === 'note' && e.icon === 'compress').pop()?.at || null;
    if (!prev) {
      this.seenTasks = new Set(done);
      this.lastTurnStart = s.turn?.startedAt || null;
      this.lastTidy = tidied;
      this.lastTurnEnd = s.turn?.endedAt || null;
      this.lastErr = s.current?.status === 'error' ? s.current.id : null;
      this.lastToolId = tools.length ? tools[tools.length - 1].id : 0;
      this.toolStatus = new Map(tools.map((e) => [e.id, e.status]));
      return;
    }
    this.watchTools(tools, s.turn?.startedAt || 0);
    // A new message from you: what are we making?
    if (s.turn?.startedAt && s.turn.startedAt !== this.lastTurnStart) {
      this.lastTurnStart = s.turn.startedAt;
      if (!s.turn.auto && clock.now() - s.turn.startedAt < 15000) this.clawd.react('eager', 1.6);
    }
    // Memory got tidied up (context compacted): where was I?
    if (tidied && tidied !== this.lastTidy) {
      this.lastTidy = tidied;
      if (clock.now() - tidied < 20000) this.clawd.react('dazed', 4);
    }
    for (const key of done) {
      if (this.seenTasks.has(key)) continue;
      this.seenTasks.add(key);
      const b = this.bounds.whiteboard;
      this.confetti.burst((b.min.x + b.max.x) / 2, 1.6, (b.min.z + b.max.z) / 2 + 0.4, 36, 0.9);
      this.clawd.hop();
      this.clawd.react('proud', 2);
    }
    const cur = s.current;
    if (cur?.status === 'error' && cur.id !== this.lastErr) {
      this.lastErr = cur.id;
      if (clock.now() - (cur.endedAt || 0) < 8000) {
        this.clawd.shake();
        this.errorUntil = this.t + 2.6;
      }
    }
    const end = s.turn?.endedAt || null;
    if (end && end !== this.lastTurnEnd) {
      this.lastTurnEnd = end;
      if (s.turn.interrupted && clock.now() - end < 15000) this.clawd.react('startled', 1.2); // you stopped it: oops
      if (!s.turn.interrupted && clock.now() - end < 15000) {
        const st = this.st.stage.spot;
        setTimeout(() => this.confetti.burst(st[0], 1.2, st[1], 55, 1.1), 900);
      }
    }
  }

  /** New steps → pull out the tool; finished steps → a little floating result and a feeling. */
  watchTools(tools, start = 0) {
    const now = clock.now();
    const turnSteps = tools.filter((e) => e.at >= start);
    const fresh = tools.filter((e) => e.id > this.lastToolId);
    if (fresh.length) {
      const e = fresh[fresh.length - 1];
      this.lastToolId = e.id;
      if (now - e.at < 8000) this.pullFor(this.clawd, e);
    }
    for (const e of tools) {
      const before = this.toolStatus.get(e.id);
      if (e.status === 'running' || before === e.status) continue;
      if (now - (e.at + (e.duration || 0)) > 8000) continue;
      const d = e.delta;
      if (e.status === 'error') this.queueFloat(`✗ ${esc(e.tool || 'step')} failed`, 'bad');
      else if (d && (d.add || d.del)) this.queueFloat(d.whole ? `<b class="add">+${d.add}</b> lines` : `<b class="add">+${d.add}</b> <b class="del">−${d.del}</b>`, 'diff');
      else if ((e.duration || 0) >= 3000) this.queueFloat(`✓ ${fmtDur(e.duration)}`, 'good');
      const feel = e.at >= start ? reactionFor(e, turnSteps) : null;
      if (feel) this.clawd.react(feel[0], feel[1]);
    }
    this.toolStatus = new Map(tools.map((e) => [e.id, e.status]));
  }

  queueFloat(html, tone) {
    this.floatQ.push({ html, tone });
    if (this.floatQ.length > 4) this.floatQ.shift();
  }

  /** Pull out the right tool when a step starts — once per burst of the same kind of work. */
  pullFor(c, step) {
    const id = activityFor(step);
    const A = ACTIVITIES[id];
    const brand = brandFor(step);
    // Connectors show their cartridge (so you see which app); everything else, the tool for the job.
    const kind = brand ? 'cartridge' : A.item || A.pull || itemFor(step);
    const name = step.toolName || step.tool || '';
    const label = brand ? (name && name.toLowerCase() !== brand.name.toLowerCase() ? `${brand.name} · ${name}` : brand.name) : name;
    const who = `${id}|${brand?.name || ''}`;
    const same = c.lastPull && c.lastPull.who === who && this.t - c.lastPull.at < SAME_TOOL_GAP;
    c.lastPull = { who, at: this.t };
    if (!same) c.pullOut({ kind, brand, label: clipText(label, 30) });
  }

  // ── poking the furniture ─────────────────────────────────────

  /** The piece of furniture under the pointer (skipping things on a faded wall). */
  propAt(clientX, clientY) {
    const rect = this.world.renderer.domElement.getBoundingClientRect();
    if (!this.ray) {
      this.ray = new THREE.Raycaster();
      this.ray.params.Line.threshold = 0.02;
      this.ray.params.Points.threshold = 0.02;
    }
    this.ray.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), this.world.camera);
    for (const hit of this.ray.intersectObjects(this.propGroups, true)) {
      for (let o = hit.object; o && o !== this.group; o = o.parent) {
        const p = o.userData.prop;
        if (!p) continue;
        if (!p.group.userData.wall?.ghost) return p;
        break;
      }
    }
    return null;
  }

  hover(prop) {
    if (prop === this.hovered) return;
    this.hovered = prop;
    this.hoverHl.set(prop ? prop.box.clone().expandByScalar(0.04) : null);
    if (prop) this.placeOver(this.tipObj, prop);
    this.tipEl.innerHTML = prop && prop !== this.carded ? tipHtml(prop) : '';
  }

  /** Hovering a Clawd: a little tip under it saying how it feels and what it would say. */
  hoverMascot(id) {
    const c = id === 'main' ? this.clawd
      : id?.startsWith('agent:') ? [...this.helpers.values()].find((h) => 'agent:' + h.agent?.id === id)?.clawd
        : id?.startsWith('job:') ? this.workers.get(id.slice(4))?.clawd : null;
    if (c === this.mascotHover) return;
    this.mascotHover = c || null;
    this.feelTipKey = '';
    this.feelTipEl.innerHTML = '';
  }

  updateFeelTip() {
    const c = this.mascotHover;
    if (!c) return;
    if (c.vanishing) { this.hoverMascot(null); return; }
    this.feelTipObj.position.set(c.pos.x, 0.02, c.pos.y);
    const F = FEELINGS[c.feeling];
    const w = c.id.startsWith('job:') ? this.workers.get(c.id.slice(4)) : null;
    if (w) {
      // A background task: what it's doing, in full, and for how long.
      const job = w.job;
      const took = job.startedAt ? fmtDur(clock.now() - job.startedAt) : '';
      const key = `${c.feeling}|${job.about || job.label}|${took}`;
      if (key === this.feelTipKey) return;
      this.feelTipKey = key;
      this.feelTipEl.innerHTML = `<div class="proptip feeltip task"><b>${F ? F.emoji[0] + ' ' : ''}In the background${took ? ' · ' + took : ''}</b><span>${esc(job.about || job.label || 'Background task')}</span></div>`;
      return;
    }
    if (c.feeling === this.feelTipKey) return;
    this.feelTipKey = c.feeling;
    this.feelTipEl.innerHTML = F ? `<div class="proptip feeltip"><b>${F.emoji[0]} ${esc(F.word)}</b><span>“${esc(F.says)}”</span></div>` : '';
  }

  placeOver(obj, prop) {
    const b = prop.box;
    obj.position.set((b.min.x + b.max.x) / 2, b.max.y + 0.12, (b.min.z + b.max.z) / 2);
  }

  /** A click: the piece reacts, shows what happened there, and Clawd comes over (or at least looks). */
  poke(prop) {
    this.react(prop);
    if (this.cards !== false) this.showCard(prop);
    const b = prop.box;
    if (isIdle(this.state)) this.startVisit(prop);
    else this.clawd.glance((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2);
  }

  react(prop) {
    const L = this.L;
    let motion = prop.info.react || 'bounce';
    const inside = (o) => { for (; o; o = o.parent) if (o === prop.group) return true; return false; };
    if (motion === 'globe') {
      if (L.spinner && inside(L.spinner)) this.globeBoostUntil = this.t + 2.6;
      motion = 'bounce';
    } else if (motion === 'door') {
      this.doorOpenUntil = this.t + 1.8;
      motion = 'none';
    } else if (motion === 'drawers') {
      if (L.drawers?.group === prop.group) { this.drawerPokeUntil = this.t + 1.8; motion = 'none'; } else motion = 'bounce';
    } else if (motion === 'steam') {
      this.puff(prop, 'steam');
      motion = 'bounce';
    }
    if (REACT_T[motion]) this.reacts.set(prop, { type: motion, t0: this.t });
    this.puff(prop, 'spark');
  }

  puff(prop, kind) {
    const b = prop.box;
    const x = (b.min.x + b.max.x) / 2;
    const z = (b.min.z + b.max.z) / 2;
    if (kind === 'steam') this.fx.emit(x, b.max.y + 0.05, z, { n: 9, speed: 0.12, up: 0.45, life: 1.5, mats: ['steam', 'white'], size: 2.4, float: true });
    else this.fx.emit(x, b.max.y + 0.08, z, { n: 7, speed: 0.75, up: 0.85, life: 0.55, mats: ['gold', 'white'] });
  }

  /** Squash, spin and wiggle the poked furniture, then put it back exactly as it was. */
  updateReacts() {
    for (const [prop, r] of this.reacts) {
      if (prop === this.clawd?.pushing?.p) continue; // being pushed: leave it to the push
      const g = prop.group;
      const b = prop.base;
      const k = (this.t - r.t0) / REACT_T[r.type];
      g.position.copy(b.pos);
      g.rotation.y = b.rotY;
      g.rotation.z = b.rotZ;
      g.scale.copy(b.scale);
      if (k >= 1) { this.reacts.delete(prop); continue; }
      if (r.type === 'spin') {
        g.rotation.y = b.rotY + easeOut(k) * Math.PI * 2;
      } else if (r.type === 'wiggle') {
        g.rotation.z = b.rotZ + Math.sin(k * Math.PI * 6) * 0.09 * (1 - k);
      } else {
        // bounce / squish: squash down, spring up, settle.
        const depth = r.type === 'squish' ? 0.24 : 0.1;
        const sy = 1 - depth * Math.sin(k * Math.PI * 2.5) * Math.pow(1 - k, 1.6);
        g.scale.set(b.scale.x * (1 + (1 - sy) * 0.5), b.scale.y * sy, b.scale.z * (1 + (1 - sy) * 0.5));
        if (r.type === 'bounce') g.position.y = b.pos.y + Math.max(0, Math.sin(k * Math.PI)) * 0.05;
      }
    }
  }

  showCard(prop) {
    this.carded = prop;
    this.cardUntil = this.t + 12;
    this.tipEl.innerHTML = '';
    this.cardInner = '';
    this.renderCard();
    this.cardEl.hidden = false;
    this.cardEl.classList.remove('pop');
    void this.cardEl.offsetWidth; // restart the pop-in
    this.cardEl.classList.add('pop');
    this.placeCard();
  }

  /**
   * Keep the card next to its piece, inside the part of the screen the panels
   * don't cover: above it if there's room, else beside it, else below.
   */
  placeCard() {
    const b = this.carded.box;
    const project = (y) => {
      const v = new THREE.Vector3((b.min.x + b.max.x) / 2, y, (b.min.z + b.max.z) / 2);
      this.group.localToWorld(v).project(this.world.camera);
      return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight, behind: v.z > 1 };
    };
    const top = project(b.max.y + 0.05);
    const mid = project((b.min.y + b.max.y) / 2);
    const el = this.cardEl;
    if (top.behind) { el.style.visibility = 'hidden'; return; }
    el.style.visibility = '';
    const ins = this.world.insetTarget || { left: 0, right: 0, top: 0, bottom: 0 };
    const cw = el.offsetWidth;
    const ch = el.offsetHeight;
    const minX = ins.left + 10;
    const rightEdge = window.innerWidth - ins.right - 10;
    const maxX = Math.max(minX, rightEdge - cw);
    const minY = Math.max(ins.top, 64) + 6;
    const maxY = Math.max(minY, window.innerHeight - ins.bottom - 10 - ch);
    const cx = (v) => Math.min(maxX, Math.max(minX, v));
    const cy = (v) => Math.min(maxY, Math.max(minY, v));
    let place;
    let x;
    let y;
    if (top.y - ch - 18 >= minY) { place = 'above'; x = cx(top.x - cw / 2); y = top.y - ch - 18; }
    else if (mid.x + 26 >= minX && mid.x + 26 + cw <= rightEdge) { place = 'right'; x = mid.x + 26; y = cy(mid.y - ch / 2); }
    else if (mid.x - 26 - cw >= minX) { place = 'left'; x = mid.x - 26 - cw; y = cy(mid.y - ch / 2); }
    else { place = 'below'; x = cx(top.x - cw / 2); y = cy(mid.y + 40); }
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
    for (const c of ['above', 'right', 'left', 'below']) el.classList.toggle(c, c === place);
    const across = place === 'above' || place === 'below';
    const t = across ? top.x - x : mid.y - y;
    const len = across ? cw : ch;
    el.style.setProperty('--tail', `${Math.round(Math.min(len - 16, Math.max(16, t)))}px`);
    el.classList.toggle('notail', t < 8 || t > len - 8 || place === 'below');
  }

  renderCard() {
    if (!this.carded) return;
    const v = this.visit;
    const who = mascotName();
    const hint = v?.prop === this.carded ? (v.arrived ? '' : `${who} is coming over to look`) : isIdle(this.state) ? '' : `${who} is busy, so it just looks over`;
    const html = cardHtml(this.carded, this.state, { cups: this.cups, hint });
    if (html !== this.cardInner) {
      this.cardInner = html;
      this.cardEl.innerHTML = html;
    }
  }

  closeCard() {
    this.carded = null;
    this.cardEl.hidden = true;
  }

  /** Clawd walks over to a piece you clicked and plays with it (only when it isn't working). */
  startVisit(prop) {
    let station = prop.role && this.st[prop.role] ? prop.role : null;
    if (!station) {
      this.st.visit = this.spotNear(prop);
      station = 'visit';
    }
    const pose = station === 'visit' ? 'look' : prop.role === 'bed' ? 'rest' : prop.role === 'armchair' ? 'think' : STATION_POSE[prop.role] || 'look';
    this.visit = { prop, station, pose, until: this.t + 14, arrived: false, bubble: null };
  }

  /** A free spot in front of a piece, facing it. */
  spotNear(prop) {
    const g = prop.group;
    const b = prop.box;
    const cx = (b.min.x + b.max.x) / 2;
    const cz = (b.min.z + b.max.z) / 2;
    const fx = Math.sin(g.rotation.y);
    const fz = Math.cos(g.rotation.y);
    const half = (Math.abs(fx) * (b.max.x - b.min.x) + Math.abs(fz) * (b.max.z - b.min.z)) / 2;
    let x = cx + fx * (half + 0.6);
    let z = cz + fz * (half + 0.6);
    if (!this.nav.walkable(x, z)) {
      const [c, r] = this.nav.nearestFree(x, z);
      x = this.nav.cx(c);
      z = this.nav.cz(r);
    }
    return { spot: [x, z], face: Math.atan2(cx - x, cz - z) };
  }

  visitIntent(s) {
    const v = this.visit;
    if (!v) return null;
    if (!isIdle(s) || this.t > v.until) { this.visit = null; return null; }
    const c = this.clawd;
    if (!v.arrived && c.drive.goal === v.station && !c.walking) {
      v.arrived = true;
      v.until = this.t + VISIT_PLAY;
      this.onVisit(v);
    }
    const name = v.prop.info.name.toLowerCase();
    const text = !v.arrived ? `Going to look at the ${name}` : v.prop.kind === 'coffeeCounter' ? 'Coffee break!' : v.prop.role === 'bed' ? 'Quick nap' : `Playing with the ${name}`;
    const feel = !v.arrived ? 'curious' : v.prop.kind === 'coffeeCounter' ? 'content' : v.prop.role === 'bed' ? 'sleepy' : 'joyful';
    return { station: v.station, pose: v.pose, tag: { text, iconName: roleIcon(v.prop.role), tone: 'idle' }, bubble: v.arrived ? v.bubble : null, feel };
  }

  onVisit(v) {
    const p = v.prop;
    this.react(p);
    this.clawd.hop();
    if (p.kind === 'coffeeCounter') {
      this.cups++;
      this.clawd.float('+1 cup', 'good');
      this.puff(p, 'steam');
    } else if (p.role === 'bed') {
      v.bubble = 'zzz';
    } else {
      this.clawd.float(['♪', '♥', '!'][Math.floor(Math.random() * 3)], 'love');
    }
    if (this.carded === p) this.renderCard();
  }

  /** Clicking Clawd: a happy hop and hearts. Five quick pets in a row: confetti. */
  petClawd() {
    if (this.clawd.pet() >= 5) {
      this.clawd.petCount = 0;
      this.confetti.burst(this.clawd.pos.x, 1.5, this.clawd.pos.y, 40, 0.9);
    }
  }

  petWorker(jobId) {
    this.workers.get(jobId)?.clawd.pet();
  }

  petHelper(agentId) {
    for (const h of this.helpers.values()) if (h.agent?.id === agentId) h.clawd.pet();
  }

  // ── acting out each step ─────────────────────────────────────

  /**
   * Where and how to act out a step: the first place on the activity's list
   * that this room has. Spare pieces beat someone's work station (the second
   * server rack over the busy one), and helpers take pieces nobody is using.
   */
  planFor(act, helper = false, taken = new Set()) {
    const id = activityFor(act);
    const A = ACTIVITIES[id];
    let pick = null;
    for (const token of A.at) {
      let options;
      if (token.startsWith('@')) {
        const role = token.slice(1);
        options = this.st[role] ? [{ key: role, prop: this.roleProp[role] || null }] : [];
      } else {
        options = this.props.filter((p) => p.kind === token).map((p) => ({ key: this.stationFor(p, A), prop: p }));
        options.sort((a, b) => (taken.has(a.key) - taken.has(b.key)) || ((a.prop.role ? 1 : 0) - (b.prop.role ? 1 : 0)));
      }
      if (!options.length) continue;
      pick = pick || options[0];
      if (!helper || !taken.has(options[0].key)) { pick = options[0]; break; }
    }
    if (!pick) pick = { key: this.st[act.station] ? act.station : 'center', prop: this.roleProp[act.station] || null };
    return { id, A, ...pick };
  }

  /** The station key for working at a piece: its own station, or a spot in front of it. */
  stationFor(prop, A) {
    const st = prop.role && this.st[prop.role];
    if (st && !A.face && (A.sit || !st.seat)) return prop.role;
    const key = `at:${this.props.indexOf(prop)}${A.face === 'out' ? ':out' : ''}`;
    if (!this.st[key]) {
      const spot = this.spotNear(prop);
      if (A.face === 'out') spot.face += Math.PI;
      this.st[key] = spot;
      this.slots[key] = this.slotsAround(spot);
      this.bounds[key] = prop.box.clone().expandByScalar(0.08);
    }
    return key;
  }

  /** What a throw aims at: the piece itself, or out through the door. */
  targetOf(plan) {
    const kind = plan.A.throw;
    if (!kind) return null;
    if (kind === 'door') {
      const [x, z] = this.L.door.inside;
      return new THREE.Vector3(x - 1.0, 1.05, z - 0.3);
    }
    const b = plan.prop?.box || this.bounds[plan.key];
    if (!b) return null;
    const y = plan.A.pose === 'shelve' ? Math.min(b.max.y - 0.35, 1.45) : b.max.y + 0.04;
    return new THREE.Vector3((b.min.x + b.max.x) / 2, y, (b.min.z + b.max.z) / 2);
  }

  /** The item an intent should hold for a plan (connectors keep their own badge). Mini Clawds can't reach a big rig, so they bring their own. */
  itemOf(plan, act, mini = false) {
    if (!plan.A.item || (!mini && plan.A.bare?.includes(plan.prop?.kind))) return null;
    return { kind: plan.A.item, brand: plan.A.item === 'cartridge' ? brandFor(act) : null };
  }

  /** Where a Clawd's right hand is, in room coordinates. */
  handOf(c) {
    const s = c.scale;
    const h = c.heading;
    const lx = 0.42 * s;
    const lz = 0.3 * s;
    return new THREE.Vector3(c.pos.x + lx * Math.cos(h) + lz * Math.sin(h), c.lift.position.y * s + 0.78 * s, c.pos.y - lx * Math.sin(h) + lz * Math.cos(h));
  }

  /** A pose's big moment: throws fly, rockets launch, parcels drop in. */
  clawdAction(c, pose) {
    if (pose === 'toss' && c.target && c.hand) {
      const kind = c.handKey.split('|')[0];
      this.fly(kind, this.handOf(c), c.target, { dur: 0.8, arc: 0.75, spin: kind === 'paperBall' ? 9 : 0, scale: 0.5 * c.scale + 0.1 });
    } else if (pose === 'shelve' && c.target) {
      this.fly('book', this.handOf(c), c.target, { dur: 0.45, arc: 0.15, stay: 0.9, scale: 0.42, face: false });
    } else if (pose === 'launch') {
      const h = c.heading;
      const x = c.pos.x + Math.sin(h) * 0.75;
      const z = c.pos.y + Math.cos(h) * 0.75;
      this.fly('rocket', new THREE.Vector3(x, 0.02, z), new THREE.Vector3(x, 6.5, z), {
        dur: 2.0, arc: 0, ease: 'in', scale: 0.62, face: false, puff: false,
        trail: { n: 2, speed: 0.18, up: -0.4, life: 0.9, mats: ['smoke', 'white', 'clay'], size: 1.8, float: true },
      });
      this.fx.emit(x, 0.1, z, { n: 14, speed: 1.0, up: 0.3, life: 0.9, mats: ['smoke', 'white'], size: 2, float: true });
    } else if (pose === 'catch') {
      const y = c.lift.position.y * c.scale + 0.62 * c.scale;
      this.fly('box', new THREE.Vector3(c.pos.x, 4.6, c.pos.y), new THREE.Vector3(c.pos.x, y, c.pos.y), { dur: 1.2, arc: 0, ease: 'in', scale: 0.55 * c.scale, face: false, puff: false, spin: 2.5 });
    }
  }

  fly(kind, from, to, { dur = 0.8, arc = 0.6, spin = 0, scale = 0.5, stay = 0, ease = 'linear', trail = null, face = true, puff = true } = {}) {
    const obj = buildItem(kind);
    obj.scale.setScalar(scale);
    obj.position.copy(from);
    this.group.add(obj);
    this.flyers.push({ obj, from: from.clone(), to: to.clone(), t0: this.t, dur, arc, spin, stay, ease, trail, face, puff });
  }

  updateFlyers(dt) {
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      const k = Math.min(1, (this.t - f.t0) / f.dur);
      const e = f.ease === 'in' ? k * k : k;
      const p = f.obj.position.lerpVectors(f.from, f.to, e);
      p.y += Math.sin(k * Math.PI) * f.arc;
      if (f.spin) f.obj.rotation.x += f.spin * dt;
      if (f.face) {
        f.obj.rotation.y = Math.atan2(f.to.x - f.from.x, f.to.z - f.from.z);
        f.obj.rotation.x = -Math.cos(k * Math.PI) * f.arc * 0.5; // nose up, then down
      }
      if (f.trail && k < 1) this.fx.emit(p.x, p.y, p.z, f.trail);
      if (this.t - f.t0 >= f.dur + f.stay) {
        f.obj.removeFromParent();
        this.flyers.splice(i, 1);
        if (f.puff) this.fx.emit(f.to.x, f.to.y, f.to.z, { n: 6, speed: 0.6, up: 0.6, life: 0.4, mats: ['white', 'gold'] });
      }
    }
  }

  // ── decisions ────────────────────────────────────────────────

  /** The latest thinking summary from this request, if it's recent enough to show. */
  freshThought(s, now, thinking = false) {
    const th = s?.thought;
    if (!th?.text || (s.turn && th.at < s.turn.startedAt)) return null;
    if (!thinking && now - th.at > THOUGHT_SHOW) return null;
    return simplify(th.text, 12) || null;
  }

  decideMain(s, now) {
    const visit = this.visitIntent(s);
    if (visit) return visit;
    if (!s) return { station: 'bed', pose: 'sleep', tag: { text: 'Waiting for a session', iconName: 'moon', tone: 'idle' }, bubble: 'zzz' };
    const since = now - (s.statusSince || now);
    if (s.status === 'stale' || (!s.live && s.status !== 'idle')) {
      return { station: 'bed', pose: 'sleep', tag: { text: 'This session went quiet', iconName: 'moon', tone: 'idle' }, bubble: 'zzz' };
    }
    if (s.status === 'idle') {
      const sinceEnd = s.turn?.endedAt ? now - s.turn.endedAt : Infinity;
      if (sinceEnd < 9000 && !s.turn?.interrupted) {
        return { station: 'stage', pose: 'celebrate', tag: { text: 'Done! Your turn', iconName: 'check', tone: 'waiting' }, bubble: 'ok' };
      }
      const nap = since > NAP_AFTER;
      const chore = !nap && sinceEnd > TIDY_AFTER ? this.tidyIntent() : null;
      if (chore) return chore;
      // Mini Clawds still working in the background: wait up for them (clock out, foot tapping).
      const busy = runningInBackground(s);
      if (busy) {
        const plan = this.planFor({ activity: 'wait', station: 'armchair' });
        return { station: plan.key, pose: 'wait', item: this.itemOf(plan, {}), tag: { text: stillWorking(busy), iconName: 'terminal', tone: 'idle' }, feel: 'patient' };
      }
      return {
        station: 'bed', pose: nap ? 'sleep' : 'rest',
        tag: { text: nap ? 'Napping until you need me' : 'Waiting for you', iconName: nap ? 'moon' : 'user', tone: 'idle', timerFrom: nap ? null : s.statusSince },
        bubble: nap ? 'zzz' : null,
      };
    }
    const act = s.pending?.length ? s.pending[s.pending.length - 1] : null;
    const thought = this.freshThought(s, now);
    if (s.status === 'working' && act) {
      if (act.asksUser) {
        const plan = this.planFor(act);
        return { station: plan.key, pose: plan.A.pose, item: this.itemOf(plan, act), tag: { text: act.text, iconName: 'question', tone: 'waiting', timerFrom: act.startedAt }, bubble: 'ask' };
      }
      if (probablyNeedsApproval(act, s, now)) {
        return { station: 'stage', pose: 'wave', tag: { text: `Waiting for your OK? (${act.text})`, iconName: 'question', tone: 'waiting', timerFrom: act.startedAt }, bubble: 'ask' };
      }
      const plan = this.planFor(act);
      const long = plan.A.long && now - act.startedAt > plan.A.long[0] && !act.background;
      return {
        station: plan.key, pose: long ? plan.A.long[1] : plan.A.pose, act, plan,
        item: long ? null : this.itemOf(plan, act), target: this.targetOf(plan),
        tag: { text: asDoing(act.text), iconName: act.icon, timerFrom: act.startedAt, brand: brandFor(act) },
        bubble: thought ? 'thought' : null, thought,
      };
    }
    return this.thinkIntent(s, now, since);
  }

  /**
   * Thinking, acted out by mood (thinking.js): reading your message, hunting a
   * bug where it broke, weighing options, pacing when unsure… Long thoughts end
   * up in the armchair whatever they're about (plans stay at the board, bugs
   * where they broke).
   */
  thinkIntent(s, now, since) {
    const id = moodFor(s, now);
    const M = MOODS[id];
    const mind = this.freshThought(s, now, true);
    const base = { tag: { text: M.tag, iconName: 'dots', tone: 'thinking', timerFrom: s.statusSince }, bubble: mind ? 'thought' : 'think', thought: mind, thinking: true, mood: id };
    if (since > THINK_CHAIR_AFTER && id !== 'plan' && id !== 'debug') return { ...base, station: 'armchair', pose: 'think' };
    if (id === 'default' && since > THINK_BOARD_AFTER) return { ...base, station: 'whiteboard', pose: 'draw' };
    let station = null;
    if (M.at === 'pace') station = Math.floor(this.t / 3.2) % 2 ? 'pace:a' : 'pace:b';
    else if (M.at === 'failure') {
      const start = s.turn?.startedAt || 0;
      const broke = (s.log || []).filter((e) => e.kind === 'tool' && e.at >= start && e.status === 'error').pop();
      station = broke ? this.planFor(broke).key : null;
    } else if (M.at) station = M.at.slice(1);
    return { ...base, station, pose: M.pose, item: M.item ? { kind: M.item } : null };
  }

  /** Move a Clawd toward the intent's station (with a little dwell so it doesn't jitter). */
  drive(c, intent, slot) {
    const w = c.drive || (c.drive = { goal: null, arrivedAt: 0 });
    if (c.pushing) {
      // Busy moving something out of the way: say so, and finish that first.
      c.setTag({ text: c.pushing.text, iconName: 'sparkle', tone: 'idle' });
      c.setBubble(null);
      return;
    }
    c.setTag(intent.tag);
    c.equip(intent.item?.kind || null, intent.item?.brand || null);
    c.target = intent.target || null;
    const err = slot === 0 && this.t < this.errorUntil;
    c.setBubble(err ? 'err' : intent.bubble, intent.thought || '');
    let want = intent.station;
    // Thinking "in place" from bed or the stage means: get up and think in the middle of the room.
    if (!want && slot === 0 && intent.thinking && RESTING.has(w.goal) && w.goal !== 'center') want = 'center';
    if (want && want !== w.goal) {
      const dwell = this.t - w.arrivedAt;
      const urgent = want === 'stage';
      if (c.walking || !w.goal || dwell > 1.1 || urgent) {
        w.goal = want;
        this.sendTo(c, want, slot, intent.own);
      }
    }
    if (!c.walking && (want == null || want === w.goal)) c.setPose(intent.pose);
  }

  sendTo(c, station, slot, own = false) {
    const st = this.st[station];
    if (!st) return;
    const main = slot === 0;
    // Helpers who have a piece to themselves stand right at it; others squeeze in beside.
    const atSpot = main || own;
    const spot = atSpot ? new THREE.Vector2(st.spot[0], st.spot[1]) : this.slots[station][(slot - 1) % 6].clone();
    const approach = atSpot && st.approach ? new THREE.Vector2(st.approach[0], st.approach[1]) : null;
    // Clawd shoves light things out of the way rather than walking through them (or way around them).
    if (main && station !== 'tidy' && (c.shoves || 0) < 3) {
      const sh = this.planShove(c, station, spot, approach);
      if (sh) { c.shoves = (c.shoves || 0) + 1; this.goShove(c, sh); return; }
    }
    const path = this.route(c.pos, c.heading, spot, approach);
    c.walk(path, {
      face: st.face,
      seat: main ? st.seat || 0 : 0,
      onArrive: () => {
        c.drive.arrivedAt = this.t;
        c.shoves = 0;
        if (main) this.trail.hide();
        if (station === 'tidy' && this.chore && main) this.startShove(c, this.chore);
      },
    });
    if (main) this.trail.set([c.pos.clone(), ...path]);
  }

  syncHelpers(s) {
    const running = (s?.agents || []).filter((a) => a.status === 'running' || a.status === 'starting');
    const active = running.slice(-MAX_HELPERS);
    const extra = running.length - active.length;
    this.moreHelpers = extra; // shown on the door with any extra background tasks (syncWorkers)
    // A helper is first listed under a temporary id, then its real one; the call that launched it stays the same.
    const keyOf = (a) => a.toolUseId || a.id;
    const keep = new Set(active.map(keyOf));
    for (const h of this.helpers.values()) if (!keep.has(h.id) && !h.leaving) this.dismiss(h);
    // Spots already in use (Clawd's first), so helpers spread out over the room.
    const taken = new Set(this.intent?.station ? [this.intent.station] : []);
    for (const a of active) {
      let h = this.helpers.get(keyOf(a));
      if (!h) h = this.spawn(a, keyOf(a));
      h.agent = a;
      h.clawd.root.userData.workerId = 'agent:' + a.id; // clicks open the helper under its current id
      if (h.leaving) continue;
      const act = a.pending?.length ? a.pending[a.pending.length - 1] : null;
      let station = null;
      let pose = 'ponder';
      let sub = 'Thinking…';
      let iconName = 'dots';
      let item = null;
      let target = null;
      let own = false;
      if (act) {
        const plan = this.planFor(act, true, taken);
        own = !taken.has(plan.key);
        taken.add(plan.key);
        station = plan.key === 'stage' ? 'portal' : plan.key; // helpers don't take the stage
        const long = plan.A.long && clock.now() - act.startedAt > plan.A.long[0];
        pose = long ? plan.A.long[1] : plan.A.pose;
        item = long ? null : this.itemOf(plan, act, true);
        target = this.targetOf(plan);
        sub = asDoing(act.text);
        iconName = act.icon;
        if (act.id !== h.lastActId) {
          h.lastActId = act.id;
          if (clock.now() - act.startedAt < 8000) this.pullFor(h.clawd, act);
        }
      } else if (a.status === 'starting' || !a.toolCalls) {
        sub = 'Getting started…';
        pose = 'idle';
      } else {
        // Helpers think in place, in the mood their latest thought suggests.
        const M = MOODS[moodOfText(a.thought?.text)];
        sub = M.tag;
        pose = M.pose === 'pace' ? 'recall' : M.pose === 'draw' ? 'sketch' : M.pose;
        item = M.item ? { kind: M.item } : null;
      }
      // How the helper feels: its latest step tells if its tries are failing or finally worked.
      const cur = a.current;
      const curKey = cur ? `${cur.id}|${cur.status}` : '';
      if (curKey !== h.curKey) {
        const fresh = cur && h.curKey !== undefined && clock.now() - (cur.endedAt || cur.startedAt || 0) < 8000;
        h.curKey = curKey;
        if (fresh && cur.status === 'error') {
          h.fails = (h.fails || 0) + 1;
          h.clawd.react(h.fails >= 2 ? 'frustrated' : 'startled', 2);
        } else if (fresh && cur.status === 'done' && h.fails) {
          h.clawd.react(h.fails >= 2 ? 'triumphant' : 'relieved', 2.4);
          h.fails = 0;
        }
      }
      h.clawd.setFeeling(helperFeeling(a, clock.now(), h.fails || 0));
      const th = a.thought && clock.now() - a.thought.at < 7000 ? simplify(a.thought.text, 10) : '';
      if (a.thought?.at && a.thought.at !== h.lastThoughtAt) {
        if (h.lastThoughtAt !== undefined) h.clawd.idea();
        h.lastThoughtAt = a.thought.at;
      }
      this.drive(h.clawd, { station, pose, item, target, own, tag: { text: a.description, sub, iconName, helper: true, hat: h.color, brand: brandFor(act) }, bubble: th ? 'thought' : null, thought: th }, h.slot);
    }
  }

  // ── background tasks: mini Clawds in hard hats ──────────────

  /**
   * Each background command Claude has running is a mini Clawd in a hard
   * hat: it hops out of the terminal, works at the right spot for the job
   * (getting bored on long ones), and when it's done brings the result to
   * Clawd and heads out the door.
   */
  syncWorkers(s, now) {
    const running = s?.live ? (s.jobs || []).filter((j) => j.kind === 'shell' && j.status === 'running') : [];
    const active = running.slice(-MAX_WORKERS);
    const keep = new Set(active.map((j) => j.id));
    for (const w of this.workers.values()) {
      if (!keep.has(w.id) && !w.leaving) this.finishWorker(w, (s?.jobs || []).find((j) => j.id === w.id));
    }
    const extra = running.length - active.length;
    const more = [
      this.moreHelpers > 0 ? `+${this.moreHelpers} more helper${this.moreHelpers > 1 ? 's' : ''} working` : '',
      extra > 0 ? `+${extra} more in the background` : '',
    ].filter(Boolean).map((t) => `<div class="tag helper"><span class="tx">${t}</span></div>`).join('');
    if (more !== this.moreHtml) { this.moreHtml = more; this.moreEl.innerHTML = more; }
    // Spots already in use, so everyone spreads out over the room.
    const taken = new Set([this.intent?.station, ...[...this.helpers.values()].map((h) => h.clawd.drive?.goal)].filter(Boolean));
    for (const job of active) {
      const w = this.workers.get(job.id) || this.spawnWorker(job);
      if (w.leaving) continue;
      const act = { activity: job.activity, station: job.station || 'terminal', startedAt: job.startedAt || now };
      const plan = this.planFor(act, true, taken);
      const own = !taken.has(plan.key);
      taken.add(plan.key);
      const long = plan.A.long && now - act.startedAt > plan.A.long[0];
      w.clawd.setFeeling(workFeeling(act, now, 6)); // background jobs are meant to be long: patient for a few minutes, bored after ~15
      w.job = job;
      // Just a short hello when it shows up; hover it to see the whole task.
      const fresh = this.t - w.bornAt < 4;
      this.drive(w.clawd, {
        station: plan.key === 'stage' ? 'portal' : plan.key, own,
        pose: long ? plan.A.long[1] : plan.A.pose, item: long ? null : this.itemOf(plan, act, true), target: this.targetOf(plan),
        tag: fresh ? { text: 'Working on a background task', iconName: 'terminal', helper: true, hat: '#e6b34c' } : { text: '' },
      }, w.slot);
    }
  }

  spawnWorker(job) {
    const used = new Set([...this.helpers.values(), ...this.workers.values()].map((h) => h.slot));
    let slot = 1;
    while (used.has(slot)) slot++;
    const c = new Clawd({ id: 'job:' + job.id, scale: 0.45, speed: 2.2, skin: this.agent === 'codex' ? 'codex' : 'clawd' });
    c.wear('hardhat');
    c.onAction = (pose, who) => this.clawdAction(who, pose);
    // Background work starts at the terminal: that's where it hops out.
    const st = this.st.terminal;
    const [x, z] = st.approach || st.spot;
    c.place(x, z, st.face + Math.PI);
    c.drive = { goal: null, arrivedAt: 0 };
    this.group.add(c.root);
    c.hop();
    this.fx.emit(x, 0.5, z, { n: 10, speed: 0.6, up: 0.9, life: 0.55, mats: ['green', 'white', 'gold'] });
    const w = { id: job.id, clawd: c, slot, leaving: false, job, bornAt: this.t };
    this.workers.set(job.id, w);
    return w;
  }

  /** Done: cheer, bring the result over to Clawd, out the door. Failed: droop and go. Unknown: just go. */
  finishWorker(w, job) {
    w.leaving = true;
    const c = w.clawd;
    const ok = job?.status === 'done' || job?.status === 'completed';
    const failed = ['failed', 'error', 'killed'].includes(job?.status);
    c.setTag(ok || failed ? { text: ok ? 'Done!' : 'It didn’t work', iconName: ok ? 'check' : 'alert', helper: true, hat: '#e6b34c' } : { text: '' });
    c.setBubble(ok ? 'ok' : failed ? 'err' : null);
    c.setPose(ok ? 'celebrate' : 'idle');
    if (ok || failed) { c.react(ok ? 'proud' : 'deflated', 2.5); c.hop(); }
    const leave = () => {
      if (this.disposed) return;
      c.equip(null);
      c.setBubble(null);
      const [fx, fz] = this.L.door.front;
      const [ix, iz] = this.L.door.inside;
      const path = this.route(c.pos, c.heading, new THREE.Vector2(fx, fz));
      path.push(new THREE.Vector2(ix, iz));
      c.walk(path, {
        face: -Math.PI / 2,
        onArrive: () => {
          this.doorOpenUntil = this.t + 1.4;
          c.vanish(() => { c.dispose(); this.workers.delete(w.id); });
        },
      });
    };
    setTimeout(() => {
      if (this.disposed) return;
      if (!ok) { leave(); return; }
      // Bring the result to Clawd, wherever it is (each worker to its own side of it).
      const m = this.clawd.pos;
      let spot = null;
      for (let k = 0; k < 8 && !spot; k++) {
        const a = w.slot * 1.9 + (k / 8) * Math.PI * 2;
        const x = m.x + Math.sin(a) * 0.95;
        const z = m.y + Math.cos(a) * 0.95;
        if (this.nav.walkable(x, z)) spot = new THREE.Vector2(x, z);
      }
      if (!spot) { leave(); return; }
      c.setTag({ text: 'Bringing the result', iconName: 'check', helper: true, hat: '#e6b34c' });
      c.equip('envelope');
      c.walk(this.route(c.pos, c.heading, spot), {
        face: Math.atan2(m.x - spot.x, m.y - spot.y),
        onArrive: () => {
          c.setPose('present');
          this.clawd.glance(c.pos.x, c.pos.y, 2);
          setTimeout(leave, 1700);
        },
      });
    }, ok || failed ? 1500 : 400);
  }

  spawn(a, key) {
    const used = new Set([...this.helpers.values()].map((h) => h.slot));
    let slot = 1;
    while (used.has(slot)) slot++;
    const color = HAT_COLORS[hash(key) % HAT_COLORS.length];
    const c = new Clawd({ id: 'agent:' + a.id, scale: 0.6, hat: color, speed: 2.5, skin: this.agent === 'codex' ? 'codex' : 'clawd' });
    c.onAction = (pose, who) => this.clawdAction(who, pose);
    const [ix, iz] = this.L.door.inside;
    c.place(ix, iz, Math.PI / 2);
    c.drive = { goal: null, arrivedAt: 0 };
    this.group.add(c.root);
    const h = { id: key, clawd: c, slot, color, leaving: false, agent: a };
    this.helpers.set(key, h);
    this.doorOpenUntil = this.t + 2.2;
    this.confetti.burst(ix + 0.35, 1.2, iz, 10, 0.5);
    return h;
  }

  dismiss(h) {
    h.leaving = true;
    const c = h.clawd;
    const ok = h.agent?.status !== 'failed';
    c.setTag({ text: h.agent?.description || 'Helper', sub: ok ? 'Done, heading out' : 'Stopped', iconName: ok ? 'check' : 'alert', helper: true, hat: h.color });
    c.setBubble(ok ? 'ok' : 'err');
    c.setPose(ok ? 'celebrate' : 'idle');
    c.react(ok ? 'proud' : 'deflated', 3);
    c.hop();
    setTimeout(() => {
      c.setBubble(null);
      const [fx, fz] = this.L.door.front;
      const [ix, iz] = this.L.door.inside;
      const path = this.route(c.pos, c.heading, new THREE.Vector2(fx, fz));
      path.push(new THREE.Vector2(ix, iz));
      c.walk(path, {
        face: -Math.PI / 2,
        onArrive: () => {
          this.doorOpenUntil = this.t + 1.4;
          c.vanish(() => {
            c.dispose();
            this.helpers.delete(h.id);
          });
        },
      });
    }, 1500);
  }

  // ── per frame ────────────────────────────────────────────────

  tick(dt, t) {
    this.t = t;
    if (this.pendingPop) {
      this.pendingPop = false;
      this.popAt = t;
      this.confetti.burst(0.2, 2.2, 0.8, 60, 1.2);
    }
    const now = clock.now();
    const s = this.state;
    const cam = this.world.camera.position;
    const tgt = this.world.controls.target;
    setViewYaw(Math.atan2(cam.x - tgt.x, cam.z - tgt.z), Math.atan2(cam.y - tgt.y, Math.hypot(cam.x - tgt.x, cam.z - tgt.z)));
    const intent = this.decideMain(s, now);
    this.intent = intent;
    this.clawd.bitsTone = intent.station === 'terminal' ? 'term' : 'code';
    if (this.floatQ.length && t - this.lastFloatAt > 0.45) {
      const f = this.floatQ.shift();
      this.clawd.float(f.html, f.tone);
      this.lastFloatAt = t;
    }
    this.drive(this.clawd, intent, 0);
    this.updateShove();
    this.clawd.setFeeling(this.clawd.pushing?.phase === 'push' && !this.chore ? 'determined' : intent.feel || feelingFor(s, now));
    this.syncHelpers(s);
    this.syncWorkers(s, now);
    this.clawd.update(dt, t);
    for (const h of this.helpers.values()) h.clawd.update(dt, t);
    for (const w of this.workers.values()) w.clawd.update(dt, t);
    this.trail.update(dt, t, this.clawd.walked);
    this.updateWalls(dt);
    this.updateReacts();
    this.updateFlyers(dt);
    this.updateFeelTip();
    this.fx.update(dt);
    this.hoverHl.update(dt, t);
    if (this.carded) {
      if (t > this.cardUntil) this.closeCard();
      else {
        if (t - this.cardTick > 1) { this.cardTick = t; this.renderCard(); }
        this.placeCard();
      }
    }
    this.confetti.update(dt);
    this.updateProps(dt, t, s, now, intent);
  }

  tickLabels(now) {
    for (const w of this.workers.values()) w.clawd.tickTimer(now, fmtDur);
    this.clawd.tickTimer(now, fmtDur);
  }

  updateProps(dt, t, s, now, intent) {
    const L = this.L;
    const c = this.clawd;
    const at = !c.walking ? c.drive.goal : null;

    // Which stations someone (Clawd or a helper) is working at right now.
    const busy = new Set();
    if (at && intent.station === at) busy.add(at);
    for (const h of [...this.helpers.values(), ...this.workers.values()]) if (!h.leaving && !h.clawd.walking && h.clawd.drive?.goal) busy.add(h.clawd.drive.goal);

    // Brackets around the station Clawd is working at.
    const hl = at && intent.station === at && this.bounds[at] ? at : '';
    if (hl !== this.highlightKey) {
      this.highlightKey = hl;
      this.highlight.set(hl ? this.bounds[hl] : null);
    }
    this.highlight.update(dt, t);

    // Desk screen: code / timeline / design canvas / notes, depending on the room.
    const deskAct = intent.station === 'desk' ? intent.act : null;
    if (deskAct) {
      const name = deskAct.label || 'untitled';
      if (this.editor.file !== name) { this.editor.file = name; this.editor.typed = 0; }
      this.editor.verb = deskAct.verb;
      this.editor.mode = 'edit';
      if (at === 'desk') this.editor.typed += dt * 2.2;
    } else {
      this.editor.mode = 'idle';
      if (!this.editor.file) this.editor.file = s?.files?.find((f) => f.edits)?.name || 'notes.md';
    }
    L.screens.desk?.tick(dt, (g, w, h) => this.drawDesk(g, w, h, this.editor, t));

    // Command screen: the newest shell command, running or finished.
    const termAct = (s?.pending || []).filter((a) => a.station === 'terminal').pop() || (s?.current?.station === 'terminal' ? s.current : null);
    if (termAct) {
      this.termState = {
        command: termAct.detail || termAct.label,
        status: termAct.status,
        elapsed: ((termAct.endedAt || now) - termAct.startedAt) / 1000,
      };
    }
    L.screens.terminal?.tick(dt, (g, w, h) => this.drawTerm(g, w, h, this.termState, t));

    // The plan on the board.
    L.screens.board?.tick(dt, (g, w, h) => P.drawBoard(g, w, h, s?.tasks || [], t, this.look));

    // Web screens show the page being looked at.
    const webAct = [...(s?.pending || []), ...(s?.agents || []).flatMap((a) => a.pending || [])].filter((a) => a.station === 'globe').pop();
    if (webAct) this.web = { text: webAct.text, url: webAct.detail || webAct.label, active: true };
    else this.web.active = false;

    // Racks and towers: one lit row per running background job.
    if (L.leds) {
      const jobs = (s?.jobs || []).filter((j) => j.status === 'running').length + (termAct?.status === 'running' ? 1 : 0);
      for (let i = 0; i < L.leds.length; i++) {
        const row = Math.floor(i / 4);
        const lit = row < jobs;
        const on = lit ? Math.sin(t * (7 + (i % 5)) + i * 1.9) > -0.2 : (i % 9 === 0 && Math.sin(t * 0.9 + i) > 0.7);
        const col = on ? (lit ? 0xf0a678 : 0xd4a27f) : 0x2f2c26;
        if (L.leds[i].material.color.getHex() !== col) L.leds[i].material.color.setHex(col);
      }
    }

    // Helper door swings open when helpers come and go.
    const helperWorking = [...this.helpers.values()].some((h) => !h.leaving);
    const portalBusy = busy.has('portal') || this.t < this.doorOpenUntil;
    this.doorAngle = damp(this.doorAngle, portalBusy ? 1.0 : 0, 5, dt);
    L.door.hinge.rotation.y = this.doorAngle;
    L.door.glowMat.opacity = Math.min(1, this.doorAngle * 1.1) * (0.75 + Math.sin(t * 5) * 0.2) + (helperWorking ? 0.05 : 0);

    // Globes spin faster while someone is on the web.
    if (L.spinner) {
      this.spinSpeed = damp(this.spinSpeed, this.t < this.globeBoostUntil ? 9 : busy.has('globe') ? 2.4 : 0.12, 2.5, dt);
      L.spinner.rotation.y += this.spinSpeed * dt;
    }

    // Drawers (or the flight-case lid) open while searching.
    const searching = busy.has('cabinet') || this.t < this.drawerPokeUntil;
    if (searching && this.drawerOpen < 0.05 && L.drawers) this.drawerIdx = Math.floor(Math.random() * L.drawers.drawers.length);
    this.drawerOpen = damp(this.drawerOpen, searching ? 1 : 0, 5, dt);
    if (L.drawers) L.drawers.slide(L.drawers.drawers[this.drawerIdx % L.drawers.drawers.length], this.drawerOpen);
    if (L.lid) L.lid.rotation.x = -this.drawerOpen * 1.1;

    // Room-specific bits: ON AIR, lights, scopes, paper, paintings…
    const onStage = at === 'stage' && intent.station === 'stage';
    L.tick?.(dt, t, { working: s?.status === 'working' || s?.status === 'thinking', onStage, term: this.termState, editing: !!deskAct, busy, web: this.web });

    this.updateHolo(dt, t, s, at, intent);

    // Spotlight when Clawd talks to you.
    this.spot.material.opacity = damp(this.spot.material.opacity, onStage ? 0.9 : 0, 4, dt);

    // Pop-in when the room changes style.
    const since = t - this.popAt;
    if (since < 0.6) this.group.scale.setScalar(0.94 + 0.06 * (1 - Math.pow(1 - since / 0.6, 3)) + Math.sin((since / 0.6) * Math.PI) * 0.025);
    else if (this.group.scale.x !== 1) this.group.scale.setScalar(1);
  }

  /** The connector's cartridge hovers beside Clawd (camera side) while it uses that app. */
  updateHolo(dt, t, s, at, intent) {
    const H = this.holo;
    const c = this.clawd;
    const act = intent.act?.tool?.startsWith('mcp__') ? intent.act : null;
    if (act) {
      const brand = brandFor(act);
      const key = `${brand.mono}|${brand.bg}`;
      if (key !== H.key) {
        H.key = key;
        if (H.item) H.item.removeFromParent();
        H.item = buildItem('cartridge', brand);
        H.group.add(H.item);
        H.ring.material.color.set(brand.bg === '#ffffff' ? brand.fg : brand.bg);
      }
    }
    // Not while walking, and not while the same cartridge is being held up overhead.
    const want = act && at === act.station && !c.walking && !c.pull ? 1 : 0;
    H.show = damp(H.show, want, 6, dt);
    const visible = H.show > 0.02 && !!H.item;
    H.group.visible = visible;
    H.ring.visible = visible;
    if (!visible) return;
    const cam = this.world.camera.position.clone().sub(this.group.position);
    let rx = Math.cos(c.heading);
    let rz = -Math.sin(c.heading);
    if (rx * (cam.x - c.pos.x) + rz * (cam.z - c.pos.y) < 0) { rx = -rx; rz = -rz; }
    const x = c.pos.x + rx * 0.85;
    const z = c.pos.y + rz * 0.85;
    const y = 0.72 + c.lift.position.y + Math.sin(t * 2.2) * 0.05;
    H.group.position.set(x, y, z);
    H.group.scale.setScalar(Math.max(0.001, H.show * 1.05));
    H.group.rotation.order = 'YXZ';
    H.group.rotation.y = Math.atan2(cam.x - x, cam.z - z) + Math.sin(t * 1.3) * 0.3;
    H.group.rotation.x = -Math.atan2(cam.y - y, Math.hypot(cam.x - x, cam.z - z)) * 0.6;
    H.ring.position.set(x, 0.03, z);
    H.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
    H.ring.material.opacity = H.show * (0.55 + Math.sin(t * 4) * 0.2);
  }

  /** Little pop + confetti when the room changes style. */
  transformIn() {
    this.popAt = this.t;
    this.group.scale.setScalar(0.94);
    this.pendingPop = true;
  }

  dispose() {
    this.world.tickers.delete(this.tick);
    for (const m of this.ghostMats?.values() || []) m.dispose();
    this.more.removeFromParent();
    this.tipObj.removeFromParent();
    this.feelTipObj.removeFromParent();
    this.cardEl.remove();
    this.clawd.dispose();
    for (const h of this.helpers.values()) h.clawd.dispose();
    for (const w of this.workers.values()) w.clawd.dispose();
    this.disposed = true;
    this.group.removeFromParent();
  }
}

export function dotClass(s) {
  if (!s) return '';
  if (s.demo) return 'demo';
  if (!s.live) return '';
  if (s.status === 'working') return s.current?.asksUser ? 'waiting' : 'working';
  if (s.status === 'thinking') return 'thinking';
  if (s.status === 'idle') return 'waiting';
  return '';
}
