import * as THREE from "three";

/* ============================================================
   DeadLine — Puce fantôme · Les Forges (Angoulême condensée)
   Caméra orthographique quasi verticale, orientation fixe.
   Simulation à pas fixe 60 Hz, collisions AABB 2D + cercles.
   ============================================================ */

// ---------- Types & constantes ----------
type Vec2 = { x: number; z: number };
type Wall = { minX: number; maxX: number; minZ: number; maxZ: number; h: number; id?: string };
type MissionState = "Disponible" | "Acceptée" | "Puce récupérée" | "Terminée";
type SecondaryState = "Indisponible" | "Disponible" | "Accepté" | "Colis pris" | "Terminé";
type ImplantId = "intrusion" | "leurre" | "surcharge";

interface SaveData {
  version: 1;
  mission: MissionState;
  secondary: SecondaryState;
  shortcutOpen: boolean;
  credits: number;
  rewardClaimed: boolean;
  secondaryRewardClaimed: boolean;
  unlocked: ImplantId[];
  equipped: ImplantId[];
  hasCheckpoint: boolean;
}

const SAVE_KEY = "deadline-save-v1";
const WORLD = { minX: -54, maxX: 54, minZ: -46, maxZ: 40 };
const GARAGE: Vec2 = { x: -41, z: -9 }; // devant le garage de Mina
const CAR_START: Vec2 = { x: -35, z: -1 };
const CHIP_POS: Vec2 = { x: 41, z: -19 };
const DEPOT_MAIN: Vec2 = { x: 34, z: 0.5 };
const PARCEL_POS: Vec2 = { x: 45, z: 25 };
const JULES_POS: Vec2 = { x: 10, z: 18.5 };

const IMPLANT_INFO: Record<ImplantId, { name: string; key: string; desc: string; cooldown: number }> = {
  intrusion: { name: "Intrusion", key: "F", desc: "Ouvre une grille compatible ou coupe brièvement une caméra.", cooldown: 6 },
  leurre: { name: "Leurre", key: "R", desc: "Projette un signal au point visé : un vigile proche va vérifier.", cooldown: 8 },
  surcharge: { name: "Surcharge", key: "G", desc: "Immobilise temporairement le drone du dépôt (débloqué via contrat secondaire).", cooldown: 10 },
};

// ---------- DOM ----------
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $("game-canvas") as unknown as HTMLCanvasElement;
const el = {
  menu: $("menu"), briefing: $("briefing"), fail: $("fail"), pause: $("pause"), hud: $("hud"),
  btnPlay: $("btn-play") as HTMLButtonElement, btnReset: $("btn-reset") as HTMLButtonElement,
  btnAccept: $("btn-accept") as HTMLButtonElement, btnBriefClose: $("btn-brief-close") as HTMLButtonElement,
  implantChoices: $("implant-choices"), briefingError: $("briefing-error"),
  btnRespawn: $("btn-respawn") as HTMLButtonElement, btnAbandon: $("btn-abandon") as HTMLButtonElement,
  btnResume: $("btn-resume") as HTMLButtonElement,
  objTitle: $("obj-title"), objText: $("obj-text"), objSub: $("obj-sub"),
  alertBadge: $("alert-badge"), hpFill: $("hp-fill"), hpText: $("hp-text"),
  detectFill: $("detect-fill"), credits: $("credits"), modeLabel: $("mode-label"),
  implants: $("implants"), interact: $("interact"), crosshair: $("crosshair"),
  journal: $("journal"), journalBody: $("journal-body"),
  btnJournal: $("btn-journal") as HTMLButtonElement, btnJournalClose: $("btn-journal-close") as HTMLButtonElement,
  toast: $("toast"),
};

// ---------- Sauvegarde ----------
function defaultSave(): SaveData {
  return {
    version: 1, mission: "Disponible", secondary: "Indisponible", shortcutOpen: false,
    credits: 120, rewardClaimed: false, secondaryRewardClaimed: false,
    unlocked: ["intrusion", "leurre"], equipped: ["intrusion", "leurre"], hasCheckpoint: false,
  };
}
function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const data = { ...defaultSave(), ...(JSON.parse(raw) as SaveData) };
    if (data.version !== 1) return defaultSave();
    // Fermeture pendant une séquence active : reprise au briefing (checkpoint garage).
    if (data.hasCheckpoint && (data.mission === "Acceptée" || data.mission === "Puce récupérée")) data.mission = "Acceptée";
    return data;
  } catch { return defaultSave(); }
}
let save: SaveData = loadSave();
function persist(): void {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }
  catch { showToast("⚠ Sauvegarde impossible (stockage bloqué) — la progression ne sera pas conservée."); }
}

// ---------- Audio (synthèse WebAudio, aucun asset) ----------
let audioCtx: AudioContext | null = null;
function beep(freq: number, dur: number, type: OscillatorType, gain = 0.05): void {
  try {
    audioCtx ??= new AudioContext();
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = gain;
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    o.connect(g).connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + dur);
  } catch { /* audio optionnel */ }
}
const sfx = {
  shoot: () => beep(180, 0.08, "square", 0.04),
  hit: () => beep(90, 0.12, "sawtooth", 0.06),
  alert: () => { beep(880, 0.12, "sine", 0.05); setTimeout(() => beep(880, 0.12, "sine", 0.05), 140); },
  pickup: () => beep(1320, 0.15, "sine", 0.06),
  ok: () => { beep(660, 0.12, "sine", 0.05); setTimeout(() => beep(990, 0.18, "sine", 0.05), 120); },
  implant: () => beep(520, 0.1, "triangle", 0.05),
  door: () => beep(240, 0.15, "triangle", 0.05),
};

// ---------- Three : renderer, scène, caméra ortho fixe ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b16);
scene.fog = new THREE.Fog(0x070b16, 90, 190);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
function resize(): void {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  const view = 34; // demi-hauteur visible en unités monde
  camera.left = (-view * w) / h; camera.right = (view * w) / h;
  camera.top = view; camera.bottom = -view;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

scene.add(new THREE.AmbientLight(0x8fa3c7, 1.5));
scene.add(new THREE.HemisphereLight(0x6f8fc9, 0x1a2438, 0.9));
const moon = new THREE.DirectionalLight(0xaac8ff, 2.0);
moon.position.set(-30, 60, -20);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
moon.shadow.camera.left = -70; moon.shadow.camera.right = 70;
moon.shadow.camera.top = 70; moon.shadow.camera.bottom = -70;
scene.add(moon);
const neonGlow = new THREE.PointLight(0xff2d78, 30, 40); neonGlow.position.set(34, 6, 4); scene.add(neonGlow);
const garageGlow = new THREE.PointLight(0x00e5ff, 26, 34); garageGlow.position.set(-41, 5, -9); scene.add(garageGlow);

// ---------- Matériaux ----------
const MAT = {
  road: new THREE.MeshStandardMaterial({ color: 0x1a2233, roughness: 0.95 }),
  roadLight: new THREE.MeshStandardMaterial({ color: 0x232f47, roughness: 0.95 }),
  sidewalk: new THREE.MeshStandardMaterial({ color: 0x2c3648, roughness: 0.9 }),
  ground: new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 1 }),
  tunnel: new THREE.MeshStandardMaterial({ color: 0x0d1420, roughness: 1 }),
  wall: new THREE.MeshStandardMaterial({ color: 0x3a4763, roughness: 0.85 }),
  wallDark: new THREE.MeshStandardMaterial({ color: 0x2a344c, roughness: 0.9 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x1c2740, roughness: 0.8, transparent: true }),
  depot: new THREE.MeshStandardMaterial({ color: 0x4a3f35, roughness: 0.85 }),
  crate: new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 }),
  carPaint: new THREE.MeshStandardMaterial({ color: 0x00a8c5, roughness: 0.3, metalness: 0.7 }),
  tyre: new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.95 }),
};

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true;
  scene.add(m);
  return m;
}
function groundPlane(w: number, d: number, mat: THREE.Material, x: number, z: number, y = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true;
  scene.add(m);
  return m;
}
function neonSign(text: string, color: string, w = 8): THREE.Mesh {
  const c = document.createElement("canvas"); c.width = 512; c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = "#05070d"; g.fillRect(0, 0, 512, 96);
  g.font = "bold 52px monospace"; g.textAlign = "center"; g.textBaseline = "middle";
  g.shadowColor = color; g.shadowBlur = 22; g.fillStyle = color;
  g.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.19),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  return m;
}
function markerSprite(text: string, color: string): THREE.Sprite {
  const c = document.createElement("canvas"); c.width = 128; c.height = 128;
  const g = c.getContext("2d")!;
  g.font = "bold 84px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.shadowColor = color; g.shadowBlur = 18; g.fillStyle = color;
  g.fillText(text, 64, 64);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
  s.scale.set(3.2, 3.2, 1);
  return s;
}

// ---------- Niveau : murs (collisions) + volumes ----------
const walls: Wall[] = [];
const roofMeshes: { mesh: THREE.Mesh; minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
function addWall(w: Wall, mat: THREE.Material = MAT.wall, visual = true): THREE.Mesh | null {
  walls.push(w);
  if (!visual) return null;
  const m = box(w.maxX - w.minX, w.h, w.maxZ - w.minZ, mat, (w.minX + w.maxX) / 2, w.h / 2, (w.minZ + w.maxZ) / 2);
  return m;
}
function addBuilding(x1: number, z1: number, x2: number, z2: number, h: number, sign?: { text: string; color: string }, mat: THREE.Material = MAT.wall): void {
  // Bâtiment plein non pénétrable : un seul volume de collision.
  addWall({ minX: x1, maxX: x2, minZ: z1, maxZ: z2, h }, mat);
  const roof = box(x2 - x1 + 0.4, 0.5, z2 - z1 + 0.4, MAT.roof.clone(), (x1 + x2) / 2, h + 0.25, (z1 + z2) / 2);
  roofMeshes.push({ mesh: roof, minX: x1 - 1.5, maxX: x2 + 1.5, minZ: z1 - 1.5, maxZ: z2 + 1.5 });
  if (sign) {
    const s = neonSign(sign.text, sign.color, Math.min(12, x2 - x1));
    s.position.set((x1 + x2) / 2, h * 0.62, z2 + 0.06);
    scene.add(s);
  }
}

// Sol de base + voies + trottoirs
groundPlane(120, 100, MAT.ground, 0, -3, -0.02);
groundPlane(112, 10, MAT.road, 0, 11, 0);            // Avenue des Voies (horizontale)
groundPlane(10, 92, MAT.roadLight, -41, -3, 0.001);  // Rue des Ateliers (verticale)
groundPlane(112, 5, MAT.sidewalk, 0, 3.5, 0.002);
groundPlane(112, 5, MAT.sidewalk, 0, 18.5, 0.002);
groundPlane(86, 6, MAT.tunnel, -8, -33, 0.003);      // Passage sous les voies (sol)
groundPlane(14, 14, MAT.roadLight, 35, -33, 0.01);   // Pont routier (tablier)
groundPlane(112, 5, MAT.road, 0, -41, 0);            // Rue haute (nord des voies)
// Marquages avenue
for (let x = -52; x < 54; x += 6) box(3, 0.03, 0.35, new THREE.MeshBasicMaterial({ color: 0xffd34d }), x, 0.03, 11, false);

// Voies ferrées : bande surélevée infranchissable sauf pont / passage
addWall({ minX: -54, maxX: 14, minZ: -36.5, maxZ: -29.5, h: 1.2 }, MAT.wallDark);
addWall({ minX: 22, maxX: 28, minZ: -36.5, maxZ: -29.5, h: 1.2 }, MAT.wallDark);
addWall({ minX: 42, maxX: 54, minZ: -36.5, maxZ: -29.5, h: 1.2 }, MAT.wallDark);
// (x 14→22 = passage piéton ; x 28→42 = pont routier carrossable)
const bridgeDeck = box(14, 0.35, 7.5, MAT.roadLight, 35, 0.55, -33);
bridgeDeck.receiveShadow = true;

// Bâtiments des 4 pâtés de maisons (blocs gris habillés néon)
addBuilding(-32, -26, -14, -13, 7, { text: "ATELIERS K-7", color: "#00e5ff" });
addBuilding(-10, -26, 8, -13, 9, { text: "CAFÉ SIGNAL", color: "#ffb020" });
addBuilding(-32, -1, -16, 4.5, 6, { text: "PIÈCES · 24H", color: "#2ee6a8" });
addBuilding(0, -11, 9, 4.5, 6, { text: "TRANSIT", color: "#7aa2ff" });
addBuilding(-32, 21, -12, 33, 8, { text: "HÔTEL DES FORGES", color: "#ff2d78" });
addBuilding(-2, 21, 20, 33, 7, { text: "CAFÉ DU NŒUD", color: "#ffb020" });
addBuilding(28, 21, 50, 33, 10, { text: "GALERIE — LA DALLE", color: "#00e5ff" });
addBuilding(-52, -44, -20, -38.5, 6, { text: "RELAIS NORD", color: "#7aa2ff" });
addBuilding(44, -44, 52, -38.5, 6);

// Garage de Mina (bâtiment + auvent ; Mina attend devant)
addBuilding(-50, -26, -33, -13, 6, { text: "GARAGE MINA", color: "#00e5ff" }, MAT.wallDark);
box(10, 0.3, 5, MAT.wallDark, -41, 3.4, -10.5);

// ---------- Dépôt : deux accès distincts ----------
const depotRoofMat = MAT.roof.clone();
// Murs du dépôt (enceinte x 22→48, z -26→-2) avec ouvertures
addWall({ minX: 22, maxX: 48, minZ: -26, maxZ: -25, h: 7 }, MAT.depot);            // nord
addWall({ minX: 47, maxX: 48, minZ: -26, maxZ: -2, h: 7 }, MAT.depot);             // est
addWall({ minX: 22, maxX: 31.5, minZ: -3, maxZ: -2, h: 7 }, MAT.depot);           // sud (gauche entrée)
addWall({ minX: 36.5, maxX: 48, minZ: -3, maxZ: -2, h: 7 }, MAT.depot);           // sud (droite entrée) → entrée principale x 31.5→36.5
addWall({ minX: 22, maxX: 23, minZ: -26, maxZ: -17, h: 7 }, MAT.depot);           // ouest haut
addWall({ minX: 22, maxX: 23, minZ: -12.5, maxZ: -9, h: 7 }, MAT.depot);          // ouest milieu
addWall({ minX: 22, maxX: 23, minZ: -6, maxZ: -2, h: 7 }, MAT.depot);             // ouest bas → porte quai z -9→-6
// Grille Intrusion z -17→-12.5 (mur dynamique ci-dessous), porte quai z -9→-6 ouverte
// Cloison intérieure + caisses (couvert anti-tirs)
addWall({ minX: 30, maxX: 31, minZ: -25, maxZ: -12, h: 4 }, MAT.wallDark);
addWall({ minX: 31, maxX: 40, minZ: -13, maxZ: -12, h: 4 }, MAT.wallDark);
const depotRoof = box(27, 0.5, 25, depotRoofMat, 35, 7.3, -14);
roofMeshes.push({ mesh: depotRoof, minX: 20, maxX: 50, minZ: -28, maxZ: 0 });
const depotSign = neonSign("DÉPÔT DES VOIES", "#ff2d78", 13);
depotSign.position.set(35, 4.6, -1.9); scene.add(depotSign);
// Cour de livraison (clôture ouest x 13→22)
addWall({ minX: 13, maxX: 22, minZ: -26, maxZ: -25, h: 2.2 }, MAT.wallDark);
addWall({ minX: 13, maxX: 14, minZ: -26, maxZ: -11, h: 2.2 }, MAT.wallDark);
addWall({ minX: 13, maxX: 14, minZ: -8, maxZ: -2, h: 2.2 }, MAT.wallDark); // entrée ruelle z -11 → -8
addWall({ minX: 13, maxX: 22, minZ: -3, maxZ: -2, h: 2.2 }, MAT.wallDark);
// Caisses = couverts qui bloquent les tirs
const cratePos: Vec2[] = [
  { x: 27, z: -8 }, { x: 27.2, z: -19 }, { x: 38, z: -8 }, { x: 44, z: -15 },
  { x: 17.5, z: -20 }, { x: 17.5, z: -5 }, { x: -20, z: 8 }, { x: 6, z: 14 },
  { x: -38, z: 14 }, { x: 24, z: 8 },
];
for (const p of cratePos) {
  addWall({ minX: p.x - 1.1, maxX: p.x + 1.1, minZ: p.z - 1.1, maxZ: p.z + 1.1, h: 1.6 }, MAT.crate);
}
// Lampadaires
for (const [lx, lz] of [[-41, 6], [-10, 6], [20, 6], [40, 17], [-20, 17], [17, -28], [-34, -28]] as const) {
  const pole = box(0.25, 4.5, 0.25, MAT.tyre, lx, 2.25, lz);
  pole.castShadow = false;
  const lamp = new THREE.PointLight(0xffc36b, 10, 15); lamp.position.set(lx, 4.4, lz); scene.add(lamp);
  box(0.7, 0.2, 0.7, new THREE.MeshBasicMaterial({ color: 0xffc36b }), lx, 4.5, lz, false);
}

// Portes dynamiques (murs retirés quand ouvertes)
interface DynGate { wall: Wall; mesh: THREE.Mesh; open: boolean }
function makeGate(x1: number, z1: number, x2: number, z2: number, color: number): DynGate {
  const wall: Wall = { minX: x1, maxX: x2, minZ: z1, maxZ: z2, h: 2.4 };
  walls.push(wall);
  const mesh = box(x2 - x1, 2.4, z2 - z1, new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.6, emissive: color, emissiveIntensity: 0.25 }), (x1 + x2) / 2, 1.2, (z1 + z2) / 2);
  // Barres de grille
  for (let i = 1; i < 5; i++) {
    const bx = x1 + ((x2 - x1) * i) / 5;
    box(0.12, 2.2, 0.12, MAT.tyre, bx, 1.1, (z1 + z2) / 2, false).parent === scene;
  }
  return { wall, mesh, open: false };
}
function setGate(g: DynGate, open: boolean): void {
  g.open = open;
  g.mesh.visible = !open;
  const i = walls.indexOf(g.wall);
  if (open && i >= 0) walls.splice(i, 1);
  if (!open && i < 0) walls.push(g.wall);
}
// Grille Intrusion du dépôt (mur ouest, z -17 → -12.5)
const depotGate = makeGate(22, -17, 23, -12.5, 0x00e5ff);
// Grille de service (conséquence post-mission) : passage ↔ rue des Ateliers en x -21→-19, z -29.5
const serviceGate = makeGate(-21, -29.5, -19, -28, 0x2ee6a8);
// Bornes anti-voiture aux entrées du passage piéton (la voiture ne passe pas, le piéton oui)
const bollardWalls: Wall[] = [
  { minX: 13.8, maxX: 14.4, minZ: -34, maxZ: -32, h: 1 },
  { minX: -34.4, maxX: -33.8, minZ: -34, maxZ: -32, h: 1 },
];
for (const b of bollardWalls) box(b.maxX - b.minX, 1, b.maxZ - b.minZ, MAT.crate, (b.minX + b.maxX) / 2, 0.5, (b.minZ + b.maxZ) / 2, false);
// Tablier du passage (s'estompe quand le joueur est dessous)
const underDeck = box(88, 0.5, 7.6, new THREE.MeshStandardMaterial({ color: 0x24314d, roughness: 0.9, transparent: true }), -8, 3.1, -33);
underDeck.castShadow = false;
if (save.shortcutOpen) setGate(serviceGate, true);

// ---------- Géométrie utilitaire 2D ----------
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
function segHitsWall(x1: number, z1: number, x2: number, z2: number, w: Wall): boolean {
  // Segment vs AABB (slab method)
  const dx = x2 - x1, dz = z2 - z1;
  let tmin = 0, tmax = 1;
  if (Math.abs(dx) < 1e-9) { if (x1 < w.minX || x1 > w.maxX) return false; }
  else {
    let t1 = (w.minX - x1) / dx, t2 = (w.maxX - x1) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (z1 < w.minZ || z1 > w.maxZ) return false; }
  else {
    let t1 = (w.minZ - z1) / dz, t2 = (w.maxZ - z1) / dz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}
function hasLOS(a: Vec2, b: Vec2): boolean {
  for (const w of walls) if (segHitsWall(a.x, a.z, b.x, b.z, w)) return false;
  return true;
}
function collideCircle(p: Vec2, r: number, extra: Wall[] = []): void {
  const all = extra.length ? walls.concat(extra) : walls;
  for (const w of all) {
    const cx = Math.max(w.minX, Math.min(p.x, w.maxX));
    const cz = Math.max(w.minZ, Math.min(p.z, w.maxZ));
    const dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r;
      } else {
        // Centre dans le mur : sortir par le plus petit côté
        const left = p.x - w.minX, right = w.maxX - p.x, top = p.z - w.minZ, bot = w.maxZ - p.z;
        const m = Math.min(left, right, top, bot);
        if (m === left) p.x = w.minX - r; else if (m === right) p.x = w.maxX + r;
        else if (m === top) p.z = w.minZ - r; else p.z = w.maxZ + r;
      }
    }
  }
  p.x = Math.max(WORLD.minX, Math.min(WORLD.maxX, p.x));
  p.z = Math.max(WORLD.minZ, Math.min(WORLD.maxZ, p.z));
}
function moveEntity(p: Vec2, vx: number, vz: number, dt: number, r: number, extra: Wall[] = []): void {
  p.x += vx * dt; collideCircle(p, r, extra);
  p.z += vz * dt; collideCircle(p, r, extra);
}
const angleLerp = (a: number, b: number, t: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

// ---------- Personnages (silhouettes lisibles du dessus) ----------
function makePerson(bodyColor: number, accent: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.7, 4, 10), new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.7 }));
  body.position.y = 0.95; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), new THREE.MeshStandardMaterial({ color: 0xd9c8b4, roughness: 0.6 }));
  head.position.y = 1.85; head.castShadow = true; g.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.2), new THREE.MeshBasicMaterial({ color: accent }));
  visor.position.set(0, 1.88, 0.24); g.add(visor);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.62, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; g.add(shadow);
  scene.add(g);
  return g;
}

interface Actor {
  pos: Vec2; angle: number; hp: number; maxHp: number; group: THREE.Group;
  dead: boolean; fallT: number; speedMul: number;
}
function makeActor(x: number, z: number, bodyColor: number, accent: number, hp = 100): Actor {
  const group = makePerson(bodyColor, accent);
  group.position.set(x, 0, z);
  return { pos: { x, z }, angle: 0, hp, maxHp: hp, group, dead: false, fallT: 0, speedMul: 1 };
}

// Joueur
const player: Actor & { lastDamageT: number } = { ...makeActor(GARAGE.x, GARAGE.z + 2, 0x123a5c, 0x00e5ff), lastDamageT: -99 };
const playerGun = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.7), MAT.tyre);
playerGun.position.set(0.35, 1.25, 0.45); player.group.add(playerGun);

// Mina & Jules (PNJ contacts)
const mina = makeActor(GARAGE.x, GARAGE.z, 0x5c2a4a, 0xff2d78);
const minaMark = markerSprite("◆", "#00e5ff"); minaMark.position.set(0, 3.4, 0); mina.group.add(minaMark);
const jules = makeActor(JULES_POS.x, JULES_POS.z, 0x3a4a2a, 0xffb020);
const julesMark = markerSprite("◆", "#ffb020"); julesMark.position.set(0, 3.4, 0); jules.group.add(julesMark);
julesMark.visible = false;

// Voiture arcade (laissée dans le quartier, récupérable)
const carGroup = new THREE.Group(); scene.add(carGroup);
{
  const bodyM = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 4.2), MAT.carPaint);
  bodyM.position.y = 0.55; bodyM.castShadow = true; carGroup.add(bodyM);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 2.0), new THREE.MeshStandardMaterial({ color: 0x0d1b2e, roughness: 0.2, metalness: 0.6 }));
  cabin.position.set(0, 1.05, -0.2); cabin.castShadow = true; carGroup.add(cabin);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.12, 4.22), new THREE.MeshBasicMaterial({ color: 0x00e5ff }));
  stripe.position.y = 0.82; carGroup.add(stripe);
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]] as const) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14), MAT.tyre);
    wheel.rotation.z = Math.PI / 2; wheel.position.set(wx, 0.42, wz); carGroup.add(wheel);
  }
  const light = new THREE.PointLight(0x00e5ff, 8, 12); light.position.set(0, 1, 0); carGroup.add(light);
}
const car = { pos: { ...CAR_START }, angle: Math.PI / 2, speed: 0 };
const carMark = markerSprite("▼", "#00e5ff"); carMark.position.set(CAR_START.x, 3.2, CAR_START.z); scene.add(carMark);

// Puce & colis
function makePickup(x: number, z: number, color: number, label: string): { group: THREE.Group; mark: THREE.Sprite; pos: Vec2 } {
  const group = new THREE.Group();
  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 1.1), MAT.wallDark);
  pedestal.position.y = 0.45; pedestal.castShadow = true; group.add(pedestal);
  const chip = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.4), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: 1.6 }));
  chip.position.y = 1.05; group.add(chip);
  group.position.set(x, 0, z); scene.add(group);
  const mark = markerSprite(label, `#${color.toString(16).padStart(6, "0")}`);
  mark.position.set(x, 3.4, z); scene.add(mark);
  return { group, mark, pos: { x, z } };
}
const chipPickup = makePickup(CHIP_POS.x, CHIP_POS.z, 0x00e5ff, "●");
const parcelPickup = makePickup(PARCEL_POS.x, PARCEL_POS.z, 0xffb020, "●");
parcelPickup.group.visible = false; parcelPickup.mark.visible = false;

// Caméra de surveillance (entrée principale du dépôt)
const camPivot = new THREE.Group(); camPivot.position.set(34, 5.2, -1.2); scene.add(camPivot);
{
  const camBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.8), MAT.wallDark); camPivot.add(camBody);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3b3b }));
  eye.position.set(0, 0, 0.45); camPivot.add(eye);
  box(0.2, 5.2, 0.2, MAT.tyre, 34, 2.6, -1.2, false);
}
const camState = { angle: 0, detect: 0, disabledT: 0, seesPlayer: false };
const camCone = new THREE.Mesh(new THREE.CircleGeometry(11, 24, -0.42, 0.84),
  new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false }));
camCone.rotation.x = -Math.PI / 2; camCone.position.set(34, 0.06, -1.2); scene.add(camCone);

// Drone du dépôt (cour)
const droneGroup = new THREE.Group(); scene.add(droneGroup);
{
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), new THREE.MeshStandardMaterial({ color: 0x2a344c, emissive: 0xff3b3b, emissiveIntensity: 0.5 }));
  core.castShadow = true; droneGroup.add(core);
  for (const [rx, rz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]] as const) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 8, 16), MAT.tyre);
    ring.rotation.x = Math.PI / 2; ring.position.set(rx, 0, rz); droneGroup.add(ring);
  }
}
const drone = { t: 0, disabledT: 0, pos: { x: 17.5, z: -14 } };

// Vigiles
interface Guard extends Actor {
  home: Vec2; waypoints: Vec2[]; wp: number; state: "patrol" | "investigate" | "chase" | "search" | "return";
  lastKnown: Vec2 | null; stateT: number; shootCd: number; suspicion: number; stumbleT: number;
}
function makeGuard(x: number, z: number, waypoints: Vec2[]): Guard {
  const a = makeActor(x, z, 0x4a2028, 0xff3b3b, 100);
  return { ...a, home: { x, z }, waypoints, wp: 0, state: "patrol", lastKnown: null, stateT: 0, shootCd: 0, suspicion: 0, stumbleT: 0 };
}
const guards: Guard[] = [
  makeGuard(34, 3.5, [{ x: 34, z: 3.5 }, { x: 28, z: 3.5 }, { x: 40, z: 3.5 }]),       // entrée principale
  makeGuard(17.5, -7, [{ x: 17.5, z: -7 }, { x: 17.5, z: -21 }, { x: 15.5, z: -14 }]), // cour / quai
  makeGuard(37, -15, [{ x: 37, z: -15 }, { x: 26, z: -15 }, { x: 26, z: -6 }, { x: 44, z: -22 }]), // intérieur
  makeGuard(-8, 11, [{ x: -8, z: 11 }, { x: 22, z: 11 }, { x: 22, z: 17 }, { x: -8, z: 17 }]),     // patrouille avenue
];
for (const g of guards) {
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.65), MAT.tyre);
  gun.position.set(0.35, 1.25, 0.45); g.group.add(gun);
}

// Civils (piétons des trottoirs)
interface Civil extends Actor { target: Vec2; waitT: number; fleeT: number }
const civilSpots: Vec2[] = [
  { x: -20, z: 3.5 }, { x: 10, z: 3.5 }, { x: 30, z: 18.5 }, { x: -30, z: 18.5 },
  { x: -44, z: 8 }, { x: -38, z: -20 }, { x: 44, z: 18.5 }, { x: 0, z: -8 },
  { x: -20, z: -33 }, { x: 35, z: -39.5 },
];
function randomSpot(): Vec2 { return civilSpots[Math.floor(Math.random() * civilSpots.length)]; }
const civils: Civil[] = [];
for (let i = 0; i < 7; i++) {
  const s = randomSpot();
  const a = makeActor(s.x + (Math.random() * 4 - 2), s.z + (Math.random() * 2 - 1), [0x3c4a5a, 0x5a4a3c, 0x44583e, 0x58445e][i % 4], 0xcccccc, 60);
  civils.push({ ...a, target: randomSpot(), waitT: Math.random() * 3, fleeT: 0 });
}

// ---------- Effets : sang (particules + traces au sol, pools fixes) ----------
interface BloodP { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }
const bloodPool: BloodP[] = [];
{
  const geo = new THREE.SphereGeometry(0.09, 6, 5);
  const mat = new THREE.MeshBasicMaterial({ color: 0xb01030 });
  for (let i = 0; i < 90; i++) {
    const m = new THREE.Mesh(geo, mat); m.visible = false; scene.add(m);
    bloodPool.push({ mesh: m, vel: new THREE.Vector3(), life: 0 });
  }
}
const bloodStains: THREE.Mesh[] = [];
{
  const geo = new THREE.CircleGeometry(0.55, 12);
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x7d0c24, transparent: true, opacity: 0.75, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.04; m.visible = false; scene.add(m);
    bloodStains.push(m);
  }
}
let stainIdx = 0;
function spawnBlood(x: number, y: number, z: number, count: number, big = false): void {
  let spawned = 0;
  for (const p of bloodPool) {
    if (p.life > 0) continue;
    p.life = 0.45 + Math.random() * 0.4;
    p.mesh.visible = true;
    p.mesh.position.set(x, y, z);
    const s = big ? 2.4 : 1.4;
    p.mesh.scale.setScalar(s * (0.7 + Math.random() * 0.7));
    p.vel.set((Math.random() - 0.5) * 5, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 5);
    if (++spawned >= count) break;
  }
  const stain = bloodStains[stainIdx++ % bloodStains.length];
  stain.visible = true;
  stain.position.x = x; stain.position.z = z;
  stain.scale.setScalar(big ? 1.5 + Math.random() : 0.8 + Math.random() * 0.6);
}
function updateBlood(dt: number): void {
  for (const p of bloodPool) {
    if (p.life <= 0) continue;
    p.life -= dt;
    p.vel.y -= 12 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    if (p.mesh.position.y < 0.08) { p.mesh.position.y = 0.08; p.vel.set(0, 0, 0); }
    if (p.life <= 0) p.mesh.visible = false;
  }
}
// Lignes de visée / tirs (tracer éphémère)
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.9 });
let tracer: THREE.Line | null = null; let tracerT = 0;
function showTracer(a: Vec2, ay: number, b: Vec2, by: number): void {
  if (tracer) { scene.remove(tracer); tracer.geometry.dispose(); }
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x, ay, a.z), new THREE.Vector3(b.x, by, b.z)]);
  tracer = new THREE.Line(geo, tracerMat); scene.add(tracer); tracerT = 0.07;
}
// Leurre visuel
const lureMesh = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2d78 }));
lureMesh.visible = false; scene.add(lureMesh);
const lure = { pos: { x: 0, z: 0 }, t: 0 };

// ---------- Entrées clavier / souris ----------
const keys = new Set<string>();
let mouseX = window.innerWidth / 2, mouseY = window.innerHeight / 3;
let mouseDown = false;
let started = false, paused = false, failed = false;
let briefingOpen = false;
window.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "Space"].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.code === "KeyJ" && started && !paused) toggleJournal();
  if (e.code === "Escape" && started) setPaused(!paused);
  if (e.code === "KeyE") tryInteract();
  if (e.code === "KeyF") useImplantSlot(0);
  if (e.code === "KeyR") useImplantSlot(1);
  if (e.code === "KeyG") useImplantSlot(2);
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("mousemove", (e) => { mouseX = e.clientX; mouseY = e.clientY; });
window.addEventListener("mousedown", (e) => { if (e.button === 0) mouseDown = true; });
window.addEventListener("mouseup", (e) => { if (e.button === 0) mouseDown = false; });
window.addEventListener("blur", () => { keys.clear(); mouseDown = false; if (started && !failed) setPaused(true); });
document.addEventListener("visibilitychange", () => { if (document.hidden) { keys.clear(); mouseDown = false; if (started && !failed) setPaused(true); } });
function setPaused(p: boolean): void {
  paused = p;
  el.pause.classList.toggle("hidden", !p);
}
el.btnResume.addEventListener("click", () => setPaused(false));

// Rayon souris → point au sol (plan y=0 via caméra ortho)
const raycaster = new THREE.Raycaster();
const groundPlane3 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function mouseGround(): Vec2 {
  const ndc = new THREE.Vector2((mouseX / window.innerWidth) * 2 - 1, -(mouseY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  raycaster.ray.intersectPlane(groundPlane3, hit);
  return { x: hit.x, z: hit.z };
}
function moveInput(): Vec2 {
  let x = 0, z = 0;
  if (keys.has("KeyW") || keys.has("KeyZ") || keys.has("ArrowUp")) z -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) z += 1;
  if (keys.has("KeyA") || keys.has("KeyQ") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  const len = Math.hypot(x, z) || 1;
  return { x: x / len, z: z / len };
}

// ---------- État de partie ----------
let inCar = false;
let shootCd = 0;
let gameTime = 0;
let lastConfirmedT = -99; // dernière détection confirmée (remise : 5 s sans)
let observedNow = false;
let chipStolenOnce = false; // l'intervention ne démarre qu'une fois par tentative
let hasParcel = false;
const cooldowns: Record<ImplantId, number> = { intrusion: 0, leurre: 0, surcharge: 0 };
let toastTimer: ReturnType<typeof setTimeout> | null = null;
function showToast(msg: string, ms = 5200): void {
  el.toast.textContent = msg;
  el.toast.classList.remove("hidden");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.add("hidden"), ms);
}

function actorSync(a: Actor): void {
  a.group.position.set(a.pos.x, 0, a.pos.z);
  a.group.rotation.y = a.angle;
  if (a.dead) {
    a.fallT = Math.min(1, a.fallT + 0.08);
    a.group.rotation.x = -Math.PI / 2 * a.fallT * 0.92;
    a.group.position.y = 0.25 * (1 - a.fallT);
  } else {
    a.group.rotation.x = 0;
  }
}
function damageActor(a: Actor, dmg: number, from: Vec2, big = false): void {
  if (a.dead) return;
  a.hp -= dmg;
  spawnBlood(a.pos.x, 1.1, a.pos.z, big ? 16 : 9, big);
  sfx.hit();
  // Recul / trébuchement lisible du dessus
  const d = Math.max(dist(a.pos, from), 0.01);
  a.pos.x += ((a.pos.x - from.x) / d) * 0.35;
  a.pos.z += ((a.pos.z - from.z) / d) * 0.35;
  collideCircle(a.pos, 0.55);
  if (a.hp <= 0) {
    a.dead = true; a.fallT = 0;
    spawnBlood(a.pos.x, 0.7, a.pos.z, 14, true);
  }
}
function damagePlayer(dmg: number, from: Vec2): void {
  if (failed || player.dead) return;
  player.hp -= dmg;
  player.lastDamageT = gameTime;
  spawnBlood(player.pos.x, 1.1, player.pos.z, 7);
  const d = Math.max(dist(player.pos, from), 0.01);
  if (!inCar) {
    player.pos.x += ((player.pos.x - from.x) / d) * 0.2;
    player.pos.z += ((player.pos.z - from.z) / d) * 0.2;
    collideCircle(player.pos, 0.55);
  }
  if (player.hp <= 0) {
    player.hp = 0; player.dead = true;
    failed = true;
    el.fail.classList.remove("hidden");
  }
}

// ---------- Tir joueur (hitscan, murs bloquants) ----------
function wallHitT(ax: number, az: number, bx: number, bz: number): number {
  // Plus petit t ∈ (0,1] où le segment touche un mur, sinon 1
  let best = 1;
  for (const w of walls) {
    if (!segHitsWall(ax, az, bx, bz, w)) continue;
    // Approx : dichotomie pour trouver le point de contact
    let lo = 0, hi = 1;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (segHitsWall(ax, az, ax + (bx - ax) * mid, az + (bz - az) * mid, w)) hi = mid; else lo = mid;
    }
    best = Math.min(best, hi);
  }
  return best;
}
function playerShoot(target: Vec2): void {
  const from = { ...player.pos };
  const dx = target.x - from.x, dz = target.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  const range = 26;
  const end = { x: from.x + (dx / len) * range, z: from.z + (dz / len) * range };
  const tWall = wallHitT(from.x, from.z, end.x, end.z);
  const wallEnd = { x: from.x + (end.x - from.x) * tWall, z: from.z + (end.z - from.z) * tWall };
  // Cible la plus proche parmi vigiles / civils avant le mur
  let bestT = tWall; let victim: Actor | null = null;
  const all: Actor[] = [...guards, ...civils];
  for (const a of all) {
    if (a.dead) continue;
    // Projection du centre sur le rayon + distance perpendiculaire
    const px = a.pos.x - from.x, pz = a.pos.z - from.z;
    const t = (px * dx + pz * dz) / (len * len) * len; // distance le long du rayon (approx)
    const along = (px * (dx / len) + pz * (dz / len));
    const perp = Math.abs(px * (-dz / len) + pz * (dx / len));
    void t;
    if (along > 0 && along < range && perp < 0.75 && along / range < bestT) { bestT = along / range; victim = a; }
  }
  const hitPoint = victim ? victim.pos : wallEnd;
  showTracer(from, 1.3, hitPoint, 1.1);
  sfx.shoot();
  // Bruit : les civils fuient, un vigile proche peut enquêter (témoin)
  for (const c of civils) if (!c.dead && dist(c.pos, from) < 14) c.fleeT = 3;
  if (victim) {
    damageActor(victim, 34, from);
    // Acte violent en ville libre : un vigile témoin reçoit la position
    if (save.mission !== "Puce récupérée") {
      for (const g of guards) {
        if (!g.dead && dist(g.pos, from) < 18 && hasLOS(g.pos, from)) {
          g.lastKnown = { ...from }; if (g.state === "patrol" || g.state === "return") { g.state = "investigate"; g.stateT = 0; }
        }
      }
    }
  }
}

// ---------- Implants ----------
function equippedSlot(i: number): ImplantId | null { return save.equipped[i] ?? null; }
function useImplantSlot(i: number): void {
  if (!started || paused || failed || inCar || briefingOpen) return;
  const id = equippedSlot(i);
  if (!id) return;
  if (cooldowns[id] > 0) return;
  if (id === "intrusion") {
    // Priorité grille proche, sinon caméra dans le champ
    if (!depotGate.open && dist(player.pos, { x: 22.5, z: -14.7 }) < 4) {
      setGate(depotGate, true);
      cooldowns.intrusion = IMPLANT_INFO.intrusion.cooldown;
      sfx.door(); sfx.implant();
      showToast("Grille du dépôt ouverte (Intrusion). La cour donne sur le quai.");
      refreshObjective();
      return;
    }
    const camPos = { x: 34, z: -1.2 };
    if (dist(player.pos, camPos) < 13) {
      camState.disabledT = 8; camState.detect = 0; camState.seesPlayer = false;
      cooldowns.intrusion = IMPLANT_INFO.intrusion.cooldown;
      sfx.implant();
      showToast("Caméra coupée 8 s (Intrusion). Franchis l'avenue maintenant.");
      return;
    }
    el.objSub.textContent = "Intrusion : approche une grille compatible ou la caméra du dépôt.";
    return;
  }
  if (id === "leurre") {
    const target = mouseGround();
    if (dist(player.pos, target) > 19) { el.objSub.textContent = "Leurre : point trop loin (19 m max)."; return; }
    lure.pos = { ...target }; lure.t = 6;
    lureMesh.position.set(target.x, 0.5, target.z);
    lureMesh.visible = true;
    cooldowns.leurre = IMPLANT_INFO.leurre.cooldown;
    sfx.implant();
    let attracted = 0;
    for (const g of guards) {
      if (g.dead) continue;
      if (dist(g.pos, target) < 17 && g.state !== "chase") {
        g.state = "investigate"; g.lastKnown = { ...target }; g.stateT = 0; attracted++;
      }
    }
    showToast(attracted ? "Leurre projeté : un vigile quitte son poste pour vérifier." : "Leurre projeté… aucun vigile à portée n'a réagi.");
    return;
  }
  if (id === "surcharge") {
    if (dist(player.pos, drone.pos) < 11 && drone.disabledT <= 0) {
      drone.disabledT = 7;
      cooldowns.surcharge = IMPLANT_INFO.surcharge.cooldown;
      sfx.implant();
      showToast("Drone immobilisé (Surcharge) — son arrêt attire les vigiles proches.");
      for (const g of guards) if (!g.dead && dist(g.pos, drone.pos) < 13) { g.state = "investigate"; g.lastKnown = { ...drone.pos }; g.stateT = 0; }
      return;
    }
    el.objSub.textContent = "Surcharge : approche le drone de la cour (11 m max).";
  }
}

// ---------- Interactions (E) ----------
function nearestInteract(): { label: string; run: () => void } | null {
  if (inCar) {
    if (Math.abs(car.speed) < 1.2) return { label: "E — Descendre de la voiture", run: exitCar };
    return { label: "Ralentis pour descendre (E)", run: () => undefined };
  }
  if (dist(player.pos, mina.pos) < 3) return { label: "E — Parler à Mina", run: talkMina };
  if (dist(player.pos, car.pos) < 3.2) return { label: "E — Monter dans la voiture", run: enterCar };
  if ((save.mission === "Acceptée") && !chipStolenOnce && dist(player.pos, chipPickup.pos) < 2.6)
    return { label: "E — Voler la puce", run: stealChip };
  if (save.secondary === "Accepté" && dist(player.pos, parcelPickup.pos) < 2.6)
    return { label: "E — Prendre le colis", run: takeParcel };
  if (save.secondary === "Colis pris" && dist(player.pos, jules.pos) < 3)
    return { label: "E — Livrer le colis à Jules", run: deliverParcel };
  return null;
}
function tryInteract(): void {
  if (!started || paused || failed || briefingOpen) return;
  const it = nearestInteract();
  if (it) it.run();
}
function enterCar(): void {
  // Sortie/montée du côté dégagé : on téléporte au siège si l'accès est libre
  inCar = true;
  player.group.visible = false;
  showToast("En voiture. Z/S : accélérer/freiner, Q/D : braquer. Une avenue favorise la voiture.");
}
function exitCar(): void {
  // Vérifie qu'un côté est dégagé, sinon le joueur reste à bord (plan, lot 2)
  const side = { x: Math.cos(car.angle), z: -Math.sin(car.angle) };
  for (const s of [1, -1]) {
    const p = { x: car.pos.x + side.x * 1.8 * s, z: car.pos.z + side.z * 1.8 * s };
    const before = { ...p };
    collideCircle(p, 0.55);
    if (Math.hypot(p.x - before.x, p.z - before.z) < 0.05) {
      player.pos = p; inCar = false; player.group.visible = true; actorSync(player);
      return;
    }
  }
  showToast("Les deux côtés sont bloqués — dégage la voiture avant de descendre.");
}
function talkMina(): void {
  if (save.mission === "Disponible") { openBriefing("main"); return; }
  if (save.mission === "Puce récupérée") { tryDeliverChip(); return; }
  if (save.mission === "Terminée" && save.secondary === "Disponible") { openBriefing("secondary"); return; }
  if (save.mission === "Terminée" && save.secondary === "Terminé") {
    showToast("Mina : « Le passage de service reste ouvert. La ville respire un peu mieux grâce à toi. »");
    return;
  }
  showToast("Mina : « Le dépôt est à l'est, après l'avenue. Choisis ton entrée — et où tu laisses la voiture. »");
}
function stealChip(): void {
  save.mission = "Puce récupérée";
  chipStolenOnce = true;
  chipPickup.group.visible = false; chipPickup.mark.visible = false;
  lastConfirmedT = gameTime; // l'intervention connaît le dépôt, pas encore ta position exacte
  persist();
  sfx.pickup(); sfx.alert();
  // Intervention : les vigiles convergent vers le dépôt puis cherchent
  for (const g of guards) {
    if (g.dead) continue;
    g.state = "investigate"; g.lastKnown = { ...CHIP_POS }; g.stateT = 0;
  }
  showToast("PUCE VOLÉE — Intervention au dépôt ! Rejoins Mina au garage, à pied, après 5 s sans détection confirmée.");
  refreshObjective();
}
function tryDeliverChip(): void {
  if (inCar) { el.objSub.textContent = "Remise bloquée : descends de la voiture."; return; }
  const since = gameTime - lastConfirmedT;
  if (since < 5) { el.objSub.textContent = `Remise bloquée : encore ${(5 - since).toFixed(1)} s sans détection confirmée.`; return; }
  // Conséquences atomiques : mission + raccourci + récompense une seule fois
  save.mission = "Terminée";
  if (!save.shortcutOpen) { save.shortcutOpen = true; setGate(serviceGate, true); }
  if (save.secondary === "Indisponible") save.secondary = "Disponible";
  if (!save.rewardClaimed) { save.credits += 500; save.rewardClaimed = true; }
  save.hasCheckpoint = false;
  persist();
  sfx.ok();
  showToast("Puce remise à Mina (+500 ¤). Elle ouvre la grille de service entre le passage sous les voies et la rue des Ateliers. Nouveau contrat secondaire disponible chez Mina.");
  refreshObjective(); refreshJournal();
}
function takeParcel(): void {
  hasParcel = true;
  save.secondary = "Colis pris";
  parcelPickup.group.visible = false; parcelPickup.mark.visible = false;
  julesMark.visible = true;
  persist(); sfx.pickup();
  showToast("Colis pris. Livraison : Jules, devant le Café du Nœud (sud).");
  refreshObjective();
}
function deliverParcel(): void {
  if (!hasParcel) return;
  hasParcel = false;
  save.secondary = "Terminé";
  if (!save.secondaryRewardClaimed) {
    save.credits += 300; save.secondaryRewardClaimed = true;
    if (!save.unlocked.includes("surcharge")) save.unlocked.push("surcharge");
  }
  julesMark.visible = false;
  persist(); sfx.ok();
  showToast("Livraison faite (+300 ¤). Mina t'équipe de l'implant Surcharge — choisis tes 2 implants chez elle avant le prochain run.");
  refreshObjective(); refreshJournal();
}

// ---------- Briefing & choix d'implants ----------
let briefingKind: "main" | "secondary" = "main";
let draftEquipped: ImplantId[] = [...save.equipped];
function renderImplantChoices(): void {
  el.implantChoices.innerHTML = "";
  for (const id of save.unlocked) {
    const info = IMPLANT_INFO[id];
    const b = document.createElement("button");
    b.className = "implant-choice" + (draftEquipped.includes(id) ? " selected" : "");
    b.innerHTML = `<strong>${info.name}</strong> <span>[${info.key}]</span><small>${info.desc}</small>`;
    b.addEventListener("click", () => {
      if (draftEquipped.includes(id)) draftEquipped = draftEquipped.filter((x) => x !== id);
      else if (draftEquipped.length < 2) draftEquipped.push(id);
      renderImplantChoices();
    });
    el.implantChoices.appendChild(b);
  }
}
function openBriefing(kind: "main" | "secondary"): void {
  briefingKind = kind;
  briefingOpen = true;
  draftEquipped = [...save.equipped];
  el.briefingError.textContent = "";
  const h2 = el.briefing.querySelector("h2");
  const kicker = el.briefing.querySelector(".kicker");
  if (h2) h2.textContent = kind === "main" ? "Puce fantôme" : "Contrat secondaire — Livraison express";
  if (kicker) kicker.textContent = kind === "main" ? "GARAGE DE MINA — BRIEFING" : "GARAGE DE MINA — CONTRAT COURT";
  el.btnAccept.textContent = kind === "main" ? "Accepter le contrat" : "Accepter la livraison";
  renderImplantChoices();
  el.briefing.classList.remove("hidden");
}
function closeBriefing(): void { briefingOpen = false; el.briefing.classList.add("hidden"); }
el.btnBriefClose.addEventListener("click", closeBriefing);
el.btnAccept.addEventListener("click", () => {
  if (draftEquipped.length !== 2) { el.briefingError.textContent = "Choisis exactement 2 implants."; return; }
  save.equipped = [...draftEquipped];
  if (briefingKind === "main") {
    save.mission = "Acceptée";
    save.hasCheckpoint = true; // point de reprise créé à la fin du briefing
    chipStolenOnce = false;
    chipPickup.group.visible = true; chipPickup.mark.visible = true;
    showToast("Contrat accepté. Point de reprise enregistré au garage. Direction le dépôt, à l'est.");
  } else {
    save.secondary = "Accepté";
    hasParcel = false;
    parcelPickup.group.visible = true; parcelPickup.mark.visible = true;
    showToast("Livraison acceptée : colis à la Galerie — La Dalle (sud-est), puis Jules au Café du Nœud.");
  }
  persist();
  closeBriefing();
  refreshObjective(); refreshJournal();
});

// ---------- Journal & objectif ----------
function toggleJournal(): void {
  el.journal.classList.toggle("hidden");
  if (!el.journal.classList.contains("hidden")) refreshJournal();
}
el.btnJournal.addEventListener("click", toggleJournal);
el.btnJournalClose.addEventListener("click", () => el.journal.classList.add("hidden"));
function refreshJournal(): void {
  const missionLabel = { Disponible: "Disponible — parle à Mina", Acceptée: "Acceptée — vole la puce au dépôt", "Puce récupérée": "Puce en main — remets-la à Mina (5 s sans détection)", Terminée: "Terminée" }[save.mission];
  const secLabel = { Indisponible: "—", Disponible: "Disponible chez Mina", Accepté: "Colis à prendre (Galerie, sud-est)", "Colis pris": "Livrer à Jules (Café du Nœud)", Terminé: "Terminé" }[save.secondary];
  el.journalBody.innerHTML = `
    <h4>Chapitre I — Puce fantôme</h4>
    <p>État : <strong>${missionLabel}</strong></p>
    <ul>
      <li>Decision : voler la puce de révocation au dépôt des Voies.</li>
      <li>Effet immédiat : intervention des vigiles au dépôt.</li>
      <li>Conséquence future : Mina ouvre la grille de service (passage ↔ rue des Ateliers).</li>
    </ul>
    <h4>Contrat secondaire</h4><p>${secLabel}</p>
    <h4>Contacts</h4>
    <ul><li><strong>Mina</strong> (garage, ◆ cyan) — mécanicienne, protège les habitants-relais.</li>
    <li><strong>Jules</strong> (Café du Nœud) — réception du colis secondaire.</li></ul>
    <h4>Conséquences observables</h4>
    <ul>
      <li>Grille de service : ${save.shortcutOpen ? "ouverte (durable, sauvegardée)" : "fermée"}</li>
      <li>Argent : ${save.credits} ¤ · Récompense principale : ${save.rewardClaimed ? "touchée (une seule fois)" : "non touchée"}</li>
      <li>Implants débloqués : ${save.unlocked.map((i) => IMPLANT_INFO[i].name).join(", ")}</li>
      <li>Implants équipés : ${save.equipped.map((i) => IMPLANT_INFO[i].name).join(" + ") || "aucun"}</li>
    </ul>
    <h4>Accès connus</h4>
    <ul><li>Entrée principale du dépôt (avenue, caméra) — sans implant.</li>
    <li>Cour latérale → grille Intrusion ou leurre sur le vigile du quai — sans tirer.</li>
    <li>Fuite voiture par le pont ; fuite à pied par le passage sous les voies.</li></ul>`;
}
function refreshObjective(): void {
  chipPickup.mark.visible = save.mission === "Acceptée";
  chipPickup.group.visible = save.mission === "Acceptée" || save.mission === "Disponible";
  if (save.mission === "Disponible") {
    el.objTitle.textContent = "Exploration libre — Les Forges";
    el.objText.textContent = "Parle à Mina au garage (◆ cyan, ouest) pour le briefing. Voiture garée rue des Ateliers.";
  } else if (save.mission === "Acceptée") {
    el.objTitle.textContent = "Puce fantôme — Vole la puce";
    el.objText.textContent = "Dépôt des Voies (est). Entrée principale sans implant, ou cour + grille Intrusion / leurre pour passer sans tirer.";
  } else if (save.mission === "Puce récupérée") {
    el.objTitle.textContent = "Puce fantôme — Remets la puce à Mina";
    el.objText.textContent = "Garage (ouest), à pied, après 5 s sans détection confirmée. Fuite : pont en voiture ou passage à pied.";
  } else if (save.secondary === "Disponible") {
    el.objTitle.textContent = "Contrat secondaire disponible";
    el.objText.textContent = "Retourne voir Mina au garage pour la livraison express.";
  } else if (save.secondary === "Accepté") {
    el.objTitle.textContent = "Livraison express — Prends le colis";
    el.objText.textContent = "Galerie — La Dalle (sud-est, ⬢ orange).";
  } else if (save.secondary === "Colis pris") {
    el.objTitle.textContent = "Livraison express — Livre à Jules";
    el.objText.textContent = "Jules devant le Café du Nœud (sud, ◆ orange).";
  } else {
    el.objTitle.textContent = "Ville libre — Les Forges";
    el.objText.textContent = "Contrat terminé. Le raccourci de service reste ouvert. Explore, ou parle à Mina.";
  }
  parcelPickup.mark.visible = save.secondary === "Accepté";
  julesMark.visible = save.secondary === "Colis pris";
}

// ---------- Reprise / abandon ----------
function resetWorldForRetry(): void {
  player.hp = player.maxHp; player.dead = false; player.fallT = 0;
  player.pos = { x: GARAGE.x, z: GARAGE.z + 2 };
  player.group.visible = true; actorSync(player);
  inCar = false;
  car.pos = { ...CAR_START }; car.speed = 0; car.angle = Math.PI / 2;
  chipStolenOnce = false;
  if (depotGate.open) setGate(depotGate, false);
  chipPickup.group.visible = true; chipPickup.mark.visible = save.mission === "Acceptée";
  lastConfirmedT = -99;
  cooldowns.intrusion = 0; cooldowns.leurre = 0; cooldowns.surcharge = 0;
  for (const g of guards) {
    g.hp = g.maxHp; g.dead = false; g.fallT = 0;
    g.pos = { ...g.home }; g.state = "patrol"; g.lastKnown = null; g.suspicion = 0; g.stateT = 0;
    actorSync(g);
  }
  for (const c of civils) { if (c.dead) { c.dead = false; c.hp = c.maxHp; c.fallT = 0; } actorSync(c); }
}
el.btnRespawn.addEventListener("click", () => {
  // Reprise au point enregistré au briefing : puce, voiture et vigiles restaurés
  if (save.mission === "Puce récupérée") save.mission = "Acceptée";
  save.hasCheckpoint = save.mission === "Acceptée";
  persist();
  failed = false; player.dead = false;
  el.fail.classList.add("hidden");
  resetWorldForRetry();
  showToast("Reprise au garage. La puce est de nouveau au dépôt, la voiture et les vigiles sont restaurés.");
  refreshObjective(); refreshJournal();
});
el.btnAbandon.addEventListener("click", () => {
  save.mission = "Disponible"; save.hasCheckpoint = false;
  hasParcel = false;
  if (save.secondary === "Accepté" || save.secondary === "Colis pris") save.secondary = "Disponible";
  parcelPickup.group.visible = false; parcelPickup.mark.visible = false; julesMark.visible = false;
  persist();
  failed = false; player.dead = false;
  el.fail.classList.add("hidden");
  resetWorldForRetry();
  // Après abandon on reste en ville libre, puce visible au dépôt mais contrat à réaccepter
  chipPickup.mark.visible = false;
  showToast("Contrat abandonné. Tu retrouves la ville libre — Mina peut te rebriefer au garage.");
  refreshObjective(); refreshJournal();
});

// ---------- IA : perception ----------
function guardSeesPlayer(g: Guard): boolean {
  if (player.dead || inCar) {
    // En voiture : repérable si proche et visible (la poursuite emprunte les mêmes rues)
    if (!inCar) return false;
  }
  const target = inCar ? car.pos : player.pos;
  const d = dist(g.pos, target);
  const limit = inCar ? 17 : 14;
  if (d > limit) return false;
  const toT = Math.atan2(target.x - g.pos.x, target.z - g.pos.z);
  let diff = Math.abs(((toT - g.angle) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
  if (d > 3.5 && diff > 1.05) return false; // cône ~120°, vision périphérique proche
  return hasLOS(g.pos, target);
}
function moveGuardToward(g: Guard, target: Vec2, speed: number, dt: number): boolean {
  const d = dist(g.pos, target);
  if (d < 0.8) return true;
  const vx = ((target.x - g.pos.x) / d) * speed, vz = ((target.z - g.pos.z) / d) * speed;
  const stumble = g.stumbleT > 0 ? 0.45 : 1;
  moveEntity(g.pos, vx * stumble, vz * stumble, dt, 0.55);
  g.angle = angleLerp(g.angle, Math.atan2(vx, vz), 0.25);
  return d < 1.2;
}
function updateGuard(g: Guard, dt: number): void {
  if (g.dead) { actorSync(g); return; }
  g.stateT += dt; g.shootCd -= dt; g.stumbleT -= dt;
  const target = inCar ? car.pos : player.pos;
  const sees = !failed && guardSeesPlayer(g);
  if (sees) {
    g.suspicion = Math.min(1, g.suspicion + dt * 1.6);
    g.lastKnown = { ...target };
    if (g.suspicion > 0.55) {
      if (g.state !== "chase") sfx.alert();
      g.state = "chase"; g.stateT = 0;
      lastConfirmedT = gameTime;
    }
  } else {
    g.suspicion = Math.max(0, g.suspicion - dt * 0.35);
  }
  if (g.state === "chase") {
    lastConfirmedT = gameTime; // position confirmée tant que le contact visuel dure (remise bloquée)
    if (!sees && g.stateT > 0.1 && !g.lastKnown) g.state = "search";
    if (!sees && g.lastKnown) { g.state = "search"; g.stateT = 0; }
    else if (sees) {
      const d = dist(g.pos, target);
      if (d > 7) moveGuardToward(g, target, 6.4, dt);
      else {
        g.angle = angleLerp(g.angle, Math.atan2(target.x - g.pos.x, target.z - g.pos.z), 0.3);
        if (g.shootCd <= 0 && !inCar && hasLOS(g.pos, target)) {
          g.shootCd = 1.15;
          showTracer(g.pos, 1.3, player.pos, 1.1);
          sfx.shoot();
          if (Math.random() < 0.72) damagePlayer(8, g.pos);
        } else if (g.shootCd <= 0 && inCar) {
          g.shootCd = 1.3; // la voiture protège, mais la poursuite continue
        }
      }
    }
  } else if (g.state === "investigate" && g.lastKnown) {
    if (moveGuardToward(g, g.lastKnown, 4.6, dt) || g.stateT > 9) { g.state = "search"; g.stateT = 0; }
  } else if (g.state === "search") {
    // Fouille la dernière position connue et inspecte les sorties proches
    if (g.lastKnown) moveGuardToward(g, g.lastKnown, 3.6, dt);
    g.angle += Math.sin(gameTime * 1.4 + g.home.x) * dt * 1.6;
    if (g.stateT > 5) { g.state = "return"; g.stateT = 0; }
  } else if (g.state === "return") {
    if (moveGuardToward(g, g.waypoints[g.wp], 4.2, dt)) g.state = "patrol";
  } else {
    // Patrouille sur graphe de points autour du dépôt et des rues voisines
    const wp = g.waypoints[g.wp];
    if (moveGuardToward(g, wp, 2.6, dt)) g.wp = (g.wp + 1) % g.waypoints.length;
  }
  actorSync(g);
}

// ---------- Caméra de surveillance & drone ----------
function updateSurveillance(dt: number): void {
  camState.disabledT -= dt;
  camState.angle = Math.sin(gameTime * 0.45) * 0.85;
  camPivot.rotation.y = camState.angle;
  const dirZ = Math.cos(camState.angle), dirX = Math.sin(camState.angle);
  camCone.rotation.z = -camState.angle;
  (camCone.material as THREE.MeshBasicMaterial).color.set(camState.disabledT > 0 ? 0x2ee6a8 : camState.seesPlayer ? 0xff3b3b : 0xffb020);
  (camCone.material as THREE.MeshBasicMaterial).opacity = camState.disabledT > 0 ? 0.04 : 0.10;
  camState.seesPlayer = false;
  if (camState.disabledT <= 0 && !player.dead) {
    const target = inCar ? car.pos : player.pos;
    const dx = target.x - 34, dz = target.z - (-1.2);
    const d = Math.hypot(dx, dz);
    if (d < 11.5 && d > 0.1) {
      const dot = (dx / d) * dirX + (dz / d) * dirZ;
      if (dot > 0.72 && hasLOS({ x: 34, z: -1.2 }, target)) {
        camState.seesPlayer = true;
        camState.detect = Math.min(1, camState.detect + dt / 0.9); // délai visible ~0,9 s
        if (camState.detect >= 1) {
          lastConfirmedT = gameTime;
          for (const g of guards) if (!g.dead) { g.lastKnown = { ...target }; if (g.state === "patrol" || g.state === "return") { g.state = "investigate"; g.stateT = 0; } }
        }
      }
    }
  }
  if (!camState.seesPlayer) camState.detect = Math.max(0, camState.detect - dt * 0.8);

  // Drone : patrouille circulaire sur la cour, repère le joueur dans la cour
  drone.t += dt;
  if (drone.disabledT > 0) {
    drone.disabledT -= dt;
    droneGroup.position.set(drone.pos.x, 2.2 + Math.sin(gameTime * 2) * 0.1, drone.pos.z);
  } else {
    drone.pos = { x: 17.5 + Math.cos(drone.t * 0.35) * 3.2, z: -14 + Math.sin(drone.t * 0.35) * 6.5 };
    droneGroup.position.set(drone.pos.x, 3.4, drone.pos.z);
    if (!player.dead && !inCar && dist(player.pos, drone.pos) < 8.5 && hasLOS(drone.pos, player.pos)) {
      observedNow = true;
      if (Math.random() < dt * 0.9) {
        lastConfirmedT = gameTime;
        for (const g of guards) if (!g.dead && dist(g.pos, drone.pos) < 18) { g.lastKnown = { ...player.pos }; if (g.state !== "chase") { g.state = "investigate"; g.stateT = 0; } }
      }
    }
  }
  droneGroup.rotation.y = gameTime * 0.8;
}

// ---------- Mise à jour joueur / voiture / civils ----------
function updatePlayer(dt: number): void {
  for (const k of Object.keys(cooldowns) as ImplantId[]) cooldowns[k] = Math.max(0, cooldowns[k] - dt);
  shootCd -= dt;
  if (player.dead) { actorSync(player); return; }
  // Régénération lente hors combat (jouabilité), jamais pendant une poursuite vue
  if (gameTime - player.lastDamageT > 7 && player.hp > 0) player.hp = Math.min(player.maxHp, player.hp + dt * 4);

  if (inCar) {
    const fwd = keys.has("KeyW") || keys.has("KeyZ") || keys.has("ArrowUp");
    const back = keys.has("KeyS") || keys.has("ArrowDown");
    const left = keys.has("KeyA") || keys.has("KeyQ") || keys.has("ArrowLeft");
    const right = keys.has("KeyD") || keys.has("ArrowRight");
    if (fwd) car.speed += 14 * dt;
    if (back) car.speed -= (car.speed > 0.5 ? 20 : 8) * dt; // freinage perceptible puis marche arrière
    if (!fwd && !back) car.speed -= car.speed * 1.4 * dt;
    car.speed = Math.max(-9, Math.min(19, car.speed));
    if (Math.abs(car.speed) > 0.15) {
      const steer = (left ? 1 : 0) - (right ? 1 : 0);
      car.angle += steer * dt * 1.55 * Math.sign(car.speed) * Math.min(1, Math.abs(car.speed) / 6);
    }
    const vx = Math.sin(car.angle) * car.speed, vz = Math.cos(car.angle) * car.speed;
    const before = { ...car.pos };
    moveEntity(car.pos, vx, vz, dt, 1.55, bollardWalls);
    // Choc mur : arrêt net + recul léger ; choc piéton/vigile : projection + sang selon la vitesse
    if (Math.hypot(car.pos.x - (before.x + vx * dt), car.pos.z - (before.z + vz * dt)) > 0.4 && Math.abs(car.speed) > 3) {
      if (Math.abs(car.speed) > 10) spawnBlood(car.pos.x, 0.6, car.pos.z, 6);
      car.speed *= -0.18;
    }
    for (const a of [...guards, ...civils] as Actor[]) {
      if (a.dead) continue;
      if (dist(car.pos, a.pos) < 1.9 && Math.abs(car.speed) > 1.5) {
        const violent = Math.abs(car.speed) > 8;
        damageActor(a, violent ? 100 : 45, car.pos, violent);
        if (a === (a as Actor) && !a.dead) (a as Guard).stumbleT = 1.2;
        car.speed *= 0.72;
      }
    }
    player.pos = { ...car.pos };
    carGroup.position.set(car.pos.x, 0, car.pos.z);
    carGroup.rotation.y = car.angle;
    carMark.position.set(car.pos.x, 3.2, car.pos.z);
    return;
  }

  const mv = moveInput();
  const speed = 7.2;
  moveEntity(player.pos, mv.x * speed, mv.z * speed, dt, 0.55);
  const aim = mouseGround();
  player.angle = Math.atan2(aim.x - player.pos.x, aim.z - player.pos.z);
  if (mouseDown && shootCd <= 0 && !briefingOpen) {
    shootCd = 0.22;
    playerShoot(aim);
  }
  actorSync(player);
}
function updateCivils(dt: number): void {
  for (const c of civils) {
    if (c.dead) { actorSync(c); continue; }
    if (c.fleeT > 0) {
      c.fleeT -= dt;
      const away = { x: c.pos.x + (c.pos.x - player.pos.x), z: c.pos.z + (c.pos.z - player.pos.z) };
      moveGuardLike(c, away, 6.5, dt);
    } else if (c.waitT > 0) {
      c.waitT -= dt;
    } else {
      if (moveGuardLike(c, c.target, 2.1, dt)) { c.target = randomSpot(); c.waitT = 1 + Math.random() * 3; }
    }
    actorSync(c);
  }
}
function moveGuardLike(a: Actor, target: Vec2, speed: number, dt: number): boolean {
  const d = dist(a.pos, target);
  if (d < 0.9) return true;
  const vx = ((target.x - a.pos.x) / d) * speed, vz = ((target.z - a.pos.z) / d) * speed;
  moveEntity(a.pos, vx, vz, dt, 0.55);
  a.angle = angleLerp(a.angle, Math.atan2(vx, vz), 0.2);
  return d < 1.3;
}

// ---------- HUD ----------
function refreshHUD(): void {
  el.hpFill.style.width = `${Math.max(0, player.hp)}%`;
  el.hpText.textContent = `${Math.ceil(Math.max(0, player.hp))}`;
  el.credits.textContent = `${save.credits} ¤`;
  el.modeLabel.textContent = inCar ? "En voiture" : "À pied";
  // Détection : max(suspicion vigiles, caméra) — distingue observé / confirmé
  let detect = camState.detect;
  for (const g of guards) if (!g.dead) detect = Math.max(detect, g.suspicion);
  el.detectFill.style.width = `${Math.round(detect * 100)}%`;
  const confirmed = gameTime - lastConfirmedT < 0.4 || guards.some((g) => !g.dead && g.state === "chase");
  if (confirmed) { el.alertBadge.textContent = "REPÉRÉ — position confirmée"; el.alertBadge.className = "badge alert"; }
  else if (observedNow || detect > 0.12 || camState.seesPlayer) { el.alertBadge.textContent = "Observé…"; el.alertBadge.className = "badge seen"; }
  else { el.alertBadge.textContent = "Non repéré"; el.alertBadge.className = "badge ok"; }
  // Condition bloquante de la remise, toujours expliquée
  if (save.mission === "Puce récupérée" && !el.toast.classList.contains("hidden") === false) { /* noop */ }
  if (save.mission === "Puce récupérée") {
    if (inCar) el.objSub.textContent = "Remise bloquée : tu es en voiture — descends près de Mina.";
    else {
      const since = gameTime - lastConfirmedT;
      el.objSub.textContent = since >= 5 ? "Remise possible : parle à Mina (E)." : `Remise bloquée : ${Math.max(0, 5 - since).toFixed(1)} s sans détection confirmée requises.`;
    }
  } else if (!briefingOpen) {
    // Laisse les messages d'implant, sinon vide
    const sub = el.objSub.textContent ?? "";
    if (!sub.startsWith("Intrusion") && !sub.startsWith("Leurre") && !sub.startsWith("Surcharge")) el.objSub.textContent = "";
  }
  // Implants équipés + recharges
  el.implants.innerHTML = "";
  save.equipped.forEach((id, i) => {
    const info = IMPLANT_INFO[id];
    const cd = cooldowns[id];
    const chip = document.createElement("div");
    chip.className = "implant-chip " + (cd <= 0 ? "ready" : "cd");
    chip.textContent = cd <= 0 ? `${["F", "R", "G"][i]} · ${info.name} — prêt` : `${info.name} — ${cd.toFixed(1)} s`;
    el.implants.appendChild(chip);
  });
  for (let i = save.equipped.length; i < 2; i++) {
    const chip = document.createElement("div");
    chip.className = "implant-chip cd"; chip.textContent = "Emplacement libre (garage)";
    el.implants.appendChild(chip);
  }
  // Invite d'interaction
  const it = started && !paused && !failed && !briefingOpen ? nearestInteract() : null;
  if (it) { el.interact.textContent = it.label; el.interact.classList.remove("hidden"); }
  else el.interact.classList.add("hidden");
  // Réticule sous la souris
  el.crosshair.style.left = `${mouseX}px`;
  el.crosshair.style.top = `${mouseY}px`;
  el.crosshair.style.display = inCar ? "none" : "block";
}

// ---------- Caméra : suivi + anticipation véhicule, toits & tabliers ----------
const camTarget = new THREE.Vector3(GARAGE.x, 0, GARAGE.z);
function updateCamera(dt: number): void {
  const focus = inCar ? car.pos : player.pos;
  let leadX = 0, leadZ = 0;
  if (inCar) { leadX = Math.sin(car.angle) * car.speed * 0.55; leadZ = Math.cos(car.angle) * car.speed * 0.55; }
  camTarget.x += (focus.x + leadX - camTarget.x) * Math.min(1, dt * 5);
  camTarget.z += (focus.z + leadZ - camTarget.z) * Math.min(1, dt * 5);
  camera.position.set(camTarget.x, 42, camTarget.z + 17);
  camera.lookAt(camTarget.x, 0, camTarget.z);
  // Toits qui masquent le personnage → estompés
  for (const r of roofMeshes) {
    const inside = player.pos.x > r.minX && player.pos.x < r.maxX && player.pos.z > r.minZ && player.pos.z < r.maxZ;
    const mat = r.mesh.material as THREE.MeshStandardMaterial;
    mat.opacity += ((inside ? 0.10 : 1) - mat.opacity) * Math.min(1, dt * 8);
    r.mesh.visible = mat.opacity > 0.03;
  }
  // Passage inférieur : le tablier s'efface quand le joueur est dessous
  const under = player.pos.z > -36.5 && player.pos.z < -29.5 && player.pos.x > -52 && player.pos.x < 22;
  const dmat = underDeck.material as THREE.MeshStandardMaterial;
  dmat.opacity += ((under ? 0.08 : 1) - dmat.opacity) * Math.min(1, dt * 8);
  // Pont : tablier semi-transparent si le joueur passe dessous à pied à proximité
  (bridgeDeck.material as THREE.MeshStandardMaterial).transparent = under;
}

// ---------- Boucle principale à pas fixe 60 Hz ----------
let lastMs = performance.now();
let accumulator = 0;
const STEP = 1 / 60;
function frame(nowMs: number): void {
  requestAnimationFrame(frame);
  let dt = (nowMs - lastMs) / 1000;
  lastMs = nowMs;
  dt = Math.min(dt, 0.1);
  if (!started && !paused) {
    // Monde vivant derrière le menu : patrouilles, civils et drone tournent déjà.
    accumulator += dt;
    while (accumulator >= STEP) {
      accumulator -= STEP;
      gameTime += STEP;
      for (const g of guards) updateGuard(g, STEP);
      updateCivils(STEP);
      updateSurveillance(STEP);
      updateBlood(STEP);
      chipPickup.group.rotation.y = gameTime * 1.2;
      minaMark.position.y = 3.4 + Math.sin(gameTime * 2.2) * 0.18;
    }
  }
  if (started && !paused && !failed && !briefingOpen) {
    accumulator += dt;
    while (accumulator >= STEP) {
      accumulator -= STEP;
      gameTime += STEP;
      observedNow = camState.seesPlayer;
      updatePlayer(STEP);
      for (const g of guards) updateGuard(g, STEP);
      updateCivils(STEP);
      updateSurveillance(STEP);
      if (lure.t > 0) { lure.t -= STEP; if (lure.t <= 0) lureMesh.visible = false; }
      updateBlood(STEP);
      if (tracerT > 0) { tracerT -= STEP; if (tracerT <= 0 && tracer) { scene.remove(tracer); tracer.geometry.dispose(); tracer = null; } }
      // Marqueurs animés
      chipPickup.group.rotation.y = gameTime * 1.2;
      parcelPickup.group.rotation.y = gameTime * 1.2;
      minaMark.position.y = 3.4 + Math.sin(gameTime * 2.2) * 0.18;
      julesMark.position.y = 3.4 + Math.sin(gameTime * 2.2) * 0.18;
      carMark.visible = !inCar;
    }
  }
  actorSync(mina); actorSync(jules);
  if (!inCar) actorSync(player);
  for (const g of guards) actorSync(g);
  updateCamera(Math.max(dt, 0.001));
  if (started) refreshHUD();
  renderer.render(scene, camera);
}

// ---------- Démarrage ----------
function applyLoadedState(): void {
  // État restauré après rechargement : mission terminée durable, reprise au garage sinon
  if (save.mission === "Terminée") {
    chipPickup.group.visible = false; chipPickup.mark.visible = false;
    chipStolenOnce = true;
  }
  if (save.secondary === "Accepté") { parcelPickup.group.visible = true; }
  if (save.secondary === "Colis pris") { hasParcel = true; parcelPickup.group.visible = false; julesMark.visible = true; }
  refreshObjective(); refreshJournal();
  actorSync(player); actorSync(mina); actorSync(jules);
  carGroup.position.set(car.pos.x, 0, car.pos.z); carGroup.rotation.y = car.angle;
  for (const g of guards) actorSync(g);
  for (const c of civils) actorSync(c);
}
el.btnPlay.addEventListener("click", () => {
  started = true;
  el.menu.classList.add("hidden");
  el.hud.classList.remove("hidden");
  applyLoadedState();
  if (save.mission === "Terminée") showToast("Sauvegarde retrouvée : la grille de service est ouverte et le contrat secondaire reste disponible.");
  else if (save.hasCheckpoint) showToast("Reprise au garage (point du briefing). La puce t'attend au dépôt.");
  else showToast("Les Forges, la nuit. Parle à Mina (◆ cyan) au garage, prends la voiture ou pars à pied.");
});
el.btnReset.addEventListener("click", () => {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  save = defaultSave();
  chipStolenOnce = false; hasParcel = false;
  if (serviceGate.open) setGate(serviceGate, false);
  resetWorldForRetry();
  chipPickup.group.visible = true;
  parcelPickup.group.visible = false; parcelPickup.mark.visible = false; julesMark.visible = false;
  refreshObjective(); refreshJournal();
  showToast("Sauvegarde effacée. Nouvelle partie prête.");
  el.btnPlay.disabled = false;
  el.btnPlay.textContent = "Jouer";
});
// Prêt dès que le module (Three.js) est chargé : aucun WASM à attendre.
el.btnPlay.disabled = false;
el.btnPlay.textContent = "Jouer";
applyLoadedState();
requestAnimationFrame(frame);



