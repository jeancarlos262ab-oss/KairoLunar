import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface LandOptions {
  size?: number;
  segments?: number;
  color?: number;
  shininess?: number;
  heightScale?: number;
  craterCount?: number;
  seed?: number;
  controls?: {
    enableZoom?: boolean;
    enablePan?: boolean;
    minDistance?: number;
    maxDistance?: number;
  };
}

export interface LandResult {
  mesh: THREE.Mesh;
  controls: OrbitControls;
  update: () => void;
  dispose: () => void;
}

const DEFAULTS = {
  size: 100,
  segments: 192,
  color: 0xffffff,
  shininess: 10,
  heightScale: 0.035,
  craterCount: 40,
  seed: 1,
};

function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function fbm(x: number, y: number, seed: number, octaves = 5): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

interface Crater {
  x: number;
  z: number;
  radius: number;
  depth: number;
}

function generateCraters(count: number, size: number, rng: () => number): Crater[] {
  const half = size / 2;
  const craters: Crater[] = [];
  for (let i = 0; i < count; i++) {
    const r = size * (0.015 + Math.pow(rng(), 2.5) * 0.11);
    craters.push({
      x: (rng() * 2 - 1) * half,
      z: (rng() * 2 - 1) * half,
      radius: r,
      depth: r * (0.18 + rng() * 0.15),
    });
  }
  return craters;
}

function craterHeight(c: Crater, x: number, z: number): number {
  const d = Math.hypot(x - c.x, z - c.z) / c.radius;
  if (d >= 1.45) return 0;
  if (d < 1) return -c.depth * (1 - d * d);
  const t = (d - 1) / 0.45;
  return c.depth * 0.35 * Math.sin(Math.PI * t) * (1 - t);
}

export function createLand(
  scene: THREE.Scene,
  camera: THREE.Camera,
  domElement: HTMLElement,
  options: LandOptions = {},
): LandResult {
  const { size, segments, color, shininess, heightScale, craterCount, seed } = {
    ...DEFAULTS,
    ...options,
  };

  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const rng = createRng(seed);
  const craters = generateCraters(craterCount, size, rng);
  const amplitude = size * heightScale;
  const position = geometry.attributes.position as THREE.BufferAttribute;

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);

    const hills = (fbm(x * 0.03, z * 0.03, seed) - 0.5) * 2 * amplitude;
    const roughness = (fbm(x * 0.25, z * 0.25, seed + 7, 3) - 0.5) * amplitude * 0.08;

    let h = hills + roughness;
    for (const c of craters) h += craterHeight(c, x, z);

    position.setY(i, h);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  const material = new THREE.MeshPhongMaterial({ color, shininess });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'land';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const controls = new OrbitControls(camera, domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableZoom = options.controls?.enableZoom ?? true;
  controls.enablePan = options.controls?.enablePan ?? false;
  controls.minDistance = options.controls?.minDistance ?? size * 0.2;
  controls.maxDistance = options.controls?.maxDistance ?? size * 3;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.update();

  return {
    mesh,
    controls,
    update: () => controls.update(),
    dispose: () => {
      controls.dispose();
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };
}