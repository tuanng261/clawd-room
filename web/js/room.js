// One room per Claude Code session. The room reads the session snapshot and
// decides where Clawd (and the helper Clawds) should be and what they do.
// The furniture and floor plan come from rooms/layouts.js, one per room type.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Clawd, setViewYaw, Sparks, STATION_POSE } from './clawd.js';
import { cardHtml, PROPS, roleIcon, tipHtml } from './interact.js';
import { ACTIVITIES, activityFor } from './activities.js';
import { FEELINGS, feelingFor, helperFeeling, reactionFor } from './feelings.js';
import { MOODS, moodFor, moodOfText } from './thinking.js';
import { brandFor, buildItem, itemFor } from './items.js';
import { NavGrid } from './nav.js';
import * as P from './props.js';
import * as T from './themes.js';
import { buildLayout } from './rooms/layouts.js';
import { asDoing, simplify } from './plain.js';
import { clock, damp, esc, fmtDur, hash, HAT_COLORS, mascotName, probablyNeedsApproval } from './util.js';

const PAD = 0.42; // keep this far from furniture when walking
const THINK_BOARD_AFTER = 10000; // thinking longer than this → work it out on the board
const THINK_CHAIR_AFTER = 40000; // …and after this long, settle into the armchair
const THOUGHT_SHOW = 9000; // how long a new thought stays in the bubble
const NAP_AFTER = 90000;
const RESTING = new Set(['bed', 'stage', 'center', null, undefined]);
const MAX_HELPERS = 6; // more than this gets crowded: the rest show as "+N" on the door
const SAME_TOOL_GAP = 12; // seconds: a burst of the same tool only gets pulled out once

const clipText = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const REACT_T = { bounce: 0.6, spin: 1.1, wiggle: 0.9, squish: 0.75 }; // seconds per furniture reaction
const VISIT_PLAY = 5; // seconds Clawd plays with something you clicked
const isIdle = (s) => !s || s.status === 'idle' || s.status === 'stale' || !s.live;
const easeOut = (k) => 1 - Math.pow(1 - k, 3);

// Walls fade to this when the camera is behind them, so you can see inside.
const GHOST = 0.13;
const WALLS = { back: { axis: 'z', at: -4.05 }, left: { axis: 'x', at: -4.05 } };

export class Room {
  constructor(world, { id, demo = false, theme = 'cozy', agent = 'claude' }) {
    this.agent = agent; // 'codex' sessions get Codex's mascot
    this.world = world;
    this.id = id;
    this.theme = T.THEMES[theme] || T.THEMES.cozy;
    this.themeId = this.theme.id;
    this.group = new THREE.Group();
    world.scene.add(this.group);
    this.pal = P.PALETTES[demo ? 1 : hash(id) % P.PALETTES.length];
    this.nav = new NavGrid({ minX: -3.65, maxX: 3.9, minZ: -3.65, maxZ: 3.9, cell: 0.2 });
    this.build();

    this.clawd = new Clawd({ id: 'main', skin: agent === 'codex' ? 'codex' : 'clawd' });
    this.clawd.wear(this.theme.accessory);
    this.group.add(this.clawd.root);
    const bed = this.st.bed;
    this.clawd.place(bed.spot[0], bed.spot[1], bed.face);
    this.clawd.seat = bed.seat || 0;
    this.clawd.drive = { goal: 'bed', arrivedAt: 0 };
    this.helpers = new Map();

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
    const box = new THREE.Box3();
    for (const g of this.L.solids) {
      box.setFromObject(g);
      this.nav.blockRect(box.min.x, box.min.z, box.max.x, box.max.z, PAD);
    }
    this.setupWalls(shell);
    this.setupProps();

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
    // Spots for helper Clawds beside each station.
    this.slots = {};
    for (const [name, st] of Object.entries(this.st)) this.slots[name] = this.slotsAround(st);
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
    const cam = this.world.camera.position;
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
    const c = id === 'main' ? this.clawd : id?.startsWith('agent:') ? [...this.helpers.values()].find((h) => 'agent:' + h.agent?.id === id)?.clawd : null;
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
    const id = c.feeling;
    if (id === this.feelTipKey) return;
    this.feelTipKey = id;
    const F = FEELINGS[id];
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

  /** The item an intent should hold for a plan (connectors keep their own badge). */
  itemOf(plan, act) {
    if (!plan.A.item || plan.A.bare?.includes(plan.prop?.kind)) return null;
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
    const spot = main || own ? new THREE.Vector2(st.spot[0], st.spot[1]) : this.slots[station][(slot - 1) % 6].clone();
    const approach = main && st.approach ? new THREE.Vector2(st.approach[0], st.approach[1]) : spot;
    const path = this.nav.path(c.pos.x, c.pos.y, approach.x, approach.y);
    if (path.length && path[path.length - 1].distanceTo(approach) > 0.05) path.push(approach.clone());
    if (approach !== spot) path.push(spot.clone());
    c.walk(path, {
      face: st.face,
      seat: main ? st.seat || 0 : 0,
      onArrive: () => {
        c.drive.arrivedAt = this.t;
        if (main) this.trail.hide();
      },
    });
    if (main) this.trail.set([c.pos.clone(), ...path]);
  }

  syncHelpers(s) {
    const running = (s?.agents || []).filter((a) => a.status === 'running' || a.status === 'starting');
    const active = running.slice(-MAX_HELPERS);
    const extra = running.length - active.length;
    const moreText = extra > 0 ? `<div class="tag helper"><span class="tx">+${extra} more helper${extra > 1 ? 's' : ''} working</span></div>` : '';
    if (moreText !== this.moreHtml) { this.moreHtml = moreText; this.moreEl.innerHTML = moreText; }
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
        item = long ? null : this.itemOf(plan, act);
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
      const path = this.nav.path(c.pos.x, c.pos.y, fx, fz);
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
    this.clawd.setFeeling(intent.feel || feelingFor(s, now));
    this.syncHelpers(s);
    this.clawd.update(dt, t);
    for (const h of this.helpers.values()) h.clawd.update(dt, t);
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
    this.clawd.tickTimer(now, fmtDur);
  }

  updateProps(dt, t, s, now, intent) {
    const L = this.L;
    const c = this.clawd;
    const at = !c.walking ? c.drive.goal : null;

    // Which stations someone (Clawd or a helper) is working at right now.
    const busy = new Set();
    if (at && intent.station === at) busy.add(at);
    for (const h of this.helpers.values()) if (!h.leaving && !h.clawd.walking && h.clawd.drive?.goal) busy.add(h.clawd.drive.goal);

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
    const cam = this.world.camera.position;
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
