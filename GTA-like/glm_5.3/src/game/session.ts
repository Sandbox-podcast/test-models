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
import { Hud } from '../ui/hud';
import {
  DT, PLAYER, IMPLANTS, DELIVERY_CALM, G_STATIC, clamp, lerp, dist,
} from './defs';

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
  private chipMesh!: THREE.Mesh;
  private crateMesh!: THREE.Mesh;
  private pickups: { mesh: THREE.Mesh; kind: 'med' | 'ammo'; taken: boolean; x: number; z: number }[] = [];
  private interaction: { label: string | null; fn: (() => void) | null } = { label: null, fn: null };
  private witnessDispatched = false;
  private frameMs = 16;
  private slowT = 0;

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
    const civRoutes: { x: number; z: number }[][] = [
      [{ x: 70, z: 142 }, { x: 150, z: 142 }, { x: 190, z: 142 }],
      [{ x: 110, z: 125.8 }, { x: 170, z: 125.8 }],
      [{ x: 135, z: 50 }, { x: 170, z: 48 }, { x: 150, z: 58 }],
      [{ x: 100, z: 150 }, { x: 100, z: 120 }],
    ];
    for (const r of civRoutes) this.civilians.push(new Civilian(r, this));
    this.mina = new Npc(this.level.minaHome.x, this.level.minaHome.z, this, 0x2e5a50);
    this.ysec = new Npc(this.level.ysec.x, this.level.ysec.z, this, 0x6b2438);

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
    this.scene.add(new THREE.HemisphereLight(0x3d5273, 0x1a2029, 1.6));
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
    // colis secondaire
    this.crateMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.5, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x3a3213, emissive: 0xffd75c, emissiveIntensity: 0.8, roughness: 0.7 }),
    );
    this.crateMesh.position.set(this.level.crate.x, 0.45, this.level.crate.z);
    this.crateMesh.visible = false;
    this.scene.add(this.crateMesh);
    // ramassages
    for (const m of this.level.medkits) this.makePickup(m.x, m.z, 'med');
    for (const a of this.level.ammo) this.makePickup(a.x, a.z, 'ammo');
    // voitures garées
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
      g.position.set(p.x, 0, p.z);
      g.rotation.y = p.yaw + Math.PI / 2; // garées le long de l'avenue
      this.scene.add(g);
      const yaw = p.yaw + Math.PI / 2;
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.95, 0.5, 2.1)
          .setTranslation(p.x, 0.6, p.z)
          .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
          .setCollisionGroups(G_STATIC),
      );
    }
  }

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
      if (this.mission.secondary === 'terminee') this.mission.setCarried(false);
      if (this.mission.secondary === 'acceptee') this.crateMesh.visible = true;
    } else {
      this.toast('ZQSD/WASD : bouger · Souris : viser · E : interagir', 'info');
      setTimeout(() => this.started && this.toast('J : journal · 1/2 : implants · Maj : sprinter', 'info'), 6000);
    }
    this.focus.set(this.player.pos.x, 0, this.player.pos.z);
    this.lastT = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ------------------------------------------------------------------ boucle

  private loop(t: number) {
    requestAnimationFrame((tt) => this.loop(tt));
    const realDt = Math.min(0.1, (t - this.lastT) / 1000);
    this.lastT = t;
    this.frameMs = lerp(this.frameMs, realDt * 1000, 0.05);
    this.adaptQuality(realDt);
    if (!this.paused && this.started) {
      this.acc += realDt;
      let steps = 0;
      while (this.acc >= DT && steps < 5) {
        this.fixedUpdate(DT);
        this.acc -= DT;
        steps++;
      }
      if (steps === 5) this.acc = 0;
    }
    this.render(this.paused ? 1 : this.acc / DT, realDt);
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
          this.hud.journalOpen(this.mission.journal(this));
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
    for (const c of this.civilians) if (!c.dead) c.step(dt, this);
    for (const c of this.cams) c.update(dt, this);
    this.mina.step(dt, this);
    this.ysec.step(dt, this);

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
    this.world.step();
    this.player.postStep();
    this.car.postStep();
    for (const g of this.guards) g.postStep();
    for (const c of this.civilians) c.postStep();
    this.mina.postStep();
    this.ysec.postStep();

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
      this.crateMesh.position.set(this.player.pos.x, 2.15, this.player.pos.z);
      this.crateMesh.rotation.y += dt;
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

    // Mina (garage avant le contrat / après)
    if (this.mission.state === 'disponible' && near(this.level.minaHome.x, this.level.minaHome.z, 4.6)) {
      label = '<b>E</b> — Parler à Mina';
      fn = () => this.startBriefing();
    } else if (this.mission.state === 'terminee' && near(this.level.minaHome.x, this.level.minaHome.z, 4.6)) {
      label = '<b>E</b> — Parler à Mina';
      fn = () => this.hud.startDialogue('Mina', DIALOGUES.minaIdle.lines);
    }

    // Ysec
    const sec = this.mission.secondary;
    if (sec === 'disponible' && near(this.level.ysec.x, this.level.ysec.z, 4.2)) {
      label = '<b>E</b> — Parler à Ysec';
      fn = () => {
        this.cinematic = true;
        this.hud.startDialogue(DIALOGUES.ysecStart.speaker, DIALOGUES.ysecStart.lines, [
          { label: 'Prendre le colis', primary: true, cb: () => { this.acceptSecondary(); } },
          { label: 'Plus tard', cb: () => { this.cinematic = false; } },
        ]);
      };
    } else if (sec === 'acceptee' && this.mission.secondaryCarried(this) && near(this.level.ysec.x, this.level.ysec.z, 4.2)) {
      label = '<b>E</b> — Livrer le colis';
      fn = () => this.deliverSecondary();
    }

    // puce
    if (this.mission.state === 'acceptee' && !this.player.hasChip && near(this.level.pedestal.x, this.level.pedestal.z, 2.8)) {
      label = '<b>E</b> — Prendre la puce';
      fn = () => this.takeChip();
    }

    // colis
    if (sec === 'acceptee' && !this.mission.secondaryCarried(this) && near(this.level.crate.x, this.level.crate.z, 2.2)) {
      label = '<b>E</b> — Prendre le colis';
      fn = () => {
        this.mission.setCarried(true);
        this.audio.pickup();
        this.toast('Colis récupéré — livre-le à Ysec au Signal', 'info');
        // le vol du colis attire le vigile du quai
        for (const g of this.guards) {
          if (!g.dead && !g.offDuty && g.name === 'quai') g.broadcast(this, new THREE.Vector3(this.level.crate.x, 0, this.level.crate.z));
        }
      };
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
    this.saveNow();
  }

  private deliverSecondary() {
    this.cinematic = true;
    this.mission.setCarried(false);
    this.crateMesh.visible = false;
    const save = loadSave();
    if (!save?.recompenseSecondaire) {
      this.money += REWARD_SECONDARY;
      this.toast(`Contrat rempli : Colis perdu (+${REWARD_SECONDARY}¤)`, 'reward');
    }
    this.mission.onSecondaryDone(this);
    this.player.reserve = Math.min(PLAYER.RESERVE_MAX, this.player.reserve + 24);
    this.saveNow();
    this.hud.startDialogue(DIALOGUES.ysecDone.speaker, DIALOGUES.ysecDone.lines, [], () => {
      this.cinematic = false;
    });
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
    this.world.removeCollider(g.collider, true);
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
    this.car.teleport(this, this.level.carSpawn.x, this.level.carSpawn.z, this.level.carSpawn.yaw);
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

  // ------------------------------------------------------------------ voiture

  private enterCar() {
    if (this.player.inCar) return;
    this.player.inCar = true;
    this.car.driven = true;
    this.player.mesh.visible = false;
    this.player.pos.copy(this.car.pos);
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
    this.player.body.setTranslation({ x: spot.x, y: 1, z: spot.z }, true);
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
    writeSave({
      v: 1,
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
      ? new THREE.Vector3(this.car.body.linvel().x, 0, this.car.body.linvel().z)
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
    this.mina.sync(alpha);
    this.ysec.sync(alpha);
    // balise
    const obj = this.mission.objective(this);
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
