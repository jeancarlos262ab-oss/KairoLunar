import * as THREE from 'three';

export interface EarthOptions {
  distance?: number;
  radius?: number;
}

export interface EarthResult {
  earth: THREE.Mesh;
  setHorizontal: (azimuthDeg: number, elevationDeg: number) => void;
  setSunDirection: (azimuthDeg: number, elevationDeg: number) => void;
  setDate: (date: Date) => void;
  dispose: () => void;
}

const DEFAULTS = {
  distance: 700,
  radius: 36,
};

const DAY_MS = 86400000;

function hash3(ix: number, iy: number, iz: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function noise3(x: number, y: number, z: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const fz = smooth(z - z0);

  const c000 = hash3(x0, y0, z0);
  const c100 = hash3(x0 + 1, y0, z0);
  const c010 = hash3(x0, y0 + 1, z0);
  const c110 = hash3(x0 + 1, y0 + 1, z0);
  const c001 = hash3(x0, y0, z0 + 1);
  const c101 = hash3(x0 + 1, y0, z0 + 1);
  const c011 = hash3(x0, y0 + 1, z0 + 1);
  const c111 = hash3(x0 + 1, y0 + 1, z0 + 1);

  return lerp(
    lerp(lerp(c000, c100, fx), lerp(c010, c110, fx), fy),
    lerp(lerp(c001, c101, fx), lerp(c011, c111, fx), fy),
    fz,
  );
}

function fbm3(x: number, y: number, z: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < 5; i++) {
    sum += noise3(x * freq, y * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function createEarthTexture(): THREE.CanvasTexture {
  const width = 512;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  if (!ctx) return texture;

  const image = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    const lat = (0.5 - (y + 0.5) / height) * Math.PI;
    for (let x = 0; x < width; x++) {
      const lon = ((x + 0.5) / width) * Math.PI * 2;
      const px = Math.cos(lat) * Math.cos(lon);
      const py = Math.sin(lat);
      const pz = Math.cos(lat) * Math.sin(lon);
      const n = fbm3(px * 2.2 + 11, py * 2.2 + 11, pz * 2.2 + 11);
      const polar = Math.abs(lat) > 1.25;

      let r: number;
      let g: number;
      let b: number;
      if (polar) {
        r = 238;
        g = 242;
        b = 248;
      } else if (n > 0.52) {
        const t = Math.min((n - 0.52) / 0.2, 1);
        r = Math.round(lerp(70, 150, t));
        g = Math.round(lerp(130, 120, t));
        b = Math.round(lerp(60, 80, t));
      } else {
        const t = Math.min((0.52 - n) / 0.25, 1);
        r = Math.round(lerp(40, 14, t));
        g = Math.round(lerp(110, 50, t));
        b = Math.round(lerp(200, 140, t));
      }

      const i = (y * width + x) * 4;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  texture.needsUpdate = true;
  return texture;
}

const VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vNormalW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform sampler2D map;
  uniform vec3 sunDirection;
  varying vec2 vUv;
  varying vec3 vNormalW;
  void main() {
    vec3 albedo = texture2D(map, vUv).rgb;
    float d = dot(normalize(vNormalW), normalize(sunDirection));
    float light = smoothstep(-0.05, 0.25, d);
    vec3 night = albedo * 0.04 + vec3(0.0, 0.0, 0.012);
    gl_FragColor = vec4(mix(night, albedo, light), 1.0);
  }
`;

function directionFromHorizontal(azimuthDeg: number, elevationDeg: number): THREE.Vector3 {
  const az = THREE.MathUtils.degToRad(azimuthDeg);
  const el = THREE.MathUtils.degToRad(elevationDeg);
  return new THREE.Vector3(
    Math.cos(el) * Math.sin(az),
    Math.sin(el),
    -Math.cos(el) * Math.cos(az),
  );
}

export function createEarth(scene: THREE.Scene, options: EarthOptions = {}): EarthResult {
  const { distance, radius } = { ...DEFAULTS, ...options };
  const angularRadiusDeg = THREE.MathUtils.radToDeg(Math.atan(radius / distance));

  const geometry = new THREE.SphereGeometry(radius, 48, 32);
  const texture = createEarthTexture();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  });

  const earth = new THREE.Mesh(geometry, material);
  earth.name = 'earth';
  scene.add(earth);

  const setHorizontal = (azimuthDeg: number, elevationDeg: number): void => {
    earth.position.copy(directionFromHorizontal(azimuthDeg, elevationDeg)).multiplyScalar(distance);
    earth.visible = elevationDeg > -angularRadiusDeg;
  };

  const setSunDirection = (azimuthDeg: number, elevationDeg: number): void => {
    material.uniforms.sunDirection.value.copy(directionFromHorizontal(azimuthDeg, elevationDeg));
  };

  const setDate = (date: Date): void => {
    const dayFraction = (((date.getTime() % DAY_MS) + DAY_MS) % DAY_MS) / DAY_MS;
    earth.rotation.y = dayFraction * Math.PI * 2;
  };

  const dispose = (): void => {
    scene.remove(earth);
    geometry.dispose();
    texture.dispose();
    material.dispose();
  };

  return { earth, setHorizontal, setSunDirection, setDate, dispose };
}