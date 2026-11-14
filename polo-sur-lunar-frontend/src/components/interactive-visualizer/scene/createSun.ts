import * as THREE from 'three';

export interface SunOptions {
  orbitRadius?: number;
  orbitSpeed?: number;
  inclination?: number;
  startAngle?: number;
  size?: number;
  color?: number;
  lightIntensity?: number;
  ambientIntensity?: number;
  shadowExtent?: number;
  shadowMapSize?: number;
}

export interface SunResult {
  sun: THREE.Mesh;
  light: THREE.DirectionalLight;
  pivot: THREE.Group;
  update: (deltaSeconds: number) => void;
  setAngle: (radians: number) => void;
  setHorizontal: (azimuthDeg: number, elevationDeg: number) => void;
  setOrbitMode: () => void;
  getElevation: () => number;
  setPaused: (paused: boolean) => void;
  dispose: () => void;
}

const DEFAULTS = {
  orbitRadius: 800,
  orbitSpeed: 0.1,
  inclination: 10,
  startAngle: Math.PI / 4,
  size: 20,
  color: 0xfff4d6,
  lightIntensity: 3,
  ambientIntensity: 0.04,
  shadowExtent: 80,
  shadowMapSize: 2048,
};

export function createSun(scene: THREE.Scene, options: SunOptions = {}): SunResult {
  const {
    orbitRadius,
    orbitSpeed,
    inclination,
    startAngle,
    size,
    color,
    lightIntensity,
    ambientIntensity,
    shadowExtent,
    shadowMapSize,
  } = { ...DEFAULTS, ...options };

  const pivot = new THREE.Group();
  pivot.name = 'sun-pivot';
  pivot.rotation.x = THREE.MathUtils.degToRad(inclination);

  const spin = new THREE.Group();
  spin.rotation.y = startAngle;
  pivot.add(spin);

  const geometry = new THREE.SphereGeometry(size, 32, 32);
  const material = new THREE.MeshBasicMaterial({ color });
  const sun = new THREE.Mesh(geometry, material);
  sun.name = 'sun';
  sun.position.set(orbitRadius, 0, 0);
  spin.add(sun);

  const light = new THREE.DirectionalLight(color, lightIntensity);
  light.name = 'sun-light';
  light.castShadow = true;
  light.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  light.shadow.camera.left = -shadowExtent;
  light.shadow.camera.right = shadowExtent;
  light.shadow.camera.top = shadowExtent;
  light.shadow.camera.bottom = -shadowExtent;
  light.shadow.camera.near = 1;
  light.shadow.camera.far = orbitRadius * 2;
  light.shadow.bias = -0.0005;
  light.shadow.normalBias = 0.05;
  light.target.position.set(0, 0, 0);
  sun.add(light);

  const ambient = new THREE.AmbientLight(0xffffff, ambientIntensity);

  scene.add(pivot);
  scene.add(light.target);
  scene.add(ambient);

  let paused = false;
  let manual = false;
  const worldPosition = new THREE.Vector3();

  const update = (deltaSeconds: number): void => {
    if (paused || manual) return;
    spin.rotation.y += orbitSpeed * deltaSeconds;
  };

  const setAngle = (radians: number): void => {
    spin.rotation.y = radians;
  };

  const setHorizontal = (azimuthDeg: number, elevationDeg: number): void => {
    manual = true;
    pivot.rotation.set(0, 0, 0);
    spin.rotation.set(0, 0, 0);
    const az = THREE.MathUtils.degToRad(azimuthDeg);
    const el = THREE.MathUtils.degToRad(elevationDeg);
    sun.position.set(
      orbitRadius * Math.cos(el) * Math.sin(az),
      orbitRadius * Math.sin(el),
      -orbitRadius * Math.cos(el) * Math.cos(az),
    );
    sun.visible = elevationDeg > -1;
    light.intensity = elevationDeg > 0 ? lightIntensity : 0;
  };

  const setOrbitMode = (): void => {
    manual = false;
    pivot.rotation.set(THREE.MathUtils.degToRad(inclination), 0, 0);
    sun.position.set(orbitRadius, 0, 0);
    sun.visible = true;
    light.intensity = lightIntensity;
  };

  const getElevation = (): number => {
    pivot.updateMatrixWorld(true);
    sun.getWorldPosition(worldPosition);
    return THREE.MathUtils.radToDeg(Math.asin(worldPosition.y / worldPosition.length()));
  };

  const setPaused = (value: boolean): void => {
    paused = value;
  };

  const dispose = (): void => {
    light.shadow.map?.dispose();
    scene.remove(pivot);
    scene.remove(light.target);
    scene.remove(ambient);
    geometry.dispose();
    material.dispose();
    ambient.dispose();
    light.dispose();
  };

  return {
    sun,
    light,
    pivot,
    update,
    setAngle,
    setHorizontal,
    setOrbitMode,
    getElevation,
    setPaused,
    dispose,
  };
}