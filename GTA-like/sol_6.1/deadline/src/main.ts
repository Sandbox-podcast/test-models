import * as T from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mountUI, $, toast, controlsHTML } from './ui';
import { buildCity, human, carModel, box, mat, segmentBlocked, label, ring, type Wall } from './scene';
import { BLOCKS, LOC, PATROLS, heightAt, district, DISTRICTS, BOUNDS, type Point } from './level';
import { freshSave, decodeSave, resumeSave, reward, finishGhost, finishRegistry, finishNode, SAVE_KEY, ENDINGS, ACTIVE, type Save, type Implant, type Route, type Ending } from './campaign';
import { Sound } from './audio';
import { Navigation } from './navigation';
import './style.css';

mountUI();
const sound=new Sound(),keys=new Set<string>();
let save:Save;try{save=resumeSave(decodeSave(localStorage.getItem(SAVE_KEY)));}catch{save=freshSave();}
let storageFailed=false;
function persist(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(save));}catch{if(!storageFailed){toast('Sauvegarde indisponible','Le navigateur bloque le stockage local.','danger');storageFailed=true;}}updateGates();}
let started=false,paused=false,modalOpen=false,dead=false,inCar=false,health=100,ammo=12,reserve=120,reloadUntil=0;
let time=0,seenAt=-100,heat=0,detection=0,confirmed=false,violenceUntil=0,shotAt=-10,shake=0;
let cooldown=[0,0],mouseDown=false,carSpeed=0,carAngle=Math.PI,aim=new T.Vector3(),lastDistrict='Les Forges';
let tracked:'main'|'side'='main';let dialogMode='';let frames=0,frameTime=0,fps=60;
let settings={volume:.35,quality:'high',blood:true,fps:false};
try{settings={...settings,...JSON.parse(localStorage.getItem('deadline.settings')||'{}')};}catch{}
sound.setVolume(settings.volume);
const ray=new T.Raycaster(),mouse=new T.Vector2(),plane=new T.Plane(new T.Vector3(0,1,0),0);
let checkpointSave=structuredClone(save);
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const lerp=T.MathUtils.lerp;
const near=(p:Point,r=3)=>dist(position(),p)<r;
function position():Point{return inCar?carBody.translation():playerBody.translation();}

let renderer:T.WebGLRenderer;
try{renderer=new T.WebGLRenderer({canvas:$('game') as HTMLCanvasElement,antialias:true,powerPreference:'high-performance'});}catch{
 $('load-status').textContent='WebGL indisponible. Active l’accélération graphique du navigateur puis recharge la page.';throw new Error('WebGL unavailable');
}
renderer.setPixelRatio(Math.min(devicePixelRatio,settings.quality==='high'?1.5:1));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=settings.quality==='high';renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
$('load-status').textContent='Chargement de la simulation physique';
try{await RAPIER.init();}catch(e){$('load-status').textContent='Impossible de charger la physique. Recharge la page.';throw e;}
const world=new RAPIER.World({x:0,y:0,z:0});world.timestep=1/60;
const city=buildCity(world),scene=city.scene;
const camera=new T.OrthographicCamera(-50,50,35,-35,.1,400);const cameraTarget=new T.Vector3(-82,0,44);let zoom=1;
const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
const bloom=new UnrealBloomPass(new T.Vector2(innerWidth,innerHeight),.32,.35,1.25);composer.addPass(bloom);composer.addPass(new OutputPass());
const player=human(0x5cbdbe);scene.add(player);
const playerHalo=ring(scene,-94,66,0x87e4dc,.68);
const playerBody=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(-94,.9,66));
const playerCollider=world.createCollider(RAPIER.ColliderDesc.capsule(.38,.34),playerBody);
const controller=world.createCharacterController(.035);controller.setSlideEnabled(true);controller.setApplyImpulsesToDynamicBodies(true);
const car=carModel();scene.add(car);
const carBody=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(LOC.car.x,.8,LOC.car.z).setCcdEnabled(true));
const carCollider=world.createCollider(RAPIER.ColliderDesc.cuboid(.98,.65,2.05),carBody);
const vehicleController=world.createCharacterController(.08);vehicleController.setSlideEnabled(true);
interface Agent { mesh:T.Group; body:RAPIER.RigidBody; collider:RAPIER.Collider; hp:number; state:'patrol'|'chase'|'search'|'lured'|'dead'; patrol:Point[]; index:number; target:Point; timer:number; shot:number; suspicion:number; civilian:boolean; home:Point; }
const guards:Agent[]=[],civilians:Agent[]=[];
function spawnAgent(p:Point,patrol:Point[],civilian=false,color=0x8d5251){
 const mesh=human(color,!civilian);scene.add(mesh);const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x,heightAt(p.x,p.z)+.9,p.z));const collider=world.createCollider(RAPIER.ColliderDesc.capsule(.38,.32),body);
 const a:Agent={mesh,body,collider,hp:civilian?45:75,state:'patrol',patrol,index:0,target:{...p},timer:0,shot:0,suspicion:0,civilian,home:{...p}};
 (civilian?civilians:guards).push(a);return a;
}
for(const p of PATROLS)spawnAgent(p[0],p);
for(const [i,p]of [{x:-70,z:43},{x:-4,z:39},{x:-125,z:87},{x:72,z:86},{x:108,z:83},{x:46,z:24},{x:10,z:52},{x:-48,z:95}].entries())spawnAgent(p,[p,{x:p.x+Math.sin(i*3)*12,z:p.z+Math.cos(i*2)*13}],true,[0x816785,0x486e7a,0x8b835b,0x7d5e58][i%4]);
const mina=human(0x698c75);mina.position.set(LOC.garage.x,heightAt(LOC.garage.x,LOC.garage.z),LOC.garage.z);mina.rotation.y=1.3;scene.add(mina);
const dropMina=human(0x698c75);dropMina.position.set(LOC.drop.x,0,LOC.drop.z);scene.add(dropMina);dropMina.visible=false;
const sorel=human(0x8f91a7);sorel.position.set(LOC.sorel.x,0,LOC.sorel.z);scene.add(sorel);
const contact=human(0x91617b);contact.position.set(LOC.collective.x,3,LOC.collective.z);scene.add(contact);
const chipMesh=box(scene,LOC.chip.x,.8,LOC.chip.z,.6,.15,.9,0xf6b94a,2.5);
const dossierCase=box(scene,LOC.side.x,.30,LOC.side.z,1.1,.5,.75,0x82664f);box(dossierCase,0,.25,0,.30,.1,.1,0xe4bc75);
box(scene,LOC.chip.x,.35,LOC.chip.z,2,.6,1.5,0x263a43);
box(scene,LOC.registry.x,heightAt(LOC.registry.x,LOC.registry.z)+.7,LOC.registry.z,1.6,1.4,.7,0x4e6470);box(scene,LOC.registry.x,heightAt(LOC.registry.x,LOC.registry.z)+1,LOC.registry.z+.4,1.2,.55,.08,0xf6b94a,1.5);
const serverGroup=new T.Group();scene.add(serverGroup);serverGroup.position.set(LOC.server.x,6,LOC.server.z);
for(let i=-1;i<=1;i++){box(serverGroup,i*2.1,1.5,0,1.8,3,1.8,0x263e48);for(let j=0;j<5;j++)box(serverGroup,i*2.1,.5+j*.45,1,.9,.1,.08,0x76d9df,2);}
const drone=new T.Group();scene.add(drone);box(drone,0,0,0,1.1,.4,.7,0x4b6a76);for(const x of [-.7,.7])box(drone,x,.2,0,.7,.08,.7,0x85c6cc,1);box(drone,0,-.25,.3,.22,.15,.2,0xf87969,2);let droneDisabled=0;
const nav=new Navigation();nav.rebuild(city.walls);
// All visual particles are pooled; no new meshes are created during combat.
const particles=Array.from({length:160},()=>{const mesh=new T.Mesh(new T.SphereGeometry(.1,4,3),mat(0xa13848));mesh.visible=false;scene.add(mesh);return{mesh,v:new T.Vector3(),life:0};});let particleIndex=0;
const stains=Array.from({length:55},()=>{const m=new T.Mesh(new T.CircleGeometry(1,12),new T.MeshBasicMaterial({color:0x751e35,transparent:true,opacity:.8,depthWrite:false}));m.rotation.x=-Math.PI/2;m.visible=false;scene.add(m);return m;});let stainIndex=0;
const tracers=Array.from({length:16},()=>{const mesh=new T.Mesh(new T.BoxGeometry(.04,.04,1),new T.MeshBasicMaterial({color:0xffd68d}));mesh.visible=false;scene.add(mesh);return{mesh,life:0};});let tracerIndex=0;
const lureRing=ring(scene,0,0,0x8adfda,2.3);lureRing.visible=false;let lureUntil=0,lureTarget:Point={x:0,z:0};
const rainCount=1400,rainPositions=new Float32Array(rainCount*6),rainGeo=new T.BufferGeometry();
for(let i=0;i<rainCount;i++){const x=Math.sin(i*333)*75,z=Math.cos(i*82)*65,y=(i%37)*.6;rainPositions.set([x,y,z,x-.1,y-.8,z+.2],i*6);}rainGeo.setAttribute('position',new T.BufferAttribute(rainPositions,3));const rain=new T.LineSegments(rainGeo,new T.LineBasicMaterial({color:0x87b5c0,transparent:true,opacity:.12,depthWrite:false}));scene.add(rain);
const mini=$('minimap') as HTMLCanvasElement,miniCtx=mini.getContext('2d')!;
let fullMap:HTMLCanvasElement|null=null;
let objective={point:LOC.garage as Point,title:'Puce fantôme',action:'Parler à Mina au garage',detail:'Un contrat t’attend dans la rue des ateliers.',chapter:'CHAPITRE I'};
function updateGates(){
 if(typeof city==='undefined')return;
 setGate(city.gates.shortcut,save.shortcut);setGate(city.gates.node,save.route==='sorel'||save.node==='complete');setGate(city.gates.gallery,save.route==='collective'||save.node==='complete');
 nav.rebuild(city.walls);
}
function setGate(w:Wall,open:boolean){if(!w)return;w.collider.setEnabled(!open);if(w.mesh)w.mesh.visible=!open;}
function calmCity(){heat=0;seenAt=time-10;violenceUntil=0;confirmed=false;health=Math.max(health,65);guards.forEach(g=>{if(g.hp>0){g.state='patrol';g.suspicion=0;}});}
function saveSettings(){try{localStorage.setItem('deadline.settings',JSON.stringify(settings));}catch{}sound.setVolume(settings.volume);renderer.setPixelRatio(Math.min(devicePixelRatio,settings.quality==='high'?1.5:1));renderer.shadowMap.enabled=settings.quality==='high';bloom.enabled=settings.quality==='high';resize();$('fps').classList.toggle('hidden',!settings.fps);}
function showModal(html:string,mode=''){keys.clear();mouseDown=false;modalOpen=true;dialogMode=mode;$('modal-content').innerHTML=html;$('modal').classList.remove('hidden');$('cursor').classList.add('hidden');document.body.classList.remove('playing');$('modal-close').focus();}
function closeModal(){if(dead)return;modalOpen=false;paused=false;dialogMode='';$('modal').classList.add('hidden');if(started){document.body.classList.add('playing');$('cursor').classList.remove('hidden');}}
function action(id:string,fn:()=>void){$(id)?.addEventListener('click',()=>{sound.ui();fn();});}
function showPause(){paused=true;showModal(`<span class="tag">CONNEXION SUSPENDUE</span><h2>La ville peut attendre.</h2><p>Ta progression est enregistrée aux points de reprise et après chaque contrat.</p><button class="primary" id="resume">Reprendre <b>↗</b></button><button class="secondary" id="pause-journal">Journal de mission</button><button class="secondary" id="pause-settings">Paramètres et commandes</button><button class="secondary" id="restart">Reprendre au point de contrôle</button>${ACTIVE(save)?'<button class="secondary danger-button" id="abandon">Abandonner le contrat suivi</button>':''}`,'pause');action('resume',closeModal);action('pause-journal',()=>showJournal());action('pause-settings',showSettings);action('restart',()=>resetCheckpoint());action('abandon',abandon);}
function showSettings(){
 showModal(`<span class="tag">CONFIGURATION</span><h2>Paramètres</h2><label class="settings-row">Volume <input id="volume" type="range" min="0" max="100" value="${settings.volume*100}"></label><label class="settings-row">Qualité graphique <select id="quality"><option value="high" ${settings.quality==='high'?'selected':''}>Élevée · ombres et halos</option><option value="low" ${settings.quality==='low'?'selected':''}>Légère · fluidité</option></select></label><label class="settings-row">Sang et traces d’impact <input id="blood" type="checkbox" ${settings.blood?'checked':''}></label><label class="settings-row">Afficher les performances <input id="show-fps" type="checkbox" ${settings.fps?'checked':''}></label><button id="help" class="secondary">Voir les commandes</button><button id="reset-save" class="secondary danger-button">Nouvelle campagne…</button>`,'settings');
 $('volume').oninput=()=>{settings.volume=Number(($('volume') as HTMLInputElement).value)/100;saveSettings();};$('quality').onchange=()=>{settings.quality=($('quality') as HTMLSelectElement).value;saveSettings();};$('blood').onchange=()=>{settings.blood=($('blood')as HTMLInputElement).checked;stains.forEach(s=>s.visible=settings.blood&&s.userData.used);saveSettings();};$('show-fps').onchange=()=>{settings.fps=($('show-fps')as HTMLInputElement).checked;saveSettings();};action('help',()=>showModal(controlsHTML,'controls'));action('reset-save',()=>{showModal('<span class="tag">NOUVELLE CAMPAGNE</span><h2>Recommencer cette nuit ?</h2><p>La progression locale et les choix de cette campagne seront remplacés.</p><button id="confirm-reset" class="primary">Recommencer</button><button id="cancel-reset" class="secondary">Garder ma campagne</button>');action('cancel-reset',showSettings);action('confirm-reset',()=>{save=freshSave();checkpointSave=structuredClone(save);persist();resetCheckpoint();if(!started)startGame();});});
}
function showJournal(tab='missions'){
 let content='';
 if(tab==='missions'){
  content=`<div class="journal-item"><small>${save.ghost==='complete'?'CONTRAT TERMINÉ':'CHAPITRE I'}</small><h3>Puce fantôme ${save.ghost==='complete'?'<span class="done">✓</span>':''}</h3><p>Prendre la puce dans le dépôt Civitas, puis rejoindre Mina sous les voies. Entrée principale au sud ; cour et grille à l’est. Le quai reste accessible sans implant.</p>${save.ghost==='complete'?'<p class="done">Grille de service ouverte · 450 ₡ versés · La Dalle accessible</p>':''}</div><div class="journal-item"><small>${save.registry==='complete'?'CONTRAT TERMINÉ':'CHAPITRE II'}</small><h3>Les effacés ${save.registry==='complete'?'<span class="done">✓</span>':''}</h3><p>Rencontrer le collectif à La Dalle. Récupérer le registre à l’est, puis choisir entre la galerie du collectif et le badge de Sorel.</p>${save.route?`<p class="done">${save.route==='collective'?'Galerie communautaire ouverte':'Badge de service obtenu'} · 650 ₡ versés</p>`:''}</div><div class="journal-item"><small>${save.node==='complete'?'CAMPAGNE TERMINÉE':'CHAPITRE III'}</small><h3>Le Nœud</h3><p>Atteindre le serveur du plateau administratif. L’entrée au nord est toujours accessible. La galerie ou le badge obtenu change l’approche. Décider du sort des identités.</p></div>${save.ghost==='complete'?`<div class="journal-item"><small>CONTRAT SECONDAIRE · ${save.side==='complete'?'TERMINÉ':'DISPONIBLE'}</small><h3>Les dossiers de la nuit</h3><p>Un réseau utilise des dossiers pour faire chanter les travailleuses et travailleurs du quartier. Récupère la valise à l’atelier ouest et apporte-la au relais de La Dalle.</p>${save.side!=='complete'?'<button class="secondary" id="track-side">Suivre ce contrat · 250 ₡</button>':'<p class="done">Les dossiers ont été détruits · 250 ₡ versés</p>'}</div>`:''}<button id="track-main" class="secondary">Suivre la campagne</button>`;
 }else if(tab==='contacts')content='<div class="journal-item"><h3>Mina · Mécanicienne</h3><p>Elle maintient les véhicules du collectif et protège les habitants révoqués. Son garage est un refuge. Elle veut rendre les preuves publiques, même si certains dossiers mettent ses protégés en danger.</p></div><div class="journal-item"><h3>Sorel · Service des révocations</h3><p>Elle a empêché une précédente purge et peut ouvrir les accès administratifs. Elle veut protéger les dossiers privés. Elle reste employée par l’entreprise responsable des révocations.</p></div>';
 else content=`<p>${save.shortcut?'✓ La grille entre les ateliers et le passage inférieur est ouverte.':'Aucun accès débloqué pour le moment.'}</p>${save.route?`<p>✓ ${save.route==='collective'?'La galerie de La Dalle donne accès au pied du bâtiment de service.':'Le badge de Sorel ouvre l’entrée de service au Nœud.'}</p>`:''}${save.ending?`<h3>${ENDINGS[save.ending].title}</h3><p>${ENDINGS[save.ending].text}</p>`:''}<p class="muted">Les décisions et récompenses sont enregistrées ensemble. Une récompense déjà reçue ne peut pas être créditée à nouveau.</p>`;
 showModal(`<span class="tag">JOURNAL DU COURSIER</span><h2>Ce qui reste de ton nom.</h2><nav class="tabs"><button id="tab-missions" class="${tab==='missions'?'active':''}">Missions</button><button id="tab-contacts" class="${tab==='contacts'?'active':''}">Contacts</button><button id="tab-consequences" class="${tab==='consequences'?'active':''}">Conséquences</button></nav>${content}`,'journal');for(const t of ['missions','contacts','consequences'])action('tab-'+t,()=>showJournal(t));action('track-side',()=>{tracked='side';if(save.side==='available'){save.side='accepted';save.checkpoint=true;checkpointSave=structuredClone(save);persist();}closeModal();toast('Les dossiers de la nuit','Contrat suivi : atelier de la rue ouest.');});action('track-main',()=>{tracked='main';closeModal();});
}
function showMap(){showModal('<span class="tag">ANGOULÊME / RÉSEAU LOCAL</span><h2>Une ville, trois niveaux.</h2><canvas id="full-map" class="full-map" width="560" height="420" aria-label="Carte complète des trois quartiers"></canvas><div class="map-legend"><span><i style="background:#73dcce"></i>Toi</span><span><i></i>Objectif suivi</span><span><i style="background:#e57870"></i>Vigiles</span><span><i style="background:#7c94a8"></i>Voiture</span></div><p class="muted">Le pont de l’avenue franchit les voies. Le passage piéton passe dessous. Les routes apparaissent en gris, les passages débloqués en vert.</p>','map');fullMap=$('full-map')as HTMLCanvasElement;drawMap(fullMap.getContext('2d')!,560,420,true);}
function speaker(name:string,role:string,text:string,buttons:string,extra=''){
 showModal(`<div class="dialog-portrait">${name[0]}</div><div class="dialog-speaker">${name}</div><div class="dialog-role">${role}</div><div class="dialog-body"><p>${text}</p>${extra}${buttons}</div>`,'dialog');
}
function garageDialog(){
 if(save.ghost==='available'){
  speaker('Mina','Mécanicienne · Les Forges','« Le dépôt Civitas reçoit les nouvelles listes cette nuit. Il y a une puce dans le terminal de la cour. Prends-la, puis retrouve-moi sous les voies. Ne ramène pas leur surveillance ici. Ta voiture est dehors. »','<button class="primary" id="accept-ghost">Accepter le contrat <b>450 ₡</b></button><button class="secondary" id="equip">Préparer mes implants</button>','<div class="dialog-route"><span><b>Avenue / entrée sud</b>Accès direct, vigiles en vue.</span><span><b>Cour / entrée est</b>Grille compatible, quai ouvert au sud.</span></div>');
  action('accept-ghost',()=>{save.ghost='accepted';save.checkpoint=true;checkpointSave=structuredClone(save);persist();tracked='main';closeModal();toast('Puce fantôme','Rejoins le dépôt. Deux accès sont indiqués dans le journal.');});
 }else speaker('Mina','Mécanicienne · Les Forges',save.ghost==='complete'?'« Ils ont mis ton nom sur la liste. Le collectif de La Dalle peut nous aider. Je t’ai ouvert la grille sous les voies. Tu trouveras aussi un contrat dans ton journal. »':'« Le dépôt est au nord. Prends l’avenue ou la cour latérale. Une fois la puce récupérée, retrouve-moi sous les voies. »','<button class="primary" id="equip">Préparer mes implants</button><button class="secondary" id="heal">Soins, munitions et réparation · gratuit</button>');
 action('equip',showLoadout);action('heal',()=>{health=100;ammo=12;reserve=120;closeModal();toast('Prêt à repartir','Santé, munitions et voiture restaurées.','success');});
}
function showLoadout(){
 const names:Record<Implant,string>={intrusion:'Intrusion',lure:'Leurre',overload:'Surcharge'};
 showModal(`<span class="tag">GARAGE DE MINA</span><h2>Deux implants. Ton approche.</h2><p>Intrusion ouvre une grille ou coupe une caméra pendant 12 secondes. Leurre attire les vigiles pendant 8 secondes. Surcharge immobilise un drone pendant 10 secondes.</p>${[0,1].map(slot=>`<h3>Emplacement ${slot+1} · touche ${slot+1}</h3><div class="loadout">${(['intrusion','lure','overload'] as Implant[]).map(i=>`<button data-slot="${slot}" data-implant="${i}" class="${save.implants[slot]===i?'selected':''}" ${i==='overload'&&save.ghost!=='complete'?'disabled':''}>${names[i]}${i==='overload'&&save.ghost!=='complete'?'<br><small>Après Puce fantôme</small>':''}</button>`).join('')}</div>`).join('')}<button id="loadout-done" class="primary">Équipement prêt</button>`,'loadout');
 document.querySelectorAll<HTMLButtonElement>('[data-implant]').forEach(b=>b.onclick=()=>{const slot=Number(b.dataset.slot),implant=b.dataset.implant as Implant,other=1-slot;if(save.implants[other]===implant)save.implants[other]=save.implants[slot];save.implants[slot]=implant;persist();showLoadout();});action('loadout-done',closeModal);
}
function collectiveDialog(){
 if(save.ghost!=='complete'){speaker('Le collectif','La Dalle','« Reviens avec une preuve. Ici, on a déjà perdu assez de noms pour ne plus croire les promesses. »','<button id="dialog-back" class="primary">Repartir</button>');action('dialog-back',closeModal);return;}
 if(save.registry==='available'){
 speaker('Le collectif','La Dalle · Relais des effacés','« Cette liste annonce la prochaine purge. Les archives à l’est contiennent le registre entier. Prends-le. Nous pouvons publier la preuve et ouvrir la galerie vers le Nœud. Sorel, elle, propose un badge. À toi de décider à qui confier les noms. »','<button id="accept-registry" class="primary">Récupérer le registre <b>650 ₡</b></button>');action('accept-registry',()=>{save.registry='accepted';save.checkpoint=true;checkpointSave=structuredClone(save);persist();tracked='main';closeModal();});
 }else if(save.registry==='carrying')registryChoice('collective');
 else{speaker('Le collectif','La Dalle','« La galerie est prête si tu nous fais confiance. Le Nœud domine le quartier, au nord. L’avenue est surveillée ; les passages sont à nous. »','<button id="dialog-back" class="primary">Continuer</button>');action('dialog-back',closeModal);}
}
function registryChoice(route:Exclude<Route,null>){
 speaker(route==='collective'?'Le collectif':'Sorel',route==='collective'?'La Dalle · Protection communautaire':'Civitas · Service des révocations',route==='collective'?'« Donne-nous le registre. Nous protégerons les habitants. La galerie vers le bâtiment de service est à toi. Mais rendre tout cela public exposera des vies. »':'« Je peux suspendre les révocations de l’intérieur. Ce badge ouvre le service du Nœud. Je ne te demande pas de croire Civitas. Je te demande de ne pas livrer les dossiers privés avec les preuves. »',`<button class="primary" id="give-registry">Confier le registre ${route==='collective'?'au collectif':'à Sorel'}</button><button class="secondary" id="keep-registry">Garder le registre pour le moment</button>`,`<div class="dialog-route"><span><b>Effet immédiat</b>${route==='collective'?'La galerie communautaire s’ouvre.':'Le badge ouvre la grille de service.'}</span><span><b>Conséquence future</b>${route==='collective'?'Une entrée à l’ouest du Nœud.':'Un accès direct à la cour technique.'}</span></div>`);
 action('keep-registry',closeModal);action('give-registry',()=>{save=finishRegistry(save,route);checkpointSave=structuredClone(save);persist();calmCity();sound.reward();closeModal();toast('Les effacés · contrat terminé',`${route==='collective'?'Galerie débloquée':'Badge obtenu'} · +650 ₡`,'success');});
}
function sorelDialog(){
 if(save.registry==='carrying'){registryChoice('sorel');return;}
 if(save.registry==='complete'&&save.node==='available'){
 speaker('Sorel','Civitas · Le Nœud','« Le serveur central est sur le plateau. Son terminal peut publier le registre, protéger les identités ou détruire le système. Aucune de ces décisions ne sera propre. L’entrée au nord reste accessible. Prépare ta sortie. »','<button class="primary" id="accept-node">Entrer dans le Nœud <b>1 000 ₡</b></button>');action('accept-node',()=>{save.node='accepted';save.checkpoint=true;checkpointSave=structuredClone(save);persist();closeModal();});return;
 }
 speaker('Sorel','Civitas · Service des révocations','« Les listes ne sont pas des chiffres. Ce sont des familles. Si tu trouves le registre à La Dalle, rapporte-le-moi avant de le rendre public. »','<button class="primary" id="dialog-back">Repartir</button>');action('dialog-back',closeModal);
}
function endingDialog(){
 showModal('<span class="tag">CHAPITRE III / LE NŒUD</span><h2>Qui aura la main ?</h2><p>Le registre contient des milliers de noms. Ton identité est sur la prochaine liste. Le terminal attend une décision.</p><button class="secondary" id="end-publish">Publier les preuves<small>Rétablir les identités et couper la surveillance. Les dossiers deviennent publics.</small></button><button class="secondary" id="end-protect">Confier le contrôle à Sorel<small>Suspendre les révocations et protéger les dossiers. Maintenir les services et la surveillance.</small></button><button class="secondary danger-button" id="end-destroy">Détruire le système<small>Supprimer les contrôles, les registres et les services qui en dépendent.</small></button>','ending-choice');
 for(const e of ['publish','protect','destroy']as const)action('end-'+e,()=>{save=finishNode(save,e);checkpointSave=structuredClone(save);persist();sound.reward();showEnding(e);});
}
function showEnding(e:Exclude<Ending,null>){const ending=ENDINGS[e];showModal(`<div class="ending-mark">D/L</div><span class="tag">L’AUBE / FIN DE CAMPAGNE</span><h2>${ending.title}</h2><p>${ending.text}</p><p class="muted">Ton choix est enregistré. La ville reste ouverte ; ses accès et sa surveillance reflètent cette décision. Conception et réalisation : DeadLine — Signal mort.</p><button id="free-roam" class="primary">Revenir dans la ville <b>↗</b></button>`,'ending');action('free-roam',()=>{heat=0;seenAt=time-10;violenceUntil=0;guards.forEach(g=>g.state=g.hp>0?'patrol':'dead');closeModal();toast('La ville se souvient','Campagne terminée · +1 000 ₡','success');});}

interface Interaction {title:string;detail:string;run:()=>void;priority?:number;}
function getInteraction():Interaction|null{
 if(inCar)return{title:Math.abs(carSpeed)>4?'Ralentir pour sortir':'Sortir du véhicule',detail:'Kasai Courier · conduite arcade',run:exitCar};
 if(near(LOC.garage,4))return{title:'Parler à Mina',detail:'Garage · Contact et équipement',run:garageDialog};
 if(save.ghost==='accepted'&&near(LOC.chip,2.7))return{title:'Prendre la puce fantôme',detail:'Civitas · Déclenche une intervention',run:()=>{save.ghost='carrying';persist();violenceUntil=time+16;heat=1;guards.slice(0,2).forEach(g=>{if(g.hp>0){g.state='search';g.target={...LOC.chip};g.timer=time+20;}});sound.alert();toast('Puce récupérée','Intervention au dépôt. Rejoins Mina sous les voies.','danger');}};
 if(save.ghost==='carrying'&&near(LOC.drop,3.5))return{title:'Remettre la puce à Mina',detail:time-seenAt<5?`Perdre la surveillance · encore ${Math.ceil(5-(time-seenAt))} s`:'Livraison possible · +450 ₡',run:()=>{if(time-seenAt<5){toast('Encore sous surveillance','Casse la ligne de vue pendant cinq secondes.','danger');return;}save=finishGhost(save);checkpointSave=structuredClone(save);persist();calmCity();sound.reward();toast('Puce fantôme · contrat terminé','Grille de service ouverte · Surcharge débloquée · +450 ₡','success');speaker('Mina','Sous les voies · Les Forges','« Ton nom est sur la liste. Tu as moins d’une journée. Le collectif de La Dalle saura lire le reste. J’ai ouvert la grille vers les ateliers. Va les voir. Et si tu veux aider le quartier, un autre contrat t’attend dans le journal. »','<button id="after-ghost" class="primary">Continuer dans la ville</button>');action('after-ghost',closeModal);}};
 if(near(LOC.collective,3.5))return{title:'Parler au collectif',detail:'La Dalle · Relais des effacés',run:collectiveDialog};
 if(near(LOC.sorel,3.5))return{title:'Parler à Sorel',detail:'Civitas · Service des révocations',run:sorelDialog};
 if(save.registry==='accepted'&&near(LOC.registry,2.6))return{title:'Extraire le registre',detail:'Archives · Choisir ensuite à qui le remettre',run:()=>{save.registry='carrying';persist();violenceUntil=time+12;heat=1;guards[2].state='search';guards[2].target={...LOC.registry};guards[2].timer=time+20;sound.alert();toast('Registre extrait','Le collectif ouvre une galerie. Sorel offre un badge.');}};
 if(save.node==='accepted'&&near(LOC.server,3))return{title:'Prendre le contrôle du serveur',detail:'Nœud central · Décision irréversible',run:endingDialog};
 if(save.ghost==='complete'&&save.side==='accepted'&&near(LOC.side,3))return{title:'Récupérer les dossiers',detail:'Contrat secondaire · Les dossiers de la nuit',run:()=>{save.side='carrying';persist();toast('Dossiers récupérés','Apporte-les au relais de La Dalle.');}};
 if(save.side==='carrying'&&near(LOC.sideDrop,3))return{title:'Détruire les dossiers de chantage',detail:'+250 ₡ · Libérer les personnes menacées',run:()=>{save=reward({...save,side:'complete'},'side',250);checkpointSave=structuredClone(save);persist();tracked='main';sound.reward();toast('Les dossiers de la nuit · terminé','Les dossiers ont été détruits · +250 ₡','success');}};
 if(dist(position(),carBody.translation())<3.4)return{title:'Entrer dans la voiture',detail:'Kasai Courier · E pour prendre le volant',run:enterCar};
 if(near(LOC.depotGate,3)&&city.gates.depot.collider.isEnabled())return{title:'Grille verrouillée',detail:'Implant Intrusion · Touche 1 ou 2 · Quai ouvert au sud',run:()=>toast('Grille compatible','Vise la grille et utilise Intrusion, ou contourne par le quai.')} ;
 return null;
}
function enterCar(){inCar=true;playerCollider.setEnabled(false);player.visible=false;keys.clear();sound.tone(60,.4,'sawtooth',.25);toast('Kasai Courier','Z/W : accélérer · S : marche arrière · Espace : frein · E : sortir');}
function exitCar(){
 if(Math.abs(carSpeed)>4){toast('Ralentis avant de sortir','Moins de 15 km/h pour quitter la voiture.');return;}
 const c=carBody.translation();const sides=[1,-1];
 for(const side of sides){const p={x:c.x+Math.cos(carAngle)*2.1*side,z:c.z-Math.sin(carAngle)*2.1*side};
  if(city.walls.some(w=>w.collider.isEnabled()&&Math.abs(p.x-w.x)<w.w/2+.5&&Math.abs(p.z-w.z)<w.d/2+.5))continue;
  inCar=false;carSpeed=0;playerBody.setTranslation({x:p.x,y:heightAt(p.x,p.z)+.9,z:p.z},true);playerBody.setNextKinematicTranslation({x:p.x,y:heightAt(p.x,p.z)+.9,z:p.z});playerCollider.setEnabled(true);player.visible=true;return;
 }toast('Sortie bloquée','Gare la voiture avec un côté dégagé.','danger');
}
function useImplant(slot:number){
 if(cooldown[slot]>time)return;const kind=save.implants[slot];const p=position();
 if(kind==='intrusion'){
  const gate=city.gates.depot;if(gate.collider.isEnabled()&&dist(p,LOC.depotGate)<15&&dist(aim,LOC.depotGate)<9){setGate(gate,true);nav.rebuild(city.walls);cooldown[slot]=time+14;sound.tone(760,.3,'triangle');toast('Grille ouverte','Cour du dépôt accessible.','success');return;}
  const cam=city.cameras.find(c=>dist(c.pos,p)<22&&dist(c.pos,aim)<10&&c.disabled<time);if(cam){cam.disabled=time+12;cooldown[slot]=time+14;sound.tone(760,.3);toast('Caméra neutralisée','Surveillance coupée pendant 12 secondes.','success');return;}
  toast('Aucune cible compatible','Vise une grille ou une caméra à proximité.');
 }else if(kind==='lure'){
  const d=dist(p,aim);if(d>27){toast('Signal hors de portée','Vise un point à moins de 27 mètres.');return;}
  lureTarget={x:aim.x,z:aim.z};lureUntil=time+8;lureRing.position.set(aim.x,heightAt(aim.x,aim.z)+.15,aim.z);lureRing.visible=true;
  guards.filter(g=>g.hp>0&&dist(g.body.translation(),aim)<27).forEach(g=>{g.state='lured';g.target={...lureTarget};g.timer=time+8;});cooldown[slot]=time+18;sound.tone(950,.4);toast('Signal projeté','Les vigiles proches vont enquêter.');
 }else{
  if(dist(p,drone.position)>19){toast('Drone hors de portée','Surcharge fonctionne à moins de 19 mètres.');return;}droneDisabled=time+10;cooldown[slot]=time+22;guards.filter(g=>dist(g.body.translation(),drone.position)<18&&g.hp>0).forEach(g=>{g.state='search';g.target={x:drone.position.x,z:drone.position.z};g.timer=time+12;});sound.tone(150,.4,'sawtooth');toast('Drone immobilisé','Les vigiles ont entendu la surcharge.');
 }
}
function bloodAt(p:Point,amount=10,direction?:Point){
 if(!settings.blood)return;for(let i=0;i<amount;i++){const q=particles[particleIndex++%particles.length];q.mesh.position.set(p.x,heightAt(p.x,p.z)+.8,p.z);q.mesh.visible=true;q.mesh.scale.setScalar(.6+Math.random());q.life=.4+Math.random()*.5;q.v.set((Math.random()-.5)*5+(direction?.x||0),Math.random()*4+2,(Math.random()-.5)*5+(direction?.z||0));}
 const stain=stains[stainIndex++%stains.length];stain.position.set(p.x,heightAt(p.x,p.z)+.09,p.z);stain.scale.set(.5+Math.random()*.7,.4+Math.random()*.5,1);stain.visible=true;stain.userData.used=true;
}
function hurtAgent(a:Agent,damage:number,from:Point){
 if(a.hp<=0)return;a.hp-=damage;const p=a.body.translation();bloodAt(p,damage>45?22:10,{x:(p.x-from.x)*.2,z:(p.z-from.z)*.2});a.mesh.rotation.z=.15;a.target={...position()};a.state=a.civilian?'search':'chase';a.timer=time+14;
 if(a.hp<=0){a.hp=0;a.state='dead';a.collider.setEnabled(false);a.mesh.rotation.z=Math.PI/2;a.mesh.position.y=heightAt(p.x,p.z)+.25;a.mesh.position.x+=.4;}
}
function hurt(damage:number){
 if(dead)return;health=Math.max(0,health-damage);shake=.16;$('damage').style.opacity='.55';setTimeout(()=>$('damage').style.opacity='0',120);sound.tone(70,.12,'triangle',.4);if(health<=0){dead=true;showModal('<span class="tag">IDENTITÉ PERDUE</span><h2>Ils t’ont retrouvé.</h2><p>Le contrat peut reprendre au briefing. Les conséquences des missions terminées sont conservées.</p><button class="primary" id="retry">Reprendre au point de contrôle</button><button class="secondary" id="death-abandon">Abandonner et retourner au garage</button>','death');action('retry',resetCheckpoint);action('death-abandon',abandon);}
}
function fire(){
 if(inCar||time-shotAt<.22||time<reloadUntil)return;if(ammo<=0){reload();return;}ammo--;shotAt=time;violenceUntil=time+12;sound.shot();shake=.10;
 const p=playerBody.translation(),dir=new T.Vector2(aim.x-p.x,aim.z-p.z).normalize();const range=47;let end={x:p.x+dir.x*range,z:p.z+dir.y*range},best=range,victim:Agent|null=null;
 for(let d=.5;d<range;d+=.4){const q={x:p.x+dir.x*d,z:p.z+dir.y*d};if(city.walls.some(w=>w.collider.isEnabled()&&Math.abs(q.x-w.x)<w.w/2&&Math.abs(q.z-w.z)<w.d/2)){best=d;end=q;break;}}
 for(const a of [...guards,...civilians]){if(a.hp<=0)continue;const ap=a.body.translation(),along=(ap.x-p.x)*dir.x+(ap.z-p.z)*dir.y,across=Math.abs((ap.x-p.x)*dir.y-(ap.z-p.z)*dir.x);if(along>0&&along<best&&across<.65){best=along;victim=a;end={x:p.x+dir.x*along,z:p.z+dir.y*along};}}
 if(victim)hurtAgent(victim,38,p);
 const t=tracers[tracerIndex++%tracers.length];t.mesh.position.set((p.x+end.x)/2,heightAt(p.x,p.z)+1.2,(p.z+end.z)/2);t.mesh.scale.z=best;t.mesh.rotation.y=Math.atan2(dir.x,dir.y);t.mesh.visible=true;t.life=.06;
 // Violence only confirms identity when a guard, civilian or camera actually sees it.
 for(const a of civilians)if(a.hp>0&&dist(a.body.translation(),p)<20&&!segmentBlocked(a.body.translation(),p,city.walls)){seenAt=time;heat=1;guards.filter(g=>g.hp>0&&dist(g.body.translation(),p)<60).forEach(g=>{g.state='chase';g.target={...p};g.timer=time+15;});break;}
}
function reload(){if(ammo===12||reserve<=0||time<reloadUntil)return;reloadUntil=time+1.25;sound.tone(210,.12,'square',.15);toast('Rechargement','1,2 seconde');}
function resetCheckpoint(){
 dead=false;health=100;ammo=12;reserve=120;reloadUntil=0;heat=0;seenAt=time-10;violenceUntil=0;inCar=false;carSpeed=0;carAngle=Math.PI;cooldown=[0,0];
 save=resumeSave(structuredClone(checkpointSave));save.checkpoint=ACTIVE(save);persist();playerCollider.setEnabled(true);player.visible=true;const spawn=save.node==='accepted'?{x:14,z:-59}:save.registry==='accepted'?{x:67,z:73}:{x:-94,z:66};playerBody.setTranslation({x:spawn.x,y:heightAt(spawn.x,spawn.z)+.9,z:spawn.z},true);playerBody.setNextKinematicTranslation({x:spawn.x,y:heightAt(spawn.x,spawn.z)+.9,z:spawn.z});
 carBody.setTranslation({x:LOC.car.x,y:.8,z:LOC.car.z},true);carBody.setNextKinematicTranslation({x:LOC.car.x,y:.8,z:LOC.car.z});
 [...guards,...civilians].forEach(a=>{a.hp=a.civilian?45:75;a.state='patrol';a.index=0;a.suspicion=0;a.timer=0;a.mesh.rotation.z=0;a.collider.setEnabled(true);a.body.setTranslation({x:a.home.x,y:heightAt(a.home.x,a.home.z)+.9,z:a.home.z},true);});
 city.cameras.forEach(c=>c.disabled=0);droneDisabled=0;setGate(city.gates.depot,false);nav.rebuild(city.walls);stains.forEach(s=>{s.visible=false;s.userData.used=false;});closeModal();cameraTarget.set(spawn.x,0,spawn.z);toast('Point de contrôle restauré','Briefing, véhicule et surveillance réinitialisés.');
}
function abandon(){if(tracked==='side'&&(save.side==='accepted'||save.side==='carrying'))save.side='available';else{if(save.ghost==='accepted'||save.ghost==='carrying')save.ghost='available';else if(save.registry==='accepted'||save.registry==='carrying')save.registry='available';else if(save.node==='accepted')save.node='available';}save.checkpoint=false;checkpointSave=structuredClone(save);persist();resetCheckpoint();}
function updateObjective(){
 if(tracked==='side'&&save.ghost==='complete'&&save.side!=='complete')objective={point:save.side==='carrying'?LOC.sideDrop:LOC.side,title:'Les dossiers de la nuit',action:save.side==='carrying'?'Détruire les dossiers au relais':'Récupérer les dossiers à l’atelier',detail:'Un réseau ne pourra plus s’en servir pour faire chanter le quartier.',chapter:'CONTRAT SECONDAIRE'};
 else if(save.ghost==='available')objective={point:LOC.garage,title:'Puce fantôme',action:'Parler à Mina au garage',detail:'Prépare tes implants et repère la voiture.',chapter:'CHAPITRE I'};
 else if(save.ghost==='accepted')objective={point:LOC.chip,title:'Puce fantôme',action:'Voler la puce au dépôt Civitas',detail:'Entrée principale au sud. Cour latérale à l’est.',chapter:'CHAPITRE I'};
 else if(save.ghost==='carrying')objective={point:LOC.drop,title:'Puce fantôme',action:'Rejoindre Mina sous les voies',detail:time-seenAt<5?`Sème les vigiles : ${Math.ceil(5-(time-seenAt))} s sans détection.`:'Livraison possible. La grille de service sera ouverte.',chapter:'CHAPITRE I / FUITE'};
 else if(save.registry==='available')objective={point:LOC.collective,title:'Les effacés',action:'Rencontrer le collectif à La Dalle',detail:'Le quartier résidentiel s’étend à l’est, sur le coteau.',chapter:'CHAPITRE II'};
 else if(save.registry==='accepted')objective={point:LOC.registry,title:'Les effacés',action:'Extraire le registre des archives',detail:'Contourne la façade. Le terminal est dans la cour arrière.',chapter:'CHAPITRE II'};
 else if(save.registry==='carrying')objective={point:dist(position(),LOC.collective)<dist(position(),LOC.sorel)?LOC.collective:LOC.sorel,title:'Les effacés',action:'Confier le registre au collectif ou à Sorel',detail:'Collectif : galerie communautaire. Sorel : badge de service.',chapter:'CHAPITRE II / DÉCISION'};
 else if(save.node==='available')objective={point:LOC.sorel,title:'Le Nœud',action:'Préparer l’opération avec Sorel',detail:'Retrouve-la près de la gare basse, au nord-ouest du plateau.',chapter:'CHAPITRE III'};
 else if(save.node==='accepted')objective={point:LOC.server,title:'Le Nœud',action:'Atteindre le serveur central',detail:save.route==='sorel'?'Ton badge ouvre la grille de service à l’ouest.':'La galerie du collectif est ouverte au sud-ouest.',chapter:'CHAPITRE III'};
 else objective={point:LOC.garage,title:'La ville se souvient',action:'Explorer librement',detail:save.ending?ENDINGS[save.ending].title:'Les Forges, La Dalle et Le Nœud restent accessibles.',chapter:'APRÈS L’AUBE'};
}

function moveBody(body:RAPIER.RigidBody,col:RAPIER.Collider,dx:number,dz:number,cc=controller){
 const p=body.translation();const y=heightAt(p.x+dx,p.z+dz)+.9;
 cc.computeColliderMovement(col,{x:dx,y:y-p.y,z:dz},RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,c=>!c.parent()||c.handle===carCollider.handle);
 const m=cc.computedMovement();body.setNextKinematicTranslation({x:p.x+m.x,y:y,z:p.z+m.z});return m;
}
let navTimer=0;let cachedTargets=new Map<Agent,Point>();
function tick(dt:number){
 time+=dt;const p=position();
 if(reloadUntil>0&&time>=reloadUntil){const n=Math.min(12-ammo,reserve);ammo+=n;reserve-=n;reloadUntil=0;}
 if(inCar){
  const throttle=(keys.has('w')||keys.has('z')||keys.has('arrowup')?1:0)-(keys.has('s')||keys.has('arrowdown')?1:0);
  const steer=(keys.has('a')||keys.has('q')||keys.has('arrowleft')?1:0)-(keys.has('d')||keys.has('arrowright')?1:0);
  carSpeed+=throttle*(throttle*carSpeed<0?32:16)*dt;
  carSpeed*=Math.exp(-(keys.has(' ')?6:throttle===0?1.0:.20)*dt);carSpeed=T.MathUtils.clamp(carSpeed,-12,32);
  carAngle+=steer*Math.min(1,Math.abs(carSpeed)/6)*1.65*dt*Math.sign(carSpeed||1);
  carBody.setNextKinematicRotation({x:0,y:Math.sin(carAngle/2),z:0,w:Math.cos(carAngle/2)});
  const dx=Math.sin(carAngle)*carSpeed*dt,dz=Math.cos(carAngle)*carSpeed*dt;
  const old=carBody.translation();vehicleController.computeColliderMovement(carCollider,{x:dx,y:heightAt(old.x+dx,old.z+dz)+.8-old.y,z:dz},undefined,undefined,c=>!c.parent());const m=vehicleController.computedMovement();carBody.setNextKinematicTranslation({x:old.x+m.x,y:heightAt(old.x+m.x,old.z+m.z)+.8,z:old.z+m.z});
  if(Math.hypot(m.x,m.z)<Math.hypot(dx,dz)*.45&&Math.abs(carSpeed)>5){shake=.2;carSpeed*=.45;sound.tone(80,.13,'sawtooth',.2);}
  for(const a of [...guards,...civilians])if(a.hp>0&&dist(old,a.body.translation())<2.2&&Math.abs(carSpeed)>3){hurtAgent(a,Math.abs(carSpeed)*5,old);if(Math.abs(carSpeed)>10){violenceUntil=time+10;shake=.2;}carSpeed*=.82;}
 }else{
  let dx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('q')||keys.has('arrowleft')?1:0),dz=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('z')||keys.has('arrowup')?1:0);
  const len=Math.hypot(dx,dz)||1,speed=keys.has('shift')?9.5:6;moveBody(playerBody,playerCollider,dx/len*speed*dt,dz/len*speed*dt);player.rotation.y=Math.atan2(aim.x-p.x,aim.z-p.z);
  const walking=!!(dx||dz);player.userData.legL.rotation.x=walking?Math.sin(time*speed*2)*.5:0;player.userData.legR.rotation.x=-player.userData.legL.rotation.x;
  if(mouseDown)fire();
 }
 let direct=false;let maxSuspicion=0;const protectedEnding=save.node==='complete'&&save.ending!=='protect';
 navTimer-=dt;if(navTimer<=0){navTimer=.8;cachedTargets.clear();}
 for(const a of [...guards,...civilians]){
  if(a.hp<=0)continue;const ap=a.body.translation();const restricted=(save.ghost!=='complete'&&p.x< -59&&p.z< -16&&p.z> -73)||(p.x>101&&p.z>20&&p.z<46)||(p.x>63&&p.z< -47);
  const activeThreat=!a.civilian&&(!protectedEnding||ap.x<23)&&(restricted||violenceUntil>time||heat>.1||a.state==='chase');
  const facing=Math.atan2(p.x-ap.x,p.z-ap.z)-a.mesh.rotation.y;
  const inVision=Math.abs(Math.atan2(Math.sin(facing),Math.cos(facing)))<1.2||a.state==='chase'||dist(ap,p)<3;
  const sees=activeThreat&&inVision&&dist(ap,p)<(inCar?25:19)&&!segmentBlocked(ap,p,city.walls);
  if(sees&&a.state!=='lured'){
   a.suspicion=Math.min(1,a.suspicion+dt/.85);maxSuspicion=Math.max(maxSuspicion,a.suspicion);
   if(a.suspicion>=1){direct=true;seenAt=time;heat=1;a.state='chase';a.target={...p};a.timer=time+14;}
  }else a.suspicion=Math.max(0,a.suspicion-dt*.5);
  let target=a.patrol[a.index],speed=a.civilian?1.2:2.7;
  if(a.state==='chase'||a.state==='search'||a.state==='lured'){
   if(!sees&&a.state==='chase')a.state='search';target=a.target;speed=a.state==='lured'?3.2:4.5;
   if(a.civilian){target={x:ap.x+(ap.x-p.x)*.8,z:ap.z+(ap.z-p.z)*.8};speed=5;}
   if(time>a.timer){a.state='patrol';a.suspicion=0;}
   if(!a.civilian&&a.state==='chase'&&sees&&dist(ap,p)<17&&time>a.shot){a.shot=time+1.8+Math.random()*.5;if(Math.random()>.28)hurt(inCar?2:5);const t=tracers[tracerIndex++%tracers.length];t.mesh.position.set((ap.x+p.x)/2,heightAt(p.x,p.z)+1.2,(ap.z+p.z)/2);t.mesh.scale.z=dist(ap,p);t.mesh.rotation.y=Math.atan2(p.x-ap.x,p.z-ap.z);t.mesh.visible=true;t.life=.07;sound.tone(130,.08,'sawtooth',.1);}
  }
  if(dist(ap,target)<1.2){if(a.state==='patrol')a.index=(a.index+1)%a.patrol.length;else if(a.state==='search'){target={x:a.target.x+Math.sin(time*.5+a.home.x)*5,z:a.target.z+Math.cos(time*.5)*5};}}
  let step=target;if(segmentBlocked(ap,target,city.walls,.5)){if(!cachedTargets.has(a))cachedTargets.set(a,nav.next(ap,target));step=cachedTargets.get(a)!;}
  const d=dist(ap,step);if(d>.25){const dx=(step.x-ap.x)/d*speed*dt,dz=(step.z-ap.z)/d*speed*dt;moveBody(a.body,a.collider,dx,dz);a.mesh.rotation.y=Math.atan2(dx,dz);a.mesh.rotation.z=lerp(a.mesh.rotation.z,0,.15);a.mesh.userData.legL.rotation.x=Math.sin(time*9+a.home.x)*.4;a.mesh.userData.legR.rotation.x=-a.mesh.userData.legL.rotation.x;}
 }
 for(const c of city.cameras){
  if(c.disabled>time||protectedEnding){c.cone.visible=false;continue;}c.cone.visible=true;
  const dx=p.x-c.pos.x,dz=p.z-c.pos.z,d=Math.hypot(dx,dz),ang=Math.atan2(dx,dz);const diff=Math.atan2(Math.sin(ang-c.angle),Math.cos(ang-c.angle));
  if(d<18&&Math.abs(diff)<.5&&!segmentBlocked(c.pos,p,city.walls)){detection=Math.min(1,detection+dt/.9);maxSuspicion=Math.max(maxSuspicion,detection);if(detection>=1){direct=true;seenAt=time;heat=1;guards.filter(a=>a.hp>0&&dist(a.body.translation(),p)<55).forEach(a=>{if(a.state!=='lured'){a.state='chase';a.target={...p};a.timer=time+14;}});}}
 }
 if(maxSuspicion===0)detection=Math.max(0,detection-dt);
 if(heat>0&&!direct)heat=Math.max(0,heat-dt/15);
 if(direct&&!confirmed)sound.alert();confirmed=direct;
 drone.position.set(87+Math.sin(time*.13)*15,9+Math.sin(time*.5)*.2,-65+Math.cos(time*.13)*20);drone.rotation.y=time*.2;if(droneDisabled>time)drone.position.y=7;
 if(!protectedEnding&&droneDisabled<time&&dist(drone.position,p)<11&&p.x>35&&p.z< -20&&!segmentBlocked(drone.position,p,city.walls)){seenAt=time;heat=1;}
 world.step();
 // Presentation interpolates the kinematic bodies between fixed simulation ticks.
 previousPlayer.copy(currentPlayer);const pp=playerBody.translation();currentPlayer.set(pp.x,pp.y-.9,pp.z);
 previousCar.copy(currentCar);const cp=carBody.translation();currentCar.set(cp.x,cp.y-.8,cp.z);
 for(const a of [...guards,...civilians])if(a.hp>0){const v=a.body.translation();a.mesh.position.set(v.x,v.y-.9,v.z);}
 for(const q of particles)if(q.life>0){q.life-=dt;q.v.y-=12*dt;q.mesh.position.addScaledVector(q.v,dt);if(q.mesh.position.y<heightAt(q.mesh.position.x,q.mesh.position.z)+.1||q.life<=0)q.mesh.visible=false;}
 for(const t of tracers)if(t.life>0){t.life-=dt;t.mesh.visible=t.life>0;}
 lureRing.visible=lureUntil>time;if(lureRing.visible)lureRing.scale.setScalar(1+Math.sin(time*8)*.12);
 const curDistrict=district(p.x,p.z);if(curDistrict!==lastDistrict){lastDistrict=curDistrict;const d=DISTRICTS.find(d=>d.name===curDistrict)!;$('district-reveal').querySelector('strong')!.textContent=d.name;$('district-reveal').querySelector('span')!.textContent=d.text;$('district-reveal').classList.add('show');setTimeout(()=>$('district-reveal').classList.remove('show'),3400);}
 updateObjective();updateHUD(maxSuspicion);
}
const previousPlayer=new T.Vector3(-94,0,66),currentPlayer=previousPlayer.clone(),previousCar=new T.Vector3(LOC.car.x,0,LOC.car.z),currentCar=previousCar.clone();
function updateHUD(suspicion:number){
 $('credits').textContent=`${save.money.toLocaleString('fr-FR')} ₡`;$('district').textContent=lastDistrict;$('map-district').textContent=lastDistrict.toUpperCase();$('location-sub').textContent=DISTRICTS.find(d=>d.name===lastDistrict)?.text||'Ville basse';
 $('chapter').textContent=objective.chapter;$('objective-title').textContent=objective.title;$('objective-text').textContent=objective.action;$('objective-detail').textContent=objective.detail;const distance=dist(position(),objective.point);$('objective-distance').textContent=save.node==='complete'&&tracked==='main'?'':`${Math.round(distance)} m`;
 $('health').textContent=String(Math.ceil(health));$('health-fill').style.width=health+'%';$('health-fill').style.background=health<30?'#ef7b6c':'#8ed9c5';$('ammo').innerHTML=time<reloadUntil?'···':`${ammo} <small>/ ${reserve}</small>`;
 const state=confirmed?'confirmed':suspicion>.05?'observed':heat>.1?'search':'safe';$('alert').className='alert '+state;$('alert-title').textContent=state==='confirmed'?'Position confirmée':state==='observed'?'Vous êtes observé':state==='search'?'Recherche en cours':'Hors surveillance';$('alert-detail').textContent=state==='confirmed'?'Casse la ligne de vue':state==='observed'?'Quitte le champ de vision':state==='search'?'Dernière position inspectée':save.ghost==='carrying'?'Remise possible après 5 secondes':'Identité non confirmée';$('alert-fill').style.height=`${Math.max(suspicion,heat)*100}%`;
 const names:Record<Implant,string>={intrusion:'Intrusion',lure:'Leurre',overload:'Surcharge'};for(let i=0;i<2;i++){const el=$('implant-'+i),remaining=Math.max(0,cooldown[i]-time);el.querySelector('b')!.textContent=names[save.implants[i]];el.querySelector('span')!.textContent=remaining>0?`${remaining.toFixed(1)} s`:'Prêt';(el.querySelector('i') as HTMLElement).style.width=(remaining/(save.implants[i]==='lure'?18:save.implants[i]==='overload'?22:14))*100+'%';}
 const interaction=getInteraction();$('prompt').classList.toggle('hidden',!interaction);if(interaction){$('prompt-title').textContent=interaction.title;$('prompt-detail').textContent=interaction.detail;}
 $('vehicle').classList.toggle('hidden',!inCar);$('speed').textContent=String(Math.round(Math.abs(carSpeed)*3.6));$('coordinates').textContent=`${Math.round(position().x+150).toString().padStart(3,'0')} / ${Math.round(position().z+135).toString().padStart(3,'0')}`;
 dropMina.visible=save.ghost==='carrying';chipMesh.visible=save.ghost==='accepted';dossierCase.visible=save.side==='accepted';
 for(const [id,m]of Object.entries(city.markers)){m.visible=['garage','collective','sorel'].includes(id)||id==='chip'&&save.ghost==='accepted'||id==='drop'&&save.ghost==='carrying'||id==='registry'&&save.registry==='accepted'||id==='server'&&save.node==='accepted'||id==='side'&&save.side==='accepted'||id==='sideDrop'&&save.side==='carrying';m.children[0].rotation.z=time*.25;}
 drawMap(miniCtx,250,180,false);
}
function drawMap(ctx:CanvasRenderingContext2D,w:number,h:number,full:boolean){
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#0b1720';ctx.fillRect(0,0,w,h);const p=position(),scale=full?Math.min(w/318,h/272):1.35,cx=full?2:p.x,cz=full?-6:p.z;
 const sx=(x:number)=>(x-cx)*scale+w/2,sz=(z:number)=>(z-cz)*scale+h/2;
 ctx.strokeStyle='#8cabb010';ctx.lineWidth=1;for(let x=-150;x<160;x+=15){ctx.beginPath();ctx.moveTo(sx(x),0);ctx.lineTo(sx(x),h);ctx.stroke();}for(let z=-135;z<125;z+=15){ctx.beginPath();ctx.moveTo(0,sz(z));ctx.lineTo(w,sz(z));ctx.stroke();}
 ctx.strokeStyle='#354652';ctx.lineWidth=9*scale;for(const path of [[[-65,-125],[-65,114]],[[-143,13],[147,13]],[[-134,100],[143,100]],[[14,-110],[14,110]],[[70,12],[70,113]],[[30,-27],[145,-27]],[[91,-113],[91,-23]],[[-144,-83],[38,-83]]]){ctx.beginPath();path.forEach(([x,z],i)=>i===0?ctx.moveTo(sx(x),sz(z)):ctx.lineTo(sx(x),sz(z)));ctx.stroke();}
 ctx.lineWidth=3*scale;ctx.strokeStyle='#80929c66';ctx.beginPath();ctx.moveTo(sx(-145),sz(-5));ctx.lineTo(sx(94),sz(-5));ctx.stroke();
 for(const b of BLOCKS){ctx.fillStyle=b.x>23?(b.z< -14?'#36525e':'#4a4258'):'#3a4d59';ctx.fillRect(sx(b.x-b.w/2),sz(b.z-b.d/2),b.w*scale,b.d*scale);ctx.strokeStyle='#91b2c22a';ctx.lineWidth=.6;ctx.strokeRect(sx(b.x-b.w/2),sz(b.z-b.d/2),b.w*scale,b.d*scale);}
 ctx.fillStyle='#738d92';for(const g of Object.values(city.gates))if(g.collider.isEnabled())ctx.fillRect(sx(g.x-g.w/2),sz(g.z-g.d/2),Math.max(2,g.w*scale),Math.max(2,g.d*scale));
 if(save.shortcut){ctx.strokeStyle='#7cdbc0';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sx(-24),sz(36));ctx.lineTo(sx(-12),sz(36));ctx.stroke();}
 if(full){ctx.font='11px Consolas';ctx.textAlign='center';for(const d of DISTRICTS){ctx.fillStyle=d.color;ctx.fillText(d.name.toUpperCase(),sx(d.x),sz(d.z)+(d.name==='Les Forges'?28:0));}}
 const mark=(q:Point,color:string,r=3)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(sx(q.x),sz(q.z),r,0,Math.PI*2);ctx.fill();};
 for(const g of guards)if(g.hp>0)mark(g.body.translation(),g.state==='chase'?'#fb7462':'#a57b6e',full?2.3:2.7);
 for(const l of [LOC.garage,LOC.collective,LOC.sorel]){ctx.strokeStyle='#6bccc0';ctx.lineWidth=1;ctx.strokeRect(sx(l.x)-3,sz(l.z)-3,6,6);}
 const carP=carBody.translation();ctx.fillStyle='#9aaabd';ctx.save();ctx.translate(sx(carP.x),sz(carP.z));ctx.rotate(-carAngle);ctx.fillRect(-2,-4,4,8);ctx.restore();
 if(!(save.node==='complete'&&tracked==='main')){ctx.strokeStyle='#f6b94a';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(sx(objective.point.x),sz(objective.point.z)-6);ctx.lineTo(sx(objective.point.x)+5,sz(objective.point.z));ctx.lineTo(sx(objective.point.x),sz(objective.point.z)+6);ctx.lineTo(sx(objective.point.x)-5,sz(objective.point.z));ctx.closePath();ctx.stroke();}
 ctx.save();ctx.translate(sx(p.x),sz(p.z));ctx.rotate(-(inCar?carAngle:player.rotation.y));ctx.shadowBlur=8;ctx.shadowColor='#78e5d5';ctx.fillStyle='#8ee9d8';ctx.beginPath();ctx.moveTo(0,6);ctx.lineTo(-4,-4);ctx.lineTo(0,-2);ctx.lineTo(4,-4);ctx.closePath();ctx.fill();ctx.restore();
}
function resize(){const aspect=innerWidth/innerHeight,h=35/zoom;camera.left=-h*aspect;camera.right=h*aspect;camera.top=h;camera.bottom=-h;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);}
addEventListener('resize',resize);
function startGame(){
 started=true;paused=false;modalOpen=false;sound.start();$('menu').classList.add('hidden');$('hud').classList.remove('hidden');$('modal').classList.add('hidden');$('cursor').classList.remove('hidden');document.body.classList.add('playing');
 if(save.checkpoint){resetCheckpoint();}else toast(save.node==='complete'?'Après l’aube':'Les Forges, 23 h 41',save.ghost==='complete'?'Ta progression est restaurée. J pour les missions et les conséquences.':'Mina t’attend au garage. E pour interagir · J pour le journal.');
}
action('play',startGame);action('menu-continue',startGame);action('menu-controls',()=>showModal(controlsHTML,'controls'));action('menu-settings',showSettings);action('modal-close',closeModal);action('pause-button',()=>started?showPause():showSettings());action('journal-button',()=>showJournal());action('map-button',showMap);action('sound-toggle',()=>{settings.volume=settings.volume>0?0:.35;saveSettings();$('sound-toggle').textContent=settings.volume?'♫':'♪';$('sound-toggle').setAttribute('aria-label',settings.volume?'Couper le son':'Activer le son');});
addEventListener('keydown',e=>{
 const key=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright','tab'].includes(key)&&started)e.preventDefault();
 if(e.repeat){if(!modalOpen)keys.add(key);return;}
 if(key==='escape'){e.preventDefault();if(modalOpen){if(!dead)closeModal();}else if(started)showPause();return;}
 if(modalOpen){if((key==='j'&&dialogMode==='journal')||(key==='m'&&dialogMode==='map'))closeModal();return;}if(!started)return;
 keys.add(key);if(key==='e')getInteraction()?.run();if(key==='1'||e.code==='Digit1')useImplant(0);if(key==='2'||e.code==='Digit2')useImplant(1);if(key==='r')reload();if(key==='j'||key==='tab')showJournal();if(key==='m')showMap();
});addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
addEventListener('mousemove',e=>{mouse.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);$('cursor').style.left=e.clientX+'px';$('cursor').style.top=e.clientY+'px';});
$('game').addEventListener('mousedown',e=>{if(e.button===0&&started&&!modalOpen){mouseDown=true;sound.start();}});addEventListener('mouseup',()=>mouseDown=false);$('game').addEventListener('contextmenu',e=>e.preventDefault());
$('game').addEventListener('wheel',e=>{e.preventDefault();zoom=T.MathUtils.clamp(zoom-e.deltaY*.0005,.65,1.4);resize();},{passive:false});
function blur(){keys.clear();mouseDown=false;if(started&&!modalOpen&&!dead){paused=true;showModal('<span class="tag">PAUSE AUTOMATIQUE</span><h2>Connexion en attente.</h2><p>Le jeu est en pause pendant ton absence.</p><button id="focus-resume" class="primary">Reprendre</button>','focus');action('focus-resume',closeModal);}}
addEventListener('blur',blur);document.addEventListener('visibilitychange',()=>{if(document.hidden)blur();});
let last=performance.now(),accumulator=0;
function animate(now:number){
 requestAnimationFrame(animate);const delta=Math.min(.1,(now-last)/1000);last=now;frames++;frameTime+=delta;if(frameTime>=.5){fps=Math.round(frames/frameTime);frames=0;frameTime=0;$('fps').textContent=`${fps} IPS · ${renderer.info.render.calls} appels · ${Math.round(1000/Math.max(1,fps))} ms`;}
 if(started&&!paused&&!modalOpen&&!dead){accumulator+=delta;let count=0;while(accumulator>=1/60&&count++<6){tick(1/60);accumulator-=1/60;}}else accumulator=0;
 const alpha=accumulator*60;player.position.lerpVectors(previousPlayer,currentPlayer,alpha);car.position.lerpVectors(previousCar,currentCar,alpha);car.rotation.y=carAngle;playerHalo.position.set(player.position.x,player.position.y+.08,player.position.z);playerHalo.visible=started&&!inCar;
 const p=started?position():{x:-79,z:51};const anticipation=inCar?new T.Vector3(Math.sin(carAngle)*carSpeed*.45,0,Math.cos(carAngle)*carSpeed*.45):new T.Vector3();
 const target=new T.Vector3(p.x,0,p.z).add(anticipation);if(!started){target.x+=22;target.z-=12;}
 cameraTarget.lerp(target,1-Math.exp(-delta*3.7));camera.position.set(cameraTarget.x,cameraTarget.y+76,cameraTarget.z+49);camera.lookAt(cameraTarget.x,0,cameraTarget.z);
 if(shake>0){camera.position.x+=(Math.random()-.5)*shake;camera.position.z+=(Math.random()-.5)*shake;shake*=.83;}
 ray.setFromCamera(mouse,camera);plane.constant=-heightAt(p.x,p.z);ray.ray.intersectPlane(plane,aim);
 const under=Math.abs(p.z+6)<11&&Math.abs(p.x+65)>9;city.rail.traverse(o=>{if(o instanceof T.Mesh){const m=o.material as T.MeshStandardMaterial;m.transparent=true;m.opacity=lerp(m.opacity,under?.12:1,.1);m.depthWrite=m.opacity>.5;}});
 for(let i=0;i<city.roofs.length;i++){const r=city.roofs[i],b=BLOCKS[i],m=r.material as T.MeshStandardMaterial;const hidden=Math.abs(p.x-b.x)<b.w/2+2&&p.z>b.z&&p.z<b.z+b.d/2+b.h*.8;m.transparent=true;m.opacity=lerp(m.opacity,hidden?.2:1,.12);}
 if(started){const wp=new T.Vector3(objective.point.x,heightAt(objective.point.x,objective.point.z)+2.6,objective.point.z);wp.project(camera);const x=(wp.x*.5+.5)*innerWidth,y=(-wp.y*.5+.5)*innerHeight;$('waypoint').style.left=T.MathUtils.clamp(x,35,innerWidth-35)+'px';$('waypoint').style.top=T.MathUtils.clamp(y,80,innerHeight-160)+'px';$('waypoint').querySelector('span')!.textContent=Math.round(dist(p,objective.point))+' m';$('waypoint').classList.toggle('hidden',save.node==='complete'&&tracked==='main');}
 rain.position.set(cameraTarget.x,0,cameraTarget.z);rain.position.y=-((now*.006)%12);if(fullMap&&dialogMode==='map')drawMap(fullMap.getContext('2d')!,560,420,true);
 if(settings.quality==='high')composer.render();else renderer.render(scene,camera);
}
updateGates();resize();saveSettings();updateObjective();updateHUD(0);$('loading').classList.add('hidden');$('menu').classList.remove('hidden');($('play')as HTMLButtonElement).disabled=false;
if(save.ghost!=='available'||save.registry!=='available'){$('menu-continue').classList.remove('hidden');$('play').querySelector('span')!.textContent='Reprendre cette nuit';}
requestAnimationFrame(animate);
// Read-only diagnostics for build verification and performance inspection; no gameplay shortcuts.
(window as unknown as {deadline:unknown}).deadline={get state(){return{save:structuredClone(save),player:{...position()},inCar,health,ammo,reserve,heat,confirmed,objective:{...objective},fps,paused:paused||modalOpen,guards:guards.map(g=>({hp:g.hp,state:g.state,pos:{...g.body.translation()}})),car:{...carBody.translation()},time};}};
