import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export type Point = { x: number; z: number };

export type Building = {
  name: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  roof: THREE.Mesh;
};

export type NavGrid = { blocked: boolean[]; min: number; step: number; size: number };

export type City = {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  bridgeDeck: THREE.Mesh;
  blockers: THREE.Object3D[];
  buildings: Building[];
  gateMesh: THREE.Group;
  shortcutMesh: THREE.Group;
  chip: THREE.Group;
  secondaryPackage: THREE.Group;
  mina: THREE.Group;
  minaTag: THREE.Sprite;
  guards: Guard[];
  cameraUnit: THREE.Group;
  cameraCone: THREE.Mesh;
  car: Vehicle;
  player: Character;
  floorPlane: THREE.Plane;
  aimRay: THREE.Raycaster;
  decoys: THREE.Group[];
  bloodMarks: THREE.Mesh[];
  particles: THREE.Points;
  particlePositions: Float32Array;
  particleLife: Float32Array;
  buildingsByName: Map<string, Building>;
  navGrid: NavGrid;
};

export type Character = {
  group: THREE.Group;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  controller: RAPIER.KinematicCharacterController;
  position: THREE.Vector3;
  facing: number;
  health: number;
  alive: boolean;
  tint: THREE.MeshStandardMaterial;
  shadow: THREE.Mesh;
};

export type Guard = Character & {
  patrol: Point[];
  patrolIndex: number;
  state: 'patrol' | 'investigate' | 'search' | 'chase' | 'stunned' | 'down';
  memory: Point | null;
  stateUntil: number;
  attackClock: number;
  scanClock: number;
  initial: Point;
  kind: 'guard' | 'camera';
  route: Point[];
  routeIndex: number;
  pathClock: number;
};

export type Vehicle = {
  group: THREE.Group;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  controller: RAPIER.KinematicCharacterController;
  position: THREE.Vector3;
  yaw: number;
  speed: number;
  available: boolean;
};

const MAT = {
  ground: new THREE.MeshStandardMaterial({ color: 0x20292a, roughness: 1 }),
  asphalt: new THREE.MeshStandardMaterial({ color: 0x171f21, roughness: .94 }),
  sidewalk: new THREE.MeshStandardMaterial({ color: 0x344041, roughness: .9 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x475253, roughness: .91 }),
  concreteDark: new THREE.MeshStandardMaterial({ color: 0x293537, roughness: .92 }),
  wall: new THREE.MeshStandardMaterial({ color: 0x475250, roughness: .92 }),
  wallDeep: new THREE.MeshStandardMaterial({ color: 0x293337, roughness: .93 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x334043, roughness: .9 }),
  neonCyan: new THREE.MeshStandardMaterial({ color: 0x48e1df, emissive: 0x087f84, emissiveIntensity: 2.4, roughness: .4 }),
  neonPink: new THREE.MeshStandardMaterial({ color: 0xf08ba2, emissive: 0x853349, emissiveIntensity: 1.8, roughness: .4 }),
  amber: new THREE.MeshStandardMaterial({ color: 0xffbe6c, emissive: 0xb66424, emissiveIntensity: 1.2, roughness: .55 }),
  window: new THREE.MeshStandardMaterial({ color: 0x407076, emissive: 0x0c4e56, emissiveIntensity: 1.2, roughness: .3 }),
  player: new THREE.MeshStandardMaterial({ color: 0x91e1d6, roughness: .55 }),
  playerCoat: new THREE.MeshStandardMaterial({ color: 0x244e50, roughness: .72 }),
  guard: new THREE.MeshStandardMaterial({ color: 0xd26e5c, roughness: .65 }),
  guardArmor: new THREE.MeshStandardMaterial({ color: 0x7c363c, roughness: .6 }),
};

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function boxMesh(
  scene: THREE.Scene,
  world: RAPIER.World,
  blockers: THREE.Object3D[],
  position: Point & { y?: number },
  size: { x: number; y: number; z: number },
  material: THREE.Material,
  collide = true,
  rotationY = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.position.set(position.x, position.y ?? size.y / 2, position.z);
  mesh.rotation.y = rotationY;
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  scene.add(mesh);
  if (collide) {
    const collider = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
      .setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
      .setRotation({ x: 0, y: Math.sin(rotationY / 2), z: 0, w: Math.cos(rotationY / 2) });
    world.createCollider(collider);
    blockers.push(mesh);
  }
  return mesh;
}

function addStaticCircle(scene: THREE.Scene, x: number, z: number, radius: number, material: THREE.Material, y = .035): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 28), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  scene.add(mesh);
  return mesh;
}

function labelTexture(title: string, sub: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(5, 18, 21, .88)';
  ctx.fillRect(10, 12, 492, 168);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 12, 492, 168);
  ctx.fillStyle = color;
  ctx.font = '700 56px Arial Narrow, sans-serif';
  ctx.fillText(title.toUpperCase(), 30, 91);
  ctx.fillStyle = '#c6d9d5';
  ctx.font = '500 19px Arial, sans-serif';
  ctx.fillText(sub.toUpperCase(), 32, 139);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addBillboard(scene: THREE.Scene, title: string, sub: string, point: Point, color: string, scale = 4, height = 5.6): THREE.Sprite {
  const material = new THREE.SpriteMaterial({ map: labelTexture(title, sub, color), transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(point.x, height, point.z);
  sprite.scale.set(scale, scale * .38, 1);
  scene.add(sprite);
  return sprite;
}

function createBuilding(
  scene: THREE.Scene,
  world: RAPIER.World,
  blockers: THREE.Object3D[],
  name: string,
  point: Point,
  width: number,
  depth: number,
  height: number,
  mainColor: number,
  options: { door?: 'east' | 'south' | 'north' | 'west'; sideDoor?: boolean; sign?: string; accent?: THREE.Material } = {},
): Building {
  const wallMat = new THREE.MeshStandardMaterial({ color: mainColor, roughness: .9 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x73817c, roughness: .8 });
  const floor = boxMesh(scene, world, blockers, { x: point.x, z: point.z, y: -.015 }, { x: width, y: .16, z: depth }, MAT.concreteDark, false);
  floor.receiveShadow = false;
  const t = .45;
  const h = height;
  const halfW = width / 2;
  const halfD = depth / 2;
  const doorWidth = options.door ? (name === 'Dépôt logistique' ? 2.3 : 1.9) : 0;
  const wall = (x: number, z: number, sx: number, sz: number, material = wallMat) =>
    boxMesh(scene, world, blockers, { x, z, y: h / 2 }, { x: sx, y: h, z: sz }, material, true);

  wall(point.x, point.z - halfD, width, t);
  if (options.sideDoor) {
    const segment = Math.max(.8, (depth - 2.3) / 2);
    wall(point.x - halfW, point.z - (2.3 + segment) / 2, t, segment);
    wall(point.x - halfW, point.z + (2.3 + segment) / 2, t, segment);
  } else {
    wall(point.x - halfW, point.z, t, depth);
  }
  wall(point.x + halfW, point.z, t, depth);
  if (options.door === 'south') {
    const segment = Math.max(.8, (width - doorWidth) / 2);
    wall(point.x - (doorWidth + segment) / 2, point.z + halfD, segment, t);
    wall(point.x + (doorWidth + segment) / 2, point.z + halfD, segment, t);
  } else if (options.door === 'east') {
    const segment = Math.max(.8, (depth - doorWidth) / 2);
    wall(point.x + halfW, point.z - (doorWidth + segment) / 2, t, segment);
    wall(point.x + halfW, point.z + (doorWidth + segment) / 2, t, segment);
  } else if (options.door === 'west') {
    const segment = Math.max(.8, (depth - doorWidth) / 2);
    wall(point.x - halfW, point.z - (doorWidth + segment) / 2, t, segment);
    wall(point.x - halfW, point.z + (doorWidth + segment) / 2, t, segment);
  } else if (options.door === 'north') {
    const segment = Math.max(.8, (width - doorWidth) / 2);
    wall(point.x - (doorWidth + segment) / 2, point.z - halfD, segment, t);
    wall(point.x + (doorWidth + segment) / 2, point.z - halfD, segment, t);
  } else {
    wall(point.x, point.z + halfD, width, t);
  }
  const roof = boxMesh(scene, world, blockers, { x: point.x, z: point.z, y: h + .12 }, { x: width + .2, y: .24, z: depth + .2 }, MAT.roof.clone(), false);
  roof.userData.buildingName = name;
  const rim = boxMesh(scene, world, blockers, { x: point.x, z: point.z, y: h + .27 }, { x: width + .35, y: .08, z: .16 }, trimMat, false);
  rim.position.z = point.z - halfD + .1;
  if (options.sign) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(width * .66, 7), .9), options.accent ?? MAT.neonCyan);
    sign.position.set(point.x, 2.45, point.z + halfD + .07);
    scene.add(sign);
    addBillboard(scene, options.sign, 'accès de service', { x: point.x, z: point.z + halfD + .25 }, options.accent === MAT.neonPink ? '#f08ba2' : '#62e0df', Math.min(width, 8));
  }
  const ventCount = Math.max(1, Math.floor(width / 4));
  for (let i = 0; i < ventCount; i++) {
    const vent = boxMesh(scene, world, blockers, { x: point.x - width * .28 + i * width * .28, z: point.z - depth * .18, y: h + .33 }, { x: .9, y: .12, z: .65 }, MAT.concrete, false);
    vent.rotation.y = i % 2 ? .22 : -.18;
  }
  return { name, ...point, width, depth, roof };
}

function characterMesh(scene: THREE.Scene, color: THREE.MeshStandardMaterial, uniform = false): { group: THREE.Group; tint: THREE.MeshStandardMaterial; shadow: THREE.Mesh } {
  const group = new THREE.Group();
  const tint = color.clone();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.32, .5, 3, 7), tint);
  body.position.y = .79;
  body.castShadow = true;
  group.add(body);
  const coat = new THREE.Mesh(new THREE.BoxGeometry(.54, .48, .34), uniform ? MAT.guardArmor : MAT.playerCoat);
  coat.position.y = .79;
  group.add(coat);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.21, 9, 7), uniform ? MAT.concrete : MAT.player);
  head.position.set(0, 1.25, -.015);
  group.add(head);
  const facing = new THREE.Mesh(new THREE.BoxGeometry(.11, .13, .4), uniform ? MAT.amber : MAT.neonCyan);
  facing.position.set(0, 1.11, -.33);
  group.add(facing);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.52, 20), new THREE.MeshBasicMaterial({ color: 0x060c0d, transparent: true, opacity: .6, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = .026;
  scene.add(shadow);
  scene.add(group);
  return { group, tint, shadow };
}

function createCharacter(
  scene: THREE.Scene,
  world: RAPIER.World,
  point: Point,
  material: THREE.MeshStandardMaterial,
  uniform = false,
): Character {
  const pieces = characterMesh(scene, material, uniform);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(point.x, .9, point.z));
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(.44, .32).setFriction(0), body);
  const controller = world.createCharacterController(.035);
  controller.setMaxSlopeClimbAngle(.8);
  controller.setMinSlopeSlideAngle(1.1);
  return {
    ...pieces,
    body,
    collider,
    controller,
    position: v(point.x, .9, point.z),
    facing: 0,
    health: 100,
    alive: true,
  };
}

function createVehicle(scene: THREE.Scene, world: RAPIER.World, point: Point): Vehicle {
  const group = new THREE.Group();
  const chassisMat = new THREE.MeshStandardMaterial({ color: 0x172e32, metalness: .45, roughness: .45 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x326a70, emissive: 0x09272b, emissiveIntensity: 1.2, metalness: .2, roughness: .3 });
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.48, .48, 2.9), chassisMat);
  chassis.position.y = .51;
  group.add(chassis);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.12, .44, 1.22), glass);
  cabin.position.set(0, .9, .12);
  group.add(cabin);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.28, .15, .65), new THREE.MeshStandardMaterial({ color: 0x29474a, metalness: .4, roughness: .4 }));
  hood.position.set(0, .76, -1.02);
  group.add(hood);
  const headLamp = new THREE.Mesh(new THREE.BoxGeometry(.38, .09, .04), MAT.neonCyan);
  headLamp.position.set(-.42, .5, -1.47);
  group.add(headLamp);
  const headLamp2 = headLamp.clone();
  headLamp2.position.x = .42;
  group.add(headLamp2);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(.68, .09, .04), MAT.neonPink);
  tail.position.set(0, .5, 1.47);
  group.add(tail);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x101617, roughness: 1 });
  for (const x of [-.76, .76]) for (const z of [-.91, .91]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.31, .31, .19, 12), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, .34, z);
    group.add(wheel);
  }
  group.position.set(point.x, 0, point.z);
  scene.add(group);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(point.x, .57, point.z));
  const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(.8, .52, 1.5).setFriction(.25), body);
  const controller = world.createCharacterController(.06);
  controller.setMaxSlopeClimbAngle(.45);
  controller.setMinSlopeSlideAngle(1.1);
  return { group, body, collider, controller, position: v(point.x, .57, point.z), yaw: 0, speed: 0, available: true };
}

function createGuard(scene: THREE.Scene, world: RAPIER.World, point: Point, patrol: Point[]): Guard {
  const character = createCharacter(scene, world, point, MAT.guard, true);
  character.group.scale.set(.9, .9, .9);
  return {
    ...character,
    patrol,
    patrolIndex: 0,
    state: 'patrol',
    memory: null,
    stateUntil: 0,
    attackClock: 0,
    scanClock: Math.random() * 2,
    initial: { ...point },
    kind: 'guard',
    route: [],
    routeIndex: 0,
    pathClock: 0,
  };
}

function createPackage(scene: THREE.Scene, point: Point, color: number, scale = 1): THREE.Group {
  const group = new THREE.Group();
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(.48 * scale, .58 * scale, .08, 14), new THREE.MeshStandardMaterial({ color: 0x0c2023, emissive: color, emissiveIntensity: .45, roughness: .7 }));
  plinth.position.y = .08;
  group.add(plinth);
  const core = new THREE.Mesh(new THREE.BoxGeometry(.62 * scale, .38 * scale, .52 * scale), new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: .85, metalness: .2, roughness: .32 }));
  core.position.y = .46 * scale;
  group.add(core);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.62 * scale, .025, 5, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .75 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = .3 * scale;
  group.add(ring);
  group.position.set(point.x, 0, point.z);
  scene.add(group);
  return group;
}

export function buildCity(container: HTMLElement, world: RAPIER.World): City {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c191c);
  scene.fog = new THREE.FogExp2(0x0c191c, .013);
  const camera = new THREE.OrthographicCamera(-27, 27, 27, -27, .1, 180);
  camera.position.set(0, 51, 31);
  camera.lookAt(0, 0, 0);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.45));
  renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.17;
  renderer.shadowMap.enabled = false;
  renderer.domElement.setAttribute('aria-label', 'Vue du quartier des Forges');
  container.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0x9ac5c4, 0x11191b, 1.2));
  const moon = new THREE.DirectionalLight(0xb6d5d0, 1.45);
  moon.position.set(-22, 36, 19);
  scene.add(moon);
  const cyanLight = new THREE.PointLight(0x14bec9, 18, 24, 2);
  cyanLight.position.set(-20, 5, 18);
  scene.add(cyanLight);
  const pinkLight = new THREE.PointLight(0xd7527e, 12, 18, 2);
  pinkLight.position.set(21, 4, -14);
  scene.add(pinkLight);
  const blocks: THREE.Object3D[] = [];
  const buildings: Building[] = [];

  boxMesh(scene, world, blocks, { x: 0, z: 0, y: -.25 }, { x: 68, y: .5, z: 68 }, MAT.ground, true);
  for (const edge of [-33.5, 33.5]) {
    boxMesh(scene, world, blocks, { x: edge, z: 0, y: 2 }, { x: .7, y: 4, z: 68 }, MAT.concreteDark, true);
    boxMesh(scene, world, blocks, { x: 0, z: edge, y: 2 }, { x: 68, y: 4, z: .7 }, MAT.concreteDark, true);
  }
  // The street grid leaves six traversable blocks around the main route.
  for (const z of [-21, -5, 10, 25]) {
    boxMesh(scene, world, blocks, { x: 0, z, y: .008 }, { x: 66, y: .02, z: z === -21 ? 7 : 7.5 }, MAT.asphalt, false);
    for (let x = -30; x < 30; x += 7) {
      boxMesh(scene, world, blocks, { x: x + 2, z, y: .022 }, { x: 3.3, y: .012, z: .075 }, new THREE.MeshBasicMaterial({ color: 0x596260, transparent: true, opacity: .42 }), false);
    }
  }
  for (const x of [-25, -8, 9, 25]) {
    boxMesh(scene, world, blocks, { x, z: 0, y: .012 }, { x: x === 9 ? 7.5 : 6.2, y: .02, z: 66 }, MAT.asphalt, false);
    for (let z = -30; z < 30; z += 7) {
      boxMesh(scene, world, blocks, { x, z: z + 2, y: .024 }, { x: .07, y: .012, z: 3.2 }, new THREE.MeshBasicMaterial({ color: 0x596260, transparent: true, opacity: .36 }), false);
    }
  }
  // Railway trench and the two-level road bridge. The dark channel reads as a lower passage.
  const bridgeDeck = boxMesh(scene, world, blocks, { x: 0, z: 10, y: 3.25 }, { x: 67, y: .65, z: 6.8 }, new THREE.MeshStandardMaterial({ color: 0x374448, roughness: .8 }), true);
  boxMesh(scene, world, blocks, { x: 0, z: 10, y: 3.62 }, { x: 67, y: .08, z: .17 }, MAT.concrete, false);
  for (const x of [-23, -14, 0, 15, 24]) {
    boxMesh(scene, world, blocks, { x, z: 10, y: 1.48 }, { x: .7, y: 2.95, z: .8 }, MAT.concreteDark, true);
  }
  for (const x of [-27, -24, -21, -18, -15, -12, -9, -6, -3, 0, 3, 6, 9, 12, 15, 18, 21, 24, 27]) {
    boxMesh(scene, world, blocks, { x, z: 6.48, y: 3.35 }, { x: 1.65, y: .13, z: .25 }, MAT.amber, false);
    boxMesh(scene, world, blocks, { x, z: 13.52, y: 3.35 }, { x: 1.65, y: .13, z: .25 }, MAT.amber, false);
  }
  // Rails beneath the overpass; the release lane stays open in the middle.
  for (const x of [-1.05, .8]) {
    boxMesh(scene, world, blocks, { x, z: 9.95, y: .07 }, { x: .17, y: .12, z: 11 }, new THREE.MeshStandardMaterial({ color: 0x718184, metalness: .7, roughness: .42 }), false);
  }
  for (let z = 5; z < 16; z += 1.6) {
    boxMesh(scene, world, blocks, { x: -.1, z, y: .045 }, { x: 3.2, y: .08, z: .2 }, new THREE.MeshStandardMaterial({ color: 0x3d4848 }), false);
  }
  addBillboard(scene, 'Passage inférieur', 'voie piétonne', { x: 8.8, z: 13.4 }, '#f1b66c', 6.5, 2.25);
  addBillboard(scene, 'Voie haute', 'pont routier', { x: -10, z: 9.8 }, '#9ec2bd', 5.4, 5.8);

  // A handful of low-detail blocks make the Forges legible without closing its shortcuts.
  buildings.push(createBuilding(scene, world, blocks, 'Garage de Mina', { x: -19, z: 18.2 }, 10, 8, 3.5, 0x354347, { door: 'east', sign: 'Mina / Garage', accent: MAT.neonPink }));
  buildings.push(createBuilding(scene, world, blocks, 'Atelier mécanique', { x: -18.2, z: -14.2 }, 11, 10, 4.2, 0x3c4646, { door: 'south' }));
  buildings.push(createBuilding(scene, world, blocks, 'Dépôt logistique', { x: 21, z: -15 }, 13, 12, 4.8, 0x3d4746, { door: 'south', sideDoor: true, sign: 'Transit / 09', accent: MAT.neonCyan }));
  buildings.push(createBuilding(scene, world, blocks, 'Imprimerie', { x: -17, z: 1.8 }, 13, 9, 4.1, 0x343f41, { door: 'west' }));
  buildings.push(createBuilding(scene, world, blocks, 'Résidence des voies', { x: 0, z: -14.4 }, 10, 9, 5.5, 0x3c4648, { door: 'south' }));
  buildings.push(createBuilding(scene, world, blocks, 'Clinique de quartier', { x: 18.5, z: 1.5 }, 11, 10, 4.8, 0x384648, { door: 'north' }));
  buildings.push(createBuilding(scene, world, blocks, 'Hall de livraison', { x: 0, z: 18.4 }, 9, 7, 3.9, 0x394445, { door: 'north' }));
  buildings.push(createBuilding(scene, world, blocks, 'Silo 4', { x: 18.7, z: 18.4 }, 9.5, 8.1, 6.1, 0x394346, { door: 'west' }));
  buildings.push(createBuilding(scene, world, blocks, 'Ancien central', { x: 17.4, z: -30 }, 11, 7, 6.6, 0x364247, { door: 'south' }));
  buildings.push(createBuilding(scene, world, blocks, 'Entrepôt bas', { x: -17.5, z: -30 }, 12, 7, 4.7, 0x3b4443, { door: 'south' }));

  // Surface detail: curb strips, loading bays, pavers, light wells and the depot's two approaches.
  for (const z of [-17.25, -10.4, -1, 13.7, 21.3]) {
    boxMesh(scene, world, blocks, { x: -8, z, y: .055 }, { x: .22, y: .08, z: 2.4 }, MAT.concrete, false);
    boxMesh(scene, world, blocks, { x: 8.6, z, y: .055 }, { x: .22, y: .08, z: 2.4 }, MAT.concrete, false);
  }
  for (let i = 0; i < 5; i++) {
    boxMesh(scene, world, blocks, { x: 18.5 + i * 1.3, z: -8.62, y: .04 }, { x: .78, y: .045, z: .14 }, MAT.amber, false);
  }
  // North-south service lane into the depot court.
  boxMesh(scene, world, blocks, { x: 13.65, z: -15, y: .025 }, { x: 2.3, y: .035, z: 15 }, MAT.asphalt, false);
  for (let z = -21; z < -8; z += 2) {
    boxMesh(scene, world, blocks, { x: 12.52, z, y: .03 }, { x: .12, y: .04, z: 1.1 }, MAT.amber, false);
  }
  // Courtyard fence with a hackable opening at the warehouse wall.
  const gateMesh = new THREE.Group();
  const gateMat = new THREE.MeshStandardMaterial({ color: 0xf1b66c, emissive: 0x754515, emissiveIntensity: .72, metalness: .55, roughness: .45 });
  for (let i = 0; i < 7; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(.075, 1.75, .075), gateMat);
    bar.position.set(0, .88, -1.05 + i * .35);
    gateMesh.add(bar);
  }
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, 2.4), gateMat);
  topBar.position.set(0, 1.72, 0);
  gateMesh.add(topBar);
  gateMesh.position.set(14.45, 0, -15);
  scene.add(gateMesh);
  const gateCollider = world.createCollider(RAPIER.ColliderDesc.cuboid(.11, .9, 1.25).setTranslation(14.45, .9, -15));
  gateMesh.userData.collider = gateCollider;
  blocks.push(gateMesh);

  // Mina's service shortcut stays physically sealed until the delivery.
  const shortcutMesh = new THREE.Group();
  const serviceDoor = new THREE.Mesh(new THREE.BoxGeometry(.26, 2.2, 2.2), new THREE.MeshStandardMaterial({ color: 0x47645e, emissive: 0x173b35, emissiveIntensity: .42, metalness: .3 }));
  serviceDoor.position.y = 1.1;
  shortcutMesh.add(serviceDoor);
  for (let i = 0; i < 5; i++) {
    const slit = new THREE.Mesh(new THREE.BoxGeometry(.28, .05, .14), MAT.neonPink);
    slit.position.set(.17, .62 + i * .27, 0);
    shortcutMesh.add(slit);
  }
  shortcutMesh.position.set(-7.9, 0, 17.3);
  scene.add(shortcutMesh);
  const shortcutCollider = world.createCollider(RAPIER.ColliderDesc.cuboid(.24, 1.1, 1.1).setTranslation(-7.9, 1.1, 17.3));
  shortcutMesh.userData.collider = shortcutCollider;
  blocks.push(shortcutMesh);

  // Street lamps are emissive pools rather than expensive dynamic shadow casters.
  for (const [x, z, color] of [[-23, 11, 0x46dce2], [1, -4, 0x46dce2], [8, -17, 0xe9829a], [22, 10, 0xe9bb71], [-8, 22, 0x46dce2], [8, 20, 0x46dce2]] as const) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.07, .1, 4.7, 6), MAT.concrete);
    post.position.set(x, 2.35, z);
    scene.add(post);
    const lampMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.18, 8, 6), lampMat);
    lamp.position.set(x, 4.68, z);
    scene.add(lamp);
    const spot = new THREE.PointLight(color, 6, 13, 2);
    spot.position.set(x, 4.4, z);
    scene.add(spot);
    addStaticCircle(scene, x, z, 3.1, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .035, depthWrite: false }), .01);
  }
  // Roadside details: containers, bollards, benches and barriers that make cover readable.
  const steel = new THREE.MeshStandardMaterial({ color: 0x566260, metalness: .36, roughness: .72 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x82584a, roughness: .84 });
  for (const [x, z] of [[-10.7, -16.6], [-11.1, -13.3], [26.8, -3.4], [-27.9, 23.3], [1.1, -9.1]] as const) {
    boxMesh(scene, world, blocks, { x, z, y: .86 }, { x: 1.4, y: 1.7, z: .8 }, rust, true);
    boxMesh(scene, world, blocks, { x, z: .2 + .86 }, { x: 1.42, y: .08, z: .84 }, steel, false);
    for (let line = 0; line < 4; line++) boxMesh(scene, world, blocks, { x: x - .5 + line * .32, z: z + .42, y: .83 }, { x: .035, y: 1.25, z: .026 }, steel, false);
  }
  for (const [x, z] of [[-12.1, 22], [2.2, 8.4], [26, -8.8], [-29, -3.5], [12.9, -9.9]] as const) {
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(.13, .16, .85, 8), MAT.concrete);
    bollard.position.set(x, .43, z);
    scene.add(bollard);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, .12, 8), MAT.amber);
    cap.position.set(x, .84, z);
    scene.add(cap);
  }

  const player = createCharacter(scene, world, { x: -20.5, z: 19.2 }, MAT.player);
  const mina = new THREE.Group();
  const minaBody = new THREE.Mesh(new THREE.CapsuleGeometry(.31, .5, 3, 8), MAT.neonPink);
  minaBody.position.y = .78;
  mina.add(minaBody);
  const minaHead = new THREE.Mesh(new THREE.SphereGeometry(.21, 9, 7), new THREE.MeshStandardMaterial({ color: 0xdab4a3, roughness: .8 }));
  minaHead.position.y = 1.25;
  mina.add(minaHead);
  const wrench = new THREE.Mesh(new THREE.BoxGeometry(.09, .45, .09), MAT.concrete);
  wrench.position.set(.35, .8, -.05);
  mina.add(wrench);
  mina.position.set(-18.2, 0, 20);
  scene.add(mina);
  const minaTag = addBillboard(scene, 'Mina', 'mécanique / relais', { x: -18.2, z: 20 }, '#f08ba2', 2.8, 5.1);

  const chip = createPackage(scene, { x: 21.7, z: -15.4 }, 0x54f1dc, .7);
  const secondaryPackage = createPackage(scene, { x: -3.1, z: 7.1 }, 0xf1b66c, .82);
  const car = createVehicle(scene, world, { x: -22.1, z: 18.4 });
  car.yaw = -Math.PI / 2;
  car.group.rotation.y = car.yaw;

  const guards: Guard[] = [
    createGuard(scene, world, { x: 18.3, z: -12.2 }, [
      { x: 18.3, z: -12.2 }, { x: 23.7, z: -12.1 }, { x: 23.2, z: -17.4 }, { x: 17.1, z: -17.8 },
    ]),
    createGuard(scene, world, { x: 23.5, z: -18.1 }, [
      { x: 23.5, z: -18.1 }, { x: 25.2, z: -13.2 }, { x: 20.4, z: -11.4 }, { x: 17.4, z: -15.4 },
    ]),
  ];
  const cameraUnit = new THREE.Group();
  const cameraStand = new THREE.Mesh(new THREE.CylinderGeometry(.1, .16, 1.3, 7), steel);
  cameraStand.position.y = .65;
  cameraUnit.add(cameraStand);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(.5, .3, .65), new THREE.MeshStandardMaterial({ color: 0x29373a, metalness: .4, roughness: .4 }));
  housing.position.set(0, 1.35, -.2);
  cameraUnit.add(housing);
  const lens = new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 7), MAT.neonPink);
  lens.position.set(0, 1.35, -.53);
  cameraUnit.add(lens);
  cameraUnit.position.set(20, 0, -8.6);
  scene.add(cameraUnit);
  const coneGeo = new THREE.BufferGeometry();
  const coneVerts = new Float32Array([0, .035, 0, -5, .035, -13, 5, .035, -13]);
  coneGeo.setAttribute('position', new THREE.BufferAttribute(coneVerts, 3));
  coneGeo.setIndex([0, 1, 2]);
  coneGeo.computeVertexNormals();
  const cameraCone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xf06b80, transparent: true, opacity: .08, side: THREE.DoubleSide, depthWrite: false }));
  cameraCone.position.set(20, 0, -8.6);
  scene.add(cameraCone);

  // Recovery corridor shutter: two anchor walls leave a 2.2m gap for the persistent gate.
  boxMesh(scene, world, blocks, { x: -7.9, z: 14.6, y: 1.05 }, { x: .32, y: 2.1, z: 3.1 }, MAT.concreteDark, true);
  boxMesh(scene, world, blocks, { x: -7.9, z: 20.2, y: 1.05 }, { x: .32, y: 2.1, z: 2.8 }, MAT.concreteDark, true);

  const decoys: THREE.Group[] = [];
  for (let i = 0; i < 5; i++) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.32 + i * .16, .018, 4, 32), new THREE.MeshBasicMaterial({ color: 0x7bdeed, transparent: true, opacity: .45 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = .08 + i * .04;
    group.add(ring);
    group.visible = false;
    scene.add(group);
    decoys.push(group);
  }

  const particlePositions = new Float32Array(72 * 3);
  const particleLife = new Float32Array(72);
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  const particles = new THREE.Points(particleGeometry, new THREE.PointsMaterial({ color: 0xf26368, size: .13, transparent: true, opacity: .9, depthWrite: false }));
  scene.add(particles);
  const bloodMarks: THREE.Mesh[] = [];
  for (let i = 0; i < 14; i++) {
    const mark = new THREE.Mesh(new THREE.CircleGeometry(.14 + Math.random() * .17, 10), new THREE.MeshBasicMaterial({ color: 0x8d1f2e, transparent: true, opacity: .55, depthWrite: false }));
    mark.rotation.x = -Math.PI / 2;
    mark.visible = false;
    mark.position.y = .028;
    scene.add(mark);
    bloodMarks.push(mark);
  }

  return {
    scene, camera, renderer, bridgeDeck, blockers: blocks, buildings, gateMesh, shortcutMesh, chip, secondaryPackage,
    mina, minaTag, guards, cameraUnit, cameraCone, car, player, floorPlane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    aimRay: new THREE.Raycaster(), decoys, bloodMarks, particles, particlePositions, particleLife,
    buildingsByName: new Map(buildings.map((building) => [building.name, building])),
    navGrid: { blocked: [], min: -31.5, step: 1.5, size: 43 },
  };
}

export function refreshNavigation(city: City): void {
  const { min, step, size } = city.navGrid;
  const obstacles: THREE.Box3[] = [];
  for (const object of city.blockers) {
    if (!object.visible) continue;
    object.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
    else object.traverse((child) => { if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh); });
    for (const mesh of meshes) {
      if (!mesh.visible) continue;
      const bounds = new THREE.Box3().setFromObject(mesh);
      if (bounds.max.y < .35 || bounds.min.y > 1.85) continue;
      if (bounds.max.x - bounds.min.x > 60 || bounds.max.z - bounds.min.z > 60) continue;
      obstacles.push(bounds);
    }
  }
  const blocked = new Array<boolean>(size * size).fill(false);
  for (let iz = 0; iz < size; iz++) {
    const z = min + iz * step;
    for (let ix = 0; ix < size; ix++) {
      const x = min + ix * step;
      blocked[iz * size + ix] = obstacles.some((b) => x > b.min.x - .49 && x < b.max.x + .49 && z > b.min.z - .49 && z < b.max.z + .49);
    }
  }
  city.navGrid.blocked = blocked;
}

export function updateActorVisual(actor: Character): void {
  actor.group.position.set(actor.position.x, 0, actor.position.z);
  actor.group.rotation.y = actor.facing;
  actor.shadow.position.x = actor.position.x;
  actor.shadow.position.z = actor.position.z;
  actor.shadow.visible = actor.alive;
}

export function flashBlood(city: City, point: Point, now: number): void {
  const slots = city.particleLife;
  const values = city.particlePositions;
  for (let i = 0; i < 9; i++) {
    const index = (Math.random() * slots.length) | 0;
    slots[index] = 0.34 + Math.random() * .4;
    values[index * 3] = point.x + (Math.random() - .5) * .72;
    values[index * 3 + 1] = .3 + Math.random() * .8;
    values[index * 3 + 2] = point.z + (Math.random() - .5) * .72;
  }
  city.particles.geometry.attributes.position.needsUpdate = true;
  const mark = city.bloodMarks.find((entry) => !entry.visible) ?? city.bloodMarks[(Math.random() * city.bloodMarks.length) | 0];
  mark.visible = true;
  mark.position.set(point.x, .03, point.z);
  mark.userData.expires = now + 22;
}

export function animateEffects(city: City, dt: number, now: number): void {
  for (let i = 0; i < city.particleLife.length; i++) {
    if (city.particleLife[i] <= 0) continue;
    city.particleLife[i] -= dt;
    city.particlePositions[i * 3 + 1] += dt * 1.9;
    city.particlePositions[i * 3] += Math.sin(now * 17 + i) * dt * .5;
    if (city.particleLife[i] <= 0) city.particlePositions[i * 3 + 1] = -20;
  }
  city.particles.geometry.attributes.position.needsUpdate = true;
  for (const mark of city.bloodMarks) if (mark.visible && now > (mark.userData.expires as number)) mark.visible = false;
  for (const decoy of city.decoys) {
    if (!decoy.visible) continue;
    const elapsed = now - (decoy.userData.started as number);
    decoy.scale.setScalar(1 + elapsed * .22);
    decoy.children.forEach((ring, index) => {
      (ring as THREE.Mesh).material instanceof THREE.MeshBasicMaterial && (((ring as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = Math.max(0, .52 - elapsed * .06 - index * .045));
    });
    if (elapsed > 8) decoy.visible = false;
  }
}

export function resizeCity(city: City, width: number, height: number): void {
  city.renderer.setSize(width, height, false);
  const viewHeight = height < 540 ? 39 : 45;
  const aspect = Math.max(.5, width / Math.max(height, 1));
  city.camera.left = -viewHeight * aspect / 2;
  city.camera.right = viewHeight * aspect / 2;
  city.camera.top = viewHeight / 2;
  city.camera.bottom = -viewHeight / 2;
  city.camera.updateProjectionMatrix();
}
