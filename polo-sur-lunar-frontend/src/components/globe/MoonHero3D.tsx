import { useEffect, useRef } from "react";
import type { ReactElement } from "react";
import * as THREE from "three";
import { SUN_SEMIDIAMETER_DEG } from "../../engine/index";
import type { MoonFrame, SiteAnalysis } from "../../engine/index";
import { lonLabel, shortName } from "../../lib/format";
import { translate } from "../../i18n/i18n";
import { useStore } from "../../state/store";

/**
 * Luna en 3D (WebGL / three.js) vista desde arriba del polo sur.
 *
 * - La esfera lleva un shader procedural (maria, cráteres con relieve) y la iluminación es la REAL:
 *   cada punto está iluminado cuando la elevación local del Sol supera la máscara de horizonte,
 *   igual que en la versión 2D, así que el terminador coincide con el resto de la app.
 * - Arrastrar gira la Luna, la rueda (o pellizco) acerca/aleja, doble clic vuelve a la vista polar.
 * - Es la vista por defecto del inicio. Solo si el equipo no tiene WebGL (o no se pudo crear el contexto) `onFail` muestra la versión 2D.
 */
const CAP_DEG = 12;
const DEG = Math.PI / 180;
const CAP_RAD = CAP_DEG * DEG;
const FOV = 30;
const TAN_H = Math.tan((FOV * DEG) / 2);

interface Props {
  readonly analyses: readonly SiteAnalysis[];
  readonly selectedId: string;
  readonly frame: MoonFrame | undefined;
  readonly idx: number;
  readonly mask: number;
  readonly onSelect: (id: string) => void;
  /** Vista despejada: globo grande y centrado. */
  readonly centered?: boolean | undefined;
  /** WebGL no sirve en este equipo (no hay contexto, se perdió o va lento): usar el respaldo 2D. */
  readonly onFail?: (() => void) | undefined;
}

interface Layout {
  readonly cx: number;
  readonly cy: number;
  readonly rCap: number;
}

function layoutFor(w: number, h: number, centered = false): Layout {
  if (centered) {
    const r = Math.max(140, Math.min(w, h) * 0.39);
    return { cx: w / 2, cy: h * 0.46, rCap: r };
  }
  const TOP = 96;
  const BOTTOM = 190;
  const free = Math.max(0, h - TOP - BOTTOM);
  const r = Math.max(120, Math.min(w * 0.36, free / 2));
  return { cx: w / 2, cy: Math.max(r + TOP, TOP + free / 2), rCap: r };
}

/** Colatitud/longitud (grados, desde el polo sur) → punto de la escena. El polo sur mira a la cámara (+Z), 0° de longitud arriba (+Y), este a la derecha (+X). */
function sph(colatDeg: number, lonDeg: number, r = 1): THREE.Vector3 {
  const th = colatDeg * DEG;
  const la = lonDeg * DEG;
  return new THREE.Vector3(Math.sin(th) * Math.sin(la) * r, Math.sin(th) * Math.cos(la) * r, Math.cos(th) * r);
}

/** Marco fijo lunar (x,y,z) → escena (y, x, −z): rotación propia, así que los ángulos se conservan. */
function toScene(v: readonly number[], out: THREE.Vector3): THREE.Vector3 {
  return out.set(v[1] ?? 0, v[0] ?? 0, -(v[2] ?? 0));
}

const VERT = /* glsl */ `
varying vec3 vPos;
varying vec3 vViewN;
void main() {
  vPos = position;
  vViewN = normalize(normalMatrix * position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** Funciones de ruido/cráteres. Se usan una sola vez (al "hornear" la textura) o, sin soporte, en cada píxel. */
const GLSL_NOISE = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  float a = 0.5; float s = 0.0; float n = 0.0;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); n += a; a *= 0.5; p *= 2.03; }
  return s / n;
}

// Cráteres por celdas 3D: devuelve (altura, albedo)
vec2 craters(vec3 p, float scale, float seed) {
  vec3 q = p * scale;
  vec3 ci = floor(q);
  float h = 0.0;
  float al = 0.0;
  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 c = ci + vec3(float(x), float(y), float(z));
        vec3 r = hash33(c + seed);
        if (r.z > 0.55) continue;
        vec3 center = c + 0.2 + 0.6 * hash33(c + seed + 7.3);
        float rad = mix(0.12, 0.42, r.x * r.x);
        float d = length(q - center) / rad;
        if (d > 1.4) continue;
        float depth = 0.14 * rad / scale;
        float bowl = 1.0 - d * d;
        float inside = step(d, 1.0);
        float t = (d - 1.02) / 0.13;
        float rim = exp(-t * t);
        h += -depth * bowl * min(1.0, 0.4 + bowl * 1.2) * inside + depth * 0.35 * rim;
        al += -0.07 * bowl * inside + 0.1 * rim;
      }
    }
  }
  return vec2(h, al);
}


// Relieve (h) y albedo (alb) procedurales de un punto de la esfera
void surface(vec3 N, out float h, out float alb) {
  float big = fbm(N * 2.4);
  float fine = fbm(N * 14.0 + 3.0);
  vec2 c1 = craters(N, 4.0, 11.0);
  vec2 c2 = craters(N, 12.0, 41.0);
  vec2 c3 = craters(N, 34.0, 73.0);
  h = (big - 0.5) * 0.03 + (fine - 0.5) * 0.004 + c1.x + c2.x + c3.x;
  float mare = clamp((0.47 - fbm(N * 1.6 + 9.0)) * 5.0, 0.0, 1.0);
  alb = clamp(0.5 + (fine - 0.5) * 0.28 - mare * 0.24 + c1.y + c2.y + c3.y, 0.12, 1.0);
}`;

/** Pasada de "horneado": calcula (h·20, albedo) de una cara del cubo, una sola vez. */
const BAKE_VERT = /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BAKE_FRAG = /* glsl */ `
precision highp float;
uniform float uFace;
uniform float uSize;
${GLSL_NOISE}
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

/** Fragmento de la Luna. baked=true: lee relieve/albedo de la textura cúbica (barato); si no, los calcula por píxel (pesado). */
const fragSrc = (baked: boolean): string => /* glsl */ `
precision highp float;
varying vec3 vPos;
varying vec3 vViewN;
uniform vec3 uSun;
uniform vec3 uEarth;
uniform float uHas;
uniform float uThr;
uniform float uCap;
uniform float uCapRad;
${baked ? "uniform samplerCube uTex;" : GLSL_NOISE}

void main() {
  vec3 N = normalize(vPos);

  // Silueta del casquete polar (colatitud) para la vista de "disco"; se disuelve al alejar la cámara
  float colat = acos(clamp(N.z, -1.0, 1.0));
  float edge = 1.0 - uCap * smoothstep(uCapRad - 0.004, uCapRad, colat);
  if (edge < 0.003) discard;

  ${baked ? "vec4 tx = textureCube(uTex, N); float h = tx.r / 20.0; float alb = tx.g;" : "float h; float alb; surface(N, h, alb);"}

  // Normal con relieve (derivadas de pantalla)
  vec3 Nb = N;
  vec3 dpdx = dFdx(vPos);
  vec3 dpdy = dFdy(vPos);
  float dhx = dFdx(h);
  float dhy = dFdy(h);
  vec3 r1 = cross(dpdy, N);
  vec3 r2 = cross(N, dpdx);
  float det = dot(dpdx, r1);
  if (abs(det) > 1e-14) {
    vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
    Nb = normalize(abs(det) * N - 2.5 * grad);
  }

  // Iluminación real: elevación local del Sol sobre la máscara de horizonte
  float sunDot = dot(N, uSun);
  float elev = degrees(asin(clamp(sunDot, -1.0, 1.0)));
  float lit = uHas > 0.5 ? smoothstep(0.0, 2.2, elev - uThr) : 0.0;
  float relief = clamp((dot(Nb, uSun) - sunDot) * 6.0, -0.5, 0.5);
  float shade = 0.72 + 0.28 * sqrt(max(sunDot, 0.0));

  float dayB = alb * (0.34 + 0.66 * lit) * (1.0 + relief * (0.35 + 0.65 * lit)) * shade * 1.12;
  float nightB = 0.035 + alb * 0.05 * (1.0 + relief * 0.5);
  float b = lit > 0.0 ? max(nightB, dayB * (0.25 + 0.75 * lit) + nightB * (1.0 - lit)) : nightB;

  vec3 col = vec3(b * 218.0 + (1.0 - lit) * 4.0, b * 214.0 + (1.0 - lit) * 7.0, b * 206.0 + (1.0 - lit) * 16.0) / 255.0;
  // luz de la Tierra sobre el lado oscuro
  col += vec3(0.30, 0.42, 0.85) * 0.05 * max(dot(Nb, uEarth), 0.0) * (1.0 - lit);
  // oscurecimiento del limbo
  float fres = 1.0 - clamp(dot(normalize(vViewN), vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
  col *= 1.0 - 0.45 * fres * fres * fres * (1.0 - uCap);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), edge);
}`;

interface MatUniforms {
  [key: string]: THREE.IUniform;
  uSun: THREE.IUniform<THREE.Vector3>;
  uEarth: THREE.IUniform<THREE.Vector3>;
  uHas: THREE.IUniform<number>;
  uThr: THREE.IUniform<number>;
  uCap: THREE.IUniform<number>;
  uCapRad: THREE.IUniform<number>;
}

function makeMaterial(cap: number, tex: THREE.Texture | null): THREE.ShaderMaterial {
  const uniforms: MatUniforms = {
    uSun: { value: new THREE.Vector3(1, 0, 0) },
    uEarth: { value: new THREE.Vector3(0, 0, 1) },
    uHas: { value: 0 },
    uThr: { value: 0 },
    uCap: { value: cap },
    uCapRad: { value: CAP_RAD },
  };
  if (tex) uniforms.uTex = { value: tex };
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: fragSrc(tex !== null), uniforms, transparent: true });
}

function ring(colatDeg: number, color: number, opacity: number): THREE.LineLoop {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 128; i++) pts.push(sph(colatDeg, (i / 128) * 360, 1.0015));
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const l = new THREE.LineLoop(g, m);
  l.renderOrder = 2;
  return l;
}

const smooth01 = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export default function MoonHero3D(props: Props): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef<Props>(props);
  propsRef.current = props;

  useEffect(() => {
    const host = hostRef.current;
    const overlay = overlayRef.current;
    if (!host || !overlay) return undefined;
    const octx = overlay.getContext("2d");
    if (!octx) {
      propsRef.current.onFail?.();
      return undefined;
    }

    // El canvas WebGL se crea aquí (no en JSX): con StrictMode el efecto se monta dos veces y así cada montaje tiene su propio contexto.
    const glCanvas = document.createElement("canvas");
    glCanvas.style.pointerEvents = "none";
    host.insertBefore(glCanvas, overlay);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true, powerPreference: "high-performance" });
      const caps = renderer.capabilities as { isWebGL2?: boolean };
      if (caps.isWebGL2 === false) throw new Error("WebGL2 requerido");
    } catch {
      glCanvas.remove();
      propsRef.current.onFail?.();
      return undefined;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    const pr = Math.min(window.devicePixelRatio || 1, (window.matchMedia?.("(pointer: coarse)").matches ?? false) ? 1.5 : 2);
    renderer.setPixelRatio(pr);

    // ── escena principal ──
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
    const group = new THREE.Group();
    scene.add(group);

    // ── Horneado: el relieve y el albedo procedurales (muy caros por píxel) se calculan UNA vez en un cubemap ──
    // Después el shader de la Luna solo lee una textura. Sin soporte de render a float (raro) se usa el shader procedural.
    const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    const ext = renderer.extensions;
    const canBake = renderer.capabilities.isWebGL2 && (ext.has("EXT_color_buffer_float") || ext.has("EXT_color_buffer_half_float"));
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    const BAKE_SIZE = coarse ? 1536 : mem >= 4 ? 2048 : 1536;
    const STRIPS = BAKE_SIZE >= 2048 ? 8 : 4; // cada cara se hornea en franjas, una por fotograma, para no congelar la página
    let bakeRT: THREE.WebGLCubeRenderTarget | null = null;
    let bakeMat: THREE.ShaderMaterial | null = null;
    let bakeMesh: THREE.Mesh | null = null;
    let bakeCam: THREE.Camera | null = null;
    let bakeScene: THREE.Scene | null = null;
    let bakeStep = canBake ? 0 : STRIPS * 6;
    if (canBake) {
      bakeRT = new THREE.WebGLCubeRenderTarget(BAKE_SIZE, {
        format: THREE.RGFormat,
        type: THREE.HalfFloatType,
        generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
      });
      bakeMat = new THREE.ShaderMaterial({
        vertexShader: BAKE_VERT,
        fragmentShader: BAKE_FRAG,
        uniforms: { uFace: { value: 0 }, uSize: { value: BAKE_SIZE } },
        depthTest: false,
        depthWrite: false,
      });
      bakeMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bakeMat);
      bakeMesh.frustumCulled = false;
      bakeScene = new THREE.Scene();
      bakeScene.add(bakeMesh);
      bakeCam = new THREE.Camera();
    }
    if (bakeRT) bakeRT.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const bakeTex = bakeRT ? bakeRT.texture : null;

    const geo = new THREE.SphereGeometry(1, 128, 96);
    const mat = makeMaterial(1, bakeTex);
    const moon = new THREE.Mesh(geo, mat);
    moon.renderOrder = 1;
    moon.visible = !canBake;
    group.add(moon);

    for (const th of [2, 4, 6, 8, 10]) group.add(ring(th, 0xffffff, 0.14));
    const capRing = ring(CAP_DEG, 0xffffff, 0.45);
    group.add(capRing);
    // meridianos tenues cada 30°
    for (let lon = 0; lon < 360; lon += 30) {
      const g = new THREE.BufferGeometry().setFromPoints([sph(0, lon, 1.0015), sph(CAP_DEG, lon, 1.0015)]);
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, depthWrite: false }));
      l.renderOrder = 2;
      group.add(l);
    }

    // estrellas fijas de fondo
    const N_STARS = 260;
    const sp = new Float32Array(N_STARS * 3);
    for (let i = 0; i < N_STARS; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      sp[i * 3] = Math.cos(a) * s * 80;
      sp[i * 3 + 1] = u * 80;
      sp[i * 3 + 2] = Math.sin(a) * s * 80;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false });
    scene.add(new THREE.Points(starGeo, starMat));

    // ── Luna completa pequeña (acompaña a la rotación de la principal) ──
    const miniScene = new THREE.Scene();
    const miniCam = new THREE.OrthographicCamera(-1.06, 1.06, 1.06, -1.06, 0.1, 10);
    miniCam.position.set(0, 0, 3);
    const miniGroup = new THREE.Group();
    miniScene.add(miniGroup);
    const miniMat = makeMaterial(0, bakeTex);
    const miniMoon = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), miniMat);
    miniMoon.renderOrder = 1;
    miniMoon.visible = !canBake;
    miniGroup.add(miniMoon);
    miniGroup.add(ring(CAP_DEG, 0xffc857, 0.95));
    const mats = [mat, miniMat];

    // ── estado de interacción ──
    let w = 0;
    let h = 0;
    let raf = 0;
    let glDirty = true; // ¿hay que volver a pintar la esfera? (solo cuando algo cambia)
    let visible = true;
    let zoom = 0; // 0 = casquete polar, 1 = Luna completa
    let resetting = true;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (!reduced) {
      group.quaternion.setFromEuler(new THREE.Euler(0.45, -0.6, 0));
      zoom = 0.4;
    }
    const spinV = { x: 0, y: 0 };
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchD = 0;
    let downAt = { x: 0, y: 0 };
    let moved = 0;
    let dragging = false;
    let hover: string | null = null;
    let hits: Array<{ id: string; x: number; y: number }> = [];

    const desktop = window.matchMedia?.("(min-width: 1181px)").matches ?? true;
    overlay.style.touchAction = desktop ? "none" : "pan-y";

    const resize = (): void => {
      w = overlay.clientWidth;
      h = overlay.clientHeight;
      if (w < 2 || h < 2) return;
      glDirty = true;
      renderer.setSize(w, h, false);
      glCanvas.style.width = "100%";
      glCanvas.style.height = "100%";
      overlay.width = Math.floor(w * pr);
      overlay.height = Math.floor(h * pr);
      octx.setTransform(pr, 0, 0, pr, 0, 0);
    };

    const nearest = (x: number, y: number): string | null => {
      let best: string | null = null;
      let bestD = 18;
      for (const s of hits) {
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < bestD) {
          bestD = d;
          best = s.id;
        }
      }
      return best;
    };
    const local = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
      const r = overlay.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const tmpAxis = new THREE.Vector3();
    const tmpQ = new THREE.Quaternion();
    const identity = new THREE.Quaternion();
    const rotateBy = (dx: number, dy: number, radPerPx: number): void => {
      const len = Math.hypot(dx, dy);
      if (len === 0) return;
      tmpAxis.set(dy, dx, 0).normalize();
      tmpQ.setFromAxisAngle(tmpAxis, len * radPerPx);
      group.quaternion.premultiply(tmpQ).normalize();
    };
    let radPerPx = 0.0015;

    const onDown = (e: PointerEvent): void => {
      overlay.setPointerCapture(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) {
        downAt = p;
        moved = 0;
        dragging = true;
        resetting = false;
        spinV.x = 0;
        spinV.y = 0;
        overlay.style.cursor = "grabbing";
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchD = a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
      }
    };
    const onMove = (e: PointerEvent): void => {
      const p = local(e);
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        hover = nearest(p.x, p.y);
        overlay.style.cursor = hover ? "pointer" : "grab";
        return;
      }
      pointers.set(e.pointerId, p);
      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        if (a && b) {
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          zoom = Math.min(1, Math.max(0, zoom - (d - pinchD) * 0.004));
          pinchD = d;
          resetting = false;
        }
        return;
      }
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      moved += Math.abs(dx) + Math.abs(dy);
      rotateBy(dx, dy, radPerPx);
      spinV.x = dx;
      spinV.y = dy;
    };
    const onUp = (e: PointerEvent): void => {
      const p = local(e);
      pointers.delete(e.pointerId);
      if (pointers.size === 0) {
        dragging = false;
        overlay.style.cursor = hover ? "pointer" : "grab";
        if (e.type === "pointerup" && moved < 6 && Math.hypot(p.x - downAt.x, p.y - downAt.y) < 6) {
          const id = nearest(p.x, p.y);
          if (id) propsRef.current.onSelect(id);
          spinV.x = 0;
          spinV.y = 0;
        }
      }
    };
    const onLeave = (): void => {
      hover = null;
    };
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      zoom = Math.min(1, Math.max(0, zoom + e.deltaY * 0.0012));
      resetting = false;
    };
    const onDbl = (): void => {
      resetting = true;
    };
    overlay.addEventListener("pointerdown", onDown);
    overlay.addEventListener("pointermove", onMove);
    overlay.addEventListener("pointerup", onUp);
    overlay.addEventListener("pointercancel", onUp);
    overlay.addEventListener("pointerleave", onLeave);
    overlay.addEventListener("wheel", onWheel, { passive: false });
    overlay.addEventListener("dblclick", onDbl);
    overlay.style.cursor = "grab";

    // Contexto perdido: se deja que el navegador lo restaure (three.js lo reinicializa); no se cambia a 2D.
    const onLost = (e: Event): void => {
      e.preventDefault();
    };
    glCanvas.addEventListener("webglcontextlost", onLost);

    resize();
    window.addEventListener("resize", resize);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resize()) : null;
    ro?.observe(overlay);

    // ── utilidades de proyección ──
    const v = new THREE.Vector3();
    const proj = (p: THREE.Vector3): { x: number; y: number; vis: boolean } => {
      v.copy(p).applyMatrix4(group.matrixWorld);
      const vis = v.dot(camera.position) > v.lengthSq();
      v.project(camera);
      return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, vis };
    };
    const sunV = new THREE.Vector3();
    const earthV = new THREE.Vector3();
    const ORIGIN = new THREE.Vector3(0, 0, 0);
    const POLE = new THREE.Vector3(0, 0, 1.0015);

    // Render bajo demanda: la esfera solo se repinta cuando cambia algo (giro, zoom, Sol/Tierra, máscara, tamaño).
    // En reposo solo se redibuja la capa 2D (el pulso del sitio elegido), a ~30 fps, y fuera de pantalla no se hace nada.
    const markGL = (): void => {
      if (pointers.size > 0) glDirty = true;
    };
    for (const ev of ["pointerdown", "pointermove", "pointerup"] as const) overlay.addEventListener(ev, markGL);
    const markAlways = (): void => {
      glDirty = true;
    };
    overlay.addEventListener("wheel", markAlways, { passive: true });
    overlay.addEventListener("dblclick", markAlways);
    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((entries) => {
            visible = entries.some((en) => en.isIntersecting);
            if (visible) glDirty = true;
          })
        : null;
    io?.observe(overlay);
    const onVis = (): void => {
      if (!document.hidden) glDirty = true;
    };
    document.addEventListener("visibilitychange", onVis);

    let last = performance.now();
    let lastOverlay = 0;
    let pFrame: unknown = null;
    let pMask = Number.NaN;
    let pCentered: unknown = null;
    const BAKE_STEPS = STRIPS * 6;

    const draw = (now: number): void => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (w < 2 || h < 2 || !visible || document.hidden) {
        raf = requestAnimationFrame(draw);
        return;
      }

      // Horneado del relieve: una franja por fotograma (24–48 en total, <1 s); la Luna aparece al terminar
      if (bakeStep < BAKE_STEPS && bakeRT && bakeMat && bakeScene && bakeCam) {
        const face = Math.floor(bakeStep / STRIPS);
        const strip = bakeStep % STRIPS;
        const sh = BAKE_SIZE / STRIPS;
        bakeMat.uniforms.uFace!.value = face;
        bakeRT.scissorTest = true;
        bakeRT.scissor.set(0, strip * sh, BAKE_SIZE, sh);
        bakeRT.viewport.set(0, 0, BAKE_SIZE, BAKE_SIZE);
        renderer.setRenderTarget(bakeRT, face);
        renderer.render(bakeScene, bakeCam);
        renderer.setRenderTarget(null);
        bakeStep++;
        if (bakeStep >= BAKE_STEPS) {
          bakeRT.scissorTest = false;
          moon.visible = true;
          miniMoon.visible = true;
          bakeMesh?.geometry.dispose();
          bakeMat.dispose();
          glDirty = true;
        }
        raf = requestAnimationFrame(draw);
        return;
      }

      const { analyses, selectedId, frame, idx, mask, centered } = propsRef.current;
      const animating = resetting || dragging || Math.abs(spinV.x) > 0.02 || Math.abs(spinV.y) > 0.02;
      if (animating || frame !== pFrame || mask !== pMask || centered !== pCentered) {
        glDirty = true;
        pFrame = frame;
        pMask = mask;
        pCentered = centered;
      }
      if (!glDirty && now - lastOverlay < 33) {
        raf = requestAnimationFrame(draw);
        return;
      }
      lastOverlay = now;
      const L = layoutFor(w, h, centered);

      // animación: volver a la vista polar / inercia
      if (resetting) {
        const k = 1 - Math.exp(-dt * 5);
        group.quaternion.slerp(identity, k);
        zoom += (0 - zoom) * k;
        if (zoom < 0.002 && group.quaternion.angleTo(identity) < 0.002) {
          group.quaternion.copy(identity);
          zoom = 0;
          resetting = false;
        }
      } else if (!dragging && (Math.abs(spinV.x) > 0.02 || Math.abs(spinV.y) > 0.02)) {
        rotateBy(spinV.x, spinV.y, radPerPx);
        const f = Math.pow(0.04, dt);
        spinV.x *= f;
        spinV.y *= f;
      }
      group.updateMatrixWorld(true);
      miniGroup.quaternion.copy(group.quaternion);

      // cámara: a la distancia en la que el anillo de 12° mide rCap píxeles; al alejar se ve la Luna completa
      const baseD = Math.cos(CAP_RAD) + (Math.sin(CAP_RAD) * (h / 2)) / (L.rCap * TAN_H);
      const fullD = Math.sqrt(1 + ((h / 2) / (L.rCap * TAN_H)) ** 2);
      const d = baseD * Math.pow(Math.max(fullD, baseD * 1.2) / baseD, zoom);
      camera.aspect = w / h;
      camera.position.set(0, 0, d);
      camera.lookAt(0, 0, 0);
      camera.setViewOffset(w, h, w / 2 - L.cx, h / 2 - L.cy, w, h);
      camera.updateMatrixWorld(true);
      radPerPx = Math.max(0.0004, (TAN_H * (d - 1)) / (h / 2));
      const capAmt = 1 - smooth01(0.12, 0.55, zoom);

      // uniformes + render de la esfera (solo si algo cambió)
      const sun = frame?.sun;
      const R = Math.max(46, Math.min(66, L.rCap * 0.24));
      const gx0 = centered ? 24 + R : w - 24 - R;
      const gy0 = 104 + R;
      const mx = Math.round(gx0 - R);
      const my = Math.round(h - (gy0 + R));
      if (glDirty) {
      toScene(sun ?? [1, 0, 0], sunV);
      toScene(frame?.earth ?? [0, 0, -1], earthV);
      for (const m of mats) {
        const u = m.uniforms as MatUniforms;
        u.uSun.value.copy(sunV);
        u.uEarth.value.copy(earthV);
        u.uHas.value = sun ? 1 : 0;
        u.uThr.value = mask - SUN_SEMIDIAMETER_DEG;
      }
      (mat.uniforms as MatUniforms).uCap.value = capAmt;
      (capRing.material as THREE.LineBasicMaterial).opacity = 0.45 * capAmt;

      // ── render: Luna principal + Luna pequeña (con recorte) ──
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, w, h);
      renderer.clear();
      renderer.render(scene, camera);

      renderer.setScissorTest(true);
      renderer.setViewport(mx, my, Math.round(R * 2), Math.round(R * 2));
      renderer.setScissor(mx, my, Math.round(R * 2), Math.round(R * 2));
      renderer.clearDepth();
      renderer.render(miniScene, miniCam);
      renderer.setScissorTest(false);
      glDirty = false;
      }

      // ── capa 2D: halo, marcas, sitios y textos ──
      const ctx = octx;
      ctx.clearRect(0, 0, w, h);

      const origin = proj(ORIGIN);
      const rSil = (h / 2) / (TAN_H * Math.sqrt(Math.max(1.0001, d * d - 1)));
      if (capAmt < 0.98) {
        const halo = ctx.createRadialGradient(origin.x, origin.y, rSil * 0.985, origin.x, origin.y, rSil * 1.16);
        halo.addColorStop(0, `rgba(137,170,255,${0.12 * (1 - capAmt)})`);
        halo.addColorStop(1, "rgba(137,170,255,0)");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, rSil * 1.16, 0, Math.PI * 2);
        ctx.fill();
      }

      const pole = proj(POLE);
      if (capAmt > 0.02) {
        // marcas de longitud en el borde del casquete + rótulos
        ctx.lineWidth = 1;
        for (let k = 0; k < 72; k++) {
          const lon = k * 5;
          const a = proj(sph(CAP_DEG, lon, 1.0015));
          if (!a.vis) continue;
          const b = proj(sph(CAP_DEG + (k % 6 === 0 ? 0.9 : 0.4), lon, 1.0015));
          ctx.strokeStyle = `rgba(255,255,255,${0.5 * capAmt})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        ctx.font = "600 10px 'IBM Plex Mono', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = `rgba(255,255,255,${0.7 * capAmt})`;
        for (const [txt, lon] of [["0°", 0], [lonLabel(90, 0), 90], ["180°", 180], [lonLabel(-90, 0), 270]] as const) {
          const p = proj(sph(CAP_DEG - 1.3, lon, 1.0015));
          if (p.vis) ctx.fillText(txt, p.x, p.y);
        }
        ctx.textBaseline = "alphabetic";
        ctx.font = "10px Urbanist, Gilroy, sans-serif";
        ctx.textAlign = "left";
        ctx.fillStyle = `rgba(255,255,255,${0.32 * capAmt})`;
        for (const th of [2, 4, 6, 8, 10]) {
          const p = proj(sph(th, 45, 1.0015));
          if (p.vis) ctx.fillText(`${90 - th}°S`, p.x + 3, p.y - 2);
        }
      }

      // direcciones del Sol y de la Tierra sobre el borde del casquete
      if (frame && pole.vis) {
        const mark = (vec: readonly number[], rgb: string): void => {
          const lon = Math.atan2(vec[1] ?? 0, vec[0] ?? 0) / DEG;
          const rp = proj(sph(CAP_DEG, lon, 1.0015));
          if (!rp.vis) return;
          const dx = rp.x - pole.x;
          const dy = rp.y - pole.y;
          const m = Math.hypot(dx, dy) || 1;
          const gx = rp.x + (dx / m) * 8;
          const gy = rp.y + (dy / m) * 8;
          ctx.strokeStyle = `rgba(${rgb},0.45)`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pole.x, pole.y);
          ctx.lineTo(gx, gy);
          ctx.setLineDash([3, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = `rgb(${rgb})`;
          ctx.beginPath();
          ctx.arc(gx, gy, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = `rgba(${rgb},0.8)`;
          ctx.beginPath();
          ctx.arc(gx, gy, 12, 0, Math.PI * 2);
          ctx.stroke();
        };
        mark(frame.sun, "255,200,87");
        mark(frame.earth, "104,160,247");
      }

      // sitios (solo los que miran a la cámara)
      const nextHits: Array<{ id: string; x: number; y: number }> = [];
      for (const a of analyses) {
        const p = proj(sph(a.site.lat + 90, a.site.lon, 1.002));
        if (!p.vis) continue;
        nextHits.push({ id: a.site.id, x: p.x, y: p.y });
        const sel = a.site.id === selectedId;
        const sunLit = (a.series.sunEl[idx] ?? -90) + SUN_SEMIDIAMETER_DEG > mask;
        const earthUp = (a.series.earthEl[idx] ?? -90) > mask;
        // los sitios se hacen más pequeños al alejar la cámara
        const sc = 0.55 + 0.45 * capAmt;

        if (sel) {
          const phase = (now % 1800) / 1800;
          ctx.strokeStyle = `rgba(255,255,255,${0.55 * (1 - phase)})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, (10 + phase * 26) * sc, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = "rgba(255,255,255,0.55)";
          ctx.beginPath();
          ctx.arc(p.x, p.y, 13 * sc, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (earthUp) {
          ctx.strokeStyle = "rgba(104,137,247,0.95)";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, (sel ? 11 : 9) * sc, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (sunLit) {
          ctx.strokeStyle = "rgba(255,200,87,0.95)";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, (sel ? 7.5 : 6) * sc, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = a.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (sel ? 4.2 : 3.2) * Math.max(0.7, sc), 0, Math.PI * 2);
        ctx.fill();

        if (sel || hover === a.site.id) {
          ctx.font = "600 12px 'IBM Plex Mono', monospace";
          ctx.textAlign = "center";
          ctx.fillStyle = "#f5f5f5";
          ctx.fillText(sel ? a.site.name : shortName(a.site.name), p.x, p.y - 24 * sc);
        }
      }
      hits = nextHits;

      // Luna pequeña: contorno y rótulos
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.beginPath();
      ctx.arc(gx0, gy0, R, 0, Math.PI * 2);
      ctx.stroke();
      const rc = R * Math.sin(CAP_RAD);
      const capPx = (Math.sin(CAP_RAD) / Math.max(0.05, d - Math.cos(CAP_RAD)) / TAN_H) * (h / 2);
      ctx.font = "600 9px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText(translate(useStore.getState().lang, "hero.title"), gx0, gy0 + R + 14);
      ctx.fillStyle = "rgba(255,200,87,0.95)";
      ctx.fillText(`ZOOM ×${Math.max(1, capPx / rc).toFixed(1)}`, gx0, gy0 + R + 26);

      // ayuda de controles
      if (desktop) {
        ctx.font = "600 9px 'IBM Plex Mono', monospace";
        ctx.fillStyle = "rgba(255,255,255,0.32)";
        ctx.fillText(translate(useStore.getState().lang, "hero.help"), L.cx, Math.min(h - 8, L.cy + L.rCap + 34));
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      ro?.disconnect();
      overlay.removeEventListener("pointerdown", onDown);
      overlay.removeEventListener("pointermove", onMove);
      overlay.removeEventListener("pointerup", onUp);
      overlay.removeEventListener("pointercancel", onUp);
      overlay.removeEventListener("pointerleave", onLeave);
      overlay.removeEventListener("wheel", onWheel);
      overlay.removeEventListener("dblclick", onDbl);
      glCanvas.removeEventListener("webglcontextlost", onLost);
      for (const ev of ["pointerdown", "pointermove", "pointerup"] as const) overlay.removeEventListener(ev, markGL);
      overlay.removeEventListener("wheel", markAlways);
      overlay.removeEventListener("dblclick", markAlways);
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      bakeRT?.dispose();
      bakeMesh?.geometry.dispose();
      bakeMat?.dispose();
      geo.dispose();
      miniMoon.geometry.dispose();
      starGeo.dispose();
      starMat.dispose();
      mat.dispose();
      miniMat.dispose();
      group.traverse((o) => {
        if (o instanceof THREE.Line) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      miniGroup.traverse((o) => {
        if (o instanceof THREE.Line) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      renderer.dispose();
      glCanvas.remove();
    };
  }, []);

  return (
    <div className="hero-stack hero-3d" ref={hostRef}>
      <canvas ref={overlayRef} className="hero-canvas" />
    </div>
  );
}
