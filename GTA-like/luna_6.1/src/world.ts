import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { FORGES, ROAD_JUNCTIONS, ROAD_ROUTES, TRAFFIC_ROUTES, groundHeightAt } from './layout';

export type Point = { x: number; z: number };
export type VehicleModel = 'compact' | 'sport' | 'van';

export type Building = {
  name: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  groundY: number;
  roof: THREE.Mesh;
};

export type NavGrid = { blocked: boolean[]; heights: Float32Array; minX: number; minZ: number; step: number; width: number; height: number };

export type City = {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  bridgeDeck: THREE.Mesh;
  railDeck: THREE.Mesh;
  blockers: THREE.Object3D[];
  buildings: Building[];
  gateMesh: THREE.Group;
  shortcutMesh: THREE.Group;
  chip: THREE.Group;
  secondaryPackage: THREE.Group;
  mina: THREE.Group;
  minaTag: THREE.Sprite;
  guards: Guard[];
  citizens: Citizen[];
  cameraUnit: THREE.Group;
  cameraCone: THREE.Mesh;
  car: Vehicle;
  playerVehicles: Vehicle[];
  controlledVehicle: Vehicle | null;
  traffic: TrafficVehicle[];
  pursuitVehicles: PursuitVehicle[];
  trafficRouteMeshes: THREE.Group[];
  servicePanel: THREE.Group;
  breakables: Breakable[];
  streetLights: THREE.PointLight[];
  shaderMaterials: THREE.ShaderMaterial[];
  activityPhase: number;
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
  limbs: THREE.Group[];
  walking: boolean;
  animClock: number;
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
  model: VehicleModel;
  modelName: string;
  maxSpeed: number;
  acceleration: number;
  steering: number;
  halfWidth: number;
  halfLength: number;
  damageMarks: THREE.Mesh[];
  impactCount: number;
  contactHandles: Set<number>;
};

export type Citizen = {
  group: THREE.Group;
  shadow: THREE.Mesh;
  limbs: THREE.Group[];
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  controller: RAPIER.KinematicCharacterController;
  position: Point;
  routeSets: [Point[], Point[], Point[]];
  route: Point[];
  routeIndex: number;
  phaseIndex: number;
  speed: number;
  pauseUntil: number;
  gait: number;
  startledUntil: number;
  panicTarget: Point | null;
  fallenUntil: number;
  alive: boolean;
};

export type TrafficVehicle = Vehicle & { route: Point[]; routeIndex: number; direction: 1 | -1; cruiseSpeed: number; laneOffset: number; baseLaneOffset: number; pauseUntil: number; hijacked: boolean; stuckSeconds: number };
export type PursuitVehicle = Vehicle & { spawn: Point; active: boolean; route: Point[]; routeIndex: number; replanClock: number; stuckSeconds: number; lightbar: THREE.Group; lastSeenTarget: Point | null; lastSeenAt: number };

export type Breakable = { mesh: THREE.Group; collider: RAPIER.Collider; kind: 'crate' | 'bollard'; durability: number; broken: boolean };

export function trafficOccludesLine(city: City, from: Point, to: Point, observerHeight = 1.15, targetHeight = 1): boolean {
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  if (length < .5) return false;
  const steps = Math.ceil(length / .45);
  const fromFloor = groundHeightAt(from);
  const toFloor = groundHeightAt(to);
  for (const vehicle of city.traffic) {
    if (vehicle === city.controlledVehicle || vehicle.hijacked || !vehicle.available || !vehicle.group.visible) continue;
    const carFloor = groundHeightAt({ x: vehicle.position.x, z: vehicle.position.z });
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = THREE.MathUtils.lerp(from.x, to.x, t);
      const z = THREE.MathUtils.lerp(from.z, to.z, t);
      const sightHeight = THREE.MathUtils.lerp(fromFloor + observerHeight, toFloor + targetHeight, t);
      if (sightHeight < carFloor + .08 || sightHeight > carFloor + 1.5) continue;
      const dx = x - vehicle.position.x;
      const dz = z - vehicle.position.z;
      const localX = Math.cos(vehicle.yaw) * dx + Math.sin(vehicle.yaw) * dz;
      const localZ = -Math.sin(vehicle.yaw) * dx + Math.cos(vehicle.yaw) * dz;
      if (Math.abs(localX) <= vehicle.halfWidth + .18 && Math.abs(localZ) <= vehicle.halfLength + .22) return true;
    }
  }
  return false;
}

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
  options: { door?: 'east' | 'south' | 'north' | 'west'; sideDoor?: 'east' | 'west'; sign?: string; accent?: THREE.Material; groundY?: number; doorWidth?: number } = {},
): Building {
  const wallMat = new THREE.MeshStandardMaterial({ color: mainColor, roughness: .9 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x73817c, roughness: .8 });
  const groundY = options.groundY ?? 6;
  const floor = boxMesh(scene, world, blockers, { x: point.x, z: point.z, y: groundY - .015 }, { x: width, y: .16, z: depth }, MAT.concreteDark, false);
  floor.receiveShadow = false;
  const t = .45;
  const h = height;
  const halfW = width / 2;
  const halfD = depth / 2;
  const doorWidth = options.doorWidth ?? (name === 'Dépôt logistique' ? 4.8 : name === 'Garage de Mina' ? 5.2 : options.door ? 2.6 : 0);
  const wall = (x: number, z: number, sx: number, sz: number, material = wallMat) =>
    boxMesh(scene, world, blockers, { x, z, y: groundY + h / 2 }, { x: sx, y: h, z: sz }, material, true);
  const splitX = (z: number, opening: number) => {
    if (!opening) { wall(point.x, z, width, t); return; }
    const segment = Math.max(0, (width - opening) / 2);
    if (segment > .2) {
      wall(point.x - (opening + segment) / 2, z, segment, t);
      wall(point.x + (opening + segment) / 2, z, segment, t);
    }
  };
  const splitZ = (x: number, opening: number) => {
    if (!opening) { wall(x, point.z, t, depth); return; }
    const segment = Math.max(0, (depth - opening) / 2);
    if (segment > .2) {
      wall(x, point.z - (opening + segment) / 2, t, segment);
      wall(x, point.z + (opening + segment) / 2, t, segment);
    }
  };
  splitX(point.z - halfD, options.door === 'north' ? doorWidth : 0);
  splitX(point.z + halfD, options.door === 'south' ? doorWidth : 0);
  splitZ(point.x - halfW, options.sideDoor === 'west' ? 3.2 : options.door === 'west' ? doorWidth : 0);
  splitZ(point.x + halfW, options.sideDoor === 'east' ? 3.2 : options.door === 'east' ? doorWidth : 0);
  const roof = boxMesh(scene, world, blockers, { x: point.x, z: point.z, y: groundY + h + .12 }, { x: width + .2, y: .24, z: depth + .2 }, MAT.roof.clone(), false);
  roof.userData.buildingName = name;
  const rim = boxMesh(scene, world, blockers, { x: point.x, z: point.z, y: groundY + h + .27 }, { x: width + .35, y: .08, z: .16 }, trimMat, false);
  rim.position.z = point.z - halfD + .1;
  if (options.sign) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(width * .66, 7), .9), options.accent ?? MAT.neonCyan);
    sign.position.set(point.x, groundY + 2.45, point.z - halfD - .07);
    sign.rotation.y = Math.PI;
    scene.add(sign);
    addBillboard(scene, options.sign, 'accès de service', { x: point.x, z: point.z - halfD - .25 }, options.accent === MAT.neonPink ? '#f08ba2' : '#62e0df', Math.min(width, 8), groundY + h + .8);
  }
  const ventCount = Math.max(1, Math.floor(width / 4));
  for (let i = 0; i < ventCount; i++) {
    const vent = boxMesh(scene, world, blockers, { x: point.x - width * .28 + i * width * .28, z: point.z - depth * .18, y: groundY + h + .33 }, { x: .9, y: .12, z: .65 }, MAT.concrete, false);
    vent.rotation.y = i % 2 ? .22 : -.18;
  }
  return { name, ...point, width, depth, groundY, roof };
}

function characterMesh(scene: THREE.Scene, color: THREE.MeshStandardMaterial, uniform = false): { group: THREE.Group; tint: THREE.MeshStandardMaterial; shadow: THREE.Mesh; limbs: THREE.Group[] } {
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
  const limbMat = uniform ? MAT.guardArmor : new THREE.MeshStandardMaterial({ color: 0x344544, roughness: .82 });
  const limbs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * .14, .61, 0);
    const legMesh = new THREE.Mesh(new THREE.BoxGeometry(.17, .46, .2), limbMat);
    legMesh.position.y = -.23;
    leg.add(legMesh);
    group.add(leg);
    limbs.push(leg);
  }
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * .31, 1.02, 0);
    const armMesh = new THREE.Mesh(new THREE.BoxGeometry(.15, .4, .17), tint);
    armMesh.position.y = -.18;
    arm.add(armMesh);
    group.add(arm);
    limbs.push(arm);
  }
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.52, 20), new THREE.MeshBasicMaterial({ color: 0x060c0d, transparent: true, opacity: .6, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = .026;
  scene.add(shadow);
  scene.add(group);
  return { group, tint, shadow, limbs };
}

function createCharacter(
  scene: THREE.Scene,
  world: RAPIER.World,
  point: Point,
  material: THREE.MeshStandardMaterial,
  uniform = false,
): Character {
  const pieces = characterMesh(scene, material, uniform);
  const y = groundHeightAt(point) + .9;
  pieces.group.position.set(point.x, y - .9, point.z);
  pieces.shadow.position.set(point.x, groundHeightAt(point) + .026, point.z);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(point.x, y, point.z));
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(.44, .32).setFriction(0), body);
  const controller = world.createCharacterController(.035);
  controller.setMaxSlopeClimbAngle(.8);
  controller.setMinSlopeSlideAngle(1.1);
  return {
    ...pieces,
    body,
    collider,
    controller,
    position: v(point.x, y, point.z),
    facing: 0,
    health: 100,
    alive: true,
    walking: false,
    animClock: Math.random() * Math.PI * 2,
  };
}

const VEHICLE_MODELS: Record<VehicleModel, { name: string; color: number; width: number; length: number; cabinHeight: number; maxSpeed: number; acceleration: number; steering: number }> = {
  compact: { name: 'Compacte électrique', color: 0x253b3b, width: 1.48, length: 2.9, cabinHeight: .44, maxSpeed: 9.1, acceleration: 8.6, steering: 1.6 },
  sport: { name: 'Sportive des Forges', color: 0x284b58, width: 1.62, length: 3.45, cabinHeight: .34, maxSpeed: 11.5, acceleration: 10.2, steering: 1.45 },
  van: { name: 'Fourgon d’atelier', color: 0x6f5841, width: 1.82, length: 3.8, cabinHeight: .68, maxSpeed: 7.8, acceleration: 7.1, steering: 1.25 },
};

function createVehicle(scene: THREE.Scene, world: RAPIER.World, point: Point, color?: number, model: VehicleModel = 'compact'): Vehicle {
  const spec = VEHICLE_MODELS[model];
  const bodyColor = color ?? spec.color;
  const halfWidth = spec.width / 2;
  const halfLength = spec.length / 2;
  const group = new THREE.Group();
  const chassisMat = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: .45, roughness: .45 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x326a70, emissive: 0x09272b, emissiveIntensity: 1.2, metalness: .2, roughness: .3 });
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(spec.width, .48, spec.length), chassisMat);
  chassis.position.y = .51;
  group.add(chassis);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.width * .76, spec.cabinHeight, spec.length * (model === 'van' ? .48 : .43)), glass);
  cabin.position.set(0, .75 + spec.cabinHeight / 2, model === 'van' ? .14 : .06);
  group.add(cabin);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(spec.width * .86, .15, spec.length * .22), new THREE.MeshStandardMaterial({ color: model === 'sport' ? 0x367a80 : 0x29474a, metalness: .4, roughness: .4 }));
  hood.position.set(0, .76, -spec.length * .34);
  group.add(hood);
  const headLamp = new THREE.Mesh(new THREE.BoxGeometry(.38, .09, .04), MAT.neonCyan);
  headLamp.position.set(-halfWidth * .56, .5, -halfLength);
  group.add(headLamp);
  const headLamp2 = headLamp.clone();
  headLamp2.position.x = halfWidth * .56;
  group.add(headLamp2);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(spec.width * .54, .09, .04), MAT.neonPink);
  tail.position.set(0, .5, halfLength);
  group.add(tail);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x101617, roughness: 1 });
  for (const x of [-halfWidth * .98, halfWidth * .98]) for (const z of [-halfLength * .64, halfLength * .64]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.31, .31, .19, 12), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, .34, z);
    group.add(wheel);
  }
  const damageMat = new THREE.MeshStandardMaterial({ color: 0x171a1a, roughness: .9, metalness: .1 });
  const damageMarks: THREE.Mesh[] = [];
  for (const [side, end, segment] of [[-1, -1, -.22], [1, -1, -.22], [0, -1, -.23], [-1, 0, -.16], [-1, 0, .16], [1, 0, -.16], [1, 0, .16], [-1, 1, -.22], [1, 1, -.22], [0, 1, -.23]] as const) {
    const isSide = end === 0;
    const x = isSide ? side * halfWidth : side * halfWidth * .48;
    const z = isSide ? segment * halfLength * 1.65 : end * (halfLength + .015);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(isSide ? .035 : .26, .17, isSide ? .23 : .035), damageMat);
    mark.position.set(x, .53, z);
    if (isSide) mark.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    mark.visible = false;
    group.add(mark);
    damageMarks.push(mark);
  }
  const groundY = groundHeightAt(point);
  group.position.set(point.x, groundY, point.z);
  scene.add(group);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(point.x, groundY + .57, point.z));
  const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(halfWidth + .06, .52, halfLength + .06).setFriction(.25), body);
  const controller = world.createCharacterController(.06);
  controller.setMaxSlopeClimbAngle(.45);
  controller.setMinSlopeSlideAngle(1.1);
  return {
    group, body, collider, controller, position: v(point.x, groundY + .57, point.z), yaw: 0, speed: 0,
    available: true, model, modelName: spec.name, maxSpeed: spec.maxSpeed, acceleration: spec.acceleration, steering: spec.steering,
    halfWidth, halfLength, damageMarks, impactCount: 0, contactHandles: new Set(),
  };
}

function createPursuitVehicle(scene: THREE.Scene, world: RAPIER.World, spawn: Point, index: number): PursuitVehicle {
  const vehicle = createVehicle(scene, world, spawn, index ? 0x263545 : 0x3c333b, 'compact');
  const driverJacket = new THREE.Mesh(new THREE.BoxGeometry(.42, .34, .3), MAT.guardArmor);
  driverJacket.position.set(.18, .78, .06);
  const driverHead = new THREE.Mesh(new THREE.SphereGeometry(.14, 8, 6), MAT.guard);
  driverHead.position.set(.18, 1.03, .06);
  vehicle.group.add(driverJacket, driverHead);
  const lightbar = new THREE.Group();
  lightbar.position.set(0, 1.15, .08);
  const red = new THREE.Mesh(new THREE.BoxGeometry(.34, .13, .26), new THREE.MeshBasicMaterial({ color: 0xff3658 }));
  const blue = new THREE.Mesh(new THREE.BoxGeometry(.34, .13, .26), new THREE.MeshBasicMaterial({ color: 0x48d9ff }));
  red.position.x = -.22;
  blue.position.x = .22;
  lightbar.add(red, blue);
  vehicle.group.add(lightbar);
  vehicle.group.visible = false;
  vehicle.collider.setEnabled(false);
  return { ...vehicle, spawn: { ...spawn }, active: false, route: [], routeIndex: 0, replanClock: 0, stuckSeconds: 0, lightbar, lastSeenTarget: null, lastSeenAt: -1000 };
}

function addRoad(
  scene: THREE.Scene,
  world: RAPIER.World,
  blockers: THREE.Object3D[],
  route: typeof ROAD_ROUTES[number],
  material: THREE.Material,
): THREE.Vector3[] {
  const curve = new THREE.CatmullRomCurve3(route.points.map((point) => v(point.x, point.y, point.z)), false, 'centripetal');
  const divisions = Math.max(18, Math.ceil(curve.getLength() / 1.6));
  const samples = curve.getPoints(divisions);
  const positions = new Float32Array((samples.length) * 2 * 3);
  const indices: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    const tangent = curve.getTangentAt(i / divisions);
    const normal = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    const p = samples[i];
    const left = p.clone().addScaledVector(normal, route.width / 2);
    const right = p.clone().addScaledVector(normal, -route.width / 2);
    positions.set([left.x, p.y + .025, left.z, right.x, p.y + .025, right.z], i * 6);
    if (i < samples.length - 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const surface = new THREE.Mesh(geometry, material);
  surface.receiveShadow = true;
  surface.userData.routeId = route.id;
  scene.add(surface);

  if (route.sidewalk) {
    for (const side of [-1, 1]) {
      const walkPositions = new Float32Array(samples.length * 6);
      const walkIndices: number[] = [];
      for (let i = 0; i < samples.length; i++) {
        const tangent = curve.getTangentAt(i / divisions);
        const normal = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
        const p = samples[i];
        const center = p.clone().addScaledVector(normal, side * (route.width / 2 + 1.15));
        const left = center.clone().addScaledVector(normal, 1.15);
        const right = center.clone().addScaledVector(normal, -1.15);
        walkPositions.set([left.x, p.y + .055, left.z, right.x, p.y + .055, right.z], i * 6);
        if (i < samples.length - 1) {
          const a = i * 2;
          walkIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const walkGeometry = new THREE.BufferGeometry();
      walkGeometry.setAttribute('position', new THREE.BufferAttribute(walkPositions, 3));
      walkGeometry.setIndex(walkIndices);
      walkGeometry.computeVertexNormals();
      const walk = new THREE.Mesh(walkGeometry, MAT.sidewalk);
      walk.receiveShadow = true;
      scene.add(walk);
    }
  }

  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length < .05) continue;
    const yaw = Math.atan2(dx, dz);
    boxMesh(scene, world, blockers, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, y: (a.y + b.y) / 2 - .12 },
      { x: route.width, y: .24, z: length + .08 }, material, true, yaw);
  }
  return samples;
}

function createCitizen(scene: THREE.Scene, world: RAPIER.World, routeSets: [Point[], Point[], Point[]], color: number, speed: number, phaseIndex: number): Citizen {
  const material = new THREE.MeshStandardMaterial({ color, roughness: .84 });
  const pieces = characterMesh(scene, material, false);
  const start = routeSets[phaseIndex][0];
  const floorY = groundHeightAt(start);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x, floorY + .9, start.z));
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(.4, .28).setFriction(0), body);
  const controller = world.createCharacterController(.035);
  controller.setMaxSlopeClimbAngle(.8);
  controller.setMinSlopeSlideAngle(1.1);
  pieces.group.position.set(start.x, floorY, start.z);
  pieces.shadow.position.set(start.x, floorY + .026, start.z);
  return {
    group: pieces.group, shadow: pieces.shadow, limbs: pieces.limbs, body, collider, controller,
    position: { ...start }, routeSets, route: routeSets[phaseIndex], routeIndex: 1,
    phaseIndex, speed, pauseUntil: 0, gait: Math.random() * Math.PI * 2,
    startledUntil: 0, panicTarget: null, fallenUntil: 0, alive: true,
  };
}

function addBarrier(
  scene: THREE.Scene,
  world: RAPIER.World,
  blockers: THREE.Object3D[],
  point: Point,
  size: { x: number; y: number; z: number },
  y: number,
  material = MAT.concreteDark,
): THREE.Mesh {
  return boxMesh(scene, world, blockers, { ...point, y }, size, material, true);
}

function addStreetLight(scene: THREE.Scene, position: Point, groundY: number, color: number, streetLights: THREE.PointLight[], shaderMaterials: THREE.ShaderMaterial[], seed: number): void {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.08, .12, 5.2, 7), MAT.concrete);
  pole.position.set(position.x, groundY + 2.6, position.z);
  scene.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(.13, .11, .9), MAT.concrete);
  arm.position.set(position.x, groundY + 5.12, position.z - .36);
  scene.add(arm);
  const bulbMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.3 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.18, 9, 7), bulbMat);
  bulb.position.set(position.x, groundY + 4.96, position.z - .7);
  scene.add(bulb);
  const light = new THREE.PointLight(color, 5.5, 17, 2);
  light.position.set(position.x, groundY + 4.6, position.z - .7);
  light.userData.seed = seed;
  streetLights.push(light);
  scene.add(light);
  addStaticCircle(scene, position.x, position.z, 3.2, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .035, depthWrite: false }), groundY + .012);
  const haloMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec2 vUv; void main(){ float d = length(vUv - vec2(0.5)) * 2.0; float edge = 1.0 - smoothstep(0.08, 1.0, d); float pulse = 0.72 + 0.18 * sin(uTime * 1.7 + vUv.x * 8.0); gl_FragColor = vec4(uColor, edge * pulse * 0.24); }`,
  });
  const halo = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32), haloMaterial);
  halo.rotation.x = -Math.PI / 2;
  halo.position.set(position.x, groundY + .055, position.z);
  scene.add(halo);
  shaderMaterials.push(haloMaterial);
}

export function showVehicleDamage(vehicle: Vehicle, side: 'front' | 'rear' | 'left' | 'right', severity: number): void {
  const slots = side === 'front' ? [0, 1, 2] : side === 'left' ? [3, 4] : side === 'right' ? [5, 6] : [7, 8, 9];
  const amount = severity > 7 ? slots.length : Math.min(2, slots.length);
  for (let i = 0; i < amount; i++) vehicle.damageMarks[slots[i]].visible = true;
  vehicle.impactCount++;
}

export function showVehicleDamageAt(vehicle: Vehicle, worldPoint: THREE.Vector3, severity: number): void {
  vehicle.group.updateMatrixWorld(true);
  const local = vehicle.group.worldToLocal(worldPoint.clone());
  const side = Math.abs(local.x) > Math.abs(local.z) * .92
    ? local.x < 0 ? 'left' : 'right'
    : local.z < 0 ? 'front' : 'rear';
  showVehicleDamage(vehicle, side, severity);
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
  group.position.set(point.x, groundHeightAt(point), point.z);
  scene.add(group);
  return group;
}

export function buildCity(container: HTMLElement, world: RAPIER.World): City {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101a1d);
  scene.fog = new THREE.FogExp2(0x101a1d, .0024);
  const camera = new THREE.OrthographicCamera(-40, 40, 22.5, -22.5, .1, 260);
  camera.position.set(FORGES.playerStart.x, 57, FORGES.playerStart.z + 30);
  camera.lookAt(FORGES.playerStart.x, 6, FORGES.playerStart.z);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
  renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = false;
  renderer.domElement.setAttribute('aria-label', 'Vue haute du quartier des Forges');
  container.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xa9c7c1, 0x2b3030, 1.25));
  const moon = new THREE.DirectionalLight(0xd0d9c8, 1.35);
  moon.position.set(-34, 55, 18);
  scene.add(moon);
  const blocks: THREE.Object3D[] = [];
  const buildings: Building[] = [];
  const streetLights: THREE.PointLight[] = [];
  const shaderMaterials: THREE.ShaderMaterial[] = [];
  const breakables: Breakable[] = [];

  // The bible uses the north-west map corner as (0,0). The upper block is a real +6m deck.
  boxMesh(scene, world, blocks, { x: 90, z: 60, y: -.14 }, { x: 184, y: .28, z: 124 }, MAT.ground, true);
  // Split the elevated deck around the stairwell so the collision floor cannot cap the descent.
  boxMesh(scene, world, blocks, { x: 90, z: 32, y: 5.8 }, { x: 180, y: .4, z: 64 }, MAT.concreteDark, true);
  boxMesh(scene, world, blocks, { x: 61.25, z: 66, y: 5.8 }, { x: 122.5, y: .4, z: 4 }, MAT.concreteDark, true);
  boxMesh(scene, world, blocks, { x: 153.75, z: 66, y: 5.8 }, { x: 52.5, y: .4, z: 4 }, MAT.concreteDark, true);
  addBarrier(scene, world, blocks, { x: -1.7, z: 60 }, { x: .7, y: 12, z: 124 }, 4, MAT.concreteDark);
  addBarrier(scene, world, blocks, { x: 181.7, z: 60 }, { x: .7, y: 12, z: 124 }, 4, MAT.concreteDark);
  addBarrier(scene, world, blocks, { x: 90, z: -1.7 }, { x: 184, y: 12, z: .7 }, 4, MAT.concreteDark);
  addBarrier(scene, world, blocks, { x: 90, z: 121.7 }, { x: 184, y: 12, z: .7 }, 4, MAT.concreteDark);
  const curbLine = new THREE.Mesh(new THREE.BoxGeometry(180, .08, .34), MAT.concrete);
  curbLine.position.set(90, 6.03, 68.35);
  scene.add(curbLine);

  // The rail bed remains at +3m. The sidewalk stair and tunnel are the only walking crossing.
  const railDeck = boxMesh(scene, world, blocks, { x: 90, z: 74, y: 2.82 }, { x: 180, y: .36, z: 8 }, new THREE.MeshStandardMaterial({ color: 0x333c3b, roughness: .96 }), true);
  for (const z of [71.6, 75.5]) {
    boxMesh(scene, world, blocks, { x: 90, z, y: 3.12 }, { x: 180, y: .16, z: .18 }, new THREE.MeshStandardMaterial({ color: 0x8e9994, metalness: .65, roughness: .4 }), false);
  }
  for (let x = 1; x < 180; x += 1.45) {
    boxMesh(scene, world, blocks, { x, z: 73.55, y: 3.055 }, { x: .2, y: .12, z: 6.5 }, new THREE.MeshStandardMaterial({ color: x % 3 < 1 ? 0x5e4d3c : 0x695741, roughness: .9 }), false);
  }
  // Retaining wall/fence follows the railway edge; an opening matches the two-flight stair.
  addBarrier(scene, world, blocks, { x: 61.25, z: 68.45 }, { x: 122.5, y: 1.55, z: .32 }, 6.75, MAT.wall);
  addBarrier(scene, world, blocks, { x: 143, z: 68.45 }, { x: 31, y: 1.55, z: .32 }, 6.75, MAT.wall);
  addBarrier(scene, world, blocks, { x: 175.5, z: 68.45 }, { x: 9, y: 1.55, z: .32 }, 6.75, MAT.wall);
  addBarrier(scene, world, blocks, { x: 60.5, z: 79.55 }, { x: 121, y: 1.15, z: .28 }, 3.85, MAT.concreteDark);
  addBarrier(scene, world, blocks, { x: 144, z: 79.55 }, { x: 30, y: 1.15, z: .28 }, 3.85, MAT.concreteDark);
  addBarrier(scene, world, blocks, { x: 175.5, z: 79.55 }, { x: 9, y: 1.15, z: .28 }, 3.85, MAT.concreteDark);
  // Continuous roadway meshes and collision strips are sampled from the same axes.
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x20292a, roughness: .96, metalness: .02 });
  const roadSamples = new Map<string, THREE.Vector3[]>();
  for (const route of ROAD_ROUTES) roadSamples.set(route.id, addRoad(scene, world, blocks, route, asphalt));
  // Tunnel walls follow the same sampled curve as its floor instead of crossing the exit.
  const tunnelSamples = roadSamples.get('passage-sous-voies')!;
  for (const side of [-1, 1]) for (let i = 0; i < tunnelSamples.length - 1; i++) {
    const a = tunnelSamples[i];
    const b = tunnelSamples[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length < .05) continue;
    const normalX = dz / length;
    const normalZ = -dx / length;
    const yaw = Math.atan2(dx, dz);
    boxMesh(scene, world, blocks,
      { x: (a.x + b.x) / 2 + normalX * side * 4.2, z: (a.z + b.z) / 2 + normalZ * side * 4.2, y: 1.23 },
      { x: .35, y: 2.45, z: length + .08 }, MAT.wall, true, yaw);
  }

  const lanePaint = new THREE.MeshBasicMaterial({ color: 0xd1ad78, transparent: true, opacity: .58, depthWrite: false });
  for (const [x, z, rotation] of [[32, 31, 0], [112, 30, 0], [89, 30, 0], [151, 46, .55], [141, 100, Math.PI / 2], [69, 109, Math.PI / 2]] as const) {
    for (let i = -2; i <= 2; i++) {
      const paint = new THREE.Mesh(new THREE.BoxGeometry(1.25, .018, .16), lanePaint);
      paint.position.set(x + Math.cos(rotation) * i * 1.65, groundHeightAt({ x, z }) + .075, z + Math.sin(rotation) * i * 1.65);
      paint.rotation.y = rotation;
      scene.add(paint);
    }
  }
  // Painted parking bay for the mission car, outside both the street and the court gate.
  for (let i = 0; i < 3; i++) {
    const x = 108 + i * 3.8;
    for (const z of [25.8, 34.2]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(.1, .022, 1.1), lanePaint);
      stripe.position.set(x, 6.08, z);
      scene.add(stripe);
    }
  }

  // Forges blocks: the garage, depot and forecourt match the measured concept plan.
  buildings.push(createBuilding(scene, world, blocks, 'Garage de Mina', FORGES.garage, 34, 17, 5.3, 0x6c685e, { door: 'north', doorWidth: 6.2, sign: 'Mina / Garage', accent: MAT.neonPink }));
  buildings.push(createBuilding(scene, world, blocks, 'Ateliers du rail', { x: 17.5, z: 15.5 }, 17, 11, 6.2, 0x615d53, { door: 'south', doorWidth: 3.5, sign: 'Ateliers', accent: MAT.amber }));
  buildings.push(createBuilding(scene, world, blocks, 'Hangar des équipes', { x: 43, z: 13.5 }, 16, 10.5, 5.2, 0x59615e, { door: 'south', doorWidth: 4.5, sign: 'Hangar 06', accent: MAT.amber }));
  buildings.push(createBuilding(scene, world, blocks, 'Annexe de maintenance', { x: 62, z: 47 }, 12.25, 12.75, 4.2, 0x515956, { door: 'south', doorWidth: 2.8, groundY: 6 }));
  buildings.push(createBuilding(scene, world, blocks, 'Local de service', { x: 61.25, z: 58.25 }, 11.5, 5.5, 3.8, 0x56564e, { door: 'north', groundY: 6 }));
  buildings.push(createBuilding(scene, world, blocks, 'Dépôt logistique', FORGES.depot, 29, 24, 6.2, 0x777166, { door: 'north', doorWidth: 5.2, sideDoor: 'east', sign: 'Transit / 09', accent: MAT.neonCyan }));
  buildings.push(createBuilding(scene, world, blocks, 'Magasin du quai', { x: 142, z: 49.5 }, 15, 16, 5.2, 0x665e52, { door: 'north', doorWidth: 3.4, groundY: 6, sign: 'Épicerie du pont', accent: MAT.amber }));
  buildings.push(createBuilding(scene, world, blocks, 'Entrepôt bas', { x: 35, z: 87.5 }, 20, 6.5, 4.7, 0x504e48, { door: 'south', groundY: 0 }));
  buildings.push(createBuilding(scene, world, blocks, 'Maisons des remises', { x: 63, z: 91.5 }, 22.75, 8.75, 5.1, 0x625f57, { door: 'south', groundY: 0 }));
  buildings.push(createBuilding(scene, world, blocks, 'Remises de l’Houmeau', { x: 94, z: 91 }, 22.75, 7.75, 4.5, 0x5b5147, { door: 'south', groundY: 0 }));
  // Low furniture makes the two homes readable while leaving a clear path through each south door.
  const furniture = new THREE.MeshStandardMaterial({ color: 0x59483b, roughness: .82 });
  const upholstery = new THREE.MeshStandardMaterial({ color: 0x54726d, roughness: .9 });
  for (const [x, z, sx, sy, sz, material] of [
    [57, 89, 2.7, .36, 1.55, furniture], [57, 89.82, 2.7, .08, 1.55, upholstery],
    [70, 89.4, 2.5, .5, 1.25, furniture], [68.5, 92.3, 1.3, .72, .9, furniture],
    [88, 89, 2.8, .36, 1.55, furniture], [88, 89.82, 2.8, .08, 1.55, upholstery],
    [101, 89.2, 2.4, .52, 1.35, furniture], [99.5, 92.1, 1.3, .72, .9, furniture],
  ] as const) {
    boxMesh(scene, world, blocks, { x, z, y: .065 + sy / 2 }, { x: sx, y: sy, z: sz }, material, true);
  }

  // Courtyard enclosure: 8m north entrance, depot-side door and the southern hackable grille.
  addBarrier(scene, world, blocks, { x: 108, z: 42.5 }, { x: 8, y: 1.8, z: .3 }, 6.9, MAT.wall);
  addBarrier(scene, world, blocks, { x: 124, z: 42.5 }, { x: 8, y: 1.8, z: .3 }, 6.9, MAT.wall);
  addBarrier(scene, world, blocks, { x: 104, z: 46.5 }, { x: .3, y: 1.8, z: 8 }, 6.9, MAT.wall);
  addBarrier(scene, world, blocks, { x: 104, z: 57.5 }, { x: .3, y: 1.8, z: 8 }, 6.9, MAT.wall);
  addBarrier(scene, world, blocks, { x: 128, z: 52 }, { x: .3, y: 1.8, z: 19 }, 6.9, MAT.wall);
  addBarrier(scene, world, blocks, { x: 108.7, z: 61.5 }, { x: 9.5, y: 1.8, z: .3 }, 6.9, MAT.wall);
  addBarrier(scene, world, blocks, { x: 121.9, z: 61.5 }, { x: 12.2, y: 1.8, z: .3 }, 6.9, MAT.wall);
  const gateMesh = new THREE.Group();
  const gateMat = new THREE.MeshStandardMaterial({ color: 0x78c6a0, emissive: 0x1f694c, emissiveIntensity: .7, metalness: .5, roughness: .45 });
  for (let i = 0; i < 8; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(.075, 1.6, .075), gateMat);
    bar.position.set(-1.15 + i * .33, .82, 0);
    gateMesh.add(bar);
  }
  const gateTop = new THREE.Mesh(new THREE.BoxGeometry(2.65, .1, .1), gateMat);
  gateTop.position.y = 1.65;
  gateMesh.add(gateTop);
  gateMesh.position.set(114.5, 6, 61.5);
  scene.add(gateMesh);
  gateMesh.userData.collider = world.createCollider(RAPIER.ColliderDesc.cuboid(1.28, .9, .11).setTranslation(114.5, 6.9, 61.5));
  blocks.push(gateMesh);

  const bridgeDeck = boxMesh(scene, world, blocks, { x: 165, z: 73, y: 5.8 }, { x: 12.4, y: .4, z: 30 }, new THREE.MeshStandardMaterial({ color: 0x3c4544, roughness: .82 }), true);
  for (const x of [158.7, 171.3]) {
    addBarrier(scene, world, blocks, { x, z: 73 }, { x: .28, y: 1.1, z: 30 }, 6.7, MAT.concreteDark);
    for (let z = 60; z < 87; z += 3.1) addBarrier(scene, world, blocks, { x, z }, { x: .35, y: .85, z: .35 }, 6.52, MAT.concrete);
  }

  // Persistent workshop shortcut and service panel used by U01 after M01 opens the grille.
  const shortcutMesh = new THREE.Group();
  const serviceDoor = new THREE.Mesh(new THREE.BoxGeometry(.24, 2.1, 2.1), new THREE.MeshStandardMaterial({ color: 0x47645e, emissive: 0x173b35, emissiveIntensity: .42, metalness: .3 }));
  serviceDoor.position.y = 1.05;
  shortcutMesh.add(serviceDoor);
  for (let i = 0; i < 5; i++) {
    const slit = new THREE.Mesh(new THREE.BoxGeometry(.28, .05, .14), MAT.neonPink);
    slit.position.set(.17, .58 + i * .25, 0);
    shortcutMesh.add(slit);
  }
  shortcutMesh.position.set(FORGES.serviceGate.x, 6, FORGES.serviceGate.z);
  scene.add(shortcutMesh);
  shortcutMesh.userData.collider = world.createCollider(RAPIER.ColliderDesc.cuboid(.24, 1.05, 1.1).setTranslation(FORGES.serviceGate.x, 7.05, FORGES.serviceGate.z));
  blocks.push(shortcutMesh);
  addBarrier(scene, world, blocks, { x: FORGES.serviceGate.x, z: 54.5 }, { x: .36, y: 2, z: 9 }, 7, MAT.wall);
  addBarrier(scene, world, blocks, { x: FORGES.serviceGate.x, z: 65.5 }, { x: .36, y: 2, z: 9 }, 7, MAT.wall);
  const servicePanel = new THREE.Group();
  const panelBody = new THREE.Mesh(new THREE.BoxGeometry(.18, .72, .62), new THREE.MeshStandardMaterial({ color: 0x293c38, metalness: .45, roughness: .4 }));
  panelBody.position.y = 1.25;
  servicePanel.add(panelBody);
  const panelLamp = new THREE.Mesh(new THREE.SphereGeometry(.12, 9, 7), new THREE.MeshStandardMaterial({ color: 0x7c8174, emissive: 0x181e19, emissiveIntensity: .35 }));
  panelLamp.position.set(.13, 1.38, -.06);
  servicePanel.add(panelLamp);
  servicePanel.userData.lamp = panelLamp;
  servicePanel.position.set(54.5, 6, 60.5);
  scene.add(servicePanel);

  // Stair flights and landings are visible and align to the walkable height profile.
  for (let i = 0; i < 12; i++) {
    const z = 65.25 + i * .48;
    const y = 6 - i * .5;
    const step = new THREE.Mesh(new THREE.BoxGeometry(4.5, .18, .58), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x77786f : 0x696e68, roughness: .9 }));
    step.position.set(125, y, z);
    scene.add(step);
    for (const x of [122.6, 127.4]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(.12, 1.05, .12), MAT.concrete);
      rail.position.set(x, y + .48, z);
      scene.add(rail);
    }
  }
  addBillboard(scene, 'Passage inférieur', 'vers la rue basse', { x: 133, z: 85 }, '#f1b66c', 7.2, 2.5);
  addBillboard(scene, 'Pont des Forges', 'franchissement routier', { x: 165, z: 73 }, '#d2c29a', 7, 9.1);
  addBillboard(scene, 'Voies ferrées', 'passage fermé au public', { x: 61, z: 73.5 }, '#a7aaa2', 7, 10.2);

  // Workshop props and loading details stay outside the measured vehicle path.
  const addCrate = (x: number, z: number, groundY: number, kind: 'crate' | 'bollard' = 'crate') => {
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x72583c, roughness: .95 });
    const size = kind === 'crate' ? 1.1 : .46;
    const height = kind === 'crate' ? 1.05 : .95;
    const box = new THREE.Mesh(kind === 'crate' ? new THREE.BoxGeometry(size, height, size) : new THREE.CylinderGeometry(.2, .24, height, 8), wood);
    box.position.y = height / 2;
    group.add(box);
    if (kind === 'crate') {
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.13, .1, 1.13), MAT.concrete);
      band.position.y = height * .68;
      group.add(band);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(.08, .9, 1.12), MAT.amber);
      stripe.position.y = height * .48;
      group.add(stripe);
    }
    group.position.set(x, groundY, z);
    scene.add(group);
    const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(size / 2, height / 2, size / 2).setTranslation(x, groundY + height / 2, z));
    blocks.push(group);
    breakables.push({ mesh: group, collider, kind, durability: kind === 'crate' ? 8 : 12, broken: false });
  };
  for (const [x, z, level] of [[23, 39, 6], [60, 39, 6], [70, 39, 6], [105, 38, 6], [150, 59, 6], [111, 92, 0], [108, 116, 0], [27, 84, 0]] as const) addCrate(x, z, level);
  for (const [x, z] of [[8, 43], [47, 21], [99, 15.5], [148, 29], [175, 56], [151, 109], [115, 112]] as const) addCrate(x, z, groundHeightAt({ x, z }), 'bollard');

  const streetLightPositions: Array<[number, number, number]> = [
    [15, 32, 0xffbd72], [27, 33, 0xffbd72], [43, 32, 0xffbd72], [56, 27, 0xffcf83],
    [72, 21, 0xffbd72], [92, 21, 0x74cbd0], [108, 30, 0x73d6ba], [124, 31, 0xffbd72],
    [141, 35, 0xffbd72], [154, 48, 0x74cbd0], [164, 64, 0x78d4cf], [164, 83, 0xffbd72],
    [146, 97, 0xffbd72], [123, 87, 0x75d5b6], [106, 107, 0xffbd72], [68, 109, 0x78d4cf],
    [35, 101, 0xffbd72], [37.5, 40.8, 0xffbd72], [125, 62, 0x75d5b6],
  ];
  streetLightPositions.forEach(([x, z, color], index) => addStreetLight(scene, { x, z }, groundHeightAt({ x, z }), color, streetLights, shaderMaterials, index * .83));

  const mina = new THREE.Group();
  const minaBody = new THREE.Mesh(new THREE.CapsuleGeometry(.34, .54, 3, 8), MAT.neonPink);
  minaBody.position.y = .82;
  mina.add(minaBody);
  const coverall = new THREE.Mesh(new THREE.BoxGeometry(.58, .58, .38), new THREE.MeshStandardMaterial({ color: 0x694851, roughness: .76 }));
  coverall.position.y = .8;
  mina.add(coverall);
  const minaHead = new THREE.Mesh(new THREE.SphereGeometry(.22, 9, 7), new THREE.MeshStandardMaterial({ color: 0xdab4a3, roughness: .8 }));
  minaHead.position.y = 1.3;
  mina.add(minaHead);
  const chestLamp = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 6), MAT.amber);
  chestLamp.position.set(.22, .95, -.22);
  mina.add(chestLamp);
  const wrench = new THREE.Mesh(new THREE.BoxGeometry(.09, .48, .09), MAT.concrete);
  wrench.position.set(.38, .8, -.05);
  mina.add(wrench);
  mina.position.set(FORGES.garage.x - 7, 6, FORGES.garage.z);
  scene.add(mina);
  const minaTag = addBillboard(scene, 'Mina', 'mécanique · relais des Forges', { x: FORGES.garage.x - 7, z: FORGES.garage.z }, '#f08ba2', 3.2, 12.1);

  const chip = createPackage(scene, FORGES.chip, 0x54f1dc, .7);
  const secondaryPackage = createPackage(scene, FORGES.package, 0xf1b66c, .82);
  const playerVehicles = [
    createVehicle(scene, world, FORGES.carStart, undefined, 'compact'),
    createVehicle(scene, world, { x: 21.5, z: 54 }, undefined, 'sport'),
    createVehicle(scene, world, { x: 42.5, z: 54 }, undefined, 'van'),
  ];
  const car = playerVehicles[0];
  car.yaw = 0;
  car.group.rotation.y = car.yaw;
  const guards: Guard[] = [
    createGuard(scene, world, { x: 84, z: 48 }, [{ x: 84, z: 48 }, { x: 98, z: 48 }, { x: 99, z: 59 }, { x: 83, z: 59 }]),
    createGuard(scene, world, { x: 116, z: 48 }, [{ x: 116, z: 48 }, { x: 123, z: 48 }, { x: 123, z: 57 }, { x: 108, z: 57 }]),
    createGuard(scene, world, { x: 91, z: 36 }, [{ x: 91, z: 36 }, { x: 100, z: 35 }, { x: 111, z: 39 }, { x: 97, z: 39 }]),
  ];

  const cameraUnit = new THREE.Group();
  const cameraStand = new THREE.Mesh(new THREE.CylinderGeometry(.1, .16, 1.5, 7), MAT.concrete);
  cameraStand.position.y = .75;
  cameraUnit.add(cameraStand);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(.56, .34, .7), new THREE.MeshStandardMaterial({ color: 0x29373a, metalness: .4, roughness: .4 }));
  housing.position.set(0, 1.55, -.18);
  cameraUnit.add(housing);
  const lens = new THREE.Mesh(new THREE.SphereGeometry(.13, 8, 7), MAT.neonPink);
  lens.position.set(0, 1.55, -.56);
  cameraUnit.add(lens);
  cameraUnit.position.set(FORGES.camera.x, 6, FORGES.camera.z);
  cameraUnit.rotation.y = Math.PI;
  scene.add(cameraUnit);
  const coneGeometry = new THREE.BufferGeometry();
  coneGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, .07, 0, -7, .07, -17, 7, .07, -17]), 3));
  coneGeometry.setIndex([0, 1, 2]);
  coneGeometry.computeVertexNormals();
  const cameraCone = new THREE.Mesh(coneGeometry, new THREE.MeshBasicMaterial({ color: 0xec6980, transparent: true, opacity: .08, side: THREE.DoubleSide, depthWrite: false }));
  cameraCone.position.set(FORGES.camera.x, 6.1, FORGES.camera.z);
  cameraCone.rotation.y = Math.PI;
  scene.add(cameraCone);

  const citizenRoutes: Array<[Point[], Point[], Point[]]> = [
    [[{ x: 14, z: 34 }, { x: 23, z: 35 }, { x: 33, z: 34 }, { x: 44, z: 37 }], [{ x: 14, z: 35 }, { x: 27, z: 37 }, { x: 42, z: 36 }, { x: 49, z: 31 }], [{ x: 14, z: 34 }, { x: 29, z: 34 }, { x: 38, z: 35 }, { x: 47, z: 38 }]],
    [[{ x: 21, z: 39 }, { x: 31, z: 38 }, { x: 42, z: 37 }, { x: 48, z: 33 }], [{ x: 21, z: 39 }, { x: 28, z: 36 }, { x: 39, z: 36 }, { x: 48, z: 39 }], [{ x: 21, z: 39 }, { x: 35, z: 38 }, { x: 46, z: 35 }, { x: 52, z: 30 }]],
    [[{ x: 40, z: 27 }, { x: 50, z: 27 }, { x: 62, z: 24 }, { x: 73, z: 21 }], [{ x: 40, z: 27 }, { x: 55, z: 26 }, { x: 68, z: 22 }, { x: 82, z: 20 }], [{ x: 40, z: 27 }, { x: 54, z: 27 }, { x: 66, z: 23 }, { x: 78, z: 21 }]],
    [[{ x: 47, z: 36 }, { x: 55, z: 33 }, { x: 62, z: 29 }, { x: 71, z: 23 }], [{ x: 47, z: 36 }, { x: 58, z: 31 }, { x: 65, z: 28 }, { x: 75, z: 22 }], [{ x: 47, z: 36 }, { x: 57, z: 34 }, { x: 66, z: 27 }, { x: 75, z: 22 }]],
    [[{ x: 63, z: 36 }, { x: 75, z: 34 }, { x: 88, z: 34 }, { x: 101, z: 34 }], [{ x: 63, z: 36 }, { x: 74, z: 37 }, { x: 90, z: 36 }, { x: 102, z: 33 }], [{ x: 63, z: 36 }, { x: 77, z: 34 }, { x: 91, z: 33 }, { x: 104, z: 35 }]],
    [[{ x: 76, z: 34 }, { x: 83, z: 37 }, { x: 95, z: 37 }, { x: 107, z: 36 }], [{ x: 76, z: 34 }, { x: 85, z: 35 }, { x: 96, z: 34 }, { x: 106, z: 37 }], [{ x: 76, z: 34 }, { x: 89, z: 36 }, { x: 98, z: 36 }, { x: 110, z: 38 }]],
    [[{ x: 103, z: 34 }, { x: 109, z: 36 }, { x: 113, z: 40 }, { x: 120, z: 40 }], [{ x: 103, z: 34 }, { x: 108, z: 39 }, { x: 116, z: 40 }, { x: 123, z: 37 }], [{ x: 103, z: 34 }, { x: 111, z: 36 }, { x: 116, z: 40 }, { x: 124, z: 39 }]],
    [[{ x: 126, z: 30 }, { x: 136, z: 32 }, { x: 145, z: 36 }, { x: 153, z: 45 }], [{ x: 126, z: 30 }, { x: 138, z: 35 }, { x: 149, z: 40 }, { x: 155, z: 49 }], [{ x: 126, z: 30 }, { x: 137, z: 32 }, { x: 146, z: 38 }, { x: 153, z: 47 }]],
    [[{ x: 108, z: 55 }, { x: 112, z: 57 }, { x: 117, z: 57 }, { x: 120, z: 54 }], [{ x: 108, z: 55 }, { x: 111, z: 58 }, { x: 117, z: 58 }, { x: 122, z: 55 }], [{ x: 108, z: 55 }, { x: 112, z: 59 }, { x: 117, z: 57 }, { x: 121, z: 53 }]],
    [[{ x: 125, z: 84 }, { x: 125, z: 88 }, { x: 125, z: 91 }, { x: 135, z: 90 }, { x: 142, z: 99 }], [{ x: 125, z: 82 }, { x: 125, z: 88 }, { x: 125, z: 91 }, { x: 133, z: 94 }, { x: 142, z: 99 }], [{ x: 125, z: 84 }, { x: 125, z: 89 }, { x: 125, z: 91 }, { x: 137, z: 94 }, { x: 142, z: 99 }]],
    [[{ x: 145, z: 96 }, { x: 153, z: 98 }, { x: 160, z: 100 }, { x: 165, z: 104 }], [{ x: 145, z: 96 }, { x: 151, z: 100 }, { x: 159, z: 101 }, { x: 164, z: 103 }], [{ x: 145, z: 96 }, { x: 153, z: 97 }, { x: 160, z: 100 }, { x: 163, z: 103 }]],
    [[{ x: 122, z: 94 }, { x: 119, z: 100 }, { x: 111, z: 105 }, { x: 100, z: 108 }], [{ x: 122, z: 94 }, { x: 118, z: 101 }, { x: 110, z: 106 }, { x: 98, z: 109 }], [{ x: 122, z: 94 }, { x: 116, z: 100 }, { x: 108, z: 104 }, { x: 97, z: 108 }]],
    [[{ x: 81, z: 108 }, { x: 68, z: 107 }, { x: 55, z: 105 }, { x: 43, z: 102 }], [{ x: 81, z: 108 }, { x: 69, z: 110 }, { x: 55, z: 106 }, { x: 42, z: 102 }], [{ x: 81, z: 108 }, { x: 66, z: 108 }, { x: 54, z: 104 }, { x: 40, z: 101 }]],
    [[{ x: 34, z: 98 }, { x: 27, z: 100 }, { x: 18, z: 100 }, { x: 13, z: 98 }], [{ x: 34, z: 98 }, { x: 28, z: 101 }, { x: 17, z: 100 }, { x: 12, z: 98 }], [{ x: 34, z: 98 }, { x: 24, z: 100 }, { x: 18, z: 99 }, { x: 12, z: 97 }]],
    [[{ x: 133, z: 88 }, { x: 138, z: 93 }, { x: 142, z: 98 }, { x: 148, z: 101 }], [{ x: 133, z: 88 }, { x: 137, z: 93 }, { x: 143, z: 97 }, { x: 151, z: 100 }], [{ x: 133, z: 88 }, { x: 139, z: 94 }, { x: 143, z: 99 }, { x: 151, z: 102 }]],
  ];
  const civilianColors = [0x96a589, 0xb98469, 0x71939b, 0xc8a86e, 0x9274a5, 0x67917d, 0xb57d82, 0x7893b6, 0xc0a987, 0x758f85, 0xb08d59, 0x7b8494, 0xc1815d, 0x8a9b72];
  const citizens = citizenRoutes.map((routes, index) => createCitizen(scene, world, routes, civilianColors[index], .85 + (index % 4) * .11, index % 3));
  const traffic: TrafficVehicle[] = TRAFFIC_ROUTES.map((route, index) => {
    const dx = route[1].x - route[0].x;
    const dz = route[1].z - route[0].z;
    const length = Math.hypot(dx, dz) || 1;
    const laneOffset = 1.9;
    const start = { x: route[0].x + dz / length * laneOffset, z: route[0].z - dx / length * laneOffset };
    const vehicle = createVehicle(scene, world, start, [0x655445, 0x35565c, 0x76604a][index]);
    const next = route[1];
    vehicle.yaw = Math.atan2(-(next.x - start.x), -(next.z - start.z));
    vehicle.group.rotation.y = vehicle.yaw;
    return { ...vehicle, route: [...route], routeIndex: 1, direction: 1, cruiseSpeed: 4.2 + index * .55, laneOffset, baseLaneOffset: laneOffset, pauseUntil: 0, hijacked: false, stuckSeconds: 0 };
  });
  const pursuitVehicles: PursuitVehicle[] = [
    createPursuitVehicle(scene, world, { x: 9, z: 39 }, 0),
    createPursuitVehicle(scene, world, { x: 79, z: 29 }, 1),
    createPursuitVehicle(scene, world, { x: 132, z: 39 }, 2),
    createPursuitVehicle(scene, world, { x: 108, z: 39 }, 3),
  ];

  const decoys: THREE.Group[] = [];
  for (let i = 0; i < 5; i++) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.36 + i * .17, .018, 4, 32), new THREE.MeshBasicMaterial({ color: 0x7bdeed, transparent: true, opacity: .45 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = .08 + i * .04;
    group.add(ring);
    group.visible = false;
    scene.add(group);
    decoys.push(group);
  }
  const particlePositions = new Float32Array(96 * 3);
  const particleLife = new Float32Array(96);
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  const particles = new THREE.Points(particleGeometry, new THREE.PointsMaterial({ color: 0xf26368, size: .13, transparent: true, opacity: .9, depthWrite: false }));
  scene.add(particles);
  const bloodMarks: THREE.Mesh[] = [];
  for (let i = 0; i < 22; i++) {
    const mark = new THREE.Mesh(new THREE.CircleGeometry(.14 + Math.random() * .2, 10), new THREE.MeshBasicMaterial({ color: 0x8d1f2e, transparent: true, opacity: .55, depthWrite: false }));
    mark.rotation.x = -Math.PI / 2;
    mark.visible = false;
    scene.add(mark);
    bloodMarks.push(mark);
  }

  const player = createCharacter(scene, world, FORGES.playerStart, MAT.player);
  const city: City = {
    scene, camera, renderer, bridgeDeck, railDeck, blockers: blocks, buildings, gateMesh, shortcutMesh, chip, secondaryPackage,
    mina, minaTag, guards, citizens, cameraUnit, cameraCone, car, playerVehicles, controlledVehicle: null, traffic, pursuitVehicles, trafficRouteMeshes: [], servicePanel, breakables,
    streetLights, shaderMaterials, activityPhase: -1, player, floorPlane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -6),
    aimRay: new THREE.Raycaster(), decoys, bloodMarks, particles, particlePositions, particleLife,
    buildingsByName: new Map(buildings.map((building) => [building.name, building])),
    navGrid: { blocked: [], heights: new Float32Array(), minX: -3, minZ: -3, step: 1.5, width: 125, height: 83 },
  };
  refreshNavigation(city);
  return city;
}

export function refreshNavigation(city: City): void {
  const { minX, minZ, step, width, height } = city.navGrid;
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
      if (bounds.max.x - bounds.min.x > 60 || bounds.max.z - bounds.min.z > 60) continue;
      if (bounds.max.y - bounds.min.y < .035) continue;
      obstacles.push(bounds);
    }
  }
  const blocked = new Array<boolean>(width * height).fill(false);
  const heights = new Float32Array(width * height);
  for (let iz = 0; iz < height; iz++) {
    const z = minZ + iz * step;
    for (let ix = 0; ix < width; ix++) {
      const x = minX + ix * step;
      const index = iz * width + ix;
      const floorY = groundHeightAt({ x, z });
      heights[index] = floorY;
      blocked[index] = obstacles.some((b) =>
        x > b.min.x - .48 && x < b.max.x + .48 && z > b.min.z - .48 && z < b.max.z + .48
        && b.max.y > floorY + .14 && b.min.y < floorY + 1.66,
      );
    }
  }
  city.navGrid.blocked = blocked;
  city.navGrid.heights = heights;
}

export function updateActorVisual(actor: Character): void {
  const floorY = actor.position.y - .9;
  actor.group.position.set(actor.position.x, floorY, actor.position.z);
  actor.group.rotation.y = actor.facing;
  if (actor.walking) actor.animClock += .11;
  else actor.animClock *= .82;
  const swing = actor.walking ? Math.sin(actor.animClock) * .43 : 0;
  actor.limbs[0].rotation.x = swing;
  actor.limbs[1].rotation.x = -swing;
  actor.limbs[2].rotation.x = -swing * .72;
  actor.limbs[3].rotation.x = swing * .72;
  actor.shadow.position.set(actor.position.x, floorY + .026, actor.position.z);
  actor.shadow.visible = actor.alive;
}

export function flashBlood(city: City, point: Point, now: number): void {
  const slots = city.particleLife;
  const values = city.particlePositions;
  for (let i = 0; i < 9; i++) {
    const index = (Math.random() * slots.length) | 0;
    slots[index] = 0.34 + Math.random() * .4;
    values[index * 3] = point.x + (Math.random() - .5) * .72;
    values[index * 3 + 1] = groundHeightAt(point) + .3 + Math.random() * .8;
    values[index * 3 + 2] = point.z + (Math.random() - .5) * .72;
  }
  city.particles.geometry.attributes.position.needsUpdate = true;
  const mark = city.bloodMarks.find((entry) => !entry.visible) ?? city.bloodMarks[(Math.random() * city.bloodMarks.length) | 0];
  mark.visible = true;
  mark.position.set(point.x, groundHeightAt(point) + .03, point.z);
  mark.userData.expires = now + 22;
}

export function animateEffects(city: City, dt: number, now: number): void {
  for (const material of city.shaderMaterials) material.uniforms.uTime.value = now;
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

export function updateForgesLife(city: City, dt: number, now: number, player: Point, alert: boolean): number {
  const phase = Math.floor(now / 150) % 3;
  if (phase !== city.activityPhase) {
    city.activityPhase = phase;
    const background = phase === 1 ? 0x38403d : phase === 0 ? 0x202a2b : 0x101a1d;
    city.scene.background = new THREE.Color(background);
    (city.scene.fog as THREE.FogExp2).color.setHex(background);
    for (const citizen of city.citizens) {
      if (citizen.phaseIndex === phase) continue;
      let nearest = 0;
      let best = Number.POSITIVE_INFINITY;
      citizen.routeSets[phase].forEach((point, index) => {
        const distance = Math.hypot(point.x - citizen.position.x, point.z - citizen.position.z);
        if (distance < best) { best = distance; nearest = index; }
      });
      citizen.phaseIndex = phase;
      citizen.route = citizen.routeSets[phase];
      citizen.routeIndex = (nearest + 1) % citizen.route.length;
      citizen.pauseUntil = now + .35;
    }
  }
  const lampFactor = phase === 1 ? .14 : phase === 0 ? .68 : 1;
  for (const light of city.streetLights) {
    const seed = light.userData.seed as number;
    const flicker = .94 + .06 * Math.sin(now * 2.1 + seed) * Math.sin(now * .37 + seed * .7);
    light.intensity = THREE.MathUtils.damp(light.intensity, 5.5 * lampFactor * flicker, 3.4, dt);
  }

  for (const citizen of city.citizens) {
    const distanceToPlayer = Math.hypot(citizen.position.x - player.x, citizen.position.z - player.z);
    citizen.collider.setEnabled(distanceToPlayer < 52 && citizen.alive);
    if (!citizen.alive) {
      if (now < citizen.fallenUntil) continue;
      citizen.alive = true;
      citizen.group.rotation.set(0, 0, 0);
      citizen.group.visible = true;
      citizen.position = { ...citizen.route[0] };
      citizen.routeIndex = 1;
      citizen.startledUntil = 0;
      citizen.panicTarget = null;
    }
    if (alert && distanceToPlayer < 20 && now > citizen.startledUntil) {
      citizen.startledUntil = now + 7 + (citizen.gait % 2);
      citizen.pauseUntil = 0;
      const refuge = citizen.route.reduce((best, point) =>
        Math.hypot(point.x - player.x, point.z - player.z) > Math.hypot(best.x - player.x, best.z - player.z) ? point : best,
      citizen.route[0]);
      citizen.panicTarget = { ...refuge };
    }
    const fleeing = now < citizen.startledUntil && citizen.panicTarget !== null;
    const target = fleeing ? citizen.panicTarget! : citizen.route[citizen.routeIndex % citizen.route.length];
    const dx = target.x - citizen.position.x;
    const dz = target.z - citizen.position.z;
    const remaining = Math.hypot(dx, dz);
    if (remaining < .58) {
      if (fleeing) {
        citizen.panicTarget = null;
        citizen.pauseUntil = now + 1.2;
      } else {
        citizen.routeIndex = (citizen.routeIndex + 1) % citizen.route.length;
        citizen.pauseUntil = now + .45 + ((citizen.gait * 13.1) % 1.8);
      }
    } else if (now >= citizen.pauseUntil) {
      const step = Math.min(remaining, citizen.speed * (fleeing ? 1.8 : 1) * dt);
      const x = citizen.position.x + dx / remaining * step;
      const z = citizen.position.z + dz / remaining * step;
      const oldFloor = groundHeightAt(citizen.position);
      const nextFloor = groundHeightAt({ x, z });
      citizen.controller.computeColliderMovement(citizen.collider, { x: dx / remaining * step, y: nextFloor - oldFloor, z: dz / remaining * step });
      const movement = citizen.controller.computedMovement();
      citizen.position.x += movement.x;
      citizen.position.z += movement.z;
      citizen.body.setTranslation({ x: citizen.position.x, y: nextFloor + .9, z: citizen.position.z }, true);
      const heading = Math.atan2(-dx, -dz);
      citizen.group.rotation.y = THREE.MathUtils.damp(citizen.group.rotation.y, heading, 7.5, dt);
      citizen.gait += dt * (fleeing ? 11 : 6.5);
    }
    const floorY = groundHeightAt(citizen.position);
    citizen.group.position.set(citizen.position.x, floorY + (now < citizen.pauseUntil ? 0 : Math.abs(Math.sin(citizen.gait)) * .045), citizen.position.z);
    citizen.group.rotation.z = fleeing ? -.12 : Math.sin(citizen.gait) * .025;
    const swing = Math.sin(citizen.gait) * (fleeing ? .62 : .38);
    citizen.limbs[0].rotation.x = swing;
    citizen.limbs[1].rotation.x = -swing;
    citizen.limbs[2].rotation.x = -swing * .7;
    citizen.limbs[3].rotation.x = swing * .7;
    citizen.shadow.position.set(citizen.position.x, floorY + .026, citizen.position.z);
    citizen.shadow.scale.setScalar(fleeing ? .94 : 1 + Math.abs(Math.sin(citizen.gait)) * .025);
  }

  for (const vehicle of city.traffic) {
    if (vehicle.hijacked || vehicle === city.controlledVehicle) {
      vehicle.collider.setEnabled(true);
      continue;
    }
    const lanePoint = (index: number): Point => {
      const previous = vehicle.route[Math.max(0, index - 1)];
      const next = vehicle.route[Math.min(vehicle.route.length - 1, index + 1)];
      const dx = next.x - previous.x;
      const dz = next.z - previous.z;
      const length = Math.hypot(dx, dz) || 1;
      const point = vehicle.route[index];
      return { x: point.x + dz / length * vehicle.laneOffset, z: point.z - dx / length * vehicle.laneOffset };
    };
    let target = lanePoint(vehicle.routeIndex);
    let toX = target.x - vehicle.position.x;
    let toZ = target.z - vehicle.position.z;
    let distance = Math.hypot(toX, toZ);
    while (distance < 2.3) {
      const nextIndex = vehicle.routeIndex + vehicle.direction;
      if (nextIndex >= vehicle.route.length) {
        vehicle.direction = -1;
        vehicle.routeIndex = vehicle.route.length - 2;
      } else if (nextIndex < 0) {
        vehicle.direction = 1;
        vehicle.routeIndex = 1;
      } else {
        vehicle.routeIndex = nextIndex;
      }
      target = lanePoint(vehicle.routeIndex);
      toX = target.x - vehicle.position.x;
      toZ = target.z - vehicle.position.z;
      distance = Math.hypot(toX, toZ);
    }
    const playerDistance = Math.hypot(vehicle.position.x - player.x, vehicle.position.z - player.z);
    const playerOnSameLevel = Math.abs(groundHeightAt(player) - groundHeightAt({ x: vehicle.position.x, z: vehicle.position.z })) < 1.4;
    const nearPlayer = playerOnSameLevel && playerDistance < 8.5;
    const controlled = city.controlledVehicle;
    const controlledDistance = controlled && Math.abs(groundHeightAt({ x: controlled.position.x, z: controlled.position.z }) - groundHeightAt({ x: vehicle.position.x, z: vehicle.position.z })) < 1.4
      ? Math.hypot(controlled.position.x - vehicle.position.x, controlled.position.z - vehicle.position.z)
      : Number.POSITIVE_INFINITY;
    const yieldingForPlayer = controlledDistance < 11 || !controlled && nearPlayer;
    let yieldSide = Math.sign(vehicle.baseLaneOffset);
    if (yieldingForPlayer) {
      const a = vehicle.route[Math.max(0, vehicle.routeIndex - 1)];
      const b = vehicle.route[Math.min(vehicle.route.length - 1, vehicle.routeIndex + 1)];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.hypot(dx, dz) || 1;
      const normalX = dz / length;
      const normalZ = -dx / length;
      const yieldingTarget = controlledDistance < 11 && controlled ? controlled.position : player;
      const playerSide = (yieldingTarget.x - vehicle.position.x) * normalX + (yieldingTarget.z - vehicle.position.z) * normalZ;
      yieldSide = playerSide >= 0 ? -1 : 1;
    }
    const desiredLaneOffset = yieldingForPlayer ? yieldSide * 4.25 : vehicle.baseLaneOffset * vehicle.direction;
    vehicle.laneOffset = THREE.MathUtils.damp(vehicle.laneOffset, desiredLaneOffset, yieldingForPlayer ? 4.4 : 1.7, dt);
    target = lanePoint(vehicle.routeIndex);
    toX = target.x - vehicle.position.x;
    toZ = target.z - vehicle.position.z;
    distance = Math.hypot(toX, toZ);
    const atJunction = ROAD_JUNCTIONS.some((junction) => Math.hypot(junction.point.x - vehicle.position.x, junction.point.z - vehicle.position.z) < 5.6);
    const headingX = -Math.sin(vehicle.yaw);
    const headingZ = -Math.cos(vehicle.yaw);
    const nearbyVehicles: Vehicle[] = [
      ...city.traffic.filter((other) => other !== vehicle && other.collider.isEnabled()),
      ...city.playerVehicles.filter((other) => other.available && other.collider.isEnabled()),
      ...city.pursuitVehicles.filter((other) => other.active),
      ...(controlled && controlled !== vehicle ? [controlled] : []),
    ];
    const vehicleAhead = nearbyVehicles.map((other) => {
      const dx = other.position.x - vehicle.position.x;
      const dz = other.position.z - vehicle.position.z;
      const ahead = dx * headingX + dz * headingZ;
      const side = Math.abs(dx * headingZ - dz * headingX);
      return { other, ahead, side, gap: ahead - vehicle.halfLength - other.halfLength };
    }).filter((entry) => entry.ahead > 0 && entry.gap < 8 && entry.side < vehicle.halfWidth + entry.other.halfWidth + .6)
      .sort((a, b) => a.gap - b.gap)[0];
    const nearCitizen = city.citizens.some((person) => person.alive && Math.hypot(person.position.x - vehicle.position.x, person.position.z - vehicle.position.z) < 2.6);
    let desiredSpeed = now < vehicle.pauseUntil ? 0 : nearPlayer ? Math.min(2.1, vehicle.cruiseSpeed) : nearCitizen ? Math.min(2.7, vehicle.cruiseSpeed) : vehicle.cruiseSpeed;
    if (vehicleAhead && !atJunction) desiredSpeed = Math.min(desiredSpeed, Math.max(0, Math.min(vehicleAhead.other.speed, vehicle.cruiseSpeed) + (vehicleAhead.gap - 2.8) * .95));
    if (atJunction) desiredSpeed = Math.max(1.35, desiredSpeed);
    vehicle.speed = THREE.MathUtils.damp(vehicle.speed, desiredSpeed, 1.8, dt);
    if (vehicle.speed < .15) continue;
    const desiredYaw = Math.atan2(-toX, -toZ);
    let yawDelta = desiredYaw - vehicle.yaw;
    yawDelta = ((yawDelta + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    vehicle.yaw += yawDelta * (1 - Math.exp(-dt * 4.8));
    const step = Math.min(distance, vehicle.speed * dt);
    const moveX = toX / distance * step;
    const moveZ = toZ / distance * step;
    const oldFloor = groundHeightAt({ x: vehicle.position.x, z: vehicle.position.z });
    const nextFloor = groundHeightAt({ x: vehicle.position.x + moveX, z: vehicle.position.z + moveZ });
    vehicle.controller.computeColliderMovement(vehicle.collider, { x: moveX, y: nextFloor - oldFloor, z: moveZ });
    const moved = vehicle.controller.computedMovement();
    const movedDistance = Math.hypot(moved.x, moved.z);
    const clipped = Math.hypot(moved.x - moveX, moved.z - moveZ) > .001;
    if (clipped) {
      const freshContacts = new Set<number>();
      for (let i = 0; i < vehicle.controller.numComputedCollisions(); i++) {
        const collision = vehicle.controller.computedCollision(i);
        const collider = collision?.collider;
        if (!collision || !collider) continue;
        freshContacts.add(collider.handle);
        if (vehicle.contactHandles.has(collider.handle) || vehicle.speed < .01) continue;
        const severity = vehicle.speed;
        showVehicleDamageAt(vehicle, new THREE.Vector3(collision.witness1.x, collision.witness1.y, collision.witness1.z), severity);
        const breakable = city.breakables.find((entry) => entry.collider.handle === collider.handle && !entry.broken);
        if (breakable) {
          breakable.durability -= severity;
          breakable.mesh.rotation.z += Math.sign(moveX + moveZ || 1) * Math.min(.18, .04 + severity * .022);
          breakable.mesh.position.y += Math.min(.035, severity * .008);
          if (breakable.durability <= 0) {
            breakable.broken = true;
            breakable.collider.setEnabled(false);
            breakable.mesh.rotation.z = Math.sign(moveX + moveZ || 1) * .68;
            breakable.mesh.position.y += .22;
          }
        }
      }
      vehicle.contactHandles = freshContacts;
      vehicle.stuckSeconds += dt;
      if (vehicle.stuckSeconds > .75) vehicle.laneOffset = Math.sign(vehicle.baseLaneOffset) * 4.25;
      if (vehicle.stuckSeconds > 2.2 && vehicle.routeIndex > 0 && vehicle.routeIndex < vehicle.route.length - 1) {
        vehicle.routeIndex += vehicle.direction;
        vehicle.stuckSeconds = 0;
      }
      vehicle.speed *= atJunction ? .62 : .28;
      vehicle.pauseUntil = now + (atJunction ? .04 : .18);
    } else {
      vehicle.contactHandles.clear();
      if (movedDistance > .005) vehicle.stuckSeconds = Math.max(0, vehicle.stuckSeconds - dt * 2);
    }
    vehicle.position.x += moved.x;
    vehicle.position.z += moved.z;
    const floorY = groundHeightAt({ x: vehicle.position.x, z: vehicle.position.z });
    vehicle.position.y = floorY + .57;
    vehicle.body.setTranslation({ x: vehicle.position.x, y: vehicle.position.y, z: vehicle.position.z }, true);
    vehicle.body.setRotation({ x: 0, y: Math.sin(vehicle.yaw / 2), z: 0, w: Math.cos(vehicle.yaw / 2) }, true);
    vehicle.group.position.set(vehicle.position.x, floorY, vehicle.position.z);
    vehicle.group.rotation.y = vehicle.yaw;
    vehicle.collider.setEnabled(Math.hypot(vehicle.position.x - player.x, vehicle.position.z - player.z) < 64);
  }
  return phase;
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
