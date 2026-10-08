// Clawd's Zoo: every session at once. Each one is its own live room, open on
// the two sides facing you like an enclosure, side by side on a big lawn with
// paths, trees and a plaque in front of each. You can watch every agent work
// at the same time; click an enclosure to walk into it (main.js), Escape walks
// back out.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { icon } from './icons.js';
import { asDoing, simplify } from './plain.js';
import { block, C } from './props.js';
import { esc, rng, runningInBackground } from './util.js';

const MAX = 6; // enclosures at once (each is a full room)
const GAP = 11; // from one enclosure's middle to the next
// One room's outline (the floor slab and its two walls), for framing.
const ROOM_OUTLINE = [];
for (const x of [-4.35, 4.25]) for (const z of [-4.35, 4.25]) ROOM_OUTLINE.push([x, -0.55, z], [x, 0.02, z]);
ROOM_OUTLINE.push([-4.35, 3.1, -4.35], [4.25, 3.1, -4.35], [-4.35, 3.1, 4.25]);

// A label leaves the scene and the page: the label renderer never removes its element itself.
function drop(label) {
  if (!label) return;
  label.removeFromParent();
  label.element.remove();
}

export class Zoo {
  /** `makeRoom(session, at)` builds one session's room standing at [x, z]. */
  constructor(world, { makeRoom }) {
    this.world = world;
    this.makeRoom = makeRoom;
    this.group = new THREE.Group();
    world.scene.add(this.group);
    this.pens = new Map(); // session id → { room, sign, el, key }
    this.layoutKey = '';
    this.points = [];
    this.center = new THREE.Vector3();
    this.tick = this.tick.bind(this);
    world.tickers.add(this.tick);
    // Shadows need to reach every enclosure.
    const sh = world.sun.shadow;
    this.shadowWas = { l: sh.camera.left, size: sh.mapSize.x };
    sh.camera.left = sh.camera.bottom = -24;
    sh.camera.right = sh.camera.top = 24;
    sh.camera.far = 60;
    sh.camera.updateProjectionMatrix();
    sh.mapSize.set(4096, 4096);
    sh.map?.dispose();
    sh.map = null;
  }

  /** Which sessions get an enclosure: the live ones first, then the most recent quiet ones. */
  setSessions(list, snaps) {
    const live = list.filter((s) => s.live);
    const quiet = list.filter((s) => !s.live && !s.demo).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
    const shown = [...live, ...quiet].slice(0, MAX);
    const key = shown.map((s) => s.id).join('|');
    if (key !== this.layoutKey) this.rebuild(shown, snaps);
    for (const s of shown) this.pens.get(s.id).summary = s;
  }

  /** Lay the zoo out again: a grid of enclosures on a lawn. */
  rebuild(shown, snaps) {
    this.layoutKey = shown.map((s) => s.id).join('|');
    const n = shown.length;
    const cols = Math.min(3, Math.max(1, n));
    const rows = Math.ceil(n / cols) || 1;
    const spots = shown.map((_, i) => [((i % cols) - (cols - 1) / 2) * GAP, (Math.floor(i / cols) - (rows - 1) / 2) * GAP]);
    // Keep enclosures that stay where they are; build the rest.
    const old = this.pens;
    this.pens = new Map();
    shown.forEach((s, i) => {
      const at = spots[i];
      let pen = old.get(s.id);
      if (pen && (pen.at[0] !== at[0] || pen.at[1] !== at[1])) { this.removePen(pen); pen = null; }
      if (!pen) {
        const room = this.makeRoom(s, at);
        this.group.add(room.group);
        room.group.userData.zooId = s.id;
        const snap = snaps.get(s.id);
        if (snap) room.setState(snap);
        const el = document.createElement('div');
        el.className = 'tag-anchor';
        const sign = new CSS2DObject(el);
        sign.position.set(at[0] + 3.2, 0.2, at[1] + 5.2);
        this.group.add(sign);
        pen = { room, sign, el, at, key: '' };
      }
      old.delete(s.id);
      this.pens.set(s.id, pen);
    });
    for (const pen of old.values()) this.removePen(pen);
    this.buildGround(cols, rows);
    // What the camera keeps in view: every enclosure's outline.
    this.points = [];
    for (const pen of this.pens.values()) {
      for (const [x, y, z] of ROOM_OUTLINE) this.points.push(new THREE.Vector3(x + pen.at[0], y, z + pen.at[1]));
    }
    this.center.set(0, 1.1, 0);
    this.world.setFrameShape(this.points, this.center, 0.9);
  }

  removePen(pen) {
    pen.room.dispose();
    drop(pen.sign);
  }

  /** The lawn, paths between the enclosures, trees round the edge and a gate at the front. */
  buildGround(cols, rows) {
    drop(this.gateSign);
    this.ground?.removeFromParent();
    const g = (this.ground = new THREE.Group());
    this.group.add(g);
    const R = rng(11);
    const w = cols * GAP + 3;
    const d = rows * GAP + 3;
    block(g, w, 0.5, d, C.leaf, 0, -0.6, 0, { cast: false });
    block(g, w + 0.3, 0.6, d + 0.3, C.oakDark, 0, -1.2, 0, { cast: false });
    // Paths between and around the enclosures.
    for (let c = 0; c <= cols; c++) block(g, 1.0, 0.04, d - 0.6, C.beige, (c - cols / 2) * GAP, -0.1, 0, { cast: false });
    for (let r = 0; r <= rows; r++) block(g, w - 0.6, 0.04, 1.0, C.beige, 0, -0.1, (r - rows / 2) * GAP, { cast: false });
    // Trees along the edge.
    for (let i = 0; i < (cols + rows) * 4; i++) {
      const side = i % 4;
      const k = R();
      const x = side < 2 ? (k - 0.5) * (w - 1) : (side === 2 ? -1 : 1) * (w / 2 - 0.5);
      const z = side < 2 ? (side === 0 ? -1 : 1) * (d / 2 - 0.5) : (k - 0.5) * (d - 1);
      if (side === 0 && Math.abs(x + w / 2 - 2.5) < 2) continue; // keep the gate clear
      const h = 0.5 + R() * 0.5;
      block(g, 0.18, h, 0.18, C.walnut, x, -0.1, z);
      block(g, 0.8, 0.65, 0.8, R() < 0.5 ? C.leaf : C.leafDark, x, h - 0.1, z).rotation.y = R();
    }
    // The gate, at the back (the front is busy with the enclosures' plaques).
    const gx = -(w / 2 - 2.5);
    const gz = -(d / 2 - 0.4);
    for (const dx of [-1.1, 1.1]) block(g, 0.25, 2.2, 0.25, C.walnut, gx + dx, -0.1, gz);
    block(g, 2.7, 0.45, 0.2, C.clay, gx, 2.0, gz);
    const el = document.createElement('div');
    el.className = 'tag-anchor';
    el.innerHTML = '<div class="zoo-gate">Clawd’s Zoo</div>';
    const sign = new CSS2DObject(el);
    sign.position.set(gx, 2.25, gz + 0.12);
    g.add(sign);
    this.gateSign = sign;
  }

  /** Each enclosure's plaque: whose it is, which kind of agent, what it's doing. */
  tick() {
    for (const pen of this.pens.values()) {
      const s = pen.summary;
      if (!s) continue;
      const species = s.agent === 'codex' ? 'Codex' : 'Claude Code';
      const act = s.current;
      const busy = runningInBackground(pen.room.state);
      let doing = !s.live ? 'Asleep' : s.status === 'working' && act ? simplify(asDoing(act.text || ''), 6) : s.status === 'thinking' ? 'Thinking…' : busy ? `${busy} in the background` : 'Waiting for you';
      if (s.live && s.helpers) doing += ` · ${s.helpers} helper${s.helpers > 1 ? 's' : ''}`;
      const key = `${s.project}|${species}|${doing}|${s.live}`;
      if (key === pen.key) continue;
      pen.key = key;
      pen.el.innerHTML = `<div class="zoo-plaque${s.live ? '' : ' quiet'}"><b>${esc(s.project + (s.demo ? ' (demo)' : ''))}</b><small>${icon(s.agent === 'codex' ? 'terminal' : 'sparkle')} ${species}</small><span>${esc(doing)}</span></div>`;
    }
  }

  /** The sessions the zoo shows, in order. */
  shown() {
    return [...this.pens.values()].map((p) => p.summary).filter(Boolean);
  }

  /** Live updates for one session. */
  update(session) {
    this.pens.get(session.id)?.room.setState(session);
  }

  /** The enclosure under the pointer (its session id), if any. */
  pick(clientX, clientY) {
    const rect = this.world.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), this.world.camera);
    for (const hit of ray.intersectObjects([...this.pens.values()].map((p) => p.room.group), true)) {
      for (let o = hit.object; o; o = o.parent) if (o.userData.zooId) return o.userData.zooId;
    }
    return null;
  }

  /** Where an enclosure's middle is, to fly to. */
  penAt(id) {
    const pen = this.pens.get(id);
    return pen ? new THREE.Vector3(pen.at[0], 1.1, pen.at[1]) : null;
  }

  dispose() {
    this.world.tickers.delete(this.tick);
    for (const pen of this.pens.values()) this.removePen(pen);
    drop(this.gateSign);
    this.group.removeFromParent();
    const sh = this.world.sun.shadow;
    sh.camera.left = sh.camera.bottom = this.shadowWas.l;
    sh.camera.right = sh.camera.top = -this.shadowWas.l;
    sh.camera.far = 34;
    sh.camera.updateProjectionMatrix();
    sh.mapSize.set(this.shadowWas.size, this.shadowWas.size);
    sh.map?.dispose();
    sh.map = null;
  }
}
