import { useEffect, useRef } from "react";
import type { MouseEvent, ReactElement } from "react";
import { SUN_SEMIDIAMETER_DEG } from "../../engine/index";
import type { MoonFrame, SiteAnalysis } from "../../engine/index";
import { lonLabel, shortName } from "../../lib/format";
import { translate } from "../../i18n/i18n";
import { useStore } from "../../state/store";
import { renderCap, renderGlobe } from "./moonSurface";
import type { Rendered } from "./moonSurface";

/**
 * Casquete polar de la Luna visto desde arriba del polo sur (0° de longitud arriba, este en sentido horario).
 * La superficie es procedural (relieve ilustrativo), pero la iluminación es real: cada punto está iluminado
 * cuando la elevación local del Sol supera la máscara de horizonte, así que el terminador es el de la fecha elegida.
 * Arriba a un lado se muestra la Luna completa con el casquete marcado (acercamiento).
 */
const CAP_DEG = 12;
const DEG = Math.PI / 180;

interface Props {
  readonly analyses: readonly SiteAnalysis[];
  readonly selectedId: string;
  readonly frame: MoonFrame | undefined;
  readonly idx: number;
  readonly mask: number;
  readonly onSelect: (id: string) => void;
  /** Vista despejada: globo grande y centrado. */
  readonly centered?: boolean | undefined;
}

interface Layout {
  readonly cx: number;
  readonly cy: number;
  readonly k: number;
  readonly rCap: number;
}

function layoutFor(w: number, h: number, centered = false): Layout {
  // El globo siempre va centrado en su área (a la izquierda; los paneles viven en la columna derecha).
  if (centered) {
    const r = Math.max(140, Math.min(w, h) * 0.39);
    return { cx: w / 2, cy: h * 0.46, k: r / Math.sin(CAP_DEG * DEG), rCap: r };
  }
  // Se reserva espacio arriba (appbar) y abajo (EXPLORE + controles) y el globo se centra en el hueco libre.
  const TOP = 96;
  const BOTTOM = 190;
  const free = Math.max(0, h - TOP - BOTTOM);
  const r = Math.max(120, Math.min(w * 0.36, free / 2));
  const cy = Math.max(r + TOP, TOP + free / 2);
  return { cx: w / 2, cy, k: r / Math.sin(CAP_DEG * DEG), rCap: r };
}

function sitePos(lat: number, lon: number, l: Layout): { x: number; y: number } {
  const theta = (lat + 90) * DEG;
  const lam = lon * DEG;
  return { x: l.cx + l.k * Math.sin(theta) * Math.sin(lam), y: l.cy - l.k * Math.sin(theta) * Math.cos(lam) };
}

export default function MoonHero2D(props: Props): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef<Props>(props);
  const hoverRef = useRef<string | null>(null);
  propsRef.current = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    let raf = 0;
    let capImg: Rendered | undefined;
    let globeImg: Rendered | undefined;
    let w = 0;
    let h = 0;

    const stars = Array.from({ length: 150 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() * 1.2 + 0.2, a: Math.random() * 0.55 + 0.15 }));

    const resize = (): void => {
      const dpr = window.devicePixelRatio || 1;
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (t: number): void => {
      const { analyses, selectedId, frame, idx, mask } = propsRef.current;
      const L = layoutFor(w, h, propsRef.current.centered);
      ctx.clearRect(0, 0, w, h);

      for (const s of stars) {
        ctx.fillStyle = `rgba(255,255,255,${s.a})`;
        ctx.fillRect(s.x * w, s.y * h, s.s, s.s);
      }

      const sun = frame?.sun;
      const thr = mask - SUN_SEMIDIAMETER_DEG;

      // halo suave detrás del disco
      const halo = ctx.createRadialGradient(L.cx, L.cy, L.rCap * 0.92, L.cx, L.cy, L.rCap * 1.16);
      halo.addColorStop(0, "rgba(137,170,255,0.10)");
      halo.addColorStop(1, "rgba(137,170,255,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(L.cx, L.cy, L.rCap * 1.16, 0, Math.PI * 2);
      ctx.fill();

      // superficie lunar del casquete, iluminada con el Sol real
      ctx.fillStyle = "#020203";
      ctx.beginPath();
      ctx.arc(L.cx, L.cy, L.rCap, 0, Math.PI * 2);
      ctx.fill();
      capImg = renderCap(capImg, sun, thr, CAP_DEG);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(capImg.canvas, L.cx - L.rCap, L.cy - L.rCap, L.rCap * 2, L.rCap * 2);

      // borde y marcas de longitud
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath();
      ctx.arc(L.cx, L.cy, L.rCap, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      for (let k = 0; k < 72; k++) {
        const a = (k * 5 * Math.PI) / 180;
        const len = k % 6 === 0 ? 9 : 4;
        ctx.beginPath();
        ctx.moveTo(L.cx + Math.cos(a) * (L.rCap + 3), L.cy + Math.sin(a) * (L.rCap + 3));
        ctx.lineTo(L.cx + Math.cos(a) * (L.rCap + 3 + len), L.cy + Math.sin(a) * (L.rCap + 3 + len));
        ctx.stroke();
      }
      ctx.font = "600 10px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      const lon = (txt: string, ang: number): void => {
        const rr = L.rCap - 15;
        ctx.fillText(txt, L.cx + Math.sin(ang) * rr, L.cy - Math.cos(ang) * rr);
      };
      lon("0°", 0);
      lon(lonLabel(90, 0), Math.PI / 2);
      lon("180°", Math.PI);
      lon(lonLabel(-90, 0), -Math.PI / 2);
      ctx.textBaseline = "alphabetic";

      // Luna completa (acercamiento): esfera con el casquete marcado
      const R = Math.max(46, Math.min(66, L.rCap * 0.24));
      const gx0 = propsRef.current.centered ? 24 + R : w - 24 - R;
      const gy0 = 104 + R;
      globeImg = renderGlobe(globeImg, sun);
      ctx.drawImage(globeImg.canvas, gx0 - R, gy0 - R, R * 2, R * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.beginPath();
      ctx.arc(gx0, gy0, R, 0, Math.PI * 2);
      ctx.stroke();
      const rc = R * Math.sin(CAP_DEG * DEG);
      ctx.strokeStyle = "rgba(255,200,87,0.95)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(gx0, gy0, rc, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.font = "600 9px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText(translate(useStore.getState().lang, "hero.title"), gx0, gy0 + R + 14);
      ctx.fillStyle = "rgba(255,200,87,0.95)";
      ctx.fillText(`ZOOM ×${(L.rCap / rc).toFixed(1)}`, gx0, gy0 + R + 26);

      // anillos de latitud
      ctx.lineWidth = 1;
      ctx.font = "10px Urbanist, Gilroy, sans-serif";
      ctx.textAlign = "left";
      for (const th of [2, 4, 6, 8, 10]) {
        const r = L.k * Math.sin(th * DEG);
        ctx.strokeStyle = "rgba(255,255,255,0.07)";
        ctx.beginPath();
        ctx.arc(L.cx, L.cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.32)";
        ctx.fillText(`${90 - th}°S`, L.cx + r * Math.SQRT1_2 + 3, L.cy - r * Math.SQRT1_2 - 2);
      }

      // direcciones del Sol y de la Tierra (resplandor en el borde)
      if (frame) {
        const mark = (v: readonly [number, number, number], rgb: string): void => {
          const hx = v[1];
          const hy = -v[0];
          const m = Math.hypot(hx, hy) || 1;
          const gx = L.cx + (hx / m) * (L.rCap + 8);
          const gy = L.cy + (hy / m) * (L.rCap + 8);
          ctx.strokeStyle = `rgba(${rgb},0.45)`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(L.cx, L.cy);
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

      // sitios
      for (const a of analyses) {
        const p = sitePos(a.site.lat, a.site.lon, L);
        const sel = a.site.id === selectedId;
        const sunLit = (a.series.sunEl[idx] ?? -90) + SUN_SEMIDIAMETER_DEG > mask;
        const earthUp = (a.series.earthEl[idx] ?? -90) > mask;

        if (sel) {
          const phase = (t % 1800) / 1800;
          ctx.strokeStyle = `rgba(255,255,255,${0.55 * (1 - phase)})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 10 + phase * 26, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = "rgba(255,255,255,0.55)";
          ctx.beginPath();
          ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (earthUp) {
          ctx.strokeStyle = "rgba(104,137,247,0.95)";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, sel ? 11 : 9, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (sunLit) {
          ctx.strokeStyle = "rgba(255,200,87,0.95)";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, sel ? 7.5 : 6, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = a.color;
        ctx.shadowColor = a.color;
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, sel ? 4.2 : 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        if (sel || hoverRef.current === a.site.id) {
          ctx.font = "600 12px 'IBM Plex Mono', monospace";
          ctx.textAlign = "center";
          ctx.fillStyle = "#f5f5f5";
          ctx.fillText(sel ? a.site.name : shortName(a.site.name), p.x, p.y - 24);
        }
      }

      raf = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    // El área del globo cambia sin que cambie la ventana (columna lateral, pantalla completa): re-medir para que no se estire.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resize()) : null;
    ro?.observe(canvas);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      ro?.disconnect();
    };
  }, []);

  const nearest = (e: MouseEvent<HTMLCanvasElement>): string | null => {
    const rect = e.currentTarget.getBoundingClientRect();
    const L = layoutFor(rect.width, rect.height, props.centered);
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best: string | null = null;
    let bestD = 18;
    for (const a of propsRef.current.analyses) {
      const p = sitePos(a.site.lat, a.site.lon, L);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) {
        bestD = d;
        best = a.site.id;
      }
    }
    return best;
  };

  return (
    <div className="hero-stack">
    <canvas
      ref={canvasRef}
      className="hero-canvas"
      onClick={(e) => {
        const id = nearest(e);
        if (id) props.onSelect(id);
      }}
      onMouseMove={(e) => {
        const id = nearest(e);
        hoverRef.current = id;
        e.currentTarget.style.cursor = id ? "pointer" : "default";
      }}
      onMouseLeave={() => {
        hoverRef.current = null;
      }}
    />
    </div>
  );
}
