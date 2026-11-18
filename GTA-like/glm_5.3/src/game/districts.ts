/**
 * Les quatre quartiers supplémentaires — bible 06 (plans) et 08 (carte globale).
 *
 * Hauteurs : Les Forges 0 · Les Quais quai haut +2 / promenade 0 · La Dalle +4
 * (galeries piétonnes 4 → 12) · Le Nœud +12 (plateau derrière remparts) ·
 * Les Belvédères rampe 4 → 12 + terrasses.
 *
 * Jonctions : J01 Forges→Dalle (nord), J02 Forges→Quais (rue basse),
 * J03 Quais→Dalle (montante), J04 Dalle→Nœud (rampe routière),
 * S02 Dalle→Nœud (galerie piétonne séparée), J05 Dalle→Belvédères (montée),
 * J06 Belvédères→Nœud (avenue de ceinture).
 */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { LevelBuilder, type FadeZone, type PatrolDef, type CamDef } from './level';
import { G_STATIC } from './defs';

export interface PedRoute {
  district: 'forges' | 'dalle' | 'noeud' | 'quais' | 'belvederes';
  points: { x: number; z: number; y: number }[];
}
export interface NpcDef { id: 'nadia' | 'lise' | 'sorel'; x: number; z: number; y: number; color: number }
export interface DistrictsData {
  root: THREE.Group;
  fades: FadeZone[];
  /** Portes et grilles de campagne construites dans les quartiers. */
  grates: import('./level').BuiltGrate[];
  pedRoutes: PedRoute[];
  npcs: NpcDef[];
  questProps: { id: string; x: number; z: number; y?: number }[];
  questNpcs: { id: string; x: number; z: number; y: number; color: number }[];
  dallePatrols: PatrolDef[];
  extraCams: CamDef[];
  guards: PatrolDef[];
  cams: CamDef[];
  /** Grande boucle inter-quartiers pour le trafic (Y interpolés). */
  trafficLoop: { x: number; z: number; y: number }[];
}

export function buildDistricts(world: RAPIER.World): DistrictsData {
  const B = new LevelBuilder(world);
  const M = {
    base: B.mat('d-base', { color: 0x14181f, roughness: 1 }),
    dalleSlab: B.mat('d-dalle', { color: 0x4a423b, roughness: 0.9 }),
    dalleWall: B.mat('d-mur', { color: 0x5c5049, roughness: 0.9 }),
    enduit: B.mat('d-enduit', { color: 0x6e675c, roughness: 0.85 }),
    noeudSlab: B.mat('n-dalle', { color: 0x333a46, roughness: 0.85 }),
    noeudWall: B.mat('n-mur', { color: 0x3d4552, roughness: 0.8 }),
    pierre: B.mat('n-pierre', { color: 0x76808c, roughness: 0.7 }),
    quaisSlab: B.mat('q-dalle', { color: 0x3d4148, roughness: 0.9 }),
    bois: B.mat('q-bois', { color: 0x6a5438, roughness: 0.95 }),
    metal: B.mat('d-metal', { color: 0x4a545e, metalness: 0.8, roughness: 0.35 }),
    eau: B.mat('eau', { color: 0x0a1420, roughness: 0.25, metalness: 0.6, emissive: 0x0a2033, emissiveIntensity: 0.5 }),
    veget: B.mat('veget', { color: 0x1e3a2a, roughness: 1 }),
    banc: B.mat('banc', { color: 0x554a3a, roughness: 0.9 }),
    route: B.mat('d-route', { color: 0x242b38, roughness: 0.9 }),
    ligne: B.mat('d-ligne', { color: 0x7d8a99, roughness: 0.9, emissive: 0x39424e, emissiveIntensity: 0.7 }),
  };
  const neon = (c: number) => B.mat(`d-neon-${c}`, { color: 0x05070a, emissive: c, emissiveIntensity: 2.8, roughness: 0.4 });

  // ------------------------------------------------------------ socle global
  const base = new THREE.Mesh(new THREE.BoxGeometry(600, 1, 480), M.base);
  base.position.set(290, -0.5, 70);
  base.receiveShadow = true;
  B.root.add(base);
  world.createCollider(RAPIER.ColliderDesc.cuboid(300, 0.5, 240).setTranslation(290, -0.5, 70).setCollisionGroups(G_STATIC));

  /** Dalle-plateforme (quartier surélevé) + face de soutènement côté ouest/sud. */
  const platform = (x1: number, z1: number, x2: number, z2: number, h: number, mat: THREE.Material) => {
    B.box({ x: (x1 + x2) / 2, y: h / 2, z: (z1 + z2) / 2, w: x2 - x1, h, d: z2 - z1, mat });
    B.floor((x1 + x2) / 2, (z1 + z2) / 2, x2 - x1, z2 - z1, mat, h + 0.03);
  };
  /** Rampe le long de X : yA en xA → yB en xB. */
  const rampX = (xA: number, yA: number, xB: number, yB: number, z: number, w: number, mat: THREE.Material) => {
    const dx = xB - xA, dy = yB - yA;
    const len = Math.hypot(dx, dy);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, w), mat);
    mesh.position.set((xA + xB) / 2, (yA + yB) / 2 - 0.24, z);
    mesh.rotation.z = Math.atan2(dy, dx);
    mesh.castShadow = true;
    B.root.add(mesh);
    const cd = RAPIER.ColliderDesc.cuboid(len / 2, 0.25, w / 2)
      .setTranslation((xA + xB) / 2, (yA + yB) / 2 - 0.24, z)
      .setCollisionGroups(G_STATIC);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.atan2(dy, dx)));
    cd.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    world.createCollider(cd);
    return mesh;
  };

  // ============================================================ LA DALLE (Y=4)
  platform(252, 30, 420, 170, 4, M.dalleSlab);
  // immeubles du coteau (enduit ocre, fenêtres chaudes) — 3 rangées en paliers
  const dalleBlocks: [number, number, number, number][] = [
    [260, 120, 300, 164], [306, 120, 326, 164], [352, 120, 392, 164],
    [260, 72, 300, 112], [306, 72, 326, 112], [352, 72, 392, 112],
    [260, 34, 300, 64], [306, 34, 326, 64], [352, 34, 420, 64],
  ];
  for (const [x1, z1, x2, z2] of dalleBlocks) {
    const h = 8 + ((x1 + z1) % 3) * 2;
    const mesh = B.box({ x: (x1 + x2) / 2, y: 4 + h / 2, z: (z1 + z2) / 2, w: x2 - x1, h, d: z2 - z1, mat: M.enduit });
    void mesh;
    const band = new THREE.Mesh(
      new THREE.BoxGeometry((x2 - x1) * 0.7, 1.2, 0.14),
      B.mat(`d-win-${x1}-${z1}`, { color: 0x05070a, emissive: 0xffc9a0, emissiveIntensity: 2.0, roughness: 0.6 }),
    );
    band.position.set((x1 + x2) / 2, 4 + h * 0.6, z2 + 0.12);
    B.root.add(band);
    // auvents/bâches colorés (DA Dalle : identifier les paliers)
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry((x2 - x1) * 0.4, 0.14, 1.4),
      B.mat(`d-awn-${x1}-${z1}`, { color: [0x8a3344, 0x33815a, 0x816b2b, 0x3f5d8a][(x1 + z1) % 4], roughness: 0.9 }),
    );
    awning.position.set((x1 + x2) / 2, 6.4, z2 + 0.8);
    B.root.add(awning);
  }
  // galerie piétonne 4 → 12 (colonnades + paliers), le long de x 330..346
  {
    const dx = 0, dz = -120, dy = 8;
    const len = Math.hypot(dz, dy);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(16, 0.5, len), M.dalleWall);
    mesh.position.set(338, 4 + dy / 2 - 0.24, 100);
    mesh.rotation.x = -Math.atan2(dy, dz);
    mesh.castShadow = true;
    B.root.add(mesh);
    const cd = RAPIER.ColliderDesc.cuboid(8, 0.25, len / 2)
      .setTranslation(338, 4 + dy / 2 - 0.24, 100)
      .setCollisionGroups(G_STATIC);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.atan2(dy, dz), 0, 0));
    cd.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    world.createCollider(cd);
  }
  // toit de la galerie (effaçable) + colonnes
  const galRoof = B.box({ x: 338, y: 12.6, z: 100, w: 18, h: 0.4, d: 130, mat: M.enduit, collide: false });
  for (let z = 44; z <= 156; z += 14) {
    const y = 4 + ((160 - z) / 120) * 8;
    for (const px of [331, 345]) {
      B.box({ x: px, y: y + 2.2, z, w: 0.7, h: 4.4, d: 0.7, mat: M.pierre });
    }
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.4), neon(0xffc9a0));
    lamp.position.set(338, y + 4.5, z);
    B.root.add(lamp);
  }
  // permanence de Nadia (palier sud) — horodatée bible M03
  B.box({ x: 300, y: 6.6, z: 136, w: 14, h: 5.2, d: 10, mat: M.enduit });
  B.box({ x: 300, y: 9.6, z: 130.8, w: 7, h: 1, d: 0.3, mat: neon(0xffc9a0), collide: false });
  B.floor(300, 122, 20, 14, M.dalleWall, 4.05);
  // ============================================================ LE NŒUD (Y=12)
  // plateau découpé : porte sud (rampe J04) x 300..324, porte galerie x 330..346, porte est x 418..430
  platform(252, -150, 300, -20, 12, M.noeudSlab);
  platform(324, -150, 330, -20, 12, M.noeudSlab);
  platform(346, -150, 418, -110, 12, M.noeudSlab);
  platform(346, -98, 418, -20, 12, M.noeudSlab);
  platform(418, -110, 430, -98, 12, M.noeudSlab); // seuil de la porte est
  // linteaux de porte (au-dessus des seuils : les passages restent libres)
  B.box({ x: 312, y: 14.2, z: -26, w: 24, h: 1.4, d: 1.2, mat: M.pierre, collide: false });
  B.box({ x: 338, y: 14.2, z: -26, w: 16, h: 1.4, d: 1.2, mat: M.pierre, collide: false });
  B.box({ x: 424, y: 14.2, z: -110, w: 1.2, h: 1.4, d: 24, mat: M.pierre, collide: false });
  // bandeaux de rempart le long des faces sud et ouest
  B.box({ x: 341, y: 12.4, z: -19.2, w: 178, h: 0.9, d: 1.6, mat: M.pierre, collide: false });
  B.box({ x: 252.8, y: 12.4, z: -85, w: 1.6, h: 0.9, d: 130, mat: M.pierre, collide: false });
  // bâtiments administratifs (ardoise + pierre claire, blanc froid)
  const noeudBlocks: [number, number, number, number, number][] = [
    [262, -130, 316, -84, 14], [326, -130, 380, -84, 16], [390, -138, 424, -90, 12],
    [262, -74, 316, -34, 10], [326, -74, 394, -40, 13], [402, -76, 424, -40, 9],
  ];
  for (const [x1, z1, x2, z2, h] of noeudBlocks) {
    B.box({ x: (x1 + x2) / 2, y: 12 + h / 2, z: (z1 + z2) / 2, w: x2 - x1, h, d: z2 - z1, mat: M.noeudWall });
    const strip = new THREE.Mesh(new THREE.BoxGeometry((x2 - x1) * 0.8, 1, 0.16), neon(0xd6dce1));
    strip.position.set((x1 + x2) / 2, 12 + h * 0.55, z2 + 0.14);
    B.root.add(strip);
  }
  // guichets + annexe (filière Sorel) à l'ouest, près de l'arrivée de la rampe J04
  B.box({ x: 268, y: 13.1, z: -46, w: 10, h: 2.2, d: 4, mat: M.pierre });
  B.box({ x: 268, y: 14.5, z: -43.7, w: 6, h: 0.6, d: 0.3, mat: neon(0xd6dce1), collide: false });
  // vigilance : caméra de porte + éclairage blanc froid
  B.floor(312, -34, 30, 20, M.noeudSlab, 12.05);
  // S02 : galerie couverte Dalle → Nœud (x 330..346, z -20..40)
  const s02 = B.box({ x: 338, y: 12, z: 10, w: 16, h: 0.5, d: 60, mat: M.dalleWall });
  void s02;
  const s02Roof = B.box({ x: 338, y: 14.4, z: 10, w: 18, h: 0.4, d: 64, mat: M.noeudWall, collide: false });
  for (let z = -14; z <= 34; z += 12) {
    for (const px of [331.5, 344.5]) B.box({ x: px, y: 13.2, z, w: 0.6, h: 2.6, d: 0.6, mat: M.pierre });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.4), neon(0xd6dce1));
    lamp.position.set(338, 14.1, z);
    B.root.add(lamp);
  }
  // ============================================================ LES QUAIS (Y=2 / 0)
  platform(8, 208, 212, 252, 2, M.quaisSlab); // quai haut
  // J02 : rue basse + rampe d'accès (0 → 2)
  B.floor(206, 166, 12, 52, M.route, 0.04);
  {
    const dz = 208 - 192, dy = 2;
    const len = Math.hypot(dz, dy);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, len), M.route);
    mesh.position.set(206, dy / 2 - 0.24, 200);
    mesh.rotation.x = -Math.atan2(dy, dz);
    B.root.add(mesh);
    const cd = RAPIER.ColliderDesc.cuboid(6, 0.25, len / 2).setTranslation(206, dy / 2 - 0.24, 200).setCollisionGroups(G_STATIC);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.atan2(dy, dz), 0, 0));
    cd.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    world.createCollider(cd);
  }
  // halle du marché (toit effaçable) + papeterie
  const halleRoof = B.box({ x: 100, y: 9.4, z: 228, w: 80, h: 0.5, d: 22, mat: M.metal, collide: false });
  for (let x = 64; x <= 136; x += 12) {
    for (const pz of [219, 237]) B.box({ x, y: 5.7, z: pz, w: 0.8, h: 7.4, d: 0.8, mat: M.metal });
  }
  B.box({ x: 100, y: 6.2, z: 228, w: 74, h: 0.4, d: 1.2, mat: M.bois, collide: false });
  B.box({ x: 182, y: 5, z: 228, w: 36, h: 6, d: 22, mat: B.mat('papeterie', { color: 0x584f44, roughness: 0.9 }) });
  B.box({ x: 182, y: 8.6, z: 216.6, w: 12, h: 1.2, d: 0.3, mat: neon(0x82d9af), collide: false }); // papeterie (U04 plus tard)
  // parapet du quai + deux rampes piétonnes vers la promenade basse
  for (let x = 12; x <= 208; x += 8) {
    if (x > 34 && x < 60) continue;   // trouée rampe ouest
    if (x > 154 && x < 180) continue; // trouée rampe est
    B.box({ x, y: 2.6, z: 251, w: 6, h: 1.2, d: 0.8, mat: M.pierre });
  }
  const pedRamp = (x: number) => {
    const dz = 262 - 250, dy = -2;
    const len = Math.hypot(dz, dy);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, len), M.pierre);
    mesh.position.set(x, 2 + dy / 2 - 0.24, 256);
    mesh.rotation.x = -Math.atan2(dy, dz);
    B.root.add(mesh);
    const cd = RAPIER.ColliderDesc.cuboid(6, 0.25, len / 2).setTranslation(x, 2 + dy / 2 - 0.24, 256).setCollisionGroups(G_STATIC);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.atan2(dy, dz), 0, 0));
    cd.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    world.createCollider(cd);
  };
  pedRamp(46);
  pedRamp(166);
  // promenade basse + fleuve
  B.floor(110, 274, 210, 34, B.mat('q-prom', { color: 0x2a3140, roughness: 0.9 }), 0.04);
  for (let x = 16; x <= 204; x += 24) {
    B.box({ x, y: 1.4, z: 266, w: 0.2, h: 2.8, d: 0.2, mat: M.metal, collide: false });
    B.box({ x, y: 2.85, z: 266, w: 1.1, h: 0.18, d: 0.5, mat: neon(0xbfe9ff), collide: false });
    B.box({ x: x + 6, y: 0.45, z: 262, w: 2.2, h: 0.16, d: 0.7, mat: M.banc, collide: false });
  }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(600, 40), M.eau);
  water.rotation.x = -Math.PI / 2;
  water.position.set(290, 0.05, 316);
  B.root.add(water);
  // ============================================================ LES BELVÉDÈRES
  // J05 : causeway plat depuis La Dalle puis rampe nord 4 → 12
  platform(420, 34, 556, 46, 4, M.quaisSlab);
  {
    const dz = -104 - 40, dy = 8;
    const len = Math.hypot(dz, dy);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, len), M.quaisSlab);
    mesh.position.set(550, 4 + dy / 2 - 0.24, -32);
    mesh.rotation.x = -Math.atan2(dy, dz);
    B.root.add(mesh);
    const cd = RAPIER.ColliderDesc.cuboid(6, 0.25, len / 2).setTranslation(550, 4 + dy / 2 - 0.24, -32).setCollisionGroups(G_STATIC);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.atan2(dy, dz), 0, 0));
    cd.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    world.createCollider(cd);
  }
  // J06 : avenue de ceinture Y=12 vers la porte est du Nœud
  platform(430, -110, 560, -98, 12, M.noeudSlab);
  // terrasses (paliers) + belvédère + végétation
  platform(470, 54, 544, 130, 8, B.mat('belv-terrasse', { color: 0x4a4a52, roughness: 0.9 }));
  platform(470, -98, 544, -30, 12, B.mat('belv-haut', { color: 0x464d58, roughness: 0.9 }));
  // lien piéton Dalle (y4) → terrasse basse (y8)
  rampX(420, 4, 470, 8, 86, 10, M.dalleWall);
  for (const [tx, tz, ty] of [[500, 90, 8], [520, 110, 8], [490, -60, 12], [520, -40, 12]] as [number, number, number][]) {
    B.box({ x: tx, y: ty + 0.45, z: tz, w: 2.4, h: 0.2, d: 0.9, mat: M.banc, collide: false }); // bancs
    const arbre = new THREE.Mesh(new THREE.ConeGeometry(1.6, 4, 8), M.veget);
    arbre.position.set(tx + 4, ty + 2, tz + 3);
    arbre.castShadow = true;
    B.root.add(arbre);
    B.box({ x: tx + 4, y: ty + 0.4, z: tz + 3, w: 0.4, h: 0.8, d: 0.4, mat: M.bois });
  }
  B.box({ x: 507, y: 12.8, z: -60, w: 10, h: 1.2, d: 1, mat: M.pierre, collide: false }); // garde-corps belvédère
  B.box({ x: 507, y: 14, z: -57, w: 5, h: 0.8, d: 0.3, mat: neon(0xffc370), collide: false });
  // ============================================================ JONCTIONS RESTANTES
  // J01 : rampe 0 → 4 le long de X (route du nord → coteau)
  rampX(212, 0, 246, 4, 14, 12, M.route);
  B.box({ x: 229, y: 2.4, z: 22.6, w: 36, h: 4.8, d: 0.6, mat: M.dalleWall });
  // route du coteau (Y=4) le long de la dalle
  platform(240, 20, 252, 170, 4, M.dalleWall);
  B.floor(246, 95, 10, 148, M.route, 4.05);
  for (let z = 30; z <= 160; z += 12) B.floor(246, z, 4, 0.4, M.ligne, 4.07);
  // liaison piétonne parallèle J01 (escalier 0 → 4)
  {
    const ped = new THREE.Mesh(new THREE.BoxGeometry(40, 0.5, 5), M.pierre);
    ped.position.set(230, 1.76, 27.5);
    ped.rotation.z = Math.atan2(4, 34);
    B.root.add(ped);
    const cd = RAPIER.ColliderDesc.cuboid(20, 0.25, 2.5).setTranslation(230, 1.76, 27.5).setCollisionGroups(G_STATIC);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.atan2(4, 34)));
    cd.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    world.createCollider(cd);
  }
  // J03 : montante Quais → Dalle (2 → 4 le long de Z), rejoint la route du coteau
  platform(212, 222, 252, 234, 2, M.quaisSlab);
  {
    const dz = 170 - 226, dy = 2;
    const len = Math.hypot(dz, dy);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, len), M.quaisSlab);
    mesh.position.set(246, 2 + dy / 2 - 0.24, 198);
    mesh.rotation.x = -Math.atan2(dy, dz);
    B.root.add(mesh);
    const cd = RAPIER.ColliderDesc.cuboid(6, 0.25, len / 2).setTranslation(246, 2 + dy / 2 - 0.24, 198).setCollisionGroups(G_STATIC);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.atan2(dy, dz), 0, 0));
    cd.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    world.createCollider(cd);
  }
  // J04 : rampe routière 4 → 12 vers la porte sud du Nœud
  rampX(256, 4, 306, 12, -14, 12, M.noeudWall);
  B.box({ x: 281, y: 8.4, z: -6.4, w: 56, h: 8.8, d: 0.6, mat: M.noeudWall });
  B.box({ x: 281, y: 8.4, z: -21.6, w: 56, h: 8.8, d: 0.6, mat: M.noeudWall });
  // ============================================================ LIMITES & LUMIÈRES
  const fence = (x: number, z: number, w: number, d: number) =>
    B.box({ x, y: 1.25, z, w, h: 2.5, d, mat: B.mat('d-cloture', { color: 0x232a35, roughness: 0.85 }) });
  fence(290, -152, 600, 1.2);
  fence(564, 70, 1.2, 448);
  fence(-2, 70, 1.2, 448);
  const pt = (x: number, y: number, z: number, color: number, i: number, d: number) => {
    const l = new THREE.PointLight(color, i, d, 1.0);
    l.position.set(x, y, z);
    B.root.add(l);
  };
  pt(300, 9, 130, 0xffc9a0, 24, 24);   // permanence Dalle
  pt(338, 15.5, 20, 0xd6dce1, 20, 22); // galerie S02
  pt(338, 8, 120, 0xffc9a0, 18, 20);   // galerie Dalle
  pt(312, 16, -30, 0xeef4fa, 26, 26);  // porte sud Nœud
  pt(360, 16, -60, 0xeef4fa, 22, 24);  // parvis Nœud
  pt(100, 8, 228, 0xffc370, 26, 26);   // halle Quais
  pt(182, 7, 216, 0x82d9af, 16, 18);   // papeterie
  pt(507, 15, -60, 0xffc370, 20, 22);  // belvédère
  pt(46, 3.4, 266, 0xbfe9ff, 12, 14);  // promenade
  pt(166, 3.4, 266, 0xbfe9ff, 12, 14);
  // lampadaires des quais hauts et coteau
  for (const [lx, lz, ly] of [[60, 216, 6], [140, 216, 6], [246, 60, 8], [246, 140, 8]] as [number, number, number][]) {
    B.box({ x: lx, y: ly + 2, z: lz, w: 0.16, h: 4, d: 0.16, mat: M.metal, collide: false });
    B.box({ x: lx, y: ly + 4.1, z: lz, w: 0.9, h: 0.14, d: 0.4, mat: neon(0xbfe9ff), collide: false });
  }
  // ============================================================ VOLUMES D'EFFACEMENT
  const fades: FadeZone[] = [];
  const fade = (minX: number, minZ: number, maxX: number, maxZ: number, maxY: number, meshes: THREE.Mesh[]) => {
    const mats: THREE.MeshStandardMaterial[] = [];
    for (const m of meshes) {
      const c = (m.material as THREE.MeshStandardMaterial).clone();
      c.transparent = true;
      m.material = c;
      mats.push(c);
    }
    fades.push({ min: new THREE.Vector2(minX, minZ), max: new THREE.Vector2(maxX, maxZ), maxY, mats, target: 1 });
  };
  fade(328, -22, 348, 42, 13.9, [s02Roof]);
  fade(327, 40, 349, 162, 12.4, [galRoof]);
  fade(58, 214, 142, 242, 9.2, [halleRoof]);

  // ============================================================ JALONS DE CAMPAGNE (bible 02/03)
  // — M03 : portique et journal, sur la face nord du rang sud de La Dalle
  const porticoWalls: THREE.Mesh[] = [
    B.box({ x: 284, y: 5.6, z: 120.35, w: 16, h: 3.2, d: 0.5, mat: M.enduit }),        // fond (contre le bloc)
    B.box({ x: 276.35, y: 5.6, z: 116, w: 0.5, h: 3.2, d: 8.7, mat: M.enduit }),        // ouest
    B.box({ x: 291.65, y: 5.6, z: 116, w: 0.5, h: 3.2, d: 8.7, mat: M.enduit }),        // est
    B.box({ x: 278.5, y: 5.6, z: 112, w: 4, h: 3.2, d: 0.5, mat: M.enduit }),           // nord (ouest)
    B.box({ x: 289.5, y: 5.6, z: 112, w: 4, h: 3.2, d: 0.5, mat: M.enduit }),           // nord (est)
  ];
  for (const px of [277.6, 290.4]) B.box({ x: px, y: 5.8, z: 111.4, w: 0.6, h: 4.2, d: 0.6, mat: M.pierre }); // montants
  B.box({ x: 284, y: 7.7, z: 111.4, w: 14, h: 0.7, d: 0.9, mat: M.pierre, collide: false });                  // linteau portique
  B.box({ x: 284, y: 7.55, z: 110.9, w: 7, h: 0.4, d: 0.3, mat: neon(0xffc9a0), collide: false });
  const porticoRoof = B.box({ x: 284, y: 7.5, z: 116.2, w: 16.6, h: 0.35, d: 9.2, mat: M.enduit, collide: false });
  B.floor(284, 116, 15, 7.5, M.dalleWall, 4.06);
  B.grate({ id: 'porte-portique', x: 284, z: 112, w: 5, h: 2.6, byIntrusion: false, byStory: true });
  // — M04 : relais Civis (dépôt de maintenance), face sud du bloc nord
  const relaisWalls: THREE.Mesh[] = [
    B.box({ x: 316, y: 5.5, z: 64.35, w: 16, h: 3, d: 0.5, mat: M.noeudWall }),         // fond
    B.box({ x: 308.35, y: 5.5, z: 68, w: 0.5, h: 3, d: 7.3, mat: M.noeudWall }),        // ouest
    B.box({ x: 323.65, y: 5.5, z: 68, w: 0.5, h: 3, d: 7.3, mat: M.noeudWall }),        // est
    B.box({ x: 310.5, y: 5.5, z: 72, w: 4, h: 3, d: 0.5, mat: M.noeudWall }),           // sud (ouest)
    B.box({ x: 321.5, y: 5.5, z: 72, w: 4, h: 3, d: 0.5, mat: M.noeudWall }),           // sud (est)
  ];
  B.box({ x: 316, y: 7.3, z: 72.4, w: 9, h: 0.6, d: 0.3, mat: neon(0xd6dce1), collide: false });
  const relaisRoof = B.box({ x: 316, y: 7.1, z: 68.2, w: 16.6, h: 0.35, d: 8.6, mat: M.noeudWall, collide: false });
  B.floor(316, 68, 15, 7.2, M.noeudSlab, 4.06);
  B.grate({ id: 'porte-relais', x: 316, z: 72, w: 5, h: 2.4, byIntrusion: true, byStory: false });
  // — U03 : arrière-boutique du gardien, au sud du rang sud
  const shopWalls: THREE.Mesh[] = [
    B.box({ x: 272, y: 5.4, z: 164.35, w: 16, h: 2.8, d: 0.5, mat: M.enduit }),         // fond
    B.box({ x: 280.35, y: 5.4, z: 167, w: 0.5, h: 2.8, d: 5.3, mat: M.enduit }),        // est
    B.box({ x: 268.5, y: 5.4, z: 169.8, w: 4, h: 2.8, d: 0.5, mat: M.enduit }),         // sud (ouest)
    B.box({ x: 275.5, y: 5.4, z: 169.8, w: 4, h: 2.8, d: 0.5, mat: M.enduit }),         // sud (est)
  ];
  const shopRoof = B.box({ x: 272, y: 6.9, z: 167.2, w: 16.6, h: 0.35, d: 6.6, mat: M.enduit, collide: false });
  B.floor(272, 167, 15, 5.4, M.dalleWall, 4.06);
  B.grate({ id: 'porte-boutique', x: 264.3, z: 167, w: 3, h: 2.4, byIntrusion: false, byStory: true });
  B.grate({ id: 'fenetre-service', x: 280.3, z: 167, w: 2.6, h: 1.6, byIntrusion: true, byStory: false });
  // — M05 : poste de commande du Nœud, contre le bâtiment administratif central
  const posteWalls: THREE.Mesh[] = [
    B.box({ x: 353, y: 14, z: -84.35, w: 18, h: 4, d: 0.5, mat: M.noeudWall }),         // fond
    B.box({ x: 344.35, y: 14, z: -80, w: 0.5, h: 4, d: 8.3, mat: M.noeudWall }),        // ouest
    B.box({ x: 361.65, y: 14, z: -80, w: 0.5, h: 4, d: 8.3, mat: M.noeudWall }),        // est
    B.box({ x: 347.5, y: 14, z: -76, w: 4, h: 4, d: 0.5, mat: M.noeudWall }),           // sud (ouest)
    B.box({ x: 358.5, y: 14, z: -76, w: 4, h: 4, d: 0.5, mat: M.noeudWall }),           // sud (est)
  ];
  const posteRoof = B.box({ x: 353, y: 16.1, z: -80.2, w: 18.6, h: 0.4, d: 9.2, mat: M.noeudWall, collide: false });
  B.floor(353, -80, 17, 7.6, M.noeudSlab, 12.06);
  B.box({ x: 353, y: 12.95, z: -80, w: 2.6, h: 1.5, d: 1.1, mat: M.pierre });           // console du poste
  B.box({ x: 353, y: 14, z: -79.4, w: 1.4, h: 0.5, d: 0.3, mat: neon(0xff4757), collide: false });
  B.grate({ id: 'porte-poste', x: 353, z: -76, w: 5, h: 2.6, byIntrusion: false, byStory: true });
  // — M06 : salle de contrôle, à l’ouest du bâtiment est
  const ctrlWalls: THREE.Mesh[] = [
    B.box({ x: 386, y: 14, z: -112, w: 8, h: 4, d: 0.5, mat: M.noeudWall }),            // nord
    B.box({ x: 386, y: 14, z: -104, w: 8, h: 4, d: 0.5, mat: M.noeudWall }),            // sud
    B.box({ x: 390.35, y: 14, z: -108, w: 0.5, h: 4, d: 8.3, mat: M.noeudWall }),       // est (fond)
    B.box({ x: 383.5, y: 14, z: -106.5, w: 3, h: 4, d: 0.5, mat: M.noeudWall }),        // ouest (nord)
    B.box({ x: 383.5, y: 14, z: -114.5, w: 3, h: 4, d: 0.5, mat: M.noeudWall }),        // ouest (sud)
  ];
  const ctrlRoof = B.box({ x: 386, y: 16.1, z: -108.2, w: 8.6, h: 0.4, d: 9.2, mat: M.noeudWall, collide: false });
  B.floor(386, -108, 7.4, 7.6, M.noeudSlab, 12.06);
  B.box({ x: 388.4, y: 12.95, z: -108, w: 1.2, h: 1.5, d: 2.2, mat: M.pierre });        // terminal final
  B.box({ x: 388.4, y: 14, z: -108, w: 0.6, h: 0.5, d: 1.2, mat: neon(0xd6dce1), collide: false });
  B.grate({ id: 'porte-controle', x: 382.2, z: -110.5, w: 3, h: 2.6, byIntrusion: false, byStory: true });
  // — M05 filière Sorel : porte d’annexe de service près des guichets
  B.grate({ id: 'porte-annexe', x: 266, z: -50, w: 3, h: 2.6, byIntrusion: false, byStory: true });
  // — M04 filière Nadia : grille de la galerie du coteau (S02 côté Dalle)
  B.grate({ id: 'galerie-coteau', x: 338, z: 41, w: 6, h: 2.6, byIntrusion: false, byStory: true });
  // — U05 : portillon de nuit et boîtier, face est du Nœud
  B.box({ x: 430.4, y: 13.2, z: -86, w: 0.8, h: 2.4, d: 48, mat: M.noeudWall });        // mur est (nord)
  B.box({ x: 430.4, y: 13.2, z: -30, w: 0.8, h: 2.4, d: 40, mat: M.noeudWall });       // mur est (sud)
  B.grate({ id: 'portillon-nuit', x: 430.4, z: -56, w: 6, h: 2.4, byIntrusion: false, byStory: true });
  B.box({ x: 427, y: 12.8, z: -53, w: 0.6, h: 1.2, d: 0.4, mat: M.pierre });            // boîtier
  B.box({ x: 427, y: 13.5, z: -52.7, w: 0.3, h: 0.2, d: 0.12, mat: neon(0x82d9af), collide: false });
  // effacements des nouveaux intérieurs
  fade(275, 111, 293, 121, 7.2, [porticoRoof]);
  fade(307, 63, 325, 73, 6.9, [relaisRoof]);
  fade(263, 163, 281, 171, 6.6, [shopRoof]);
  fade(343, -85, 363, -75, 15.9, [posteRoof]);
  fade(381, -117, 391, -103, 15.9, [ctrlRoof]);
  // lumières des intérieurs de campagne
  pt(284, 7, 116, 0xffc9a0, 14, 14);     // portique
  pt(316, 6.6, 68, 0xd6dce1, 14, 14);    // relais
  pt(272, 6.4, 167, 0xffc9a0, 12, 12);   // boutique
  pt(353, 15.4, -80, 0xff8a8a, 14, 14);  // poste (rouge purge)
  pt(386, 15.4, -108, 0xeef4fa, 14, 14); // contrôle
  pt(427, 14, -54, 0x82d9af, 10, 12);    // boîtier portillon
  void porticoWalls; void relaisWalls; void shopWalls; void posteWalls; void ctrlWalls;

  // ============================================================ DONNÉES DE JEU
  return {
    root: B.root,
    fades,
    grates: B.grates,
    pedRoutes: [
      // La Dalle : paliers, permanence, commerces
      { district: 'dalle', points: [{ x: 260, z: 130, y: 4 }, { x: 300, z: 126, y: 4 }, { x: 340, z: 130, y: 4 }, { x: 300, z: 126, y: 4 }] },
      { district: 'dalle', points: [{ x: 262, z: 88, y: 4 }, { x: 330, z: 84, y: 4 }, { x: 396, z: 88, y: 4 }, { x: 330, z: 84, y: 4 }] },
      { district: 'dalle', points: [{ x: 270, z: 46, y: 4 }, { x: 338, z: 50, y: 5.2 }, { x: 400, z: 46, y: 4 }, { x: 338, z: 50, y: 5.2 }] },
      { district: 'dalle', points: [{ x: 338, z: 150, y: 4.7 }, { x: 338, z: 90, y: 8.7 }, { x: 338, z: 150, y: 4.7 }] },
      { district: 'dalle', points: [{ x: 246, z: 150, y: 4 }, { x: 246, z: 60, y: 4 }, { x: 246, z: 150, y: 4 }] },
      // Le Nœud : employés et visiteurs entre les bâtiments
      { district: 'noeud', points: [{ x: 312, z: -36, y: 12 }, { x: 340, z: -60, y: 12 }, { x: 312, z: -36, y: 12 }] },
      { district: 'noeud', points: [{ x: 300, z: -100, y: 12 }, { x: 360, z: -104, y: 12 }, { x: 400, z: -70, y: 12 }, { x: 360, z: -104, y: 12 }] },
      // Les Quais : marché, manutention, promenade
      { district: 'quais', points: [{ x: 60, z: 224, y: 2 }, { x: 100, z: 224, y: 2 }, { x: 140, z: 224, y: 2 }, { x: 100, z: 224, y: 2 }] },
      { district: 'quais', points: [{ x: 46, z: 238, y: 2 }, { x: 46, z: 258, y: 0.4 }, { x: 70, z: 262, y: 0 }, { x: 46, z: 258, y: 0.4 }] },
      { district: 'quais', points: [{ x: 166, z: 238, y: 2 }, { x: 166, z: 258, y: 0.4 }, { x: 130, z: 266, y: 0 }, { x: 166, z: 258, y: 0.4 }] },
      { district: 'quais', points: [{ x: 90, z: 276, y: 0 }, { x: 160, z: 276, y: 0 }, { x: 90, z: 276, y: 0 }] },
      // Les Belvédères : terrasses et promeneurs
      { district: 'belvederes', points: [{ x: 500, z: 90, y: 8 }, { x: 530, z: 110, y: 8 }, { x: 500, z: 90, y: 8 }] },
      { district: 'belvederes', points: [{ x: 494, z: -56, y: 12 }, { x: 522, z: -40, y: 12 }, { x: 494, z: -56, y: 12 }] },
    ],
    npcs: [
      { id: 'nadia', x: 300, z: 130, y: 4, color: 0x8a5a28 },
      { id: 'lise', x: 305, z: 133, y: 4, color: 0x5c2e4a },
      { id: 'sorel', x: 268, z: -44, y: 12, color: 0x2e3f6a },
    ],
    questProps: [
      { id: 'journal-portique', x: 284, z: 116.5, y: 5.0 },   // M03
      { id: 'registre', x: 316, z: 68.5, y: 5.0 },            // M04
      { id: 'releves-acces', x: 396, z: 88, y: 4.0 },          // U02 (palier nord de La Dalle)
      { id: 'dossier-chantage', x: 272, z: 167, y: 5.0 },      // U03
      { id: 'documents-papeterie', x: 182, z: 232, y: 2.0 },   // U04 (Les Quais)
      { id: 'console-poste', x: 353, z: -80, y: 12.0 },        // M05
      { id: 'terminal-controle', x: 388.4, z: -108, y: 12.0 }, // M06
      { id: 'boitier-portillon', x: 427, z: -53.5, y: 12.0 },  // U05
      { id: 'borne-relais', x: 60, z: 120, y: 0.0 },           // C03 (rue des Ateliers, Forges)
    ],
    questNpcs: [
      { id: 'gardien', x: 270, z: 167.5, y: 4, color: 0x4a5230 },
      { id: 'residente', x: 322, z: 132, y: 4, color: 0x703a55 },
      { id: 'varenne', x: 360, z: -100, y: 12, color: 0x27404f },
      { id: 'habitant', x: 140, z: 50, y: 0, color: 0x3f5d8a }, // C04 (place de la Halle)
    ],
    dallePatrols: [
      { name: 'dalle-coteau', points: [{ x: 246, z: 150, y: 4 }, { x: 246, z: 70, y: 4 }, { x: 246, z: 150, y: 4 }] },
      { name: 'dalle-galerie', points: [{ x: 338, z: 148, y: 4.7 }, { x: 338, z: 92, y: 8.6 }, { x: 338, z: 148, y: 4.7 }] },
    ],
    extraCams: [
      { id: 'cam-controle', x: 384, z: -99, y: 15.2, baseYaw: Math.PI / 2, sweep: 0.5 },
    ],
    guards: [
      { name: 'noeud-porte', points: [{ x: 312, z: -28, y: 12 }, { x: 312, z: -40, y: 12 }, { x: 350, z: -30, y: 12 }] },
      { name: 'noeud-parvis', points: [{ x: 360, z: -60, y: 12 }, { x: 400, z: -64, y: 12 }, { x: 360, z: -96, y: 12 }] },
    ],
    cams: [
      { id: 'cam-noeud-porte', x: 312, z: -27, y: 15.4, baseYaw: Math.PI, sweep: 0.6 },
    ],
    // circuit fermé : avenue → rue basse → quai haut → montante → coteau →
    // liaison nord → route du nord → pont des Forges → avenue
    trafficLoop: [
      { x: 150, z: 131.2, y: 0 }, { x: 200, z: 131.2, y: 0 }, { x: 206, z: 146, y: 0 },
      { x: 209, z: 190, y: 0 }, { x: 209, z: 208, y: 1.6 }, { x: 206, z: 216, y: 2 },
      { x: 150, z: 212, y: 2 }, { x: 60, z: 212, y: 2 }, { x: 24, z: 212, y: 2 },
      { x: 206, z: 214, y: 2 }, { x: 236, z: 226, y: 2.2 }, { x: 246, z: 214, y: 2.8 },
      { x: 243, z: 170, y: 3.6 }, { x: 243, z: 90, y: 4 }, { x: 243, z: 30, y: 4 },
      { x: 246, z: 22, y: 3.9 }, { x: 232, z: 14, y: 1.6 }, { x: 150, z: 14, y: 0 },
      { x: 60, z: 14, y: 0 }, { x: 34, z: 14, y: 0.3 }, { x: 29, z: 40, y: 3.5 },
      { x: 29, z: 70, y: 6.5 }, { x: 29, z: 96, y: 4.6 }, { x: 30, z: 124, y: 0.6 },
      { x: 60, z: 131.2, y: 0 },
    ],
  };
}
