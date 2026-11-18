import * as T from 'three';
import {
  bounds, carSpawn, chip, clamp, collective, distance, districtAt, dossier, elevation, exchange,
  garage, gates, inRect, nodeContact, northDock, patrols, pedestrians, register, relay, residents, rooms, sensors,
  sideContact, sorel, spawn, type Point, type Patrol, type Sensor,
} from './level';
import { Physics, step } from './physics';
import { City, Effects, makeCamera, makeCar, makeDrone, PersonModel, sightCone } from './visuals';
import { Sound } from './sound';
import { effects, implants, newGame, objectives, readSave, writeSave, type Ending, type Implant, type Route, type Save } from './progression';

type Intent = 'garage' | 'brief' | 'chip' | 'deliver' | 'dossier' | 'side' | 'register' | 'collective' | 'sorel' | 'relay' | 'residents' | 'car';
type Interaction = { action: Intent; at: Point; label: string; range?: number };
export type Pin = { at: Point; label: string; kind: 'goal' | 'route' | 'car' };
export type Objective = { name: string; text: string; pins: Pin[] };
export type Menu = 'garage' | 'brief' | 'side' | 'route' | 'ending' | 'failed' | 'epilogue' | 'residents';
type Actor = { at: Point; previous: Point; yaw: number; health: number; hit: number; fall: number; model: PersonModel | T.Group; stride: number; momentum: Point };
type Guard = Actor & {
  spec: Patrol; cone: ReturnType<typeof sightCone>; state: 'patrol' | 'investigate' | 'pursue' | 'search';
  routeIndex: number; path: Point[]; destination?: Point; timer: number; sight: number; gun: number; repath: number; stunned: number;
  searchOrigin?: Point; searchIndex: number;
};
type Civil = Actor & { a: Point; b: Point; returning: boolean; fear: number };
type CameraSensor = { spec: Sensor; view: ReturnType<typeof makeCamera>; cone: ReturnType<typeof sightCone>; charge: number; disabled: number; yaw: number };
type Observer = 'camera' | 'guard' | 'drone';
const canvasLook = new T.Vector3(0, 56, 29);
const initialYaw = Math.PI;
const center: Point = [bounds.east, bounds.south];
const combine = (a: Point, b: Point, t: number): Point => [T.MathUtils.lerp(a[0], b[0], t), T.MathUtils.lerp(a[1], b[1], t)];
const forward = (yaw: number): Point => [Math.sin(yaw), Math.cos(yaw)];
const angle = (from: Point, to: Point) => Math.atan2(to[0] - from[0], to[1] - from[1]);
const deltaAngle = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const face = (yaw: number, target: number, dt: number) => yaw + deltaAngle(yaw, target) * Math.min(1, dt * 8);
const waypoint = (at: Point, label: string, kind: Pin['kind'] = 'goal'): Pin => ({ at, label, kind });
const home = (tint: string, at: Point, kind: 'contact' | 'civil' = 'contact') => {
  const person = new PersonModel(tint, kind);
  person.root.position.set(at[0], elevation(...at), at[1]);
  person.pose(.47, 0, 0, 0, 0);
  return person.root;
};
const actor = (at: Point, model: PersonModel | T.Group): Actor => ({
  at, previous: at, yaw: initialYaw, health: 100, hit: 0, fall: 0, model, stride: 0, momentum: [0, 0],
});
const position = (a: Actor) => a.model instanceof PersonModel ? a.model.root : a.model;

export class Game {
  readonly scene = new T.Scene();
  readonly camera = new T.OrthographicCamera();
  readonly renderer: T.WebGLRenderer;
  readonly physics = new Physics();
  readonly city = new City(this.scene);
  readonly sound = new Sound();
  readonly effects = new Effects(this.scene);
  readonly player = actor(spawn, new PersonModel('#9ccc79', 'player'));
  readonly car = { at: carSpawn, previous: carSpawn, yaw: initialYaw, lastYaw: initialYaw, speed: 0, model: makeCar() };
  readonly keys = new Set<string>();
  readonly guards: Guard[] = [];
  readonly civils: Civil[] = [];
  readonly cameras: CameraSensor[] = [];
  readonly checkpointAvailable = !!readSave();
  save: Save = readSave() ?? newGame();
  running = false;
  paused = false;
  driven = false;
  failed = false;
  loot = false;
  confirmed = false;
  observation = 0;
  observer: Observer | null = null;
  safeFor = 5;
  time = 0;
  health = 100;
  damageFlash = 0;
  message = '';
  messageTime = 0;
  pointer = { x: 0, y: 0, visible: false, down: false };
  aim: Point = [0, 0];
  cooldown: Record<Implant, number> = { intrusion: 0, decoy: 0, overload: 0 };
  private impulse = 0;
  private gun = 0;
  private heat = -100;
  private alarm = false;
  private hackGate = false;
  private frame = 0;
  private accumulator = 0;
  private resizeNeeded = true;
  private view = new T.Vector3();
  private readonly raycaster = new T.Raycaster();
  private readonly projection = new T.Vector3();
  private readonly pointerNdc = new T.Vector2();
  private readonly cameraPlane = new T.Plane(new T.Vector3(0, 1, 0), 0);
  private readonly mina = home('#74d7c1', garage);
  private readonly minaExchange = home('#74d7c1', exchange);
  private readonly contact = home('#d284a5', sideContact);
  private readonly objectiveObjects: { group: T.Group; kind: 'chip' | 'dossier' | 'register' | 'relay' }[] = [];

  constructor(readonly canvas: HTMLCanvasElement, readonly onMenu: (menu: Menu) => void, readonly onFrame: (game: Game) => void) {
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor('#111c26');
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene.fog = new T.Fog('#263b4d', 79, 170);
    this.scene.add(new T.HemisphereLight('#bfd8ef', '#75696b', 1.82));
    const moon = new T.DirectionalLight('#b9d7fa', 1.48);
    moon.position.set(-24, 38, 29);
    this.scene.add(moon);
    this.scene.add(position(this.player), this.car.model, this.mina, this.minaExchange, this.contact,
      home('#d0b383', residents), home('#8eddac', collective), home('#a1c6f6', sorel), home('#a1c6f6', nodeContact));
    for (const [at, yaw, tint] of [
      [[-49, -16], .03, '#756564'], [[33, 38], -1.55, '#5f6682'], [[96, 39], 1.57, '#695965'], [[219, 10], Math.PI, '#536471'],
    ] as [Point, number, string][]) {
      const model = makeCar(tint);
      model.position.set(at[0], elevation(...at), at[1]);
      model.rotation.y = yaw;
      this.scene.add(model);
      this.physics.addParked(at, yaw);
    }
    for (const [kind, at, color] of [['chip', chip, '#e6f185'], ['dossier', dossier, '#e294b4'],
      ['register', register, '#87eed8'], ['relay', relay, '#a0ccff']] as const) {
      const group = new T.Group();
      group.position.set(at[0], elevation(...at), at[1]);
      const plinth = new T.Mesh(new T.BoxGeometry(1.18, .97, .75), new T.MeshStandardMaterial({ color: '#344654', metalness: .45, roughness: .56 }));
      plinth.position.y = .5;
      const terminal = new T.Mesh(new T.BoxGeometry(.81, .09, .46), new T.MeshBasicMaterial({ color }));
      terminal.position.y = 1.025;
      const panel = new T.Mesh(new T.BoxGeometry(.76, .09, .53), new T.MeshBasicMaterial({ color }));
      panel.position.y = 1.32;
      panel.rotation.y = .16;
      group.add(plinth, terminal, panel);
      this.scene.add(group);
      this.objectiveObjects.push({ kind, group });
    }
    for (const spec of patrols) {
      const model = spec.drone ? makeDrone() : new PersonModel('#c08372', 'guard');
      const cone = sightCone(spec.drone ? 11 : 8.2, spec.drone ? 4.4 : 3.2, '#f59d72');
      const a = actor(spec.at, model);
      this.scene.add(position(a), cone);
      this.guards.push({ ...a, spec, cone, state: 'patrol', routeIndex: 0, path: [], timer: 0, sight: 0, gun: .8, repath: 0, stunned: 0, searchIndex: 0 });
    }
    for (const spec of pedestrians) {
      const a = actor(spec.at, new PersonModel(spec.tint, 'civil'));
      this.scene.add(position(a));
      this.civils.push({ ...a, a: spec.at, b: spec.to, returning: false, fear: 0 });
    }
    for (const spec of sensors) {
      const view = makeCamera(), cone = sightCone(13.8, 4.9, '#ffd473');
      view.root.position.set(spec.at[0], elevation(...spec.at), spec.at[1]);
      this.scene.add(view.root, cone);
      this.cameras.push({ spec, view, cone, charge: 0, disabled: 0, yaw: spec.angle });
    }
    this.resetScene();
    this.view.set(spawn[0], 0, spawn[1] - 2);
    window.addEventListener('resize', () => { this.resizeNeeded = true; });
    this.frame = performance.now();
    requestAnimationFrame(this.animate);
  }

  get at() { return this.driven ? this.car.at : this.player.at; }
  get received() { return this.save.chapter > 1; }
  get active() { return this.save.checkpoint === this.save.chapter && !this.save.ending; }
  get pursuing() { return this.guards.some(g => g.health > 0 && (g.state === 'pursue' || g.state === 'search')); }
  get availableImplants(): Implant[] { return this.save.route ? ['intrusion', 'decoy', 'overload'] : ['intrusion', 'decoy']; }

  start() {
    this.running = true;
    this.pause(false);
    this.persist();
    void this.sound.enable().catch(() => undefined);
    if (this.active) this.notice('Reprise au garage. Le contrat est réinitialisé au briefing.');
  }

  restart() {
    this.save = newGame();
    this.time = 0;
    this.messageTime = 0;
    this.resetScene();
  }

  persist() {
    if (!writeSave(this.save)) this.notice('Sauvegarde indisponible dans ce navigateur.');
  }

  notice(message: string, duration = 3.25) {
    this.message = message;
    this.messageTime = duration;
  }

  pause(value: boolean) {
    if (value !== this.paused) {
      this.frame = performance.now();
      this.accumulator = 0;
    }
    this.paused = value;
    this.keys.clear();
    this.pointer.down = false;
  }

  equip(items: [Implant, Implant]) {
    this.save.loadout = items;
    this.cooldown = { intrusion: 0, decoy: 0, overload: 0 };
    this.persist();
    this.notice('Implants équipés.');
  }

  track(which: Save['tracking']) {
    if ((this.active || this.save.side === 'accepted') && this.save.tracking !== which) return;
    this.save.tracking = which;
    this.persist();
  }

  accept() {
    if (this.active || this.save.ending || this.save.side === 'accepted') return;
    this.save = { ...this.save, checkpoint: this.save.chapter, tracking: 'main' };
    this.health = 100;
    this.persist();
    this.sound.beep(503, .23, .18, 733);
    this.notice('Contrat accepté. Le journal indique les accès connus.');
  }

  acceptSide() {
    if (this.active || this.save.side !== 'available') return;
    this.save = { ...this.save, side: 'accepted', tracking: 'side' };
    this.persist();
    this.notice('Suivez le dossier dans la rue des ateliers.');
  }

  finishRoute(route: Route) {
    if (!this.active || this.save.chapter !== 2 || !this.loot) return;
    this.save = { ...this.save, route, chapter: 3, checkpoint: null, credits: this.save.credits + 750 };
    this.endSequence();
    this.notice(effects[route].now + ' Surcharge est disponible au garage.', 6);
  }

  finishEnding(ending: Ending) {
    if (!this.active || this.save.chapter !== 3 || !this.loot) return;
    this.save = { ...this.save, ending, checkpoint: null, credits: this.save.credits + 1000 };
    this.endSequence();
    this.onMenu('epilogue');
  }

  retry(abandon: boolean) {
    if (abandon) this.save = { ...this.save, checkpoint: null, side: this.save.side === 'accepted' ? 'available' : this.save.side };
    this.resetScene();
    this.persist();
    this.notice(abandon ? 'De retour en ville libre.' : 'Point de reprise au garage.');
  }

  private resetScene() {
    Object.assign(this.player, { at: spawn, previous: spawn, yaw: initialYaw, health: 100, hit: 0, fall: 0, momentum: [0, 0] });
    Object.assign(this.car, { at: carSpawn, previous: carSpawn, yaw: initialYaw, lastYaw: initialYaw, speed: 0 });
    this.driven = false;
    this.failed = false;
    this.loot = false;
    this.health = 100;
    this.safeFor = 5;
    this.confirmed = false;
    this.observation = 0;
    this.observer = null;
    this.heat = -100;
    this.alarm = false;
    this.hackGate = false;
    this.cooldown = { intrusion: 0, decoy: 0, overload: 0 };
    this.damageFlash = 0;
    this.gun = 0;
    this.effects.clear();
    this.view.set(spawn[0], 0, spawn[1] - 1.8);
    this.physics.setParked(this.car.at, this.car.yaw, true);
    this.physics.tick();
    for (const g of this.guards) Object.assign(g, {
      at: g.spec.at, previous: g.spec.at, yaw: angle(g.spec.at, g.spec.route[1]), health: 100, hit: 0, fall: 0, state: 'patrol',
      routeIndex: 0, path: [], destination: undefined, timer: 0, sight: 0, repath: 0, stunned: 0, searchIndex: 0,
      momentum: [0, 0], gun: .8,
    });
    for (const c of this.civils) Object.assign(c, { at: c.a, previous: c.a, health: 100, hit: 0, fall: 0, returning: false, fear: 0, momentum: [0, 0] });
    for (const s of this.cameras) Object.assign(s, { charge: 0, disabled: 0 });
    this.refreshWorld();
    this.paint(1, 0);
  }

  private endSequence() {
    this.loot = false;
    this.alarm = false;
    this.refreshWorld();
    this.persist();
    this.sound.beep(678, .4, .13, 1010);
  }

  private refreshWorld() {
    const open: Record<string, boolean> = {
      'depot-gate': this.hackGate, service: this.received,
      gallery: this.save.route === 'collective' || this.save.ending === 'publish',
      community: this.save.route === 'collective' || this.save.ending === 'publish',
      badge: this.save.route === 'sorel' || this.save.ending === 'protect',
    };
    for (const g of gates) {
      this.physics.setGate(g.id, open[g.id]);
      this.city.gateMeshes.get(g.id)!.visible = !open[g.id];
    }
    this.minaExchange.visible = this.active && this.save.chapter === 1 && this.loot;
    this.contact.visible = this.received;
    for (const { kind, group } of this.objectiveObjects) {
      group.visible = kind === 'dossier' ? this.save.side === 'accepted' && !this.loot
        : kind === 'chip' ? !this.received && !this.loot
        : kind === 'register' ? this.save.chapter <= 2 && !(this.save.chapter === 2 && this.loot)
        : true;
    }
  }

  objective(): Objective {
    const { chapter, checkpoint, side, tracking, ending, route } = this.save;
    const goal = (name: string, text: string, at: Point, label: string, others: Pin[] = []): Objective =>
      ({ name, text, pins: [waypoint(at, label), ...others] });
    if (tracking === 'side' && side !== 'complete' && side !== 'locked') {
      if (side === 'available') return goal('Sous scellés', 'Rencontrer Ilyes au dispensaire', sideContact, 'Ilyes');
      return this.loot
        ? goal('Sous scellés', 'Rapporter le dossier à Ilyes', sideContact, 'Ilyes')
        : goal('Sous scellés', 'Récupérer le dossier près des ateliers', dossier, 'Dossier');
    }
    if (checkpoint === null) {
      if (ending) return { name: 'Ville libre', text: 'Les choix du registre restent visibles dans la ville.', pins: [] };
      return chapter === 3 ? goal(objectives[chapter].name, 'Rencontrer Sorel au Nœud', nodeContact, 'Sorel')
        : goal(objectives[chapter].name, 'Parler à Mina au garage', garage, 'Mina', chapter === 1 ? [waypoint(carSpawn, 'Voiture', 'car')] : []);
    }
    if (chapter === 1) {
      if (!this.loot) {
        const inCourtyard = inRect(...this.at, [6.5, -28, 21, 20]);
        const entry = inCourtyard ? waypoint(northDock, 'Quai nord ouvert', 'route')
          : waypoint([4.7, -23.4], 'Cour latérale', 'route');
        return goal('Puce fantôme', 'Récupérer la puce au dépôt F-07', chip, 'Puce', [
          waypoint([22, -11.2], 'Entrée principale', 'route'), entry,
        ]);
      }
      const routePins = this.driven ? [waypoint([43, -41], 'Pont routier', 'route')]
        : [waypoint([13, -35], 'Escalier', 'route'), waypoint([43, -41], 'Pont routier', 'route')];
      return goal('Puce fantôme', 'Remettre la puce à Mina sous les voies', exchange, 'Remise', routePins);
    }
    if (chapter === 2) {
      if (!this.loot) return goal('Les effacés', 'Récupérer le registre aux archives', register, 'Registre', [
        waypoint([102, -13.5], 'Guichet sud', 'route'), waypoint([114, -38], 'Passage nord', 'route'),
      ]);
      return goal('Les effacés', 'Choisir à qui confier le registre', collective, 'Collectif', [waypoint(sorel, 'Sorel', 'route')]);
    }
    if (!this.loot) return goal('Le Nœud', 'Activer le relais central', relay, 'Relais', [
      route === 'collective' ? waypoint([178.1, -29], 'Accès communautaire', 'route') : waypoint([193, -12.7], 'Entrée de service', 'route'),
    ]);
    return goal('Le Nœud', 'Décider du sort du registre au relais', relay, 'Registre');
  }

  interaction(): Interaction | undefined {
    if (this.driven) return { action: 'car', at: this.at, label: Math.abs(this.car.speed) > 2.2 ? 'Freinez pour descendre' : 'Descendre de la voiture' };
    const { chapter, side, ending } = this.save, list: Interaction[] = [];
    list.push({ action: 'garage', at: garage, label: 'Parler à Mina', range: 3.4 });
    list.push({ action: 'car', at: this.car.at, label: 'Prendre la voiture', range: 3.25 });
    list.push({ action: 'residents', at: residents, label: 'Parler à l’habitante' });
    if (this.active) {
      if (chapter === 1 && !this.loot) list.push({ action: 'chip', at: chip, label: 'Prendre la puce' });
      if (chapter === 1 && this.loot) list.push({ action: 'deliver', at: exchange, label: this.safeFor >= 5 ? 'Donner la puce à Mina' : 'Attendre la fin de la détection', range: 3.25 });
      if (chapter === 2 && !this.loot) list.push({ action: 'register', at: register, label: 'Prendre le registre' });
      if (chapter === 2 && this.loot) list.push({ action: 'collective', at: collective, label: 'Parler au collectif' }, { action: 'sorel', at: sorel, label: 'Parler à Sorel' });
      if (chapter === 3) list.push({ action: 'relay', at: relay, label: this.loot ? 'Décider du sort du registre' : 'Activer le relais', range: 2.45 });
    } else if (!ending && side !== 'accepted') {
      if (chapter === 2) list.push({ action: 'brief', at: sorel, label: 'Parler à Sorel' });
      if (chapter === 3) list.push({ action: 'brief', at: nodeContact, label: 'Parler à Sorel' });
    }
    if (side !== 'locked' && side !== 'complete') list.push({ action: 'side', at: sideContact, label: side === 'available' ? 'Parler à Ilyes' : 'Remettre le dossier à Ilyes' });
    if (side === 'accepted' && !this.loot) list.push({ action: 'dossier', at: dossier, label: 'Prendre le dossier' });
    return list.filter(p => distance(p.at, this.at) <= (p.range ?? 2.65) && this.physics.ray(this.at, p.at, 1.3, 1.4, p.action === 'car') > .89)
      .sort((a, b) => distance(a.at, this.at) - distance(b.at, this.at))[0];
  }

  interact() {
    if (!this.running || this.paused || this.failed) return;
    const intent = this.interaction();
    if (!intent) return;
    switch (intent.action) {
      case 'car': this.transfer(); break;
      case 'garage':
        this.health = 100;
        this.onMenu('garage');
        break;
      case 'brief': this.onMenu('brief'); break;
      case 'residents': this.onMenu('residents'); break;
      case 'chip':
      case 'register': this.take(intent.at); break;
      case 'dossier':
        this.loot = true;
        this.refreshWorld();
        this.sound.beep(580, .16, .13, 765);
        this.notice('Dossier récupéré. Retournez voir Ilyes.');
        break;
      case 'deliver':
        if (this.safeFor < 5) {
          this.notice('La remise exige cinq secondes sans détection confirmée.');
          return;
        }
        this.save = { ...this.save, chapter: 2, checkpoint: null, side: 'available', credits: this.save.credits + 450 };
        this.endSequence();
        this.notice('Puce remise. Passage de service ouvert. +450 ₡', 5);
        break;
      case 'side':
        if (this.save.side === 'available') this.onMenu('side');
        else if (this.loot && this.save.side === 'accepted') {
          this.save = { ...this.save, side: 'complete', tracking: 'main', credits: this.save.credits + 280 };
          this.endSequence();
          this.notice('Ilyes détruit les dossiers. +280 ₡');
        } else this.notice('Ilyes attend le dossier de chantage.');
        break;
      case 'collective':
      case 'sorel': this.onMenu('route'); break;
      case 'relay':
        if (this.loot) this.onMenu('ending');
        else {
          this.take(intent.at);
          this.notice('Relais connecté. Interagissez de nouveau pour décider.', 3.5);
        }
        break;
    }
  }

  private transfer() {
    if (this.driven) {
      if (Math.abs(this.car.speed) > 2.2) { this.notice('Freinez avant de descendre.'); return; }
      const side: Point = [Math.cos(this.car.yaw), -Math.sin(this.car.yaw)];
      for (const sign of [1, -1]) {
        const target: Point = [this.car.at[0] + side[0] * sign * 1.76, this.car.at[1] + side[1] * sign * 1.76];
        if (!this.physics.canStand(target) || this.physics.ray(this.car.at, target, .9, .9, true) < .99) continue;
        this.player.at = this.player.previous = target;
        this.car.speed = 0;
        this.driven = false;
        this.physics.setParked(this.car.at, this.car.yaw, true);
        return;
      }
      this.notice('Les deux portières sont bloquées.');
      return;
    }
    this.driven = true;
    this.physics.setParked(this.car.at, this.car.yaw, false);
    this.sound.beep(93, .14, .075, 175);
  }

  private take(at: Point) {
    this.loot = true;
    this.safeFor = 0;
    if (!this.alarm) {
      this.alarm = true;
      this.effects.pulse(at, '#ff9e79', 1.6);
      this.sound.beep(441, .47, .21, 185);
      for (const guard of this.guards) {
        if (guard.spec.district !== this.save.chapter - 1 || guard.health <= 0 || guard.state === 'pursue') continue;
        this.order(guard, at, 'investigate', 8.8);
      }
    }
    this.refreshWorld();
    this.notice(this.save.chapter === 1
      ? 'Puce récupérée. Intervention au dépôt. Mina vous attend sous les voies.'
      : this.save.chapter === 2 ? 'Registre récupéré. Le collectif et Sorel attendent votre décision.' : 'Relais connecté.', 5.2);
  }

  private get intrusion() {
    if (!this.hackGate && distance(this.at, [8, -24]) <= 16 && distance(this.aim, [8, -24]) <= 3.1) return 'depot-gate';
    return this.cameras.find(cam => this.cameraEnabled(cam) && distance(this.at, cam.spec.at) <= 16 && distance(this.aim, cam.spec.at) <= 3);
  }
  private get droneTarget() {
    return this.guards.find(g => g.spec.drone && g.health > 0 && g.stunned <= 0 && distance(this.at, g.at) < 12.5 && distance(this.aim, g.at) < 3.2);
  }
  get validAim() {
    if (this.driven || !this.pointer.visible) return false;
    return this.save.loadout.some(i => this.cooldown[i] <= 0 && (i === 'intrusion' ? this.intrusion : i === 'overload' && this.droneTarget));
  }

  implant(slot: number) {
    if (!this.running || this.paused || this.driven || this.failed) return;
    const choice = this.save.loadout[slot];
    if (this.cooldown[choice] > 0) { this.notice('Implant en recharge.'); return; }
    this.updateAim();
    if (choice === 'intrusion') {
      const target = this.intrusion;
      if (!target) { this.notice(implants[choice].help); return; }
      if (target === 'depot-gate') {
        this.hackGate = true;
        this.refreshWorld();
        this.effects.pulse([8, -24], '#a5f2bd');
        this.notice('Grille du quai ouverte.');
      } else {
        target.disabled = 10;
        target.charge = 0;
        this.effects.pulse(target.spec.at, '#a5f2bd');
        this.notice('Caméra coupée pendant 10 s.');
      }
    } else if (choice === 'decoy') {
      if (distance(this.at, this.aim) > 20) { this.notice('Portée du leurre dépassée.'); return; }
      this.effects.pulse(this.aim, '#8ee9cd', 1.32);
      const guard = this.guards.filter(g => g.health > 0 && !g.spec.drone && g.state !== 'pursue' && distance(g.at, this.aim) < 19)
        .sort((a, b) => distance(a.at, this.aim) - distance(b.at, this.aim))[0];
      if (guard) this.order(guard, this.aim, 'investigate', 8);
      this.notice(guard ? 'Leurre actif. Un vigile quitte son poste.' : 'Leurre actif. Aucun vigile à proximité.');
    } else {
      const drone = this.droneTarget;
      if (!drone) { this.notice(implants[choice].help); return; }
      drone.stunned = 7;
      drone.sight = 0;
      this.effects.pulse(drone.at, '#9dbcff');
      for (const g of this.guards.filter(a => !a.spec.drone && a.health > 0 && distance(a.at, drone.at) < 16 && a.state !== 'pursue')) {
        this.order(g, drone.at, 'investigate', 7);
      }
      this.notice('Drone immobilisé. Les vigiles ont entendu la décharge.');
    }
    this.cooldown[choice] = implants[choice].cooldown;
    this.sound.beep(695, .30, .22, 360);
  }

  private key(...keys: string[]) { return keys.some(k => this.keys.has(k)); }

  private controls(dt: number) {
    const x = Number(this.key('d', 'arrowright')) - Number(this.key('a', 'q', 'arrowleft'));
    const z = Number(this.key('s', 'arrowdown')) - Number(this.key('w', 'z', 'arrowup'));
    if (!this.driven) {
      const speed = this.key('shift') ? 9.3 : 6.65;
      const factor = speed * dt / Math.max(1, Math.hypot(x, z));
      this.player.at = this.physics.move(this.player.at, x * factor, z * factor).at;
      this.player.stride = x || z ? speed / 8.9 : 0;
      if (this.pointer.visible && distance(this.player.at, this.aim) > .22) {
        this.player.yaw = angle(this.player.at, this.aim);
      } else if (x || z) this.player.yaw = Math.atan2(x, z);
      if (this.pointer.down && this.gun <= 0) this.shoot();
      return;
    }
    const car = this.car;
    const throttle = -z;
    const stop = this.key(' ');
    if (stop) car.speed *= Math.exp(-8.8 * dt);
    else if (throttle) {
      const changing = car.speed * throttle < 0;
      car.speed = clamp(car.speed + throttle * dt * (changing ? 28 : throttle > 0 ? 13 : 10), -8.2, 23.2);
    } else car.speed *= Math.exp(-1.24 * dt);
    if (Math.abs(car.speed) < .075) car.speed = 0;
    if (x && Math.abs(car.speed) > .32) {
      const next = car.yaw - x * Math.sign(car.speed) * (1.63 + 1.18 * Math.min(Math.abs(car.speed) / 11, 1)) * dt;
      if (this.physics.canTurn(car.at, next)) car.yaw = next;
    }
    const heading = forward(car.yaw);
    const from = car.at;
    const move = this.physics.move(from, heading[0] * car.speed * dt, heading[1] * car.speed * dt, car.yaw, true);
    car.at = move.at;
    if (move.hit) {
      if (Math.abs(car.speed) > 2.15 && this.impulse <= 0) {
        const strong = Math.abs(car.speed) > 10.8;
        this.sound.impact(strong);
        this.effects.pulse(car.at, strong ? '#ffb67f' : '#c2c9da', .25);
        this.impulse = .35;
        if (strong) this.hurt(5);
      }
      car.speed *= -.13;
    }
    if (Math.abs(car.speed) < 2.75) return;
    const c = Math.cos(car.yaw), s = Math.sin(car.yaw);
    for (const victim of [...this.guards, ...this.civils]) {
      if (victim.health <= 0 || victim.hit > .45 || ('spec' in victim && (victim as Guard).spec.drone)) continue;
      const dx = victim.at[0] - car.at[0], dz = victim.at[1] - car.at[1];
      if (Math.abs(dx * c - dz * s) > 1.34 || Math.abs(dx * s + dz * c) > 2.3 || Math.abs(elevation(...victim.at) - elevation(...car.at)) > 1.3) continue;
      const strength = Math.abs(car.speed);
      const impact: Point = [heading[0] * Math.sign(car.speed), heading[1] * Math.sign(car.speed)];
      if (strength < 8) {
        victim.hit = 1;
        victim.momentum = [impact[0] * 2.9, impact[1] * 2.9];
        this.sound.impact();
        if ('fear' in victim) (victim as Civil).fear = 4;
      } else {
        this.injure(victim, strength > 14 ? 120 : 54, impact, true);
        this.sound.impact(true);
        this.violent();
      }
      car.speed *= strength > 8 ? .73 : .60;
    }
  }

  private shoot() {
    this.gun = .24;
    const from = this.player.at, dir = forward(this.player.yaw);
    const target: Point = [from[0] + dir[0] * 35, from[1] + dir[1] * 35];
    let reach = this.physics.ray(from, target, 1.20, 1.20) * 35;
    let targetActor: Actor | undefined;
    for (const a of [...this.guards, ...this.civils]) {
      if (a.health <= 0) continue;
      const dx = a.at[0] - from[0], dz = a.at[1] - from[1];
      const along = dx * dir[0] + dz * dir[1];
      if (along < .45 || along > reach || Math.abs(dx * dir[1] - dz * dir[0]) > .68 ||
          this.physics.ray(from, a.at, 1.18, 1.16) < .98) continue;
      reach = along;
      targetActor = a;
    }
    const to: Point = [from[0] + dir[0] * reach, from[1] + dir[1] * reach];
    this.effects.trace(new T.Vector3(from[0] + dir[0] * .52, elevation(...from) + 1.22, from[1] + dir[1] * .52),
      new T.Vector3(to[0], elevation(...to) + 1.22, to[1]));
    this.sound.impact(!!targetActor, true);
    if (targetActor) this.injure(targetActor, 36, dir, false);
    this.violent();
    for (const c of this.civils) if (distance(c.at, from) < 15) c.fear = 4.7;
  }

  private violent() {
    this.heat = this.time;
    const witness = this.civils.some(c => c.health > 0 && distance(c.at, this.at) < 13 && this.physics.ray(c.at, this.at) > .94);
    if (!witness) return;
    this.safeFor = 0;
    for (const g of this.guards) {
      if (g.health <= 0 || g.spec.drone || distance(g.at, this.at) > 54) continue;
      this.order(g, this.at, 'pursue', 5.3);
    }
    this.notice('Un témoin a signalé votre position.', 2.8);
  }

  private injure(a: Actor, amount: number, dir: Point, strong: boolean) {
    a.health -= amount;
    a.hit = 1;
    a.momentum = [dir[0] * (strong ? 7 : 1.25), dir[1] * (strong ? 7 : 1.25)];
    if (a.model instanceof PersonModel) {
      this.effects.blood(a.at[0], elevation(...a.at) + (strong ? .60 : 1.05), a.at[1], dir[0], dir[1], strong || a.health <= 0);
    } else this.effects.pulse(a.at, '#ffbb83', .45);
  }

  private hurt(damage: number) {
    this.health = Math.max(0, this.health - damage);
    this.damageFlash = .24;
    if (!this.driven) this.effects.blood(this.at[0], elevation(...this.at) + 1, this.at[1], 0, 0, false);
    if (this.health > 0 || this.failed) return;
    this.failed = true;
    this.pause(true);
    this.onMenu('failed');
  }

  private restricted(district: number) {
    if (this.save.ending === 'publish' && district === 2) return false;
    const activeRoom = rooms[district + 1];
    return inRect(...this.at, activeRoom.area, .45);
  }

  private cameraEnabled(cam: CameraSensor) {
    return !(cam.spec.district === 2 && this.save.ending === 'publish') && cam.disabled <= 0;
  }

  private sees(at: Point, yaw: number, range: number, tolerance: number, height: number) {
    const d = distance(at, this.at);
    if (d >= range || Math.abs(elevation(...at) - elevation(...this.at)) >= 3.1) return false;
    if (d > 2.35 && Math.abs(deltaAngle(yaw, angle(at, this.at))) > tolerance) return false;
    return this.physics.ray(at, this.at, height, this.driven ? 1.21 : 1.37) > .985;
  }

  private order(g: Guard, at: Point, state: Guard['state'], time: number) {
    if (g.state !== state) {
      g.repath = 0;
      if (state === 'search') { g.searchOrigin = at; g.searchIndex = 0; }
    }
    g.state = state;
    g.destination = at;
    g.timer = time;
  }

  private reportObservation(amount: number, observer: Observer) {
    if (amount <= this.observation) return;
    this.observation = amount;
    this.observer = observer;
  }

  private detect(dt: number) {
    this.observation = 0;
    this.observer = null;
    const wasConfirmed = this.confirmed;
    this.confirmed = false;
    const crime = this.time - this.heat < 8;
    const liveDistrict = districtAt(this.at[0]);
    for (const cam of this.cameras) {
      cam.disabled = Math.max(0, cam.disabled - dt);
      cam.yaw = cam.spec.angle + Math.sin(this.time * .78 + cam.spec.district) * .61;
      const visible = liveDistrict === cam.spec.district && this.cameraEnabled(cam) && this.sees(cam.spec.at, cam.yaw, 13.8, .62, 2.63);
      cam.charge = clamp(cam.charge + (visible ? dt * .83 : -dt * 1.9), 0, 1);
      this.reportObservation(cam.charge, 'camera');
      if (cam.charge < 1 || !visible) continue;
      this.confirmed = true;
      for (const g of this.guards) {
        if (g.health > 0 && g.spec.district === cam.spec.district && g.stunned <= 0) this.order(g, this.at, 'pursue', 5.7);
      }
    }
    for (const g of this.guards) {
      if (g.health <= 0 || g.stunned > 0) continue;
      const hostile = crime || this.restricted(g.spec.district) || g.state === 'pursue' || g.state === 'search' ||
        (this.loot && this.active && this.save.chapter - 1 === g.spec.district);
      const clear = hostile && this.sees(g.at, g.yaw, g.spec.drone ? 13.4 : g.state === 'pursue' ? 17.5 : 10.5,
        g.state === 'pursue' ? 1.12 : .78, g.spec.drone ? 1.75 : 1.43);
      g.sight = clamp(g.sight + (clear ? dt * (g.state === 'pursue' ? 4.6 : 1.46) : -dt * 2.45), 0, 1);
      this.reportObservation(g.sight, g.spec.drone ? 'drone' : 'guard');
      if (g.sight < 1 || !clear) continue;
      this.confirmed = true;
      this.order(g, this.at, 'pursue', 5.7);
      for (const partner of this.guards) {
        if (partner !== g && partner.health > 0 && partner.spec.district === g.spec.district && partner.stunned <= 0) {
          this.order(partner, this.at, 'pursue', 5.7);
        }
      }
      g.gun -= dt;
      if (g.gun <= 0 && distance(g.at, this.at) < (g.spec.drone ? 10 : 13.8)) {
        g.gun = 1.27;
        const a = g.at, p = this.at;
        this.effects.trace(new T.Vector3(a[0], elevation(...a) + 1.27, a[1]), new T.Vector3(p[0], elevation(...p) + 1.13, p[1]));
        this.sound.impact(false, true);
        this.hurt(this.driven ? 6 : g.spec.drone ? 8 : 11);
      }
    }
    if (this.confirmed && !wasConfirmed) this.sound.beep(660, .21, .15, 420);
    this.safeFor = this.confirmed ? 0 : Math.min(5, this.safeFor + dt);
  }

  private moveGuard(g: Guard, dt: number) {
    g.stunned = Math.max(0, g.stunned - dt);
    if (g.health <= 0 || g.stunned > 0) { g.stride = 0; return; }
    if (distance(this.at, g.at) > 74 && g.state === 'patrol') { g.stride = 0; return; }
    g.timer -= dt;
    if (g.state === 'pursue' && g.timer <= 0) this.order(g, g.destination ?? g.at, 'search', 7.5);
    if ((g.state === 'search' || g.state === 'investigate') && g.timer <= 0) {
      g.state = 'patrol';
      g.path = [];
      g.repath = 0;
    }
    if (g.state === 'patrol') {
      g.destination = g.spec.route[g.routeIndex];
      if (distance(g.at, g.destination) < .78) {
        g.routeIndex = (g.routeIndex + 1) % g.spec.route.length;
        g.destination = g.spec.route[g.routeIndex];
        g.repath = 0;
      }
    } else if (g.state === 'search' && g.destination && g.searchOrigin && distance(g.at, g.destination) < .88) {
      const origin = g.searchOrigin;
      const directions: Point[] = [[3.5, -3.5], [4.9, 3.4], [-4.6, 1.8], [-1.6, -4], [0, 0]];
      const offset = directions[g.searchIndex++ % directions.length];
      g.destination = [origin[0] + offset[0], origin[1] + offset[1]];
      g.repath = 0;
    }
    if (!g.destination) return;
    g.repath -= dt;
    if (g.repath <= 0) {
      g.path = this.physics.findRoute(g.at, g.destination);
      g.repath = g.state === 'pursue' ? .31 : .65;
    }
    while (g.path.length > 1 && distance(g.at, g.path[0]) < .74) g.path.shift();
    const next = g.path[0];
    if (!next || distance(g.at, next) < .36) {
      g.stride = 0;
      if (g.state !== 'pursue') g.yaw += dt * .57;
      return;
    }
    if (g.state === 'pursue' && g.sight > .96 && distance(g.at, this.at) < 3.4) {
      g.yaw = face(g.yaw, angle(g.at, this.at), dt);
      g.stride = 0;
      return;
    }
    const targetYaw = angle(g.at, next);
    g.yaw = face(g.yaw, targetYaw, dt);
    const speed = g.state === 'pursue' ? 6.45 : g.state === 'patrol' ? 2.05 : 3.75;
    const start = g.at;
    const [dx, dz] = forward(targetYaw);
    g.at = this.physics.move(start, dx * speed * dt, dz * speed * dt).at;
    g.stride = Math.min(1, distance(start, g.at) / (dt * 4.7));
  }

  private moveCiv(c: Civil, dt: number) {
    if (c.health <= 0 || distance(c.at, this.at) > 58) { c.stride = 0; return; }
    c.fear = Math.max(0, c.fear - dt);
    const target = c.returning ? c.a : c.b;
    if (distance(c.at, target) < .7) c.returning = !c.returning;
    const next = c.fear > 0 && distance(c.at, this.at) < 10 ? angle(this.at, c.at) : angle(c.at, target);
    const [x, z] = forward(next), speed = c.fear > 0 ? 5.25 : 1.59;
    const start = c.at;
    c.at = this.physics.move(start, x * speed * dt, z * speed * dt).at;
    c.yaw = face(c.yaw, next, dt);
    c.stride = Math.min(1, distance(start, c.at) / (dt * 4.5));
  }

  private update(dt: number) {
    this.time += dt;
    this.gun -= dt;
    this.impulse -= dt;
    this.messageTime -= dt;
    this.damageFlash -= dt;
    for (const id of Object.keys(this.cooldown) as Implant[]) this.cooldown[id] = Math.max(0, this.cooldown[id] - dt);
    this.player.previous = this.player.at;
    this.car.previous = this.car.at;
    this.car.lastYaw = this.car.yaw;
    this.updateAim();
    this.controls(dt);
    for (const g of this.guards) { g.previous = g.at; this.moveGuard(g, dt); }
    for (const c of this.civils) { c.previous = c.at; this.moveCiv(c, dt); }
    for (const body of [...this.guards, ...this.civils]) {
      body.hit = Math.max(0, body.hit - dt * 2.9);
      if (body.health <= 0) body.fall = Math.min(1, body.fall + dt * 4.2);
      else if (body.hit > 0) body.fall = Math.min(.3, body.hit * .23);
      else body.fall = 0;
      if (Math.abs(body.momentum[0]) + Math.abs(body.momentum[1]) > .04) {
        body.at = this.physics.move(body.at, body.momentum[0] * dt, body.momentum[1] * dt).at;
        body.momentum = [body.momentum[0] * .90, body.momentum[1] * .90];
      }
    }
    this.detect(dt);
    this.effects.update(dt);
    this.physics.tick();
  }

  private updateAim() {
    const pointer = this.pointer;
    if (!pointer.visible) return;
    this.raycaster.setFromCamera(this.pointerNdc.set(pointer.x / window.innerWidth * 2 - 1, 1 - pointer.y / window.innerHeight * 2), this.camera);
    this.cameraPlane.constant = -(elevation(...this.at) + .96);
    if (this.raycaster.ray.intersectPlane(this.cameraPlane, this.projection)) {
      const { x, z } = this.projection;
      this.aim = [clamp(x, bounds.west, center[0]), clamp(z, bounds.north, center[1])];
    }
  }

  project(at: Point, height = 1.65) {
    return new T.Vector3(at[0], elevation(...at) + height, at[1]).project(this.camera);
  }

  private paint(alpha: number, dt: number) {
    const [x, z] = this.driven ? combine(this.car.previous, this.car.at, alpha) : combine(this.player.previous, this.player.at, alpha);
    const aim = forward(this.car.yaw);
    const lookahead = this.driven ? clamp(this.car.speed * .31, -4, 7.3) : 0;
    const desired = new T.Vector3(x + aim[0] * lookahead, elevation(x, z), z + aim[1] * lookahead - 1.4);
    this.view.lerp(desired, dt > 0 ? 1 - Math.exp(-(this.driven ? 5.2 : 8.2) * dt) : 1);
    if (this.resizeNeeded) {
      this.resizeNeeded = false;
      const w = window.innerWidth, h = window.innerHeight, aspect = w / h;
      const radius = aspect < 1.3 ? 27 : 24;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.30, 1920 / w, 1080 / h));
      this.renderer.setSize(w, h, false);
      Object.assign(this.camera, { left: -radius * aspect, right: radius * aspect, top: radius, bottom: -radius, near: .1, far: 194 });
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.copy(this.view).add(canvasLook);
    this.camera.lookAt(this.view);
    this.camera.updateMatrixWorld();
    const renderActor = (a: Actor) => {
      const p = position(a), q = combine(a.previous, a.at, alpha);
      p.position.set(q[0], elevation(...q), q[1]);
      if (a.model instanceof PersonModel) a.model.pose(a.yaw, a.stride, this.time, a.fall, Math.max(0, a.hit));
      else {
        p.rotation.y = a.yaw;
        p.position.y += a.health > 0 ? Math.sin(this.time * 4) * .12 : -1.32;
      }
    };
    renderActor(this.player);
    position(this.player).visible = !this.driven;
    const car = combine(this.car.previous, this.car.at, alpha);
    this.car.model.position.set(car[0], elevation(...car), car[1]);
    this.car.model.rotation.y = this.car.lastYaw + deltaAngle(this.car.lastYaw, this.car.yaw) * alpha;
    this.city.updateVisibility(x, z, dt);
    for (const g of this.guards) {
      renderActor(g);
      const p = position(g).position;
      p.y += g.spec.drone && g.stunned > 0 ? -.64 : 0;
      g.cone.visible = g.health > 0 && g.stunned <= 0;
      g.cone.position.set(p.x, elevation(p.x, p.z) + .085, p.z);
      g.cone.rotation.y = g.yaw;
      g.cone.material.uniforms.strength.value = g.sight > .85 ? 2.4 : .72 + g.sight;
    }
    for (const c of this.civils) renderActor(c);
    for (const cam of this.cameras) {
      const active = this.cameraEnabled(cam);
      cam.cone.visible = active;
      cam.cone.rotation.y = cam.yaw;
      cam.cone.position.set(cam.spec.at[0], elevation(...cam.spec.at) + .09, cam.spec.at[1]);
      cam.cone.material.uniforms.strength.value = cam.charge > .95 ? 2.7 : 1.12 + cam.charge;
      cam.view.pivot.rotation.y = cam.yaw;
      cam.view.pivot.visible = active;
    }
    if ((this.running && !this.paused) || dt === 0) this.renderer.render(this.scene, this.camera);
    this.sound.update(this.driven, this.car.speed, this.running && !this.paused);
    this.onFrame(this);
  }

  private readonly animate = (now: number) => {
    const dt = clamp((now - this.frame) / 1000, 0, .10);
    this.frame = now;
    if (this.running && !this.paused) {
      this.accumulator = Math.min(.12, this.accumulator + dt);
      while (this.accumulator >= step && !this.paused) {
        this.accumulator -= step;
        this.update(step);
      }
      this.paint(this.accumulator / step, dt);
    } else {
      this.accumulator = 0;
      if (this.resizeNeeded) this.paint(1, 0);
      this.sound.update(this.driven, this.car.speed, false);
    }
    requestAnimationFrame(this.animate);
  };
}
