import * as THREE from 'three';

export interface LunarModuleOptions {
  x?: number;
  z?: number;
  name?: string;
  scale?: number;
  visible?: boolean;
  altitude?: number;
  descentSeconds?: number;
  holdSeconds?: number;
  loop?: boolean;
}

export interface LunarModuleResult {
  module: THREE.Group;
  setPosition: (x: number, z: number) => void;
  setVisible: (visible: boolean) => void;
  toggle: () => boolean;
  isVisible: () => boolean;
  restart: () => void;
  update: (deltaSeconds: number) => void;
  dispose: () => void;
}

const DEFAULTS = {
  x: 0,
  z: 0,
  name: 'modulo-lunar',
  scale: 1.2,
  visible: true,
  altitude: 28,
  descentSeconds: 10,
  holdSeconds: 8,
  loop: true,
};

const DUST_COUNT = 180;
const DUST_DURATION = 6;
const FOOT_RADIUS = 2.7;

function strut(
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
  material: THREE.Material,
): THREE.Mesh {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 8);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(from).addScaledVector(direction, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  return mesh;
}

function cast(mesh: THREE.Mesh): THREE.Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createLunarModule(
  scene: THREE.Scene,
  land: THREE.Mesh,
  options: LunarModuleOptions = {},
): LunarModuleResult {
  const { x, z, name, scale, visible, altitude, descentSeconds, holdSeconds, loop } = {
    ...DEFAULTS,
    ...options,
  };

  const root = new THREE.Group();
  root.name = `lm-${name}`;
  root.scale.setScalar(scale);
  root.visible = visible;

  const body = new THREE.Group();
  root.add(body);

  const gold = new THREE.MeshPhongMaterial({ color: 0xd4a82a, shininess: 90, specular: 0xffeeaa });
  const silver = new THREE.MeshPhongMaterial({ color: 0xbdbdbd, shininess: 60 });
  const steel = new THREE.MeshPhongMaterial({ color: 0x8c8c8c, shininess: 40 });
  const dark = new THREE.MeshPhongMaterial({
    color: 0x1b1b1b,
    shininess: 20,
    side: THREE.DoubleSide,
  });
  const glass = new THREE.MeshPhongMaterial({ color: 0x0a0f18, shininess: 120, specular: 0x6688aa });

  const descentStage = cast(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.1, 8), gold));
  descentStage.position.y = 1.55;
  descentStage.rotation.y = Math.PI / 8;
  body.add(descentStage);

  const descentBand = cast(new THREE.Mesh(new THREE.CylinderGeometry(1.52, 1.52, 0.12, 8), steel));
  descentBand.position.y = 2.1;
  descentBand.rotation.y = Math.PI / 8;
  body.add(descentBand);

  const ascentStage = cast(new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.2, 1.5, 8), silver));
  ascentStage.position.y = 2.91;
  ascentStage.rotation.y = Math.PI / 8;
  body.add(ascentStage);

  const roof = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.05, 0.3, 8), gold));
  roof.position.y = 3.81;
  roof.rotation.y = Math.PI / 8;
  body.add(roof);

  [-0.42, 0.42].forEach((px) => {
    const window = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.1), glass);
    window.position.set(px, 3.2, 1.04);
    window.rotation.x = -0.08;
    body.add(window);
  });

  const hatch = cast(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.1), steel));
  hatch.position.set(0, 2.45, 1.08);
  body.add(hatch);

  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.5, 0.6, 20, 1, true), dark);
  bell.position.y = 0.7;
  body.add(bell);

  for (let k = 0; k < 4; k += 1) {
    const angle = Math.PI / 4 + (k * Math.PI) / 2;
    const dx = Math.sin(angle);
    const dz = Math.cos(angle);

    const foot = new THREE.Vector3(dx * FOOT_RADIUS, 0.12, dz * FOOT_RADIUS);
    body.add(strut(new THREE.Vector3(dx * 1.3, 1.25, dz * 1.3), foot, 0.075, steel));
    body.add(
      strut(
        new THREE.Vector3(dx * 1.3, 1.95, dz * 1.3),
        new THREE.Vector3(dx * 2.25, 0.62, dz * 2.25),
        0.045,
        steel,
      ),
    );

    const pad = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.08, 20), gold));
    pad.position.set(dx * FOOT_RADIUS, 0.04, dz * FOOT_RADIUS);
    body.add(pad);

    const quadAngle = (k * Math.PI) / 2;
    const quad = cast(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), dark));
    quad.position.set(Math.sin(quadAngle) * 1.18, 3.05, Math.cos(quadAngle) * 1.18);
    quad.rotation.y = quadAngle;
    body.add(quad);
  }

  const dishStem = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8), steel));
  dishStem.position.set(-0.55, 4.2, -0.2);
  body.add(dishStem);

  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.3),
    new THREE.MeshPhongMaterial({ color: 0xe6e6e6, shininess: 70, side: THREE.DoubleSide }),
  );
  dish.position.set(-0.55, 4.52, -0.2);
  dish.rotation.set(-0.5, 0.4, 0);
  dish.castShadow = true;
  body.add(dish);

  const radar = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 16), dark));
  radar.position.set(0.5, 3.98, 0.3);
  body.add(radar);

  const rod = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 6), steel));
  rod.position.set(0.7, 4.6, -0.3);
  rod.rotation.z = -0.25;
  body.add(rod);

  const flameGeometry = new THREE.ConeGeometry(0.42, 1, 16, 1, true);
  flameGeometry.rotateX(Math.PI);
  flameGeometry.translate(0, -0.5, 0);
  const flameMaterial = new THREE.MeshBasicMaterial({
    color: 0xffa347,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const flame = new THREE.Mesh(flameGeometry, flameMaterial);
  flame.position.y = 0.45;
  body.add(flame);

  const flameLight = new THREE.PointLight(0xffb060, 0, 14, 2);
  flameLight.position.y = 0.1;
  body.add(flameLight);

  const dustPositions = new Float32Array(DUST_COUNT * 3);
  const dustAngle = new Float32Array(DUST_COUNT);
  const dustSpeed = new Float32Array(DUST_COUNT);
  const dustLift = new Float32Array(DUST_COUNT);
  for (let i = 0; i < DUST_COUNT; i += 1) {
    dustAngle[i] = Math.random() * Math.PI * 2;
    dustSpeed[i] = 3 + Math.random() * 11;
    dustLift[i] = 0.3 + Math.random() * 1.6;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMaterial = new THREE.PointsMaterial({
    color: 0xb4b4b4,
    size: 0.45,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  dust.frustumCulled = false;
  root.add(dust);

  scene.add(root);

  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const origin = new THREE.Vector3();

  const groundAt = (px: number, pz: number): number => {
    origin.set(px, 1000, pz);
    raycaster.set(origin, down);
    const hit = raycaster.intersectObject(land, false)[0];
    return hit ? hit.point.y : 0;
  };

  let time = 0;
  let dustTime = -1;
  let shown = visible;

  const setPosition = (px: number, pz: number): void => {
    land.updateMatrixWorld(true);
    let base = groundAt(px, pz);
    for (let k = 0; k < 4; k += 1) {
      const angle = Math.PI / 4 + (k * Math.PI) / 2;
      const reach = FOOT_RADIUS * scale;
      base = Math.max(base, groundAt(px + Math.sin(angle) * reach, pz + Math.cos(angle) * reach));
    }
    root.position.set(px, base - 0.02, pz);
  };

  const restart = (): void => {
    time = 0;
    dustTime = -1;
    dustMaterial.opacity = 0;
  };

  const updateDust = (): void => {
    const spread = 1 - Math.exp(-dustTime * 1.1);
    const fade = Math.max(0, 1 - dustTime / DUST_DURATION);
    for (let i = 0; i < DUST_COUNT; i += 1) {
      const radius = dustSpeed[i] * spread;
      dustPositions[i * 3] = Math.sin(dustAngle[i]) * radius;
      dustPositions[i * 3 + 1] = 0.1 + dustLift[i] * dustTime * Math.exp(-dustTime * 0.9);
      dustPositions[i * 3 + 2] = Math.cos(dustAngle[i]) * radius;
    }
    dustGeometry.attributes.position.needsUpdate = true;
    dustMaterial.opacity = 0.55 * fade;
  };

  const update = (deltaSeconds: number): void => {
    if (!shown) return;

    time += deltaSeconds;
    const cycle = descentSeconds + holdSeconds;
    if (time >= cycle) {
      if (loop) restart();
      else time = cycle;
    }

    const u = Math.min(time / descentSeconds, 1);
    const height = altitude * (1 - u) * (1 - u);
    body.position.y = height;
    body.rotation.x = Math.sin(time * 1.7) * 0.05 * (1 - u);
    body.rotation.z = Math.cos(time * 1.3) * 0.04 * (1 - u);

    const afterTouch = Math.max(0, time - descentSeconds);
    const engine = Math.max(0, 1 - afterTouch / 0.4);
    const length = (0.5 + Math.min(1, height / 6)) * 1.8 * engine;
    const flicker = 0.85 + Math.random() * 0.3;
    flame.visible = engine > 0.01;
    flame.scale.set(0.8 + 0.3 * Math.random(), Math.max(0.01, length * flicker), 0.8 + 0.3 * Math.random());
    flameMaterial.opacity = 0.85 * engine;
    flameLight.intensity = 8 * engine * flicker;

    if (dustTime < 0 && height < 10 && engine > 0) dustTime = 0;
    if (dustTime >= 0 && dustTime < DUST_DURATION + 1) {
      dustTime += deltaSeconds;
      updateDust();
    }
  };

  const setVisible = (value: boolean): void => {
    shown = value;
    root.visible = value;
    if (value) restart();
  };

  const toggle = (): boolean => {
    setVisible(!shown);
    return shown;
  };

  const dispose = (): void => {
    scene.remove(root);
    root.traverse((child) => {
      const item = child as THREE.Mesh;
      if (item.geometry) item.geometry.dispose();
      const material = item.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else if (material) material.dispose();
    });
  };

  setPosition(x, z);

  return {
    module: root,
    setPosition,
    setVisible,
    toggle,
    isVisible: () => shown,
    restart,
    update,
    dispose,
  };
}