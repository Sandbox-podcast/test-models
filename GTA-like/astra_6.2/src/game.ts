import R from '@dimforge/rapier3d-compat'
import * as T from 'three'
import {View,Actor} from './world'
import {Streets} from './physics'
import {AudioBus} from './audio'
import {sites,p,distance,ground,district,districts,type Point} from './level'
import {available,chapter,jobNames,finish,writeSave,type Job,type Save,type Implant} from './campaign'
export const ready=R.init()
export type Choice={label:string,act:()=>void}
export type Dialogue={title:string,from:string,body:string,choices:Choice[]}
type Hooks={talk:(dialog:Dialogue)=>void,toast:(msg:string)=>void,hud:()=>void}
type Person={q:Point,home:Point,actor:Actor,hp:number,angle:number,phase:number,down:number,hit:number,
 guard:boolean,patrol:Point[],index:number,plan:Point[],timer:number,investigate:Point|null,interest:number,seen:number,cool:number,cone?:T.Mesh}
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t
const angleTo=(a:Point,b:Point)=>Math.atan2(b.x-a.x,b.z-a.z)
export class Game{
 view:View;streets=new Streets();people:Person[]=[];q={...sites.spawn};prev={...this.q};car={...sites.car};prevCar={...this.car}
 driving=false;speed=0;carAngle=Math.PI/2;angle=0;walk=0;health=100;elapsed=0;phase=0
 paused=true;started=false;keys=new Set<string>();nx=0;ny=0;aim=p(0,0);fire=false;gun=0;cool=[0,0]
 step=0;quiet=99;alert='Discret';source='';lastKnown:Point|null=null;alertTTL=0;cameraSeen=0;cameraOff=0;gateTime=0;cameraAngle=0
 cameraCone:T.Mesh;camObject:T.Group;drone:T.Group;droneOff=0;droneSeen=0;dronePoint=p(128,-4)
 mina:Actor;sorel:Actor;pickup:T.Group;decor:T.Group[]=[];moving=false;hint='';valid='';interaction:(()=>void)|null=null
 private accumulator=0;private last=0;private uiTime=0;private threatPulse=0;private frameId=0;private sideTicker=0
 constructor(canvas:HTMLCanvasElement,public save:Save,public audio:AudioBus,private ui:Hooks){
  this.view=new View(canvas);this.mina=new Actor(this.view.scene,'#519a8d');this.sorel=new Actor(this.view.scene,'#9185a7')
  this.pickup=this.view.object(sites.chip,'PUCE','#e0ee68');this.camObject=this.view.object(sites.camera,'CAM 01','#ec9566')
  this.cameraCone=this.view.cone('#ffa048',10,.63);this.drone=this.view.object(this.dronePoint,'DRONE','#ef9677',.7)
  for(const [q,t] of [[sites.ledger,'REGISTRE'],[sites.core,'NOYAU'],[sites.parcel,'ARCHIVES'],[sites.contact,'RELAIS'],[sites.relay,'ANTENNE']] as const)this.decor.push(this.view.object(q,t,'#8fc9c6'))
  const add=(guard:boolean,start:Point,patrol:Point[],col:string)=>{const actor=new Actor(this.view.scene,col);const person:Person={q:{...start},home:start,actor,hp:guard?65:40,angle:0,phase:0,down:0,hit:0,guard,patrol,index:0,plan:[],timer:0,investigate:null,interest:0,seen:0,cool:0};if(guard)person.cone=this.view.cone('#f5b170',7,.65);this.people.push(person)}
  add(true,p(-27,-8),[p(-27,-8),p(-27,-3),p(-15,-3),p(-27,-3)],'#af6670')
  add(true,p(-14,-12),[p(-14,-12),p(-12,-18),p(-6,-21),p(-12,-18)],'#aa6c75')
  add(true,p(63,-17),[p(63,-17),p(67,-21),p(62,-26)],'#ad7581')
  add(true,p(132,-4),[p(132,-4),p(141,-4),p(143,0)],'#a66f82')
  add(false,p(-47,20),[p(-47,20),p(-51,20),p(-51,32)],'#818ca4')
  add(false,p(13,27),[p(13,27),p(2,27),p(-3,31)],'#be9572')
  add(false,p(54,6),[p(54,6),p(54,20),p(61,20)],'#73a69e')
  add(false,p(83,-4),[p(83,-4),p(88,-4),p(88,8)],'#c1888e')
  this.restore();this.frameId=requestAnimationFrame(this.frame)
 }
 get job(){return this.save.active}
 get next(){return this.save.track&&available(this.save).includes(this.save.track)?this.save.track:chapter(this.save)}
 get region(){return districts[district(this.q.x)]}
 get detection(){return Math.min(1,Math.max(this.cameraSeen/.85,this.droneSeen,...this.people.filter(n=>n.guard&&n.hp>0).map(n=>n.seen/.6)))}
 get observer(){if(this.cameraSeen>0)return 'Caméra du dépôt';if(this.droneSeen>0)return 'Drone du Nœud';return 'Vigile'}
 get minaPos(){return this.job==='chip'&&this.step===1?sites.drop:this.save.done.includes('chip')?sites.mina:sites.garage}
 clearInput(){this.keys.clear();this.fire=false}
 pause(){this.paused=true;this.clearInput();this.audio.engine(0)}
 resume(){if(this.health<=0)return;this.started=true;this.paused=false;this.last=performance.now();this.accumulator=0;this.clearInput();this.view.resize();this.audio.start();this.updateInteraction();this.ui.hud()}
 stop(){cancelAnimationFrame(this.frameId);this.pause()}
 syncGates(){for(const [id,on] of Object.entries({gate:this.gateTime>0,shortcut:this.save.done.includes('chip'),gallery:this.save.route==='collectif',service:this.save.route==='sorel'})){this.streets.setGate(id,on);this.view.gates.get(id)!.visible=!on}}
 restore(){
  this.q={...sites.spawn};this.prev={...this.q};this.car={...sites.car};this.prevCar={...this.car};this.carAngle=Math.PI/2;this.driving=false;this.speed=0;this.health=100;this.step=0;this.gun=0;this.cool=[0,0];this.quiet=99;this.alertTTL=0;this.lastKnown=null;this.cameraSeen=0;this.droneSeen=0;this.cameraOff=0;this.gateTime=0;this.droneOff=0;this.alert='Discret';this.source='';this.view.resetEffects()
  for(const n of this.people){Object.assign(n,{q:{...n.home},hp:n.guard?65:40,angle:0,index:0,plan:[],timer:0,interest:0,investigate:null,seen:0,cool:0,hit:0,down:0});n.actor.obj.visible=true}
  this.syncGates();this.view.snap(this.q);this.clearInput();this.updateInteraction()
 }
 startJob(j:Job){if(this.job||!available(this.save).includes(j))return;this.save.active=j;this.save.track=j;this.step=0;writeSave(this.save);this.ui.toast('Point de reprise enregistré au garage');this.updateInteraction()}
 abandon(){this.save.active=null;this.save.track=null;writeSave(this.save);this.restore();this.ui.toast('Retour en exploration libre')}
 target():{q:Point,label:string}{
  const j=this.job||this.next
  if(!this.job&&this.save.done.includes(j))return {q:sites.garage,label:'Explorer la ville libre'}
  if(!this.job){
   if(j==='chip')return {q:sites.garage,label:'Parler à Mina au garage'}
   if(j==='ledger')return {q:this.save.contact==='sorel'?sites.sorel:sites.mina,label:'Retrouver '+(this.save.contact==='sorel'?'Sorel':'Mina')+' à La Dalle'}
   if(j==='parcel')return {q:sites.contact,label:'Rencontrer le contact des ateliers'}
   if(j==='relay')return {q:sites.sorel,label:'Parler à Sorel'}
   return {q:this.save.route==='sorel'?sites.sorel:sites.mina,label:'Préparer l’entrée au Nœud'}
  }
  if(j==='chip')return this.step===0?{q:sites.chip,label:'Voler la puce au dépôt'}:{q:sites.drop,label:'Remettre la puce sous les voies'}
  if(j==='ledger')return this.step===0?{q:sites.ledger,label:'Récupérer le registre civil'}:{q:distance(this.q,sites.mina)<distance(this.q,sites.sorel)?sites.mina:sites.sorel,label:'Confier le registre à Mina ou à Sorel'}
  if(j==='core'){if(this.step===0)return {q:this.save.route==='sorel'?sites.service:sites.gallery,label:this.save.route==='sorel'?'Présenter le badge de service':'Traverser la galerie du collectif'};return {q:sites.core,label:'Accéder au terminal central'}}
  if(j==='parcel')return this.step===0?{q:sites.parcel,label:'Récupérer le pli aux archives'}:{q:sites.contact,label:'Rapporter le pli au relais'}
  return this.step===0?{q:sites.relay,label:'Réactiver l’antenne du plateau'}:{q:sites.sorel,label:'Confirmer la liaison à Sorel'}
 }
 private dialogue(from:string,title:string,body:string,choices:Choice[]){this.pause();this.ui.talk({from,title,body,choices})}
 private jobOffer(j:Job){
  const txt:Record<Job,string>={
   chip:'« Le convoi part à l’aube. La liste est sur une puce, au dépôt 09. Par l’avenue, tu tomberas sur les vigiles. Dans la cour, le quai reste ouvert et la grille répond à Intrusion. Prends ma voiture si tu veux. Je t’attendrai sous les voies. »',
   ledger:this.save.contact==='sorel'?'« J’ai signé des révocations pour garder mon poste. Le registre original est encore à l’annexe. Si tu le trouves, mes accès protégeront les adresses. Mina voudra les confier au quartier. »':'« Sorel a trouvé notre registre. Sans lui, les familles disparaissent des fichiers dès ce soir. Apporte-le au collectif, ou écoute ce que Sorel propose. Chez nous, les voisins se protègent. Certains voudront aussi des noms. »',
   core:'« La mise à jour part ce soir. Entre par notre accès et rejoins le terminal. Tu pourras rendre le registre public ou sceller les identités. Une fois transmis, personne ne pourra rappeler ton ordre. »',
   parcel:'« Les archives contiennent un pli sur les travailleuses du quartier. Quelqu’un monnaye leurs adresses. Rapporte le pli scellé ici avant qu’il change de mains. »',
   relay:'« La fréquence des dispensaires est coupée. Réactive l’antenne au sud du Nœud, puis reviens confirmer la liaison. »'}
  const from=j==='parcel'?'Relais des ateliers':j==='relay'||(j==='ledger'&&this.save.contact==='sorel')||(j==='core'&&this.save.route==='sorel')?'Sorel':'Mina'
  this.dialogue(from,jobNames[j],txt[j],[{label:'Accepter le contrat',act:()=>this.startJob(j)},{label:'Plus tard',act:()=>{}}])
 }
 private complete(j:Job){finish(this.save,j);this.step=0;this.quiet=99;this.alertTTL=0;this.lastKnown=null;this.syncGates();this.audio.beep(330,.36,870);this.updateInteraction()}
 private objectiveAction(){const j=this.job;if(!j){this.jobOffer(this.next);return}if(j==='chip'&&this.step===0){this.step=1;this.quiet=0;this.dispatch(sites.chip);this.ui.toast('Puce récupérée · Intervention au dépôt');this.audio.beep(240,.33,660);return}
  if(j==='chip'){if(this.quiet<5){this.ui.toast('Semez la surveillance pendant cinq secondes');return}
   this.dialogue('Mina','Vous êtes sur la liste.','« Ton nom est dans le prochain lot. La grille des ateliers est ouverte et j’ai viré tes 450 crédits. Pour la suite, tu peux passer par mon collectif ou aller voir Sorel, au service des révocations. »',['mina','sorel'].map((contact,i)=>({label:i?'Suivre la piste de Sorel':'Suivre la piste de Mina',act:()=>{this.save.contact=contact as 'mina'|'sorel';this.complete('chip');this.ui.toast('Grille ouverte · Contrat Courrier de nuit disponible')}})));return}
  if(j==='core'&&this.step===1){this.dialogue('Terminal central','Dernière transmission','Publier le registre désactive la surveillance du Nœud et expose les adresses. Le sceller préserve les dossiers personnels et maintient les contrôles administratifs.',[{label:'Publier le registre',act:()=>{this.save.ending='public';this.complete('core');this.epilogue()}},{label:'Sceller les identités',act:()=>{this.save.ending='seal';this.complete('core');this.epilogue()}}]);return}
  if(j==='ledger'&&this.step===1){const collective=distance(this.q,sites.mina)<distance(this.q,sites.sorel)
   this.dialogue(collective?'Mina':'Sorel','Confier le registre',collective?'Le collectif hébergera les familles et ouvrira sa galerie jusqu’au bâtiment de service. Ses membres détiendront une copie des adresses.':'Sorel effacera les adresses des dossiers transmis. Son badge vous donnera accès à l’entrée de service du Nœud. Elle gardera le registre original.',[{label:'Remettre le registre',act:()=>{this.save.route=collective?'collectif':'sorel';this.complete('ledger');this.ui.toast('650 crédits · Implant Surcharge disponible au garage')}},{label:'Garder le registre',act:()=>{}}]);return}
  if(this.step===0){this.step=1;this.audio.beep(420,.18,790);if(j==='ledger')this.dispatch(sites.ledger);this.ui.toast(this.target().label);return}
  this.complete(j);this.ui.toast(jobNames[j]+' · Contrat terminé')
 }
 private epilogue(){this.dialogue('Fin de campagne','Signal transmis',this.save.ending==='public'?'Les noms apparaissent sur les façades du plateau. Les contrôles du Nœud passent au noir. Dans les rues, le collectif organise les départs avant que les adresses circulent.':'Les dossiers personnels sont scellés. Les portes civiles répondent de nouveau aux badges. Sur le plateau, les drones continuent leurs rondes.',[{label:'Retourner en ville',act:()=>{}}])}
 private garage(){const allowed:Implant[]=this.save.done.includes('ledger')?['Intrusion','Leurre','Surcharge']:['Intrusion','Leurre'];const choices:Choice[]=allowed.map(implant=>({label:'Équiper '+implant+' en 1',act:()=>{const other=this.save.equip.find(i=>i!==implant)||allowed.find(i=>i!==implant)!;this.save.equip=[implant,other];writeSave(this.save);this.ui.toast(this.save.equip.join(' / '))}}))
  if(allowed.length===3)for(const implant of allowed.filter(i=>i!==this.save.equip[0]))choices.push({label:'Équiper '+implant+' en 2',act:()=>{this.save.equip[1]=implant;writeSave(this.save)}})
  this.dialogue('Garage de Mina','Établi des implants','Deux emplacements. Intrusion ouvre une grille ou coupe une caméra. Leurre détourne un vigile vers le point visé. Équipement actuel · '+this.save.equip.join(' et ')+'.',choices)
 }
 updateInteraction(){
  this.hint='';this.interaction=null;const near=(q:Point,r=3)=>distance(this.q,q)<r
  const bind=(hint:string,fn:()=>void)=>{this.hint=hint;this.interaction=fn}
  if(this.driving){bind(Math.abs(this.speed)>2?'Freiner pour sortir':'Sortir du véhicule',()=>this.exitCar());return}
  const target=this.target()
  if((this.job||available(this.save).includes(this.next))&&near(target.q,3.7)){
   if(this.job==='chip'&&this.step===1&&this.quiet<5){bind('Livraison dans '+Math.ceil(5-this.quiet)+' s sans détection',()=>this.ui.toast('Éloignez-vous des cônes de surveillance'));return}
   bind(target.label,()=>this.objectiveAction());return
  }
  if(!this.job){for(const [job,q] of [['parcel',sites.contact],['relay',sites.sorel],['ledger',this.save.contact==='sorel'?sites.sorel:sites.mina],['core',this.save.route==='sorel'?sites.sorel:sites.mina]] as const){if(available(this.save).includes(job)&&near(q)){bind('Contrat · '+jobNames[job],()=>this.jobOffer(job));return}}}
  if(near(this.car,3.35)){bind('Monter dans la voiture',()=>{this.driving=true;this.q={...this.car};this.prev={...this.q};this.audio.beep(90,.25,140,'triangle')});return}
  if(near(sites.garage,5)){bind('Configurer les implants',()=>this.garage());return}
 }
 interact(){if(this.paused)return;this.updateInteraction();this.interaction?.();this.updateInteraction();this.ui.hud()}
 workbench(){if(!this.driving&&distance(this.q,sites.garage)<6)this.garage();else this.ui.toast('L’établi se trouve au garage de Mina')}
 exitCar(){if(Math.abs(this.speed)>2){this.ui.toast('Ralentissez pour descendre');return}for(const n of [1,-1]){const q=p(this.car.x+n*Math.cos(this.carAngle)*1.92,this.car.z-n*Math.sin(this.carAngle)*1.92);if(this.streets.vacant(q)&&this.streets.clear(this.car,q)){this.q=q;this.prev={...q};this.driving=false;this.speed=0;this.audio.engine(0);return}}this.ui.toast('Les deux portières sont bloquées')}
 private dispatch(q:Point){for(const n of this.people.filter(n=>n.guard&&n.hp>0&&distance(n.q,q)<25)){n.investigate={...q};n.interest=9;n.timer=0}this.audio.beep(230,.18,110,'triangle')}
 private confirm(q:Point,source:string){this.quiet=0;this.source=source;this.lastKnown={...q};this.alertTTL=8;if(this.threatPulse<=0){this.audio.beep(500,.15,740);this.threatPulse=2}for(const n of this.people)if(n.guard&&n.hp>0&&distance(n.q,q)<21){n.investigate={...q};n.interest=8}}
 private see(origin:Point,heading:number,r:number,angle:number){const d=distance(origin,this.q);if(d>r)return false;const h=angleTo(origin,this.q);return (d<1.4||Math.cos(h-heading)>Math.cos(angle))&&this.streets.clear(origin,this.q)}
 private hurt(n:Person,damage:number,dx:number,dz:number){n.hp-=damage;n.hit=1;this.view.impact(n.q,dx,dz,damage>42||n.hp<=0);const pushed=this.streets.move(n.q,dx*(damage>42?.85:.3),dz*(damage>42?.85:.3));n.q=pushed
  if(n.hp<=0)n.plan=[];else if(!n.guard){n.investigate=p(n.q.x+dx*6,n.q.z+dz*6);n.interest=3;n.timer=0}
 }
 shoot(){if(this.paused||this.driving||this.gun>0)return;this.gun=.31;const a=angleTo(this.q,this.aim),dx=Math.sin(a),dz=Math.cos(a);let end=p(this.q.x+dx*25,this.q.z+dz*25)
  for(let t=.5;t<25;t+=.45){const next=p(this.q.x+dx*t,this.q.z+dz*t);if(!this.streets.clear(this.q,next)){end=next;break}const n=this.people.find(n=>n.hp>0&&distance(n.q,next)<.65);if(n){this.hurt(n,38,dx,dz);end=next;break}}
  this.view.shot(this.q,end);this.audio.beep(115,.11,28,'sawtooth')
  if(this.people.some(n=>n.hp>0&&distance(n.q,this.q)<12&&this.streets.clear(n.q,this.q)))this.confirm(this.q,'Tir signalé par un témoin')
 }
 private hackTarget(){return [{id:'camera',q:sites.camera},{id:'gate',q:sites.gate}].filter(v=>distance(this.q,v.q)<12&&distance(this.aim,v.q)<3.25).sort((a,b)=>distance(this.aim,a.q)-distance(this.aim,b.q))[0]}
 implant(slot:number){if(this.paused||this.driving)return;const name=this.save.equip[slot];if(this.cool[slot]>0){this.ui.toast('Implant en recharge');return}
  if(name==='Intrusion'){const v=this.hackTarget();if(!v){this.ui.toast('Visez la caméra ou la grille à moins de 12 m');return}if(v.id==='gate')this.gateTime=15;else{this.cameraOff=12;this.cameraSeen=0}this.syncGates();this.ui.toast(v.id==='gate'?'Grille ouverte · 15 s':'Caméra suspendue · 12 s');this.cool[slot]=16}
  if(name==='Leurre'){if(distance(this.q,this.aim)>19){this.ui.toast('Le signal porte à 19 m');return}const q={...this.aim};if(!this.streets.vacant(q)){this.ui.toast('Visez un point accessible au sol');return}for(const n of this.people)if(n.guard&&n.hp>0&&distance(n.q,q)<16){n.investigate=q;n.interest=6;n.seen=0;n.timer=0}this.ui.toast('Signal leurre émis');this.cool[slot]=10}
  if(name==='Surcharge'){if(distance(this.q,this.dronePoint)>10){this.ui.toast('Approchez-vous du drone du Nœud');return}this.droneOff=10;this.dispatch(this.dronePoint);this.cool[slot]=17;this.ui.toast('Drone immobilisé · 10 s')}
  this.audio.beep(290,.22,1200);this.ui.hud()
 }
 private damage(amount:number){this.health=Math.max(0,this.health-amount);this.audio.beep(90,.18,45,'triangle');if(this.health===0){this.dialogue('Signal interrompu','Coursier hors ligne',this.job?'La puce, le véhicule et les patrouilles reprendront leur position du briefing.':'Mina peut vous ramener au garage.',[{label:this.job?'Reprendre au briefing':'Retourner au garage',act:()=>this.restore()},...(this.job?[{label:'Abandonner le contrat',act:()=>this.abandon()}]:[])])}}
 private simulate(dt:number){
  this.prev={...this.q};this.prevCar={...this.car};this.elapsed+=dt;this.quiet+=dt;this.gun-=dt;this.threatPulse-=dt;this.alertTTL=Math.max(0,this.alertTTL-dt)
  this.cool=this.cool.map(x=>Math.max(0,x-dt));this.cameraOff=Math.max(0,this.cameraOff-dt);this.droneOff=Math.max(0,this.droneOff-dt)
  if(this.gateTime>0){this.gateTime-=dt;if(this.gateTime<=0){if(distance(this.q,sites.gate)<2||distance(this.car,sites.gate)<3)this.gateTime=.5;else this.syncGates()}}
  const axis=(pos:string[],neg:string[])=>Number(pos.some(k=>this.keys.has(k)))-Number(neg.some(k=>this.keys.has(k)))
  const x=axis(['d','arrowright'],['a','q','arrowleft']),z=axis(['s','arrowdown'],['w','z','arrowup'])
  this.aim=this.view.pick(this.nx,this.ny,ground(this.q.x,this.q.z));this.angle=angleTo(this.q,this.aim)
  if(this.driving){const accel=-z;if(accel)this.speed+=accel*(this.speed*accel<0?25:11)*dt;else this.speed*=Math.exp(-dt*1.45);if(this.keys.has(' '))this.speed*=Math.exp(-dt*7)
    this.speed=Math.max(-8,Math.min(24,this.speed));const angle=this.carAngle-x*dt*1.85*Math.min(1,Math.abs(this.speed)/3)*Math.sign(this.speed);if(this.streets.vacant(this.car,true,angle))this.carAngle=angle
    const dx=Math.sin(this.carAngle),dz=Math.cos(this.carAngle),v=this.speed*dt,m=this.streets.move(this.car,dx*v,dz*v,true,this.carAngle)
    if(distance(m,this.car)<Math.abs(v)*.7){if(Math.abs(this.speed)>13)this.damage(7);this.speed*=-.12}this.car=m;this.q={...m};this.audio.engine(this.speed)
    for(const n of this.people)if(n.hp>0&&n.hit<.05&&distance(n.q,m)<2.2&&Math.abs(this.speed)>2.5){this.hurt(n,Math.abs(this.speed)>10?100:17,dx*Math.sign(v),dz*Math.sign(v));if(this.people.some(w=>w!==n&&w.hp>0&&distance(w.q,m)<11&&this.streets.clear(w.q,m)))this.confirm(m,'Collision signalée')}
  }else{const len=Math.hypot(x,z),v=(this.keys.has('shift')?7.5:5.05)*dt/(len||1);this.moving=len>0
    const move=(dx:number,dz:number)=>{const next=this.streets.move(this.q,dx,dz);const d=distance(next,this.car);if(d>1.43||d>=distance(this.q,this.car))this.q=next}
    move(x*v,0);move(0,z*v);this.walk+=len?dt*11:0;if(this.fire)this.shoot()}
  let watching=false
  this.cameraAngle=Math.PI*.10+Math.sin(this.elapsed*.48)*.95
  if(!this.cameraOff&&this.see(sites.camera,this.cameraAngle,10,.63)){this.cameraSeen+=dt;watching=true;if(this.cameraSeen>.85)this.confirm(this.q,'Caméra du dépôt')}else this.cameraSeen=Math.max(0,this.cameraSeen-dt*2)
  if(this.droneOff<=0)this.sideTicker+=dt;this.dronePoint=p(134+Math.sin(this.sideTicker*.30)*5,-3+Math.cos(this.sideTicker*.30)*3)
  if(this.save.ending!=='public'&&!this.droneOff&&distance(this.dronePoint,this.q)<6.5&&this.streets.clear(this.dronePoint,this.q)){watching=true;this.droneSeen+=dt;if(this.droneSeen>1)this.confirm(this.q,'Drone du Nœud')}else this.droneSeen=0
  for(const n of this.people){n.cool-=dt;n.hit=Math.max(0,n.hit-dt*2);if(n.hp<=0){n.down=Math.min(1,n.down+dt*4);continue}
   if(distance(n.q,this.q)>48)continue
   const active=n.guard&&!(this.save.ending==='public'&&n.q.x>99)
   const seen=active&&this.see(n.q,n.angle,this.alertTTL?10:7,.65)
   if(seen){n.seen+=dt;watching=true;if(n.seen>.6){this.confirm(this.q,'Vigile en contact visuel');if(distance(n.q,this.q)<7&&n.cool<=0){n.cool=1.75;this.view.shot(n.q,this.q);this.damage(this.driving?3:8);if(this.paused)return}}}else n.seen=Math.max(0,n.seen-dt*1.5)
   n.interest-=dt;n.timer-=dt;let dest=n.interest>0&&n.investigate?n.investigate:n.patrol[n.index]
   if(distance(n.q,dest)<.85){if(n.interest>0){n.angle+=dt*.62;if(n.interest<3&&n.guard&&this.lastKnown){const exit=p(dest.x+2.7,dest.z+1.5);if(this.streets.vacant(exit)){n.investigate=exit;n.timer=0}this.lastKnown=null}}else{n.index=(n.index+1)%n.patrol.length;n.timer=0}continue}
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
  this.mina.draw(this.minaPos,.35,0,0,0);this.sorel.draw(sites.sorel,-.65,0,0,0);this.pickup.visible=this.job==='chip'&&this.step===0
  this.cameraCone.position.set(sites.camera.x,.14,sites.camera.z);this.cameraCone.rotation.y=this.cameraAngle;this.cameraCone.visible=this.cameraOff<=0
  this.drone.visible=this.save.ending!=='public';this.drone.position.set(this.dronePoint.x,ground(this.dronePoint.x,this.dronePoint.z)+(this.droneOff?.1:1.5),this.dronePoint.z)
  for(const n of this.people){n.actor.draw(n.q,n.angle,n.phase,1,n.down,n.hit);if(n.cone){n.cone.position.set(n.q.x,ground(n.q.x,n.q.z)+.13,n.q.z);n.cone.rotation.y=n.angle;n.cone.visible=n.hp>0&&!(this.save.ending==='public'&&n.q.x>99)}}
  this.view.render(q,dt,this.elapsed);this.uiTime+=dt;if(this.uiTime>.1){this.uiTime=0;this.ui.hud()}
 }
}
