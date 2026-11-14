import * as THREE from 'three';

export interface StarsOptions {
  count?: number;
  radius?: number;
  size?: number;
  seed?: number;
}

export interface StarsResult {
  points: THREE.Points;
  dispose: () => void;
}

const DEFAULTS = {
  count: 140,
  radius: 2500,
  size: 1.6,
  seed: 7,
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createStars(scene: THREE.Scene, options: StarsOptions = {}): StarsResult {
  const { count, radius, size, seed } = { ...DEFAULTS, ...options };
  const random = mulberry32(seed);

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    const y = 0.03 + random() * 0.97;
    const phi = random() * Math.PI * 2;
    const ring = Math.sqrt(1 - y * y);
    positions[i * 3] = Math.cos(phi) * ring * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = Math.sin(phi) * ring * radius;

    const brightness = 0.45 + random() * 0.55;
    const tint = random();
    colors[i * 3] = brightness * (tint > 0.8 ? 1 : 0.92);
    colors[i * 3 + 1] = brightness * 0.95;
    colors[i * 3 + 2] = brightness * (tint < 0.2 ? 1 : 0.9);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    fog: false,
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'stars';
  points.frustumCulled = false;
  points.renderOrder = -1;
  scene.add(points);

  const dispose = (): void => {
    scene.remove(points);
    geometry.dispose();
    material.dispose();
  };

  return { points, dispose };
}