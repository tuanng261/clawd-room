// Low-resolution render with crisp pixel outlines, based on three.js's
// RenderPixelatedPass. Changes: see-through effects (shadows, trails, glass)
// are left out of the edge pass so they don't get outlined, and the
// background stays transparent so the page shows through.

import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';

export class PixelPass extends Pass {
  constructor(pixelSize, scene, camera, { normalEdge = 0.35, depthEdge = 0.5 } = {}) {
    super();
    this.pixelSize = pixelSize;
    this.scene = scene;
    this.camera = camera;
    this.normalEdge = normalEdge;
    this.depthEdge = depthEdge;
    this.resolution = new THREE.Vector2();

    const target = () => {
      const t = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
      t.texture.minFilter = THREE.NearestFilter;
      t.texture.magFilter = THREE.NearestFilter;
      return t;
    };
    this.beauty = target();
    this.beauty.depthTexture = new THREE.DepthTexture(1, 1);
    this.normals = target();
    this.normalMaterial = new THREE.MeshNormalMaterial();
    this.hidden = [];

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tDepth: { value: null }, tNormal: { value: null },
        resolution: { value: new THREE.Vector4() },
        normalEdge: { value: 0 }, depthEdge: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse, tDepth, tNormal;
        uniform vec4 resolution;
        uniform float normalEdge, depthEdge;
        varying vec2 vUv;
        float depthAt(int x, int y) { return texture2D(tDepth, vUv + vec2(x, y) * resolution.zw).r; }
        vec3 normalAt(int x, int y) { return texture2D(tNormal, vUv + vec2(x, y) * resolution.zw).rgb * 2.0 - 1.0; }
        float depthEdgeAt(float d) {
          float diff = 0.0;
          diff += clamp(depthAt(1, 0) - d, 0.0, 1.0);
          diff += clamp(depthAt(-1, 0) - d, 0.0, 1.0);
          diff += clamp(depthAt(0, 1) - d, 0.0, 1.0);
          diff += clamp(depthAt(0, -1) - d, 0.0, 1.0);
          return floor(smoothstep(0.01, 0.02, diff) * 2.0) / 2.0;
        }
        float neighbourNormalEdge(int x, int y, float d, vec3 n) {
          float dd = depthAt(x, y) - d;
          vec3 nn = normalAt(x, y);
          float nd = dot(n - nn, vec3(1.0));
          float ni = clamp(smoothstep(-0.01, 0.01, nd), 0.0, 1.0);
          float di = clamp(sign(dd * 0.25 + 0.0025), 0.0, 1.0);
          return (1.0 - dot(n, nn)) * di * ni;
        }
        float normalEdgeAt(float d, vec3 n) {
          float e = 0.0;
          e += neighbourNormalEdge(0, -1, d, n);
          e += neighbourNormalEdge(0, 1, d, n);
          e += neighbourNormalEdge(-1, 0, d, n);
          e += neighbourNormalEdge(1, 0, d, n);
          return step(0.1, e);
        }
        void main() {
          vec4 texel = texture2D(tDiffuse, vUv);
          float d = depthAt(0, 0);
          vec3 n = normalAt(0, 0);
          float de = depthEdge > 0.0 ? depthEdgeAt(d) : 0.0;
          float ne = normalEdge > 0.0 ? normalEdgeAt(d, n) : 0.0;
          float k = de > 0.0 ? (1.0 - depthEdge * de) : (1.0 + normalEdge * ne);
          gl_FragColor = vec4(texel.rgb * k, texel.a);
        }`,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  setSize(width, height) {
    this.resolution.set(width, height);
    const x = Math.max(1, Math.floor(width / this.pixelSize));
    const y = Math.max(1, Math.floor(height / this.pixelSize));
    this.beauty.setSize(x, y);
    this.normals.setSize(x, y);
    this.material.uniforms.resolution.value.set(x, y, 1 / x, 1 / y);
  }

  setPixelSize(px) {
    this.pixelSize = px;
    this.setSize(this.resolution.x, this.resolution.y);
  }

  render(renderer, writeBuffer) {
    const u = this.material.uniforms;
    u.normalEdge.value = this.normalEdge;
    u.depthEdge.value = this.depthEdge;

    renderer.setRenderTarget(this.beauty);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    // Edge pass: only solid surfaces.
    this.hidden.length = 0;
    this.scene.traverseVisible((o) => {
      const m = o.material;
      if (o.isMesh && m && (m.transparent || o.userData.noEdges)) this.hidden.push(o);
    });
    for (const o of this.hidden) o.visible = false;
    const prev = this.scene.overrideMaterial;
    this.scene.overrideMaterial = this.normalMaterial;
    renderer.setRenderTarget(this.normals);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.scene.overrideMaterial = prev;
    for (const o of this.hidden) o.visible = true;

    u.tDiffuse.value = this.beauty.texture;
    u.tDepth.value = this.beauty.depthTexture;
    u.tNormal.value = this.normals.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (!this.renderToScreen && this.clear) renderer.clear();
    this.quad.render(renderer);
  }

  dispose() {
    this.beauty.dispose();
    this.normals.dispose();
    this.material.dispose();
    this.normalMaterial.dispose();
    this.quad.dispose();
  }
}
