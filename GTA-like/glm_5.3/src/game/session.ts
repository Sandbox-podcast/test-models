/**
 * Session de jeu — orchestrateur (plan archi. « Rendu / Simulation / Niveau »).
 * Boucle à pas fixe 60 Hz + interpolation, caméra orthographique anticipante,
 * volumes d'effacement, interactions E, mission, sauvegarde, pause sur perte
 * de focus, train de fond, qualité adaptative.
 */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Input } from '../engine/input';
import { AudioSys } from '../engine/audio';
import type { Ctx } from './ctx';
import { buildLevel, type LevelData, type BuiltGrate } from './level';
import { Player, Car } from './actors';
import { Guard, Civilian, Npc, SurveillanceCam } from './ai';
import { AlertSystem } from './vision';
import { FxSystem } from './combat';
import { Implants } from './implants';
import { Mission, DIALOGUES, REWARD_MAIN, REWARD_SECONDARY } from './mission';
import { loadSave, writeSave, clearSave, type SaveData } from './save';
import { buildTraffic, makeTrafficCar, type TrafficCar, type TrafficPathDef } from './traffic';
import { buildDistricts, type DistrictsData } from './districts';
import { QuestEngine, QUESTS, QUEST_BY_ID, registerProp, type QuestDef, type QuestId, type QuestHost } from './quests';
import { Hud } from '../ui/hud';
import {
  DT, PLAYER, IMPLANTS, DELIVERY_CALM, G_STATIC, G_CAR, G_PLAYER, clamp, lerp, dist, bodyPos, bodyRot, bodyVel,
} from './defs';

/** Plages horaires simplifiées (bible 07) : un cycle complet dure ~4 minutes. */
export type DayPhase = 'matin' | 'journee' | 'soiree';
const PHASE_LEN = 80;

export class Game implements Ctx {
  // Ctx
  declare world: RAPIER.World;
  declare scene: THREE.Scene;
  camera!: THREE.OrthographicCamera;
  declare input: Input;
  declare audio: AudioSys;
  declare player: Player;
  declare car: Car;
  guards: Guard[] = [];
  civilians: Civilian[] = [];
  cams: SurveillanceCam[] = [];
  traffic: TrafficCar[] = [];
  declare alert: AlertSystem;
  declare fx: FxSystem;
  declare mission: Mission;
  declare level: LevelData;
  grates: BuiltGrate[] = [];
  time = 0;
  cinematic = false;

  // rendu
  private renderer!: THREE.WebGLRenderer;
  private composer!: EffectComposer;
  private bloomPass!: UnrealBloomPass;
  private bloomOn = true;
  private moon!: THREE.DirectionalLight;
  private alarmLight!: THREE.PointLight;
  private followLight!: THREE.PointLight;
  private beacon!: THREE.Group;
  private beaconColumn!: THREE.Mesh;

  // état
  private hud = new Hud();
  money = 120;
  private paused = false;
  private started = false;
  private acc = 0;
  private lastT = 0;
  private raycaster = new THREE.Raycaster();
  private focus = new THREE.Vector3();
  private zoomHalf = 26;
  private autosaveT = 0;
  private zoneT = 0;
  private trainT = 20;
  private trainActive = false;
  private train!: THREE.Group;
  private mina!: Npc;
  private ysec!: Npc;
  private nadia!: Npc;
  private lise!: Npc;
  private sorel!: Npc;
  private districts!: DistrictsData;
  // campagne bible 02/03
  quests = new QuestEngine();
  private questNpcs = new Map<string, Npc>();
  private agent!: { mesh: THREE.Group; idx: number; t: number; paused: number; departed: boolean };
  private escorts = new Map<string, { npc: Npc; target: { x: number; z: number }; r: number; done?: boolean }>();
  private propMeshes = new Map<string, THREE.Mesh>();
  private propsTaken = new Set<string>();
  private pendingEvents = new Set<string>();
  private relaisCycle = 0;
  private chipMesh!: THREE.Mesh;
  private crateMesh!: THREE.Mesh;
  private pickups: { mesh: THREE.Mesh; kind: 'med' | 'ammo'; taken: boolean; x: number; z: number }[] = [];
  private interaction: { label: string | null; fn: (() => void) | null } = { label: null, fn: null };
  private witnessDispatched = false;
  private frameMs = 16;
  private slowT = 0;
  private wasmErrs = 0;
  // cycle jour (bible 07) + dégâts visibles (bible 05)
  private dayT = 0;
  private phase: DayPhase = 'journee';
  private hemi!: THREE.HemisphereLight;
  private preStepVel = new THREE.Vector3();
  private galleryLights: THREE.PointLight[] = [];
  private civTick = 0;

  // ------------------------------------------------------------------ init

  constructor(canvas: HTMLCanvasElement) {
    this.setupRenderer(canvas);
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = DT;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x070a12, 0.0022);
    this.input = new Input();
    this.input.attach(canvas);
    this.audio = new AudioSys();
    this.alert = new AlertSystem();
    this.mission = new Mission();

    const built = buildLevel(this.world);
    this.level = built.data;
    this.grates = built.grates;
    this.train = built.train;
    this.scene.add(this.level.root);

    // quartiers supplémentaires (bible 06/08) : Dalle, Nœud, Quais, Belvédères + jonctions
    this.districts = buildDistricts(this.world);
    this.scene.add(this.districts.root);
    this.level.fades.push(...this.districts.fades);
    this.grates.push(...this.districts.grates);

    this.setupLights();
    this.setupComposer();

    // entités
    this.player = new Player();
    this.player.init(this, this.level.spawn.x, this.level.spawn.z);
    this.car = new Car();
    this.car.init(this, this.level.carSpawn.x, this.level.carSpawn.z, this.level.carSpawn.yaw);
    for (const p of this.level.patrols) {
      const g = new Guard(p.name, p.points);
      g.init(this);
      this.guards.push(g);
    }
    for (const c of this.level.cameras) this.cams.push(new SurveillanceCam(c, this));
    // population à flux (bible 07) : 12 passants, routes réparties par plage horaire
    const civRoutes: { x: number; z: number }[][] = [
      [{ x: 60, z: 142 }, { x: 94, z: 152 }, { x: 100, z: 150 }, { x: 100, z: 120 }, { x: 60, z: 142 }],
      [{ x: 190, z: 21.5 }, { x: 150, z: 21.5 }, { x: 80, z: 21.5 }, { x: 150, z: 21.5 }],
      [{ x: 90, z: 142 }, { x: 143, z: 126.6 }, { x: 120, z: 142 }],
      [{ x: 120, z: 142 }, { x: 150, z: 58 }, { x: 165, z: 52 }, { x: 140, z: 50 }, { x: 120, z: 142 }],
      [{ x: 100, z: 120 }, { x: 100, z: 150 }, { x: 150, z: 144 }, { x: 100, z: 150 }],
      [{ x: 120, z: 142 }, { x: 150, z: 144 }, { x: 160, z: 144 }, { x: 120, z: 142 }],
      [{ x: 140, z: 50 }, { x: 150, z: 58 }, { x: 165, z: 52 }, { x: 140, z: 50 }],
      [{ x: 70, z: 142 }, { x: 120, z: 142 }, { x: 180, z: 142 }, { x: 120, z: 142 }],
    ];
    for (let i = 0; i < 12; i++) {
      const r = civRoutes[i % civRoutes.length];
      this.civilians.push(new Civilian(r, this));
    }
    // passants des autres quartiers (bible 07) — gelés hors de portée du joueur
    for (const r of this.districts.pedRoutes) this.civilians.push(new Civilian(r.points, this));
    this.traffic = buildTraffic(this);
    // circuit inter-quartiers (sens unique) : les deux véhicules tournent dans le même sens
    if (this.districts.trafficLoop.length > 1) {
      const loop: TrafficPathDef = { name: 'boucle-quartiers', speed: 10.5, nodes: this.districts.trafficLoop, loop: true };
      this.traffic.push(makeTrafficCar(loop, this, 0x274a44, 4));
      this.traffic.push(makeTrafficCar(loop, this, 0x503a52, 14));
    }
    // personnages de campagne (bible 01) — présents, en attente de leurs missions
    for (const n of this.districts.npcs) {
      const npc = new Npc(n.x, n.z, this, n.color, n.y);
      if (n.id === 'nadia') this.nadia = npc;
      else if (n.id === 'lise') this.lise = npc;
      else this.sorel = npc;
    }
    // sécurité du Nœud (ambiance institutionnelle, bible 06)
    for (const p of this.districts.guards) {
      const g = new Guard(p.name, p.points);
      g.init(this);
      this.guards.push(g);
    }
    // patrouilles Civis de La Dalle (M03 et suivantes) + caméra du couloir de contrôle
    for (const p of this.districts.dallePatrols) {
      const g = new Guard(p.name, p.points);
      g.init(this);
      this.guards.push(g);
    }
    for (const c of [...this.districts.cams, ...this.districts.extraCams]) this.cams.push(new SurveillanceCam(c, this));
    this.mina = new Npc(this.level.minaHome.x, this.level.minaHome.z, this, 0x2e5a50);
    this.ysec = new Npc(this.level.ysec.x, this.level.ysec.z, this, 0x6b2438);
    // PNJ de campagne (bible 01/02) : gardien, résidente, Varenne, habitant C04
    for (const n of this.districts.questNpcs) {
      const npc = new Npc(n.x, n.z, this, n.color, n.y);
      this.questNpcs.set(n.id, npc);
    }
    // agent des archives (M02) : marcheur cinématique sur la route du dépôt au départ
    {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.78, 6, 10), new THREE.MeshStandardMaterial({ color: 0x3c4a63, roughness: 0.7 }));
      body.position.y = 0.78;
      g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshStandardMaterial({ color: 0x9aa7b5 }));
      head.position.y = 1.45;
      g.add(head);
      const caseBox = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.16), new THREE.MeshStandardMaterial({ color: 0x1d2a35 }));
      caseBox.position.set(0, 1.05, 0.28);
      g.add(caseBox);
      const r0 = this.level.agentRoute[0];
      g.position.set(r0.x, (r0.y ?? 0) + 1, r0.z);
      this.scene.add(g);
      this.agent = { mesh: g, idx: 0, t: 0, paused: 0, departed: false };
    }
    // props de campagne : petits octaèdres lumineux (prises / équipements)
    for (const p of [...this.level.questProps, ...this.districts.questProps]) {
      const isUse = p.id.startsWith('console') || p.id.startsWith('terminal') || p.id.startsWith('boitier') || p.id.startsWith('borne');
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(isUse ? 0.3 : 0.22),
        new THREE.MeshStandardMaterial({ color: 0x05070a, emissive: isUse ? 0xd6dce1 : 0xffc370, emissiveIntensity: 2.6 }),
      );
      mesh.position.set(p.x, (p.y ?? 0) + (isUse ? 1.9 : 1.5), p.z);
      this.scene.add(mesh);
      this.propMeshes.set(p.id, mesh);
      registerProp(p.id, p.x, p.z);
    }

    this.fx = new FxSystem(this);
    this.implants = new Implants(this);

    this.setupProps();
    this.setupUiEvents(canvas);
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('blur', () => { if (this.started && !this.paused) this.pause(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.started && !this.paused) this.pause();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.started) return;
      if (e.code === 'KeyB') {
        this.bloomOn = !this.bloomOn;
        this.toast(this.bloomOn ? 'Néons : activés' : 'Néons : réduits', 'info');
      }
      if (e.code === 'KeyM') this.toast(this.audio.toggleMute() ? 'Son coupé' : 'Son activé', 'info');
      if (e.code === 'Escape' && !this.hud.modalVisible) this.paused ? this.resume() : this.pause();
    });
    this.hud.pressHandler = (a) => {
      if (a === 'journal') this.hud.journalClose();
    };
  }

  implants!: Implants;

  private setupRenderer(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    const half = 26;
    this.camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 260);
    this.camera.position.set(0, 95, 23);
    this.camera.lookAt(0, 0, 0);
  }

  private setupLights() {
    this.hemi = new THREE.HemisphereLight(0x3d5273, 0x1a2029, 1.6);
    this.scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0xc4d6f2, 2.1);
    this.moon.position.set(60, 80, 40);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(2048, 2048);
    const sc = this.moon.shadow.camera as THREE.OrthographicCamera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 260;
    this.moon.shadow.bias = -0.0006;
    this.scene.add(this.moon);
    this.scene.add(this.moon.target);
    const pt = (x: number, y: number, z: number, color: number, i: number, d: number) => {
      const l = new THREE.PointLight(color, i, d, 1.0);
      l.position.set(x, y, z);
      this.scene.add(l);
      return l;
    };
    pt(86, 3.4, 156, 0x7fdfff, 26, 22);      // garage
    pt(154, 3.2, 153, 0xff5c9e, 26, 22);     // bar
    pt(151, 2.0, 66, 0x9fdcff, 16, 14);      // passage
    pt(151, 2.0, 78, 0x9fdcff, 16, 14);
    pt(151, 3.4, 50, 0x7dffb2, 26, 20);      // van
    pt(152, 4.4, 126, 0xffc27d, 30, 26);     // portail dépôt
    pt(150, 3.2, 86, 0xbcd7ff, 22, 18);      // quai
    this.alarmLight = new THREE.PointLight(0xff3344, 0, 40, 1.6);
    this.alarmLight.position.set(154, 5.4, 106);
    this.scene.add(this.alarmLight);
    // éclairage d'accompagnement (lisibilité du quartier autour du joueur)
    this.followLight = new THREE.PointLight(0x9db8dc, 42, 48, 1.0);
    this.followLight.position.set(0, 13, 0);
    this.scene.add(this.followLight);
    // balise d'objectif
    this.beacon = new THREE.Group();
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.9 }),
    );
    gem.position.y = 2.4;
    this.beacon.add(gem);
    this.beaconColumn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 30, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.beaconColumn.position.y = 15;
    this.beacon.add(this.beaconColumn);
    this.scene.add(this.beacon);
  }

  private setupComposer() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { samples: 2 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.5, 0.55, 0.72);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
  }

  private setupProps() {
    // puce
    this.chipMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22),
      new THREE.MeshStandardMaterial({ color: 0x081018, emissive: 0x00f0ff, emissiveIntensity: 3 }),
    );
    this.chipMesh.position.set(this.level.pedestal.x, 1.65, this.level.pedestal.z);
    this.scene.add(this.chipMesh);
    // module d'éclairage U01 (posé sur l'établi du garage)
    this.crateMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.35, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x2a3a32, emissive: 0x82d9af, emissiveIntensity: 1.4, roughness: 0.7 }),
    );
    this.crateMesh.position.set(this.level.module.x, 1.35, this.level.module.z);
    this.crateMesh.visible = false;
    this.scene.add(this.crateMesh);
    // ramassages
    for (const m of this.level.medkits) this.makePickup(m.x, m.z, 'med');
    for (const a of this.level.ammo) this.makePickup(a.x, a.z, 'ammo');
    // voitures garées : corps dynamiques endormis — un choc les déplace (bible 05)
    for (const p of this.level.parkedCars) {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: [0x30363e, 0x3e3030, 0x2e3a34, 0x36303e][Math.floor(Math.random() * 4)], metalness: 0.5, roughness: 0.5 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 4), mat);
      body.position.y = 0.5;
      body.castShadow = true;
      g.add(body);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.45, 1.9), new THREE.MeshStandardMaterial({ color: 0x0c1116 }));
      cab.position.set(0, 0.95, 0.1);
      g.add(cab);
      this.scene.add(g);
      const yaw = p.yaw + Math.PI / 2; // garées le long de l'avenue
      const rb = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(p.x, 0.62, p.z)
          .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
          .setLinearDamping(1.2)
          .setAngularDamping(2.5),
      );
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.95, 0.5, 2.1)
          .setCollisionGroups(G_CAR)
          .setFriction(0.5),
        rb,
      );
      rb.setAdditionalMass(1000, true);
      this.parked.push({ mesh: g, body: rb });
    }
  }
  private parked: { mesh: THREE.Group; body: RAPIER.RigidBody }[] = [];

  private makePickup(x: number, z: number, kind: 'med' | 'ammo') {
    let mesh: THREE.Mesh;
    if (kind === 'med') {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.3, 0.42),
        new THREE.MeshStandardMaterial({ color: 0xd8e6ee, emissive: 0x52ff9a, emissiveIntensity: 0.9 }),
      );
    } else {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, 0.26, 0.34),
        new THREE.MeshStandardMaterial({ color: 0x2c2c20, emissive: 0xffb347, emissiveIntensity: 0.9 }),
      );
    }
    mesh.position.set(x, 0.55, z);
    this.scene.add(mesh);
    this.pickups.push({ mesh, kind, taken: false, x, z });
  }

  private setupUiEvents(canvas: HTMLCanvasElement) {
    void canvas;
    document.getElementById('btn-resume')?.addEventListener('click', () => this.resume());
    document.getElementById('btn-abandon')?.addEventListener('click', () => {
      this.resume();
      this.abandonMission();
    });
  }

  // ------------------------------------------------------------------ démarrage

  begin(save: SaveData | null) {
    this.started = true;
    (window as unknown as { __game: Game }).__game = this; // poignée de debug/tests
    this.audio.start();
    this.hud.hideMenu();
    this.hud.showHud();
    if (save) {
      this.money = save.money;
      this.mission.restore(save);
      if (save.consequences) this.mission.consequences = save.consequences;
      if (save.grilleService) this.openGrate('grille-service', true);
      if (this.mission.state === 'terminee') this.reduceGuards();
      if (this.mission.state === 'acceptee' || this.mission.state === 'puce') {
        // reprise au point de reprise (briefing)
        this.mission.state = 'acceptee';
        this.mina.teleport(this.level.minaVan.x, this.level.minaVan.z, Math.PI / 2);
        this.toast('Reprise du contrat au point de reprise (briefing)', 'info');
      } else {
        const px = save.px || this.level.spawn.x;
        const pz = save.pz || this.level.spawn.z;
        this.player.pos.set(px, 1, pz);
        this.player.prev.copy(this.player.pos);
        this.player.body.setTranslation({ x: px, y: 1, z: pz }, true);
        this.car.teleport(this, save.carX || this.level.carSpawn.x, save.carZ || this.level.carSpawn.z, save.carYaw ?? 0);
      }
      if (this.mission.secondary === 'terminee') {
        this.mission.setCarried(false);
        this.applyGalleryLit(false);
      }
      if (this.mission.secondary === 'acceptee') this.crateMesh.visible = !this.mission.secondaryCarried(this);
      // campagne bible 02/03 : états de quêtes, portes, props, filière, fin
      if (save.quests) {
        for (const [id, r] of Object.entries(save.quests)) {
          const run = this.quests.run(id as never);
          run.taken = r.taken; run.stage = r.stage; run.done = r.done; run.choice = r.choice;
        }
      }
      this.quests.filiere = save.filiere ?? null;
      this.quests.fin = save.fin ?? null;
      for (const id of save.doorsOpen ?? []) this.openGrate(id, true);
      for (const id of save.propsTaken ?? []) {
        this.propsTaken.add(id);
        const m = this.propMeshes.get(id);
        if (m) m.visible = false;
      }
      if (this.quests.run('u04').done) this.level.mapDecal.visible = true;
      if (this.quests.run('m05').done) {
        this.hudPurge(this.quests.fin === 'A' ? 'REGISTRE PUBLIC' : this.quests.fin === 'B' ? 'PURGE ANNULÉE' : 'PURGE : J-11');
      }
      if (this.quests.fin === 'A') {
        for (const g of this.guards) { g.offDuty = true; g.mesh.visible = false; g.fan.visible = false; }
        for (const c of this.cams) c.disabled = true;
      }
      // reprise des escortes en cours
      for (const q of QUESTS) {
        const r = this.quests.run(q.id);
        if (!r.taken || r.done) continue;
        const st = q.stages[r.stage - 1];
        if (st && st.trigger.k === 'escort') {
          const t = st.trigger as { k: 'escort'; npc: string; to: { x: number; z: number }; r: number };
          const npc = this.questNpcs.get(t.npc);
          if (npc) this.escorts.set(t.npc, { npc, target: t.to, r: t.r });
        }
      }
    } else {
      this.toast('ZQSD/WASD : bouger · Souris : viser · E : interagir', 'info');
      setTimeout(() => this.started && this.toast('J : journal · 1/2 : implants · Maj : sprinter', 'info'), 6000);
    }
    this.focus.set(this.player.pos.x, 0, this.player.pos.z);
    this.applyPhase();
    this.lastT = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ------------------------------------------------------------------ boucle

  private loop(t: number) {
    requestAnimationFrame((tt) => this.loop(tt));
    try {
      const realDt = Math.min(0.1, (t - this.lastT) / 1000);
      this.lastT = t;
      this.frameMs = lerp(this.frameMs, realDt * 1000, 0.05);
      this.adaptQuality(realDt);
      if (!this.paused && this.started) {
        this.acc += realDt;
        let steps = 0;
        while (this.acc >= DT && steps < 5) {
          try {
            this.fixedUpdate(DT);
          } catch (e) {
            // aliasing WASM intermittent (rapier3d-compat) : le tick est sauté,
            // la simulation reprend au suivant plutôt que de tuer la partie
            this.wasmErrs++;
            if (this.wasmErrs === 1) console.warn('tick sauté (wasm) :', e);
          }
          this.acc -= DT;
          steps++;
        }
        if (steps === 5) this.acc = 0;
      }
      this.render(this.paused ? 1 : this.acc / DT, realDt);
    } catch (e) {
      // idem pour le rendu : une image perdue vaut mieux qu'une boucle morte
      this.wasmErrs++;
    }
  }

  private adaptQuality(dt: number) {
    if (this.frameMs > 19.5) this.slowT += dt;
    else this.slowT = Math.max(0, this.slowT - dt * 0.5);
    if (this.slowT > 4) {
      this.slowT = 0;
      if (this.bloomOn) {
        this.bloomOn = false;
        this.toast('Qualité ajustée automatiquement', 'info');
      } else if (this.renderer.getPixelRatio() > 1) {
        this.renderer.setPixelRatio(1);
        this.onResize();
      }
    }
  }

  private fixedUpdate(dt: number) {
    this.time += dt;
    const presses = this.input.consumePresses();
    for (const p of presses) {
      if (p === 'pause') { this.paused ? this.resume() : this.pause(); }
      if (p === 'journal') {
        if (this.hud.journalVisible) this.hud.journalClose();
        else if (!this.hud.dialogueActive() && !this.hud.modalVisible) {
          const sections = this.quests.journal(this.mission.state, this.mission.secondary);
          sections.push({
            title: 'CONTACTS',
            entries: [
              { title: 'Mina — mécanicienne, garage des Forges', body: 'Protège les habitants qui utilisent son garage comme relais.', status: 'CONNUE', kind: 'done' },
              { title: 'Nadia Keita — coordinatrice de La Dalle', body: 'Garde les accès vitaux ouverts pendant la purge ; tient la permanence du palier sud.', status: this.quests.run('m03').taken ? 'CONNUE' : 'INCONNUE', kind: this.quests.run('m03').taken ? 'done' : 'locked' },
              { title: 'Sorel — agente du registre', body: 'Veut bloquer la purge sans exposer les dossiers privés ; signe des validations sous pression.', status: this.quests.run('m02').done ? 'CONNUE' : 'INCONNUE', kind: this.quests.run('m02').done ? 'done' : 'locked' },
              { title: 'Lise Marec — permanence de nuit', body: 'Récupère les dossiers utilisés pour faire chanter des adultes du quartier.', status: this.quests.run('m03').taken ? 'CONNUE' : 'INCONNUE', kind: this.quests.run('m03').taken ? 'done' : 'locked' },
              { title: 'Élias Varenne — directeur des accès, Civis', body: 'A avancé la date des révocations pour priver les habitants de recours.', status: this.quests.run('m05').done ? 'CROISÉ' : 'INCONNU', kind: this.quests.run('m05').done ? 'warn' : 'locked' },
              { title: 'Ysec — revendeuse, bar Le Signal', body: 'Fournit filtrages et prolongateurs aux effacés de La Dalle.', status: 'CONNUE', kind: 'done' },
            ],
          });
          if (this.mission.consequences.length > 0) {
            sections.push({
              title: 'CONSÉQUENCES OBSERVÉES',
              entries: this.mission.consequences.map((c) => ({ title: c, body: '', status: '', kind: 'warn' as const })),
            });
          }
          this.hud.journalOpen(sections);
          this.audio.uiOpen();
        }
      }
    }
    if (this.paused) return;

    // visée
    this.updateAim();

    // touches
    const clicks = this.input.consumeLeftClicks();
    const rclicks = this.input.consumeRightClicks();
    // interaction : pendant un dialogue, E avance ; sinon exécute l'action visée
    if (presses.includes('interact')) {
      if (this.hud.dialogueActive()) this.hud.advanceDialogue();
      else if (!this.cinematic && this.interaction.fn) this.interaction.fn();
    }
    if (!this.cinematic && !this.hud.dialogueActive()) {
      if (presses.includes('reload')) this.player.startReload();
      if (presses.includes('implant1') || rclicks > 0) this.implants.castIntrusion(this);
      if (presses.includes('implant2')) this.implants.castLeurre(this);
      // tir
      if (!this.player.inCar && clicks > 0 && this.player.fireT <= 0 && !this.player.dead) {
        if (this.player.ammo > 0 && this.player.reloadT <= 0) this.fireWeapon();
        else if (this.player.ammo <= 0) { this.audio.implantDeny(); this.player.startReload(); }
      }
    }

    // interactions possibles
    this.computeInteraction();

    // entités
    this.player.step(dt, this);
    this.car.update(dt, this);
    for (const g of this.guards) if (!g.dead && !g.offDuty) g.step(dt, this);
    // directeur de population (bible 07) : seuls les passants proches du joueur
    // simulent ; les autres sont figés et hors champ
    this.civTick = (this.civTick + 1) % 3;
    for (let i = 0; i < this.civilians.length; i++) {
      const c = this.civilians[i];
      if (c.dead) continue;
      const d = dist(c.pos.x, c.pos.z, this.player.pos.x, this.player.pos.z);
      if (d > 130) { c.mesh.visible = false; continue; }
      c.mesh.visible = true;
      if (d > 60 && this.civTick !== 0) continue; // tick réduit au-delà de 60 m
      c.step(d > 60 ? dt * 3 : dt, this);
    }
    for (const c of this.cams) c.update(dt, this);
    for (const t of this.traffic) t.update(dt, this);
    this.mina.step(dt, this);
    this.ysec.step(dt, this);
    this.nadia.step(dt, this);
    this.lise.step(dt, this);
    this.sorel.step(dt, this);
    for (const [id, n] of this.questNpcs) {
      if (!this.escorts.has(id)) n.step(dt, this);
    }

    // cycle jour : matin → journée → soirée (bible 07)
    this.dayT += dt;
    const phaseIdx = Math.floor(this.dayT / PHASE_LEN) % 3;
    const newPhase: DayPhase = phaseIdx === 0 ? 'matin' : phaseIdx === 1 ? 'journee' : 'soiree';
    if (newPhase !== this.phase) {
      this.phase = newPhase;
      this.applyPhase();
    }

    // détection
    const confirmed = this.alert.update(dt, this);
    if (confirmed.length > 0) {
      for (const g of this.guards) if (!g.dead) g.broadcast(this, this.alert.lastKnown);
      this.audio.confirmed();
      this.witnessDispatched = false;
    }

    // témoins civils
    this.updateWitnesses(dt);

    // implants, fx
    this.implants.update(dt, this);
    this.fx.update(dt);
    this.fx.updateThrown(dt);

    // simulation
    const [pvx, pvy, pvz] = bodyVel(this.car.body);
    this.preStepVel.set(pvx, pvy, pvz);
    this.world.step();
    this.player.postStep();
    this.car.postStep();
    for (const g of this.guards) g.postStep();
    for (const c of this.civilians) c.postStep();
    for (const t of this.traffic) t.postStep();
    this.mina.postStep();
    this.ysec.postStep();
    this.nadia.postStep();
    this.lise.postStep();
    this.sorel.postStep();
    for (const [id, n] of this.questNpcs) {
      if (!this.escorts.has(id)) n.postStep();
      else { n.prev.copy(n.pos); }
    }
    this.updateQuests(dt);
    this.detectCarImpacts(dt);

    // collisions voiture ↔ personnages (renversement)
    this.checkVehicleHits();

    // ramassages au sol
    for (const p of this.pickups) {
      if (p.taken) continue;
      p.mesh.rotation.y += dt * 1.4;
      p.mesh.position.y = 0.55 + Math.sin(this.time * 2.2 + p.x) * 0.08;
      if (dist(this.player.pos.x, this.player.pos.z, p.x, p.z) < 1.25 && !this.player.inCar) {
        if (p.kind === 'med') {
          if (this.player.hp >= PLAYER.HP) continue;
          this.player.hp = Math.min(PLAYER.HP, this.player.hp + 50);
          this.toast('Trousse appliquée (+50)', 'info');
        } else {
          this.player.reserve = Math.min(PLAYER.RESERVE_MAX, this.player.reserve + 24);
          this.toast('Munitions (+24)', 'info');
        }
        p.taken = true;
        p.mesh.visible = false;
        this.audio.pickup();
      }
    }

    // puce (animation)
    if (!this.player.hasChip) {
      this.chipMesh.rotation.y += dt * 2;
      this.chipMesh.position.y = 1.65 + Math.sin(this.time * 2.4) * 0.08;
    }
    if (this.mission.secondary === 'acceptee' && this.mission.secondaryCarried(this)) {
      this.crateMesh.visible = false;
    }

    // mort du joueur
    if (this.player.hp <= 0 && !this.player.dead) this.onPlayerDeath();

    // train
    this.updateTrain(dt);

    // sauvegarde d'exploration
    this.autosaveT += dt;
    if (this.autosaveT > 12) {
      this.autosaveT = 0;
      if (this.mission.state === 'disponible' || this.mission.state === 'terminee') this.saveNow();
    }

    // volumes d'effacement
    this.updateFades();
    // alarme visuelle
    const lvl = this.alert.level(this);
    this.alarmLight.intensity = this.alert.missionAlarm && lvl !== 'calme'
      ? 14 + Math.sin(this.time * 9) * 10 : 0;
  }

  // ------------------------------------------------------------------ visée / tir

  private updateAim() {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.0);
    this.raycaster.setFromCamera(new THREE.Vector2(this.input.mouse.ndcX, this.input.mouse.ndcY), this.camera);
    const hit = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    if (hit) {
      this.player.aim.copy(hit);
      this.player.aimYaw = Math.atan2(hit.x - this.player.pos.x, -(hit.z - this.player.pos.z));
    }
  }

  private fireWeapon() {
    this.player.fireT = PLAYER.FIRE_INTERVAL;
    this.player.ammo--;
    this.player.muzzleFlash();
    this.audio.gunshot();
    this.fx.shake = Math.min(1, this.fx.shake + 0.18);
    const from = new THREE.Vector3(
      this.player.pos.x + Math.sin(this.player.yaw) * 0.55,
      1.25,
      this.player.pos.z - Math.cos(this.player.yaw) * 0.55,
    );
    const dir = new THREE.Vector3(this.player.aim.x - from.x, 0, this.player.aim.z - from.z).normalize();
    const res = this.fx.fire(from, dir, 'player');
    this.fx.applyPlayerShot(res, this);
    if ((res.hitGuard && res.hitGuard.dead) || (res.hitCiv && res.hitCiv.dead)) this.markWitnesses(res.endPoint);
  }

  private markWitnesses(pos: THREE.Vector3) {
    for (const c of this.civilians) {
      if (c.dead || c.sawCrime) continue;
      if (c.pos.distanceTo(pos) < 20 && this.alert.hasLOS(this.world, new THREE.Vector3(c.pos.x, 1.55, c.pos.z), pos)) {
        c.sawCrime = true;
        c.witnessT = 3.5;
        c.panic(this.player.pos);
      }
    }
  }

  private updateWitnesses(dt: number) {
    let anyReport = false;
    for (const c of this.civilians) {
      if (c.sawCrime && !c.dead) {
        c.witnessT -= dt;
        if (c.witnessT <= 0) { c.sawCrime = false; anyReport = true; }
      }
    }
    if (anyReport && !this.witnessDispatched) {
      this.witnessDispatched = true;
      const alive = this.guards.filter((g) => !g.dead && !g.offDuty);
      for (const g of alive.slice(0, 2)) g.broadcast(this, this.player.pos.clone());
      this.toast('Un témoin a signalé ta position', 'warn');
    }
  }

  private checkVehicleHits() {
    const speed = Math.abs(this.car.speed);
    if (speed < 2 || !this.car.driven) return;
    const f = this.car.forward();
    for (const g of [...this.guards, ...this.civilians]) {
      if (g.dead || (g as Guard).offDuty === true) continue;
      const d = dist(this.car.pos.x, this.car.pos.z, g.pos.x, g.pos.z);
      if (d < 2.3) this.fx.vehicleHit(g, this, speed, f);
    }
  }

  // ------------------------------------------------------------------ interactions

  private computeInteraction() {
    let label: string | null = null;
    let fn: (() => void) | null = null;
    const p = this.player.pos;
    const near = (x: number, z: number, r: number) => dist(p.x, p.z, x, z) < r;

    if (this.hud.dialogueActive() || this.hud.modalVisible || this.cinematic) {
      this.interaction = { label: null, fn: null };
      if (this.hud.dialogueActive() && !this.cinematic) this.hud.prompt('<b>E</b> — Continuer');
      else this.hud.prompt(null);
      return;
    }

    // remise de la puce (prioritaire)
    if (this.mission.state === 'puce') {
      const d = dist(p.x, p.z, this.level.van.x, this.level.van.z);
      if (d < 6) {
        if (this.player.inCar) this.hud.prompt('Descends du véhicule pour remettre la puce');
        else if (this.alert.calmTime(this) < DELIVERY_CALM) {
          this.interaction = { label: null, fn: null };
          this.hud.prompt(null);
        } else {
          label = '<b>E</b> — Remettre la puce à Mina';
          fn = () => this.deliverChip();
        }
        this.hud.delivery(true, clamp(this.alert.calmTime(this) / DELIVERY_CALM, 0, 1),
          this.player.inCar ? 'SORTIR DU VÉHICULE' : this.alert.calmTime(this) < DELIVERY_CALM
            ? `DÉTECTION CONFIRMÉE — ${Math.max(0, DELIVERY_CALM - this.alert.calmTime(this)).toFixed(1)} s`
            : 'REMISE POSSIBLE');
        this.interaction = { label, fn };
        this.hud.prompt(label);
        return;
      }
      this.hud.delivery(false, 0, '');
    } else {
      this.hud.delivery(false, 0, '');
    }

    // voiture
    if (this.player.inCar) {
      const fast = Math.abs(this.car.speed) > 2.0;
      label = fast ? 'Ralentis pour descendre' : '<b>E</b> — Descendre';
      fn = fast ? null : () => this.exitCar();
    } else if (near(this.car.pos.x, this.car.pos.z, 3.5)) {
      label = '<b>E</b> — Monter';
      fn = () => this.enterCar();
    }

    // campagne (bible 02/03) : étapes actives, donneurs, panneau de contrats — prioritaire
    const qi = this.questInteraction(p);

    // Mina (garage avant le contrat / après ; U01 après M01)
    const sec = this.mission.secondary;
    if (this.mission.state === 'disponible' && near(this.level.minaHome.x, this.level.minaHome.z, 4.6)) {
      label = '<b>E</b> — Parler à Mina';
      fn = () => this.startBriefing();
    } else if (this.mission.state === 'terminee' && sec === 'disponible' && !qi && near(this.level.minaHome.x, this.level.minaHome.z, 4.6)) {
      label = '<b>E</b> — Parler à Mina';
      fn = () => {
        this.cinematic = true;
        this.hud.startDialogue('Mina', DIALOGUES.u01Start.lines, [
          { label: 'Prendre le module', primary: true, cb: () => { this.cinematic = false; this.acceptSecondary(); } },
          { label: 'Plus tard', cb: () => { this.cinematic = false; } },
        ]);
      };
    } else if (this.mission.state === 'terminee' && !qi && near(this.level.minaHome.x, this.level.minaHome.z, 4.6)) {
      label = '<b>E</b> — Parler à Mina';
      fn = () => this.hud.startDialogue('Mina', sec === 'terminee' ? DIALOGUES.u01Done.lines : DIALOGUES.minaIdle.lines);
    }

    // Ysec (contact d'ambiance au Signal)
    if (!qi && near(this.level.ysec.x, this.level.ysec.z, 4.2) && !this.hud.dialogueActive()) {
      label = '<b>E</b> — Parler à Ysec';
      fn = () => this.hud.startDialogue('Ysec', DIALOGUES.ysecStart.lines);
    }
    if (qi) {
      label = qi.label;
      fn = qi.fn;
    } else {
      // personnages de campagne des autres quartiers (bible 01 — en attente de leurs missions)
      const dist3 = (o: { pos: THREE.Vector3 }) => dist(p.x, p.z, o.pos.x, o.pos.z);
      if (dist3(this.nadia) < 4.4 && !this.hud.dialogueActive()) {
        label = '<b>E</b> — Parler à Nadia Keita';
        fn = () => this.hud.startDialogue('Nadia Keita', DIALOGUES.nadiaIdle.lines);
      } else if (dist3(this.lise) < 4.4 && !this.hud.dialogueActive()) {
        label = '<b>E</b> — Parler à Lise Marec';
        fn = () => this.hud.startDialogue('Lise Marec', DIALOGUES.liseIdle.lines);
      } else if (dist3(this.sorel) < 4.4 && !this.hud.dialogueActive()) {
        label = '<b>E</b> — Parler à Sorel';
        fn = () => this.hud.startDialogue('Sorel', DIALOGUES.sorelIdle.lines);
      }
    }

    // puce
    if (this.mission.state === 'acceptee' && !this.player.hasChip && near(this.level.pedestal.x, this.level.pedestal.z, 2.8)) {
      label = '<b>E</b> — Prendre la puce';
      fn = () => this.takeChip();
    }

    // U01 : module sur l'établi, puis panneau de la grille de service
    if (sec === 'acceptee' && !this.mission.secondaryCarried(this) && near(this.level.module.x, this.level.module.z, 2.4)) {
      label = '<b>E</b> — Prendre le module d’éclairage';
      fn = () => {
        this.mission.setCarried(true);
        this.crateMesh.visible = false;
        this.audio.pickup();
        this.toast('Module récupéré — panneau de la grille, sous les voies', 'info');
      };
    } else if (sec === 'acceptee' && this.mission.secondaryCarried(this) && near(this.level.panel.x, this.level.panel.z, 3.0)) {
      label = '<b>E</b> — Brancher le module';
      fn = () => this.deliverSecondary();
    }

    this.interaction = { label, fn };
    this.hud.prompt(label);
  }

  // ------------------------------------------------------------------ mission

  private startBriefing() {
    this.cinematic = true;
    this.audio.uiOpen();
    this.hud.startDialogue(DIALOGUES.briefing.speaker, DIALOGUES.briefing.lines, [
      {
        label: 'Prendre le contrat', primary: true, cb: () => {
          this.mission.onAccepted(this);
          this.cinematic = false;
          this.saveCheckpoint();
          this.mina.teleport(this.level.minaVan.x, this.level.minaVan.z, Math.PI / 2);
          this.toast('Implants équipés : Intrusion (1) · Leurre (2)', 'info');
        },
      },
      { label: 'Plus tard', cb: () => { this.cinematic = false; } },
    ]);
  }

  /** Point de reprise : snapshot léger — la restauration reconstruit une situation connue. */
  private saveCheckpoint() {
    this.saveNow();
  }

  private takeChip() {
    this.player.hasChip = true;
    this.chipMesh.visible = false;
    this.mission.onChipTaken(this);
    this.hud.journalClose();
  }

  private deliverChip() {
    if (this.mission.state !== 'puce') return;
    this.cinematic = true;
    this.player.hasChip = false;
    this.audio.deliverSuccess();
    this.alert.missionAlarm = false;
    this.mission.onDelivered(this);
    // récompense créditée une seule fois
    const save = loadSave();
    if (!save?.recompensePrincipale) {
      this.money += REWARD_MAIN;
      this.toast(`Contrat rempli : Puce fantôme (+${REWARD_MAIN}¤)`, 'reward');
    } else {
      this.toast('Contrat : Puce fantôme — terminé', 'info');
    }
    this.openGrate('grille-service');
    this.reduceGuards();
    this.saveNow();
    this.mina.teleport(this.level.minaHome.x, this.level.minaHome.z, -Math.PI / 2);
    this.hud.startDialogue(DIALOGUES.postMission.speaker, DIALOGUES.postMission.lines, [], () => {
      this.cinematic = false;
      this.toast('Raccourci ouvert : grille de service sous les voies', 'info');
    });
  }

  private acceptSecondary() {
    this.cinematic = false;
    this.mission.onSecondaryTaken(this);
    this.crateMesh.visible = true;
    this.crateMesh.position.set(this.level.module.x, 1.35, this.level.module.z);
    this.saveNow();
  }

  private deliverSecondary() {
    this.cinematic = true;
    this.mission.setCarried(false);
    const save = loadSave();
    if (!save?.recompenseSecondaire) {
      this.money += REWARD_SECONDARY;
      this.toast(`Quête remplie : Une porte de plus (+${REWARD_SECONDARY}¤)`, 'reward');
    }
    this.mission.onSecondaryDone(this);
    this.applyGalleryLit(true);
    this.saveNow();
    this.hud.startDialogue('Mina — radio', DIALOGUES.u01Done.lines, [], () => {
      this.cinematic = false;
    });
  }

  /** U01 terminée : la galerie de service s'éclaire durablement (bible U01). */
  private applyGalleryLit(withFx: boolean) {
    this.level.galleryLampMat.emissiveIntensity = 2.6;
    (this.level.panelLed.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.4;
    if (this.galleryLights.length === 0) {
      for (const [lx, lz] of [[112, 81], [135, 81]] as [number, number][]) {
        const l = new THREE.PointLight(0xcfffe8, 20, 18, 1.0);
        l.position.set(lx, 1.9, lz);
        this.scene.add(l);
        this.galleryLights.push(l);
      }
    }
    if (withFx) {
      this.audio.grateOpen();
      this.toast('La galerie de service est éclairée', 'info');
    }
  }

  /** Sécurité réduite après la mission : seuls le quai et l'entrepôt restent gardés. */
  private reduceGuards() {
    for (const g of this.guards) {
      if (g.name === 'hall' || g.name === 'ruelle') {
        g.offDuty = true;
        g.mesh.visible = false;
        g.fan.visible = false;
      }
    }
  }

  openGrate(id: string, silent = false) {
    const g = this.grates.find((x) => x.def.id === id);
    if (!g || g.open) return;
    g.open = true;
    this.pendingEvents.add('door:' + id); // déclencheurs de quête « porte ouverte »
    // le collider reste vivant mais neutre (les suppressions libres cassent les requêtes KCC du WASM)
    try { g.collider.setCollisionGroups(0); } catch { /* déjà retiré */ }
    if (!silent) this.audio.grateOpen();
  }

  private onPlayerDeath() {
    this.player.kill(this, this.player.pos, 'bullet');
    this.cinematic = true;
    this.audio.missionFail();
    this.audio.engine(0, false);
    const inMission = this.mission.state === 'acceptee' || this.mission.state === 'puce';
    setTimeout(() => {
      this.hud.modal(
        'CONTRAT INTERROMPU',
        inMission
          ? 'Les vigiles t’ont eu. Le point de reprise te ramène à la fin du briefing : puce sur son pupitre, voiture au garage, vigiles en patrouille.'
          : 'On t’est tombé dessus. Tu reprends au garage, le quartier garde l’état de tes décisions.',
        inMission
          ? [
            { label: 'Reprendre au briefing', primary: true, cb: () => this.restoreCheckpoint() },
            { label: 'Abandonner le contrat', danger: true, cb: () => { this.cinematic = false; this.abandonMission(); } },
          ]
          : [{ label: 'Reprendre au garage', primary: true, cb: () => this.respawnGarage() }],
      );
    }, 900);
  }

  private restoreCheckpoint() {
    this.mission.state = 'acceptee';
    this.mission.setCarried(false);
    this.crateMesh.visible = false;
    this.respawnCommon();
    this.mina.teleport(this.level.minaVan.x, this.level.minaVan.z, Math.PI / 2);
    this.saveNow();
    this.toast('Point de reprise chargé : briefing', 'info');
  }

  private abandonMission() {
    this.mission.state = 'disponible';
    this.player.hasChip = false;
    this.chipMesh.visible = true;
    this.respawnCommon();
    this.mina.teleport(this.level.minaHome.x, this.level.minaHome.z, -Math.PI / 2);
    this.saveNow();
    this.toast('Contrat abandonné — Mina t’attend au garage', 'warn');
  }

  private respawnGarage() {
    this.respawnCommon();
    this.saveNow();
  }

  private respawnCommon() {
    this.cinematic = false;
    this.hud.hideModal();
    this.alert.reset();
    this.missionAlarmOff();
    // joueur
    this.player.dead = false;
    this.player.hp = PLAYER.HP;
    this.player.ammo = PLAYER.MAG;
    this.player.reserve = Math.max(this.player.reserve, 24);
    this.player.hasChip = false;
    this.player.inCar = false;
    this.player.mesh.visible = true;
    this.player.stun = 0;
    this.player.reloadT = 0;
    this.player.pos.set(this.level.spawn.x, 1, this.level.spawn.z);
    this.player.prev.copy(this.player.pos);
    this.player.body.setTranslation({ x: this.level.spawn.x, y: 1, z: this.level.spawn.z }, true);
    // voiture
    this.car.driven = false;
    this.car.resetDamage();
    this.car.teleport(this, this.level.carSpawn.x, this.level.carSpawn.z, this.level.carSpawn.yaw);
    // voitures garées : retour à leur place (bible 05 : dégâts conservés jusqu'à la reprise)
    this.level.parkedCars.forEach((p, i) => {
      const pb = this.parked[i];
      if (!pb) return;
      const yaw = p.yaw + Math.PI / 2;
      pb.body.setTranslation({ x: p.x, y: 0.62, z: p.z }, true);
      pb.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
      pb.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      pb.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    });
    // puce
    this.chipMesh.visible = true;
    // vigiles & caméras
    for (const g of this.guards) {
      if (g.offDuty) continue;
      g.revive(this);
      g.mesh.visible = true;
      g.fan.visible = true;
    }
    for (const c of this.cams) { c.suspicion = 0; c.disabled = false; }
    for (const c of this.civilians) {
      if (c.dead) { c.dead = false; c.hp = 60; c.mesh.rotation.z = 0; c.mesh.position.y = 0; c.teleportCiv(); }
      c.sawCrime = false;
    }
    this.focus.set(this.player.pos.x, 0, this.player.pos.z);
  }

  private missionAlarmOff() { this.alert.missionAlarm = false; }

  // ------------------------------------------------------------------ campagne (bible 02/03)

  private questHost: QuestHost = {
    npcPos: (id) => {
      if (id === 'mina') return { x: (this.mission.state === 'acceptee' || this.mission.state === 'puce') ? this.level.minaVan.x : this.level.minaHome.x, z: (this.mission.state === 'acceptee' || this.mission.state === 'puce') ? this.level.minaVan.z : this.level.minaHome.z };
      if (id === 'ysec') return { x: this.level.ysec.x, z: this.level.ysec.z };
      if (id === 'nadia') return { x: this.districts.npcs[0].x, z: this.districts.npcs[0].z };
      if (id === 'lise') return { x: this.districts.npcs[1].x, z: this.districts.npcs[1].z };
      if (id === 'sorel') return { x: this.districts.npcs[2].x, z: this.districts.npcs[2].z };
      const n = this.questNpcs.get(id);
      return n ? { x: n.pos.x, z: n.pos.z } : null;
    },
    doorOpen: (id) => this.grates.find((g) => g.def.id === id)?.open ?? false,
    propTaken: (id) => this.propsTaken.has(id),
    questEvent: (name) => {
      if (this.pendingEvents.has(name)) { this.pendingEvents.delete(name); return true; }
      return false;
    },
    escortDone: (npc) => this.escorts.get(npc)?.done ?? false,
    playerDist: (x, z) => dist(this.player.pos.x, this.player.pos.z, x, z),
    playerY: () => this.player.pos.y,
  };

  /** Met à jour l'agent des archives, les escortes, la porte de relève et les quêtes actives. */
  private updateQuests(dt: number) {
    // agent des archives : suit sa route ; arrivé au départ, il ouvre la porte et disparaît un temps
    if (this.agent.paused > 0) {
      this.agent.paused -= dt;
      if (this.agent.paused <= 0) {
        this.agent.idx = 0;
        this.agent.departed = false;
        this.agent.mesh.visible = true;
        const r0 = this.level.agentRoute[0];
        this.agent.mesh.position.set(r0.x, (r0.y ?? 0) + 1, r0.z);
      }
    } else {
      const route = this.level.agentRoute;
      const tgt = route[this.agent.idx + 1];
      if (tgt) {
        const dx = tgt.x - this.agent.mesh.position.x;
        const dz = tgt.z - this.agent.mesh.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.5) {
          this.agent.idx++;
          // suit les hauteurs du tracé
          this.agent.mesh.position.y = (tgt.y ?? 0) + 1;
          if (this.agent.idx >= route.length - 1) {
            this.agent.departed = true;
            this.agent.paused = 90;
            this.agent.mesh.visible = false;
            this.pendingEvents.add('agent-depart');
            this.openGrate('porte-archives', true);
            this.toast('L’agent est parti — la porte des archives est restée ouverte', 'info');
          }
        } else {
          this.agent.mesh.position.x += (dx / d) * 1.7 * dt;
          this.agent.mesh.position.z += (dz / d) * 1.7 * dt;
          this.agent.mesh.rotation.y = Math.atan2(dx, -dz);
        }
      }
    }
    // porte de relève du relais Civis (M04) : cycle ouvert 20 s / fermé 55 s
    this.relaisCycle = (this.relaisCycle + dt) % 75;
    const relais = this.grates.find((g) => g.def.id === 'porte-relais');
    if (relais && !relais.open && !this.propsTaken.has('registre')) {
      const wantOpen = this.relaisCycle < 20;
      if (wantOpen !== relais.open) {
        if (wantOpen) this.openGrate('porte-relais', true);
        else relais.open = false;
      }
    }
    // escortes : suivent le joueur, attendent s’il s’éloigne, validées à destination
    for (const [id, e] of this.escorts) {
      if (e.done) continue;
      const npc = e.npc;
      const dp = dist(npc.pos.x, npc.pos.z, this.player.pos.x, this.player.pos.z);
      if (dp > 25) continue; // attend
      if (dp > 3.2) {
        const dx = this.player.pos.x - npc.pos.x;
        const dz = this.player.pos.z - npc.pos.z;
        const d = Math.hypot(dx, dz);
        npc.pos.x += (dx / d) * Math.min(4.4, d) * dt;
        npc.pos.z += (dz / d) * Math.min(4.4, d) * dt;
        npc.yaw = Math.atan2(dx, -dz);
      }
      if (dist(npc.pos.x, npc.pos.z, e.target.x, e.target.z) < e.r && dp < e.r + 4) {
        e.done = true;
        this.toast('Personne accompagnée : arrivée à destination', 'info');
      }
    }
    // C03 : quitte la zone de la borne
    const c03 = this.quests.run('c03');
    if (c03.taken && !c03.done && c03.stage === 2) {
      const borne = this.propMeshes.get('borne-relais');
      if (borne && dist(this.player.pos.x, this.player.pos.z, borne.position.x, borne.position.z) > 25) {
        this.pendingEvents.add('zone-left-borne');
      }
    }
    // avancement des quêtes actives (talk/deliver/choice/use passent par la touche E)
    const m01Done = this.mission.state === 'terminee';
    for (const q of QUESTS) {
      const r = this.quests.run(q.id);
      if (!r.taken || r.done) continue;
      const kind = q.stages[r.stage - 1].trigger.k;
      if (kind === 'talk' || kind === 'deliver' || kind === 'choice' || kind === 'use') continue;
      const res = this.quests.checkStage(q, this.questHost);
      if (res.advanced) this.advanceQuest(q);
    }
    void m01Done;
    // oscille les props disponibles
    for (const [id, m] of this.propMeshes) {
      if (this.propsTaken.has(id)) continue;
      m.rotation.y += dt * 1.5;
      m.position.y += Math.sin(this.time * 2.4 + m.position.x) * 0.0012;
    }
  }

  /** Effets d'entrée d'étape (portes, escorte, toast). */
  private questStageEnter(q: QuestDef, stage: number) {
    if (q.id === 'm03' && stage === 1) this.openGrate('porte-portique');
    if (q.id === 'm05' && stage === 1) this.openGrate('porte-poste');
    if (q.id === 'm06' && stage === 1) this.openGrate('porte-controle');
    const st = q.stages[stage - 1];
    if (st && st.trigger.k === 'escort') {
      const t = st.trigger as { k: 'escort'; npc: string; to: { x: number; z: number }; r: number };
      const npc = this.questNpcs.get(t.npc);
      if (npc) this.escorts.set(t.npc, { npc, target: t.to, r: t.r });
    }
    if (st) this.toast(st.text, 'info');
  }

  /** Effets de fin de quête. */
  private questFinish(q: QuestDef) {
    this.money += q.reward;
    this.toast(`${q.title.split('—')[0].trim()} accompli${q.kind === 'main' ? 'e' : ''} (+${q.reward}¤)`, 'reward');
    if (q.consequence) this.mission.consequences.push(q.consequence);
    if (q.id === 'u04') this.level.mapDecal.visible = true;
    if (q.id === 'u05') this.openGrate('portillon-nuit'); // la sortie de nuit devient praticable
    if (q.id === 'm05') {
      this.hudPurge('PURGE : J-11');
      // M06 démarre aussitôt (fiche bible : « Le joueur retrouve les deux décisions finales sur place »)
      this.acceptQuest(QUEST_BY_ID.m06);
      this.cinematic = false;
      this.hud.modal('LE DROIT D’ACCÈS', 'Le poste de commande répond. Onze jours avant la mise à jour. La salle de contrôle est plus loin — couloir surveillé, coursive étroite. Ce qu’on fera du registre s’y décide.',
        [{ label: 'Y aller', primary: true, cb: () => { this.cinematic = false; } }]);
      this.cinematic = true;
    }
    const end = q.endLines;
    if (end && end.lines.length > 0) {
      this.cinematic = true;
      this.hud.startDialogue(end.speaker, end.lines, [], () => { this.cinematic = false; });
    }
    this.saveNow();
  }

  private advanceQuest(q: QuestDef) {
    const r = this.quests.run(q.id);
    const finished = this.quests.advance(q, this).finished;
    this.audio.pickup();
    if (finished) { this.questFinish(q); return; }
    this.questStageEnter(q, r.stage);
    this.saveNow();
  }

  /** Interaction de campagne sous le réticule (E), ou null. */
  private questInteraction(p: { x: number; z: number }): { label: string; fn: () => void } | null {
    const near = (x: number, z: number, r = 4.6) => dist(p.x, p.z, x, z) < r;
    const giverPos = (id: string) => this.questHost.npcPos(id);
    // 1) étape active d'une quête en cours
    for (const q of QUESTS) {
      const r = this.quests.run(q.id);
      if (!r.taken || r.done) continue;
      const st = q.stages[r.stage - 1];
      const t = st.trigger;
      if (t.k === 'talk' || t.k === 'deliver') {
        const gp = giverPos(t.npc);
        if (gp && near(gp.x, gp.z)) {
          const isDeliver = t.k === 'deliver';
          return {
            label: `<b>E</b> — ${isDeliver ? 'Remettre' : 'Parler à'} ${npcLabel(t.npc)}`,
            fn: () => {
              this.cinematic = true;
              this.hud.startDialogue(npcLabel(t.npc), [st.sub], [], () => {
                this.cinematic = false;
                this.advanceQuest(q);
              });
            },
          };
        }
      } else if (t.k === 'pickup') {
        if (!this.propsTaken.has(t.prop)) {
          const m = this.propMeshes.get(t.prop);
          if (m && near(m.position.x, m.position.z, 3.4)) {
            return {
              label: `<b>E</b> — Prendre ${propLabel(t.prop)}`,
              fn: () => {
                this.propsTaken.add(t.prop);
                m.visible = false;
                this.audio.pickup();
                this.toast(`${propLabel(t.prop)} — en main`, 'info');
                this.advanceQuest(q);
              },
            };
          }
        }
      } else if (q.id === 'u03' && r.stage === 1) {
        // consentement du gardien : il ouvre la porte de l’arrière-boutique
        const gd = this.questNpcs.get('gardien');
        if (gd && near(gd.pos.x, gd.pos.z, 4.2)) {
          return {
            label: '<b>E</b> — Parler au gardien',
            fn: () => {
              this.cinematic = true;
              this.hud.startDialogue('Le gardien', ['Lise vous envoie ? Alors prenez le dossier, il ne sert à rien ici. Je laisse la porte ouverte — mais les noms, eux, restent à elle.'], [], () => {
                this.cinematic = false;
                this.openGrate('porte-boutique');
              });
            },
          };
        }
      } else if (t.k === 'use') {
        const m = this.propMeshes.get(t.prop);
        if (m && near(m.position.x, m.position.z, 4.0)) {
          return {
            label: `<b>E</b> — ${propLabel(t.prop)}`,
            fn: () => this.advanceQuest(q),
          };
        }
      } else if (t.k === 'choice') {
        if (q.id === 'm04') {
          for (const who of ['nadia', 'sorel'] as const) {
            const gp = giverPos(who);
            if (gp && near(gp.x, gp.z)) {
              return {
                label: `<b>E</b> — Confier la copie à ${npcLabel(who)}`,
                fn: () => {
                  this.cinematic = true;
                  this.hud.startDialogue(npcLabel(who), who === 'nadia'
                    ? ['On préparera les accès communautaires. La galerie du coteau sera à toi.']
                    : ['Je monterai la contestation administrative. Mon badge t’ouvrira l’annexe du Nœud.'],
                    [], () => { this.cinematic = false; this.applyFiliere(who); });
                },
              };
            }
          }
        } else if (q.id === 'm06') {
          const m = this.propMeshes.get('terminal-controle');
          if (m && near(m.position.x, m.position.z, 4.2)) {
            return {
              label: '<b>E</b> — Décider du sort du registre',
              fn: () => {
                this.cinematic = true;
                this.hud.modal('DROIT D’ACCÈS', 'Le registre d’audit est là, la purge est armée. Publier les preuves expurgées et transférer des autorisations provisoires — ou annuler les révocations et restaurer les droits ?',
                  [
                    { label: 'Fin A — Registre public', primary: true, cb: () => this.applyEnding('A') },
                    { label: 'Fin B — Révocations annulées', cb: () => this.applyEnding('B') },
                  ]);
              },
            };
          }
        } else if (q.id === 'u03') {
          const gp = giverPos('lise');
          if (gp && near(gp.x, gp.z)) {
            return {
              label: '<b>E</b> — Décider avec Lise',
              fn: () => {
                this.cinematic = true;
                this.hud.startDialogue('Lise Marec',
                  ['Les noms ne doivent plus servir à rien. Qu’en fais-tu ?'],
                  [
                    { label: 'Détruire les dossiers privés', primary: true, cb: () => this.finishU03('détruire') },
                    { label: 'Remettre les preuves', cb: () => this.finishU03('preuves') },
                  ]);
              },
            };
          }
        }
      }
    }
    // 2) quête proposable auprès d'un donneur proche
    for (const npcId of ['mina', 'nadia', 'lise', 'sorel']) {
      const q = this.offerableAt(npcId);
      if (!q) continue;
      const gp = giverPos(npcId);
      if (gp && near(gp.x, gp.z)) {
        return {
          label: `<b>E</b> — ${npcLabel(npcId)} · ${q.title.split('—')[0].trim()}`,
          fn: () => {
            this.cinematic = true;
            this.hud.startDialogue(q.brief.speaker, q.brief.lines, [
              { label: 'Accepter', primary: true, cb: () => this.acceptQuest(q) },
              { label: 'Plus tard', cb: () => { this.cinematic = false; } },
            ]);
          },
        };
      }
    }
    // 3) panneau des contrats communs
    if (near(this.level.board.x, this.level.board.z, 3.4)) {
      const active = QUESTS.find((o) => o.kind === 'common' && this.quests.run(o.id).taken && !this.quests.run(o.id).done);
      if (active) {
        return { label: `Contrat en cours : ${active.title.split('—')[0].trim()}`, fn: () => this.toast(active.stages[this.quests.run(active.id).stage - 1].text, 'info') };
      }
      const next = this.quests.boardCycle.find((id) => !this.quests.run(id).taken) as QuestId | undefined;
      if (next) {
        const q = QUEST_BY_ID[next];
        return {
          label: '<b>E</b> — Panneau des contrats',
          fn: () => {
            this.cinematic = true;
            this.hud.startDialogue(q.brief.speaker, q.brief.lines, [
              { label: 'Accepter l’offre', primary: true, cb: () => this.acceptQuest(q) },
              { label: 'Plus tard', cb: () => { this.cinematic = false; } },
            ]);
          },
        };
      }
      return { label: 'Panneau : plus d’offres pour l’instant', fn: () => this.toast('Toutes les offres ont été honorées.', 'info') };
    }
    return null;
  }

  private acceptQuest(q: QuestDef) {
    this.cinematic = false;
    this.quests.accept(q.id);
    this.audio.uiOpen();
    this.toast(`${q.title} — accepté${q.kind === 'main' ? 'e' : ''}`, 'info');
    this.questStageEnter(q, 1);
    this.saveNow();
  }

  private finishU03(choice: 'détruire' | 'preuves') {
    this.cinematic = false;
    this.quests.run('u03').choice = choice;
    this.quests.advance(QUEST_BY_ID.u03, this);
    this.money += 150;
    this.mission.consequences.push(choice === 'détruire'
      ? 'U03 : les dossiers privés sont détruits — Lise garde dates et signatures.'
      : 'U03 : les preuves sont remises à Lise — les noms ne quittent pas la permanence.');
    this.toast('U03 accompli (+150¤)', 'reward');
    const lines = choice === 'détruire'
      ? ['Brûlés. Les personnes respirent, et moi je garde les preuves qu’il reste : les dates, les signatures.']
      : ['Les preuves complètent mon dossier. Ceux qui ont signé ces pages vont devoir s’expliquer.'];
    this.hud.startDialogue('Lise Marec', lines);
    this.saveNow();
  }

  /** Applique le choix de filière (M04) : porte galerie (Nadia) ou annexe (Sorel). */
  private applyFiliere(f: 'nadia' | 'sorel') {
    this.quests.filiere = f;
    this.quests.run('m04').choice = f;
    this.quests.advance(QUEST_BY_ID.m04, this); // terminée
    this.money += QUEST_BY_ID.m04.reward;
    this.toast('M04 accompli (+300¤)', 'reward');
    this.mission.consequences.push(QUEST_BY_ID.m04.consequence ?? '');
    if (f === 'nadia') {
      this.openGrate('galerie-coteau');
      this.mission.consequences.push('Filière Nadia : la galerie du coteau monte droit au plateau.');
    } else {
      this.openGrate('porte-annexe');
      this.mission.consequences.push('Filière Sorel : badge de service — l’annexe du Nœud est ouverte.');
    }
    const lines = f === 'nadia' ? [
      'Avec cette copie, on prépare les accès communautaires. La galerie du coteau est à toi — elle monte droit au plateau.',
      'Quand tu monteras, préviens-moi. La dernière marche se joue là-haut.',
    ] : [
      'Tu me confies ça à moi. Je signe des validations depuis trois ans — je sais où sont les failles.',
      'Prends ce badge de service. L’annexe du Nœud t’est ouverte, légitimement. C’est une drôle de sensation.',
    ];
    this.cinematic = true;
    this.hud.startDialogue(f === 'nadia' ? 'Nadia Keita' : 'Sorel', lines, [], () => { this.cinematic = false; });
    this.saveNow();
  }

  /** Décision finale (M06) : fins A/B de la bible, ville explorable après le générique. */
  private applyEnding(fin: 'A' | 'B') {
    this.quests.fin = fin;
    const r = this.quests.run('m06');
    r.choice = fin;
    if (!r.done) { this.quests.advance(QUEST_BY_ID.m06, this); this.money += 500; }
    this.mission.consequences.push(fin === 'A'
      ? 'Fin A — Registre public : preuves expurgées publiées, autorisations provisoires aux relais. Les contrôles Civis ferment.'
      : 'Fin B — Révocations annulées : droits restaurés, services rouverts. Civis garde les portiques, sous la cellule de Sorel.');
    this.hudPurge(fin === 'A' ? 'REGISTRE PUBLIC' : 'PURGE ANNULÉE');
    this.audio.deliverSuccess();
    if (fin === 'A') {
      // les contrôles Civis ferment : vigiles et caméras hors service, relais de quartier
      for (const g of this.guards) {
        g.offDuty = true;
        g.mesh.visible = false;
        g.fan.visible = false;
        g.suspicion = 0;
      }
      for (const c of this.cams) c.disabled = true;
      this.alert.reset();
      this.alert.missionAlarm = false;
      this.toast('Les contrôles Civis ferment — des relais s’installent dans les quartiers', 'reward');
    } else {
      this.toast('Révocations annulées — les services rouvrent, Sorel rejoint la cellule de contrôle', 'reward');
    }
    this.cinematic = true;
    this.hud.modal(
      fin === 'A' ? 'FIN A — REGISTRE PUBLIC' : 'FIN B — RÉVOCATIONS ANNULÉES',
      fin === 'A'
        ? 'Les preuves expurgées sont publiées. Des autorisations provisoires passent aux relais de quartier ; les portiques Civis s’éteignent. Certains habitants devront quand même faire corriger leurs accès à la main — la suite leur appartient.'
        : 'La purge est annulée, les droits restaurés, les services rouvrent. Civis conserve ses portiques, désormais contrôlés par une cellule dont Sorel fait partie. Le registre reste sous verrou — pour la continuité de service.',
      [{ label: 'Continuer à explorer la ville', primary: true, cb: () => { this.cinematic = false; } }],
    );
    this.saveNow();
  }

  private hudPurge(text: string | null) {
    const el = document.getElementById('hud-purge');
    if (!el) return;
    if (text) { el.textContent = text; el.classList.remove('hidden'); }
    else el.classList.add('hidden');
  }

  /** Objectif HUD courant : étape de campagne > M01/U01 > donneur proposé > exploration. */
  private currentObjective(): { text: string; sub: string; target: { x: number; z: number } | null } {
    const stageOf = (q: QuestDef) => {
      const r = this.quests.run(q.id);
      const st = q.stages[Math.min(r.stage, q.stages.length) - 1];
      const tg = st.target;
      return { text: st.text, sub: st.sub, target: tg && tg.x !== undefined ? { x: tg.x, z: tg.z } : null };
    };
    if (this.mission.state !== 'terminee') return this.mission.objective(this);
    const main = this.quests.activeMain();
    if (main) return stageOf(main);
    const side = this.quests.activeSide();
    if (side) return stageOf(side);
    if (this.mission.secondary !== 'terminee') return this.mission.objective(this); // U01 en attente
    const off = this.quests.offerable(true, true).find((q) => q.giver !== 'board');
    if (off) {
      const gp = this.questHost.npcPos(off.giver);
      return { text: `${off.title.split('—')[0].trim()} — voir ${npcLabel(off.giver)}`, sub: off.brief.speaker, target: gp ? { x: gp.x, z: gp.z } : null };
    }
    const boardOffer = this.quests.boardCycle.some((id) => !this.quests.run(id).taken);
    if (boardOffer) return { text: 'Contrats communs au panneau du garage', sub: 'Une offre à la fois', target: { x: this.level.board.x, z: this.level.board.z } };
    return this.mission.objective(this);
  }

  /** Quête proposable auprès d'un donneur ? */
  private offerableAt(npcId: string): QuestDef | null {
    if (npcId === 'board') npcId = 'board';
    const m01Done = this.mission.state === 'terminee';
    for (const q of this.quests.offerable(m01Done, this.mission.secondary === 'terminee')) {
      if (q.giver === npcId) return q;
    }
    return null;
  }

  // ------------------------------------------------------------------ dégâts visibles (bible 05)

  /**
   * Détecte les chocs du véhicule : variation brutale de vitesse pendant un pas
   * de simulation → rayure / bosse / choc grave sur la face impactée. Les
   * contacts persistants sont ignorés (verrou par côté).
   */
  private detectCarImpacts(dt: number) {
    if (!this.car.driven || !this.car.canTakeDamage(dt)) return;
    const [vx, , vz] = bodyVel(this.car.body);
    const dvx = this.preStepVel.x - vx;
    const dvz = this.preStepVel.z - vz;
    const mag = Math.hypot(dvx, dvz);
    if (mag < 2.8) return;
    const f = this.car.forward(), r = this.car.right();
    const along = dvx * f.x + dvz * f.z;
    const lat = dvx * r.x + dvz * r.z;
    let side: 'front' | 'rear' | 'left' | 'right';
    if (Math.abs(along) >= Math.abs(lat)) side = along > 0 ? 'front' : 'rear';
    else side = lat > 0 ? 'right' : 'left';
    const severity = mag > 11 ? 3 : mag > 6 ? 2 : 1;
    this.car.addDamage(side, severity);
    this.car.lockDamage();
    if (severity >= 2) this.audio.crashHeavy();
    else this.audio.thud();
    this.fx.shake = Math.min(1.6, this.fx.shake + 0.3 + severity * 0.3);
    // réaction sur l'autre véhicule si le choc touche le trafic (bible 05)
    for (const t of this.traffic) {
      if (dist(this.car.pos.x, this.car.pos.z, t.pos.x, t.pos.z) < 3.4) t.hitStop();
    }
  }

  // ------------------------------------------------------------------ cycle jour (bible 07)

  /** Applique la plage horaire : lumière, brouillard et flux de passants. */
  private applyPhase() {
    let sky = 0x3d5273, ground = 0x1a2029, hemiI = 1.6, moonI = 2.1, exp = 1.35, fogD = 0.0022;
    if (this.phase === 'matin') {
      sky = 0x46608a; ground = 0x232a33; hemiI = 1.85; moonI = 2.3; fogD = 0.0026;
    } else if (this.phase === 'soiree') {
      sky = 0x3a4060; ground = 0x161a20; hemiI = 1.3; moonI = 1.7; exp = 1.28; fogD = 0.0019;
    }
    this.hemi.color.setHex(sky);
    this.hemi.groundColor.setHex(ground);
    this.hemi.intensity = hemiI;
    this.moon.intensity = moonI;
    this.renderer.toneMappingExposure = exp;
    if (this.scene.fog instanceof THREE.FogExp2) this.scene.fog.density = fogD;
    // flux piétons selon la plage : matin côté voies/nord, journée ateliers/dépôt, soirée bar/place
    const pool: { x: number; z: number }[][] =
      this.phase === 'matin'
        ? [[{ x: 190, z: 21.5 }, { x: 150, z: 21.5 }, { x: 80, z: 21.5 }], [{ x: 100, z: 120 }, { x: 100, z: 150 }, { x: 94, z: 152 }], [{ x: 80, z: 21.5 }, { x: 150, z: 21.5 }, { x: 150, z: 58 }]]
        : this.phase === 'journee'
          ? [[{ x: 90, z: 142 }, { x: 143, z: 126.6 }, { x: 120, z: 142 }], [{ x: 120, z: 142 }, { x: 180, z: 142 }, { x: 70, z: 142 }], [{ x: 100, z: 120 }, { x: 100, z: 150 }, { x: 150, z: 144 }]]
          : [[{ x: 120, z: 142 }, { x: 150, z: 144 }, { x: 160, z: 144 }], [{ x: 140, z: 50 }, { x: 150, z: 58 }, { x: 165, z: 52 }], [{ x: 70, z: 142 }, { x: 120, z: 142 }, { x: 160, z: 144 }]];
    for (let i = 0; i < Math.min(12, this.civilians.length); i++) {
      const c = this.civilians[i];
      if (!c.dead) c.assignRoute(pool[i % pool.length]);
    }
  }

  // ------------------------------------------------------------------ voiture

  private enterCar() {
    if (this.player.inCar) return;
    this.player.inCar = true;
    this.car.driven = true;
    this.player.mesh.visible = false;
    this.player.pos.copy(this.car.pos);
    // le corps du joueur reste sur place, inerte, jusqu'à la descente
    try { this.player.collider.setCollisionGroups(0); } catch { /* ignore */ }
    this.audio.uiClick();
    this.car.body.wakeUp();
  }

  private exitCar() {
    if (!this.player.inCar) return;
    const spot = this.car.tryExit(this);
    if (!spot) {
      this.toast('Côté bloqué ou trop rapide — impossible de sortir', 'warn');
      return;
    }
    this.player.inCar = false;
    this.car.driven = false;
    this.player.mesh.visible = true;
    this.player.pos.copy(spot);
    this.player.prev.copy(spot);
    this.player.body.setTranslation({ x: spot.x, y: spot.y, z: spot.z }, true);
    try { this.player.collider.setCollisionGroups(G_PLAYER); } catch { /* ignore */ }
    this.player.yaw = this.car.yaw;
    this.player.prevYaw = this.car.yaw;
    this.audio.uiClick();
  }

  // ------------------------------------------------------------------ train

  private updateTrain(dt: number) {
    if (this.trainActive) {
      this.train.position.x += dt * 26;
      if (this.train.position.x > 300) {
        this.trainActive = false;
        this.trainT = 50 + Math.random() * 50;
        this.train.position.x = -80;
      }
    } else {
      this.trainT -= dt;
      if (this.trainT <= 0) {
        this.trainActive = true;
        this.train.position.x = -80;
        this.audio.trainPass();
        if (Math.abs(this.player.pos.z - 68) < 30) this.audio.trainHorn();
      }
    }
  }

  // ------------------------------------------------------------------ sauvegarde

  saveNow() {
    const runs: SaveData['quests'] = {};
    for (const [id, r] of this.quests.runs) runs[id] = { taken: r.taken, stage: r.stage, done: r.done, choice: r.choice };
    writeSave({
      v: 2,
      money: this.money,
      mission: this.mission.state,
      secondary: this.mission.secondary,
      grilleService: this.grates.find((g) => g.def.id === 'grille-service')?.open ?? false,
      recompensePrincipale: this.mission.state === 'terminee',
      recompenseSecondaire: this.mission.secondary === 'terminee',
      consequences: this.mission.consequences,
      px: this.player.pos.x,
      pz: this.player.pos.z,
      carX: this.car.pos.x,
      carZ: this.car.pos.z,
      carYaw: this.car.yaw,
      quests: runs,
      filiere: this.quests.filiere,
      fin: this.quests.fin,
      propsTaken: [...this.propsTaken],
      doorsOpen: this.grates.filter((g) => g.open).map((g) => g.def.id),
    });
  }

  // ------------------------------------------------------------------ rendu

  private updateFades() {
    const p = this.player.pos;
    for (const f of this.level.fades) {
      const inside = p.x >= f.min.x && p.x <= f.max.x && p.z >= f.min.y && p.z <= f.max.y && p.y < f.maxY;
      f.target = inside ? 0.14 : 1;
    }
  }

  private zoneName(): string {
    const p = this.player.pos;
    const inRect = (x1: number, z1: number, x2: number, z2: number) => p.x >= x1 && p.x <= x2 && p.z >= z1 && p.z <= z2;
    // nouveaux quartiers (bible 06/08)
    if (inRect(252, -150, 430, -20)) return 'LE NŒUD';
    if (inRect(328, -22, 348, 42) && p.y > 10) return 'GALERIE DU COTEAU';
    if (inRect(440, -150, 570, 140)) return 'LES BELVÉDÈRES';
    if (inRect(252, 30, 420, 170)) return 'LA DALLE';
    if (inRect(238, 20, 254, 172)) return 'ROUTE DU COTEAU';
    if (inRect(198, 196, 214, 296)) return 'LES QUAIS';
    if (inRect(4, 196, 214, 296)) return p.z < 254 ? 'LES QUAIS — QUAI HAUT' : 'LES QUAIS — PROMENADE';
    if (inRect(198, 140, 214, 196)) return 'RUE BASSE';
    if (inRect(210, 4, 254, 24)) return 'LIAISON NORD';
    if (inRect(73, 147, 93, 165)) return 'GARAGE DE MINA';
    if (inRect(141, 146, 167, 166)) return 'BAR LE SIGNAL';
    if (inRect(118, 88, 190, 124)) return 'DÉPÔT NOVAK';
    if (inRect(190, 88, 211, 124)) return 'COUR DU DÉPÔT';
    if (inRect(66, 84, 211, 88)) return 'QUAI DE CHARGEMENT';
    if (inRect(96, 77, 156, 86)) return 'GALERIE DE SERVICE';
    if (inRect(146, 60, 156, 86)) return 'PASSAGE INFÉRIEUR';
    if (inRect(130, 40, 175, 62)) return 'PLACE DE LA HALLE';
    if (inRect(20, 8, 38, 130)) return 'PONT DES FORGES';
    if (inRect(36, 126, 212, 142)) return 'AVENUE DES FORGES';
    if (inRect(94, 84, 106, 146)) return 'RUE DES ATELIIERS';
    if (inRect(8, 6, 212, 22)) return 'ROUTE DU NORD';
    return 'LES FORGES';
  }

  private render(alpha: number, realDt: number) {
    // caméra
    this.input.updateNdc(window.innerWidth, window.innerHeight);
    const target = this.player.inCar ? this.car.pos : this.player.pos;
    const vel = this.player.inCar
      ? (() => { const [vx, , vz] = bodyVel(this.car.body); return new THREE.Vector3(vx, 0, vz); })()
      : new THREE.Vector3(target.x - this.player.prev.x, 0, target.z - this.player.prev.z).multiplyScalar(1 / DT);
    const lead = vel.multiplyScalar(this.player.inCar ? 0.55 : 0.25);
    const leadMax = this.player.inCar ? 9 : 2.5;
    if (lead.length() > leadMax) lead.setLength(leadMax);
    const goal = new THREE.Vector3(target.x + lead.x, 0, target.z + lead.z);
    const k = 1 - Math.exp(-realDt * 3.5);
    this.focus.lerp(goal, k);
    const zoomGoal = this.player.inCar ? lerp(30, 44, clamp(Math.abs(this.car.speed) / 20, 0, 1)) : 23;
    this.zoomHalf = lerp(this.zoomHalf, zoomGoal, 1 - Math.exp(-realDt * 2));
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    this.camera.left = -this.zoomHalf * aspect;
    this.camera.right = this.zoomHalf * aspect;
    this.camera.top = this.zoomHalf;
    this.camera.bottom = -this.zoomHalf;
    // secousse
    const sh = this.fx.shake * this.fx.shake;
    const nx = (Math.random() - 0.5) * sh * 1.4;
    const nz = (Math.random() - 0.5) * sh * 1.4;
    this.camera.position.set(this.focus.x + nx, 95, this.focus.z + 23 + nz);
    this.camera.lookAt(this.focus.x + nx, 0, this.focus.z + nz);
    this.camera.updateProjectionMatrix();
    this.moon.position.set(this.focus.x + 60, 80, this.focus.z + 40);
    this.moon.target.position.set(this.focus.x, 0, this.focus.z);
    this.followLight.position.set(this.focus.x, 13, this.focus.z);

    // interpolation
    this.player.sync(alpha);
    this.car.sync(alpha);
    for (const g of this.guards) { g.sync(alpha); g.updateFan(); }
    for (const c of this.civilians) c.sync(alpha);
    for (const t of this.traffic) t.sync(alpha);
    this.nadia.sync(alpha);
    this.lise.sync(alpha);
    this.sorel.sync(alpha);
    for (const [id, n] of this.questNpcs) {
      if (this.escorts.has(id)) {
        n.mesh.position.set(n.pos.x, n.pos.y, n.pos.z);
        n.mesh.rotation.y = n.yaw;
      } else n.sync(alpha);
    }
    for (const p of this.parked) {
      const [px, py, pz] = bodyPos(p.body);
      p.mesh.position.set(px, py - 0.62, pz);
      const [qx, qy, qz, qw] = bodyRot(p.body);
      p.mesh.rotation.y = Math.atan2(2 * (qw * qy + qx * qz), 1 - 2 * (qy * qy + qx * qx));
    }
    this.mina.sync(alpha);
    this.ysec.sync(alpha);
    // balise : objectif de campagne prioritaire, sinon M01/U01 (mission.ts)
    const obj = this.currentObjective();
    if (obj.target) {
      this.beacon.visible = true;
      this.beacon.position.set(obj.target.x, 0, obj.target.z);
      this.beacon.rotation.y += realDt * 1.2;
      this.beaconColumn.material && ((this.beaconColumn.material as THREE.MeshBasicMaterial).opacity = 0.09 + Math.sin(this.time * 2) * 0.04);
    } else {
      this.beacon.visible = false;
    }
    // matériaux d'effacement
    for (const f of this.level.fades) {
      for (const m of f.mats) m.opacity = lerp(m.opacity, f.target, clamp(realDt * 9, 0, 1));
    }
    // grilles animées
    for (const g of this.grates) {
      if (g.open && g.openT < 1) {
        g.openT = Math.min(1, g.openT + realDt * 1.6);
        g.mesh.position.y = (g.def.h - 0.15) + g.openT * (g.def.h + 0.15);
      }
    }
    // audio moteur
    const spd01 = clamp(Math.abs(this.car.speed) / 20, 0, 1);
    this.audio.engine(spd01, this.car.driven);

    this.updateHud(obj);
    this.bloomPass.enabled = this.bloomOn;
    this.composer.render();
  }

  private updateHud(obj: { text: string; sub: string; target: { x: number; z: number } | null }) {
    this.hud.updateHud({
      hp: this.player.hp, maxHp: PLAYER.HP, money: this.money,
      ammo: this.player.ammo, reserve: this.player.reserve, reloading: this.player.reloadT > 0,
      cd1: this.implants.cdIntrusion, cd2: this.implants.cdLeurre,
      maxCd1: IMPLANTS.INTRUSION_CD, maxCd2: IMPLANTS.LEURRE_CD,
    });
    this.hud.objective(obj.text, obj.sub);
    this.hud.alert(this.alert.level(this));
    this.zoneT -= 1;
    if (this.zoneT <= 0) { this.zoneT = 30; this.hud.zone(this.zoneName()); }
    // réticule
    if (!this.player.inCar && !this.cinematic && !this.paused) {
      const t = this.implants.target(this);
      this.hud.crosshair(this.input.mouse.x, this.input.mouse.y, t !== null && this.implants.cdIntrusion <= 0);
      this.hud.targetLabel(t ? t.label : null);
    } else {
      this.hud.hideCrosshair();
      this.hud.targetLabel(null);
    }
    // marqueur d'objectif
    if (obj.target) {
      const v = new THREE.Vector3(obj.target.x, 1.2, obj.target.z).project(this.camera);
      const w = window.innerWidth, h = window.innerHeight;
      let sx = (v.x * 0.5 + 0.5) * w;
      let sy = (-v.y * 0.5 + 0.5) * h;
      const margin = 70;
      const onScreen = v.z < 1 && sx > margin && sx < w - margin && sy > margin && sy < h - margin;
      const d = Math.round(dist(this.player.pos.x, this.player.pos.z, obj.target.x, obj.target.z));
      if (onScreen) {
        this.hud.marker(true, sx, sy - 40, `${d} m`);
      } else {
        sx = clamp(sx, margin, w - margin);
        sy = clamp(sy, margin, h - margin);
        const cx = w / 2, cy = h / 2;
        const ang = Math.atan2(sx - cx, -(sy - cy)) * 180 / Math.PI;
        this.hud.marker(true, sx, sy, `${d} m`, ang);
      }
    } else {
      this.hud.marker(false);
    }
  }

  // ------------------------------------------------------------------ pause / diverse

  pause() {
    if (!this.started || this.paused) return;
    this.paused = true;
    this.input.setEnabled(false);
    this.input.releaseAll();
    this.audio.engine(0, false);
    this.hud.showPause(this.mission.state === 'acceptee' || this.mission.state === 'puce');
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.input.setEnabled(true);
    this.hud.hidePause();
    this.lastT = performance.now();
  }

  hudDamage() { this.hud.damageFlash(); }
  toast(text: string, kind: 'info' | 'reward' | 'warn' = 'info') { this.hud.toast(text, kind); }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.input.updateNdc(w, h);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer.setSize(size.x, size.y);
  }
}

// libellés des PNJ et objets de campagne
function npcLabel(id: string): string {
  const map: Record<string, string> = {
    mina: 'Mina', nadia: 'Nadia Keita', lise: 'Lise Marec', sorel: 'Sorel',
    ysec: 'Ysec', gardien: 'le gardien', residente: 'Racha', varenne: 'Varenne', habitant: 'l’habitant',
  };
  return map[id] ?? id;
}
function propLabel(id: string): string {
  const map: Record<string, string> = {
    'calendrier': 'le calendrier papier', 'journal-portique': 'le journal du portique',
    'registre': 'le registre d’audit', 'releves-acces': 'les relevés d’accès',
    'dossier-chantage': 'le dossier de chantage', 'documents-papeterie': 'le lot de documents',
    'console-poste': 'Rétablir le poste de commande', 'terminal-controle': 'le terminal final',
    'boitier-portillon': 'Remettre le portillon en service', 'borne-relais': 'Réarmer la borne',
    'colis-signal': 'le colis', 'colis-relais': 'le module',
  };
  return map[id] ?? id;
}
