// Flat, banded "cel" materials for the arcade look.

import * as THREE from 'three';

const ramp = new Uint8Array([105, 185, 255]); // three light bands: shadow, mid, lit
export const gradientMap = new THREE.DataTexture(ramp, ramp.length, 1, THREE.RedFormat);
gradientMap.minFilter = THREE.NearestFilter;
gradientMap.magFilter = THREE.NearestFilter;
gradientMap.generateMipmaps = false;
gradientMap.needsUpdate = true;

const cache = new Map();

/** Shared toon material per colour (pass `unique: true` when the material will be changed later). */
export function toon(color, { emissive = null, ei = 1, map = null, unique = false, side = THREE.FrontSide } = {}) {
  const key = `${color}|${emissive}|${ei}|${side}`;
  if (!unique && !map && cache.has(key)) return cache.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap, side });
  if (map) m.map = map;
  if (emissive) {
    m.emissive = new THREE.Color(emissive);
    m.emissiveIntensity = ei;
  }
  if (!unique && !map) cache.set(key, m);
  return m;
}

/** Unlit colour, for glowing bits (LEDs, bulbs, screens). */
export function glow(color) {
  return new THREE.MeshBasicMaterial({ color, toneMapped: false });
}
