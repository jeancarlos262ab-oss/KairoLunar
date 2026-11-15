import * as THREE from 'three';
import { createLand, type LandOptions } from './scene/createLand';
import { createSun, type SunOptions } from './scene/createSun';
import { createEarth, type EarthOptions } from './scene/createEarth';
import { createStars, type StarsOptions } from './scene/createStars';
import { createLunarModule } from './scene/createLunarModule';
import { createTimeControls } from './scene/createTimeControls';
import { createSiteSelector } from './createSiteSelector';
import { createSkyPanel } from './createSkyPanel';
import { element } from './ui';
import { createTutorialModal } from './scene/createTutorialModal';
import { loadSiteData, makeHorizonFn, type HorizonProfile } from './data/loadLunarData';
import { SITES, siteLabel, type LandingSite } from './sites';
import { getMode, onLangChange, tr } from './i18n';
import { createModeSwitch } from './createModeSwitch';
import {
  findNextSunEvent,
  getEarthHorizontal,
  getMoonAgeDays,
  getSunHorizontal,
} from './lunarEphemeris';

export interface VisualizerOptions {
  siteId?: string;
  landing?: {
    x?: number;
    z?: number;
    color?: number;
  };
  startDate?: Date;
  land?: LandOptions;
  sun?: SunOptions;
  earth?: EarthOptions;
  stars?: StarsOptions;
  terrainExaggeration?: number;
  camera?: {
    fov?: number;
    near?: number;
    far?: number;
    position?: [number, number, number];
  };
}

export interface VisualizerResult {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  setDate: (date: Date) => void;
  setSite: (site: LandingSite) => void;
  dispose: () => void;
}

const DEFAULTS = {
  siteId: 'shackleton',
  landing: { x: 10, z: -15, color: 0xff3b30 },
  terrainExaggeration: 1,
  camera: { fov: 50, near: 0.1, far: 5000, position: [0, 40, 80] as [number, number, number] },
};

interface ToggleButton extends HTMLButtonElement {
  paint: (on: boolean) => void;
  setLabel: (label: string) => void;
}

function createToggleButton(initialLabel: string, initial: boolean): ToggleButton {
  const button = element('button', 'kv-mission') as ToggleButton;
  let label = initialLabel;
  let on = initial;
  button.type = 'button';

  const render = (): void => {
    button.textContent = `${on ? '●' : '○'}  ${label}`;
    button.setAttribute('aria-pressed', String(on));
  };

  button.paint = (value: boolean): void => {
    on = value;
    render();
  };
  button.setLabel = (value: string): void => {
    label = value;
    render();
  };

  render();
  return button;
}

function formatUtc(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function createVisualizer(
  container: HTMLElement,
  options: VisualizerOptions = {},
): VisualizerResult {
  const landing = { ...DEFAULTS.landing, ...options.landing };
  const cameraConfig = { ...DEFAULTS.camera, ...options.camera };
  const exaggeration = options.terrainExaggeration ?? DEFAULTS.terrainExaggeration;
  const startDate = options.startDate ?? new Date();
  let currentSite: LandingSite =
    SITES.find((site) => site.id === (options.siteId ?? DEFAULTS.siteId)) ?? SITES[0];
  let currentHorizon: HorizonProfile | null = null;

  container.classList.add('kv');
  const previousPosition = container.style.position;
  const previousBackground = container.style.background;
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.style.background = '#000000';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const width = Math.max(container.clientWidth, 1);
  const height = Math.max(container.clientHeight, 1);

  const camera = new THREE.PerspectiveCamera(
    cameraConfig.fov,
    width / height,
    cameraConfig.near,
    cameraConfig.far,
  );
  camera.position.set(...cameraConfig.position);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const stars = createStars(scene, options.stars);
  const land = createLand(scene, camera, renderer.domElement, {
    ...options.land,
    clearZone: { x: landing.x, z: landing.z, radius: 8 },
  });
  const sun = createSun(scene, options.sun);
  const earth = createEarth(scene, options.earth);
  const lander = createLunarModule(scene, land.mesh, {
    name: currentSite.name,
    x: landing.x,
    z: landing.z,
  });

  const button = createToggleButton(siteLabel(currentSite), lander.isVisible());
  const onToggle = (): void => {
    button.paint(lander.toggle());
  };
  button.addEventListener('click', onToggle);
  container.appendChild(button);

  let terrainToken = 0;
  let disposed = false;

  const applyDate = (date: Date): void => {
    const horizon = makeHorizonFn(currentHorizon);
    const h = getSunHorizontal(date, currentSite.lat, currentSite.lon);
    const sunHorizon = horizon(h.azimuth);
    sun.setHorizontal(h.azimuth, h.elevation, sunHorizon);
    const e = getEarthHorizontal(date, currentSite.lat, currentSite.lon);
    earth.setHorizontal(e.azimuth, e.elevation, horizon(e.azimuth));
    earth.setSunDirection(h.azimuth, h.elevation);
    earth.setDate(date);
    const state = tr(h.elevation > sunHorizon ? 'Sol sobre el horizonte' : 'Sol bajo el horizonte');
    const horizonText = currentHorizon ? `  ·  ${tr('Horizonte')} ${sunHorizon.toFixed(1)}°` : '';
    timeControls.setInfo(
      getMode() === 'basic'
        ? `${siteLabel(currentSite)}  ·  ${formatUtc(date)}  ·  ${state}`
        : `${siteLabel(currentSite)}  ·  ${formatUtc(date)}  ·  ${tr('Elevación solar')} ${h.elevation.toFixed(1)}°  ·  ${tr('Azimut')} ${h.azimuth.toFixed(0)}°${horizonText}  ·  ${state}  ·  ${tr('Edad lunar')} ${getMoonAgeDays(date).toFixed(1)} d`,
    );
    skyPanel.update(date);
  };

  const applySiteData = async (site: LandingSite, regenerateIfMissing: boolean): Promise<void> => {
    terrainToken += 1;
    const token = terrainToken;
    const data = await loadSiteData(site.id);
    if (disposed || token !== terrainToken) return;

    currentHorizon = data.horizon;
    applyDate(timeControls.getDate());

    if (data.terrain) {
      land.setTerrain(data.terrain, exaggeration);
      lander.setPosition(0, 0);
    } else if (regenerateIfMissing) {
      land.regenerate();
      lander.setPosition(landing.x, landing.z);
    } else {
      return;
    }

    lander.setVisible(true);
    button.paint(true);
  };

  const timeControls = createTimeControls(container, {
    initialDate: startDate,
    onChange: applyDate,
    findEvent: (kind, from) =>
      findNextSunEvent(
        from,
        kind,
        currentSite.lat,
        currentSite.lon,
        32,
        makeHorizonFn(currentHorizon),
      ),
  });

  const selector = createSiteSelector(container, {
    sites: SITES,
    initialSiteId: currentSite.id,
    onSelect: (site) => {
      currentSite = site;
      currentHorizon = null;
      button.setLabel(siteLabel(site));
      void applySiteData(site, true);
      applyDate(timeControls.getDate());
    },
  });

  const skyPanel = createSkyPanel(container, {
    getSite: () => currentSite,
    getHorizon: () => currentHorizon,
  });

  const modeSwitch = createModeSwitch(container);
  const tutorial = createTutorialModal(container);

  applyDate(startDate);
  void applySiteData(currentSite, false);

  const offLang = onLangChange(() => {
    button.setLabel(siteLabel(currentSite));
    applyDate(timeControls.getDate());
  });

  const resize = (): void => {
    const w = Math.max(container.clientWidth, 1);
    const h = Math.max(container.clientHeight, 1);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const delta = Math.min((now - last) / 1000, 0.1);
    last = now;

    timeControls.tick(delta);
    lander.update(delta);
    land.update();
    renderer.render(scene, camera);
  });

  const dispose = (): void => {
    disposed = true;
    offLang();
    renderer.setAnimationLoop(null);
    observer.disconnect();
    button.removeEventListener('click', onToggle);
    button.remove();
    tutorial.dispose();
    modeSwitch.dispose();
    skyPanel.dispose();
    selector.dispose();
    timeControls.dispose();
    lander.dispose();
    earth.dispose();
    sun.dispose();
    stars.dispose();
    land.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    container.style.position = previousPosition;
    container.style.background = previousBackground;
    container.classList.remove('kv');
  };

  return {
    scene,
    camera,
    renderer,
    setDate: (date) => timeControls.setDate(date),
    setSite: (site) => selector.setSite(site),
    dispose,
  };
}