import * as THREE from 'three';
import { createLand, type LandOptions } from './scene/createLand';
import { createSun, type SunOptions } from './scene/createSun';
import { createPinObjetive } from './scene/createPinObjetive';

export interface VisualizerOptions {
  landing?: {
    name?: string;
    x?: number;
    z?: number;
    color?: number;
  };
  land?: LandOptions;
  sun?: SunOptions;
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
  dispose: () => void;
}

const DEFAULTS = {
  landing: { name: 'Shackleton', x: 10, z: -15, color: 0xff3b30 },
  camera: { fov: 50, near: 0.1, far: 5000, position: [0, 40, 80] as [number, number, number] },
};

function applyStyles(element: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(element.style, styles);
}

function createToggleButton(label: string, initial: boolean): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-pressed', String(initial));
  applyStyles(button, {
    position: 'absolute',
    top: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '10px 22px',
    border: '1px solid #ffffff',
    borderRadius: '999px',
    font: '600 14px system-ui, sans-serif',
    letterSpacing: '0.04em',
    cursor: 'pointer',
    zIndex: '10',
    transition: 'background 0.2s, color 0.2s',
  });

  const paint = (on: boolean): void => {
    button.textContent = `${on ? '●' : '○'}  ${label}`;
    button.style.background = on ? '#ffffff' : 'rgba(0, 0, 0, 0.6)';
    button.style.color = on ? '#000000' : '#ffffff';
    button.setAttribute('aria-pressed', String(on));
  };

  paint(initial);
  (button as HTMLButtonElement & { paint: (on: boolean) => void }).paint = paint;
  return button;
}

export function createVisualizer(
  container: HTMLElement,
  options: VisualizerOptions = {},
): VisualizerResult {
  const landing = { ...DEFAULTS.landing, ...options.landing };
  const cameraConfig = { ...DEFAULTS.camera, ...options.camera };

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

  const land = createLand(scene, camera, renderer.domElement, options.land);
  const sun = createSun(scene, options.sun);
  const pin = createPinObjetive(scene, land.mesh, {
    name: landing.name,
    x: landing.x,
    z: landing.z,
    color: landing.color,
  });

  const button = createToggleButton(landing.name, pin.isVisible()) as HTMLButtonElement & {
    paint: (on: boolean) => void;
  };
  const onToggle = (): void => {
    button.paint(pin.toggle());
  };
  button.addEventListener('click', onToggle);
  container.appendChild(button);

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

    sun.update(delta);
    pin.update(delta);
    land.update();
    renderer.render(scene, camera);
  });

  const dispose = (): void => {
    renderer.setAnimationLoop(null);
    observer.disconnect();
    button.removeEventListener('click', onToggle);
    button.remove();
    pin.dispose();
    sun.dispose();
    land.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    container.style.position = previousPosition;
    container.style.background = previousBackground;
  };

  return { scene, camera, renderer, dispose };
}