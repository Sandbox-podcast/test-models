import * as T from 'three';
import {
  bounds, carSpawn, chip, clamp, distance, districtAt, elevation, exchange,
  garage, gates, inRect, onTunnelStairs, patrols, rooms, sensors, spawn, type Point, type Patrol, type Sensor,
} from './level';
import { insideCity, Physics, step, type Contact } from './physics';
import { City, Effects, makeCamera, makeCar, makeDrone, PersonModel, sightCone, type CarModel, type CarSide } from './visuals';
import { furniture } from './furniture';
import { civilFlows, populationPeriod, type CivilFlow } from './population';
import { Traffic } from './traffic';
import { places as p } from './places';
import { Sound } from './sound';
import { startingAmmo, weaponIds, weapons, type WeaponId } from './arsenal';
import { showroom, streetVehicles, vehicleClasses, vehicleIds, type VehicleClass, type VehicleId } from './fleet';
import { Lighting } from './lighting';
import { onStreet } from './roads';
import { homes, venues, type HomeId, type VenueId } from './venues';
import { Pursuit } from './pursuit';
import { activityIds, activitySpec, type ActivityId, type ActivityRun } from './activities';
import {
  effects, finishSide as awardSide, getSide, implants, nadiaPlateau, newGame, objectives,
  readSave, sideAvailable, sideIds, writeSave, type ActionStep, type BlackmailChoice,
  type Chapter, type Ending, type Implant, type Route, type Save, type SideId,
} from './progression';

type Intent = 'garage' | 'brief' | 'progress' | 'offers' | 'offer' | 'sorel' | 'ada' | 'dialogue' | 'car' | 'venue' | 'activity';
type Interaction = { action:Intent; at:Point; label:string; range?:number; side?:SideId; person?:string; vehicle?:string; venue?:VenueId };
export type Pin = { at:Point; label:string; kind:'goal'|'route'|'car' };
export type Objective = { name:string; text:string; pins:Pin[] };
export type Menu = 'garage'|'brief'|'offer'|'offers'|'route'|'ending'|'failed'|'epilogue'|'dialogue'|'side-choice'|'venue'|'arsenal'|'activities'|'activity';
type DrivenVehicle = {
  id:string; name:string; kind:VehicleClass; owned?:VehicleId; bay:Point; facing:number;
  at:Point; previous:Point; yaw:number; lastYaw:number; speed:number; model:CarModel;
};
const createVehicle=(id:string, kind:VehicleClass, at:Point, yaw:number, color?:string, name?:string, owned?:VehicleId):DrivenVehicle=>({
  id,name:name??vehicleClasses[kind].name,kind,owned,bay:at,facing:yaw,at,previous:at,yaw,lastYaw:yaw,speed:0,
  model:makeCar(color??vehicleClasses[kind].color,kind),
});
type Actor = { at:Point; previous:Point; yaw:number; health:number; hit:number; fall:number; model:PersonModel|T.Group; stride:number; momentum:Point };
type Guard = Actor & {
  spec: Patrol; cone: ReturnType<typeof sightCone>; state:'patrol'|'investigate'|'pursue'|'search';
  routeIndex:number; path:Point[]; destination?:Point; timer:number; sight:number; gun:number; repath:number; stunned:number;
  searchOrigin?:Point; searchIndex:number;
};
type Civil = Actor & {
  flow:CivilFlow; seed:number; start:Point; startNext:number; direction:number; next:number; wait:number; fear:number;
  period:ReturnType<typeof populationPeriod>; route:Point[]; detour:Point[]; stalled:number; farTick:number;
  changed:boolean;
};
type CameraSensor = { spec: Sensor; view: ReturnType<typeof makeCamera>; cone: ReturnType<typeof sightCone>; charge: number; disabled: number; yaw: number };
type Observer = 'camera' | 'guard' | 'drone';
const canvasLook = new T.Vector3(0, 56, 29);
const initialYaw = Math.PI;
const center: Point = [bounds.east, bounds.south];
const recoveryFallback:Point[]=[spawn,[-26,23],[-22,23],[-20,23],[-15,23],[-25,9],
  ...Array.from({length:41},(_,i)=>[-45+i*2,2] as Point)];
const publicService:Point[]=[[184.8,8.1],[190.4,9.6],[195.4,10.4],[197.3,11.3]];
const redeployedWorkers:Point[]=[[199,-6.8],[210.1,-6.9],[216.1,-7.2],[219.8,-5.6]];
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
const impactSide = (yaw: number, dx: number, dz: number): CarSide => {
  const lateral = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  const lengthwise = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  return Math.abs(lateral) > Math.abs(lengthwise) ? (lateral > 0 ? 'right' : 'left') : (lengthwise > 0 ? 'front' : 'rear');
};

export class Game {
  readonly scene = new T.Scene();
  readonly camera = new T.OrthographicCamera();
  readonly renderer: T.WebGLRenderer;
  readonly physics = new Physics();
  readonly police = new Pursuit(this.scene,this.physics);
  readonly city = new City(this.scene);
  readonly lighting = new Lighting(this.scene);
  readonly traffic = new Traffic(this.scene, this.physics);
  readonly sound = new Sound();
  readonly effects = new Effects(this.scene);
  readonly player = actor(spawn, new PersonModel('#9ccc79', 'player'));
  private readonly starter=createVehicle('player-car','sedan',carSpawn,initialYaw,undefined,'Voiture de Mina');
  private readonly fleet=new Map<string,DrivenVehicle>();
  private selectedCar=this.starter;
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
  policeArrested=false;
  stage = 0;
  selectedSide: SideId = 'U01';
  dialoguePerson = 'Inès';
  venueId:VenueId='armory';
  destination?:Pin;
  activity:ActivityRun|null=null;
  activityId:ActivityId='sprint';
  private crimeReported=-100;
  private readonly activityMarker: T.Group;
  private readonly activityStarts=new Map<ActivityId,T.Group>();
  private readonly shuttlePassenger=home('#9ce4c1',[109,17.6]);
  routeContact: Route = 'collective';
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
  private lastVehicleContact?: string;
  private clearanceSinceContact = 0;
  private gun = 0;
  reloadLeft = 0;
  private dryFire=false;
  private safeFoot:Point[]=[spawn];
  private recoveryClock=0;
  private heat = -100;
  private alarm = false;
  private readonly hacked = new Set<string>();
  private readonly gateState = new Map<string,boolean>();
  private readonly escort = actor(p.ines,new PersonModel('#d2af83','contact'));
  private escortActive = false;
  private escortWait = 0;
  private escortPath: Point[] = [];
  private escortClock = 0;
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
  private readonly nadiaPlateau = home('#8ed2a6',p.plateauNadia);
  private readonly objectMarkers = new Map<string,{group:T.Group; at:Point}>();
  private readonly communityDesk = home('#97dcaf',p.communityDesk);

  constructor(readonly canvas: HTMLCanvasElement, readonly onMenu: (menu: Menu) => void, readonly onFrame: (game: Game) => void) {
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor('#111c26');
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene.fog = new T.Fog('#263b4d', 79, 170);
    this.scene.add(position(this.player),this.mina,this.minaExchange,this.nadiaPlateau,this.communityDesk,
      position(this.escort),home('#a4c6e7',p.recordsSorel),home('#9bd3a7',p.nadia),home('#a1c6f6',p.sorel),
      home('#a1c6f6',p.plateauSorel),home('#bc85a7',p.lise),home('#d69b85',p.keeper),
      home('#c9b49b',p.paperOwner),home('#c8ab91',p.varenne));
    const cars=[this.starter,...streetVehicles.map(v=>createVehicle(v.id,v.kind,v.at,v.yaw,v.tint,v.name)),
      ...vehicleIds.map(id=>{const v=showroom[id];return createVehicle(id,v.kind,v.at,v.yaw,undefined,v.name,id);})];
    for (const car of cars) {
      this.scene.add(car.model);
      this.fleet.set(car.id,car);
      this.physics.addVehicle(car.id,car.at,car.yaw,car.kind);
    }
    for(const id of activityIds){
      const group=this.makeActivityMarker(1.25,'#efb478'), {start}=activitySpec(id);
      group.position.set(start[0],elevation(...start)+.065,start[1]);
      this.scene.add(group);this.activityStarts.set(id,group);
    }
    this.activityMarker=this.makeActivityMarker(2.5,'#fae18c');
    this.scene.add(this.activityMarker,this.shuttlePassenger);
    for (const venue of venues) {
      if(venue.kind==='home') continue;
      const [x,z]=venue.use;
      const actor=home(venue.accent,[x,z-2.95]);
      this.scene.add(actor);
      if(venue.id==='market') this.marketHost=actor;
    }
    const terminals = [
      ['chip',chip,'#e8eea2'],['calendar',p.calendar,'#f5d199'],['portico',p.portico,'#9fd0be'],
      ['audit',p.audit,'#8ac9cd'],['register',p.register,'#9ce2cf'],
      ['nadiaConsole',p.nadiaConsole,'#a7e6bf'],['sorelConsole',p.sorelConsole,'#abcfff'],
      ['purge',p.restoredConsole,'#f2c686'],['command',p.commander,'#bcd5f1'],
      ['module',p.module,'#eac392'],['servicePanel',p.servicePanel,'#8edfae'],
      ['residentLog',p.residentLog,'#e5cfaa'],['blackmail',p.blackmail,'#d2a5c2'],
      ['paper',p.paper,'#e7c493'],['nightExit',p.lastGate,'#8fe2c7'],['sideItem',p.contracts,'#dec999'],
      ['board',p.contracts,'#eac98b'],
    ] as const;
    for (const [kind,at,color] of terminals) {
      const group=new T.Group();
      group.position.set(at[0],elevation(at[0],at[1]),at[1]);
      const plinth=new T.Mesh(new T.BoxGeometry(1.06,.94,.69),new T.MeshStandardMaterial({color:'#344654',metalness:.45,roughness:.56}));
      plinth.position.y=.47;
      const panel=new T.Mesh(new T.BoxGeometry(.83,.13,.56),new T.MeshBasicMaterial({color}));
      panel.position.y=.994;
      group.add(plinth,panel);
      this.scene.add(group);
      this.objectMarkers.set(kind,{group,at});
      this.physics.addProp('terminal-'+kind,[at[0],at[1],1.06,.69],.94);
    }
    for (const spec of patrols) {
      const model = spec.drone ? makeDrone() : new PersonModel('#c08372', 'guard');
      const cone = sightCone(spec.drone ? 11 : 8.2, spec.drone ? 4.4 : 3.2, '#f59d72');
      const a = actor(spec.at, model);
      this.scene.add(position(a), cone);
      this.guards.push({ ...a, spec, cone, state: 'patrol', routeIndex: 0, path: [], timer: 0, sight: 0, gun: .8, repath: 0, stunned: 0, searchIndex: 0 });
    }
    const clothes = ['#9dbeaa','#b58373','#7a8cbb','#b9a66e','#83aaa7','#b281a2','#b3b8af','#6d8799'];
    for (const flow of civilFlows) {
      for(let i=0;i<flow.count;i++){
        const lane=(i+.24)/flow.count*(flow.route.length-1), section=Math.floor(lane);
        const seed=this.civils.length, start=combine(flow.route[section],flow.route[section+1],lane-section);
        const person=actor(start,new PersonModel(clothes[seed%clothes.length],'civil'));
        this.scene.add(position(person));
        this.civils.push({ ...person, flow, seed, start, startNext:section+1, direction:1, next:section+1, wait:i%2?.70+i*.25:0,
          fear:0,period:'morning',route:flow.route,detour:[],stalled:0,farTick:0,changed:false });
      }
    }
    for (const spec of sensors) {
      const view = makeCamera(), cone = sightCone(13.8, 4.9, '#ffd473');
      view.root.position.set(spec.at[0], elevation(...spec.at), spec.at[1]);
      this.scene.add(view.root, cone);
      this.cameras.push({ spec, view, cone, charge: 0, disabled: 0, yaw: spec.angle });
    }
    this.resetScene();
    window.addEventListener('resize', () => { this.resizeNeeded = true; });
    this.frame = performance.now();
    requestAnimationFrame(this.animate);
  }

  private marketHost?:T.Group;
  get car(){return this.selectedCar;}
  get at() { return this.driven ? this.car.at : this.player.at; }
  get venue(){return venues.find(venue=>venue.id===this.venueId)!;}
  get weapon(){return weapons[this.save.arsenal.equipped];}
  get ammo(){return this.save.arsenal.ammo[this.save.arsenal.equipped]!;}
  get received() { return this.save.chapter > 1; }
  get active() { return this.save.checkpoint === this.save.chapter && !this.save.ending; }
  get busy() { return this.active || this.save.side !== null || this.activity!==null; }
  get loot() { return this.stage > 0; }
  get offerIds() { return sideIds.filter(id=>sideAvailable(this.save,id)); }
  get missionContact() {
    return this.save.chapter===5 && this.save.route==='collective'
      ? {at:p.plateauNadia,contact:'Nadia Keita'} : objectives[this.save.chapter];
  }
  get purgeClock() {
    const remaining=330-Math.max(0,Math.floor(this.time-this.purgeStart));
    const next=remaining<=0?0:remaining;
    return String(Math.floor(next/60)).padStart(2,'0')+':'+String(next%60).padStart(2,'0');
  }
  private purgeStart = 0;
  get dossier() { return getSide(this.save,this.selectedSide); }
  private get currentStep():ActionStep|undefined {
    if(this.save.side) return getSide(this.save,this.save.side).steps[this.stage];
    if(!this.active) return;
    if(this.save.chapter===5 && this.stage===0 && this.save.route==='collective') return nadiaPlateau;
    return objectives[this.save.chapter].steps[this.stage];
  }
  get pursuing() { return this.guards.some(g => g.health > 0 && (g.state === 'pursue' || g.state === 'search')); }
  get availableImplants(): Implant[] { return this.save.route ? ['intrusion', 'decoy', 'overload'] : ['intrusion', 'decoy']; }

  start() {
    this.running = true;
    this.pause(false);
    this.persist();
    void this.sound.enable().catch(() => undefined);
    if (this.busy) this.notice('Reprise au garage. Le contrat repart de son premier objectif.');
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

  private availableCar(car:DrivenVehicle) { return !car.owned||this.save.vehicles.includes(car.owned); }

  markVenue(id:VenueId) {
    const venue=venues.find(v=>v.id===id)!;
    this.destination=waypoint(venue.entrance,venue.name,'route');
  }

  private makeActivityMarker(radius:number,tint:string){
    const group=new T.Group();
    const ring=new T.Mesh(new T.RingGeometry(radius-.14,radius,40),new T.MeshBasicMaterial({color:tint,transparent:true,opacity:.86,depthWrite:false}));
    ring.rotation.x=-Math.PI/2;
    const pin=new T.Mesh(new T.OctahedronGeometry(.26),new T.MeshBasicMaterial({color:tint}));
    pin.position.y=1.15;
    group.add(ring,pin);
    return group;
  }

  get activityStop(){return this.activity?activitySpec(this.activity.id).stops[this.activity.step]:undefined;}
  get activityRemaining(){return this.activity?Math.max(0,activitySpec(this.activity.id).time-(this.time-this.activity.started)):0;}
  get nearbyActivity(){
    if(this.busy) return;
    return activityIds.find(id=>{
      const spec=activitySpec(id);
      return distance(this.at,spec.start)<(this.driven?6:3.5)&&Math.abs(elevation(...this.at)-elevation(...spec.start))<1.9;
    });
  }

  markActivity(id:ActivityId){
    const spec=activitySpec(id);
    this.destination=waypoint(spec.start,spec.name,'route');
  }

  activitiesMenu(){
    if(!this.running||this.paused||this.failed) return;
    const id=this.activity?.id??this.nearbyActivity;
    if(id) this.showActivity(id);
    else this.onMenu('activities');
  }

  showActivity(id:ActivityId){
    this.activityId=id;this.onMenu('activity');
  }

  canStartActivity(id:ActivityId){
    return this.nearbyActivity===id && this.driven===activitySpec(id).vehicle && (!this.driven||Math.abs(this.car.speed)<3.2) && !this.police.level;
  }

  startActivity(id:ActivityId){
    if(!this.canStartActivity(id)) return;
    this.activity={id,step:0,started:this.time,stationary:0,condition:100,car:this.driven?this.car.id:null};
    this.destination=undefined;
    this.sound.beep(625,.21,.16,866);
    this.notice(activitySpec(id).name+' · départ');
  }

  cancelActivity(message='Activité abandonnée.'){
    if(!this.activity) return;
    this.activity=null;this.notice(message);
  }

  private advanceActivity(){
    const run=this.activity;
    if(!run) return;
    const spec=activitySpec(run.id),at=spec.stops[run.step].at;
    this.effects.pulse(at,run.id==='photos'?'#a8ddff':'#ffdf96',.58);
    this.sound.beep(645+run.step*24,.19,.11);
    run.step++;run.stationary=0;
    if(run.step<spec.stops.length){this.notice(spec.stops[run.step].label,1.9);return;}
    this.activity=null;
    const seconds=Math.max(.01,Math.round((this.time-run.started)*100)/100);
    const older=this.save.activities[run.id], best=Math.min(older?.best??Infinity,seconds);
    this.save.activities[run.id]={count:(older?.count??0)+1,best};
    const bonus=spec.cargo?Math.round(75*run.condition/100):0;
    this.save.credits+=spec.reward+bonus;
    this.persist();
    this.notice(`${spec.name} terminé · +${spec.reward+bonus} ₡${best===seconds&&spec.time?' · Meilleur temps '+seconds.toFixed(1)+' s':''}`,5.5);
  }

  private updateActivity(dt:number){
    const run=this.activity,stop=this.activityStop;
    if(!run||!stop||this.failed) return;
    if(activitySpec(run.id).time&&!this.activityRemaining){this.cancelActivity('Temps écoulé. Relancez l’activité au départ.');return;}
    if(stop.kind==='use') return;
    const eligible=this.driven&&this.car.id===run.car&&distance(this.at,stop.at)<(stop.kind==='pass'?4.1:3.55)
      &&Math.abs(elevation(...this.at)-elevation(...stop.at))<1.65;
    if(eligible&&stop.kind==='pass'){this.advanceActivity();return;}
    run.stationary=eligible&&Math.abs(this.car.speed)<1.6?run.stationary+dt:0;
    if(run.stationary>=.95) this.advanceActivity();
  }

  equipWeapon(id:WeaponId) {
    if(!this.save.arsenal.ammo[id]||id===this.save.arsenal.equipped) return;
    this.save.arsenal.equipped=id;
    this.reloadLeft=0;
    this.gun=.18;
    this.persist();
  }

  cycleWeapon() {
    if(this.driven||this.failed||this.paused) return;
    const owned=weaponIds.filter(id=>this.save.arsenal.ammo[id]);
    this.equipWeapon(owned[(owned.indexOf(this.save.arsenal.equipped)+1)%owned.length]);
  }

  reload() {
    if(this.driven||this.paused||this.failed||this.reloadLeft>0||this.ammo.loaded===this.weapon.magazine) return;
    if(!this.ammo.spare){this.notice('Réserve épuisée. Retrouvez des munitions au Comptoir Impulsion.');return;}
    this.reloadLeft=this.weapon.reload;
    this.sound.beep(238,.17,.08,328);
  }

  private pay(price:number) {
    if(this.save.credits<price){this.notice('Crédits insuffisants.');return false;}
    this.save.credits-=price;
    return true;
  }

  buyWeapon(id:WeaponId) {
    if(this.venueId!=='armory'||this.save.arsenal.ammo[id]||!this.pay(weapons[id].price)) return;
    this.save.arsenal.ammo[id]=startingAmmo(id);
    this.equipWeapon(id);
    this.notice(weapons[id].name+' acheté et équipé.');
  }

  buyAmmo(id:WeaponId) {
    const spec=weapons[id],ammo=this.save.arsenal.ammo[id];
    if(this.venueId!=='armory'||!ammo||ammo.spare===spec.reserve||!this.pay(spec.ammoPrice)) return;
    ammo.spare=Math.min(spec.reserve,ammo.spare+spec.box);
    this.persist();
    this.notice('Réserve de '+spec.name+' réapprovisionnée.');
  }

  buyVehicle(id:VehicleId) {
    const car=this.fleet.get(id);
    if(this.venueId!=='dealership'||!car||this.save.vehicles.includes(id)) return;
    const delivery=this.deliverySpot(car);
    if(!delivery){this.notice('Le parvis est encombré. Libérez une place de livraison.');return;}
    if(!this.pay(showroom[id].price)) return;
    this.save.vehicles.push(id);
    this.parkAt(car,delivery);
    this.persist();
    this.markVehicle(car);
  }

  collectVehicle(id:VehicleId) {
    const car=this.fleet.get(id);
    if(this.venueId!=='dealership'||this.driven||!car||!this.save.vehicles.includes(id)) return;
    const delivery=this.deliverySpot(car);
    if(delivery){this.parkAt(car,delivery);car.model.resetDamage();}
    this.markVehicle(car);
  }

  private markVehicle(car:DrivenVehicle) {
    this.destination=waypoint(car.at,car.name,'car');
    this.notice(car.name+' · emplacement indiqué sur la carte.');
  }

  private deliverySpot(car:DrivenVehicle) {
    const [x,z]=car.bay;
    const candidates:Point[]=[car.bay,[x-4.5,z],[x+4.5,z],[x,z-3.2],[x,z+3.2],[x-5,z+2.8],[x+5,z+2.8]];
    return candidates.find(at=>!onStreet(...at)&&this.physics.canTurn(at,car.facing,car.kind,car.id)
      &&this.physics.exitVehicle(at,car.facing,car.kind,car.id));
  }

  private parkAt(car:DrivenVehicle,at:Point) {
    Object.assign(car,{at,previous:at,yaw:car.facing,lastYaw:car.facing,speed:0});
    this.physics.placeVehicle(car.id,at,car.yaw,true);
    this.physics.tick();
  }

  buyHome(id:HomeId) {
    const home=homes.find(h=>h.id===id);
    if(!home||this.venueId!==id||this.save.properties.includes(id)||!this.pay(home.price)) return;
    this.save.properties.push(id);
    this.updateGates();
    this.persist();
    this.notice(home.name+' achetée. La porte est ouverte.');
  }

  restHome(id:HomeId) {
    const home=homes.find(h=>h.id===id);
    if(!home||!this.save.properties.includes(id)||distance(this.at,home.use)>2.45) return;
    this.health=100;
    this.save.residence=id;
    this.persist();
    this.notice('Intégrité restaurée. Point de reprise en ville libre enregistré.');
  }

  buyMeal() {
    if(this.venue.kind!=='public'||this.health>=100||!this.pay(18)) return;
    this.health=Math.min(100,this.health+38);
    this.persist();
    this.notice('Repas servi. Intégrité +38 au maximum.');
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
    if (this.busy || (which!=='main'&&!sideAvailable(this.save,which))) return;
    this.save.tracking=which;
    this.persist();
  }

  accept() {
    if (this.busy || this.save.ending) return;
    this.stage=0;
    this.save={...this.save,checkpoint:this.save.chapter,tracking:'main'};
    this.health=100;
    if(this.save.chapter>=5) this.purgeStart=this.time;
    this.refreshWorld();
    this.persist();
    this.sound.beep(503,.23,.18,733);
    this.notice('Mission acceptée. Le journal indique les accès connus.');
  }

  acceptSide(id:SideId) {
    if (this.busy || !sideAvailable(this.save,id)) return;
    this.stage=0;
    this.save={...this.save,side:id,tracking:id};
    this.refreshWorld();
    this.persist();
    this.notice(getSide(this.save,id).name+' · Contrat accepté.');
  }

  selectSide(id:SideId) {
    if(!sideAvailable(this.save,id)||this.busy) return;
    this.selectedSide=id;
    this.onMenu('offer');
  }

  finishRoute(route: Route) {
    if(!this.active||this.save.chapter!==4||this.currentStep?.kind!=='choice') return;
    this.save={...this.save,route};
    this.completeMission(effects[route].now+' Surcharge est disponible au garage.');
  }

  finishEnding(ending: Ending) {
    if(!this.active||this.save.chapter!==6||this.currentStep?.kind!=='choice') return;
    this.save={...this.save,ending};
    this.completeMission(effects[ending].now);
    this.onMenu('epilogue');
  }

  finishBlackmail(choice:BlackmailChoice) {
    if(this.save.side!=='U03'||this.currentStep?.kind!=='choice') return;
    this.completeSide('U03',choice);
  }

  retry(abandon:boolean) {
    if(abandon) this.save={...this.save,checkpoint:null,side:null,tracking:'main'};
    this.resetScene();
    this.persist();
    this.notice(abandon?'De retour en ville libre.':'Point de reprise au garage.');
  }

  private resetScene() {
    this.activity=null;
    this.police.reset();
    this.crimeReported=-100;
    const property=homes.find(home=>home.id===this.save.residence);
    const start=this.busy||!property?spawn:property.use;
    Object.assign(this.player, { at:start, previous:start, yaw:initialYaw, health:100, hit:0, fall:0, momentum:[0,0] });
    this.selectedCar=this.starter;
    this.safeFoot=[spawn,start];
    this.recoveryClock=0;
    this.destination=undefined;
    this.lastVehicleContact = undefined;
    this.clearanceSinceContact = 0;
    for (const car of this.fleet.values()) {
      Object.assign(car,{at:car.bay,previous:car.bay,yaw:car.facing,lastYaw:car.facing,speed:0});
      car.model.resetDamage();
      this.physics.placeVehicle(car.id,car.at,car.yaw,this.availableCar(car));
    }
    this.traffic.reset();
    this.city.resetProps();
    for (const prop of furniture) this.physics.setProp(prop.id, true);
    this.driven = false;
    this.failed = false;
    this.policeArrested=false;
    this.stage = 0;
    this.health = 100;
    this.safeFor = 5;
    this.confirmed = false;
    this.observation = 0;
    this.observer = null;
    this.heat = -100;
    this.alarm = false;
    this.hacked.clear();
    this.gateState.clear();
    this.escortActive=false;
    this.escortWait=0;
    this.escortPath=[];
    this.escortClock=0;
    this.purgeStart=this.time;
    this.cooldown = { intrusion: 0, decoy: 0, overload: 0 };
    this.damageFlash = 0;
    this.gun = 0;
    this.reloadLeft=0;
    this.dryFire=false;
    this.lighting.reset();
    this.effects.clear();
    this.view.set(start[0], elevation(...start), start[1] - 1.8);
    this.physics.tick();
    for (const g of this.guards) Object.assign(g, {
      at: g.spec.at, previous: g.spec.at, yaw: angle(g.spec.at, g.spec.route[1]), health: 100, hit: 0, fall: 0, state: 'patrol',
      routeIndex: 0, path: [], destination: undefined, timer: 0, sight: 0, repath: 0, stunned: 0, searchIndex: 0,
      momentum: [0, 0], gun: .8,
    });
    for (const c of this.civils) {
      const next=c.startNext;
      Object.assign(c,{at:c.start,previous:c.start,health:100,hit:0,fall:0,direction:1,next,wait:c.seed%4*.42,
        fear:0,momentum:[0,0],period:'morning',route:c.flow.route,detour:[],stalled:0,farTick:0,changed:false});
    }
    for (const s of this.cameras) Object.assign(s, { charge: 0, disabled: 0 });
    this.refreshWorld();
    this.paint(1, 0);
  }

  private endSequence() {
    this.stage=0;
    this.alarm=false;
    this.escortActive=false;
    this.refreshWorld();
    this.persist();
    this.sound.beep(678,.4,.13,1010);
  }

  private completeMission(result?:string) {
    const id=this.save.chapter, award=objectives[id].reward;
    this.save={...this.save,chapter:Math.min(6,id+1) as Chapter,checkpoint:null,credits:this.save.credits+award,tracking:'main'};
    this.endSequence();
    const notices:Partial<Record<Chapter,string>>={
      1:'Puce remise. Le passage de service est ouvert. Mina a du travail à l’atelier.',
      2:'La purge vise la résidence haute. Nadia vous attend à La Dalle.',
      3:'Le journal confirme le bordereau. Deux quêtes s’ouvrent à La Dalle.',
      5:'Le poste affiche l’horloge de purge. Sorel veut vous parler.',
    };
    this.notice((result??notices[id]??'Mission terminée.')+' +'+award+' ₡',6);
  }

  private completeSide(id:SideId,choice?:BlackmailChoice) {
    const quest=getSide(this.save,id), next=awardSide(this.save,id,choice);
    if(next===this.save) return;
    this.save=next;
    this.endSequence();
    this.notice(quest.result+' +'+quest.reward+' ₡',6);
  }

  private updateGates() {
    const {chapter,route,ending,completed}=this.save;
    const recordsShift=this.time%28;
    const northernShift=this.time%23;
    const open:Record<string,boolean>={
      'depot-gate':false,
      service:this.received,
      'records-front':chapter>2 || (chapter===2&&recordsShift>=6&&recordsShift<24.5),
      'records-side':chapter>2,
      gallery:route==='collective'||ending==='publish',
      community:route==='collective'||ending==='publish',
      badge:route==='sorel'||ending==='protect',
      'shop-door':completed.includes('U03'),
      'residence-court':completed.includes('U02'),
      'paper-way':completed.includes('U04'),
      'night-exit':completed.includes('U05'),
      'night-passage':!!ending || (chapter===6&&northernShift>=5&&northernShift<15),
      'venue-market':populationPeriod(this.time)!=='evening'||inRect(...this.at,venues.find(v=>v.id==='market')!.area,.85),
    };
    for(const home of homes) open['venue-'+home.id]=this.save.properties.includes(home.id);
    for(const gate of gates){
      const wanted=!!open[gate.id] || this.hacked.has(gate.id);
      const staysOpen=this.gateState.get(gate.id) && inRect(...this.at,gate.area,this.driven?2:.5);
      const active=wanted||!!staysOpen;
      if(this.gateState.get(gate.id)===active) continue;
      this.gateState.set(gate.id,active);
      this.physics.setGate(gate.id,active);
      this.city.gateMeshes.get(gate.id)!.visible=!active;
    }
  }

  private refreshWorld() {
    this.updateGates();
    this.minaExchange.visible=this.active&&this.save.chapter===1&&this.stage===1;
    this.nadiaPlateau.visible=this.save.route==='collective';
    this.communityDesk.visible=this.save.ending==='publish';
    this.city.setStoryLights(this.save.completed.includes('U01'),this.save.completed.includes('U04'),this.save.ending);
    const step=this.currentStep;
    for(const [kind,marker] of this.objectMarkers) {
      const isGoal=kind===step?.signal;
      const visible=isGoal || (kind==='chip'&&!this.received&&this.stage===0) || (kind==='board'&&this.received);
      if(kind==='sideItem'&&isGoal) {
        marker.at=step!.at;
        marker.group.position.set(marker.at[0],elevation(...marker.at),marker.at[1]);
        this.physics.placeProp('terminal-'+kind,marker.at,.94);
      }
      marker.group.visible=visible;
      this.physics.setProp('terminal-'+kind,visible);
    }
    const waitingEscort=this.save.side==='C04' && this.stage===0;
    position(this.escort).visible=this.escortActive || waitingEscort || this.save.chapter>=3;
    if(!this.escortActive){
      const spot=waitingEscort&&step ? step.at : this.save.completed.includes('U02') ? [116.2,13.9] as Point : p.ines;
      this.escort.at=this.escort.previous=spot;
    }
  }

  objective(): Objective {
    const {chapter,side,tracking,ending,route}=this.save;
    const goal=(name:string,text:string,at:Point,label:string,others:Pin[]=[]):Objective=>({name,text,pins:[waypoint(at,label),...others]});
    const run=this.activity,stop=this.activityStop;
    if(run&&stop){
      const job=activitySpec(run.id);
      const status=stop.kind==='park'?' · Arrêtez-vous dans la zone':stop.kind==='use'?' · E à pied':'';
      const cargo=job.cargo&&run.step>0?` · Colis ${run.condition} %`:'';
      return goal(job.name,`${run.step+1}/${job.stops.length} · ${stop.label}${status}${cargo}`,stop.at,stop.label);
    }
    const step=this.currentStep;
    if(step){
      const name=side?getSide(this.save,side).name:objectives[chapter].name;
      let routes=step.routes?.map(entry=>waypoint(entry.at,entry.label,'route'))??[];
      if(!side&&chapter===1&&this.stage===0) {
        const inCourtyard=inRect(...this.at,[6.5,-28,21,20]);
        routes[1]=inCourtyard?routes[1]:waypoint([4.7,-23.4],'Cour latérale','route');
        routes.push(waypoint(p.escapeParking,'Parking de fuite','route'));
      }
      if(!side&&chapter===6) routes.push(route==='collective'
        ?waypoint([178.8,-29],'Couloir communautaire','route')
        :waypoint([192.5,-13.3],'Couloir du vestibule','route'));
      return goal(name,step.text,step.at,step.label,routes);
    }
    if(tracking!=='main'&&sideAvailable(this.save,tracking)){
      const q=getSide(this.save,tracking);
      return goal(q.name,'Rencontrer '+q.contact,q.at,q.contact);
    }
    if(ending) return {name:'Ville libre',text:effects[ending].later,pins:[]};
    const contact=this.missionContact;
    return goal(objectives[chapter].name,'Parler à '+contact.contact,contact.at,contact.contact,
      chapter===1?[waypoint(carSpawn,'Voiture','car')]:[]);
  }

  interaction(): Interaction | undefined {
    if(this.driven) return {action:'car',at:this.at,label:Math.abs(this.car.speed)>2.2?'Freinez pour descendre':'Descendre de la voiture',vehicle:this.car.id};
    const {chapter,side,ending}=this.save;
    const list:Interaction[]=[
      {action:'garage',at:garage,label:'Parler à Mina',range:3.25},
    ];
    if(this.nearbyActivity){const job=activitySpec(this.nearbyActivity);list.push({action:'activity',at:job.start,label:job.name,range:3.5});}
    const stop=this.activityStop;
    if(stop?.kind==='use') list.unshift({action:'activity',at:stop.at,label:stop.label,range:2.75});
    for(const car of this.fleet.values()) if(this.availableCar(car)&&distance(this.at,car.at)<3.4) {
      list.push({action:'car',at:car.at,label:car===this.starter?'Prendre la voiture':'Conduire · '+car.name,range:3.25,vehicle:car.id});
    }
    for(const venue of venues){
      const [x,z]=venue.entrance;
      if(venue.kind==='home'&&!this.save.properties.includes(venue.id)) {
        list.push({action:'venue',at:[x,z+venue.side*.42],label:'Visiter l’annonce · '+venue.name,venue:venue.id,range:2.7});
      } else if(venue.id==='market'&&populationPeriod(this.time)==='evening'&&!inRect(...this.at,venue.area)) {
        list.push({action:'venue',at:[x,z+.42],label:'Halle fermée · voir les horaires',venue:venue.id,range:2.45});
      } else if(inRect(...this.at,venue.area,-.30)) {
        list.push({action:'venue',at:venue.use,label:venue.kind==='home'?'Se reposer':venue.name,venue:venue.id,range:2.4});
      }
    }
    const task=this.currentStep;
    if(task){
      const label=task.kind==='delivery'&&this.safeFor<5?'Attendre la fin de la détection'
        : task.kind==='escort'&&distance(this.escort.at,task.at)>3.3?'Attendre la personne accompagnée':task.label;
      list.unshift({action:'progress',at:task.at,label,range:task.kind==='delivery'?3.25:2.6});
      if(chapter===4 && this.active && task.kind==='choice') list.push({action:'sorel',at:p.sorel,label:'Confier le registre à Sorel'});
      if(side==='U03' && this.stage===0&&!this.hacked.has('shop-door')){
        list.push({action:'ada',at:p.keeper,label:'Demander l’accès à Ada'});
      }
    } else {
      const contact=this.missionContact;
      if(!ending && chapter!==1) list.push({action:'brief',at:contact.at,label:'Parler à '+contact.contact});
      if(this.received) list.push({action:'offers',at:p.contracts,label:'Voir les offres des relais'});
      for(const id of this.offerIds){
        if(id[0]==='C') continue;
        const q=getSide(this.save,id);
        if(id===this.save.tracking || distance(q.at,garage)>.5)
          list.push({action:'offer',at:q.at,label:q.name,side:id,range:2.9});
      }
    }
    if(chapter>=3&&!this.escortActive&&!this.save.completed.includes('U02')) list.push({action:'dialogue',at:p.ines,label:'Parler à Inès',person:'Inès'});
    if(this.save.records) list.push({action:'dialogue',at:p.lise,label:'Parler à Lise',person:'Lise Marec'});
    if(ending) list.push({action:'dialogue',at:p.varenne,label:'Parler à Varenne',person:'Élias Varenne'});
    if(ending==='publish') list.push({action:'dialogue',at:p.communityDesk,label:'Demander un accès provisoire',person:'Relais de quartier'});
    const reachable=list.filter(i=>distance(i.at,this.at)<=(i.range??2.65)
      && this.physics.ray(this.at,i.at,1.3,1.4,i.vehicle)>.89);
    return reachable.find(i=>i.action==='progress'||i.action==='activity'&&stop?.kind==='use') ?? reachable.find(i=>i.side===this.save.tracking)
      ?? reachable.sort((a,b)=>distance(a.at,this.at)-distance(b.at,this.at))[0];
  }

  interact() {
    if(!this.running||this.paused||this.failed) return;
    const intent=this.interaction();
    if(!intent) return;
    switch(intent.action){
      case 'car':this.transfer(intent.vehicle);break;
      case 'activity':if(this.activityStop?.kind==='use') this.advanceActivity();else this.activitiesMenu();break;
      case 'venue':this.venueId=intent.venue!;this.onMenu('venue');break;
      case 'garage':this.health=100;this.onMenu('garage');break;
      case 'brief':this.onMenu('brief');break;
      case 'offers':this.onMenu('offers');break;
      case 'offer':if(intent.side) this.selectSide(intent.side);break;
      case 'sorel':this.routeContact='sorel';this.onMenu('route');break;
      case 'dialogue':this.dialoguePerson=intent.person!;this.onMenu('dialogue');break;
      case 'ada':
        this.hacked.add('shop-door');this.refreshWorld();
        this.notice('Ada ouvre l’arrière-boutique. Elle attend que Lise décide du sort de la copie.',5);
        break;
      case 'progress':this.progress();break;
    }
  }

  private progress() {
    const step=this.currentStep;
    if(!step) return;
    const id=this.save.side, chapter=this.save.chapter;
    if(step.kind==='delivery'&&this.safeFor<5){this.notice('Mina attend cinq secondes sans détection confirmée.');return;}
    if(step.kind==='escort'&&(!this.escortActive || distance(this.escort.at,step.at)>3.3)){
      this.notice('Restez près de la personne que vous accompagnez.');return;
    }
    if(step.kind==='choice'){
      if(id==='U03') this.onMenu('side-choice');
      else if(chapter===4){ this.routeContact='collective';this.onMenu('route'); }
      else this.onMenu('ending');
      return;
    }
    if(id&&((id==='U02'&&this.stage===1) || (id==='C04'&&this.stage===0))){
      this.escort.at=this.escort.previous=step.at;
      this.escortActive=true;
      this.escortWait=0;
      this.escortPath=[];
      this.notice('Elle vous suit si vous restez à proximité.',4);
    }
    if(!id && ((chapter===1&&this.stage===0)||(chapter===4&&this.stage===1))){
      this.startAlarm(step.at,objectives[chapter].district);
    }
    this.stage++;
    if(id&&this.stage>=getSide(this.save,id).steps.length){this.completeSide(id);return;}
    if(!id&&this.stage>=objectives[chapter].steps.length){this.completeMission();return;}
    this.refreshWorld();
    if(!this.alarm) this.sound.beep(560,.19,.13,725);
    if(!id&&chapter===1) this.notice('Puce récupérée. Intervention au dépôt. Mina attend sous les voies.',5);
    else if(!id&&chapter===4&&this.stage===2) this.notice('Registre récupéré. Nadia et Sorel attendent votre décision.',5);
    else if(this.currentStep) this.notice(this.currentStep.text+'.');
  }

  private updateEscort(dt:number,chase:boolean) {
    if(!this.escortActive||!this.save.side) return;
    const a=this.escort;
    a.previous=a.at;
    const gap=distance(a.at,this.at);
    if(this.driven||gap>16||gap<1.65){ a.stride=0; return; }
    this.escortClock-=dt;
    if(this.escortClock<=0){ this.escortPath=this.physics.findRoute(a.at,this.at);this.escortClock=.42; }
    while(this.escortPath.length>1&&distance(a.at,this.escortPath[0])<.52) this.escortPath.shift();
    const target=this.escortPath[0]??this.at;
    const yaw=angle(a.at,target), v=forward(yaw), length=Math.min(3.55*dt,distance(a.at,target));
    const result=this.physics.move(a.at,v[0]*length,v[1]*length);
    a.stride=distance(result.at,a.at)/Math.max(.01,length);
    a.at=result.at;
    a.yaw=face(a.yaw,yaw,dt);
    this.escortWait=result.hit&&a.stride<.2?this.escortWait+dt:Math.max(0,this.escortWait-dt*4);
    if(this.escortWait>=5.5||(chase&&gap<8&&this.guards.some(g=>g.state==='pursue'&&distance(a.at,g.at)<4))){
      const task=getSide(this.save,this.save.side);
      this.escortActive=false;
      this.stage=Math.max(0,task.steps.findIndex(s=>s.kind==='escort')-1);
      this.refreshWorld();
      this.notice('La personne est retournée au point de rendez-vous.',5);
    }
  }

  private transfer(id?:string) {
    if (this.driven) {
      if (Math.abs(this.car.speed) > 2.2) { this.notice('Freinez avant de descendre.'); return; }
      const target=this.physics.exitVehicle(this.car.at,this.car.yaw,this.car.kind,this.car.id);
      if(target) this.leaveCar(target);
      else this.notice('Sortie obstruée. Reculez ou appuyez sur T pour vous dégager.');
      return;
    }
    const car=id&&this.fleet.get(id);
    if(!car||!this.availableCar(car)) return;
    this.rememberFoot(this.player.at);
    this.selectedCar=car;
    this.driven = true;
    this.reloadLeft=0;
    this.lastVehicleContact=undefined;
    this.physics.placeVehicle(car.id,car.at,car.yaw,false);
    this.physics.tick();
    if(this.destination?.kind==='car'&&distance(this.destination.at,car.at)<1) this.destination=undefined;
    this.sound.beep(93, .14, .075, 175);
  }

  private leaveCar(target:Point) {
    this.player.at=this.player.previous=target;
    this.player.yaw=this.car.yaw;
    this.car.speed=0;
    this.driven=false;
    this.physics.placeVehicle(this.car.id,this.car.at,this.car.yaw,true);
    this.physics.tick();
    this.rememberFoot(target);
  }

  private rememberFoot(at:Point) {
    if(distance(this.safeFoot.at(-1)!,at)<1.6||!this.physics.escapeOnFoot(at)) return;
    this.safeFoot.push(at);
    if(this.safeFoot.length>36) this.safeFoot.splice(1,1);
  }

  recover() {
    if(!this.running||this.failed) return;
    if(this.driven) {
      const car=this.car, exit=this.physics.exitVehicle(car.at,car.yaw,car.kind,car.id);
      if(exit){this.leaveCar(exit);this.notice('Sortie vers un espace libre.');return;}
      if(!this.physics.canTurn(car.at,car.yaw,car.kind,car.id)) {
        const free=this.deliverySpot(car);
        if(free) this.parkAt(car,free);
      }
      car.speed=0;
      this.driven=false;
      this.physics.placeVehicle(car.id,car.at,car.yaw,true);
      this.physics.tick();
    }
    let previous=this.safeFoot.length-1;
    for(;previous>=0;previous--){
      const at=this.safeFoot[previous];
      if(distance(this.at,at)>2.1&&this.physics.escapeOnFoot(at)) break;
    }
    const target=previous>=0?this.safeFoot[previous]:recoveryFallback.find(at=>this.physics.escapeOnFoot(at));
    if(!target){this.notice('Aucun emplacement libre à proximité.');return;}
    this.safeFoot.splice(Math.max(1,previous+1));
    this.player.at=this.player.previous=target;
    this.player.momentum=[0,0];
    this.view.set(target[0],elevation(...target),target[1]-1.4);
    this.notice('Dégagé vers un emplacement libre. Le contrat continue.');
  }

  private startAlarm(at:Point,district:number) {
    this.safeFor=0;
    if(this.alarm) return;
    this.alarm=true;
    this.effects.pulse(at,'#ff9e79',1.6);
    this.sound.beep(441,.47,.21,185);
    for(const guard of this.guards) {
      if(guard.spec.district===district&&guard.health>0&&guard.state!=='pursue'&&distance(guard.at,at)<22)
        this.order(guard,at,'investigate',8.8);
    }
  }

  private get intrusion() {
    return gates.find(g=>['depot-gate','records-side'].includes(g.id)
      && !this.gateState.get(g.id) && distance(this.at,[g.area[0],g.area[1]])<=16
      && distance(this.aim,[g.area[0],g.area[1]])<3.2)
      ?? this.cameras.find(cam=>this.cameraEnabled(cam)&&distance(this.at,cam.spec.at)<=16&&distance(this.aim,cam.spec.at)<=3);
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
      if ('area' in target) {
        this.hacked.add(target.id);
        this.refreshWorld();
        this.effects.pulse([target.area[0],target.area[1]],'#a5f2bd');
        this.notice(target.label+' ouvert.');
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
      const stair=onTunnelStairs(...this.player.at);
      const speed = stair ? (this.key('shift')?5.25:4.45) : (this.key('shift')?9.3:6.65);
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
    const performance=vehicleClasses[car.kind];
    const throttle = -z;
    const stop = this.key(' ');
    if (stop) car.speed *= Math.exp(-8.8 * dt);
    else if (throttle) {
      const changing = car.speed * throttle < 0;
      car.speed = clamp(car.speed + throttle * dt * (changing ? 28 : throttle > 0 ? performance.acceleration : 10), -8.2, performance.speed);
    } else car.speed *= Math.exp(-1.24 * dt);
    if (Math.abs(car.speed) < .075) car.speed = 0;
    if (x && Math.abs(car.speed) > .32) {
      const next = car.yaw - x * Math.sign(car.speed) * (1.63 + 1.18 * Math.min(Math.abs(car.speed) / 11, 1)) * dt * performance.turn;
      if (this.physics.canTurn(car.at, next,car.kind,car.id)) car.yaw = next;
    }
    const heading = forward(car.yaw);
    const from = car.at;
    const velocity: Point = [heading[0] * car.speed, heading[1] * car.speed];
    const move = this.physics.move(from,velocity[0]*dt,velocity[1]*dt,car.yaw,true,car.id,car.kind);
    car.at = move.at;
    if (move.hit) {
      const normal = move.contact?.normal;
      const other = move.contact && (this.traffic.get(move.contact.id)??this.police.get(move.contact.id));
      const relative = other ? [velocity[0]-Math.sin(other.yaw)*other.speed,velocity[1]-Math.cos(other.yaw)*other.speed] : velocity;
      const strength = normal ? Math.abs(normal[0]*relative[0] + normal[1]*relative[1]) : Math.abs(car.speed);
      if (move.contact) this.vehicleImpact(move.contact, velocity, strength);
      car.speed *= normal && strength < Math.abs(car.speed)*.65 ? .73 : -.13;
    } else if (this.lastVehicleContact) {
      this.clearanceSinceContact += distance(from, car.at);
      if (this.clearanceSinceContact > .55) this.lastVehicleContact = undefined;
    }
    if (Math.abs(car.speed) < 2.75) return;
    const c = Math.cos(car.yaw), s = Math.sin(car.yaw);
    for (const victim of [...this.guards, ...this.civils]) {
      if (victim.health <= 0 || victim.hit > .45 || ('spec' in victim && (victim as Guard).spec.drone)) continue;
      const dx = victim.at[0] - car.at[0], dz = victim.at[1] - car.at[1];
      if (Math.abs(dx * c - dz * s) > .36+.98*performance.x || Math.abs(dx * s + dz * c) > .34+1.96*performance.z || Math.abs(elevation(...victim.at) - elevation(...car.at)) > 1.3) continue;
      const strength = Math.abs(car.speed);
      const impact: Point = [heading[0] * Math.sign(car.speed), heading[1] * Math.sign(car.speed)];
      if (strength < 8) {
        victim.hit = 1;
        victim.momentum = [impact[0] * 2.9, impact[1] * 2.9];
        this.sound.impact();
        if ('fear' in victim) (victim as Civil).fear = 4;
      } else {
        car.model.impact(impactSide(car.yaw, dx, dz), strength*.47);
        this.injure(victim, strength > 14 ? 120 : 54, impact, true);
        this.sound.impact(true);
        this.violent();
      }
      car.speed *= strength > 8 ? .73 : .60;
    }
  }

  private vehicleImpact(contact: Contact, velocity: Point, strength: number) {
    this.clearanceSinceContact = 0;
    if (contact.id === this.lastVehicleContact || Math.hypot(...velocity) < .35) return;
    this.lastVehicleContact = contact.id;
    const [nx,nz] = contact.normal;
    const car = this.car;
    const side = impactSide(car.yaw, -nx, -nz);
    car.model.impact(side, strength);
    this.sound.impact(strength > 11);
    this.effects.pulse(contact.point, strength > 11 ? '#ffb67f' : '#e1c5a5', .26);
    const patrol=this.police.get(contact.id);
    const other = this.fleet.get(contact.id)?.model ?? this.traffic.get(contact.id)?.model ?? patrol?.model;
    if (other) other.impact(impactSide(other.rotation.y, nx, nz), strength);
    this.traffic.hold(contact.id,strength);
    this.police.impact(contact.id,strength);
    if(patrol&&strength>5) this.reportPolice(strength>12?2:1);
    if(!patrol&&contact.type==='vehicle'&&strength>=12) this.violent();
    if(this.activity?.id==='cargo'&&this.activity.step>0&&strength>3.5)
      this.activity.condition=Math.max(0,this.activity.condition-Math.round(strength*2.3));
    if (contact.type === 'furniture' && this.city.damageProp(contact.id, -nx, -nz, strength)) {
      this.physics.setProp(contact.id, false);
      this.lighting.breakLamp(contact.id);
    }
    if (strength > 13) this.hurt(5);
  }

  private shoot() {
    if(this.reloadLeft>0) return;
    const weapon=this.weapon, ammo=this.ammo, from=this.player.at;
    if(ammo.loaded===0){
      if(ammo.spare) this.reload();
      else if(!this.dryFire){this.dryFire=true;this.sound.beep(132,.06,.07,76);this.notice('Munitions épuisées · F pour changer d’arme.');}
      return;
    }
    this.gun=weapon.cycle;
    ammo.loaded--;
    this.persist();
    this.lighting.muzzle(from,this.player.yaw,weapon.color,this.time);
    const sway=weapon.rays===1 ? (Math.random()-.5)*weapon.spread*(1+this.player.stride) : 0;
    let hit=false;
    for(let i=0;i<weapon.rays;i++){
      const spread=weapon.rays>1 ? weapon.spread*(i/(weapon.rays-1)-.5) : sway;
      hit=this.projectShot(from,forward(this.player.yaw+spread),weapon.range,weapon.power,weapon.color)||hit;
    }
    this.sound.impact(hit,true);
    this.violent();
    for (const c of this.civils) if (distance(c.at, from) < 15) c.fear = 4.7;
  }

  private projectShot(from:Point,dir:Point,range:number,power:number,color:string) {
    const y=elevation(...from)+1.22;
    const target:Point=[from[0]+dir[0]*range,from[1]+dir[1]*range];
    let reach=this.physics.ray(from,target,1.22,y-elevation(...target))*range;
    let targetActor: Actor | undefined;
    for (const a of [...this.guards, ...this.civils]) {
      if (a.health <= 0) continue;
      const dx = a.at[0] - from[0], dz = a.at[1] - from[1];
      const along = dx * dir[0] + dz * dir[1];
      if (along < .45 || along > reach || Math.abs(dx * dir[1] - dz * dir[0]) > .68 || Math.abs(elevation(...a.at)+1.18-y)>1.12 ||
          this.physics.ray(from, a.at, 1.18, 1.16) < .98) continue;
      reach = along;
      targetActor = a;
    }
    const to: Point = [from[0] + dir[0] * reach, from[1] + dir[1] * reach];
    this.effects.trace(new T.Vector3(from[0]+dir[0]*.52,y,from[1]+dir[1]*.52),new T.Vector3(to[0],y,to[1]),color);
    if(targetActor) this.injure(targetActor,power,dir,false);
    return !!targetActor;
  }

  private violent() {
    this.heat = this.time;
    const witness = this.civils.some(c => c.health > 0 && distance(c.at, this.at) < 13 && this.physics.ray(c.at, this.at) > .94);
    if (!witness) return;
    if(!this.active||this.driven) this.reportPolice();
    this.safeFor = 0;
    for (const g of this.guards) {
      if (g.health <= 0 || g.spec.drone || distance(g.at, this.at) > 54) continue;
      this.order(g, this.at, 'pursue', 5.3);
    }
    this.notice('Un témoin a signalé votre position.', 2.8);
  }

  private reportPolice(severity=1){
    if(this.time-this.crimeReported<1.5) return;
    this.crimeReported=this.time;
    this.police.report(this.at,severity);
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

  private restricted(district:number) {
    if(district===2&&this.save.ending) return false;
    const zones = district===0?['depot','records']:district===1?['archive','housing']:['core'];
    return rooms.some(room=>zones.includes(room.id)&&inRect(...this.at,room.area,.43));
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
    const liveDistrict = districtAt(...this.at);
    for (const cam of this.cameras) {
      cam.disabled = Math.max(0, cam.disabled - dt);
      cam.yaw = cam.spec.angle + Math.sin(this.time * .78 + cam.spec.district) * .61;
      const restoredBadge = this.save.ending === 'protect' && cam.spec.district === 2 && !crime;
      const visible = !restoredBadge && liveDistrict === cam.spec.district && this.cameraEnabled(cam) && this.sees(cam.spec.at, cam.yaw, 13.8, .62, 2.63);
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
        (this.alarm && this.active && objectives[this.save.chapter].district === g.spec.district);
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
    if(this.confirmed&&this.driven&&(crime||this.alarm)&&!this.police.level) this.reportPolice();
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

  private moveCiv(c: Civil, dt: number, period: Civil['period'], chase: boolean) {
    if (c.health <= 0) { c.stride = 0; return; }
    const proximity=distance(c.at,this.at);
    if(proximity>59){
      c.farTick+=dt;
      if(c.farTick<.24) return;
      dt=c.farTick;
    }
    c.farTick=0;
    const redirected=!!(c.flow.civic&&this.save.ending==='publish');
    if(c.period!==period||redirected!==c.changed){
      c.period=period;
      c.changed=redirected;
      const route=redirected
        ? (c.flow.route[0][1]>0 ? publicService : redeployedWorkers)
        : (period==='evening'?c.flow.evening:period==='day'?c.flow.day:undefined)??c.flow.route;
      if(c.route!==route){
        c.route=route;
        c.next=route.reduce((best,p,k)=>distance(c.at,p)<distance(c.at,route[best])?k:best,0);
        c.direction=c.next===route.length-1?-1:1;
        c.wait=0;
        c.detour=proximity<62?this.physics.findRoute(c.at,route[c.next]):[];
      }
    }
    if(chase && proximity<11 && Math.abs(elevation(...c.at)-elevation(...this.at))<2.2) c.fear=Math.max(c.fear,2.2);
    c.fear = Math.max(0, c.fear - dt);
    c.wait=Math.max(0,c.wait-dt);
    const fleeing=c.fear>0&&proximity<14;
    if(c.wait>0&&!fleeing){ c.stride=0; return; }
    while(c.detour.length && distance(c.at,c.detour[0])<.62) c.detour.shift();
    const target=c.detour[0]??c.route[c.next];
    if(!fleeing && distance(c.at,target)<.54){
      if(c.next+c.direction<0||c.next+c.direction>=c.route.length){
        c.direction=-c.direction;
        c.wait=c.flow.role==='transit' ? 1.05+c.seed%3 : 4.2+c.seed%7;
      } else if(c.flow.role!=='transit') c.wait=(c.seed%3+1)*.95;
      c.next+=c.direction;
      return;
    }
    const yaw=fleeing ? angle(this.at,c.at)+(c.seed%2?-.47:.47) : angle(c.at,target);
    const [x,z]=forward(yaw);
    const speed=fleeing ? 4.85 : (c.flow.role==='transit' ? 1.44 : .93)+c.seed%5*.073;
    const start=c.at;
    const motion=proximity<63?this.physics.move(start,x*speed*dt,z*speed*dt).at:[start[0]+x*speed*dt,start[1]+z*speed*dt] as Point;
    c.at=motion;
    c.yaw=face(c.yaw,yaw,dt);
    const moved=distance(start,motion);
    c.stride=Math.min(1,moved/(dt*3.3));
    c.stalled=moved<dt*speed*.24?c.stalled+dt:0;
    if(c.stalled>.56){
      c.stalled=0;
      if(fleeing){ c.fear=Math.min(c.fear,1.5); return; }
      c.detour=this.physics.findRoute(c.at,c.route[c.next]);
      if(!c.detour.length){ c.next=(c.next+1)%c.route.length; c.wait=.8; }
    }
  }

  private update(dt: number) {
    this.time += dt;
    if(Math.floor(this.time*5)!==Math.floor((this.time-dt)*5)) this.updateGates();
    this.gun -= dt;
    if(this.reloadLeft>0){
      this.reloadLeft=Math.max(0,this.reloadLeft-dt);
      if(this.reloadLeft===0) {
        const ammo=this.ammo,count=Math.min(ammo.spare,this.weapon.magazine-ammo.loaded);
        ammo.loaded+=count;
        ammo.spare-=count;
        this.persist();
        this.sound.beep(342,.09,.065,479);
      }
    }
    if(!this.pointer.down) this.dryFire=false;
    this.messageTime -= dt;
    this.damageFlash -= dt;
    for (const id of Object.keys(this.cooldown) as Implant[]) this.cooldown[id] = Math.max(0, this.cooldown[id] - dt);
    this.player.previous = this.player.at;
    this.car.previous = this.car.at;
    this.car.lastYaw = this.car.yaw;
    this.updateAim();
    this.controls(dt);
    this.recoveryClock+=dt;
    if(this.recoveryClock>=.45){
      this.recoveryClock=0;
      if(!insideCity(this.at)||!this.driven&&!this.physics.canStand(this.at)) this.recover();
      else if(!this.driven) this.rememberFoot(this.at);
    }
    for (const g of this.guards) { g.previous = g.at; this.moveGuard(g, dt); }
    const period=populationPeriod(this.time), chase=this.confirmed||this.police.phase==='pursuit'||this.guards.some(g=>g.state==='pursue'&&distance(g.at,this.at)<22);
    const sidewalk:Point[]=[];
    for (const c of this.civils) {
      c.previous = c.at;
      this.moveCiv(c, dt, period, chase);
      if(c.health>0 && distance(c.at,this.at)<70) sidewalk.push(c.at);
    }
    this.traffic.update(dt,this.at,[...sidewalk,...this.police.audible],chase);
    this.updateEscort(dt,chase);
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
    this.police.update(dt,{at:this.at,driven:this.driven,yaw:this.driven?this.car.yaw:this.player.yaw,
      speed:this.driven?this.car.speed:this.player.stride*6,kind:this.driven?this.car.kind:undefined});
    if(this.police.visible) this.safeFor=0;
    if(this.police.arrest>=1&&!this.failed){this.policeArrested=true;this.hurt(this.health);}
    this.updateActivity(dt);
    this.effects.update(dt);
    this.physics.tick();
  }

  private updateAim() {
    const pointer = this.pointer;
    if (!pointer.visible) return;
    this.raycaster.setFromCamera(this.pointerNdc.set(pointer.x / window.innerWidth * 2 - 1, 1 - pointer.y / window.innerHeight * 2), this.camera);
    this.cameraPlane.constant = -(elevation(...this.at) + .96);
    for(let i=0;i<3;i++){
      if(!this.raycaster.ray.intersectPlane(this.cameraPlane,this.projection)) return;
      const {x,z}=this.projection;
      this.aim=[clamp(x,bounds.west,center[0]),clamp(z,bounds.north,center[1])];
      this.cameraPlane.constant=-(elevation(...this.aim)+.96);
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
    if(position(this.escort).visible) renderActor(this.escort);
    position(this.player).visible = !this.driven;
    for(const car of this.fleet.values()){
      car.model.visible=this.availableCar(car)&&distance(car.at,this.at)<58;
      if(!car.model.visible) continue;
      const at=car===this.car&&this.driven?combine(car.previous,car.at,alpha):car.at;
      car.model.position.set(at[0],elevation(...at),at[1]);
      car.model.rotation.y=car===this.car&&this.driven?car.lastYaw+deltaAngle(car.lastYaw,car.yaw)*alpha:car.yaw;
      car.model.setBrake(car===this.car&&this.driven&&this.key(' '));
    }
    this.traffic.render(alpha,this.at);
    this.police.render(alpha,this.at);
    for(const [id,group] of this.activityStarts) group.visible=!this.busy&&distance(this.at,activitySpec(id).start)<52;
    const stop=this.activityStop;
    this.shuttlePassenger.visible=this.activity?.id==='shuttle'&&this.activity.step===0;
    this.activityMarker.visible=!!stop&&distance(this.at,stop.at)<49;
    if(stop){
      this.activityMarker.position.set(stop.at[0],elevation(...stop.at)+.13,stop.at[1]);
      this.activityMarker.children[1].rotation.y=this.time*1.7;
    }
    this.city.updateVisibility(x, z, dt);
    const period=populationPeriod(this.time);
    this.city.setPeriod(period);
    if(this.marketHost) this.marketHost.visible=period!=='evening'||inRect(x,z,venues.find(v=>v.id==='market')!.area,.6);
    this.city.setLight(this.time,this.lighting.update(this.time,this.at,this.driven?this.car:null));
    for (const g of this.guards) {
      renderActor(g);
      const p = position(g).position;
      p.y += g.spec.drone && g.stunned > 0 ? -.64 : 0;
      g.cone.visible = g.health > 0 && g.stunned <= 0;
      g.cone.position.set(p.x, elevation(p.x, p.z) + .085, p.z);
      g.cone.rotation.y = g.yaw;
      g.cone.material.uniforms.strength.value = g.sight > .85 ? 2.4 : .72 + g.sight;
    }
    for (const c of this.civils) {
      const model=position(c);
      model.visible=distance(c.at,this.at)<53;
      if(model.visible) renderActor(c);
    }
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
    const siren=Math.max(0,...this.police.audible.map(at=>1-distance(at,this.at)/44));
    this.sound.update(this.driven,this.car.speed,this.running&&!this.paused,siren*(this.police.phase==='search'?.45:1));
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
