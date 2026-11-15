// Ruido y cráteres procedurales (GLSL) usados para hornear la textura de la Luna.
// Tomado de la referencia (moonShaders.ts).

/** Ruido y cráteres: se evalúan una vez al "hornear" el cubemap (o por píxel si no hay render a float). */
export const NOISE = /* glsl */ `
float h13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 h33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float vn(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y);
  float b = mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y);
  return mix(a, b, f.z);
}
float fbm(vec3 p) {
  float a = 0.5, s = 0.0, n = 0.0;
  for (int i = 0; i < 5; i++) { s += a * vn(p); n += a; a *= 0.5; p *= 2.03; }
  return s / n;
}
// Cráteres en celdas 3D → (altura, albedo)
vec2 craters(vec3 p, float scale, float seed) {
  vec3 q = p * scale;
  vec3 ci = floor(q);
  float h = 0.0, al = 0.0;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 c = ci + vec3(float(x), float(y), float(z));
    vec3 r = h33(c + seed);
    if (r.z > 0.5) continue;
    vec3 ctr = c + 0.2 + 0.6 * h33(c + seed + 5.7);
    float rad = mix(0.11, 0.40, r.x * r.x);
    float d = length(q - ctr) / rad;
    if (d > 1.5) continue;
    float depth = 0.16 * rad / scale;
    float bowl = 1.0 - d * d;
    float inside = step(d, 1.0);
    float t = (d - 1.0) / 0.14;
    float rim = exp(-t * t);
    h += -depth * bowl * min(1.0, 0.35 + bowl * 1.3) * inside + depth * 0.4 * rim;
    al += -0.08 * bowl * inside + 0.12 * rim;
  }
  return vec2(h, al);
}
// Mares: grandes manchas oscuras de basalto, de bordes irregulares
float mareMask(vec3 N) {
  float m = fbm(N * 1.0 + 4.0) + (fbm(N * 6.0 + 21.0) - 0.5) * 0.12;
  return clamp((0.505 - m) * 20.0, 0.0, 1.0);
}
void surface(vec3 N, out float h, out float alb) {
  float big = fbm(N * 2.2);
  float fine = fbm(N * 16.0 + 3.0);
  float mare = mareMask(N);
  vec2 c1 = craters(N, 5.0, 11.0);
  vec2 c2 = craters(N, 14.0, 41.0);
  vec2 c3 = craters(N, 38.0, 73.0);
  float damp = 1.0 - 0.55 * mare; // el terreno de los mares es más liso
  h = (big - 0.5) * 0.03 * damp + (fine - 0.5) * 0.004 + (c1.x + c2.x + c3.x) * damp - mare * 0.004;
  float base = mix(0.64, 0.17, mare);
  alb = clamp(base + (fine - 0.5) * 0.3 + (c1.y + c2.y + c3.y) * (1.0 - 0.4 * mare), 0.1, 1.0);
}`;
