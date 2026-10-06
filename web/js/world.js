// Renderer, lights, camera and the frame loop.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PixelPass } from './pixelpass.js';
import { clamp, easeInOutCubic } from './util.js';

const VIEW_DIR = new THREE.Vector3(1, 1.12, 1).normalize(); // a slightly-high isometric look
// Bounding box of the room diorama (floor slab to wall tops).
const ROOM_CORNERS = [];
for (const x of [-4.35, 4.25]) for (const y of [-0.55, 3.1]) for (const z of [-4.35, 4.25]) ROOM_CORNERS.push(new THREE.Vector3(x, y, z));

export class World {
  constructor(el) {
    this.el = el;
    // Arcade look: render at low resolution and scale up with hard pixels.
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, premultipliedAlpha: false, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    c.minDistance = 6;
    c.maxDistance = 48;
    c.minPolarAngle = 0.25;
    c.maxPolarAngle = 1.3;
    c.screenSpacePanning = false;
    c.rotateSpeed = 0.6;
    c.zoomSpeed = 0.9;
    c.addEventListener('start', () => {
      this.flight = null;
      this.userMoved = true;
    });
    // Tell whoever cares where the zoom ended up (the wheel's zoom lands on the next frame, hence the wait).
    c.addEventListener('end', () => {
      clearTimeout(this.zoomTimer);
      this.zoomTimer = setTimeout(() => this.onZoom?.(this.camera.position.distanceTo(c.target)), 250);
    });
    // Trackpad pinch: Chrome sends it as ctrl+wheel (OrbitControls handles that), but Safari and
    // the Mac widget (WebKit) send gesture events instead, so zoom on those ourselves.
    let pinchFrom = 0;
    const pinch = (e) => {
      e.preventDefault();
      if (e.type === 'gesturestart') {
        pinchFrom = this.camera.position.distanceTo(c.target);
        this.flight = null;
        this.userMoved = true;
      } else if (e.type === 'gesturechange' && pinchFrom) {
        const d = THREE.MathUtils.clamp(pinchFrom / Math.max(0.05, e.scale), c.minDistance, c.maxDistance);
        const dir = this.camera.position.clone().sub(c.target).normalize();
        this.camera.position.copy(c.target).addScaledVector(dir, d);
      } else if (e.type === 'gestureend') {
        pinchFrom = 0;
        this.onZoom?.(this.camera.position.distanceTo(c.target));
      }
    };
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) r.domElement.addEventListener(type, pinch);

    let px = 1; // 1 = crisp; the pixel button makes it chunkier
    try { px = Number(localStorage.getItem('clawd.pixelSize')) || 1; } catch { /* private mode */ }
    this.pixelSize = px;
    this.composer = new EffectComposer(r);
    this.pixelPass = new PixelPass(this.passPixels(px), scene, this.camera, { normalEdge: 0.22, depthEdge: 0.5 });
    this.composer.addPass(this.pixelPass);
    this.composer.addPass(new OutputPass());

    this.tickers = new Set();
    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.inset = { left: 0, right: 0, top: 0, bottom: 0 };
    this.follow = null;
    this.flight = null;
    this.paused = false; // widget pill: no 3D at all
    this.maxFps = 0; // widget corner: 30 is plenty and kinder to the battery
    this.frameAcc = 0;

    new ResizeObserver(() => this.resize()).observe(el);
    this.resize();
    this.fit(0);
    r.setAnimationLoop((ts) => this.frame(ts));
  }

  resize() {
    const w = this.el.clientWidth || window.innerWidth;
    const h = this.el.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.applyInset();
  }

  /** Panels cover the edges of the screen; shift the view so the room sits in the free middle. */
  setInset(inset) {
    const prev = this.insetTarget;
    this.insetTarget = inset;
    if (!prev) {
      this.inset = { ...inset };
      this.applyInset();
    }
    // Panels changed size a lot: re-frame (unless the user is driving the camera).
    if (prev && ['left', 'right', 'top', 'bottom'].some((k) => Math.abs(prev[k] - inset[k]) > 40)) this.refitIfIdle();
  }

  /** Re-frame the room after a resize, unless the user has moved the camera themselves. */
  refitIfIdle() {
    if (!this.userMoved && !this.follow) this.fit(0.4);
  }

  applyInset() {
    const w = this.el.clientWidth || window.innerWidth;
    const h = this.el.clientHeight || window.innerHeight;
    const { left, right, top, bottom } = this.inset;
    const dx = (right - left) / 2;
    const dy = (bottom - top) / 2;
    if (dx || dy) this.camera.setViewOffset(w, h, dx, dy, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  /** Closest distance at which every corner of the room lands inside the uncovered part of the screen. */
  fitDistance(target, dir) {
    const w = this.el.clientWidth || window.innerWidth;
    const h = this.el.clientHeight || window.innerHeight;
    const { left, right, top, bottom } = this.insetTarget || this.inset;
    const fx = clamp((w - left - right) / w, 0.3, 1) * 0.94;
    const fy = clamp((h - top - bottom) / h, 0.3, 1) * 0.94;
    const cam = new THREE.PerspectiveCamera(this.camera.fov, this.camera.aspect, 0.1, 500);
    const v = new THREE.Vector3();
    const fits = (d) => {
      cam.position.copy(target).addScaledVector(dir, d);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      for (const p of ROOM_CORNERS) {
        v.copy(p).project(cam);
        if (Math.abs(v.x) > fx || Math.abs(v.y) > fy) return false;
      }
      return true;
    };
    let lo = 4;
    let hi = 90;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid; else lo = mid;
    }
    return clamp(hi, 8, 60);
  }

  fit(duration = 1.1) {
    this.follow = null;
    this.userMoved = false;
    const target = new THREE.Vector3(0, 1.1, 0);
    this.flyTo(target, this.fitDistance(target, VIEW_DIR), duration, VIEW_DIR);
  }

  zoom(factor) {
    const c = this.controls;
    const off = this.camera.position.clone().sub(c.target);
    const d = clamp(off.length() * factor, c.minDistance, c.maxDistance);
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

  /** Lower the resolution for small views (the widget corner). */
  setPixelRatio(ratio) {
    if (Math.abs(this.renderer.getPixelRatio() - ratio) < 0.01) return;
    this.renderer.setPixelRatio(ratio);
    this.resize();
    this.pixelPass.setPixelSize(this.passPixels(this.pixelSize));
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

  /** Size of one "arcade pixel" in screen pixels (1 = smooth). */
  /** Screen pixels per arcade pixel → pass pixels (the composer works in device pixels). */
  passPixels(px) {
    return Math.max(1, Math.round(px * this.renderer.getPixelRatio()));
  }

  setPixelSize(px) {
    this.pixelSize = px;
    this.pixelPass.setPixelSize(this.passPixels(px));
    try { localStorage.setItem('clawd.pixelSize', String(px)); } catch { /* private mode */ }
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
