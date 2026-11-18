import R from '@dimforge/rapier3d-compat'
import * as T from 'three'
import {View,Actor} from './world'
import {Streets} from './physics'
import {Traffic,footFlow,periods,clockPeriod} from './life'
import {AudioBus} from './audio'
import {sites,p,distance,ground,district,districts,watchRoutes,type Point} from './level'
import {available,chapter,jobNames,finish,writeSave,missions,steps,startSite,destination,common,offerDetails,type Job,type Save,type Implant} from './campaign'
export const ready=R.init()
export type Choice={label:string,act:()=>void}
export type Dialogue={title:string,from:string,body:string,choices:Choice[]}
type Hooks={talk:(dialog:Dialogue)=>void,toast:(msg:string)=>void,hud:()=>void}
type Person={q:Point,home:Point,actor:Actor,hp:number,angle:number,phase:number,down:number,hit:number,
 guard:boolean,patrol:Point[],index:number,plan:Point[],timer:number,investigate:Point|null,interest:number,seen:number,cool:number,cone?:T.Mesh,zone?:number,flow?:number,wait?:number,dwell?:number,door?:Point,activity?:string,indoors?:boolean}
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t
const angleTo=(a:Point,b:Point)=>Math.atan2(b.x-a.x,b.z-a.z)
export class Game{
 view:View;streets=new Streets();people:Person[]=[];q={...sites.spawn};prev={...this.q};car={...sites.car};prevCar={...this.car}
 driving=false;speed=0;carAngle=Math.PI/2;angle=0;walk=0;health=100;elapsed=0;phase=0
 paused=true;started=false;keys=new Set<string>();nx=0;ny=0;aim=p(0,0);fire=false;gun=0;cool=[0,0]
 step=0;quiet=99;alert='Discret';source='';lastKnown:Point|null=null;alertTTL=0;cameraSeen=0;cameraOff=0;gateTime=0;archiveTime=0;diversionTime=0;private shiftOpen=false;private gatePending=false;cameraAngle=0
 cameraCone:T.Mesh;camObject:T.Group;drone:T.Group;droneOff=0;droneSeen=0;dronePoint=p(128,-4)
 mina:Actor;sorel:Actor;pickup:T.Group;decor:T.Group[]=[];moving=false;hint='';valid='';interaction:(()=>void)|null=null
 traffic:Traffic;npcs=new Map<string,Actor>();escort:Person|null=null;escortStall=0;private escortProgress:Point|null=null;archTime=0;archiveSeen=false;private period=-1;private impactId:number|null=null;private impactAt:Point=p(-999,-999)
 get localTime(){return this.save.dayTime+this.elapsed}
 get hour(){return periods[clockPeriod(this.localTime)]}
 private accumulator=0;private last=0;private uiTime=0;private threatPulse=0;private frameId=0;private sideTicker=0
 constructor(canvas:HTMLCanvasElement,public save:Save,public audio:AudioBus,private ui:Hooks){
  this.view=new View(canvas);this.traffic=new Traffic(this.view.scene,this.streets);this.mina=new Actor(this.view.scene,'#519a8d');this.sorel=new Actor(this.view.scene,'#9185a7')
  this.pickup=this.view.object(sites.chip,'PUCE','#e0ee68');this.camObject=this.view.object(sites.camera,'CAM 01','#ec9566')
  this.cameraCone=this.view.cone('#ffa048',10,.63);this.drone=this.view.object(this.dronePoint,'DRONE','#ef9677',.7)
  const add=(guard:boolean,start:Point,patrol:Point[],col:string)=>{const actor=new Actor(this.view.scene,col);const person:Person={q:{...start},home:start,actor,hp:guard?65:40,angle:0,phase:0,down:0,hit:0,guard,patrol,index:0,plan:[],timer:0,investigate:null,interest:0,seen:0,cool:0};if(guard)person.cone=this.view.cone('#f5b170',7,.65);this.people.push(person)}
  for(const path of watchRoutes)add(true,path[0],path,'#aa6662')
  for(const [id,col] of [['nadia','#a67b4f'],['lise','#aa758b'],['archiviste','#8197b0'],['varenne','#5b6480'],['résidente','#9eaf88'],['gardienne','#ad9877'],['propriétaire','#9a7c5a'],['relais','#699690']])this.npcs.set(id,new Actor(this.view.scene,col))
  for(let zone=0;zone<5;zone++)for(let i=0;i<[14,22,16,21,15][zone];i++){
   const flow=footFlow(zone,i,0);const points=flow.points.filter(q=>this.streets.vacant(q));if(!points.length)continue
   add(false,points[0],points,['#8299a2','#b28170','#9c956e','#678f7d','#b3a6a0'][i%5]);this.people.at(-1)!.actor.dress(zone,i);Object.assign(this.people.at(-1)!,{zone,flow:i,wait:flow.wait,dwell:i%4,door:flow.door,activity:flow.label})
  }
  this.restore();this.frameId=requestAnimationFrame(this.frame)
 }
 get job(){return this.save.active}
 get next(){return this.save.track&&available(this.save).includes(this.save.track)?this.save.track:chapter(this.save)}
 get region(){return districts[district(this.q.x,this.q.z)]}
 get detection(){return Math.min(1,Math.max(this.cameraSeen/.85,this.droneSeen,...this.people.filter(n=>n.guard&&n.hp>0).map(n=>n.seen/.6)))}
 get observer(){if(this.cameraSeen>0)return 'Caméra du dépôt';if(this.droneSeen>0)return 'Drone du Nœud';return 'Vigile'}
 get minaPos(){return this.job==='chip'&&this.step===1?sites.drop:sites.garage}
 clearInput(){this.keys.clear();this.fire=false}
 pause(){this.paused=true;this.clearInput();this.audio.engine(0)}
 resume(){if(this.health<=0)return;this.started=true;this.paused=false;this.last=performance.now();this.accumulator=0;this.clearInput();this.view.resize();this.audio.start();this.updateInteraction();this.ui.hud()}
 stop(){cancelAnimationFrame(this.frameId);this.pause()}
 syncGates(){this.gatePending=false;for(const [id,on] of Object.entries({gate:this.gateTime>0,shortcut:this.save.done.includes('chip'),gallery:this.save.route==='collectif',service:this.save.route==='sorel',cour:this.save.done.includes('escort'),exit:this.save.done.includes('exit'),paper:this.save.done.includes('paper'),archives:this.archiveTime>0||this.archTime>=18,entretien:this.diversionTime>0||this.save.done.includes('door'),maintenance:this.shiftOpen||this.save.done.includes('ledger'),coursive:this.shiftOpen||this.save.ending==='public'})){const bound=this.streets.gateAreas.get(id);const wait=!!bound&&!on&&this.streets.open.has(id)&&Math.abs(this.q.x-bound.x)<bound.w/2+.6&&Math.abs(this.q.z-bound.z)<bound.d/2+.6;this.gatePending||=wait;this.streets.setGate(id,on||wait);const gate=this.view.gates.get(id);if(gate)gate.visible=!(on||wait)}}
 restore(){
  this.q={...sites.spawn};this.prev={...this.q};this.car={...sites.car};this.prevCar={...this.car};this.carAngle=Math.PI;this.driving=false;this.speed=0;this.health=100;this.step=0;this.gun=0;this.cool=[0,0];this.quiet=99;this.alertTTL=0;this.lastKnown=null;this.cameraSeen=0;this.droneSeen=0;this.cameraOff=0;this.gateTime=0;this.archiveTime=0;this.diversionTime=0;this.shiftOpen=false;this.droneOff=0;this.alert='Discret';this.source='';this.traffic.reset();this.escort=null;this.escortStall=0;this.archTime=0;this.archiveSeen=false;this.impactId=null;this.period=-1;this.view.resetEffects()
  for(const n of this.people){Object.assign(n,{q:{...n.home},indoors:false,dwell:(n.flow??0)%4,hp:n.guard?65:40,angle:0,index:0,plan:[],timer:0,interest:0,investigate:null,seen:0,cool:0,hit:0,down:0});n.actor.obj.visible=true}
  this.streets.setParked(this.car,this.carAngle,true);this.syncGates();this.view.snap(this.q);this.clearInput();this.updateInteraction()
 }
 startJob(j:Job){if(this.job||!available(this.save).includes(j))return;this.save.active=j;this.save.activeOffer=common.includes(j)?missions[j].id+'-'+this.save.offers:null;this.save.track=j;this.step=0;writeSave(this.save);this.ui.toast('Point de reprise enregistré au garage');this.updateInteraction()}
 abandon(){this.save.active=null;this.save.activeOffer=null;this.save.track=null;writeSave(this.save);this.restore();this.ui.toast('Retour en exploration libre')}
 target():{q:Point,label:string}{
  const j=this.job||this.next;if(!this.job){if(this.save.done.includes(j))return {q:sites.garage,label:'Explorer la ville libre'};return {q:sites[startSite(this.save,j)],label:'Rencontrer '+this.contactName(j)+' · '+jobNames[j]}}
  if(j==='ledger'&&this.step===2)return {q:distance(this.q,sites.mina)<distance(this.q,sites.sorel)?sites.mina:sites.sorel,label:'Confier le registre à Nadia ou à Sorel'}
  if(j==='calendar'&&this.step===1)return {q:this.archPos(),label:'Suivre l’archiviste près du dépôt'}
  return destination(this.save,j,this.step)
 }
 private contactName(j:Job){return j==='ascent'&&this.save.route==='sorel'?'Sorel':missions[j].contact}
 private archPos(){const t=Math.min(1,this.archTime/18);return p(sites.archivist.x+11*t,sites.archivist.z-2*t)}
 private dialogue(from:string,title:string,body:string,choices:Choice[]){this.pause();this.ui.talk({from,title,body,choices})}
 private jobOffer(j:Job){this.dialogue(this.contactName(j),jobNames[j],missions[j].brief+' '+missions[j].access+(common.includes(j)?' '+offerDetails(this.save,j):''),[{label:'Accepter le contrat',act:()=>this.startJob(j)},{label:'Plus tard',act:()=>{}}])}
 private complete(j:Job){if(!finish(this.save,j))return;this.step=0;this.escort=null;this.quiet=99;this.alertTTL=0;this.lastKnown=null;this.syncGates();this.audio.beep(330,.36,870);this.ui.toast(jobNames[j]+' · +'+missions[j].reward+' crédits');this.updateInteraction()}
 private advance(){this.step++;this.audio.beep(390,.15,760);this.ui.toast(this.target().label);this.updateInteraction()}
 private beginEscort(pos:Point){
  let n=this.people.find(v=>!v.guard&&v.flow===undefined&&v.hp>0)
  if(!n){n={q:{...pos},home:{...pos},actor:new Actor(this.view.scene,'#f2b8a0'),hp:55,angle:0,phase:0,down:0,hit:0,guard:false,patrol:[pos],index:0,plan:[],timer:0,investigate:null,interest:0,seen:0,cool:0};this.people.push(n)}
  Object.assign(n,{q:{...pos},hp:55,down:0,home:{...pos},patrol:[pos],timer:0,plan:[]});this.escort=n;this.escortStall=0;this.escortProgress={...n.q}
 }
 private objectiveAction(){
  const j=this.job;if(!j){this.jobOffer(this.next);return}
  if(j==='chip'&&this.step===0){this.quiet=0;this.dispatch(sites.chip);this.advance();return}
  if(j==='chip'){if(this.quiet<5){this.ui.toast('Restez cinq secondes sans détection');return}
   this.dialogue('Mina','Ton nom est dans le lot.','« J’ai déjà livré pour Civis. Je reconnais cette référence d’audit. Sorel peut la lire. Sous les voies, la grille verte donne maintenant sur mes ateliers. »',[{label:'Remettre la puce',act:()=>this.complete(j)}]);return}
  if(j==='parcel'&&this.step===0){this.guardian();return}
  if(j==='calendar'&&this.step===1){this.archiveSeen=true;this.archTime=0;this.advance();return}
  if(j==='calendar'&&this.step===2&&this.archTime<18&&this.archiveTime<=0){this.ui.toast('Gardez l’archiviste en vue jusqu’à son départ ou détournez la serrure avec Intrusion');return}
  if((j==='escort'&&this.step===1)||(j==='guide'&&this.step===0)){this.beginEscort(this.target().q);this.advance();return}
  if(this.escort&&distance(this.escort.q,this.target().q)>4){this.ui.toast('Attendez votre accompagnant au point de remise');return}
  if(j==='ledger'&&this.step===2){const nadia=distance(this.q,sites.mina)<distance(this.q,sites.sorel)
   this.dialogue(nadia?'Nadia Keita':'Sorel','Qui reçoit le registre ?',nadia?'« Demain, il faut que les familles rentrent chez elles. Je garde les noms ici. Ma galerie ouvre sur le plateau. »':'« Ma signature figure sur l’ordre. Cette copie établit qui en a avancé la date. Avec mon badge, tu passeras jusqu’au vestibule. »',[{label:'Remettre le registre',act:()=>{this.save.route=nadia?'collectif':'sorel';this.complete(j)}},{label:'Garder la copie',act:()=>{}}]);return}
  if(j==='core'&&this.step===1){this.dialogue('Élias Varenne · Civis','Droit d’accès','« La continuité du service dépend de nous. » Sorel a joint les pièces d’audit. Publier les preuves expurgées transfère les autorisations aux relais. Annuler les révocations restaure les services sous contrôle de la cellule de Sorel.',[{label:'Publier les preuves expurgées',act:()=>{this.save.ending='public';this.complete(j);this.epilogue()}},{label:'Annuler les révocations',act:()=>{this.save.ending='seal';this.complete(j);this.epilogue()}}]);return}
  if(j==='parcel'&&this.step===2){this.dialogue('Lise Marec','Les noms de la nuit','« Ces personnes m’ont confié leur adresse. Je peux garder les preuves pour elles, ou tu peux détruire les dossiers ici. La permanence restera ouverte. »',[{label:'Détruire les dossiers privés',act:()=>{this.save.night='destroy';this.complete(j)}},{label:'Confier les preuves à Lise',act:()=>{this.save.night='entrust';this.complete(j)}}]);return}
  if(this.step+1<steps(this.save,j).length)this.advance()
  else this.complete(j)
 }
 private guardian(){this.dialogue('Gardienne de la permanence','Les archives privées','« Lise a prévenu. Entrez côté boutique et rapportez-lui le dossier fermé. »',[{label:'Prendre la clé',act:()=>this.advance()},{label:'Revenir plus tard',act:()=>{}}])}
 private epilogue(){this.dialogue('Fin de campagne','Signal transmis',this.save.ending==='public'?'Les guichets Civis ferment. Les voisins reçoivent des autorisations provisoires. Au relais, Nadia aide déjà une famille à corriger son adresse.':'Les badges répondent de nouveau. Le quartier rentre chez lui. Aux portiques du plateau, la cellule de Sorel reprend la surveillance.',[{label:'Retourner en ville',act:()=>{}}])}
 private garage(){const allowed:Implant[]=this.save.done.includes('ledger')?['Intrusion','Leurre','Surcharge']:['Intrusion','Leurre'];const choices:Choice[]=allowed.map(implant=>({label:'Équiper '+implant+' en 1',act:()=>{const other=this.save.equip.find(i=>i!==implant)||allowed.find(i=>i!==implant)!;this.save.equip=[implant,other];writeSave(this.save);this.ui.toast(this.save.equip.join(' / '))}}))
  if(allowed.length===3)for(const implant of allowed.filter(i=>i!==this.save.equip[0]))choices.push({label:'Équiper '+implant+' en 2',act:()=>{this.save.equip[1]=implant;writeSave(this.save)}})
  choices.push({label:'Attendre la prochaine relève',act:()=>{this.save.dayTime+=120-this.localTime%120;writeSave(this.save);this.ui.toast('Relève · '+this.hour)}})
  this.dialogue('Garage de Mina','Établi des implants','Deux emplacements. Intrusion ouvre une grille ou coupe une caméra. Leurre détourne un vigile vers le point visé. Équipement actuel · '+this.save.equip.join(' et ')+'.',choices)
 }
 updateInteraction(){
  this.hint='';this.interaction=null;const near=(q:Point,r=3)=>distance(this.q,q)<r&&Math.abs(ground(this.q.x,this.q.z)-ground(q.x,q.z))<2.3
  const bind=(hint:string,fn:()=>void)=>{this.hint=hint;this.interaction=fn}
  if(this.driving){bind(Math.abs(this.speed)>2?'Freiner pour sortir':'Sortir du véhicule',()=>this.exitCar());return}
  const target=this.target()
  if((this.job||available(this.save).includes(this.next))&&near(target.q,3.7)){
   if(this.job==='chip'&&this.step===1&&this.quiet<5){bind('Livraison dans '+Math.ceil(5-this.quiet)+' s sans détection',()=>this.ui.toast('Éloignez-vous des cônes de surveillance'));return}
   if(!this.job){const offers=available(this.save).filter(j=>near(sites[startSite(this.save,j)],3.7));if(offers.length>1){bind('Consulter les contrats',()=>this.offerList(offers));return}}
   bind(target.label,()=>this.objectiveAction());return
  }
  if(this.job==='calendar'&&this.step===1&&near(sites.archives)&&this.archiveTime>0){bind('Entrer par les archives latérales',()=>{this.step=2;this.objectiveAction()});return}
  if(this.job==='ascent'&&this.step===0&&near(sites.relay)){bind('Passer par la cour de secours',()=>this.advance());return}
  if(this.job==='parcel'&&this.step===0&&near(sites.cour)){bind('Entrer par la cour de service',()=>this.advance());return}
  if(!this.job){const offers=available(this.save).filter(j=>near(sites[startSite(this.save,j)],3.7));if(offers.length){bind('Consulter les contrats',()=>this.offerList(offers));return}}
  if(near(sites.lise)&&this.save.done.includes('parcel')){bind('Parler à Lise',()=>this.ui.toast(this.save.night==='destroy'?'Lise · Les dossiers sont détruits. Nous ouvrons ce soir.':'Lise · Les preuves sont sous clé à la permanence.'));return}
  if(near(sites.mina)&&this.save.ending){bind('Parler à Nadia',()=>this.ui.toast(this.save.ending==='public'?'Nadia · Je corrige les badges provisoires ici.':'Nadia · Les familles peuvent rentrer chez elles.'));return}
  if(this.save.ending&&(near(sites.sorel)||near(sites.exit)&&this.save.done.includes('exit'))){bind('Consulter la permanence de Sorel',()=>this.ui.toast(this.save.ending==='public'?'Sorel · Le portillon répond au relais des habitants. Le registre public fait foi.':'Sorel · La cellule de recours a rétabli les badges de l’équipe de nuit.'));return}
  if(near(this.car,3.35)&&this.streets.clear(this.q,this.car,true)){bind('Monter dans la voiture',()=>{this.driving=true;this.streets.setParked(this.car,this.carAngle,false);this.q={...this.car};this.prev={...this.q};this.audio.beep(90,.25,140,'triangle')});return}
  if(near(sites.garage,5)){bind('Configurer les implants',()=>this.garage());return}
 }
 private offerList(offers:Job[]){if(offers.length===1){this.jobOffer(offers[0]);return}this.dialogue('Réseau local','Contrats disponibles','Choisissez le dossier à ouvrir.',offers.map(j=>({label:missions[j].id+' · '+jobNames[j],act:()=>this.jobOffer(j)})).concat([{label:'Retour',act:()=>{}}]))}
 interact(){if(this.paused)return;this.updateInteraction();this.interaction?.();this.updateInteraction();this.ui.hud()}
 workbench(){if(!this.driving&&distance(this.q,sites.garage)<6)this.garage();else this.ui.toast('L’établi se trouve au garage de Mina')}
 exitCar(){if(Math.abs(this.speed)>2){this.ui.toast('Ralentissez pour descendre');return}for(const n of [1,-1]){const q=p(this.car.x+n*Math.cos(this.carAngle)*1.92,this.car.z-n*Math.sin(this.carAngle)*1.92);if(this.streets.vacant(q)&&this.streets.clear(this.car,q,true)){this.q=q;this.prev={...q};this.driving=false;this.speed=0;this.streets.setParked(this.car,this.carAngle,true);this.audio.engine(0);return}}this.ui.toast('Les deux portières sont bloquées')}
 private dispatch(q:Point){for(const n of this.people.filter(n=>n.guard&&n.hp>0&&distance(n.q,q)<25)){n.investigate={...q};n.interest=9;n.timer=0}this.audio.beep(230,.18,110,'triangle')}
 private confirm(q:Point,source:string){this.quiet=0;this.source=source;this.lastKnown={...q};this.alertTTL=8;if(this.threatPulse<=0){this.audio.beep(500,.15,740);this.threatPulse=2}for(const n of this.people)if(n.guard&&n.hp>0&&distance(n.q,q)<21){n.investigate={...q};n.interest=8}}
 private see(origin:Point,heading:number,r:number,angle:number){const d=distance(origin,this.q);if(d>r)return false;const h=angleTo(origin,this.q);return (d<1.4||Math.cos(h-heading)>Math.cos(angle))&&this.streets.clear(origin,this.q)}
 private hurt(n:Person,damage:number,dx:number,dz:number){n.hp-=damage;n.hit=1;this.view.impact(n.q,dx,dz,damage>42||n.hp<=0);const pushed=this.streets.move(n.q,dx*(damage>42?.85:.3),dz*(damage>42?.85:.3));n.q=pushed
  if(n.hp<=0)n.plan=[];else if(!n.guard){n.investigate=p(n.q.x+dx*6,n.q.z+dz*6);n.interest=3;n.timer=0}
 }
 shoot(){if(this.paused||this.driving||this.gun>0)return;this.gun=.31;const a=angleTo(this.q,this.aim),dx=Math.sin(a),dz=Math.cos(a);let end=p(this.q.x+dx*25,this.q.z+dz*25)
  for(let t=.5;t<25;t+=.45){const next=p(this.q.x+dx*t,this.q.z+dz*t);if(!this.streets.clear(this.q,next)){end=next;break}const n=this.people.find(n=>!n.indoors&&n.hp>0&&distance(n.q,next)<.65);if(n){this.hurt(n,38,dx,dz);end=next;break}}
  this.view.shot(this.q,end);this.audio.beep(115,.11,28,'sawtooth')
  if(this.people.some(n=>!n.indoors&&n.hp>0&&distance(n.q,this.q)<12&&this.streets.clear(n.q,this.q)))this.confirm(this.q,'Tir signalé par un témoin')
 }
 private hackTarget(){return [{id:'camera',q:sites.camera},{id:'gate',q:sites.gate},...(this.job==='calendar'?[{id:'archives',q:sites.archives}]:[])].filter(v=>distance(this.q,v.q)<12&&distance(this.aim,v.q)<3.25).sort((a,b)=>distance(this.aim,a.q)-distance(this.aim,b.q))[0]}
 implant(slot:number){if(this.paused||this.driving)return;const name=this.save.equip[slot];if(this.cool[slot]>0){this.ui.toast('Implant en recharge');return}
  if(name==='Intrusion'){const v=this.hackTarget();if(!v){this.ui.toast('Visez la caméra ou la grille à moins de 12 m');return}if(v.id==='archives')this.archiveTime=15;else if(v.id==='gate')this.gateTime=15;else{this.cameraOff=12;this.cameraSeen=0}this.syncGates();this.ui.toast(v.id==='gate'?'Grille ouverte · 15 s':v.id==='archives'?'Serrure des archives ouverte · 15 s':'Caméra suspendue · 12 s');this.cool[slot]=16}
  if(name==='Leurre'){if(distance(this.q,this.aim)>19){this.ui.toast('Le signal porte à 19 m');return}const q={...this.aim};if(!this.streets.vacant(q)){this.ui.toast('Visez un point accessible au sol');return}for(const n of this.people)if(n.guard&&n.hp>0&&distance(n.q,q)<16){n.investigate=q;n.interest=6;n.seen=0;n.timer=0}if(distance(q,sites.portique)<19){this.diversionTime=10;this.syncGates()}this.view.lure.position.set(q.x,ground(q.x,q.z)+.18,q.z);this.view.lureUntil=this.elapsed+2;this.ui.toast('Signal leurre émis');this.cool[slot]=10}
  if(name==='Surcharge'){if(distance(this.q,this.dronePoint)>10){this.ui.toast('Approchez-vous du drone du Nœud');return}this.droneOff=10;this.dispatch(this.dronePoint);this.cool[slot]=17;this.ui.toast('Drone immobilisé · 10 s')}
  this.audio.beep(290,.22,1200);this.ui.hud()
 }
 private damage(amount:number){this.health=Math.max(0,this.health-amount);this.audio.beep(90,.18,45,'triangle');if(this.health===0){this.dialogue('Signal interrompu','Coursier hors ligne',this.job?'La puce, le véhicule et les patrouilles reprendront leur position du briefing.':'Mina peut vous ramener au garage.',[{label:this.job?'Reprendre au briefing':'Retourner au garage',act:()=>this.restore()},...(this.job?[{label:'Abandonner le contrat',act:()=>this.abandon()}]:[])])}}
 private updateLife(dt:number){
  this.streets.setParked(this.car,this.carAngle,!this.driving)
  if(this.archiveSeen&&distance(this.q,this.archPos())<17&&this.streets.clear(this.q,this.archPos())){const prev=this.archTime;this.archTime+=dt;if(prev<18&&this.archTime>=18)this.syncGates()}
  const shift=this.localTime%24<9
  const closing=(this.archiveTime>0&&this.archiveTime<=dt)||(this.diversionTime>0&&this.diversionTime<=dt)
  this.archiveTime=Math.max(0,this.archiveTime-dt);this.diversionTime=Math.max(0,this.diversionTime-dt)
  if(shift!==this.shiftOpen||closing||this.gatePending){this.shiftOpen=shift;this.syncGates()}
  const period=clockPeriod(this.localTime)
  if(period!==this.period){this.period=period;for(const n of this.people){if(n.flow===undefined||n.zone===undefined)continue
   const f=footFlow(n.zone,n.flow,period),pts=f.points.filter(q=>this.streets.vacant(q));if(pts.length){n.patrol=pts;n.index=0;n.timer=0;n.wait=f.wait;n.door=f.door;n.activity=f.label}}}
  const near:Point[]=[];for(const n of this.people){if(n.hp<=0||n.indoors||distance(n.q,this.q)>48)continue;near.push(n.q)
   if(!n.guard&&n!==this.escort&&this.alertTTL>0&&distance(n.q,this.q)<10&&n.interest<=0){n.investigate=n.patrol[Math.min(2,n.patrol.length-1)];n.interest=4;n.timer=0}}
  this.traffic.update(dt,this.q,this.car,this.alertTTL>0,near,this.localTime)
  if(this.escort){const n=this.escort,d=distance(n.q,this.q);if(n.hp<=0||this.escortStall>12){n.hp=55;n.down=0;this.escort=null;this.step=this.job==='guide'?0:1;this.escortStall=0;this.ui.toast('Escorte interrompue · retrouvez votre accompagnant au départ')}
   else if(d>2&&d<15&&!this.driving){n.investigate={...this.q};n.interest=2;if(!this.escortProgress||distance(n.q,this.escortProgress)>.45){this.escortProgress={...n.q};this.escortStall=0}else this.escortStall+=dt}
   else {n.investigate={...n.q};n.interest=2;n.plan=[];this.escortStall=0}}
 }
 private carContact(dx:number,dz:number){
  if(this.impactId!==null&&distance(this.car,this.impactAt)>.65)this.impactId=null
  const hit=this.streets.lastImpact;if(!hit||hit.id===this.impactId)return
  const index=this.streets.cars.get(hit.id),other=index===undefined?null:this.traffic.cars[index]
  const vx=dx*this.speed-(other?Math.sin(other.angle)*other.speed:0),vz=dz*this.speed-(other?Math.cos(other.angle)*other.speed:0)
  const closing=Math.abs(vx*hit.normal.x+vz*hit.normal.z),severity=closing>12?3:closing>5?2:1
  const frontal=Math.abs(hit.normal.x*dx+hit.normal.z*dz)>.67
  this.view.carImpact(hit.contact.x,hit.contact.z,severity,frontal);this.audio.beep(110-severity*15,.09+severity*.035,40,'sawtooth')
  if(index!==undefined){this.traffic.hit(index,severity);if(severity>=2)this.confirm(this.car,'Accrochage signalé')}
  const prop=hit.solid&&this.view.furniture.get(hit.solid);if(prop)prop.rotation.z=Math.min(1.12,prop.rotation.z+.21*severity)
  this.impactId=hit.id;this.impactAt={...this.car}
 }
 private simulate(dt:number){
  this.prev={...this.q};this.prevCar={...this.car};this.elapsed+=dt;this.quiet+=dt;this.gun-=dt;this.threatPulse-=dt;this.alertTTL=Math.max(0,this.alertTTL-dt);this.updateLife(dt)
  this.cool=this.cool.map(x=>Math.max(0,x-dt));this.cameraOff=Math.max(0,this.cameraOff-dt);this.droneOff=Math.max(0,this.droneOff-dt)
  if(this.gateTime>0){this.gateTime-=dt;if(this.gateTime<=0){if(distance(this.q,sites.gate)<2||distance(this.car,sites.gate)<3)this.gateTime=.5;else this.syncGates()}}
  const axis=(pos:string[],neg:string[])=>Number(pos.some(k=>this.keys.has(k)))-Number(neg.some(k=>this.keys.has(k)))
  const x=axis(['d','arrowright'],['a','q','arrowleft']),z=axis(['s','arrowdown'],['w','z','arrowup'])
  this.aim=this.view.pick(this.nx,this.ny,ground(this.q.x,this.q.z));this.angle=angleTo(this.q,this.aim)
  if(this.driving){const accel=-z;if(accel)this.speed+=accel*(this.speed*accel<0?25:11)*dt;else this.speed*=Math.exp(-dt*1.45);if(this.keys.has(' '))this.speed*=Math.exp(-dt*7)
    this.speed=Math.max(-8,Math.min(24,this.speed));const angle=this.carAngle-x*dt*1.85*Math.min(1,Math.abs(this.speed)/3)*Math.sign(this.speed);if(this.streets.vacant(this.car,true,angle))this.carAngle=angle
    const dx=Math.sin(this.carAngle),dz=Math.cos(this.carAngle),v=this.speed*dt,m=this.streets.move(this.car,dx*v,dz*v,true,this.carAngle)
    this.carContact(dx,dz)
    if(distance(m,this.car)<Math.abs(v)*.7){if(Math.abs(this.speed)>13)this.damage(7);this.speed*=-.12}this.car=m;this.q={...m};this.audio.engine(this.speed)
    for(const n of this.people)if(!n.indoors&&n.hp>0&&n.hit<.05&&distance(n.q,m)<2.2&&Math.abs(this.speed)>2.5){this.hurt(n,Math.abs(this.speed)>10?100:17,dx*Math.sign(v),dz*Math.sign(v));if(this.people.some(w=>w!==n&&w.hp>0&&distance(w.q,m)<11&&this.streets.clear(w.q,m)))this.confirm(m,'Collision signalée')}
  }else{const len=Math.hypot(x,z),v=(this.keys.has('shift')?7.5:5.05)*dt/(len||1);this.moving=len>0
    const move=(dx:number,dz:number)=>{this.q=this.streets.move(this.q,dx,dz)}
    move(x*v,0);move(0,z*v);this.walk+=len?dt*11:0;if(this.fire)this.shoot()}
  let watching=false
  this.cameraAngle=Math.PI*.10+Math.sin(this.elapsed*.48)*.95
  if(!this.cameraOff&&this.see(sites.camera,this.cameraAngle,10,.63)){this.cameraSeen+=dt;watching=true;if(this.cameraSeen>.85)this.confirm(this.q,'Caméra du dépôt')}else this.cameraSeen=Math.max(0,this.cameraSeen-dt*2)
  if(this.droneOff<=0)this.sideTicker+=dt;this.dronePoint=p(sites.core.x+Math.sin(this.sideTicker*.30)*5,sites.core.z+Math.cos(this.sideTicker*.30)*3)
  if(this.save.ending!=='public'&&!this.droneOff&&distance(this.dronePoint,this.q)<6.5&&this.streets.clear(this.dronePoint,this.q)){watching=true;this.droneSeen+=dt;if(this.droneSeen>1)this.confirm(this.q,'Drone du Nœud')}else this.droneSeen=0
  for(const n of this.people){n.cool-=dt;n.hit=Math.max(0,n.hit-dt*2);if(n.hp<=0){n.down=Math.min(1,n.down+dt*4);continue}
   if(distance(n.q,this.q)>48){
    // Distant commuters advance on their route twice a second, without a full navigation search.
    if(n.flow!==undefined&&Math.floor(this.elapsed*2+n.flow*.13)!==Math.floor((this.elapsed-dt)*2+n.flow*.13)){
     if((n.dwell??0)>0)n.dwell!-=.5
     else{n.indoors=false;const goal=n.patrol[n.index],d=distance(n.q,goal)
      if(d<.85){n.indoors=!!n.door&&distance(n.q,n.door)<1;n.index=(n.index+1)%n.patrol.length;n.dwell=n.wait}
      else{const v=Math.min(.75,d)/d,m=this.streets.move(n.q,(goal.x-n.q.x)*v,(goal.z-n.q.z)*v);if(distance(n.q,m)<.04)n.index=(n.index+1)%n.patrol.length;n.q=m}}}
    continue}
   if(n.dwell&&n.dwell>0&&n.interest<=0){n.dwell-=dt;continue}n.indoors=false
   const privileged=this.save.route==='sorel'&&this.job==='ascent'&&this.step<2&&distance(this.q,sites.vestibule)<18;const active=n.guard&&!privileged&&!(this.save.ending==='public'&&district(n.q.x,n.q.z)===2)
   const seen=active&&this.see(n.q,n.angle,this.alertTTL?10:7,.65)
   if(seen){n.seen+=dt;watching=true;if(n.seen>.6){this.confirm(this.q,'Vigile en contact visuel');if(distance(n.q,this.q)<7&&n.cool<=0){n.cool=1.75;this.view.shot(n.q,this.q);this.damage(this.driving?3:8);if(this.paused)return}}}else n.seen=Math.max(0,n.seen-dt*1.5)
   n.interest-=dt;n.timer-=dt;let dest=n.interest>0&&n.investigate?n.investigate:n.patrol[n.index]
   if(distance(n.q,dest)<.85){if(n.interest>0){n.angle+=dt*.62;if(n.interest<3&&n.guard&&this.lastKnown){const exit=p(dest.x+2.7,dest.z+1.5);if(this.streets.vacant(exit)){n.investigate=exit;n.timer=0}this.lastKnown=null}}else{n.indoors=!!n.door&&distance(n.q,n.door)<1;n.index=(n.index+1)%n.patrol.length;n.dwell=n.wait||0;n.timer=0}continue}
   if(n.timer<=0){n.plan=this.streets.path(n.q,dest);n.timer=n.interest>0?.85:2.5}
   if(n.plan.length){const t=n.plan[0],d=distance(n.q,t);if(d<.09){n.plan.shift();continue}const a=angleTo(n.q,t);n.angle=seen?angleTo(n.q,this.q):a;const s=(n.interest>0?(this.alertTTL?3.8:2.8):1.55)*dt
    n.q=this.streets.move(n.q,Math.sin(a)*s,Math.cos(a)*s);n.phase+=dt*7}
  }
  this.alert=this.quiet<.16?'Repéré':watching?'Observé':this.alertTTL>0?'Recherche':'Discret'
  this.valid=this.hackTarget()?'Intrusion · cible compatible':''
  this.updateInteraction();this.streets.world.step()
 }
 private frame=(now:number)=>{this.frameId=requestAnimationFrame(this.frame);if(this.paused)return
  const dt=Math.min(.12,(now-(this.last||now))/1000);this.last=now;this.accumulator+=dt
  while(this.accumulator>=1/60&&!this.paused){this.simulate(1/60);this.accumulator-=1/60}if(this.paused)return
  const alpha=this.accumulator*60,q=p(lerp(this.prev.x,this.q.x,alpha),lerp(this.prev.z,this.q.z,alpha))
  this.view.camera(q,dt,this.carAngle,this.driving?this.speed:0);this.view.player.obj.visible=!this.driving;this.view.player.draw(q,this.angle,this.walk,this.moving?1:0,0)
  const car=p(lerp(this.prevCar.x,this.car.x,alpha),lerp(this.prevCar.z,this.car.z,alpha));this.view.car.position.set(car.x,ground(car.x,car.z),car.z);this.view.car.rotation.y=this.carAngle
  this.view.aim.position.set(this.aim.x,ground(this.aim.x,this.aim.z)+.13,this.aim.z);this.view.aim.visible=!this.driving
  const objective=this.target();this.view.marker.visible=this.job!==null||available(this.save).includes(this.next);this.view.marker.position.set(objective.q.x,ground(objective.q.x,objective.q.z)+.17,objective.q.z)
  const resident=this.npcs.get('résidente')!;resident.obj.visible=!(this.job==='escort'&&this.escort!==null);resident.draw(this.save.done.includes('escort')?p(sites.mina.x+1.5,sites.mina.z+.4):sites.resident,.7,0,0,0)
  this.npcs.get('gardienne')!.draw(sites.shopkeeper,.4,0,0,0);this.npcs.get('propriétaire')!.draw(sites.proprio,1.15,0,0,0);this.npcs.get('relais')!.draw(sites.contact,1.72,0,0,0);
  this.npcs.get('nadia')!.draw(sites.mina,2.8,0,0,0);this.npcs.get('lise')!.draw(sites.lise,-1,0,0,0);this.npcs.get('archiviste')!.draw(this.archPos(),1.6,this.elapsed*5,this.archTime>0&&this.archTime<18?1:0,0);this.npcs.get('varenne')!.draw(sites.core,1.1,0,0,0);this.view.serviceLights.visible=this.save.done.includes('module');this.view.market.visible=this.period!==2;this.view.nightExit.visible=this.save.done.includes('exit');this.view.publicRelays.visible=this.save.ending==='public';this.view.official.visible=this.save.ending==='seal';this.view.annotated.visible=this.save.done.includes('paper');this.view.purge.visible=this.save.done.includes('ascent')&&!this.save.ending;this.view.hemi!.intensity=[1.75,2.18,1.15][Math.max(0,this.period)];this.camObject.children[1].visible=this.cameraOff<=0;for(const light of this.view.brakeLights)(light.material as T.MeshBasicMaterial).color.set(this.driving&&(this.keys.has(' ')||this.keys.has('s'))?'#ff3838':'#942c34')
  this.mina.draw(this.minaPos,.35,0,0,0);this.sorel.draw(sites.sorel,-.65,0,0,0);this.pickup.visible=this.job==='chip'&&this.step===0
  this.cameraCone.position.set(sites.camera.x,ground(sites.camera.x,sites.camera.z)+.14,sites.camera.z);this.cameraCone.rotation.y=this.cameraAngle;this.cameraCone.visible=this.cameraOff<=0
  this.drone.visible=this.save.ending!=='public';this.drone.position.set(this.dronePoint.x,ground(this.dronePoint.x,this.dronePoint.z)+(this.droneOff?.1:1.5),this.dronePoint.z)
  for(const n of this.people){n.actor.obj.visible=!n.indoors&&distance(n.q,q)<52;if(!n.actor.obj.visible){if(n.cone)n.cone.visible=false;continue}n.actor.draw(n.q,n.angle,n.phase,(n.dwell??0)>0?0:1,n.down,n.hit);if(n.cone){n.cone.position.set(n.q.x,ground(n.q.x,n.q.z)+.13,n.q.z);n.cone.rotation.y=n.angle;n.cone.visible=n.hp>0&&!(this.save.ending==='public'&&district(n.q.x,n.q.z)===2)}}
  this.view.render(q,dt,this.elapsed);this.uiTime+=dt;if(this.uiTime>.1){this.uiTime=0;this.ui.hud()}
 }
}
