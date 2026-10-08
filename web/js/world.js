// Renderer, lights, camera and the frame loop.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PixelPass } from './pixelpass.js';
import { clamp, easeInOutCubic } from './util.js';

const VIEW_DIR = new THREE.Vector3(1, 1.12, 1).normalize(); // a slightly-high isometric look
const PIXEL_BUDGET = 8.3e6; // render pixels per frame we're happy to draw (about a 4K screen)
// The room's real outline: the floor slab's corners and the tops of the two
// walls (the front two sides are open, so no wall tops there).
const ROOM_CENTER = new THREE.Vector3(-0.05, 1.1, -0.05);
const ROOM_POINTS = [];
for (const x of [-4.35, 4.25]) for (const z of [-4.35, 4.25]) ROOM_POINTS.push(new THREE.Vector3(x, -0.55, z), new THREE.Vector3(x, 0.02, z));
ROOM_POINTS.push(new THREE.Vector3(-4.35, 3.1, -4.35), new THREE.Vector3(4.25, 3.1, -4.35), new THREE.Vector3(-4.35, 3.1, 4.25));

export class World {
  constructor(el) {
    this.el = el;
    // Drawn at twice the CSS size (see pixelRatioFor), so edges stay clean even on non-Retina screens.
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, premultipliedAlpha: false, powerPreference: 'high-performance' }));
    r.setPixelRatio(2);
    r.setClearColor(0x000000, 0);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.BasicShadowMap;
    r.toneMapping = THREE.NoToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(r.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'labels';
    el.appendChild(this.labels.domElement);

    const scene = (this.scene = new THREE.Scene());
    scene.add(new THREE.HemisphereLight('#fffaf0', '#b9a888', 1.45));
    const sun = (this.sun = new THREE.DirectionalLight('#fff1dc', 2.1));
    sun.position.set(5, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -7.5; sc.right = 7.5; sc.top = 7.5; sc.bottom = -7.5;
    sc.near = 1; sc.far = 34;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight('#f3eadb', 0.45);
    fill.position.set(-7, 5, 9);
    scene.add(fill);

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 300);
    const c = (this.controls = new OrbitControls(this.camera, r.domElement));
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.minDistance = 3; // close enough that Clawd fills the view
    c.maxDistance = 150; // far enough that framing a small or narrow view never gets clamped
    c.minPolarAngle = 0.25;
    c.maxPolarAngle = 1.3;
    c.screenSpacePanning = false;
    c.rotateSpeed = 0.6;
    c.zoomSpeed = 0.9;
    c.addEventListener('start', () => {
      this.flight = null;
      this.userMoved = true;
    });
    // Zooming (not turning) is what changes how zoomed in you are; until it settles, nothing re-frames over it.
    r.domElement.addEventListener('wheel', () => { this.zoomPending = true; }, { passive: true });
    // Tell whoever cares where the zoom ended up (the wheel's zoom lands on the next frame, hence the wait).
    c.addEventListener('end', () => {
      clearTimeout(this.zoomTimer);
      this.zoomTimer = setTimeout(() => this.zoomEnded(), 250);
    });
    // Trackpad pinch: Chrome sends it as ctrl+wheel (OrbitControls handles that), but Safari and
    // the Mac widget (WebKit) send gesture events instead, so zoom on those ourselves.
    let pinchFrom = 0;
    const pinch = (e) => {
      e.preventDefault();
      if (this.nativePinch) return; // the Mac app passes pinches on itself (pinchBy); two sources would fight
      if (e.type === 'gesturestart') {
        pinchFrom = this.camera.position.distanceTo(c.target);
        this.flight = null;
        this.userMoved = true;
        this.zoomPending = true;
      } else if (e.type === 'gesturechange' && pinchFrom) {
        const d = THREE.MathUtils.clamp(pinchFrom / Math.max(0.05, e.scale), c.minDistance, c.maxDistance);
        const dir = this.camera.position.clone().sub(c.target).normalize();
        this.camera.position.copy(c.target).addScaledVector(dir, d);
      } else if (e.type === 'gestureend') {
        pinchFrom = 0;
        this.zoomEnded();
      }
    };
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) r.domElement.addEventListener(type, pinch);

    this.composer = new EffectComposer(r);
    this.pixelPass = new PixelPass(1, scene, this.camera, { normalEdge: 0.22, depthEdge: 0.5, edgeWidth: this.outlineWidth() });
    this.composer.addPass(this.pixelPass);
    this.composer.addPass(new OutputPass());

    this.tickers = new Set();
    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.inset = { left: 0, right: 0, top: 0, bottom: 0 };
    this.follow = null;
    this.flight = null;
    // What the camera keeps in view: the room's outline, or the island's (setFrameShape).
    this.framePoints = ROOM_POINTS;
    this.frameCenter = ROOM_CENTER;
    this.frameMargin = 0.96;
    this.maxRatio = 1.6; // how far past "the whole room" you can zoom out (the corner view: not at all)
    this.paused = false; // widget pill: no 3D at all
    this.maxFps = 0; // widget corner: 30 is plenty and kinder to the battery
    this.frameAcc = 0;

    new ResizeObserver(() => this.resize()).observe(el);
    this.resize();
    this.fit(0);
    r.setAnimationLoop((ts) => this.frame(ts));
  }

  /** The stage's size (the window's while the stage is hidden). Never zero: a 0×0 view would turn the camera into NaN for good. */
  viewSize() {
    return { w: Math.max(1, this.el.clientWidth || window.innerWidth), h: Math.max(1, this.el.clientHeight || window.innerHeight) };
  }

  /**
   * Render pixels per CSS pixel: 2, on any screen. On a Retina screen that's
   * its own resolution; on a regular one the room is drawn twice as big and
   * smoothed down, which keeps edges clean. Very big views get less, so a
   * frame never costs more than PIXEL_BUDGET.
   */
  pixelRatioFor(w, h) {
    return Math.max(1, Math.min(2, Math.sqrt(PIXEL_BUDGET / Math.max(1, w * h))));
  }

  resize() {
    const { w, h } = this.viewSize();
    const ratio = this.pixelRatioFor(w, h);
    if (Math.abs(this.renderer.getPixelRatio() - ratio) > 0.01) {
      this.renderer.setPixelRatio(ratio);
      this.composer?.setPixelRatio(ratio); // the composer keeps its own copy
      if (this.pixelPass) this.pixelPass.edgeWidth = this.outlineWidth();
    }
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.applyInset();
    this.reframe(); // for the new size
  }

  /** Work out the framing again (next frame), keeping a zoom you're in the middle of. */
  reframe() {
    const A = this.autoFrame;
    if (!A) return;
    if (this.zoomPending && A.base && !this.flight) A.ratio = Math.min(this.maxRatio, this.camera.position.distanceTo(this.controls.target) / A.base.distance);
    A.base = null;
  }

  /** Panels cover the edges of the screen; shift the view so the room sits in the free middle. */
  setInset(inset) {
    const prev = this.insetTarget;
    // Called on every update: if nothing moved, leave the framing (and your zoom) alone.
    if (prev && ['left', 'right', 'top', 'bottom'].every((k) => Math.abs(prev[k] - inset[k]) < 0.5)) return;
    this.insetTarget = inset;
    this.reframe(); // the free area changed: frame the room again
    if (!prev) {
      this.inset = { ...inset };
      this.applyInset();
    }
    // Panels changed size a lot: re-frame (unless the user is driving the camera).
    if (prev && ['left', 'right', 'top', 'bottom'].some((k) => Math.abs(prev[k] - inset[k]) > 40)) this.refitIfIdle();
  }

  /** Re-frame the room after a resize, unless the user has moved the camera themselves. */
  refitIfIdle() {
    if (this.autoFrame) this.reframe(); // auto-framing follows the new size by itself
    else if (!this.userMoved && !this.follow) this.fit(0.4);
  }

  applyInset() {
    const { w, h } = this.viewSize();
    const { left, right, top, bottom } = this.inset;
    const dx = (right - left) / 2;
    const dy = (bottom - top) / 2;
    if (dx || dy) this.camera.setViewOffset(w, h, dx, dy, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  /**
   * Where the camera goes so the whole room fills the uncovered part of the
   * screen, centred: find the closest distance at which the room's outline
   * fits, then shift the aim so the outline sits in the middle (a few rounds).
   */
  frameRoom(dir = VIEW_DIR, margin = this.frameMargin) {
    const { w, h } = this.viewSize();
    const { left, right, top, bottom } = this.insetTarget || this.inset;
    const fx = clamp((w - left - right) / w, 0.3, 1) * margin;
    const fy = clamp((h - top - bottom) / h, 0.3, 1) * margin;
    const cam = new THREE.PerspectiveCamera(this.camera.fov, w / h, 0.1, 500);
    const target = this.frameCenter.clone();
    const v = new THREE.Vector3();
    const outline = (d) => {
      cam.position.copy(target).addScaledVector(dir, d);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
      for (const p of this.framePoints) {
        v.copy(p).project(cam);
        b.x0 = Math.min(b.x0, v.x); b.x1 = Math.max(b.x1, v.x);
        b.y0 = Math.min(b.y0, v.y); b.y1 = Math.max(b.y1, v.y);
      }
      return b;
    };
    let distance = 20;
    for (let round = 0; round < 3; round++) {
      let lo = 3;
      let hi = 150;
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        const b = outline(mid);
        if (b.x1 - b.x0 <= 2 * fx && b.y1 - b.y0 <= 2 * fy) hi = mid; else lo = mid;
      }
      distance = hi;
      const b = outline(distance);
      const halfH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * distance;
      target.addScaledVector(new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), ((b.x0 + b.x1) / 2) * halfH * cam.aspect);
      target.addScaledVector(new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1), ((b.y0 + b.y1) / 2) * halfH);
    }
    return { target, distance };
  }

  /** Frame a different shape (the island, or back to the room): outline points and a centre. */
  setFrameShape(points = ROOM_POINTS, center = ROOM_CENTER, margin = 0.96) {
    this.framePoints = points;
    this.frameCenter = center;
    this.frameMargin = margin;
    if (this.autoFrame) this.autoFrame.base = null;
  }

  /** Kept for callers that only want the distance. */
  fitDistance(_target, dir) {
    return this.frameRoom(dir).distance;
  }

  fit(duration = 1.1) {
    this.follow = null;
    this.userMoved = false;
    const { target, distance } = this.frameRoom(VIEW_DIR);
    if (this.autoFrame) {
      this.autoFrame.base = { target: target.clone(), distance, dir: VIEW_DIR.clone() };
      this.autoFrame.ratio = 1;
    }
    this.flyTo(target, distance, duration, VIEW_DIR);
  }

  /**
   * Keep the room centred and filling the view however the window is sized.
   * Zooming in drifts the aim toward `subject` (Clawd), so a close-up shows the
   * action; zoomed out, it's the whole room again. `ratio` = how zoomed in you
   * are (1 = the whole room just fits).
   */
  setAutoFrame(subject, ratio = 1) {
    this.autoFrame = subject ? { subject, base: null, ratio: Math.min(ratio, this.maxRatio) } : null;
    this.controls.enablePan = !subject;
    if (subject) {
      this.follow = null;
      this.refreshFrame(true);
    }
  }

  refreshFrame(snap = false) {
    const A = this.autoFrame;
    if (!A) return;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    A.base = { ...this.frameRoom(dir), dir }; // the zoom you chose (A.ratio) carries over to the new size
    const d = clamp(A.ratio * A.base.distance, this.controls.minDistance, this.controls.maxDistance);
    if (snap) {
      this.flight = null;
      this.controls.target.copy(this.frameGoal());
    }
    this.camera.position.copy(this.controls.target).addScaledVector(dir, d);
  }

  /** Where auto-framing aims: the room's centre, sliding toward the subject as you zoom in. */
  frameGoal() {
    const A = this.autoFrame;
    const goal = A.base.target.clone();
    const k = THREE.MathUtils.smoothstep(0.92 - A.ratio, 0, 0.47);
    if (k > 0 && A.subject) goal.lerp(A.subject(new THREE.Vector3()), k);
    return goal;
  }

  /** Zoom to a framing ratio (1 = the whole room), aiming where auto-framing would. */
  zoomToRatio(ratio, duration = 0.6) {
    const A = this.autoFrame;
    if (!A?.base) return;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    A.ratio = ratio;
    this.flyTo(this.frameGoal(), clamp(ratio * A.base.distance, this.controls.minDistance, this.controls.maxDistance), duration, dir);
  }

  /** A trackpad pinch passed on by the Mac app: `amount` is how much the fingers spread (+) or closed (−). */
  pinchBy(amount, done = false) {
    const c = this.controls;
    if (amount) {
      this.flight = null;
      this.userMoved = true;
      this.zoomPending = true;
      const dir = this.camera.position.clone().sub(c.target).normalize();
      const d = clamp(this.camera.position.distanceTo(c.target) / (1 + amount), c.minDistance, c.maxDistance);
      this.camera.position.copy(c.target).addScaledVector(dir, d);
    }
    if (done) this.zoomEnded();
  }

  /** A zoom (wheel or pinch) settled: remember how zoomed in you are. Past the limit, the camera glides back. */
  zoomEnded() {
    const A = this.autoFrame;
    const d = this.camera.position.distanceTo(this.controls.target);
    if (this.zoomPending && A?.base) A.ratio = Math.min(this.maxRatio, d / A.base.distance);
    this.zoomPending = false;
    this.onZoom?.(d);
  }

  zoom(factor) {
    const c = this.controls;
    const off = this.camera.position.clone().sub(c.target);
    let d = clamp(off.length() * factor, c.minDistance, c.maxDistance);
    if (this.autoFrame?.base) {
      d = Math.min(d, this.autoFrame.base.distance * this.maxRatio);
      this.autoFrame.ratio = d / this.autoFrame.base.distance;
    }
    this.flyTo(c.target.clone(), d, 0.45, off.normalize());
  }

  /** Smoothly track something (e.g. Clawd) at a closer distance. */
  setFollow(getTarget, distance = 11) {
    this.follow = getTarget;
    if (getTarget) {
      const dir = this.camera.position.clone().sub(this.controls.target).normalize();
      this.flyTo(getTarget(new THREE.Vector3()), distance, 0.9, dir);
    }
  }

  flyTo(target, distance, duration = 1, dir = null) {
    const d = dir || this.camera.position.clone().sub(this.controls.target).normalize();
    const toPos = target.clone().addScaledVector(d, distance);
    if (!duration) {
      this.camera.position.copy(toPos);
      this.controls.target.copy(target);
      this.controls.update();
      return;
    }
    this.flight = {
      t: 0, duration,
      fromPos: this.camera.position.clone(), fromTarget: this.controls.target.clone(),
      toPos, toTarget: target.clone(),
    };
  }

  frame(ts) {
    this.timer.update(ts);
    const dt = Math.min(this.timer.getDelta(), 0.05);
    if (this.paused) return;
    if (this.maxFps) {
      this.frameAcc += dt;
      if (this.frameAcc < 1 / this.maxFps - 0.002) return;
      this.advance(Math.min(this.frameAcc, 0.1));
      this.frameAcc = 0;
    } else {
      this.advance(dt);
    }
    this.draw();
  }

  /** Step the world by hand: browsers pause animation frames while a tab is hidden. */
  step(seconds = 1, fps = 30) {
    for (let i = 0; i < seconds * fps; i++) this.advance(1 / fps);
    this.draw();
  }

  draw() {
    this.composer.render();
    this.labels.render(this.scene, this.camera);
  }

  /** Outline thickness in render pixels: about one CSS pixel at any density. */
  outlineWidth() {
    return Math.max(1, Math.round(this.renderer.getPixelRatio()));
  }

  advance(dt) {
    this.elapsed = (this.elapsed || 0) + dt;
    const t = this.elapsed;
    // Glide the view offset when panels change size instead of jumping.
    if (this.insetTarget) {
      let moved = false;
      for (const k of ['left', 'right', 'top', 'bottom']) {
        const d = this.insetTarget[k] - this.inset[k];
        if (Math.abs(d) > 0.5) { this.inset[k] += d * (1 - Math.exp(-6 * dt)); moved = true; }
      }
      if (moved) this.applyInset();
    }
    for (const fn of this.tickers) fn(dt, t);

    // A camera that went bad (NaN) never recovers by itself: start over with the whole room.
    if (!Number.isFinite(this.camera.position.x + this.controls.target.x)) {
      this.flight = null;
      this.fit(0);
    }
    const f = this.flight;
    if (f) {
      f.t = Math.min(1, f.t + dt / f.duration);
      const k = easeInOutCubic(f.t);
      this.camera.position.lerpVectors(f.fromPos, f.toPos, k);
      this.controls.target.lerpVectors(f.fromTarget, f.toTarget, k);
      if (f.t >= 1) this.flight = null;
    } else if (this.follow) {
      const goal = this.follow(new THREE.Vector3());
      const delta = goal.sub(this.controls.target).multiplyScalar(1 - Math.exp(-3 * dt));
      this.controls.target.add(delta);
      this.camera.position.add(delta);
    } else if (this.autoFrame) {
      const A = this.autoFrame;
      const c = this.controls;
      const dir = this.camera.position.clone().sub(c.target).normalize();
      // Turned (or still gliding after a turn), resized, new panels: frame the room for how it's seen now.
      if (!A.base?.dir || dir.dot(A.base.dir) < 0.9998) A.base = { ...this.frameRoom(dir), dir };
      const delta = this.frameGoal().sub(c.target).multiplyScalar(1 - Math.exp(-4 * dt));
      c.target.add(delta);
      this.camera.position.add(delta);
      // Glide to where the whole room fits (times your zoom), so it's never cut off; not while you're zooming.
      if (!this.zoomPending) {
        const want = clamp(A.ratio * A.base.distance, c.minDistance, c.maxDistance);
        const d = this.camera.position.distanceTo(c.target);
        if (Math.abs(want - d) > 0.001) this.camera.position.copy(c.target).addScaledVector(dir, d + (want - d) * (1 - Math.exp(-6 * dt)));
      }
    }
    this.controls.update(dt);
  }

  /** Which object (with userData.workerId up the tree) is under the pointer? */
  pick(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    for (const hit of ray.intersectObjects(this.scene.children, true)) {
      for (let o = hit.object; o; o = o.parent) if (o.userData.workerId) return o.userData.workerId;
    }
    return null;
  }
}
