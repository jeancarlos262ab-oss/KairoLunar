import * as THREE from 'three';
import { createStars } from '../scene/createStars';
import { NOISE } from './moonShaders';

// Misma técnica que la Luna de referencia (createMoon): relieve y albedo procedurales
// horneados UNA vez en un cubemap; después el material Phong solo lee esa textura.
// Iluminación como el terreno 3D: un solo Sol + MeshPhongMaterial.

export interface PinState {
  visible: boolean;
  x: number;
  y: number;
}

export interface MoonScene {
  setDay: (day: number) => void;
  zoom: (factor: number) => void;
  reset: () => void;
  /** Se acerca al polo sur (transición hacia el terreno). Se resuelve al terminar. */
  dive: (ms?: number) => Promise<void>;
  dispose: () => void;
}

const BAKE_SIZE = 1024;
const STRIPS = 4;
const BAKE_STEPS = STRIPS * 6;

const BAKE_VERT = /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BAKE_FRAG = /* glsl */ `
precision highp float;
uniform float uFace;
uniform float uSize;
${NOISE}
void main() {
  vec2 st = gl_FragCoord.xy / uSize;
  float a = st.x * 2.0 - 1.0;
  float b = st.y * 2.0 - 1.0;
  vec3 d;
  if (uFace < 0.5) d = vec3(1.0, -b, -a);
  else if (uFace < 1.5) d = vec3(-1.0, -b, a);
  else if (uFace < 2.5) d = vec3(a, 1.0, b);
  else if (uFace < 3.5) d = vec3(a, -1.0, -b);
  else if (uFace < 4.5) d = vec3(a, -b, 1.0);
  else d = vec3(-a, -b, -1.0);
  float h; float alb;
  surface(normalize(d), h, alb);
  gl_FragColor = vec4(h * 20.0, alb, 0.0, 1.0);
}`;

/** Solo si el equipo no puede renderizar a float: versión recortada por píxel. */
const LITE_GLSL = /* glsl */ `
${NOISE}
void moonLite(vec3 N, out float h, out float alb) {
  float big = fbm(N * 2.2);
  vec2 c1 = craters(N, 5.0, 11.0);
  vec2 c2 = craters(N, 14.0, 41.0);
  h = (big - 0.5) * 0.03 + c1.x + c2.x;
  alb = clamp(mix(0.64, 0.17, mareMask(N)) + c1.y + c2.y, 0.12, 1.0);
}`;

// Fecha -> ángulo del Sol (una vuelta por mes sinódico)
const SYNODIC_DAYS = 29.53;
const BASE_SUN_ANGLE = 0.35;
const BASE_DISTANCE = 3.5;
const BASE_TILT = -0.95;

export function createMoonScene(
  container: HTMLElement,
  { onPin }: { onPin?: (pin: PinState) => void } = {},
): MoonScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  let distance = BASE_DISTANCE;
  let targetDistance = BASE_DISTANCE;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 1);
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const stars = createStars(scene, { count: 160, radius: 50 });

  const tilt = new THREE.Group();
  tilt.position.y = 0.06;
  tilt.rotation.set(BASE_TILT, 0, -0.25);
  scene.add(tilt);

  // ── Horneado del cubemap (relieve + albedo), repartido en franjas por fotograma ──
  const ext = renderer.extensions;
  const canBake = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
  let bakeRT: THREE.WebGLCubeRenderTarget | null = null;
  let bakeMat: THREE.ShaderMaterial | null = null;
  let bakePlane: THREE.Mesh | null = null;
  let bakeScene: THREE.Scene | null = null;
  let bakeCam: THREE.Camera | null = null;
  let bakeStep = canBake ? 0 : BAKE_STEPS;
  if (canBake) {
    bakeRT = new THREE.WebGLCubeRenderTarget(BAKE_SIZE, {
      format: THREE.RGFormat,
      type: THREE.HalfFloatType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
    bakeRT.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    bakeMat = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERT,
      fragmentShader: BAKE_FRAG,
      uniforms: { uFace: { value: 0 }, uSize: { value: BAKE_SIZE } },
      depthTest: false,
      depthWrite: false,
    });
    bakePlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bakeMat);
    bakePlane.frustumCulled = false;
    bakeScene = new THREE.Scene();
    bakeScene.add(bakePlane);
    bakeCam = new THREE.Camera();
  }
  const bakeOne = (): void => {
    if (bakeStep >= BAKE_STEPS || !bakeRT || !bakeMat || !bakeScene || !bakeCam) return;
    const face = Math.floor(bakeStep / STRIPS);
    const strip = bakeStep % STRIPS;
    const sh = BAKE_SIZE / STRIPS;
    bakeMat.uniforms.uFace.value = face;
    bakeRT.scissorTest = true;
    bakeRT.scissor.set(0, strip * sh, BAKE_SIZE, sh);
    bakeRT.viewport.set(0, 0, BAKE_SIZE, BAKE_SIZE);
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(bakeRT, face);
    renderer.render(bakeScene, bakeCam);
    renderer.setRenderTarget(previous);
    bakeStep += 1;
    if (bakeStep >= BAKE_STEPS) {
      bakeRT.scissorTest = false;
      bakePlane?.geometry.dispose();
      bakeMat.dispose();
    }
  };

  const RADIUS = 1;
  const geometry = new THREE.SphereGeometry(RADIUS, 128, 96);
  const material = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 3, specular: 0x111111 });
  material.onBeforeCompile = (shader) => {
    if (bakeRT) shader.uniforms.uTex = { value: bakeRT.texture };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDir;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDir = normalize(position);');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vDir;\n${bakeRT ? 'uniform samplerCube uTex;' : LITE_GLSL}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float moonH; float moonAlb;
        ${
          bakeRT
            ? 'vec4 tx = textureCube(uTex, normalize(vDir)); moonH = tx.r / 20.0; moonAlb = tx.g;'
            : 'moonLite(normalize(vDir), moonH, moonAlb);'
        }
        diffuseColor.rgb *= vec3(moonAlb * 1.12, moonAlb * 1.1, moonAlb * 1.04);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        {
          float hs = moonH * ${RADIUS.toFixed(1)} * 2.5;
          float dHx = dFdx(hs);
          float dHy = dFdy(hs);
          vec3 sx = dFdx(-vViewPosition);
          vec3 sy = dFdy(-vViewPosition);
          vec3 r1 = cross(sy, normal);
          vec3 r2 = cross(normal, sx);
          float det = dot(sx, r1);
          vec3 grad = sign(det) * (dHx * r1 + dHy * r2);
          normal = normalize(abs(det) * normal - grad);
        }`,
      );
  };
  const moon = new THREE.Mesh(geometry, material);
  moon.visible = bakeStep >= BAKE_STEPS; // se muestra cuando termina el horneado
  moon.rotation.y = 0.5;
  tilt.add(moon);

  scene.add(new THREE.AmbientLight(0xffffff, 0.04));
  const sun = new THREE.DirectionalLight(0xfff4d6, 3);
  scene.add(sun);
  const setSunAngle = (a: number): void => {
    sun.position.set(Math.cos(a) * 10, -3.5, Math.sin(a) * 10);
  };
  setSunAngle(BASE_SUN_ANGLE);

  // Render bajo demanda: solo se dibuja cuando algo cambia
  let dirty = true;
  let frame = 0;
  const invalidate = (): void => {
    dirty = true;
  };

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const el = renderer.domElement;
  el.style.touchAction = 'none';
  el.style.cursor = 'grab';
  const onDown = (e: PointerEvent): void => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    el.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent): void => {
    if (!dragging) return;
    moon.rotation.y += (e.clientX - lastX) * 0.006;
    tilt.rotation.x = THREE.MathUtils.clamp(tilt.rotation.x + (e.clientY - lastY) * 0.006, -1.6, 0.2);
    lastX = e.clientX;
    lastY = e.clientY;
    invalidate();
  };
  const onUp = (): void => {
    dragging = false;
  };
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    targetDistance = THREE.MathUtils.clamp(targetDistance + e.deltaY * 0.002, 2.2, 6);
    invalidate();
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('wheel', onWheel, { passive: false });

  const resize = (): void => {
    const w = Math.max(container.clientWidth, 1);
    const h = Math.max(container.clientHeight, 1);
    camera.aspect = w / h;
    camera.fov = w / h < 0.9 ? 40 / Math.max(w / h, 0.5) : 40; // Luna completa en pantallas angostas
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    invalidate();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  const pinPoint = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const toCam = new THREE.Vector3();
  const projected = new THREE.Vector3();

  interface Dive {
    start: number;
    ms: number;
    fromDist: number;
    fromX: number;
    fromZ: number;
    done: () => void;
  }
  let diving: Dive | null = null;
  const DIVE_DISTANCE = 1.45;
  const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const loop = (): void => {
    frame = requestAnimationFrame(loop);
    if (diving) {
      const d = diving;
      const t = Math.min((performance.now() - d.start) / d.ms, 1);
      const k = ease(t);
      distance = targetDistance = d.fromDist + (DIVE_DISTANCE - d.fromDist) * k;
      tilt.rotation.x = d.fromX + (-Math.PI / 2 - d.fromX) * k; // el polo sur mira a la cámara
      tilt.rotation.z = d.fromZ * (1 - k);
      dirty = true;
      if (t >= 1) {
        diving = null;
        d.done();
      }
    }
    if (Math.abs(targetDistance - distance) > 0.0005) {
      distance += (targetDistance - distance) * 0.18;
      dirty = true;
    }
    if (bakeStep < BAKE_STEPS) {
      bakeOne();
      if (bakeStep >= BAKE_STEPS) moon.visible = true;
      dirty = true;
    }
    if (!dirty) return;
    dirty = false;

    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);

    if (onPin) {
      // Marcador en el polo sur (Shackleton)
      pinPoint.set(0, -1, 0);
      tilt.localToWorld(pinPoint);
      normal.copy(pinPoint).sub(tilt.position).normalize();
      toCam.copy(camera.position).sub(pinPoint).normalize();
      projected.copy(pinPoint).project(camera);
      onPin({
        visible: normal.dot(toCam) > 0.05,
        x: ((projected.x + 1) / 2) * renderer.domElement.clientWidth,
        y: ((1 - projected.y) / 2) * renderer.domElement.clientHeight,
      });
    }
  };
  loop();

  return {
    setDay: (day) => {
      setSunAngle(BASE_SUN_ANGLE + (day / SYNODIC_DAYS) * Math.PI * 2);
      invalidate();
    },
    zoom: (factor) => {
      targetDistance = THREE.MathUtils.clamp(targetDistance * factor, 2.2, 6);
      invalidate();
    },
    dive: (ms = 1000) =>
      new Promise<void>((resolve) => {
        dragging = false;
        diving = {
          start: performance.now(),
          ms,
          fromDist: distance,
          fromX: tilt.rotation.x,
          fromZ: tilt.rotation.z,
          done: resolve,
        };
        invalidate();
      }),
    reset: () => {
      targetDistance = BASE_DISTANCE;
      tilt.rotation.x = BASE_TILT;
      invalidate();
    },
    dispose: () => {
      cancelAnimationFrame(frame);
      diving?.done();
      diving = null;
      observer.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
      stars.dispose();
      geometry.dispose();
      material.dispose();
      bakeRT?.dispose();
      if (bakeStep < BAKE_STEPS) {
        bakePlane?.geometry.dispose();
        bakeMat?.dispose();
      }
      renderer.dispose();
      el.remove();
    },
  };
}
