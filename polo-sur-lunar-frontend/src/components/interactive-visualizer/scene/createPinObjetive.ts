import * as THREE from 'three';

export interface PinOptions {
  x?: number;
  z?: number;
  name?: string;
  color?: number;
  height?: number;
  headRadius?: number;
  ringRadius?: number;
  visible?: boolean;
  pulseSpeed?: number;
}

export interface PinResult {
  pin: THREE.Group;
  setPosition: (x: number, z: number) => void;
  setVisible: (visible: boolean) => void;
  toggle: () => boolean;
  isVisible: () => boolean;
  update: (deltaSeconds: number) => void;
  dispose: () => void;
}

const DEFAULTS = {
  x: 0,
  z: 0,
  name: 'objetivo',
  color: 0xff3b30,
  height: 6,
  headRadius: 1.2,
  ringRadius: 2.5,
  visible: true,
  pulseSpeed: 0.8,
};

export function createPinObjetive(
  scene: THREE.Scene,
  land: THREE.Mesh,
  options: PinOptions = {},
): PinResult {
  const { x, z, name, color, height, headRadius, ringRadius, visible, pulseSpeed } = {
    ...DEFAULTS,
    ...options,
  };

  const pin = new THREE.Group();
  pin.name = `pin-${name}`;
  pin.visible = visible;

  const stickGeometry = new THREE.CylinderGeometry(0.12, 0.12, height, 12);
  stickGeometry.translate(0, height / 2, 0);
  const stickMaterial = new THREE.MeshPhongMaterial({ color: 0xdddddd, shininess: 40 });
  const stick = new THREE.Mesh(stickGeometry, stickMaterial);
  stick.castShadow = true;

  const headGeometry = new THREE.SphereGeometry(headRadius, 24, 24);
  const headMaterial = new THREE.MeshPhongMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.6,
    shininess: 60,
  });
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.y = height + headRadius * 0.6;
  head.castShadow = true;

  const ringGeometry = new THREE.RingGeometry(ringRadius * 0.85, ringRadius, 48);
  ringGeometry.rotateX(-Math.PI / 2);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.position.y = 0.15;

  pin.add(stick, head, ring);
  scene.add(pin);

  const raycaster = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);
  let phase = 0;

  const setPosition = (nx: number, nz: number): void => {
    land.updateMatrixWorld(true);
    origin.set(nx, 10000, nz);
    raycaster.set(origin, down);
    const hit = raycaster.intersectObject(land, false)[0];
    pin.position.set(nx, hit ? hit.point.y : 0, nz);
  };

  const setVisible = (value: boolean): void => {
    pin.visible = value;
  };

  const toggle = (): boolean => {
    pin.visible = !pin.visible;
    return pin.visible;
  };

  const isVisible = (): boolean => pin.visible;

  const update = (deltaSeconds: number): void => {
    if (!pin.visible) return;
    phase = (phase + deltaSeconds * pulseSpeed) % 1;
    const scale = 1 + phase * 0.8;
    ring.scale.set(scale, 1, scale);
    ringMaterial.opacity = 0.8 * (1 - phase);
  };

  const dispose = (): void => {
    scene.remove(pin);
    stickGeometry.dispose();
    stickMaterial.dispose();
    headGeometry.dispose();
    headMaterial.dispose();
    ringGeometry.dispose();
    ringMaterial.dispose();
  };

  setPosition(x, z);

  return { pin, setPosition, setVisible, toggle, isVisible, update, dispose };
}