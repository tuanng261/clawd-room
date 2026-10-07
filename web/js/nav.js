// Grid A* so Clawd walks around furniture instead of through it.

import * as THREE from 'three';

export class NavGrid {
  constructor({ minX, maxX, minZ, maxZ, cell = 0.2 }) {
    this.minX = minX;
    this.minZ = minZ;
    this.cell = cell;
    this.cols = Math.ceil((maxX - minX) / cell);
    this.rows = Math.ceil((maxZ - minZ) / cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
  }

  idx(c, r) { return r * this.cols + c; }
  col(x) { return Math.floor((x - this.minX) / this.cell); }
  row(z) { return Math.floor((z - this.minZ) / this.cell); }
  cx(c) { return this.minX + (c + 0.5) * this.cell; }
  cz(r) { return this.minZ + (r + 0.5) * this.cell; }
  inside(c, r) { return c >= 0 && r >= 0 && c < this.cols && r < this.rows; }
  free(c, r) { return this.inside(c, r) && !this.blocked[this.idx(c, r)]; }
  walkable(x, z) { return this.free(this.col(x), this.row(z)); }

  blockRect(x0, z0, x1, z1, pad = 0) {
    for (let r = 0; r < this.rows; r++) {
      const z = this.cz(r);
      if (z < z0 - pad || z > z1 + pad) continue;
      for (let c = 0; c < this.cols; c++) {
        const x = this.cx(c);
        if (x >= x0 - pad && x <= x1 + pad) this.blocked[this.idx(c, r)] = 1;
      }
    }
  }

  /**
   * Block a turned rectangle (a piece's real footprint): centre cx,cz, its own
   * x axis (ux,uz) and z axis (vx,vz) on the floor, half sizes hx,hz.
   */
  blockFoot(f, pad = 0) {
    for (let r = 0; r < this.rows; r++) {
      const dz = this.cz(r) - f.cz;
      for (let c = 0; c < this.cols; c++) {
        const dx = this.cx(c) - f.cx;
        if (Math.abs(dx * f.ux + dz * f.uz) < f.hx + pad && Math.abs(dx * f.vx + dz * f.vz) < f.hz + pad) this.blocked[this.idx(c, r)] = 1;
      }
    }
  }

  blockCircle(x0, z0, radius, pad = 0) {
    const rr = (radius + pad) ** 2;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if ((this.cx(c) - x0) ** 2 + (this.cz(r) - z0) ** 2 <= rr) this.blocked[this.idx(c, r)] = 1;
      }
    }
  }

  nearestFree(x, z) {
    const c0 = this.col(x);
    const r0 = this.row(z);
    if (this.free(c0, r0)) return [c0, r0];
    for (let rad = 1; rad < Math.max(this.cols, this.rows); rad++) {
      let best = null;
      let bestD = Infinity;
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
          const c = c0 + dc;
          const r = r0 + dr;
          if (!this.free(c, r)) continue;
          const d = (this.cx(c) - x) ** 2 + (this.cz(r) - z) ** 2;
          if (d < bestD) { bestD = d; best = [c, r]; }
        }
      }
      if (best) return best;
    }
    return [c0, r0];
  }

  /** Straight walk possible between two points? */
  clear(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / (this.cell * 0.5));
    for (let i = 0; i <= n; i++) {
      const t = n ? i / n : 0;
      if (!this.walkable(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  /** Returns smoothed waypoints (Vector2 x,z) from a to b, excluding the start; null if there's no way through. */
  path(ax, az, bx, bz) {
    const [sc, sr] = this.nearestFree(ax, az);
    const [gc, gr] = this.nearestFree(bx, bz);
    const start = this.idx(sc, sr);
    const goal = this.idx(gc, gr);
    const g = new Float32Array(this.cols * this.rows).fill(Infinity);
    const came = new Int32Array(this.cols * this.rows).fill(-1);
    const closed = new Uint8Array(this.cols * this.rows);
    const heap = new MinHeap();
    const h = (c, r) => {
      const dx = Math.abs(c - gc);
      const dz = Math.abs(r - gr);
      return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    g[start] = 0;
    heap.push(start, h(sc, sr));
    let found = start === goal;
    while (heap.size && !found) {
      const cur = heap.pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === goal) { found = true; break; }
      const c = cur % this.cols;
      const r = (cur / this.cols) | 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nc = c + dc;
          const nr = r + dr;
          if (!this.free(nc, nr)) continue;
          if (dr && dc && (!this.free(c + dc, r) || !this.free(c, r + dr))) continue; // no corner cutting
          const ni = this.idx(nc, nr);
          if (closed[ni]) continue;
          const ng = g[cur] + (dr && dc ? Math.SQRT2 : 1);
          if (ng < g[ni]) {
            g[ni] = ng;
            came[ni] = cur;
            heap.push(ni, ng + h(nc, nr));
          }
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let cur = goal; cur !== -1; cur = came[cur]) cells.push(cur);
    cells.reverse();
    const pts = cells.map((i) => new THREE.Vector2(this.cx(i % this.cols), this.cz((i / this.cols) | 0)));
    pts[0] = new THREE.Vector2(ax, az);
    // String-pulling: drop waypoints we can see past.
    const out = [];
    let anchor = pts[0];
    for (let i = 1; i < pts.length; i++) {
      const next = pts[i + 1];
      if (next && this.clear(anchor.x, anchor.y, next.x, next.y)) continue;
      out.push(pts[i]);
      anchor = pts[i];
    }
    if (!out.length) out.push(pts[pts.length - 1]);
    return out;
  }
}

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const { k, v } = this;
    k.push(key); v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (v[p] <= v[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop() {
    const { k, v } = this;
    const top = k[0];
    const lk = k.pop();
    const lv = v.pop();
    if (k.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && v[l] < v[m]) m = l;
        if (r < k.length && v[r] < v[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}
