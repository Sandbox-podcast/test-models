import R from '@dimforge/rapier3d-compat';
import './style.css';
import { Game, type Menu, type Pin } from './game';
import { blocks, bounds, buildings, clamp, distance, districtAt, districtNames, gates, rooms, walls, type Point, type Rect } from './level';
import { effects, getSide, implants, objectives, type Implant } from './progression';
import { fillPaving, ribbons } from './roads';
import { populationHour, populationPeriod } from './population';
import { weaponIds, weapons } from './arsenal';
import { showroom, vehicleClasses, vehicleIds } from './fleet';
import { venues } from './venues';
import { activityIds, activitySpec } from './activities';

const get = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;
const viewport = get<HTMLCanvasElement>('viewport');
const overlay = get('overlay'), dialog = get('dialog'), title = get('title'), hud = get('hud');
const play = get<HTMLButtonElement>('play');
const newGameButton = get<HTMLButtonElement>('new-game');
const body = get('dialog-body'), actions = get('dialog-actions'), close = get<HTMLButtonElement>('close');
const map = get<HTMLCanvasElement>('minimap'), ctx = map.getContext('2d')!;
const pins = get('waypoints');
const crosshair = get('crosshair');
const slots = [get('slot-1'), get('slot-2')];
const shade = document.querySelector<HTMLElement>('.vignette')!;
const moveKeys = new Set(['w','a','s','d','z','q','arrowup','arrowdown','arrowleft','arrowright','shift',' ']);
let game: Game | undefined;
let current: Menu | 'pause' | 'journal' | 'overview' | 'help' | 'restart' | null = null;
let previousFocus: HTMLElement | null = null;
let lastMap = 0;
let lastHud = 0;
const markerElements: HTMLElement[] = [];
const observerLabels = { camera: 'Caméra', guard: 'Vigile', drone: 'Drone' };

function show(kicker: string, heading: string, copy: string, isLocked = false) {
  if (overlay.hidden) previousFocus = document.activeElement as HTMLElement | null;
  game?.pause(true);
  get('dialog-kicker').textContent = kicker;
  get('dialog-title').textContent = heading;
  body.innerHTML = copy;
  actions.replaceChildren();
  actions.classList.remove('grid');
  close.hidden = isLocked;
  overlay.hidden = false;
  title.inert = true;
  hud.inert = true;
  dialog.scrollTop = 0;
  queueMicrotask(() => (close.hidden ? actions.querySelector('button') : close)?.focus());
}
function leave() {
  if (current === 'failed') return;
  current = null;
  overlay.hidden = true;
  title.inert = false;
  hud.inert = false;
  if (previousFocus && !previousFocus.closest('[hidden]')) previousFocus.focus({ preventScroll: true });
  if (game?.running) game.pause(document.hidden || !document.hasFocus());
}
function button(label: string, run: () => void, style = 'primary', disabled = false) {
  const b = document.createElement('button');
  b.className = style;
  b.textContent = label;
  b.disabled = disabled;
  b.addEventListener('click', run);
  actions.append(b);
  return b;
}
function choice(data: {label:string;now:string;later:string}, callback: () => void, disabled = false) {
  const b = button('', callback, 'choice', disabled);
  const name = document.createElement('span'), consequence = document.createElement('small');
  name.textContent = data.label;
  consequence.textContent = data.now + ' ' + data.later;
  b.append(name, consequence);
}

function commands() {
  current = 'help';
  show('DeadLine', 'Commandes', '<dl class="commands">' +
    '<dt>Se déplacer / conduire</dt><dd><kbd>ZQSD</kbd> <kbd>WASD</kbd> <kbd>↑ ↓ ← →</kbd></dd>' +
    '<dt>Courir à pied</dt><dd><kbd>Maj</kbd></dd>' +
    '<dt>Viser et tirer</dt><dd>Souris et clic gauche</dd>' +
    '<dt>Changer d’arme, inventaire, recharger</dt><dd><kbd>F</kbd> <kbd>I</kbd> <kbd>R</kbd></dd>' +
    '<dt>Parler, récupérer, entrer, sortir</dt><dd><kbd>E</kbd></dd>' +
    '<dt>Utiliser les implants</dt><dd><kbd>1</kbd> <kbd>2</kbd></dd>' +
    '<dt>Freiner en voiture</dt><dd><kbd>Espace</kbd></dd>' +
    '<dt>Se dégager du décor ou du véhicule</dt><dd><kbd>T</kbd></dd>' +
    '<dt>Activités de ville libre</dt><dd><kbd>G</kbd></dd>' +
    '<dt>Journal, carte et pause</dt><dd><kbd>Tab</kbd> <kbd>M</kbd> <kbd>Échap</kbd></dd></dl>');
  button('Fermer', leave);
}
function pause() {
  if (!game?.running) return;
  current = 'pause';
  show('DeadLine', 'En pause', '<p>Les contrats, vos achats et vos munitions sont enregistrés automatiquement.</p>');
  button('Reprendre', leave);
  button('Commandes', commands, 'secondary');
  button('Se dégager du décor',()=>{leave();game?.recover();},'secondary');
  if(game.activity) button('Abandonner l’activité',()=>{game?.cancelActivity();leave();},'secondary');
  button(game.sound.muted ? 'Activer le son' : 'Couper le son', () => {
    game!.sound.silence(!game!.sound.muted);
    pause();
  }, 'secondary');
  button('Menu principal', () => {
    game!.running = false;
    game!.pause(true);
    title.hidden = false;
    hud.hidden = true;
    play.textContent = 'Reprendre';
    newGameButton.hidden = false;
    leave();
    play.focus();
  }, 'secondary');
}

function history(g: Game) {
  const {chapter,route,ending,completed,records}=g.save;
  if(chapter===1) return '';
  const entries=['Mina a ouvert la grille vers les ateliers. Le bordereau de la puce porte la référence d’audit.'];
  if(chapter>=3) entries.push('Le calendrier papier identifie la résidence haute et la date de purge.');
  if(chapter>=4) entries.push('Le refus du portique est lié au bordereau de Civis.');
  if(route) entries.push(effects[route].now+' '+effects[route].later);
  for(const id of completed) entries.push(getSide(g.save,id).result);
  if(records) entries.push(records==='destroy'?'Lise a fait détruire les dossiers privés.':'Lise conserve les preuves dans sa permanence.');
  if(ending) entries.push(effects[ending].now+' '+effects[ending].later);
  return '<div class="history"><h3>Conséquences</h3>'+entries.map(line=>'<p>'+line+'</p>').join('')+'</div>';
}

function journal() {
  if(!game?.running) return;
  const g=game, objective=g.objective(), brief=objectives[g.save.chapter];
  current='journal';
  const side=g.save.side || (g.save.tracking==='main'?null:g.save.tracking);
  const task=side?getSide(g.save,side):brief;
  const remaining=g.offerIds.map(id=>getSide(g.save,id).name).join(' · ');
  const details=remaining?'<h3>Offres disponibles</h3><p>'+remaining+'</p>':'';
  show('Journal',g.save.ending?'Ville libre':brief.heading,
    '<h3>Objectif suivi</h3><p>'+objective.name+' · '+objective.text+'</p><p><em>'+task.briefing+'</em></p><p>'+task.access+'</p>'+details+history(g));
  button('Retour au jeu',leave);
  if(!g.busy && g.offerIds.length) button('Suivre une autre piste',()=>menu('offers'),'secondary');
}

function overview() {
  if(!game?.running) return;
  const g=game;
  current='overview';
  show('Plan de la ville','Les cinq quartiers','<canvas id="city-overview" width="720" height="510" aria-label="Carte des cinq quartiers avec les routes, les commerces et les activités"></canvas><p class="caption">Vert clair · vous. Or · objectif. Mauve · lieu visitable. Orange · activité. Bleu · patrouille proche.</p>');
  button('Retour au jeu',leave);
  button('Activités de ville libre',()=>menu('activities'),'secondary');
  actions.classList.add('grid');
  for(const venue of venues) button(venue.name,()=>{g.markVenue(venue.id);leave();},'secondary');
  if(g.destination) button('Effacer le repère',()=>{g.destination=undefined;overview();},'secondary');
  const map=get<HTMLCanvasElement>('city-overview'), c=map.getContext('2d')!;
  const f=Math.min((map.width-60)/(bounds.east-bounds.west),(map.height-74)/(bounds.south-bounds.north));
  const x=(value:number)=>map.width/2+(value-(bounds.west+bounds.east)/2)*f;
  const z=(value:number)=>map.height/2-(value-(bounds.north+bounds.south)/2)*f;
  c.fillStyle='#15222b';c.fillRect(0,0,map.width,map.height);
  c.fillStyle='#254c60';c.fillRect(x(43.5),z(-111),111*f,12.2*f);
  c.fillStyle='#83b1c2';c.font='600 13px Segoe UI';c.fillText('Charente',x(88),z(-118));
  for(const [cx,cz,w,d] of blocks){c.fillStyle='#263c46';c.fillRect(x(cx-w/2),z(cz-d/2),w*f,d*f);}
  fillPaving(c,x,z,'#66737d','#3e625d');
  for(const {area:[cx,cz,w,d]} of [...buildings,...rooms]){c.fillStyle='#344853';c.fillRect(x(cx-w/2),z(cz-d/2),w*f,d*f);}
  c.lineCap='round';
  for(const r of ribbons) {
    c.strokeStyle=r.pedestrian?'#84c6af':r.id==='P01'?'#ffc183':'#a7aea5';
    c.lineWidth=r.id==='P01'?2.8:1.45;
    c.setLineDash(r.pedestrian?[4,6]:[]);
    c.beginPath();for(const [i,s] of r.samples.entries()){if(i)c.lineTo(x(s.x),z(s.z));else c.moveTo(x(s.x),z(s.z));}c.stroke();
    if(/^J0[1-6]$|^P01$|^S02$/.test(r.id)){
      const p=r.samples[Math.round(r.samples.length*.57)];
      c.font='600 10px Segoe UI';c.fillStyle='#f2e6d4';c.fillText(r.id,x(p.x)+5,z(p.z)-6);
    }
  }
  c.setLineDash([]);
  c.beginPath();c.moveTo(x(-55),z(-41.9));c.lineTo(x(58),z(-41.9));c.strokeStyle='#ac9480';c.lineWidth=1.15;c.stroke();
  c.setLineDash([3,3]);c.beginPath();c.moveTo(x(13),z(-35.5));c.lineTo(x(13),z(-50));c.strokeStyle='#8ce9bd';c.lineWidth=2;c.stroke();c.setLineDash([]);
  c.fillStyle='#d3e1d2';c.font='600 10px Segoe UI';c.fillText('S01',x(13)+4,z(-46));
  const areas:Point[]=[[-46,22],[77,-31],[176,26],[80,-98],[148,101]];
  c.font='600 17px Segoe UI';c.textAlign='left';c.textBaseline='middle';
  for(const [i,at] of areas.entries()){
    c.lineWidth=3;c.strokeStyle='#13202b';c.fillStyle='#e3ede7';
    c.strokeText(districtNames[i],x(at[0]),z(at[1]));c.fillText(districtNames[i],x(at[0]),z(at[1]));
  }
  c.font='700 13px Segoe UI';c.fillStyle='#b7d1d3';c.fillText('N ↑',map.width-50,24);
  const marker=(at:Point,color:string)=>{
    c.beginPath();c.arc(x(at[0]),z(at[1]),5.7,0,Math.PI*2);c.fillStyle=color;c.fill();
    c.lineWidth=1.8;c.strokeStyle='#0d2123';c.stroke();
  };
  const destination=g.objective().pins[0];
  if(destination) marker(destination.at,'#f1db89');
  for(const venue of venues) marker(venue.entrance,g.destination?.label===venue.name?'#fff0bc':'#c2acd6');
  for(const id of activityIds){const job=activitySpec(id);marker(job.start,g.destination?.label===job.name?'#fff0bc':'#efa675');}
  for(const at of g.police.audible) if(distance(at,g.at)<46) marker(at,'#77b9f9');
  if(g.destination?.kind==='car') marker(g.destination.at,'#a9d8fb');
  marker(g.at,'#9cf1cb');
}

function menu(which:Menu) {
  const g=game!;
  const {chapter,ending,route,records}=g.save, brief=objectives[chapter];
  current=which;
  switch(which){
    case 'activities': {
      show('Ville libre','Activités de ville libre','<p>Choisissez une activité pour voir son départ et vos résultats.</p>');
      actions.classList.add('grid');
      for(const id of activityIds){
        const job=activitySpec(id), record=g.save.activities[id];
        choice({label:job.name,now:districtNames[job.district]+' · '+job.reward+' ₡.',later:record?`${record.count} terminée${record.count>1?'s':''}.`:job.vehicle?'En voiture.':'À pied.'},()=>g.showActivity(id));
      }
      button('Retour au jeu',leave,'secondary');
      break;
    }
    case 'activity': {
      const id=g.activityId,job=activitySpec(id),record=g.save.activities[id];
      const details=[job.vehicle?'En voiture':'À pied',job.time?job.time+' s':'Sans chrono',job.reward+' ₡'].join(' · ');
      const active=g.activity?.id===id;
      const access=active?'L’activité est en cours.':g.busy?'Terminez le contrat ou l’activité en cours.':g.police.level?'Attendez la fin de la recherche.':
        job.vehicle?'Arrêtez-vous au départ en voiture et appuyez sur G.':'Rejoignez le départ à pied et appuyez sur E.';
      show(districtNames[job.district],job.name,'<p>'+job.description+'</p><p class="caption">'+details+'</p><p>'+access+'</p>'+
        (record?`<p>Terminée ${record.count} fois${job.time?' · record '+record.best.toFixed(1)+' s':''}.</p>`:''));
      if(g.canStartActivity(id)) button('Démarrer l’activité',()=>{g.startActivity(id);leave();});
      else if(!active) button('Indiquer le départ sur la carte',()=>{g.markActivity(id);leave();});
      if(active) button('Abandonner l’activité',()=>{g.cancelActivity();leave();},'secondary');
      button(active?'Reprendre l’activité':'Retour au jeu',leave,'secondary');
      if(!active) button('Toutes les activités',()=>menu('activities'),'secondary');
      break;
    }
    case 'arsenal': {
      show('Équipement','Arsenal','<p>Chaque arme conserve son propre chargeur et sa réserve.</p>');
      actions.classList.add('grid');
      for(const id of weaponIds){
        const ammo=g.save.arsenal.ammo[id], item=weapons[id];
        if(!ammo) continue;
        const equipped=id===g.save.arsenal.equipped;
        choice({label:item.name+(equipped?' · Équipé':''),now:`${ammo.loaded} chargées, ${ammo.spare} en réserve.`,later:item.description},()=>{g.equipWeapon(id);menu('arsenal');},equipped);
      }
      button('Retour au jeu',leave,'secondary');
      break;
    }
    case 'venue': {
      const venue=g.venue;
      const amount=(value:number)=>value.toLocaleString('fr-FR')+' ₡';
      show(districtNames[venue.district],venue.name,
        '<p>'+venue.description+'</p><p class="caption">Solde '+amount(g.save.credits)+'</p>');
      actions.classList.add('grid');
      if(venue.kind==='arsenal') for(const id of weaponIds) {
        const item=weapons[id],ammo=g.save.arsenal.ammo[id];
        if(!ammo) choice({label:`Acheter ${item.name} · ${amount(item.price)}`,now:item.description,later:`Livré avec ${item.magazine} chargées et ${item.reserve} en réserve.`},
          ()=>{g.buyWeapon(id);menu('venue');},g.save.credits<item.price);
        else choice({label:`Munitions ${item.name} · ${amount(item.ammoPrice)}`,now:`Réserve ${ammo.spare}/${item.reserve}.`,later:`Ajoute jusqu’à ${item.box} munitions.`},
          ()=>{g.buyAmmo(id);menu('venue');},ammo.spare===item.reserve||g.save.credits<item.ammoPrice);
      }
      if(venue.kind==='showroom') for(const id of vehicleIds) {
        const item=showroom[id], spec=vehicleClasses[item.kind], owned=g.save.vehicles.includes(id);
        choice({label:owned?'Récupérer '+item.name:`Acheter ${item.name} · ${amount(item.price)}`,now:`${spec.name} · ${Math.round(spec.speed*3.6)} km/h.`,later:owned?'Place de livraison indiquée sur la carte.':'Véhicule livré sur le parvis.'},
          ()=>{if(owned)g.collectVehicle(id);else g.buyVehicle(id);leave();},!owned&&g.save.credits<item.price);
      }
      if(venue.kind==='home') {
        const purchased=g.save.properties.includes(venue.id);
        if(purchased) button('Se reposer et enregistrer ici',()=>{g.restHome(venue.id);leave();});
        else button('Acheter la maison · '+amount(venue.price),()=>{g.buyHome(venue.id);leave();},'primary',g.save.credits<venue.price);
      }
      if(venue.kind==='public'){
        const closed=venue.id==='market'&&populationPeriod(g.time)==='evening'&&distance(g.at,venue.use)>2.4;
        if(closed) body.insertAdjacentHTML('beforeend','<p>Ouverture à 5 h. Fermeture à 19 h.</p>');
        else button('Prendre un repas · 18 ₡',()=>{g.buyMeal();leave();},'primary',g.health>=100||g.save.credits<18);
      }
      button('Retour au jeu',leave,'secondary');
      break;
    }
    case 'garage': {
      const loadout=g.save.loadout;
      const equipment=g.availableImplants.map(i=>'<label><input type="checkbox" data-implant="'+i+'"'+(loadout.includes(i)?' checked':'')+'><span>'+
        implants[i].name+'</span><small>'+implants[i].help+'</small></label>').join('');
      const canAccept=chapter===1&&!g.busy;
      show('Garage des Forges / Mina',canAccept?brief.heading:'Garage de Mina',
        '<p>'+(canAccept?brief.briefing+'</p><p>'+brief.access:'Mina vous soigne et règle vos implants.')+
        '</p><h3>Équipez deux implants</h3><div class="loadout">'+equipment+'</div>');
      const inputs=Array.from(body.querySelectorAll<HTMLInputElement>('[data-implant]'));
      const selection=()=>inputs.filter(input=>input.checked).map(input=>input.dataset.implant as Implant);
      const apply=()=>{
        const selected=selection();
        if(selected.length===2&&(selected[0]!==loadout[0]||selected[1]!==loadout[1])) g.equip([selected[0],selected[1]]);
      };
      const accept=button(canAccept?'Accepter la mission':'Équiper et sortir',()=>{
        apply();if(canAccept) g.accept();leave();
      });
      button('Retour au jeu',()=>{apply();leave();},'secondary');
      if(g.received&&!g.busy) button('Offres des relais',()=>menu('offers'),'secondary');
      const update=()=>{
        const count=selection().length;accept.disabled=count!==2;
        for(const input of inputs) input.disabled=!input.checked&&count===2;
      };
      for(const input of inputs) input.addEventListener('change',update);
      update();
      break;
    }
    case 'brief':
      show(g.missionContact.contact,brief.heading,'<p><em>'+brief.briefing+'</em></p><p>'+brief.access+'</p>'+
        history(g));
      button('Accepter la mission',()=>{g.accept();leave();});
      button('Plus tard',leave,'secondary');
      if(g.offerIds.length) button('Quêtes locales',()=>menu('offers'),'secondary');
      break;
    case 'offers':
      show('Panneau des relais','Offres et quêtes disponibles',
        '<p>Suivez une piste dans le journal ou acceptez une offre commune.</p>');
      actions.classList.add('grid');
      for(const id of g.offerIds) {
        const q=getSide(g.save,id);
        choice({label:q.name,now:q.area+' · '+q.reward+' ₡.',later:id[0]==='U'?q.contact:'Offre du panneau.'},()=>{
          if(id[0]==='C'||distance(q.at,g.at)<3.5) g.selectSide(id);
          else {g.track(id);leave();}
        });
      }
      button('Suivre la campagne',()=>{g.track('main');leave();},'secondary');
      break;
    case 'offer': {
      const q=g.dossier;
      show(q.contact,q.name,'<p>'+q.briefing+'</p><p>'+q.access+'</p><p>Récompense de '+q.reward+' ₡.</p>');
      button('Accepter le contrat',()=>{g.acceptSide(g.selectedSide);leave();});
      button('Plus tard',leave,'secondary');
      break;
    }
    case 'route': {
      const recipient=g.routeContact;
      show(recipient==='sorel'?'Sorel':'Nadia Keita',brief.heading,recipient==='sorel'
        ? '<p>« J’ai signé une validation sous pression. Je peux maintenant établir ce qui s’est passé et protéger les dossiers privés. Si vous me confiez la copie, mon badge vous ouvrira le vestibule. »</p><p>Nadia attend à la permanence.</p>'
        : '<p>« J’ai déjà distribué des badges provisoires. Je veux que leurs bénéficiaires puissent encore rentrer demain. Confiez-moi la copie et nous ouvrirons la galerie. »</p><p>Sorel attend sur la place du coteau.</p>');
      choice(effects[recipient],()=>{g.finishRoute(recipient);leave();});
      button('Réfléchir',leave,'secondary');
      break;
    }
    case 'ending':
      show('Poste de commande / Civis','Droit d’accès','<p>Le registre est prêt. Les dossiers privés restent à l’écart dans les deux décisions.</p>');
      actions.classList.add('grid');
      choice(effects.publish,()=>g.finishEnding('publish'));
      choice(effects.protect,()=>g.finishEnding('protect'));
      break;
    case 'epilogue':
      show('DeadLine / Épilogue',ending==='publish'?'Le registre public':'Révocations annulées','<p>'+
        (ending?effects[ending].now+' '+effects[ending].later:'')+'</p><p>'+
        (route==='collective'?'Nadia maintient sa galerie et Mina garde le garage ouvert.':'Sorel vous remet une attestation. Votre badge répond de nouveau.')+'</p>');
      button('Continuer en ville libre',leave);
      break;
    case 'side-choice':
      show('Lise Marec','Les noms de la nuit','<p>« Ce sont leurs dossiers. Je veux leur rendre le contrôle. Tu peux les détruire ici ou me remettre la copie pour qu’elles et ils décident de la suite. »</p>');
      button('Détruire les dossiers privés',()=>{g.finishBlackmail('destroy');leave();});
      button('Remettre les preuves à Lise',()=>{g.finishBlackmail('give');leave();},'secondary');
      break;
    case 'failed':
      show(g.policeArrested?'Interpellation':'Intégrité à zéro','Séquence interrompue',g.policeArrested
        ?'<p>La patrouille vous a arrêté. Reprenez depuis votre point de sauvegarde.</p>'
        :'<p>Le point de reprise restaure le garage, la voiture, les vigiles et le premier objectif du contrat.</p>',true);
      button(g.busy?'Reprendre au point de sauvegarde':'Revenir au garage',()=>{current=null;g.retry(false);leave();});
      if(g.busy) button('Abandonner le contrat',()=>{current=null;g.retry(true);leave();},'secondary');
      break;
    case 'dialogue': {
      const lines:Record<string,string>={
        'Inès':'« Mon frère dort dans l’escalier depuis qu’on lui a coupé son badge. Nadia essaie de lui trouver une porte qui fonctionne. »',
        'Lise Marec':records==='destroy'?'« Les dossiers sont détruits. La permanence ouvre ce soir à la même heure. »':'« J’ai gardé les preuves sous clé. Les personnes concernées décideront de la suite à la permanence. »',
        'Élias Varenne':ending==='publish'?'« Les contrôles sont fermés. Vos relais devront assurer la continuité de service. »':'« La purge a été annulée. Désormais, chaque révocation passera par la cellule de contrôle. »',
        'Relais de quartier':'« On rétablit d’abord les accès des gens qui ne peuvent pas rentrer. Vous avez un badge ou un justificatif papier ? »',
      };
      show('Ville libre',g.dialoguePerson,'<p>'+lines[g.dialoguePerson]+'</p>');
      button('Reprendre la route',leave);
      break;
    }
  }
}

function text(id: string, value: string) {
  const el = get(id);
  if (el.textContent !== value) el.textContent = value;
}
function minimap(g: Game, markers: Pin[]) {
  const [x, z] = g.at, w = map.width, h = map.height, scale = 2.03;
  const sx = (a: number) => (a - x) * scale + w / 2;
  const sy = (b: number) => (b - z) * scale + h / 2;
  const area = ([cx, cz, width, depth]: Rect, tint: string) => {
    if (Math.abs(cx - x) > w / scale / 2 + width / 2 || Math.abs(cz - z) > h / scale / 2 + depth / 2) return;
    ctx.fillStyle = tint;
    ctx.fillRect(sx(cx - width / 2), sy(cz - depth / 2), width * scale, depth * scale);
  };
  ctx.fillStyle = '#131f29';
  ctx.fillRect(0, 0, w, h);
  for (const r of blocks) area(r, '#20313a');
  fillPaving(ctx,sx,sy,'#495963','#496e64');
  for (const b of buildings) area(b.area, '#37505b');
  for (const b of walls) if (b.height >= 1.6) area(b.area, '#445c65');
  for (const gate of gates) if (g.city.gateMeshes.get(gate.id)?.visible) area(gate.area, '#8d7771');
  for(const venue of venues) area([...venue.entrance,2.65,2.65],'#c2acd6');
  for(const id of activityIds) area([...activitySpec(id).start,2.5,2.5],'#efa675');
  for(const at of g.police.audible) area([...at,2.7,2.7],'#77b9f9');
  for (const guard of g.guards) {
    if (guard.health <= 0) continue;
    ctx.fillStyle = guard.state === 'pursue' ? '#ff9b79' : '#ac7464';
    ctx.fillRect(sx(guard.at[0]) - 1.5, sy(guard.at[1]) - 1.5, 3, 3);
  }
  for (const pin of markers) {
    const px = clamp(sx(pin.at[0]), 6, w - 6), py = clamp(sy(pin.at[1]), 6, h - 6);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = pin.kind === 'goal' ? '#e9f684' : '#80aeab';
    ctx.fillRect(-2.7, -2.7, 5.4, 5.4);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-(g.driven ? g.car.yaw : g.player.yaw));
  ctx.fillStyle = '#9aefce';
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.lineTo(-4.6, -4);
  ctx.lineTo(0, -2);
  ctx.lineTo(4.6, -4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function paint(g: Game) {
  if (!g.running || hud.hidden) return;
  const objective = g.objective();
  const width = window.innerWidth, height = window.innerHeight;
  const now = performance.now();
  const activePins = objective.pins.filter(pin => pin.kind === 'goal' || distance(pin.at, g.at) < (pin.kind === 'car' ? 25 : 36));
  if(g.destination) activePins.push(g.destination);
  markerElements.forEach((el, i) => { el.hidden = i >= activePins.length; });
  for (const [i, pin] of activePins.entries()) {
    let el = markerElements[i];
    if (!el) {
      el = document.createElement('div');
      el.className = 'waypoint';
      el.innerHTML = '<i></i><span></span>';
      pins.append(el);
      markerElements.push(el);
    }
    const p = g.project(pin.at, pin.kind === 'route' ? 1.65 : 2.25);
    const rawX = (p.x + 1) * width / 2, rawY = (1 - p.y) * height / 2;
    const x = clamp(rawX, width < 700 ? 40 : 112, width - 106);
    const y = clamp(rawY, width < 700 ? 164 : 165, height - 100);
    el.hidden = false;
    el.style.left = x + 'px';
    el.style.top = (i === 0 ? y : y + (Math.abs(rawY - y) > 4 ? 23 : 0)) + 'px';
    el.dataset.type = pin.kind;
    el.dataset.edge = String(rawX !== x || rawY !== y);
    const label = el.querySelector('span')!;
    if (label.textContent !== pin.label) label.textContent = pin.label;
  }
  crosshair.hidden = !g.pointer.visible || g.driven;
  crosshair.style.left = g.pointer.x + 'px';
  crosshair.style.top = g.pointer.y + 'px';
  crosshair.dataset.valid = String(g.validAim);

  if (now - lastHud < 55) return;
  lastHud = now;
  const district = districtNames[districtAt(...g.at)];
  text('district',district);
  const hour=populationHour(g.time), hours=String(Math.floor(hour)).padStart(2,'0'), minutes=String(Math.floor((hour%1)*60)).padStart(2,'0');
  const periods={morning:'Matin',day:'Journée',evening:'Soirée'};
  text('city-time',hours+':'+minutes+' · '+periods[populationPeriod(g.time)]);
  get('purge-clock').hidden=g.save.ending!==null || g.save.chapter<6 && !(g.save.chapter===5 && g.stage>0);
  text('purge-clock','Purge · '+g.purgeClock);
  text('map-name', district);
  text('mission-name', objective.name);
  text('objective-text', objective.text);
  get('activity-clock').hidden=!g.activity||!activitySpec(g.activity.id).time;
  text('activity-clock',Math.ceil(g.activityRemaining)+' s restantes');
  text('distance', objective.pins[0] ? Math.ceil(distance(g.at, objective.pins[0].at)) + ' m' : '');
  text('money', g.save.credits.toLocaleString('fr-FR') + ' ₡');
  text('health-number', String(Math.ceil(g.health)));
  get('weapon-hud').hidden=g.driven;
  text('weapon-name',g.weapon.name);
  text('ammo-count',g.reloadLeft>0?'Recharge…':`${g.ammo.loaded} / ${g.ammo.spare}`);
  get('weapon-hud').dataset.empty=String(g.ammo.loaded===0);
  get('health-fill').style.width = g.health + '%';
  get('health-track').setAttribute('aria-valuenow', String(g.health));
  get('health-track').dataset.low = String(g.health <= 28);
  shade.dataset.hurt = String(g.damageFlash > 0);
  g.save.loadout.forEach((id, i) => {
    const slot = slots[i], cool = g.cooldown[id];
    slot.dataset.ready = String(cool <= 0);
    slot.querySelector('span')!.textContent = implants[id].name;
    slot.querySelector('small')!.textContent = cool > 0 ? Math.ceil(cool) + 's' : 'Prêt';
  });

  const delivery = g.active && g.save.chapter === 1 && g.loot;
  const state = g.confirmed ? 'confirmed' : g.observation > .06 ? 'watch' : delivery && g.safeFor >= 5 ? 'delivery' : 'clear';
  let alert = state === 'confirmed' ? 'Position confirmée' : state === 'watch' ? 'Observé' : state === 'delivery' ? 'Remise autorisée'
    : g.pursuing ? 'Fouille en cours' : 'Hors détection';
  if ((state === 'confirmed' || state === 'watch') && g.observer) alert += ' · ' + observerLabels[g.observer];
  if (delivery && !g.confirmed && g.safeFor < 5) alert += ' · ' + Math.max(1, Math.ceil(5 - g.safeFor)) + ' s';
  get('danger').dataset.state = state;
  text('alert-text', alert);
  get('alert-meter').style.setProperty('--progress', (state === 'delivery' || g.confirmed ? 100 : g.observation * 100) + '%');
  const prompt = g.interaction();
  const nearby=g.driven&&g.nearbyActivity&&Math.abs(g.car.speed)<4?activitySpec(g.nearbyActivity):null;
  get('prompt').hidden = !prompt&&!nearby;
  text('prompt-key',nearby?'G':'E');
  text('prompt-text', nearby?.name??prompt?.label??'');
  const police=g.police, wanted=get('wanted');
  get('danger').hidden=police.level>0&&state==='clear';
  wanted.hidden=!police.level;
  wanted.dataset.phase=police.phase;
  wanted.dataset.withAlert=String(!get('danger').hidden);
  text('wanted-stars','◆'.repeat(police.level)+'◇'.repeat(3-police.level));
  text('wanted-label',police.arrest>.12?`Interpellation · ${Math.floor(police.arrest*100)} %`:
    police.phase==='search'?`Recherche ${police.level}/3`:`Poursuite ${police.level}/3`);
  text('wanted-countdown',police.remaining?'· '+Math.ceil(police.remaining)+' s':'');
  get('notice').hidden = g.messageTime <= 0;
  text('notice', g.message);
  get('speed').hidden = !g.driven;
  get('speed').querySelector('strong')!.textContent = String(Math.round(Math.abs(g.car.speed) * 3.6));
  if (now - lastMap >= 70) { lastMap = now; minimap(g, activePins); }
}

function setFocus() {
  if (!game?.running) return;
  game.pause(document.hidden || !document.hasFocus() || current !== null);
}
window.addEventListener('blur', () => { game?.pause(true); });
window.addEventListener('focus', setFocus);
document.addEventListener('visibilitychange', setFocus);
window.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (key === 'escape' && current !== 'failed') {
    if (current) leave();
    else if (!event.repeat) pause();
    return;
  }
  if (current || !game?.running || event.ctrlKey || event.metaKey || event.altKey) return;
  if (key==='m' && !event.repeat) { event.preventDefault(); overview();return; }
  if(key==='i'&&!event.repeat) {event.preventDefault();if(!game.driven) menu('arsenal');return;}
  if(key==='g'&&!event.repeat) {event.preventDefault();game.activitiesMenu();return;}
  if (event.code === 'Tab') { event.preventDefault(); if (!event.repeat) journal(); return; }
  if (moveKeys.has(key)) {
    event.preventDefault();
    if (!game.paused) game.keys.add(key);
  }
  if (event.repeat) return;
  if (key === 'e') { event.preventDefault(); game.interact(); }
  if(key==='r') game.reload();
  if(key==='f') game.cycleWeapon();
  if(key==='t') game.recover();
  const slot = key === '1' || event.code === 'Digit1' ? 0 : key === '2' || event.code === 'Digit2' ? 1 : null;
  if (slot !== null) { event.preventDefault(); game.implant(slot); }
});
window.addEventListener('keyup', e => game?.keys.delete(e.key.toLowerCase()));
viewport.addEventListener('pointermove', event => {
  if (!game) return;
  Object.assign(game.pointer, { x: event.clientX, y: event.clientY, visible: event.pointerType === 'mouse' });
});
viewport.addEventListener('pointerleave', () => { if (game) Object.assign(game.pointer, { visible: false, down: false }); });
viewport.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !game?.running || game.paused) return;
  event.preventDefault();
  Object.assign(game.pointer, { x: event.clientX, y: event.clientY, visible: true, down: true });
});
window.addEventListener('pointerup', () => { if (game) game.pointer.down = false; });
viewport.addEventListener('contextmenu', e => e.preventDefault());
get('title-help').addEventListener('click', commands);
get('pause').addEventListener('click', pause);
get('journal').addEventListener('click', journal);
get('open-map').addEventListener('click',overview);
get('open-activities').addEventListener('click',()=>game?.activitiesMenu());
get('weapon-hud').addEventListener('click',()=>menu('arsenal'));
close.addEventListener('click', leave);
function begin() {
  if (!game) return;
  title.hidden = true;
  hud.hidden = false;
  play.blur();
  game.start();
  paint(game);
}
play.addEventListener('click', begin);
newGameButton.addEventListener('click', () => {
  current = 'restart';
  show('DeadLine', 'Nouvelle partie', '<p>Commencer une nouvelle partie remplace la sauvegarde de ce navigateur.</p>');
  button('Recommencer', () => { leave(); game?.restart(); begin(); });
  button('Garder la sauvegarde', leave, 'secondary');
});

try {
  await R.init();
  game = new Game(viewport, menu, paint);
  play.textContent = game.checkpointAvailable ? 'Reprendre' : 'Jouer';
  newGameButton.hidden = !game.checkpointAvailable;
  play.disabled = false;
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('qa')) {
    Object.assign(window, { deadlineQA: game });
  }
} catch (error) {
  get('boot-error').hidden = false;
  text('boot-error', 'Le moteur 3D n’a pas démarré. Vérifiez que WebGL 2 est disponible.');
  play.textContent = 'Jeu indisponible';
  console.error(error);
}
