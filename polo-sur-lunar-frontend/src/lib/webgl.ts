let cached: boolean | undefined;

/** ¿Tiene este equipo WebGL? Es lo único que decide entre la Luna 3D y la versión 2D de respaldo. */
export function hasWebGL(): boolean {
  if (cached !== undefined) return cached;
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    cached = gl !== null && !gl.isContextLost();
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    cached = false;
  }
  return cached;
}
