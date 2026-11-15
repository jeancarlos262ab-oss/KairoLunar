import './mainpage.css';
import { createMoonScene, type MoonScene } from './moonScene';
import { createVisualizer, type VisualizerResult } from '../visualizerLand';

type Lang = 'es' | 'en';

const T = {
  es: {
    sub: 'POLO SUR',
    closer: 'VER MÁS DE CERCA', search: 'Prueba "Malapert", "mejor" o ...', back: 'VOLVER A LA LUNA',
  },
  en: {
    sub: 'SOUTH POLE',
    closer: 'VIEW CLOSER', search: 'Try "Malapert", "best" or ...', back: 'BACK TO THE MOON',
  },
} as const;

const ICONS: Record<string, string> = {
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z|M9.6 9.3a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1 1-1.1 1.7|M12 17h.01',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z|M21 21l-5-5',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9|M10 21h4',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z|M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  target: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z|M12 2v4M12 18v4M2 12h4M18 12h4',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z|M3 12h18|M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  reset: 'M20 11a8 8 0 1 0-2.3 5.7|M20 4v7h-7',
  full: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  expand: 'M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  chevL: 'M15 6l-6 6 6 6',
  chevR: 'M9 6l6 6-6 6',
};

function icon(name: string, size = 15): string {
  const paths = ICONS[name].split('|').map((d) => `<path d="${d}"/>`).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

// Título e ícono (SVG) de la pestaña del navegador
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><clipPath id="c"><circle cx="32" cy="32" r="28"/></clipPath></defs>
<circle cx="32" cy="32" r="28" fill="#d9d2bd"/>
<g clip-path="url(#c)">
<path d="M0 0h30c-8 12-9 30-2 44 4 8 10 14 18 20H0z" fill="#1b1b1e" opacity=".55"/>
<ellipse cx="40" cy="22" rx="11" ry="8" fill="#8b8576" opacity=".7"/>
<circle cx="44" cy="43" r="7" fill="#aaa391"/><circle cx="44" cy="43" r="7" fill="none" stroke="#efe9d6" stroke-width="1.5"/>
<circle cx="26" cy="46" r="4.5" fill="#aaa391"/><circle cx="52" cy="30" r="3.5" fill="#aaa391"/>
<circle cx="35" cy="34" r="2.5" fill="#aaa391"/>
</g>
</svg>`;

function setBrowserTab(): void {
  document.title = 'Kairo Lunar';
  document.documentElement.lang = 'es';
  document.querySelectorAll('link[rel~="icon"]').forEach((l) => l.remove());
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  link.href = `data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}`;
  document.head.appendChild(link);
}

export interface MainPageResult {
  dispose: () => void;
}

export function createMainPage(container: HTMLElement): MainPageResult {
  setBrowserTab();
  let lang: Lang = 'es';

  const root = document.createElement('div');
  root.className = 'mp';
  container.appendChild(root);

  let moon: MoonScene | null = null;
  let terrain: { wrap: HTMLElement; viz: VisualizerResult } | null = null;
  let leaving = false;
  let busy = false;

  // Velo negro para las transiciones
  const fade = document.createElement('div');
  fade.className = 'mp-fade';
  container.appendChild(fade);
  const wait = (ms: number): Promise<void> => new Promise((r) => window.setTimeout(r, ms));
  const fadeTo = async (opacity: number, ms: number): Promise<void> => {
    fade.style.transitionDuration = `${ms}ms`;
    fade.style.opacity = String(opacity);
    await wait(ms);
  };

  const render = (): void => {
    const t = T[lang];
    moon?.dispose();
    root.innerHTML = `
      <div class="mp-stage"></div>
      <header class="mp-header">
        <div class="mp-logo"><b>Kairo Lunar</b><span>${t.sub}</span></div>
        <div class="mp-tools">
          <div class="mp-seg">
            <button data-lang="en" class="${lang === 'en' ? 'on' : ''}">EN</button>
            <button data-lang="es" class="${lang === 'es' ? 'on' : ''}">ES</button>
          </div>
        </div>
      </header>

      <button class="mp-closer" data-closer style="opacity:0"><span class="dot"><i></i></span><em>${t.closer} →</em></button>

      <div class="mp-zoom">
        <button class="mp-mini" data-act="zin" aria-label="zoom in">${icon('plus', 15)}</button>
        <button class="mp-mini" data-act="zout" aria-label="zoom out">${icon('minus', 15)}</button>
      </div>`;

    const q = <T extends HTMLElement>(s: string): T => root.querySelector<T>(s)!;
    const closer = q<HTMLButtonElement>('[data-closer]');
    moon = createMoonScene(q('.mp-stage'), {
      onPin: ({ visible, x, y }) => {
        closer.style.opacity = visible && !leaving ? '1' : '0';
        closer.style.pointerEvents = visible ? 'auto' : 'none';
        closer.style.transform = `translate(${Math.round(x - 14)}px, ${Math.round(y - 14)}px)`;
      },
    });

    root.querySelectorAll<HTMLElement>('[data-lang]').forEach((b) =>
      b.addEventListener('click', () => { lang = b.dataset.lang as Lang; render(); }));
    closer.addEventListener('click', () => void openTerrain());
    root.querySelectorAll<HTMLElement>('[data-act]').forEach((b) =>
      b.addEventListener('click', () => moon?.zoom(b.dataset.act === 'zin' ? 0.85 : 1.18)));
  };

  // "Ver más de cerca" -> visualizador de terreno 3D
  const openTerrain = async (): Promise<void> => {
    if (terrain || busy) return;
    busy = true;
    leaving = true;
    root.classList.add('leaving');
    await moon?.dive(1000); // la cámara se acerca al polo sur
    await fadeTo(1, 350);

    moon?.dispose();
    moon = null;
    root.style.display = 'none';

    const wrap = document.createElement('div');
    wrap.className = 'mp-terrain';
    container.appendChild(wrap);
    const viz = createVisualizer(wrap, { landing: { x: 10, z: -15 } });

    const back = document.createElement('button');
    back.className = 'mp-back';
    back.innerHTML = `${icon('chevL', 14)} ${T[lang].back}`;
    back.addEventListener('click', () => void closeTerrain());
    wrap.appendChild(back);

    terrain = { wrap, viz };
    await wait(120);
    await fadeTo(0, 700);
    busy = false;
  };

  const closeTerrain = async (): Promise<void> => {
    if (!terrain || busy) return;
    busy = true;
    await fadeTo(1, 400);
    terrain.viz.dispose();
    terrain.wrap.remove();
    terrain = null;
    leaving = false;
    root.classList.remove('leaving');
    root.style.display = '';
    render();
    await wait(80);
    await fadeTo(0, 600);
    busy = false;
  };

  render();

  return {
    dispose: () => {
      moon?.dispose();
      terrain?.viz.dispose();
      terrain?.wrap.remove();
      fade.remove();
      root.remove();
    },
  };
}
