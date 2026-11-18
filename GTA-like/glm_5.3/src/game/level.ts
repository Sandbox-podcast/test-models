/**
 * Niveau « Les Forges » — Lots 1 & 3.
 *
 * Construit géométrie (Three.js) et colliders (Rapier) d'après la référence
 * cartographique (Angoulême condensée) : garage de Mina, avenue, dépôt NOVAK
 * avec cour et quai, ruelle, remblai ferroviaire percé d'un passage inférieur
 * (piéton) et d'une galerie de service (raccourci post-mission), pont routier
 * (voiture), place de remise au nord, bar Le Signal.
 *
 * Repère : +X est, +Z sud, Y hauteur. La caméra plonge depuis le sud.
 */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { G_STATIC } from './defs';

export interface PatrolDef { name: string; points: { x: number; z: number; y?: number }[]; }
export interface CamDef { id: string; x: number; z: number; y: number; baseYaw: number; sweep: number; }
export interface GrateDef {
  id: string; // 'grille-quai' | 'grille-service' | portes de campagne M02–M06 / U03 / U05…
  x: number; z: number; w: number; h: number;
  /** Grille compatible : ouverte par l'implant Intrusion. */
  byIntrusion: boolean;
  /** Ouverte par une conséquence de mission (raccourci de Mina). */
  byStory: boolean;
}
export interface FadeZone {
  min: THREE.Vector2; max: THREE.Vector2; maxY: number;
  mats: THREE.MeshStandardMaterial[]; target: number;
}
export interface LevelData {
  root: THREE.Group;
  spawn: { x: number; z: number };
  carSpawn: { x: number; z: number; yaw: number };
  van: { x: number; z: number };
  minaHome: { x: number; z: number };
  minaVan: { x: number; z: number };
  ysec: { x: number; z: number };
  pedestal: { x: number; z: number };
  crate: { x: number; z: number };
  /** U01 : module à prendre sur l'établi du garage. */
  module: { x: number; z: number };
  /** U01 : panneau de la grille de service, dans la galerie. */
  panel: { x: number; z: number };
  /** Lampes de la galerie de service — éteintes jusqu'à U01. */
  galleryLamps: THREE.Mesh[];
  galleryLampMat: THREE.MeshStandardMaterial;
  /** Voyant du panneau de commande (s'allume à U01). */
  panelLed: THREE.Mesh;
  patrols: PatrolDef[];
  cameras: CamDef[];
  medkits: { x: number; z: number }[];
  ammo: { x: number; z: number }[];
  props: { x: number; z: number; size: number }[];
  parkedCars: { x: number; z: number; yaw: number }[];
  fades: FadeZone[];
  /** Jalons de campagne (bible 02/03) : objets à prendre / équipements à activer. */
  questProps: { id: string; x: number; z: number; y?: number }[];
  /** PNJ de campagne (Varenne, gardien de l’arrière-boutique, résidente). */
  questNpcs: { id: string; x: number; z: number; y: number; color: number }[];
  /** Route de l’agent des archives (M02) : dépôt → avenue → rue basse → quai → coteau → route du nord → départ. */
  agentRoute: { x: number; z: number; y: number }[];
  /** Patrouilles Civis de La Dalle (M03 et suivantes). */
  dallePatrols: PatrolDef[];
  /** Caméra du couloir de la salle de contrôle (M06). */
  extraCams: CamDef[];
  /** Carte annotée du garage, révélée à la fin d’U04. */
  mapDecal: THREE.Mesh;
  /** Panneau de contrats communs (bible 03), à l’angle du garage. */
  board: { x: number; z: number };
}

export interface BuiltGrate {
  def: GrateDef;
  mesh: THREE.Mesh;
  collider: RAPIER.Collider;
  open: boolean;
  openT: number; // 0 fermée → 1 coulissée
}

export class LevelBuilder {
  root = new THREE.Group();
  fades: FadeZone[] = [];
  grates: BuiltGrate[] = [];
  private mats = new Map<string, THREE.MeshStandardMaterial>();

  constructor(public world: RAPIER.World) {}

  mat(key: string, params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
    let m = this.mats.get(key);
    if (!m) { m = new THREE.MeshStandardMaterial(params); this.mats.set(key, m); }
    return m;
  }

  add(mesh: THREE.Mesh) { this.root.add(mesh); return mesh; }

  /** Boîte visuelle + collider cuboïde statique. */
  box(o: {
    x: number; y: number; z: number; w: number; h: number; d: number;
    mat: THREE.Material; collide?: boolean; rotX?: number; rotZ?: number; name?: string;
  }): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), o.mat);
    mesh.position.set(o.x, o.y, o.z);
    mesh.rotation.set(o.rotX ?? 0, 0, o.rotZ ?? 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = o.name ?? '';
    this.root.add(mesh);
    if (o.collide !== false) {
      const cd = RAPIER.ColliderDesc.cuboid(o.w / 2, o.h / 2, o.d / 2)
        .setTranslation(o.x, o.y, o.z)
        .setCollisionGroups(G_STATIC);
      if (o.rotX || o.rotZ) {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rotX ?? 0, 0, o.rotZ ?? 0));
        cd.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      }
      this.world.createCollider(cd);
    }
    return mesh;
  }

  /** Rampe le long de Z : hauteur yA en zA → yB en zB. Épaisseur 0.5, surface au niveau indiqué. */
  ramp(o: { x: number; zA: number; yA: number; zB: number; yB: number; w: number; mat: THREE.Material; collide?: boolean; rail?: boolean }): THREE.Mesh {
    const dz = o.zB - o.zA, dy = o.yB - o.yA;
    const len = Math.hypot(dz, dy);
    const ang = -Math.atan2(dy, dz);
    const h = o.rail ? 0.9 : 0.5;
    const yMid = (o.yA + o.yB) / 2 + (o.rail ? 0.75 : -0.24);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(o.w, h, len), o.mat);
    mesh.position.set(o.x, yMid, (o.zA + o.zB) / 2);
    mesh.rotation.x = ang;
    mesh.castShadow = true;
    this.root.add(mesh);
    if (o.collide !== false) {
      const cd = RAPIER.ColliderDesc.cuboid(o.w / 2, h / 2, len / 2)
        .setTranslation(o.x, yMid, (o.zA + o.zB) / 2)
        .setCollisionGroups(G_STATIC);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(ang, 0, 0));
      cd.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      this.world.createCollider(cd);
    }
    return mesh;
  }

  /** Plan au sol sans collision. */
  floor(x: number, z: number, w: number, d: number, mat: THREE.Material, y = 0.03): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  fade(minX: number, minZ: number, maxX: number, maxZ: number, maxY: number, meshes: THREE.Mesh[]): void {
    const mats: THREE.MeshStandardMaterial[] = [];
    for (const m of meshes) {
      const src = m.material as THREE.MeshStandardMaterial;
      const clone = src.clone();
      clone.transparent = true;
      m.material = clone;
      mats.push(clone);
    }
    this.fades.push({ min: new THREE.Vector2(minX, minZ), max: new THREE.Vector2(maxX, maxZ), maxY, mats, target: 1 });
  }

  grate(def: GrateDef): BuiltGrate {
    const mat = this.mat('grate', { color: 0x39434d, metalness: 0.85, roughness: 0.4 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(def.w, 0.3, 0.5), mat);
    mesh.position.set(def.x, def.h - 0.15, def.z);
    for (let i = 0; i < 5; i++) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, def.h - 0.3, 0.4),
        this.mat('grateBar', { color: 0x11161c, metalness: 0.9, roughness: 0.3 }),
      );
      bar.position.set(-def.w / 2 + (i + 0.5) * (def.w / 5), -def.h / 2 + 0.15, 0);
      mesh.add(bar);
    }
    // voyant vert « accès de service » (DA)
    const led = new THREE.Mesh(
      new THREE.BoxGeometry(def.w * 0.7, 0.1, 0.12),
      this.mat('grateLed', { color: 0x05070a, emissive: 0x82d9af, emissiveIntensity: 1.8 }),
    );
    led.position.set(0, -def.h + 0.28, 0.26);
    mesh.add(led);
    mesh.castShadow = true;
    this.root.add(mesh);
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(def.w / 2, def.h / 2, 0.25)
        .setTranslation(def.x, def.h / 2, def.z)
        .setCollisionGroups(G_STATIC),
    );
    const built: BuiltGrate = { def, mesh, collider, open: false, openT: 0 };
    this.grates.push(built);
    return built;
  }
}

/** Bloc d'immeuble : corps + socle calcaire + bandeau de fenêtres sud + toit détaillé. */
function addBlock(
  B: LevelBuilder, x1: number, z1: number, x2: number, z2: number, h: number,
  wallMat: THREE.MeshStandardMaterial, winColor: number,
): { meshes: THREE.Mesh[]; x1: number; z1: number; x2: number; z2: number } {
  const w = x2 - x1, d = z2 - z1;
  const body = B.box({ x: (x1 + x2) / 2, y: h / 2, z: (z1 + z2) / 2, w, h, d, mat: wallMat });
  // socle calcaire (DA : base claire des façades)
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.16, 1.3, d + 0.16),
    B.mat('calcaire', { color: 0x6e6656, roughness: 0.9 }),
  );
  plinth.position.set((x1 + x2) / 2, 0.65, (z1 + z2) / 2);
  plinth.castShadow = true;
  B.root.add(plinth);
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.78, Math.min(1.5, h * 0.15), 0.12),
    B.mat(`win-${x1}-${z1}-${winColor}`, { color: 0x05070a, emissive: winColor, emissiveIntensity: 2.2, roughness: 0.6 }),
  );
  band.position.set((x1 + x2) / 2, h * 0.62, z2 + 0.1);
  B.root.add(band);
  const meshes: THREE.Mesh[] = [body, band, plinth];
  // détails de toit : bandeaux lumineux + clim/ateliers (vus du-dessus)
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const strip = B.mat(`roofstrip-${winColor}`, { color: 0x05070a, emissive: winColor, emissiveIntensity: 1.8, roughness: 0.5 });
  const acMat = B.mat('roofac', { color: 0x1a2028, roughness: 0.9 });
  const s1 = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 0.14, 0.5), strip);
  s1.position.set(cx, h + 0.09, cz - d * 0.28);
  const s2 = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, 0.14, 0.5), strip);
  s2.position.set(cx, h + 0.09, cz + d * 0.3);
  B.root.add(s1, s2);
  meshes.push(s1, s2);
  for (const [ox, oz, sw, sd] of [[-0.3, -0.1, 3, 2.4], [0.28, 0.15, 2.2, 3], [-0.1, 0.32, 2.6, 2]] as [number, number, number, number][]) {
    const ac = new THREE.Mesh(new THREE.BoxGeometry(sw, 1.1, sd), acMat);
    ac.position.set(cx + ox * w, h + 0.55, cz + oz * d);
    ac.castShadow = true;
    B.root.add(ac);
    meshes.push(ac);
  }
  return { meshes, x1, z1, x2, z2 };
}

export function buildLevel(world: RAPIER.World): { data: LevelData; grates: BuiltGrate[]; train: THREE.Group } {
  const B = new LevelBuilder(world);
  const M = {
    asphalt: B.mat('asphalt', { color: 0x1e242f, roughness: 0.95 }),
    road: B.mat('road', { color: 0x242b38, roughness: 0.9 }),
    sidewalk: B.mat('sidewalk', { color: 0x2e3846, roughness: 0.9 }),
    plaza: B.mat('plaza', { color: 0x333c49, roughness: 0.85 }),
    concrete: B.mat('concrete', { color: 0x414a56, roughness: 0.9 }),
    wallA: B.mat('wallA', { color: 0x39434f, roughness: 0.85 }),
    wallB: B.mat('wallB', { color: 0x454e5d, roughness: 0.8 }),
    wallC: B.mat('wallC', { color: 0x353e4a, roughness: 0.9 }),
    depot: B.mat('depot', { color: 0x4a545e, roughness: 0.75, metalness: 0.25 }),
    roof: B.mat('roof', { color: 0x2a313c, roughness: 0.9 }),
    metal: B.mat('metal', { color: 0x5d6a77, metalness: 0.8, roughness: 0.35 }),
    dark: B.mat('dark', { color: 0x171c26, roughness: 0.9 }),
    wood: B.mat('wood', { color: 0x6a5438, roughness: 0.95 }),
    hazard: B.mat('hazard', { color: 0x584a16, roughness: 0.8, emissive: 0x38300c, emissiveIntensity: 0.9 }),
    van: B.mat('van', { color: 0x3f6a60, roughness: 0.6, metalness: 0.3 }),
    line: B.mat('line', { color: 0x7d8a99, roughness: 0.9, emissive: 0x39424e, emissiveIntensity: 0.7 }),
    rail: B.mat('rail', { color: 0x8a97a8, metalness: 0.9, roughness: 0.25 }),
    parked: B.mat('parked', { color: 0x232830, roughness: 0.5, metalness: 0.5 }),
  };
  const neon = (c: number) => B.mat(`neon-${c}`, { color: 0x05070a, emissive: c, emissiveIntensity: 2.8, roughness: 0.4 });
  const blocks: { meshes: THREE.Mesh[]; x1: number; z1: number; x2: number; z2: number }[] = [];

  // ------------------------------------------------------------------ sol
  const ground = new THREE.Mesh(new THREE.BoxGeometry(230, 1, 178), M.dark);
  ground.position.set(110, -0.5, 85);
  ground.receiveShadow = true;
  B.root.add(ground);
  world.createCollider(RAPIER.ColliderDesc.cuboid(115, 0.5, 89).setTranslation(110, -0.5, 85).setCollisionGroups(G_STATIC));

  // ------------------------------------------------------------------ routes (plats)
  const roads: [number, number, number, number][] = [
    [124, 134, 176, 12],  // avenue x36..212 z128..140
    [29, 134, 12, 12],    // embranchement du pont
    [110, 14, 204, 12],   // route du nord z8..20
    [151, 33, 18, 26],    // route de la halle x142..160 z20..46
    [100, 125, 8, 82],    // rue des Ateliers x96..104 z84..166
    [204, 132, 12, 16],   // ruelle x198..210 z124..140
  ];
  for (const [x, z, w, d] of roads) B.floor(x, z, w, d, M.road, 0.03);
  B.floor(152.5, 51, 45, 22, M.plaza, 0.032); // place de remise x130..175 z40..62

  // marquages
  for (let x = 42; x < 208; x += 8) B.floor(x, 134, 3.4, 0.45, M.line, 0.05);
  for (let x = 46; x < 206; x += 8) B.floor(x, 14, 3.4, 0.45, M.line, 0.05);
  for (let i = 0; i < 6; i++) B.floor(143 + i * 3.2, 126.6, 1.5, 3, M.line, 0.05); // passage piéton dépôt

  // trottoirs
  B.floor(124, 125.8, 176, 2, M.sidewalk, 0.04);
  B.floor(124, 142.2, 176, 2, M.sidewalk, 0.04);
  B.floor(124, 145.6, 176, 2.6, M.sidewalk, 0.045);
  B.floor(110, 21.6, 204, 2.4, M.sidewalk, 0.04);
  B.floor(93.8, 125, 2.2, 42, M.sidewalk, 0.04);
  B.floor(106.2, 155, 2.2, 22, M.sidewalk, 0.04);

  // ------------------------------------------------------------------ remblai ferroviaire z62..84
  // Remplissage y0..2.2 percé de : galerie de service (x96..155, z78..84, entrée
  // par la grille x96..102 en z84) et passage inférieur (x147..155, z62..84).
  const fill = (x1: number, z1: number, x2: number, z2: number) =>
    B.box({ x: (x1 + x2) / 2, y: 1.1, z: (z1 + z2) / 2, w: x2 - x1, h: 2.2, d: z2 - z1, mat: M.concrete });
  fill(8, 62, 96, 84);    // F1 : ouest (sa face est = mur ouest du passage)
  fill(96, 62, 147, 78);  // F2 : nord de la galerie (face sud = mur nord de la galerie)
  fill(155, 62, 212, 84); // F3 : est (face ouest = mur est du passage)
  // linteaux
  const lidService = B.box({ x: 125.5, y: 2.32, z: 81, w: 59, h: 0.28, d: 6, mat: M.concrete }); // galerie x96..155 z78..84
  const lidUnder = B.box({ x: 151, y: 2.32, z: 70, w: 8, h: 0.28, d: 16, mat: M.concrete });      // passage x147..155 z62..78
  // mur sud de la galerie (z=84) entre la grille de service et le passage inférieur
  // (le passage lui-même reste ouvert : son accès est filtré par les bornes)
  B.box({ x: 124.5, y: 1.1, z: 84.2, w: 45, h: 2.2, d: 0.5, mat: M.wallC }); // x102..147
  // sols intérieurs des galeries
  B.floor(125.5, 81, 59, 6, M.asphalt, 0.05);
  B.floor(151, 73, 8, 24, M.asphalt, 0.05);
  // rails + traverses (déco, sur le remblai y2.3)
  for (const tz of [66, 71]) {
    B.box({ x: 110, y: 2.36, z: tz - 0.55, w: 204, h: 0.1, d: 0.14, mat: M.rail, collide: false });
    B.box({ x: 110, y: 2.36, z: tz + 0.55, w: 204, h: 0.1, d: 0.14, mat: M.rail, collide: false });
  }
  for (let x = 10; x < 210; x += 3.4) B.box({ x, y: 2.3, z: 68.5, w: 0.5, h: 0.08, d: 7.4, mat: M.wood, collide: false });

  // ------------------------------------------------------------------ pont routier (deck y6.2..6.5)
  const rampS = B.ramp({ x: 29, zA: 128, yA: 0, zB: 84, yB: 6.5, w: 12, mat: M.concrete });
  const deck = B.box({ x: 29, y: 6.2, z: 73, w: 12, h: 0.6, d: 26, mat: M.concrete });
  const rampN = B.ramp({ x: 29, zA: 60, yA: 6.5, zB: 20, yB: 0, w: 12, mat: M.concrete });
  const bridgeMeshes: THREE.Mesh[] = [rampS, deck, rampN];
  for (const bx of [22, 36]) {
    bridgeMeshes.push(B.box({ x: bx, y: 7.05, z: 73, w: 0.35, h: 1.1, d: 26, mat: M.metal }));
    bridgeMeshes.push(B.ramp({ x: bx, zA: 128, yA: 0.35, zB: 84, yB: 6.85, w: 0.35, mat: M.metal, rail: true }));
    bridgeMeshes.push(B.ramp({ x: bx, zA: 60, yA: 6.85, zB: 20, yB: 0.35, w: 0.35, mat: M.metal, rail: true }));
  }
  for (const [px, pz] of [[24.5, 60], [33.5, 86], [24.5, 96]]) {
    B.box({ x: px, y: 2.9, z: pz, w: 1.4, h: 5.8, d: 1.4, mat: M.concrete });
  }
  // néons du pont
  B.box({ x: 29, y: 6.85, z: 60.6, w: 11, h: 0.14, d: 0.14, mat: neon(0x00f0ff), collide: false });
  B.box({ x: 29, y: 6.85, z: 85.4, w: 11, h: 0.14, d: 0.14, mat: neon(0x00f0ff), collide: false });

  // ------------------------------------------------------------------ blocs d'immeubles
  blocks.push(addBlock(B, 8, 20, 44, 40, 11, M.wallB, 0x2b4a5f));     // B1a
  blocks.push(addBlock(B, 44, 20, 88, 40, 9, M.wallA, 0x1f3a4a));     // B1b
  blocks.push(addBlock(B, 88, 20, 128, 40, 12, M.wallB, 0x35284a));   // B1c
  // B2 devient les ARCHIVES CIVIS (M02 « Date d’effet »)
  B.box({ x: 194, y: 2.75, z: 38, w: 32, h: 5.5, d: 0.7, mat: M.wallA });       // sud
  B.box({ x: 178, y: 2.75, z: 30, w: 0.7, h: 5.5, d: 16, mat: M.wallA });        // ouest
  B.box({ x: 210, y: 2.75, z: 25, w: 0.7, h: 5.5, d: 6, mat: M.wallA });         // est (nord)
  B.box({ x: 210, y: 2.75, z: 34.5, w: 0.7, h: 5.5, d: 7, mat: M.wallA });       // est (sud)
  B.box({ x: 183, y: 2.75, z: 22, w: 10, h: 5.5, d: 0.7, mat: M.wallA });        // nord (ouest)
  B.box({ x: 202, y: 2.75, z: 22, w: 16, h: 5.5, d: 0.7, mat: M.wallA });        // nord (est)
  const archivesRoof = B.box({ x: 194, y: 5.65, z: 30, w: 33, h: 0.4, d: 17, mat: M.roof, collide: false });
  B.floor(194, 30, 31, 15, M.concrete, 0.05);
  B.box({ x: 194, y: 0.55, z: 30, w: 1.6, h: 1.1, d: 1.0, mat: M.metal });       // pupitre du calendrier
  B.box({ x: 194, y: 5.9, z: 21.4, w: 10, h: 0.9, d: 0.3, mat: neon(0xffb347), collide: false });
  B.grate({ id: 'porte-archives', x: 193, z: 22, w: 6, h: 4.2, byIntrusion: false, byStory: true });
  B.grate({ id: 'porte-archives-cote', x: 210, z: 29.5, w: 3, h: 2.4, byIntrusion: true, byStory: false });
  blocks.push(addBlock(B, 8, 88, 34, 124, 9, M.wallA, 0x1f3a4a));     // B3a
  blocks.push(addBlock(B, 34, 88, 64, 124, 8, M.wallB, 0x2b4a5f));    // B3b
  blocks.push(addBlock(B, 64, 88, 92, 124, 10, M.wallA, 0x1f3a4a));   // B3c
  blocks.push(addBlock(B, 104, 112, 134, 124, 8, M.wallC, 0x3a1f33)); // B4a boutiques
  blocks.push(addBlock(B, 134, 112, 162, 124, 9, M.wallC, 0x1f4a35)); // B4b
  blocks.push(addBlock(B, 162, 112, 190, 124, 7, M.wallC, 0x4a3a1f)); // B4c

  // ------------------------------------------------------------------ dépôt NOVAK x118..190 z88..124
  const depotWalls: THREE.Mesh[] = [];
  // mur sud (z=124) : portail x144..160 + porte piétonne x124..128
  depotWalls.push(B.box({ x: 131, y: 3.25, z: 124, w: 26, h: 6.5, d: 0.8, mat: M.depot }));   // x118..144
  depotWalls.push(B.box({ x: 137.5, y: 1.7, z: 124, w: 5, h: 3.4, d: 0.9, mat: M.dark, collide: false })); // porte (visuel)
  depotWalls.push(B.box({ x: 175, y: 3.25, z: 124, w: 30, h: 6.5, d: 0.8, mat: M.depot }));   // x160..190
  B.box({ x: 152, y: 5.1, z: 124.3, w: 17, h: 3.2, d: 0.25, mat: M.depot, collide: false });  // rideau levé
  // mur nord (z=88) : quais x130..142 et x158..170
  depotWalls.push(B.box({ x: 124, y: 3.25, z: 88, w: 12, h: 6.5, d: 0.8, mat: M.depot }));    // x118..130
  depotWalls.push(B.box({ x: 150, y: 3.25, z: 88, w: 16, h: 6.5, d: 0.8, mat: M.depot }));    // x142..158
  depotWalls.push(B.box({ x: 180, y: 3.25, z: 88, w: 20, h: 6.5, d: 0.8, mat: M.depot }));    // x170..190
  // murs ouest/est ; porte latérale est z92..98
  depotWalls.push(B.box({ x: 118, y: 3.25, z: 106, w: 0.8, h: 6.5, d: 36, mat: M.depot }));
  depotWalls.push(B.box({ x: 190, y: 3.25, z: 91, w: 0.8, h: 6.5, d: 6, mat: M.depot }));     // z88..94
  depotWalls.push(B.box({ x: 190, y: 3.25, z: 111.5, w: 0.8, h: 6.5, d: 25, mat: M.depot })); // z99..124
  const depotRoof = B.box({ x: 154, y: 6.7, z: 106, w: 74, h: 0.5, d: 38, mat: M.roof, collide: false });
  B.floor(154, 106, 71, 35, M.concrete, 0.045);
  // bandeau lumineux + logo
  B.box({ x: 154, y: 7.02, z: 105.4, w: 72, h: 0.18, d: 0.18, mat: neon(0xffb347), collide: false });
  B.box({ x: 152, y: 6.6, z: 123.2, w: 12, h: 1.4, d: 0.25, mat: neon(0xffb347), collide: false });
  // bureau de contrôle (x118..134 z88..98), porte sud x124..128
  const officeWalls: THREE.Mesh[] = [
    B.box({ x: 121, y: 1.6, z: 98, w: 6, h: 3.2, d: 0.5, mat: M.wallB }),   // x118..124
    B.box({ x: 131, y: 1.6, z: 98, w: 6, h: 3.2, d: 0.5, mat: M.wallB }),   // x128..134
    B.box({ x: 134, y: 1.6, z: 93, w: 0.5, h: 3.2, d: 10, mat: M.wallB }),  // est
  ];
  const officeRoof = B.box({ x: 126, y: 3.35, z: 93, w: 16, h: 0.3, d: 10, mat: M.roof, collide: false });
  B.box({ x: 126, y: 0.55, z: 90.5, w: 3, h: 1.1, d: 1.4, mat: M.metal });  // pupitre (support puce)
  // rayonnages (bloquent tirs et ligne de vue)
  for (const [rx, rz] of [[134, 102], [150, 102], [166, 102], [134, 110], [150, 110], [166, 110]] as [number, number][]) {
    B.box({ x: rx, y: 1.3, z: rz, w: 12, h: 2.6, d: 1.6, mat: M.metal });
  }

  // ------------------------------------------------------------------ cour du dépôt x190..210 z88..124
  B.box({ x: 191.5, y: 1.1, z: 88, w: 3, h: 2.2, d: 0.6, mat: M.wallA });    // x190..193
  B.box({ x: 201.5, y: 1.1, z: 88, w: 5, h: 2.2, d: 0.6, mat: M.wallA });    // x199..204 (lane est ouverte)
  B.box({ x: 193, y: 1.4, z: 124, w: 6, h: 2.8, d: 0.6, mat: M.wallA });     // x190..196
  B.box({ x: 209, y: 1.4, z: 124, w: 2, h: 2.8, d: 0.6, mat: M.wallA });     // x208..210
  // bajoyers de la ruelle
  B.box({ x: 197, y: 1.4, z: 130, w: 0.6, h: 2.8, d: 12, mat: M.wallA });
  B.box({ x: 207, y: 1.4, z: 130, w: 0.6, h: 2.8, d: 12, mat: M.wallA });
  B.floor(200, 106, 20, 36, M.asphalt, 0.035);

  // ------------------------------------------------------------------ quai z84..88
  B.floor(154, 86, 72, 4, M.hazard, 0.045);   // quai devant le dépôt
  B.floor(81, 86, 30, 4, M.asphalt, 0.035);   // arrière-ruelle ouest (x66..96)
  B.floor(207, 86, 6, 4, M.asphalt, 0.035);   // lane est
  B.box({ x: 66, y: 1.1, z: 86, w: 0.6, h: 2.2, d: 4, mat: M.wallA });       // fond de l'arrière-ruelle
  // bornes du passage inférieur et de la galerie (piétons uniquement)
  for (const [bx, bz] of [[148.6, 85.4], [153.4, 85.4], [148.6, 60.6], [153.4, 60.6], [98, 85.3], [102, 85.3]]) {
    B.box({ x: bx, y: 0.55, z: bz, w: 0.36, h: 1.1, d: 0.36, mat: M.metal });
  }
  // grilles
  const g2 = B.grate({ id: 'grille-quai', x: 196, z: 88, w: 6, h: 2.2, byIntrusion: true, byStory: false });
  const g3 = B.grate({ id: 'grille-service', x: 99, z: 84.6, w: 6, h: 2.2, byIntrusion: false, byStory: true });

  // ------------------------------------------------------------------ garage de Mina (x74..92 z148..164)
  const garageWalls: THREE.Mesh[] = [
    B.box({ x: 83, y: 2.25, z: 148, w: 18, h: 4.5, d: 0.6, mat: M.wallB }),
    B.box({ x: 83, y: 2.25, z: 164, w: 18, h: 4.5, d: 0.6, mat: M.wallB }),
    B.box({ x: 74, y: 2.25, z: 156, w: 0.6, h: 4.5, d: 16, mat: M.wallB }),
    B.box({ x: 92, y: 2.25, z: 150, w: 0.6, h: 4.5, d: 4, mat: M.wallB }),
    B.box({ x: 92, y: 2.25, z: 162, w: 0.6, h: 4.5, d: 4, mat: M.wallB }),
    B.box({ x: 92, y: 3.9, z: 156, w: 0.6, h: 1.2, d: 8, mat: M.wallB }),
  ];
  const garageRoof = B.box({ x: 83, y: 4.7, z: 156, w: 18.6, h: 0.4, d: 16.6, mat: M.roof, collide: false });
  B.floor(83, 156, 17, 15, M.concrete, 0.05);
  B.box({ x: 76.6, y: 0.5, z: 159.5, w: 1.2, h: 1, d: 4, mat: M.wood });     // établi
  B.box({ x: 76.8, y: 0.4, z: 152.4, w: 1.1, h: 0.8, d: 1.1, mat: M.metal }); // caisse outils
  B.box({ x: 86, y: 4.4, z: 147.2, w: 8, h: 1.1, d: 0.3, mat: neon(0xffc370), collide: false }); // enseigne atelier (ambre)

  // ------------------------------------------------------------------ bar Le Signal (x142..166 z148..164)
  blocks.push(addBlock(B, 104, 146, 140, 166, 8, M.wallC, 0x2b4a5f));
  blocks.push(addBlock(B, 168, 146, 198, 166, 9, M.wallB, 0x1f3a4a)); // réduit : la rue basse (J02) passe à l'est
  const barWalls: THREE.Mesh[] = [
    B.box({ x: 146, y: 2, z: 148, w: 8, h: 4, d: 0.6, mat: M.wallC }),   // x142..150
    B.box({ x: 161, y: 2, z: 148, w: 10, h: 4, d: 0.6, mat: M.wallC }),  // x156..166
    B.box({ x: 142, y: 2, z: 156, w: 0.6, h: 4, d: 16, mat: M.wallC }),
    B.box({ x: 166, y: 2, z: 156, w: 0.6, h: 4, d: 16, mat: M.wallC }),
    B.box({ x: 154, y: 2, z: 164, w: 24, h: 4, d: 0.6, mat: M.wallC }),
  ];
  const barRoof = B.box({ x: 154, y: 4.2, z: 156, w: 25, h: 0.4, d: 17, mat: M.roof, collide: false });
  B.floor(154, 156, 23, 15, M.dark, 0.05);
  B.box({ x: 154, y: 0.55, z: 161.6, w: 14, h: 1.1, d: 0.8, mat: M.wood });  // comptoir
  B.box({ x: 154, y: 4.5, z: 145.4, w: 10, h: 1.3, d: 0.25, mat: neon(0xff2d78), collide: false });

  // autres enseignes face avenue
  B.box({ x: 119, y: 4.6, z: 111.2, w: 7, h: 1.1, d: 0.25, mat: neon(0xff2d78), collide: false });
  B.box({ x: 148, y: 5.2, z: 111.2, w: 6, h: 1.1, d: 0.25, mat: neon(0x52ff9a), collide: false });
  B.box({ x: 176, y: 4.4, z: 111.2, w: 6, h: 1.1, d: 0.25, mat: neon(0x00f0ff), collide: false });
  // entrées du passage (ouest : service — vert ; est : passage public — cyan)
  B.box({ x: 104.8, y: 2.5, z: 73, w: 0.6, h: 0.9, d: 2.6, mat: neon(0x82d9af), collide: false });
  B.box({ x: 197.2, y: 2.5, z: 73, w: 0.6, h: 0.9, d: 2.6, mat: neon(0x00f0ff), collide: false });

  // ------------------------------------------------------------------ place de remise + fourgonnette
  const vanBody = B.box({ x: 151, y: 1.05, z: 50.3, w: 2.1, h: 1.5, d: 4.4, mat: M.van });
  B.box({ x: 151, y: 0.95, z: 52.4, w: 1.9, h: 1.1, d: 0.6, mat: M.dark, collide: false });
  B.box({ x: 151, y: 1.9, z: 50.3, w: 1.6, h: 0.25, d: 3.6, mat: neon(0x52ff9a), collide: false });
  vanBody.castShadow = true;

  // ------------------------------------------------------------------ lampadaires
  const lampSpots: [number, number][] = [
    [60, 126.8], [120, 126.8], [180, 126.8], [60, 141.2], [120, 141.2], [180, 141.2],
    [50, 21.4], [110, 21.4], [170, 21.4], [151, 41.4], [151, 60.4], [100, 92], [100, 130],
    [201, 116], [140, 85.4], [170, 85.4],
  ];
  for (const [lx, lz] of lampSpots) {
    B.box({ x: lx, y: 2.1, z: lz, w: 0.16, h: 4.2, d: 0.16, mat: M.metal, collide: false });
    B.box({ x: lx, y: 4.25, z: lz, w: 0.9, h: 0.14, d: 0.4, mat: neon(0xbfe9ff), collide: false });
    B.floor(lx, lz, 6.5, 6.5, B.mat('pool', { color: 0x0a1420, emissive: 0x33526e, emissiveIntensity: 0.85, roughness: 1, transparent: true, opacity: 0.5 }), 0.06);
  }
  // lampes du passage public (toujours allumées) et de la galerie de service (U01)
  const galleryLampMat = B.mat('galleryLamp', { color: 0x05070a, emissive: 0xbfffe0, emissiveIntensity: 0.3, roughness: 0.5 });
  for (const [tx, tz] of [[151, 65], [151, 73], [151, 81]]) {
    B.box({ x: tx, y: 2.12, z: tz, w: 1.6, h: 0.08, d: 0.4, mat: neon(0x9fdcff), collide: false });
  }
  const galleryLamps: THREE.Mesh[] = [];
  for (const [tx, tz] of [[108, 81], [121.5, 81], [135, 81], [145, 81]]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.09, 0.5), galleryLampMat);
    lamp.position.set(tx, 2.1, tz);
    B.root.add(lamp);
    galleryLamps.push(lamp);
  }
  // panneau de commande de la grille de service (U01) — mur nord de la galerie
  const panelMat = B.mat('panel', { color: 0x2a3a32, roughness: 0.6, metalness: 0.5 });
  B.box({ x: 99, y: 1.15, z: 78.6, w: 0.8, h: 1.0, d: 0.35, mat: panelMat });
  const panelLed = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.12, 0.1),
    B.mat('panelLed', { color: 0x05070a, emissive: 0x82d9af, emissiveIntensity: 0.25, roughness: 0.5 }),
  );
  panelLed.position.set(99, 1.78, 78.35);
  B.root.add(panelLed);

  // ------------------------------------------------------------------ limites de carte
  // (ouvertures : J01 au nord-est, J02/rue basse au sud-est vers Les Quais)
  const fence = (x: number, z: number, w: number, d: number) =>
    B.box({ x, y: 1.25, z, w, h: 2.5, d, mat: M.wallA });
  fence(110, 6.6, 208, 1.2);
  fence(103, 168.6, 190, 1.2);   // x 8..198 (J02 au-delà)
  fence(6.6, 87.6, 1.2, 165);
  fence(211, 90, 1.2, 50);       // z 65..115 (J01 au nord, J02 au sud)

  // ------------------------------------------------------------------ train (cosmétique)
  const train = new THREE.Group();
  const wagonM = B.mat('train', { color: 0x39424d, metalness: 0.7, roughness: 0.4 });
  for (let i = 0; i < 6; i++) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(11, 2.5, 2.8), wagonM);
    w.position.set(i * 12.6, 1.3, 0);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.22, 2.9), neon(i % 2 ? 0xffb347 : 0x00f0ff));
    stripe.position.y = 0.5;
    w.add(stripe);
    train.add(w);
  }
  train.position.set(-80, 2.4, 68.5);
  B.root.add(train);

  // ------------------------------------------------------------------ volumes d'effacement
  B.fade(72.5, 146.5, 93.5, 165.5, 3.4, [...garageWalls, garageRoof]);
  B.fade(140.5, 146.5, 167.5, 165.5, 3.2, [...barWalls, barRoof]);
  B.fade(116.5, 84, 191.5, 125.5, 3.0, [...depotWalls, depotRoof, ...officeWalls, officeRoof]);
  B.fade(145.5, 60, 156.5, 86, 2.25, [lidUnder]);
  B.fade(94.5, 76, 156.5, 86, 2.25, [lidService]);
  B.fade(15, 38, 43, 92, 5.9, bridgeMeshes);
  B.fade(176.5, 21.5, 211.5, 38.5, 5.4, [archivesRoof]);
  for (const b of blocks) B.fade(b.x1 - 0.6, b.z1 - 9, b.x2 + 0.6, b.z2 + 0.6, 99, b.meshes);

  // ------------------------------------------------------------------ jalons de campagne (Forges)
  // panneau de contrats communs à l'angle du garage (bible 03)
  B.box({ x: 76.5, y: 1.5, z: 149.5, w: 0.3, h: 2.2, d: 1.6, mat: M.wood });
  B.box({ x: 76.3, y: 1.6, z: 149.5, w: 0.12, h: 1.5, d: 1.2, mat: neon(0x82d9af), collide: false });
  // carte annotée du garage, révélée à la fin d'U04
  const mapDecal = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 3.4),
    new THREE.MeshStandardMaterial({ color: 0x1c2a24, emissive: 0x3f7a5c, emissiveIntensity: 0.9, roughness: 0.9 }),
  );
  mapDecal.rotation.y = Math.PI / 2;
  mapDecal.position.set(74.4, 2.2, 156);
  mapDecal.visible = false;
  B.root.add(mapDecal);

  const data: LevelData = {
    root: B.root,
    spawn: { x: 83, z: 158 },
    carSpawn: { x: 99.5, z: 148, yaw: 0 },
    van: { x: 151, z: 50.3 },
    minaHome: { x: 86.5, z: 152.5 },
    minaVan: { x: 152.6, z: 49.4 },
    ysec: { x: 155, z: 158 },
    pedestal: { x: 126, z: 93 },
    crate: { x: 120, z: 86.5 },
    module: { x: 77.2, z: 158.2 },
    panel: { x: 99, z: 79.4 },
    galleryLamps,
    galleryLampMat,
    panelLed,
    patrols: [
      { name: 'hall', points: [{ x: 152, z: 118 }, { x: 152, z: 127.5 }, { x: 168, z: 116 }, { x: 136, z: 119 }] },
      { name: 'quai', points: [{ x: 110, z: 86 }, { x: 150, z: 86 }, { x: 178, z: 86 }, { x: 207, z: 86.5 }, { x: 200, z: 106 }] },
      { name: 'ruelle', points: [{ x: 202, z: 127.5 }, { x: 203, z: 134 }, { x: 150, z: 134 }, { x: 110, z: 134 }] },
      { name: 'entrepot', points: [{ x: 150, z: 118 }, { x: 178, z: 106 }, { x: 180, z: 95 }, { x: 140, z: 94 }, { x: 128, z: 106 }] },
    ],
    cameras: [
      { id: 'cam-portail', x: 152, z: 126.8, y: 3.5, baseYaw: Math.PI, sweep: 0.5 },
      { id: 'cam-quai', x: 110, z: 85.5, y: 3.0, baseYaw: Math.PI / 2, sweep: 0.75 },
    ],
    medkits: [{ x: 78, z: 162 }, { x: 100, z: 86.5 }, { x: 155, z: 54 }],
    ammo: [{ x: 80, z: 160 }, { x: 181, z: 120 }, { x: 140, z: 86 }, { x: 150, z: 30 }],
    props: [
      { x: 137, z: 86.8, size: 1.0 }, { x: 139.2, z: 85.6, size: 0.8 },
      { x: 196, z: 116, size: 1.0 }, { x: 198.4, z: 114.4, size: 0.8 },
      { x: 182, z: 118, size: 1.0 }, { x: 176, z: 121, size: 0.8 },
      { x: 160, z: 56, size: 1.0 }, { x: 105, z: 86.6, size: 0.8 },
    ],
    parkedCars: [
      { x: 60, z: 138.6, yaw: 0 }, { x: 90, z: 138.6, yaw: 0 }, { x: 124, z: 138.6, yaw: 0 },
      { x: 50, z: 18.6, yaw: 0 }, { x: 180, z: 128.7, yaw: 0 },
    ],
    fades: B.fades,
    questProps: [
      { id: 'calendrier', x: 194, z: 30.5, y: 1.35 },   // M02
      { id: 'colis-signal', x: 154, z: 161.5, y: 1.35 }, // C01 (comptoir du Signal)
      { id: 'colis-relais', x: 76.8, z: 159.5, y: 1.35 },// C02 (établi du garage)
    ],
    questNpcs: [],
    agentRoute: [
      { x: 152, z: 122, y: 0 }, { x: 152, z: 127, y: 0 }, { x: 180, z: 131.2, y: 0 },
      { x: 204, z: 131.2, y: 0 }, { x: 206, z: 150, y: 0 }, { x: 209, z: 190, y: 0 },
      { x: 209, z: 208, y: 1.6 }, { x: 206, z: 216, y: 2 }, { x: 150, z: 212, y: 2 },
      { x: 60, z: 212, y: 2 }, { x: 24, z: 212, y: 2 }, { x: 206, z: 214, y: 2 },
      { x: 236, z: 226, y: 2.2 }, { x: 246, z: 214, y: 2.8 }, { x: 243, z: 170, y: 3.6 },
      { x: 243, z: 60, y: 4 }, { x: 246, z: 26, y: 4 }, { x: 232, z: 14, y: 1.6 },
      { x: 193, z: 15, y: 0 },
    ],
    dallePatrols: [],
    extraCams: [],
    mapDecal,
    board: { x: 76.5, z: 149.5 },
  };

  void g2; void g3;
  return { data, grates: B.grates, train };
}
