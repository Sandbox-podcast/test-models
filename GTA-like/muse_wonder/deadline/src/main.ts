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
  gateLit: boolean;
  m02: "Indisponible" | "Disponible" | "Acceptée" | "Calendrier pris" | "Terminée";
  u04: "Indisponible" | "Disponible" | "Acceptée" | "Documents pris" | "Terminée";
  m02RewardClaimed: boolean;
  u04RewardClaimed: boolean;
  dalleAccess: boolean;
  m03: "Indisponible" | "Disponible" | "Acceptée" | "Journal pris" | "Terminée";
  m04: "Indisponible" | "Disponible" | "Acceptée" | "Registre pris" | "Terminée";
  m05: "Indisponible" | "Disponible" | "Acceptée" | "Terminée";
  m06: "Indisponible" | "Disponible" | "Acceptée" | "Terminée";
  u02: "Indisponible" | "Disponible" | "Acceptée" | "Relevés pris" | "Escorte" | "Terminée";
  u03: "Indisponible" | "Disponible" | "Acceptée" | "Dossier pris" | "Terminée";
  u05: "Indisponible" | "Disponible" | "Acceptée" | "Terminée";
  filiere: "" | "nadia" | "sorel";
  fin: "" | "A" | "B";
  u03Choice: "" | "detruit" | "remis";
  contractActive: "" | "c01" | "c02" | "c03" | "c04";
  contractCount: number;
}

const SAVE_KEY = "deadline-save-v1";
const WORLD = { minX: -56, maxX: 56, minZ: -148, maxZ: 92 };
const GARAGE: Vec2 = { x: -41, z: -9 }; // devant le garage de Mina
const CAR_START: Vec2 = { x: -35, z: -1 };
const CHIP_POS: Vec2 = { x: 41, z: -19 };
const DEPOT_MAIN: Vec2 = { x: 34, z: 0.5 };
const MODULE_POS: Vec2 = { x: -37.5, z: -10.5 }; // module U01, à côté du garage
const PANEL_POS: Vec2 = { x: -17.5, z: -28.3 };  // panneau de la grille de service (U01)

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
  implantChoices: $("implant-choices"), briefingError: $("briefing-error"), briefSelect: $("brief-select"),
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
    unlocked: ["intrusion", "leurre"], equipped: ["intrusion", "leurre"], hasCheckpoint: false, gateLit: false,
    m02: "Indisponible", u04: "Indisponible", m02RewardClaimed: false, u04RewardClaimed: false, dalleAccess: false,
    m03: "Indisponible", m04: "Indisponible", m05: "Indisponible", m06: "Indisponible",
    u02: "Indisponible", u03: "Indisponible", u05: "Indisponible",
    filiere: "", fin: "", u03Choice: "", contractActive: "", contractCount: 0,
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

const ambLight = new THREE.AmbientLight(0x8fa3c7, 1.5);
scene.add(ambLight);
// Plages d'activité (bible 07) : Soirée -> Nuit -> Aube, flux et lumière varient
const PHASES = [
  { name: "Soirée", moon: 2.0, amb: 0x8fa3c7, traffic: 8.5, walkers: 12 },
  { name: "Nuit", moon: 1.15, amb: 0x546a8c, traffic: 10.5, walkers: 6 },
  { name: "Aube", moon: 2.7, amb: 0xc2b49a, traffic: 6.5, walkers: 9 },
] as const;
let phaseIdx = -1;
let phaseTraffic = 8.5;
let phaseWalkers = 12;
let phaseName = "Soirée";
function updatePhase(): void {
  const idx = Math.floor(gameTime / 80) % PHASES.length;
  if (idx === phaseIdx) return;
  phaseIdx = idx;
  const p = PHASES[idx];
  phaseName = p.name; phaseTraffic = p.traffic; phaseWalkers = p.walkers;
  moon.intensity = p.moon;
  ambLight.color.set(p.amb);
}
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
  wall: new THREE.MeshStandardMaterial({ color: 0x7a6f5c, roughness: 0.85 }), // calcaire des Forges (DA bible)
  wallDark: new THREE.MeshStandardMaterial({ color: 0x4a5860, roughness: 0.9 }), // acier
  roof: new THREE.MeshStandardMaterial({ color: 0x303744, roughness: 0.8, transparent: true }), // ardoise
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
groundPlane(9, 9, MAT.roadLight, 49, -33, 0.01);   // Pont routier est (tablier)
groundPlane(112, 5, MAT.road, 0, -41, 0);            // Rue haute (nord des voies)
// Marquages avenue
for (let x = -52; x < 54; x += 6) box(3, 0.03, 0.35, new THREE.MeshBasicMaterial({ color: 0xffd34d }), x, 0.03, 11, false);

// Voies ferrées : deux rives laissant un couloir piéton traversant sous le tablier
// Couloir du passage : z -35.2 → -30.8, entrées sud x 14→22 (escalier), x -36→-32 (garage), grille x -21→-19
addWall({ minX: -54, maxX: 28, minZ: -36.5, maxZ: -35.2, h: 1.2 }, MAT.wallDark);   // rive nord (ouest pont)
addWall({ minX: 42, maxX: 45, minZ: -36.5, maxZ: -35.2, h: 1.2 }, MAT.wallDark);    // rive nord (est pont)
addWall({ minX: 53, maxX: 54, minZ: -36.5, maxZ: -35.2, h: 1.2 }, MAT.wallDark);
addWall({ minX: -54, maxX: -36, minZ: -30.8, maxZ: -29.5, h: 1.2 }, MAT.wallDark);  // rive sud
addWall({ minX: -32, maxX: -21, minZ: -30.8, maxZ: -29.5, h: 1.2 }, MAT.wallDark);
addWall({ minX: -19, maxX: 14, minZ: -30.8, maxZ: -29.5, h: 1.2 }, MAT.wallDark);
addWall({ minX: 22, maxX: 28, minZ: -30.8, maxZ: -29.5, h: 1.2 }, MAT.wallDark);
addWall({ minX: 42, maxX: 45, minZ: -30.8, maxZ: -29.5, h: 1.2 }, MAT.wallDark);
addWall({ minX: 53, maxX: 54, minZ: -30.8, maxZ: -29.5, h: 1.2 }, MAT.wallDark);
// (x 28→42 = pont routier carrossable, au-dessus du couloir)
// Garde-corps du pont est (la voiture reste sur le tablier)
addWall({ minX: 44.7, maxX: 45, minZ: -37, maxZ: -29, h: 0.9 }, MAT.wallDark);
addWall({ minX: 53, maxX: 53.3, minZ: -37, maxZ: -29, h: 0.9 }, MAT.wallDark);
// Chaussée de liaison avenue -> pont est
groundPlane(8, 32, MAT.road, 49, -8, 0.004);
// Escaliers visuels aux entrées du passage (est dépôt, ouest garage) : deux volées + palier (bible 05)
for (let i = 0; i < 4; i++) {
  box(6, 0.18, 0.9, MAT.sidewalk, 18, 0.1 + i * 0.12, -28.6 + i * 0.9, false);
  box(3.4, 0.18, 0.9, MAT.sidewalk, -34, 0.1 + i * 0.12, -28.6 + i * 0.9, false);
}
box(6, 0.3, 1.6, MAT.sidewalk, 18, 0.35, -25.2, false);   // palier est
box(3.4, 0.3, 1.6, MAT.sidewalk, -34, 0.35, -25.2, false); // palier ouest
for (let i = 0; i < 3; i++) {
  box(6, 0.18, 0.9, MAT.sidewalk, 18, 0.45 + i * 0.12, -24.2 + i * 0.9, false);
  box(3.4, 0.18, 0.9, MAT.sidewalk, -34, 0.45 + i * 0.12, -24.2 + i * 0.9, false);
}
// Parking de fuite marqué, au sud de l'entrée principale du dépôt (bible 05)
groundPlane(9, 5, new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.9 }), 40, 4.2, 0.012);
const parkSign = neonSign("P · FUITE", "#82D9AF", 4.5);
parkSign.position.set(40, 2.2, 1.8); scene.add(parkSign);
box(0.18, 2.2, 0.18, MAT.tyre, 40, 1.1, 1.8, false);
const bridgeDeck = box(8, 0.35, 7.5, MAT.roadLight, 49, 0.98, -33);
bridgeDeck.receiveShadow = true;
// Rampes d'accès au tablier (profil hauteur selon la distance, bible 05/08)
const rampMat = MAT.roadLight;
const rampS = box(8, 0.3, 7, rampMat, 49, 0.5, -26.8); rampS.rotation.x = 0.16;
const rampN = box(8, 0.3, 7, rampMat, 49, 0.5, -39.2); rampN.rotation.x = -0.16;
// Hauteur du sol : tablier du pont à +1,15, rampes progressives, 0 ailleurs (passage inclus)
function groundY(x: number, z: number): number {
  if (x < 45 || x > 53) return 0;
  if (z >= -36.2 && z <= -29.8) return 1.15;
  if (z > -29.8 && z <= -23.8) return 1.15 * ((z + 23.8) / -6);
  if (z < -36.2 && z >= -42.2) return 1.15 * ((z + 42.2) / 6);
  return 0;
}

// Bâtiments des 4 pâtés de maisons (blocs gris habillés néon)
addBuilding(-32, -26, -14, -13, 7, { text: "ATELIERS K-7", color: "#00e5ff" });
addBuilding(-10, -26, 8, -13, 9, { text: "CAFÉ SIGNAL", color: "#ffb020" });
addBuilding(-32, -1, -16, 4.5, 6, { text: "PIÈCES · 24H", color: "#2ee6a8" });
addBuilding(0, -11, 9, 4.5, 6, { text: "TRANSIT", color: "#7aa2ff" });
addBuilding(-32, 21, -12, 33, 8, { text: "HÔTEL DES FORGES", color: "#ff2d78" });
addBuilding(-2, 21, 20, 33, 7, { text: "CAFÉ DU NŒUD", color: "#ffb020" });
addBuilding(28, 21, 50, 33, 10, { text: "GALERIE — LA DALLE", color: "#00e5ff" });
addBuilding(-52, -48, -20, -44.5, 6, { text: "RELAIS NORD", color: "#7aa2ff" });
addBuilding(44, -44, 52, -38.5, 6);

// Garage de Mina (bâtiment décalé à l'ouest : la rue des Ateliers reste libre au nord)
addBuilding(-54, -26, -42, -14, 6, { text: "GARAGE MINA", color: "#FFC370" }, MAT.wallDark);
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
// Grille de service (conséquence post-mission) : plug de la rive sud x -21→-19, passage ↔ rue des Ateliers
const serviceGate = makeGate(-21, -30.8, -19, -29.5, 0x82d9af);
// Bornes anti-voiture aux entrées du passage piéton (la voiture ne passe pas, le piéton oui)
const bollardWalls: Wall[] = [
  { minX: 15, maxX: 15.6, minZ: -30.6, maxZ: -30, h: 1 },
  { minX: 20.4, maxX: 21, minZ: -30.6, maxZ: -30, h: 1 },
  { minX: -35.6, maxX: -35, minZ: -30.6, maxZ: -30, h: 1 },
  { minX: -32.6, maxX: -32, minZ: -30.6, maxZ: -30, h: 1 },
];
for (const b of bollardWalls) box(b.maxX - b.minX, 1, b.maxZ - b.minZ, MAT.crate, (b.minX + b.maxX) / 2, 0.5, (b.minZ + b.maxZ) / 2, false);
// Tablier du passage (s'estompe quand le joueur est dessous)
const underDeck = box(88, 0.5, 7.6, new THREE.MeshStandardMaterial({ color: 0x24314d, roughness: 0.9, transparent: true }), -8, 3.1, -33);
underDeck.castShadow = false;
if (save.shortcutOpen) setGate(serviceGate, true);

// ============================================================
// QUARTIERS SUPPLÉMENTAIRES (bible 06/08) — extensions même scène
// ============================================================
// --- J01 : rue montante Forges (rue haute) -> La Dalle + liaison piétonne parallèle
groundPlane(9, 26, MAT.road, -44, -54, 0.004);
groundPlane(4, 26, MAT.sidewalk, -37.5, -54, 0.005);
// --- LA DALLE (coteau résidentiel) : z -96..-62
groundPlane(112, 38, new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 1 }), -12, -79, -0.015);
groundPlane(112, 8, MAT.road, -12, -68, 0.004);       // rue du coteau
groundPlane(112, 4, MAT.sidewalk, -12, -62.5, 0.005);
addBuilding(-52, -92, -34, -74, 7, { text: "PALIER A", color: "#FFC370" });
addBuilding(-28, -92, -10, -74, 8, { text: "PERMANENCE", color: "#82D9AF" });
addBuilding(-4, -92, 14, -78, 7, { text: "ÉCOLE DU COTEAU", color: "#7aa2ff" });
addBuilding(34, -92, 52, -74, 9, { text: "HALLES", color: "#FFC370" });
// Immeuble au portique (M03) : pièce intérieure, porte sud (escalier extérieur) + porte entretien ouest
addWall({ minX: 18, maxX: 32, minZ: -90, maxZ: -89.2, h: 4.5 }, MAT.wall);
addWall({ minX: 18, maxX: 23, minZ: -81.8, maxZ: -81, h: 4.5 }, MAT.wall);
addWall({ minX: 27, maxX: 32, minZ: -81.8, maxZ: -81, h: 4.5 }, MAT.wall); // porte sud x 23..27
addWall({ minX: 31.2, maxX: 32, minZ: -90, maxZ: -81, h: 4.5 }, MAT.wall);
addWall({ minX: 18, maxX: 18.8, minZ: -90, maxZ: -87, h: 4.5 }, MAT.wall);
addWall({ minX: 18, maxX: 18.8, minZ: -84, maxZ: -81, h: 4.5 }, MAT.wall); // porte entretien z -87..-84 (leurre)
const dalleRoof = box(15, 0.5, 10, MAT.roof.clone(), 25, 4.8, -85.5);
roofMeshes.push({ mesh: dalleRoof, minX: 16, maxX: 34, minZ: -92, maxZ: -79 });
const portiqueSign = neonSign("IMMEUBLE PORTIQUE", "#ED6562", 8);
portiqueSign.position.set(25, 3.2, -80.9); scene.add(portiqueSign);
// Relais Civis de La Dalle (M04)
addWall({ minX: -30, maxX: -18, minZ: -64.5, maxZ: -63.7, h: 3.6 }, MAT.wallDark);
addWall({ minX: -30, maxX: -29.2, minZ: -64.5, maxZ: -57, h: 3.6 }, MAT.wallDark);
addWall({ minX: -18.8, maxX: -18, minZ: -64.5, maxZ: -57, h: 3.6 }, MAT.wallDark);
addWall({ minX: -30, maxX: -26, minZ: -57.8, maxZ: -57, h: 3.6 }, MAT.wallDark);
addWall({ minX: -22, maxX: -18, minZ: -57.8, maxZ: -57, h: 3.6 }, MAT.wallDark); // porte sud x -26..-22
const relaisSign = neonSign("RELAIS CIVIS", "#ED6562", 7);
relaisSign.position.set(-24, 2.6, -56.9); scene.add(relaisSign);
// Arrière-boutique (U03, dossier) : petite pièce sud Dalle
addWall({ minX: 38, maxX: 48, minZ: -70, maxZ: -69.2, h: 3.2 }, MAT.wallDark);
addWall({ minX: 38, maxX: 38.8, minZ: -70, maxZ: -62, h: 3.2 }, MAT.wallDark);
addWall({ minX: 47.2, maxX: 48, minZ: -70, maxZ: -62, h: 3.2 }, MAT.wallDark);
addWall({ minX: 38, maxX: 41, minZ: -62.8, maxZ: -62, h: 3.2 }, MAT.wallDark);
addWall({ minX: 45, maxX: 48, minZ: -62.8, maxZ: -62, h: 3.2 }, MAT.wallDark); // porte sud x 41..45
const boutiqueSign = neonSign("ARRIÈRE-BOUTIQUE", "#FFC370", 7);
boutiqueSign.position.set(43, 2.4, -61.9); scene.add(boutiqueSign);

// --- J04/J05 : galerie piétonne (S02) et rampe vers Le Nœud, lacets Belvédères à l'est
groundPlane(5, 18, MAT.sidewalk, -10, -103, 0.005);  // galerie S02 (traversée par galerieGate)
groundPlane(10, 18, MAT.road, 30, -103, 0.004);      // rampe routière (traversée par annexeGate)
groundPlane(16, 34, new THREE.MeshStandardMaterial({ color: 0x272d36, roughness: 1 }), 46, -79, -0.014); // Belvédères
const belvSign = neonSign("LES BELVÉDÈRES", "#7aa2ff", 8);
belvSign.position.set(46, 3.4, -63); scene.add(belvSign);
box(10, 0.4, 3, MAT.sidewalk, 46, 0.2, -70, false); // terrasse

// --- LE NŒUD (plateau administratif) : z -142..-112
groundPlane(112, 34, new THREE.MeshStandardMaterial({ color: 0x232830, roughness: 1 }), 8, -127, -0.015);
groundPlane(112, 8, MAT.roadLight, 8, -118, 0.004);
addBuilding(-42, -140, -20, -124, 10, { text: "CENTRE CIVIS", color: "#ED6562" });
addBuilding(8, -140, 24, -126, 8, { text: "ANNEXE REGISTRE", color: "#7aa2ff" });
addBuilding(30, -138, 48, -124, 7, { text: "GUICHETS", color: "#D6DCE1" });
// Bâtiment de commande (M05/M06) : salle de contrôle intérieure, entrée sud
addWall({ minX: -14, maxX: 0, minZ: -138, maxZ: -137.2, h: 5 }, MAT.wallDark);
addWall({ minX: -14, maxX: -13.2, minZ: -138, maxZ: -126, h: 5 }, MAT.wallDark);
addWall({ minX: -0.8, maxX: 0, minZ: -138, maxZ: -126, h: 5 }, MAT.wallDark);
addWall({ minX: -14, maxX: -9, minZ: -126.8, maxZ: -126, h: 5 }, MAT.wallDark);
addWall({ minX: -5, maxX: 0, minZ: -126.8, maxZ: -126, h: 5 }, MAT.wallDark); // porte sud x -9..-5
const cmdRoof = box(15, 0.5, 13, MAT.roof.clone(), -7, 5.3, -132);
roofMeshes.push({ mesh: cmdRoof, minX: -16, maxX: 2, minZ: -140, maxZ: -124 });
const cmdSign = neonSign("POSTE DE COMMANDE", "#ED6562", 8);
cmdSign.position.set(-7, 3.6, -125.9); scene.add(cmdSign);
const horlogeSign = neonSign("PURGE : --:--", "#ED6562", 7);
horlogeSign.position.set(-7, 4.6, -125.9); scene.add(horlogeSign);

// --- J02 : Les Quais au sud (rive) : z 48..86
groundPlane(112, 40, new THREE.MeshStandardMaterial({ color: 0x27313a, roughness: 1 }), -12, 67, -0.015);
groundPlane(10, 40, MAT.road, -44, 67, 0.004);       // chaussée de rive depuis le pont sud
groundPlane(112, 7, MAT.roadLight, -12, 56, 0.004);  // quai haut
groundPlane(112, 5, MAT.sidewalk, -12, 76, 0.005);   // promenade basse
addBuilding(-30, 60, -12, 72, 6, { text: "HALLE DU MARCHÉ", color: "#FFC370" });
addBuilding(0, 60, 18, 72, 7, { text: "PAPETERIE DES QUAIS", color: "#82D9AF" });
addBuilding(24, 62, 40, 74, 6, { text: "ENTREPÔTS", color: "#7aa2ff" });
const quaisSign = neonSign("LES QUAIS", "#00e5ff", 8);
quaisSign.position.set(-12, 3.6, 52); scene.add(quaisSign);
// Signes d'après-campagne (fin A / fin B), cachés par défaut
const finASign = neonSign("RELAI — ACCÈS LIBRE", "#82D9AF", 9);
finASign.position.set(34, 3.4, 1.8); finASign.visible = false; scene.add(finASign);
const finBSign = neonSign("SERVICES RÉTABLIS", "#7aa2ff", 9);
finBSign.position.set(34, 3.4, 1.8); finBSign.visible = false; scene.add(finBSign);
function applyFinEffects(): void {
  finASign.visible = save.fin === "A";
  finBSign.visible = save.fin === "B";
}
// Barrière Dalle -> Nœud (z -97) : galerie S02 (filière Nadia) et rampe annexe (filière Sorel)
addWall({ minX: -56, maxX: -12.5, minZ: -97.6, maxZ: -96.8, h: 3 }, MAT.wallDark);
addWall({ minX: -7.5, maxX: 25, minZ: -97.6, maxZ: -96.8, h: 3 }, MAT.wallDark);
addWall({ minX: 35, maxX: 56, minZ: -97.6, maxZ: -96.8, h: 3 }, MAT.wallDark);
const galerieGate = makeGate(-12.5, -97.6, -7.5, -96.8, 0x82d9af); // S02, filière Nadia
const annexeGate = makeGate(25, -97.6, 35, -96.8, 0x7aa2ff);       // annexe, filière Sorel (badge)
// Portillon piéton du Nœud (U05) : clôture est avec boîtier
addWall({ minX: 51.5, maxX: 52.3, minZ: -124, maxZ: -120, h: 2.4 }, MAT.wallDark);
addWall({ minX: 51.5, maxX: 52.3, minZ: -116, maxZ: -112, h: 2.4 }, MAT.wallDark);
const portillonGate = makeGate(51.5, -120, 52.3, -116, 0x82d9af);
const boitierPos: Vec2 = { x: 50.2, z: -118 };

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
const player: Actor & { lastDamageT: number } = { ...makeActor(GARAGE.x, GARAGE.z + 2, 0xcfc7ae, 0x00e5ff), lastDamageT: -99 };
const playerGun = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.7), MAT.tyre);
playerGun.position.set(0.35, 1.25, 0.45); player.group.add(playerGun);
const playerBag = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.22), new THREE.MeshStandardMaterial({ color: 0x243447, roughness: 0.8 }));
playerBag.position.set(0, 1.05, -0.42); player.group.add(playerBag);

// Mina (PNJ contact) & panneau U01 de la grille de service
const mina = makeActor(GARAGE.x, GARAGE.z, 0x5c2a4a, 0xff2d78);
const minaLamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffc370 }));
minaLamp.position.set(0.28, 1.25, 0.38); mina.group.add(minaLamp);
const minaMark = markerSprite("◆", "#00e5ff"); minaMark.position.set(0, 3.4, 0); mina.group.add(minaMark);
// Bible 05 : pour la remise, Mina attend sous les voies, à la sortie ouest du passage
const MINA_HOME: Vec2 = { x: GARAGE.x, z: GARAGE.z };
const MINA_REMISE: Vec2 = { x: -34.5, z: -27.6 };
function moveMina(toRemise: boolean): void {
  mina.pos = toRemise ? { ...MINA_REMISE } : { ...MINA_HOME };
  actorSync(mina);
}
const panelGroup = new THREE.Group(); panelGroup.position.set(PANEL_POS.x, 0, PANEL_POS.z); scene.add(panelGroup);
{
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.5, 0.5), MAT.wallDark);
  post.position.y = 0.75; post.castShadow = true; panelGroup.add(post);
}
const panelScreenMat = new THREE.MeshBasicMaterial({ color: 0x27351f });
const panelScreen = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.08), panelScreenMat);
panelScreen.position.set(0, 1.15, 0.28); panelGroup.add(panelScreen);
const panelMark = markerSprite("◆", "#82D9AF"); panelMark.position.set(PANEL_POS.x, 3.2, PANEL_POS.z); scene.add(panelMark);
panelMark.visible = false;
// Lampes du tronçon de grille (allumées durablement par U01)
const gateLampMat = new THREE.MeshBasicMaterial({ color: 0x2c3a2e });
const gateLamps: THREE.Mesh[] = [];
for (const lx of [-20.5, -19.5]) {
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), gateLampMat);
  lamp.position.set(lx, 2.55, -30.1); scene.add(lamp); gateLamps.push(lamp);
}
const gateLight = new THREE.PointLight(0x82d9af, 0, 13); gateLight.position.set(-20, 2.6, -29); scene.add(gateLight);
function applyGateLamps(): void {
  gateLampMat.color.set(save.gateLit ? 0x82d9af : 0x2c3a2e);
  panelScreenMat.color.set(save.gateLit ? 0x82d9af : 0x27351f);
  gateLight.intensity = save.gateLit ? 14 : 0;
}

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
// Dégâts visibles de la voiture du joueur (bible 05) : 0 intact, 1 rayure, 2 bosse/phare, 3 grave
let carDamage = 0;
const carScratch = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 2.6), new THREE.MeshBasicMaterial({ color: 0xd8dee6 }));
carScratch.position.set(1.03, 0.62, 0.2); carScratch.visible = false; carGroup.add(carScratch);
const carDent = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.3, 0.7), new THREE.MeshStandardMaterial({ color: 0x5c1a24, roughness: 0.6, metalness: 0.4 }));
carDent.position.set(0, 0.5, 2.0); carDent.visible = false; carGroup.add(carDent);
function applyCarDamageVisual(): void {
  carScratch.visible = carDamage >= 1;
  carDent.visible = carDamage >= 2;
  (MAT.carPaint as THREE.MeshStandardMaterial).color.set(carDamage >= 3 ? 0x6e7f8a : 0x00a8c5);
}
function damageCar(impactSpeed: number): void {
  const level = impactSpeed > 13 ? 3 : impactSpeed > 8 ? 2 : impactSpeed > 3.5 ? 1 : 0;
  if (level > carDamage) { carDamage = level; applyCarDamageVisual(); }
}

// Trafic d'ambiance : boucle avenue (graphe automobile séparé des piétons)
interface TrafficCar { group: THREE.Group; pos: Vec2; angle: number; wp: number; speed: number }
const trafficRoute: Vec2[] = [
  { x: -48, z: 13.5 }, { x: 48, z: 13.5 }, { x: 50, z: 8.5 }, { x: -48, z: 8.5 }, { x: -50, z: 11 },
];
function makeTrafficCar(color: number, startWp: number): TrafficCar {
  const group = new THREE.Group(); scene.add(group);
  const bodyM = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 4.0), new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.6 }));
  bodyM.position.y = 0.55; bodyM.castShadow = true; group.add(bodyM);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 1.8), new THREE.MeshStandardMaterial({ color: 0x101c2c, roughness: 0.25, metalness: 0.5 }));
  cabin.position.set(0, 1.0, -0.2); group.add(cabin);
  for (const s of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.16, 0.08), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    head.position.set(s * 0.6, 0.62, 2.02); group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.08), new THREE.MeshBasicMaterial({ color: 0xff3b3b }));
    tail.position.set(s * 0.6, 0.62, -2.02); group.add(tail);
  }
  const p = trafficRoute[startWp];
  group.position.set(p.x, 0, p.z);
  return { group, pos: { ...p }, angle: 0, wp: (startWp + 1) % trafficRoute.length, speed: 0 };
}
const trafficCars: TrafficCar[] = [
  makeTrafficCar(0xb3543e, 0), makeTrafficCar(0x3e6bb3, 2), makeTrafficCar(0x8a8f4a, 3),
];
function updateTraffic(dt: number): void {
  for (const t of trafficCars) {
    const target = trafficRoute[t.wp];
    const d = dist(t.pos, target);
    if (d < 3) t.wp = (t.wp + 1) % trafficRoute.length;
    const desired = Math.atan2(target.x - t.pos.x, target.z - t.pos.z);
    t.angle = angleLerp(t.angle, desired, Math.min(1, dt * 2.2));
    // Ralentit derrière le joueur (à pied ou en voiture) ou un autre véhicule, puis repart
    let want = phaseTraffic;
    const ahead = { x: t.pos.x + Math.sin(t.angle) * 4.5, z: t.pos.z + Math.cos(t.angle) * 4.5 };
    if (dist(ahead, inCar ? car.pos : player.pos) < 3.2) want = 0;
    for (const o of trafficCars) if (o !== t && dist(ahead, o.pos) < 4) want = Math.min(want, 2);
    if (inCar && dist(t.pos, car.pos) < 3.4 && Math.abs(car.speed) > 6) { damageCar(Math.abs(car.speed)); t.speed = 0; car.speed *= 0.4; }
    t.speed += (want - t.speed) * Math.min(1, dt * 1.8);
    moveEntity(t.pos, Math.sin(t.angle) * t.speed, Math.cos(t.angle) * t.speed, dt, 1.5);
    t.group.position.set(t.pos.x, 0, t.pos.z);
    t.group.rotation.y = t.angle;
  }
}
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
// Annexe des archives Civis (M02) : au nord de l'avenue, porte sud ou grille latérale Intrusion
addWall({ minX: -52, maxX: -44, minZ: -2, maxZ: -1.2, h: 3.4 }, MAT.wallDark);
addWall({ minX: -52, maxX: -49.5, minZ: 5.2, maxZ: 6, h: 3.4 }, MAT.wallDark);
addWall({ minX: -46.5, maxX: -44, minZ: 5.2, maxZ: 6, h: 3.4 }, MAT.wallDark);
addWall({ minX: -52, maxX: -51.2, minZ: -2, maxZ: 6, h: 3.4 }, MAT.wallDark);
addWall({ minX: -44.8, maxX: -44, minZ: -2, maxZ: 1.5, h: 3.4 }, MAT.wallDark);
addWall({ minX: -44.8, maxX: -44, minZ: 4, maxZ: 6, h: 3.4 }, MAT.wallDark);
const archivesSign = neonSign("ARCHIVES CIVIS", "#7aa2ff", 7);
archivesSign.position.set(-48, 2.4, 6.06); scene.add(archivesSign);
const archivesGate = makeGate(-44.8, 1.5, -44, 4, 0x00e5ff);
// Carte annotée du garage (récompense visible U04)
const mapSign = neonSign("CARTE — COTÉAU ↑", "#82D9AF", 6);
mapSign.position.set(-40.5, 2.6, -13.9); mapSign.visible = false; scene.add(mapSign);
const chipPickup = makePickup(CHIP_POS.x, CHIP_POS.z, 0x00e5ff, "●");
const parcelPickup = makePickup(MODULE_POS.x, MODULE_POS.z, 0xffc370, "●");
parcelPickup.group.visible = false; parcelPickup.mark.visible = false;
const calendarPickup = makePickup(-48, 1.5, 0xff2d78, "●");
calendarPickup.group.visible = false; calendarPickup.mark.visible = false;
const docsPickup = makePickup(15.8, -4, 0xffc370, "●");
docsPickup.group.visible = false; docsPickup.mark.visible = false;
// Sorel, agente du registre Civis (M02), devant le Café Signal
const SOREL_POS: Vec2 = { x: -1, z: -12.2 };
const sorel = makeActor(SOREL_POS.x, SOREL_POS.z, 0x2a3a5c, 0x7aa2ff);
const sorelMark = markerSprite("◆", "#7aa2ff"); sorelMark.position.set(0, 3.4, 0); sorel.group.add(sorelMark);
sorelMark.visible = false;
// Nadia (permanence de La Dalle), Lise (permanence de nuit), résidente à escorter (U02)
const NADIA_POS: Vec2 = { x: -19, z: -71.5 };
const nadia = makeActor(NADIA_POS.x, NADIA_POS.z, 0x3a5c46, 0x82d9af);
const nadiaMark = markerSprite("◆", "#82D9AF"); nadiaMark.position.set(0, 3.4, 0); nadia.group.add(nadiaMark);
nadiaMark.visible = false;
const LISE_POS: Vec2 = { x: -15.5, z: -70.5 };
const lise = makeActor(LISE_POS.x, LISE_POS.z, 0x5c3a5e, 0xffc370);
const liseMark = markerSprite("◆", "#FFC370"); liseMark.position.set(0, 3.4, 0); lise.group.add(liseMark);
liseMark.visible = false;
const residente = makeActor(25, -79, 0x6b5a2e, 0xcccccc);
residente.group.visible = false;
let escortActive = false;
// Ramassables de campagne (districts)
const journalPickup = makePickup(25, -87, 0x00e5ff, "●");
journalPickup.group.visible = false; journalPickup.mark.visible = false;
const relevesPickup = makePickup(21, -83, 0x82d9af, "●");
relevesPickup.group.visible = false; relevesPickup.mark.visible = false;
const dossierPickup = makePickup(43, -66, 0xff2d78, "●");
dossierPickup.group.visible = false; dossierPickup.mark.visible = false;
const registrePickup = makePickup(-24, -61, 0xffc370, "●");
registrePickup.group.visible = false; registrePickup.mark.visible = false;
const CONSOLE_POS: Vec2 = { x: -7, z: -134 };

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
  makeGuard(17.5, -7, [{ x: 17.5, z: -7 }, { x: 19.5, z: -22 }, { x: 15.5, z: -14 }]), // cour / quai
  makeGuard(37, -15, [{ x: 37, z: -15 }, { x: 26, z: -15 }, { x: 26, z: -6 }, { x: 44, z: -22 }]), // intérieur
  makeGuard(-8, 11, [{ x: -8, z: 11 }, { x: 22, z: 11 }, { x: 22, z: 17 }, { x: -8, z: 17 }]),     // patrouille avenue
  makeGuard(-48, -5, [{ x: -48, z: -5 }, { x: -38, z: -5 }, { x: -38, z: 10 }, { x: -48, z: 10 }]), // annexe archives (M02)
];
for (const g of guards) {
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.65), MAT.tyre);
  gun.position.set(0.35, 1.25, 0.45); g.group.add(gun);
  // Épaules carrées des vigiles (lisibilité DA)
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.28, 0.6), new THREE.MeshStandardMaterial({ color: 0x3a1a22, roughness: 0.8 }));
  shoulders.position.y = 1.42; g.group.add(shoulders);
}
// Vigiles des districts (patrouilles locales, même IA)
for (const g of [
  makeGuard(8, -64, [{ x: 8, z: -64 }, { x: 36, z: -64 }, { x: 36, z: -58 }, { x: 8, z: -58 }]),
  makeGuard(-7, -120, [{ x: -7, z: -120 }, { x: 14, z: -120 }, { x: 14, z: -122 }, { x: -20, z: -122 }]),
  makeGuard(38, -118, [{ x: 38, z: -118 }, { x: 44, z: -120 }, { x: 30, z: -120 }]),
]) {
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.65), MAT.tyre);
  gun.position.set(0.35, 1.25, 0.45); g.group.add(gun);
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.28, 0.6), new THREE.MeshStandardMaterial({ color: 0x3a1a22, roughness: 0.8 }));
  shoulders.position.y = 1.42; g.group.add(shoulders);
  guards.push(g);
}

// Civils (piétons des trottoirs)
interface Civil extends Actor { target: Vec2; waitT: number; fleeT: number; mode: "walk" | "idle" | "chat"; homeAngle: number }
const civilSpots: Vec2[] = [
  { x: -20, z: 5.5 }, { x: 10, z: 3.5 }, { x: 30, z: 18.5 }, { x: -30, z: 18.5 },
  { x: -42.5, z: 10 }, { x: -35, z: -20 }, { x: 44, z: 18.5 }, { x: -4, z: -8 },
  { x: -20, z: -33 }, { x: 35, z: -39.5 }, { x: -38, z: -6 }, { x: 18, z: -28 },
  { x: 46, z: 5.5 }, { x: -12, z: 18.5 },
];
function randomSpot(): Vec2 { return civilSpots[Math.floor(Math.random() * civilSpots.length)]; }
const civils: Civil[] = [];
const civilColors = [0x3c4a5a, 0x5a4a3c, 0x44583e, 0x58445e, 0x6b5a2e, 0x2e5a6b, 0x71563f, 0x4a3c5e];
for (let i = 0; i < 12; i++) {
  const s = randomSpot();
  const a = makeActor(s.x + (Math.random() * 4 - 2), s.z + (Math.random() * 2 - 1), civilColors[i % civilColors.length], 0xcccccc, 60);
  civils.push({ ...a, target: randomSpot(), waitT: Math.random() * 3, fleeT: 0, mode: "walk", homeAngle: Math.random() * Math.PI * 2 });
}
// Lieux occupés : mécanos devant le garage, habitués au café, voyageur près du passage
function setCivilPlace(idx: number, x: number, z: number, mode: "idle" | "chat", angle: number): void {
  const c = civils[idx]; if (!c) return;
  c.pos = { x, z }; c.mode = mode; c.homeAngle = angle; c.angle = angle; actorSync(c);
}
setCivilPlace(0, -39.5, -5.5, "idle", 0.6);
setCivilPlace(1, -37.8, -4.2, "chat", -2.2);
setCivilPlace(2, 9.2, 19.2, "chat", 1.8);
setCivilPlace(3, 10.8, 19.6, "chat", -1.4);
setCivilPlace(4, -33.2, -27.8, "idle", 0.2); // attend près de l'escalier ouest du passage
// Population des districts (bible 07 : Dalle dense, Nœud employés, Quais marché)
const districtSpots: Vec2[] = [
  { x: -20, z: -66 }, { x: 0, z: -66 }, { x: 20, z: -64 }, { x: -38, z: -70 },
  { x: 8, z: -76 }, { x: -14, z: -72 }, { x: 44, z: -60 }, { x: 0, z: -120 },
  { x: 20, z: -122 }, { x: -30, z: -120 }, { x: -12, z: 58 }, { x: 8, z: 58 },
  { x: -24, z: 74 }, { x: 16, z: 74 }, { x: 46, z: -72 }, { x: -44, z: -60 },
];
for (let i = 0; i < districtSpots.length; i++) {
  const s = districtSpots[i];
  const a = makeActor(s.x, s.z, civilColors[(i + 3) % civilColors.length], 0xcccccc, 60);
  civils.push({ ...a, target: districtSpots[(i + 5) % districtSpots.length], waitT: Math.random() * 3, fleeT: 0, mode: "walk", homeAngle: Math.random() * Math.PI * 2 });
}
setCivilPlace(12 + 0, -19.8, -69.8, "chat", 1.2); // file à la permanence
setCivilPlace(12 + 1, -18.2, -69.6, "chat", -1.9);

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
let hasCalendar = false;
let hasDocs = false;
let hasJournal = false;
let hasReleves = false;
let hasDossier = false;
let hasRegistre = false;
let hasContractItem = false;
let borneActivated = false;
const BORNE_POS: Vec2 = { x: -33, z: -33 };
const C01_DEST: Vec2 = { x: 0, z: 58 };
const c01Mark = markerSprite("◆", "#FFC370"); c01Mark.position.set(C01_DEST.x, 3.2, C01_DEST.z); scene.add(c01Mark); c01Mark.visible = false;
interface Escort { actor: Actor; dest: Vec2; kind: "u02" | "c04" }
let escort: Escort | null = null;
const habitant = makeActor(20, 11, 0x4a5c6b, 0xffc370);
habitant.group.visible = false;
const cooldowns: Record<ImplantId, number> = { intrusion: 0, leurre: 0, surcharge: 0 };
let toastTimer: ReturnType<typeof setTimeout> | null = null;
function showToast(msg: string, ms = 5200): void {
  el.toast.textContent = msg;
  el.toast.classList.remove("hidden");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.add("hidden"), ms);
}

function actorSync(a: Actor): void {
  const gy = groundY(a.pos.x, a.pos.z);
  a.group.position.set(a.pos.x, gy, a.pos.z);
  a.group.rotation.y = a.angle;
  if (a.dead) {
    a.fallT = Math.min(1, a.fallT + 0.08);
    a.group.rotation.x = -Math.PI / 2 * a.fallT * 0.92;
    a.group.position.y = gy + 0.25 * (1 - a.fallT);
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
    if (!archivesGate.open && dist(player.pos, { x: -44.4, z: 2.7 }) < 4) {
      setGate(archivesGate, true);
      cooldowns.intrusion = IMPLANT_INFO.intrusion.cooldown;
      sfx.door(); sfx.implant();
      showToast("Accès latéral des archives ouvert (Intrusion).");
      return;
    }
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
  if (dist(player.pos, sorel.pos) < 3 && save.m04 === "Registre pris")
    return { label: "E — Remettre la copie du registre à Sorel (filière Sorel)", run: () => deliverRegistre("sorel") };
  if (dist(player.pos, sorel.pos) < 3 && save.u05 === "Disponible")
    return { label: "E — Parler à Sorel (U05)", run: talkSorel };
  if (dist(player.pos, sorel.pos) < 3 && save.m02 !== "Indisponible" && save.m02 !== "Terminée")
    return { label: save.m02 === "Calendrier pris" ? "E — Remettre le calendrier à Sorel" : "E — Parler à Sorel", run: talkSorel };
  if (dist(player.pos, nadia.pos) < 3)
    return { label: save.m04 === "Registre pris" ? "E — Remettre la copie à Nadia (filière Nadia)" : save.m03 === "Journal pris" ? "E — Remettre le journal à Nadia" : "E — Parler à Nadia", run: talkNadia };
  if (dist(player.pos, lise.pos) < 3 && save.u03 !== "Indisponible" && save.u03 !== "Terminée")
    return { label: save.u03 === "Dossier pris" ? "E — Voir Lise (choix du dossier)" : "E — Parler à Lise", run: talkLise };
  if (save.m03 === "Acceptée" && dist(player.pos, journalPickup.pos) < 2.6)
    return { label: "E — Prendre le journal du portique", run: takeJournal };
  if (save.u02 === "Acceptée" && dist(player.pos, relevesPickup.pos) < 2.6)
    return { label: "E — Prendre les relevés d'accès", run: takeReleves };
  if (save.u03 === "Acceptée" && dist(player.pos, dossierPickup.pos) < 2.6)
    return { label: "E — Prendre le dossier", run: takeDossier };
  if (save.m04 === "Acceptée" && dist(player.pos, registrePickup.pos) < 2.6)
    return { label: "E — Prendre le registre d'audit", run: takeRegistre };
  if (save.m05 === "Acceptée" && dist(player.pos, CONSOLE_POS) < 3)
    return { label: "E — Rétablir le poste de commande", run: completeM05 };
  if (save.m06 === "Acceptée" && dist(player.pos, CONSOLE_POS) < 3)
    return { label: "E — Décider du sort du registre", run: () => openBriefing("choix-fin") };
  if (save.m06 === "Disponible" && dist(player.pos, CONSOLE_POS) < 3)
    return { label: "E — Accepter M06 au poste", run: () => openBriefing("m06") };
  if (save.u05 === "Acceptée" && dist(player.pos, boitierPos) < 3)
    return { label: "E — Remettre le portillon en service", run: completeU05 };
  if (save.contractActive === "c01" && !hasContractItem && dist(player.pos, parcelPickup.pos) < 2.6)
    return { label: "E — Prendre le colis du relais", run: () => { hasContractItem = true; parcelPickup.group.visible = false; parcelPickup.mark.visible = false; sfx.pickup(); showToast("Colis pris. Livraison : marché des Quais (sud, rive)."); } };
  if (save.contractActive === "c02" && !hasContractItem && dist(player.pos, docsPickup.pos) < 2.6)
    return { label: "E — Récupérer le matériel", run: () => { hasContractItem = true; docsPickup.group.visible = false; docsPickup.mark.visible = false; sfx.pickup(); showToast("Matériel récupéré dans la cour. Ramène-le à Mina."); } };
  if (save.contractActive === "c03" && !borneActivated && dist(player.pos, BORNE_POS) < 3)
    return { label: "E — Remettre le relais en marche", run: () => { borneActivated = true; sfx.ok(); showToast("Relais en marche. Quitte la zone du passage pour valider."); } };
  if (save.contractActive === "c04" && !escort && dist(player.pos, habitant.pos) < 3)
    return { label: "E — Accompagner l'habitant", run: () => { escort = { actor: habitant, dest: { ...GARAGE }, kind: "c04" }; showToast("L'habitant te suit. Amène-le au garage de Mina."); } };
  if (dist(player.pos, car.pos) < 3.2) return { label: "E — Monter dans la voiture", run: enterCar };
  if (save.m02 === "Acceptée" && dist(player.pos, calendarPickup.pos) < 2.6)
    return { label: "E — Prendre le calendrier papier", run: takeCalendar };
  if (save.u04 === "Acceptée" && dist(player.pos, docsPickup.pos) < 2.6)
    return { label: "E — Prendre les documents", run: takeDocs };
  if ((save.mission === "Acceptée") && !chipStolenOnce && dist(player.pos, chipPickup.pos) < 2.6)
    return { label: "E — Voler la puce", run: stealChip };
  if (save.secondary === "Accepté" && dist(player.pos, parcelPickup.pos) < 2.6)
    return { label: "E — Prendre le module", run: takeParcel };
  if (save.secondary === "Colis pris" && dist(player.pos, PANEL_POS) < 3)
    return { label: "E — Poser le module sur le panneau", run: deliverParcel };
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
  if (save.mission === "Puce récupérée") { tryDeliverChip(); return; }
  if (save.u04 === "Documents pris") { deliverDocs(); return; }
  if (save.contractActive === "c02" && hasContractItem) { completeContract("Récupération de matériel terminée"); return; }
  const avail = availableBriefings();
  if (avail.length) { openBriefing(avail[0]); return; }
  if (save.mission === "Terminée") {
    showToast("Mina : « Le passage de service reste ouvert, ses lampes aussi. La ville respire un peu mieux grâce à toi. »");
    return;
  }
  showToast("Mina : « Le dépôt Civis est à l'est, après l'avenue. Choisis ton entrée — et où tu laisses la voiture. »");
}
function talkSorel(): void {
  if (save.m02 === "Calendrier pris") { deliverCalendar(); return; }
  if (save.u05 === "Disponible") { openBriefing("u05"); return; }
  if (save.m02 === "Disponible") { openBriefing("m02"); return; }
  showToast("Sorel : « Je distingue ce que je sais de ce que je peux prouver. Le calendrier papier est aux archives, à l'ouest. Porte sud, ou grille latérale avec Intrusion. »");
}
function takeCalendar(): void {
  hasCalendar = true;
  save.m02 = "Calendrier pris";
  calendarPickup.group.visible = false; calendarPickup.mark.visible = false;
  persist(); sfx.pickup();
  showToast("Calendrier de migration pris. Remets-le à Sorel devant le Café Signal (◆ bleu).");
  refreshObjective();
}
function deliverCalendar(): void {
  if (!hasCalendar) return;
  hasCalendar = false;
  save.m02 = "Terminée";
  save.dalleAccess = true;
  if (save.u04 === "Indisponible") save.u04 = "Disponible";
  if (!save.m02RewardClaimed) { save.credits += 400; save.m02RewardClaimed = true; }
  sorelMark.visible = false;
  persist(); sfx.ok();
  showToast("Sorel (+400 ¤) : « Purge avancée au 17, premier immeuble visé côté coteau. » Accès campagne à La Dalle noté au journal. Mina a une quête U04 pour toi.");
  refreshObjective(); refreshJournal();
}
// ---------- Campagne districts : M03-M06, U02/U03/U05, contrats ----------
function talkNadia(): void {
  if (save.m04 === "Registre pris") { deliverRegistre("nadia"); return; }
  if (save.m03 === "Journal pris") { deliverJournal(); return; }
  if (save.m03 === "Disponible") { openBriefing("m03"); return; }
  if (save.u02 === "Disponible") { openBriefing("u02"); return; }
  if (save.m04 === "Disponible") { openBriefing("m04"); return; }
  if (save.m05 === "Disponible") { openBriefing("m05"); return; }
  if (save.m06 === "Disponible") { openBriefing("m06"); return; }
  showToast("Nadia : « Qui pourra encore entrer chez lui demain ? La permanence tient les accès ouverts. »");
}
function talkLise(): void {
  if (save.u03 === "Dossier pris") { openBriefing("choix-u03"); return; }
  if (save.u03 === "Disponible") { openBriefing("u03"); return; }
  showToast("Lise : « La permanence de nuit fixe ses conditions d'entraide. Personne n'est un dossier. »");
}
function takeJournal(): void {
  hasJournal = true; save.m03 = "Journal pris";
  journalPickup.group.visible = false; journalPickup.mark.visible = false;
  persist(); sfx.pickup();
  showToast("Journal du portique pris. Rapportez-le à Nadia à la permanence.");
  refreshObjective();
}
function deliverJournal(): void {
  if (!hasJournal) return;
  hasJournal = false; save.m03 = "Terminée";
  save.credits += 450;
  if (save.u02 === "Indisponible") save.u02 = "Disponible";
  if (save.u03 === "Indisponible") save.u03 = "Disponible";
  if (save.m04 === "Indisponible") save.m04 = "Disponible";
  persist(); sfx.ok();
  showToast("Nadia (+450 ¤) : « Ce journal lie les révocations au bordereau de la puce. » U02, U03 et M04 (registre d'audit) sont disponibles.");
  refreshObjective(); refreshJournal();
}
function takeReleves(): void {
  hasReleves = true; save.u02 = "Relevés pris";
  relevesPickup.group.visible = false; relevesPickup.mark.visible = false;
  residente.group.visible = true; residente.pos = { x: 25, z: -79 }; actorSync(residente);
  save.u02 = "Escorte";
  escort = { actor: residente, dest: { ...NADIA_POS }, kind: "u02" };
  persist(); sfx.pickup();
  showToast("Relevés pris. La résidente t'attend devant l'immeuble : escorte-la à la permanence (elle te suit, attends-la si elle décroche).");
  refreshObjective();
}
function completeU02(): void {
  save.u02 = "Terminée"; save.credits += 250;
  residente.group.visible = false; escort = null;
  persist(); sfx.ok();
  showToast("Résidente à la permanence (+250 ¤). Nadia ouvre une porte de cour facultative côté palier.");
  refreshObjective(); refreshJournal();
}
function takeDossier(): void {
  hasDossier = true; save.u03 = "Dossier pris";
  dossierPickup.group.visible = false; dossierPickup.mark.visible = false;
  persist(); sfx.pickup();
  showToast("Dossier de chantage pris. Lise fixera les conditions : le détruire ou le lui remettre.");
  refreshObjective();
}
function finishU03(choice: "detruit" | "remis"): void {
  hasDossier = false; save.u03 = "Terminée"; save.u03Choice = choice; save.credits += 250;
  persist(); sfx.ok();
  showToast(choice === "detruit"
    ? "Dossiers privés détruits à la demande de Lise (+250 ¤). La permanence reste accessible, les noms sont protégés."
    : "Preuves remises à Lise (+250 ¤), qui les gardera sous clé. La permanence reste accessible.");
  refreshObjective(); refreshJournal();
}
function takeRegistre(): void {
  hasRegistre = true; save.m04 = "Registre pris";
  registrePickup.group.visible = false; registrePickup.mark.visible = false;
  persist(); sfx.pickup();
  showToast("Registre d'audit pris. Choix de filière : copie à Nadia (galerie S02) ou à Sorel aux Forges (badge de service).");
  refreshObjective();
}
function deliverRegistre(to: "nadia" | "sorel"): void {
  if (!hasRegistre) return;
  hasRegistre = false; save.m04 = "Terminée"; save.filiere = to; save.credits += 500;
  if (to === "nadia") { setGate(galerieGate, true); showToast("Copie à Nadia (+500 ¤) : la galerie S02 vers le plateau est ouverte. M05 au Nœud."); }
  else { setGate(annexeGate, true); showToast("Copie à Sorel (+500 ¤) : badge de service actif, l'annexe du plateau est ouverte. M05 au Nœud."); }
  if (save.m05 === "Indisponible") save.m05 = "Disponible";
  persist(); sfx.ok();
  refreshObjective(); refreshJournal();
}
function completeM05(): void {
  save.m05 = "Terminée"; save.credits += 500;
  if (save.m06 === "Indisponible") save.m06 = "Disponible";
  if (save.u05 === "Indisponible") save.u05 = "Disponible";
  setGate(galerieGate, true); setGate(annexeGate, true); // route de secours ouverte après M05
  persist(); sfx.ok();
  showToast("Poste rétabli (+500 ¤). Horloge de purge affichée : 17 — 06:00. M06 : la salle de contrôle t'attend, ici même. U05 disponible (Sorel).");
  refreshObjective(); refreshJournal();
}
function finishM06(choice: "A" | "B"): void {
  save.m06 = "Terminée"; save.fin = choice;
  applyFinEffects();
  persist(); sfx.ok();
  showToast(choice === "A"
    ? "FIN A — Registre public : preuves expurgées publiées, autorisations aux relais. Les contrôles Civis ferment (voir l'enseigne au dépôt), la ville reste libre."
    : "FIN B — Révocations annulées : la purge est annulée, les services rouvrent (voir l'enseigne), Civis garde des portiques sous cellule de contrôle avec Sorel. La ville reste libre.");
  refreshObjective(); refreshJournal();
}
function completeU05(): void {
  save.u05 = "Terminée"; save.credits += 200;
  setGate(portillonGate, true);
  persist(); sfx.ok();
  showToast(`Portillon piéton remis en service (+200 ¤) pour l'équipe de nuit.${save.fin === "A" ? " Signalétique : accès libre." : save.fin === "B" ? " Signalétique : service rétabli sous contrôle." : ""}`);
  refreshObjective(); refreshJournal();
}
// Contrats communs C01-C04 (un à la fois, rotation, récompense par occurrence)
function completeContract(msg: string): void {
  save.contractActive = ""; save.contractCount++; save.credits += 120;
  hasContractItem = false; borneActivated = false;
  parcelPickup.group.visible = false; parcelPickup.mark.visible = false;
  docsPickup.group.visible = false; docsPickup.mark.visible = false;
  habitant.group.visible = false;
  persist(); sfx.ok();
  showToast(`${msg} (+120 ¤, contrat ${save.contractCount} terminé). Mina peut proposer le contrat suivant.`);
  refreshObjective(); refreshJournal();
}
function updateEscortAndContracts(dt: number): void {
  if (escort) {
    const a = escort.actor;
    const d = dist(a.pos, player.pos);
    if (d > 2.6) moveGuardLike(a, player.pos, d > 8 ? 7.4 : 5.4, dt); // rattrape si le joueur s'éloigne, attend à proximité
    actorSync(a);
    if (dist(a.pos, escort.dest) < 3.6 && dist(player.pos, escort.dest) < 12) {
      if (escort.kind === "u02") { save.u02 = "Escorte"; completeU02(); }
      else completeContract("Passage accompagné terminé : habitant arrivé au garage");
    }
  }
  c01Mark.visible = save.contractActive === "c01" && hasContractItem;
  if (save.contractActive === "c01" && hasContractItem && dist(player.pos, C01_DEST) < 3.2)
    completeContract("Course entre relais terminée : colis livré au marché des Quais");
  if (save.contractActive === "c03" && borneActivated && dist(player.pos, BORNE_POS) > 18)
    completeContract("Relais hors ligne remis en marche, zone quittée");
}
function takeDocs(): void {
  hasDocs = true;
  save.u04 = "Documents pris";
  docsPickup.group.visible = false; docsPickup.mark.visible = false;
  persist(); sfx.pickup();
  showToast("Documents de papeterie pris dans la cour. Rends-les à Mina au garage.");
  refreshObjective();
}
function deliverDocs(): void {
  if (!hasDocs) return;
  hasDocs = false;
  save.u04 = "Terminée";
  if (!save.u04RewardClaimed) { save.credits += 200; save.u04RewardClaimed = true; }
  mapSign.visible = true;
  persist(); sfx.ok();
  showToast("Documents rendus (+200 ¤). Mina expose la carte annotée du quartier au garage : la montée vers le coteau (La Dalle) y est repérée.");
  refreshObjective(); refreshJournal();
}
function stealChip(): void {
  save.mission = "Puce récupérée";
  chipStolenOnce = true;
  chipPickup.group.visible = false; chipPickup.mark.visible = false;
  lastConfirmedT = gameTime; // l'intervention connaît le dépôt, pas encore ta position exacte
  moveMina(true); // Mina gagne le point de remise sous les voies (bible 05)
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
  if (save.m02 === "Indisponible") save.m02 = "Disponible";
  moveMina(false); // Mina regagne le garage après la remise
  persist();
  sfx.ok();
  showToast("Puce remise à Mina sous les voies (+500 ¤). Elle ouvre la grille de service (passage ↔ rue des Ateliers) et te parlera de Sorel (M02) au garage. U01 aussi disponible.");
  refreshObjective(); refreshJournal();
}
function takeParcel(): void {
  // U01 — Une porte de plus : le « colis » est le module d'éclairage du garage
  hasParcel = true;
  save.secondary = "Colis pris";
  parcelPickup.group.visible = false; parcelPickup.mark.visible = false;
  panelMark.visible = true;
  persist(); sfx.pickup();
  showToast("Module pris au garage. Pose-le sur le panneau de la grille verte (◆ vert), par le passage sous les voies ou par la rue.");
  refreshObjective();
}
function deliverParcel(): void {
  if (!hasParcel) return;
  hasParcel = false;
  save.secondary = "Terminé";
  save.gateLit = true;
  applyGateLamps();
  if (!save.secondaryRewardClaimed) {
    save.credits += 250; save.secondaryRewardClaimed = true;
    if (!save.unlocked.includes("surcharge")) save.unlocked.push("surcharge");
  }
  panelMark.visible = false;
  persist(); sfx.ok();
  showToast("Module posé (+250 ¤) : les lampes de la grille de service restent allumées. Mina débloque aussi l'implant Surcharge au garage.");
  refreshObjective(); refreshJournal();
}

// ---------- Briefing & choix d'implants ----------
let briefingKind: BriefKind = "m01";
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
type BriefKind = "m01" | "m02" | "u01" | "u04" | "m03" | "u02" | "u03" | "m04" | "m05" | "m06" | "u05" | "c01" | "c02" | "c03" | "c04" | "choix-u03" | "choix-fin";
const BRIEF_CONTENT: Record<BriefKind, { title: string; kicker: string; accept: string; quote: string; list: string[] }> = {
  m01: {
    title: "Puce fantôme", kicker: "GARAGE DE MINA — BRIEFING M01", accept: "Accepter M01",
    quote: "Mina : « Le dépôt Civis garde une puce de révocation. Ton nom est dans la prochaine mise à jour. Vole-la, et remets-la-moi sous les voies, à pied, après 5 secondes sans détection confirmée. »",
    list: ["Entrée principale (avenue, caméra) : sans implant.", "Cour latérale : grille Intrusion (F) ou leurre (R), sans tirer.", "Fuite voiture par le pont, ou escalier + passage sous les voies à pied."],
  },
  m02: {
    title: "Date d'effet", kicker: "SOREL — BRIEFING M02", accept: "Accepter M02",
    quote: "Sorel : « Civis a avancé la purge. La copie papier du calendrier de migration est à l'annexe des archives, à l'ouest. Je distingue ce que je sais de ce que je peux prouver : rapporte-la-moi. »",
    list: ["Annexe des archives : porte sud frontale, ou grille latérale avec Intrusion (F).", "Un vigile patrouille autour de l'annexe.", "Résultat : date de purge, premier immeuble visé, accès campagne à La Dalle."],
  },
  u01: {
    title: "U01 — Une porte de plus", kicker: "GARAGE DE MINA — QUÊTE UNIQUE U01", accept: "Accepter U01",
    quote: "Mina : « Sous les voies. La grille verte, côté ateliers. Prends le module au garage et pose-le sur son panneau pour rétablir l'éclairage. »",
    list: ["Module au garage, à côté de Mina.", "Panneau par le raccourci ouvert ou par la rue du sud.", "Les lampes de la grille restent allumées durablement."],
  },
  u04: {
    title: "U04 — Papier carbone", kicker: "GARAGE DE MINA — QUÊTE UNIQUE U04", accept: "Accepter U04",
    quote: "Mina : « Un lot de documents de l'ancienne papeterie traîne dans la cour du dépôt. Entre par le quai ou le porche, et rends-les à leur propriétaire : moi. »",
    list: ["Documents dans la cour du dépôt, côté quai (sud).", "Entrée par le quai, la ruelle ou la grille si elle est ouverte.", "Récompense : carte annotée du quartier exposée au garage."],
  },
  m03: {
    title: "M03 — La première porte", kicker: "PERMANENCE DE NADIA — LA DALLE", accept: "Accepter M03",
    quote: "Nadia : « Un immeuble a déjà perdu ses accès. Récupère le journal du portique, par l'escalier extérieur ou l'accès d'entretien après avoir détourné la patrouille. »",
    list: ["La Dalle : rue montante J01 à l'ouest de la rue haute, ou liaison piétonne parallèle.", "Immeuble Portique : porte sud, ou porte d'entretien ouest avec un leurre sur le vigile.", "Rapporter le journal à Nadia."],
  },
  u02: {
    title: "U02 — L'étage des absents", kicker: "PERMANENCE DE NADIA — QUÊTE UNIQUE", accept: "Accepter U02",
    quote: "Nadia : « Récupère les relevés d'accès dans l'immeuble, puis escorte la résidente jusqu'ici. Elle attend si tu t'éloignes. »",
    list: ["Relevés dans l'immeuble Portique.", "La résidente te suit ; arrivée à la permanence ensemble."],
  },
  u03: {
    title: "U03 — Les noms de la nuit", kicker: "PERMANENCE DE NUIT — LISE", accept: "Accepter U03",
    quote: "Lise : « Un dossier de chantage vise des adultes de la permanence. Il est à l'arrière-boutique. Tu décideras avec moi : le détruire ou me le remettre. »",
    list: ["Arrière-boutique au sud de La Dalle (porte sud).", "Choix final chez Lise, dialogues selon le choix."],
  },
  m04: {
    title: "M04 — Le registre des effacés", kicker: "LA DALLE — MISSION PRINCIPALE", accept: "Accepter M04",
    quote: "Nadia : « Le registre d'audit est au relais Civis. Ensuite, tu choisiras qui reçoit la copie : moi, ou Sorel. »",
    list: ["Relais Civis au nord de la rue du coteau (porte sud).", "Choix de filière à la remise : Nadia ouvre la galerie S02 ; Sorel donne le badge d'annexe."],
  },
  m05: {
    title: "M05 — Dernière montée", kicker: "LE NŒUD — MISSION PRINCIPALE", accept: "Accepter M05",
    quote: "« Gagne le centre administratif et rétablis un poste de commande pour le registre. »",
    list: ["Entrée par ta filière (galerie S02 ou annexe badge) ; l'autre route deviendra le secours.", "Poste de commande : console au nord du bâtiment (E)."],
  },
  m06: {
    title: "M06 — Droit d'accès", kicker: "LE NŒUD — MISSION FINALE", accept: "Accepter M06",
    quote: "« Atteins la salle de contrôle et choisis quoi faire du registre. Les deux décisions (filière, fin) resteront enregistrées. »",
    list: ["Salle de contrôle : même console, couloir surveillé.", "Fin A : registre public. Fin B : révocations annulées."],
  },
  u05: {
    title: "U05 — Le dernier portillon", kicker: "SOREL — QUÊTE UNIQUE, LE NŒUD", accept: "Accepter U05",
    quote: "Sorel : « Remets en service la sortie piétonne de l'équipe de nuit. Le boîtier est à la clôture est du plateau. »",
    list: ["Boîtier à la clôture est du Nœud (E).", "Le portillon devient praticable ; signalétique selon la fin choisie."],
  },
  c01: {
    title: "C01 — Course entre relais", kicker: "CONTRAT COMMUN — MINA", accept: "Accepter C01",
    quote: "Mina : « Un colis du garage pour le marché des Quais. Le véhicule reste facultatif. »",
    list: ["Colis au garage.", "Livraison au point du marché des Quais (sud).", "Récompense par occurrence : 120 ¤."],
  },
  c02: {
    title: "C02 — Récupération de matériel", kicker: "CONTRAT COMMUN — MINA", accept: "Accepter C02",
    quote: "Mina : « Du matériel m'attend dans la cour du dépôt. Leurre et Intrusion peuvent changer l'accès. »",
    list: ["Matériel côté quai de la cour.", "Retour à Mina."],
  },
  c03: {
    title: "C03 — Relais hors ligne", kicker: "CONTRAT COMMUN — MINA", accept: "Accepter C03",
    quote: "Mina : « La borne du passage sous les voies est hors ligne. Remets-la en marche, puis quitte la zone. »",
    list: ["Borne à l'entrée ouest du passage (E).", "Valide en t'éloignant de la zone."],
  },
  c04: {
    title: "C04 — Passage accompagné", kicker: "CONTRAT COMMUN — MINA", accept: "Accepter C04",
    quote: "Mina : « Un habitant attend sur l'avenue. Accompagne-le jusqu'au garage. »",
    list: ["Habitant sur l'avenue des Voies (E pour partir).", "Arrivée ensemble au garage."],
  },
  "choix-u03": {
    title: "U03 — Le sort du dossier", kicker: "LISE — CHOIX", accept: "Remettre les preuves à Lise",
    quote: "Lise : « À ma demande, on peut détruire ces dossiers privés, ou me les remettre sous clé. La permanence reste accessible dans les deux cas. »",
    list: ["Bouton principal : remettre les preuves à Lise.", "Bouton « Plus tard » ci-dessous : détruire les dossiers privés."],
  },
  "choix-fin": {
    title: "M06 — Le sort du registre", kicker: "SALLE DE CONTRÔLE — DÉCISION FINALE", accept: "Fin A — Registre public",
    quote: "« Publier les preuves expurgées et passer les autorisations aux relais (A), ou annuler la purge et restaurer les droits sous contrôle (B) ? »",
    list: ["Bouton principal : Fin A, registre public.", "Bouton « Plus tard » ci-dessous : Fin B, révocations annulées."],
  },
};
function availableBriefings(): BriefKind[] {
  const out: BriefKind[] = [];
  if (save.mission === "Disponible") out.push("m01");
  if (save.m02 === "Disponible") out.push("m02");
  if (save.m03 === "Disponible") out.push("m03");
  if (save.u02 === "Disponible") out.push("u02");
  if (save.u03 === "Disponible") out.push("u03");
  if (save.m04 === "Disponible") out.push("m04");
  if (save.m05 === "Disponible") out.push("m05");
  if (save.m06 === "Disponible") out.push("m06");
  if (save.u05 === "Disponible") out.push("u05");
  if (save.secondary === "Disponible") out.push("u01");
  if (save.u04 === "Disponible") out.push("u04");
  if (!save.contractActive && save.mission === "Terminée" && !out.length)
    out.push((["c01", "c02", "c03", "c04"] as BriefKind[])[save.contractCount % 4]);
  return out;
}
function openBriefing(kind: BriefKind): void {
  briefingKind = kind;
  briefingOpen = true;
  draftEquipped = [...save.equipped];
  el.briefingError.textContent = "";
  const c = BRIEF_CONTENT[kind];
  const h2 = el.briefing.querySelector("h2");
  const kicker = el.briefing.querySelector(".kicker");
  if (h2) h2.textContent = c.title;
  if (kicker) kicker.textContent = c.kicker;
  el.btnAccept.textContent = c.accept;
  el.btnBriefClose.textContent = kind === "choix-u03" ? "Détruire les dossiers privés" : kind === "choix-fin" ? "Fin B — Révocations annulées" : "Plus tard";
  const paras = el.briefing.querySelectorAll("p");
  if (paras[1]) paras[1].innerHTML = `<strong>${c.quote}</strong>`;
  const ul = el.briefing.querySelector(".brief-list");
  if (ul) ul.innerHTML = c.list.map((li) => `<li>${li}</li>`).join("");
  // Sélecteur si plusieurs missions sont disponibles chez le contact
  el.briefSelect.innerHTML = "";
  for (const k of availableBriefings()) {
    if (availableBriefings().length < 2) break;
    const b = document.createElement("button");
    b.className = "implant-choice" + (k === kind ? " selected" : "");
    b.innerHTML = `<strong>${BRIEF_CONTENT[k].title}</strong>`;
    b.addEventListener("click", () => openBriefing(k));
    el.briefSelect.appendChild(b);
  }
  renderImplantChoices();
  el.briefing.classList.remove("hidden");
}
function closeBriefing(): void { briefingOpen = false; el.briefing.classList.add("hidden"); }
el.btnBriefClose.addEventListener("click", () => {
  if (briefingKind === "choix-u03") { closeBriefing(); finishU03("detruit"); return; }
  if (briefingKind === "choix-fin") { closeBriefing(); finishM06("B"); return; }
  closeBriefing();
});
el.btnAccept.addEventListener("click", () => {
  if (briefingKind === "choix-u03") { closeBriefing(); finishU03("remis"); return; }
  if (briefingKind === "choix-fin") { closeBriefing(); finishM06("A"); return; }
  if (draftEquipped.length !== 2) { el.briefingError.textContent = "Choisis exactement 2 implants."; return; }
  save.equipped = [...draftEquipped];
  if (briefingKind === "m01") {
    save.mission = "Acceptée";
    save.hasCheckpoint = true; // point de reprise créé à la fin du briefing
    chipStolenOnce = false;
    chipPickup.group.visible = true; chipPickup.mark.visible = true;
    showToast("M01 acceptée. Point de reprise au garage. Direction le dépôt Civis, à l'est.");
  } else if (briefingKind === "m02") {
    save.m02 = "Acceptée";
    save.hasCheckpoint = true;
    hasCalendar = false;
    calendarPickup.group.visible = true; calendarPickup.mark.visible = true;
    sorelMark.visible = true;
    showToast("M02 acceptée : calendrier à l'annexe des archives (ouest), puis Sorel au Café Signal.");
  } else if (briefingKind === "m03") {
    save.m03 = "Acceptée"; save.hasCheckpoint = true; hasJournal = false;
    journalPickup.group.visible = true; journalPickup.mark.visible = true;
    showToast("M03 acceptée : journal du portique à La Dalle (J01 à l'ouest de la rue haute).");
  } else if (briefingKind === "u02") {
    save.u02 = "Acceptée"; hasReleves = false;
    relevesPickup.group.visible = true; relevesPickup.mark.visible = true;
    showToast("U02 acceptée : relevés dans l'immeuble Portique, puis escorte de la résidente.");
  } else if (briefingKind === "u03") {
    save.u03 = "Acceptée"; hasDossier = false;
    dossierPickup.group.visible = true; dossierPickup.mark.visible = true;
    showToast("U03 acceptée : dossier à l'arrière-boutique (sud de La Dalle).");
  } else if (briefingKind === "m04") {
    save.m04 = "Acceptée"; save.hasCheckpoint = true; hasRegistre = false;
    registrePickup.group.visible = true; registrePickup.mark.visible = true;
    showToast("M04 acceptée : registre d'audit au relais Civis de La Dalle.");
  } else if (briefingKind === "m05") {
    save.m05 = "Acceptée"; save.hasCheckpoint = true;
    showToast("M05 acceptée : poste de commande au Nœud, par ta filière.");
  } else if (briefingKind === "m06") {
    save.m06 = "Acceptée";
    showToast("M06 acceptée : la salle de contrôle décide du sort du registre.");
  } else if (briefingKind === "u05") {
    save.u05 = "Acceptée";
    showToast("U05 acceptée : boîtier du portillon à la clôture est du Nœud.");
  } else if (briefingKind === "c01" || briefingKind === "c02" || briefingKind === "c03" || briefingKind === "c04") {
    save.contractActive = briefingKind; hasContractItem = false; borneActivated = false;
    if (briefingKind === "c01") { parcelPickup.group.visible = true; parcelPickup.mark.visible = true; }
    if (briefingKind === "c02") { docsPickup.group.visible = true; docsPickup.mark.visible = true; }
    if (briefingKind === "c04") { habitant.group.visible = true; habitant.pos = { x: 20, z: 11 }; actorSync(habitant); }
    showToast(`Contrat ${briefingKind.toUpperCase()} accepté. Voir l'objectif en haut à gauche.`);
  } else if (briefingKind === "u04") {
    save.u04 = "Acceptée";
    hasDocs = false;
    docsPickup.group.visible = true; docsPickup.mark.visible = true;
    showToast("U04 acceptée : documents dans la cour du dépôt, à rendre à Mina.");
  } else {
    save.secondary = "Accepté";
    hasParcel = false;
    parcelPickup.group.visible = true; parcelPickup.mark.visible = true;
    showToast("U01 acceptée : prends le module au garage, puis pose-le au panneau de la grille verte.");
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
  const secLabel = { Indisponible: "—", Disponible: "Disponible chez Mina", Accepté: "Module à prendre au garage", "Colis pris": "Poser le module au panneau de la grille verte", Terminé: "Terminée — lampes de la grille allumées" }[save.secondary];
  el.journalBody.innerHTML = `
    <h4>Chapitre I — Puce fantôme</h4>
    <p>État : <strong>${missionLabel}</strong></p>
    <ul>
      <li>Decision : voler la puce de révocation au dépôt des Voies.</li>
      <li>Effet immédiat : intervention des vigiles au dépôt.</li>
      <li>Conséquence future : Mina ouvre la grille de service (passage ↔ rue des Ateliers).</li>
    </ul>
    <h4>M02 — Date d'effet</h4><p>${save.m02}${save.dalleAccess ? " · Accès campagne à La Dalle débloqué (jonction J01, suite de campagne)" : ""}</p>
    <h4>Campagne — La Dalle / Le Nœud</h4>
    <p>M03 : ${save.m03} · U02 : ${save.u02} · U03 : ${save.u03}${save.u03Choice ? ` (dossier : ${save.u03Choice === "detruit" ? "détruit" : "remis à Lise"})` : ""}</p>
    <p>M04 : ${save.m04} · M05 : ${save.m05} · M06 : ${save.m06} · U05 : ${save.u05}</p>
    <p>Filière (décision 1) : ${save.filiere || "—"} · Fin (décision 2) : ${save.fin ? `Fin ${save.fin}` : "—"} · Contrats terminés : ${save.contractCount}</p>
    <h4>U01 — Une porte de plus</h4><p>${secLabel}</p>
    <h4>U04 — Papier carbone</h4><p>${save.u04}</p>
    <h4>Contacts</h4>
    <ul><li><strong>Mina</strong> (garage, ◆ cyan) — mécanicienne des Forges, relais de campagne. « Sous les voies. La grille verte, côté ateliers. »</li>
    <li><strong>Sorel</strong> (Café Signal, ◆ bleu) — agente du registre Civis. Distingue ce qu'elle sait de ce qu'elle peut prouver.</li>
    <li><strong>Panneau de la grille verte</strong> (◆ vert) — éclairage du raccourci, au sud du passage.</li>
    <li>Le coursier garde un ancien badge Civis qui ouvre encore certains portillons (Mina le sait).</li></ul>
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
    el.objText.textContent = "Mina t'attend sous les voies, à la sortie ouest du passage (◆ cyan), à pied, après 5 s sans détection confirmée. Fuite : pont en voiture ou escalier + tunnel à pied.";
  } else if (save.m02 === "Acceptée") {
    el.objTitle.textContent = "M02 — Date d'effet : le calendrier papier";
    el.objText.textContent = "Annexe des archives Civis (ouest, ARCHIVES CIVIS) : porte sud ou grille Intrusion. Puis Sorel au Café Signal.";
  } else if (save.m02 === "Calendrier pris") {
    el.objTitle.textContent = "M02 — Remets le calendrier à Sorel";
    el.objText.textContent = "Sorel devant le Café Signal (◆ bleu, couloir nord).";
  } else if (save.u04 === "Acceptée") {
    el.objTitle.textContent = "U04 — Papier carbone : les documents";
    el.objText.textContent = "Documents dans la cour du dépôt (● ambre, côté quai au sud), à rendre à Mina.";
  } else if (save.u04 === "Documents pris") {
    el.objTitle.textContent = "U04 — Rends les documents à Mina";
    el.objText.textContent = "Mina au garage (◆ cyan).";
  } else if (save.m02 === "Disponible") {
    el.objTitle.textContent = "M02 — Date d'effet (disponible)";
    el.objText.textContent = "Mina ou Sorel (Café Signal) peuvent te briefer : la purge a été avancée.";
  } else if (save.m03 === "Acceptée") {
    el.objTitle.textContent = "M03 — La première porte : le journal";
    el.objText.textContent = "Immeuble Portique à La Dalle (nord-ouest par J01) : porte sud ou entretien ouest (leurre).";
  } else if (save.m03 === "Journal pris") {
    el.objTitle.textContent = "M03 — Rapportez le journal à Nadia";
    el.objText.textContent = "Permanence de La Dalle (◆ vert).";
  } else if (save.m04 === "Acceptée") {
    el.objTitle.textContent = "M04 — Le registre des effacés";
    el.objText.textContent = "Registre d'audit au relais Civis de La Dalle, puis choix : Nadia ou Sorel.";
  } else if (save.m04 === "Registre pris") {
    el.objTitle.textContent = "M04 — Choisis ta filière";
    el.objText.textContent = "Copie à Nadia (galerie S02) ou à Sorel aux Forges (badge d'annexe). Deux décisions séparées avec la fin.";
  } else if (save.m05 === "Acceptée") {
    el.objTitle.textContent = "M05 — Dernière montée : le poste";
    el.objText.textContent = `Le Nœud par ${save.filiere === "sorel" ? "l'annexe badge (est)" : "la galerie S02 (ouest)"}. Console du poste de commande (E).`;
  } else if (save.m06 === "Acceptée") {
    el.objTitle.textContent = "M06 — Droit d'accès : décider";
    el.objText.textContent = "Salle de contrôle du Nœud : décide du sort du registre (Fin A ou B).";
  } else if (save.u02 === "Acceptée" || save.u02 === "Relevés pris" || save.u02 === "Escorte") {
    el.objTitle.textContent = "U02 — L'étage des absents";
    el.objText.textContent = save.u02 === "Acceptée" ? "Relevés dans l'immeuble Portique." : "Escorte la résidente jusqu'à la permanence de Nadia.";
  } else if (save.u03 === "Acceptée" || save.u03 === "Dossier pris") {
    el.objTitle.textContent = "U03 — Les noms de la nuit";
    el.objText.textContent = save.u03 === "Acceptée" ? "Dossier à l'arrière-boutique (sud de La Dalle)." : "Retourne voir Lise : détruire ou remettre le dossier.";
  } else if (save.u05 === "Acceptée") {
    el.objTitle.textContent = "U05 — Le dernier portillon";
    el.objText.textContent = "Boîtier à la clôture est du Nœud (E).";
  } else if (save.contractActive) {
    el.objTitle.textContent = `Contrat ${save.contractActive.toUpperCase()} en cours`;
    el.objText.textContent = { c01: "Colis du garage → marché des Quais.", c02: "Matériel en cour du dépôt → Mina.", c03: "Borne du passage (ouest) → quitter la zone.", c04: "Habitant de l'avenue → garage de Mina." }[save.contractActive];
  } else if (save.m03 === "Disponible" || save.m04 === "Disponible" || save.m05 === "Disponible" || save.m06 === "Disponible") {
    el.objTitle.textContent = "Campagne : mission disponible";
    el.objText.textContent = "Nadia (La Dalle), Sorel/Mina (Les Forges) ou le poste du Nœud selon l'étape. Voir le journal (J).";
  } else if (save.secondary === "Disponible") {
    el.objTitle.textContent = "U01 — Une porte de plus (disponible)";
    el.objText.textContent = "Retourne voir Mina au garage : un module pour éclairer la grille de service.";
  } else if (save.secondary === "Accepté") {
    el.objTitle.textContent = "U01 — Prends le module";
    el.objText.textContent = "Module au garage, juste à côté de Mina (● ambre).";
  } else if (save.secondary === "Colis pris") {
    el.objTitle.textContent = "U01 — Pose le module au panneau";
    el.objText.textContent = "Panneau de la grille verte (◆ vert), par le passage sous les voies ou par la rue du sud.";
  } else {
    el.objTitle.textContent = "Ville libre — Les Forges";
    el.objText.textContent = "Contrat terminé. Le raccourci de service reste ouvert. Explore, ou parle à Mina.";
  }
  parcelPickup.mark.visible = save.secondary === "Accepté" || save.contractActive === "c01";
  panelMark.visible = save.secondary === "Colis pris";
  nadiaMark.visible = ["Disponible", "Acceptée", "Journal pris"].includes(save.m03) || save.m04 === "Registre pris" || save.m04 === "Disponible" || save.u02 !== "Indisponible" && save.u02 !== "Terminée";
  liseMark.visible = save.u03 === "Disponible" || save.u03 === "Acceptée" || save.u03 === "Dossier pris";
  journalPickup.mark.visible = save.m03 === "Acceptée";
  relevesPickup.mark.visible = save.u02 === "Acceptée";
  dossierPickup.mark.visible = save.u03 === "Acceptée";
  registrePickup.mark.visible = save.m04 === "Acceptée";
}

// ---------- Reprise / abandon ----------
function resetWorldForRetry(): void {
  moveMina(save.mission === "Puce récupérée");
  player.hp = player.maxHp; player.dead = false; player.fallT = 0;
  player.pos = { x: GARAGE.x, z: GARAGE.z + 2 };
  player.group.visible = true; actorSync(player);
  inCar = false;
  car.pos = { ...CAR_START }; car.speed = 0; car.angle = Math.PI / 2;
  carDamage = 0; applyCarDamageVisual(); // véhicule réinitialisé à la reprise (bible 05)
  chipStolenOnce = false;
  hasCalendar = false; hasDocs = false; hasParcel = false;
  calendarPickup.group.visible = save.m02 === "Acceptée"; calendarPickup.mark.visible = save.m02 === "Acceptée";
  docsPickup.group.visible = save.u04 === "Acceptée"; docsPickup.mark.visible = save.u04 === "Acceptée";
  parcelPickup.group.visible = save.secondary === "Accepté"; parcelPickup.mark.visible = save.secondary === "Accepté";
  if (save.secondary === "Colis pris") save.secondary = "Accepté";
  if (save.m02 === "Calendrier pris") save.m02 = "Acceptée";
  if (save.u04 === "Documents pris") save.u04 = "Acceptée";
  // Districts : reprise au briefing, contrats annulés (le colis revient au départ)
  hasJournal = false; hasReleves = false; hasDossier = false; hasRegistre = false;
  journalPickup.group.visible = save.m03 === "Acceptée"; journalPickup.mark.visible = save.m03 === "Acceptée";
  if (save.m03 === "Journal pris") save.m03 = "Acceptée";
  relevesPickup.group.visible = save.u02 === "Acceptée" || save.u02 === "Escorte";
  if (save.u02 === "Escorte" || save.u02 === "Relevés pris") save.u02 = "Acceptée";
  residente.group.visible = false; dossierPickup.group.visible = save.u03 === "Acceptée";
  if (save.u03 === "Dossier pris") save.u03 = "Acceptée";
  registrePickup.group.visible = save.m04 === "Acceptée";
  if (save.m04 === "Registre pris") save.m04 = "Acceptée";
  escort = null; save.contractActive = ""; hasContractItem = false; borneActivated = false;
  habitant.group.visible = false;
  if (depotGate.open) setGate(depotGate, false);
  if (archivesGate.open) setGate(archivesGate, false);
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
  if (save.m02 === "Acceptée" || save.m02 === "Calendrier pris") save.m02 = "Disponible";
  if (save.u04 === "Acceptée" || save.u04 === "Documents pris") save.u04 = "Disponible";
  calendarPickup.group.visible = false; calendarPickup.mark.visible = false;
  docsPickup.group.visible = false; docsPickup.mark.visible = false;
  hasParcel = false; hasCalendar = false; hasDocs = false;
  if (save.secondary === "Accepté" || save.secondary === "Colis pris") save.secondary = "Disponible";
  parcelPickup.group.visible = false; parcelPickup.mark.visible = false; panelMark.visible = false;
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
  // Après la décision finale, les vigiles du plateau repassent en patrouille simple (ville d'après-campagne)
  const stoodDown = save.fin !== "" && g.home.z < -100;
  const sees = !failed && !stoodDown && guardSeesPlayer(g);
  if (stoodDown && (g.state === "chase" || g.state === "search" || g.state === "investigate")) g.state = "return";
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
      damageCar(Math.abs(car.speed)); // dégâts visibles gradués, conservés jusqu'à la reprise
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
    carGroup.position.set(car.pos.x, groundY(car.pos.x, car.pos.z), car.pos.z);
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
    if (c.fleeT <= 0 && (c.mode !== "walk" || civils.indexOf(c) >= phaseWalkers)) {
      // Lieu occupé : présence sur place, légers mouvements, regard qui suit son interlocuteur
      c.group.position.y = Math.abs(Math.sin(gameTime * 1.7 + c.homeAngle * 3)) * 0.05;
      c.angle = c.homeAngle + Math.sin(gameTime * 0.6 + c.homeAngle * 5) * 0.35;
      actorSync(c);
      continue;
    }
    if (c.fleeT > 0) {
      c.fleeT -= dt;
      const away = { x: c.pos.x + (c.pos.x - player.pos.x), z: c.pos.z + (c.pos.z - player.pos.z) };
      moveGuardLike(c, away, 6.5, dt);
    } else if (c.waitT > 0) {
      c.waitT -= dt;
    } else {
      if (moveGuardLike(c, c.target, 2.1, dt)) {
        c.target = (c.pos.z < -50 || c.pos.z > 44)
          ? districtSpots[Math.floor(Math.random() * districtSpots.length)]
          : randomSpot();
        c.waitT = 1 + Math.random() * 3;
      }
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
  el.credits.textContent = `${save.credits} ¤ · ${phaseName}`;
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
  updatePhase();
  if (!started && !paused) {
    // Monde vivant derrière le menu : patrouilles, civils et drone tournent déjà.
    accumulator += dt;
    while (accumulator >= STEP) {
      accumulator -= STEP;
      gameTime += STEP;
      for (const g of guards) updateGuard(g, STEP);
      updateCivils(STEP);
      updateTraffic(STEP);
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
      updateEscortAndContracts(STEP);
      for (const g of guards) updateGuard(g, STEP);
      updateCivils(STEP);
      updateTraffic(STEP);
      updateSurveillance(STEP);
      if (lure.t > 0) { lure.t -= STEP; if (lure.t <= 0) lureMesh.visible = false; }
      updateBlood(STEP);
      if (tracerT > 0) { tracerT -= STEP; if (tracerT <= 0 && tracer) { scene.remove(tracer); tracer.geometry.dispose(); tracer = null; } }
      // Marqueurs animés
      chipPickup.group.rotation.y = gameTime * 1.2;
      parcelPickup.group.rotation.y = gameTime * 1.2;
      calendarPickup.group.rotation.y = gameTime * 1.2;
      docsPickup.group.rotation.y = gameTime * 1.2;
      minaMark.position.y = 3.4 + Math.sin(gameTime * 2.2) * 0.18;
      panelMark.position.y = 3.2 + Math.sin(gameTime * 2.2) * 0.18;
      carMark.visible = !inCar;
    }
  }
  actorSync(mina); actorSync(sorel); actorSync(nadia); actorSync(lise);
  if (residente.group.visible && !escort) actorSync(residente);
  if (habitant.group.visible && !escort) actorSync(habitant);
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
  if (save.mission === "Puce récupérée") moveMina(true);
  if (save.mission === "Terminée" && save.m02 === "Indisponible") save.m02 = "Disponible";
  if (save.m02 === "Terminée" && save.u04 === "Indisponible") save.u04 = "Disponible";
  if (save.secondary === "Accepté") { parcelPickup.group.visible = true; }
  if (save.secondary === "Colis pris") { hasParcel = true; parcelPickup.group.visible = false; panelMark.visible = true; }
  if (save.m02 === "Acceptée") { calendarPickup.group.visible = true; sorelMark.visible = true; }
  if (save.m02 === "Calendrier pris") { hasCalendar = true; calendarPickup.group.visible = false; sorelMark.visible = true; }
  if (save.u04 === "Acceptée") { docsPickup.group.visible = true; }
  if (save.u04 === "Documents pris") { hasDocs = true; docsPickup.group.visible = false; }
  if (save.u04 === "Terminée") mapSign.visible = true;
  sorelMark.visible = save.m02 === "Disponible" || save.m02 === "Acceptée" || save.m02 === "Calendrier pris";
  // Districts : pickups, portes de filière, portillon, fin
  if (save.m02 === "Terminée" && save.m03 === "Indisponible") save.m03 = "Disponible";
  journalPickup.group.visible = save.m03 === "Acceptée";
  if (save.m03 === "Journal pris") { hasJournal = true; journalPickup.group.visible = false; }
  relevesPickup.group.visible = save.u02 === "Acceptée";
  if (save.u02 === "Escorte") {
    hasReleves = true; residente.group.visible = true; residente.pos = { x: 25, z: -79 }; actorSync(residente);
    escort = { actor: residente, dest: { ...NADIA_POS }, kind: "u02" };
  }
  dossierPickup.group.visible = save.u03 === "Acceptée";
  if (save.u03 === "Dossier pris") { hasDossier = true; dossierPickup.group.visible = false; }
  registrePickup.group.visible = save.m04 === "Acceptée";
  if (save.m04 === "Registre pris") { hasRegistre = true; registrePickup.group.visible = false; }
  if (save.filiere === "nadia" || save.m05 === "Terminée" || save.m06 !== "Indisponible") setGate(galerieGate, true);
  if (save.filiere === "sorel" || save.m05 === "Terminée" || save.m06 !== "Indisponible") setGate(annexeGate, true);
  if (save.u05 === "Terminée") setGate(portillonGate, true);
  if (save.contractActive === "c01") parcelPickup.group.visible = !hasContractItem;
  if (save.contractActive === "c02") docsPickup.group.visible = true;
  if (save.contractActive === "c04") { habitant.group.visible = true; habitant.pos = { x: 20, z: 11 }; actorSync(habitant); }
  applyFinEffects();
  applyGateLamps();
  refreshObjective(); refreshJournal();
  actorSync(player); actorSync(mina); actorSync(sorel);
  carGroup.position.set(car.pos.x, groundY(car.pos.x, car.pos.z), car.pos.z); carGroup.rotation.y = car.angle;
  for (const g of guards) actorSync(g);
  for (const c of civils) actorSync(c);
}
el.btnPlay.addEventListener("click", () => {
  started = true;
  el.menu.classList.add("hidden");
  el.hud.classList.remove("hidden");
  applyLoadedState();
  if (save.mission === "Terminée") showToast("Sauvegarde retrouvée : la grille de service est ouverte et U01 reste disponible chez Mina.");
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
  parcelPickup.group.visible = false; parcelPickup.mark.visible = false; panelMark.visible = false;
  applyGateLamps();
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



