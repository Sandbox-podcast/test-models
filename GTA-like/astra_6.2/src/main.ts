import {rooms,isHouse,type Place} from './rooms'
import {weapons,vehicles} from './equipment'
import '@fontsource/barlow-condensed/latin-700.css'
import '@fontsource/barlow-condensed/latin-800.css'
import '@fontsource/barlow-condensed/latin-900-italic.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-600.css'
import './style.css'
import {icon,logo} from './icons'
import {drawMap} from './map'
import {sites,districts,distance} from './level'
import {readSave,writeSave,fresh,chapter,available,brief,jobNames,missions,all,mainJobs,common,offerDetails,type Job} from './campaign'
import {AudioBus} from './audio'
import type {Game,Dialogue} from './game'
const app=document.querySelector<HTMLDivElement>('#app')!
const save=readSave(),audio=new AudioBus();audio.enable(save.sound)
let mapAddress:Place|null=null
let screen:'home'|'journal'|'atlas'|'game'='home',modal='',backToGame=false,dialog:Dialogue|undefined,toastTimer=0
let loaded=false,loadError='',selected:Job=save.active||chapter(save)
export let game:Game|undefined
const modulePromise=import('./game')
modulePromise.then(m=>m.ready).then(()=>{loaded=true;updatePlay()}).catch(()=>{loadError='Le moteur n’a pas pu charger. Rechargez la page.';updatePlay()})
const ordinal=(j:Job)=>missions[j].id
const btn=(id:string,text:string,cls='secondary',i='')=>`<button class="${cls}" data-act="${id}">${i?icon(i):''}${text}</button>`
app.innerHTML=`<div id="terminal"></div><section id="playfield" hidden><canvas id="world" aria-label="Ville jouable d’Angoulême"></canvas><div id="hud"></div></section><div id="modal" hidden></div><div id="toast" role="status"></div>`
const terminal=document.querySelector<HTMLElement>('#terminal')!,field=document.querySelector<HTMLElement>('#playfield')!,overlay=document.querySelector<HTMLElement>('#modal')!
const keysHelp=[['ZQSD / WASD','Se déplacer ou conduire'],['Souris','Viser indépendamment'],['Clic gauche','Tirer'],['E','Interagir, arrêter une voiture ou prendre le volant'],['1 / 2','Activer les implants équipés'],['Maj','Courir à pied'],['Espace','Freiner en voiture'],['R / F','Recharger / changer d’arme'],['I','Choisir ses implants au garage'],['J / M','Journal ou carte de la ville'],['Échap','Pause ou retour']]
function header(){return `<header class="header"><button class="brand" data-act="home" aria-label="DeadLine, accueil">${logo}<span>DEADLINE</span></button><div class="head-divider"></div><nav aria-label="Navigation principale">${[['home','home','Terminal'],['journal','book','Journal'],['atlas','map','Carte']].map(([id,i,t])=>`<button data-act="${id}" class="navbtn ${screen===id?'active':''}" ${screen===id?'aria-current="page"':''}>${icon(i,16)}${t}</button>`).join('')}</nav><div class="profile"><button data-act="sound" class="sound" aria-label="${save.sound?'Couper':'Activer'} le son" title="${save.sound?'Couper':'Activer'} le son">${icon(save.sound?'volume':'mute',18)}</button><span class="head-divider"></span><span class="online"></span><span class="profile-name">COURSIER_01</span></div></header>`}
function footer(){return `<footer><span><i class="online"></i> TERMINAL EN LIGNE</span><span>DEADLINE OS <b>//</b> V1.0</span></footer>`}
function home(){
 const j=save.active||chapter(save),complete=save.done.includes(j),contact=j==='ascent'&&save.route==='sorel'?'Sorel':missions[j].contact
 return `<main class="shell"><section class="hero"><div class="hero-art"></div><div class="hero-shade"></div><i class="corner tl"></i><i class="corner br"></i><div class="hero-copy"><div class="hero-tag"><i class="slashes"></i>CAMPAGNE SOLO</div><h1 class="wordmark">DEADLINE</h1><div class="hero-sub"><span></span>ACTION & INFILTRATION</div><p>Dans les rues d’Angoulême, une puce dérobée<br class="wide"> détient votre avenir. Votre identité est en sursis.</p><div class="hero-actions"><button data-act="play" class="primary" id="start" ${loaded?'':'disabled'}>${icon('play',18)}<span>${playLabel()}</span></button>${btn('controls','Commandes','secondary glass','keyboard')}</div></div><div class="geotag">${icon('pin',16)}ANGOULÊME <b>/</b> SECTEUR 01</div></section>
 <div class="section-heading"><span class="section-line"></span><h2>Centre d’opérations</h2><span class="section-rule"></span><span class="mono heading-meta">TERMINAL <b>//</b> 01</span></div>
 <div class="dashboard"><article class="card mission-card"><div class="card-top"><span class="card-label">${icon('aim',17)} DOSSIER DE MISSION</span><span class="status"><i></i>${complete?'TERMINÉ':save.active?'EN COURS':'DISPONIBLE'}</span></div>
 <div class="mission-body"><div class="portrait">${contact==='Mina'?'<img src="/mina.webp" alt="Portrait de Mina, mécanicienne des Forges">':icon('chip',34)}<span>${contact.toUpperCase()}</span></div><div class="mission-text"><div class="chapter">MISSION ${ordinal(j)} <span>/</span> ${missions[j].zone.toUpperCase()}</div><h3>${jobNames[j]}</h3><p>${brief[j]}</p><button class="text-link" data-act="journal">Consulter le journal ${icon('arrow',15)}</button></div></div></article>
 <article class="card map-card"><div class="card-top"><span class="card-label">${icon('layers',17)} CARTE DU SECTEUR</span><button class="open-map" data-act="atlas" aria-label="Ouvrir la carte">${icon('diagonal',16)}</button></div><button class="map-preview" data-act="atlas" aria-label="Explorer la carte des Forges"><canvas></canvas><span class="north">N ↑</span></button><div class="map-caption"><span>${icon('pin',15)} Les Forges</span><small>ANGOULÊME / 01</small></div></article></div>${footer()}</main>`
}
function playLabel(){return loadError?'Recharger':!loaded?'Initialisation…':game?.started||save.active||save.done.length?'Reprendre la partie':'Jouer'}
function updatePlay(){const start=document.querySelector<HTMLButtonElement>('#start');if(start){start.disabled=!loaded&&!loadError;start.querySelector('span')!.textContent=playLabel()}}
function detail(j:Job){return missions[j].access+(common.includes(j)?' '+offerDetails(save,j):'')}
function journal(){
 const entries:Job[]=all.filter(j=>mainJobs.includes(j)||save.done.includes(j)||available(save).includes(j)||j===save.active)
 const unlocked=available(save).includes(selected)||save.done.includes(selected)||save.active===selected
 const status=(j:Job)=>save.done.includes(j)?'Terminé':save.active===j?'En cours':available(save).includes(j)?'Disponible':'Verrouillé'
 return `<main class="shell subpage"><div class="page-head"><div class="hero-tag"><i class="slashes"></i>DOSSIER DU COURSIER</div><h1>Journal de mission</h1></div><div class="journal-layout"><div class="job-list">${entries.map(j=>`<button data-act="select-${j}" class="${j===selected?'chosen':''}"><span class="chapter">${ordinal(j)} / ${status(j)}</span><strong>${jobNames[j]}</strong></button>`).join('')}</div><article class="detail"><span class="chapter">DOSSIER ${ordinal(selected)} / ${status(selected)}</span><h2>${jobNames[selected]}</h2><p>${brief[selected]}</p>${unlocked?`<h3>Accès et objectifs</h3><p>${detail(selected)}</p>`:''}
 ${available(save).includes(selected)&&!save.active?btn('track',save.track===selected?'Objectif suivi':'Suivre cet objectif','primary','aim'):''}
 <h3>Conséquences enregistrées</h3><p>${consequences()}</p><p class="wallet">${icon('chip',16)} ${save.money} crédits</p><h3>Inventaire</h3><p>${save.inventory.garage.map(k=>vehicles[k].name).join(' · ')}<br>${(Object.keys(weapons) as (keyof typeof weapons)[]).filter(k=>save.inventory.ammo[k]).map(k=>weapons[k].name+' ('+save.inventory.ammo[k]!.loaded+' / '+save.inventory.ammo[k]!.reserve+')').join(' · ')}${save.inventory.homes.length?'<br>'+rooms.filter(r=>isHouse(r.id)&&save.inventory.homes.includes(r.id)).map(r=>r.name).join(' · '):''}</p>${save.done.length?btn('new-run','Nouvelle campagne','restart-link'):''}</article></div>${footer()}</main>`
}
function consequences(){return [save.done.includes('chip')?'La grille sous les voies est ouverte. Mina propose de rétablir son éclairage.':'',save.route==='collectif'?'Le collectif a ouvert la galerie du coteau.':save.route==='sorel'?'Le badge de Sorel ouvre l’accès de service.':'',save.ending==='public'?'La surveillance du plateau est désactivée.':save.ending==='seal'?'Les révocations sont annulées. Les portiques relèvent de la cellule de Sorel.':'' ,save.done.includes('module')?'Le tunnel de service est éclairé.':'',save.done.includes('escort')?'La résidente est à la permanence, la cour est ouverte.':'',save.done.includes('paper')?'La carte annotée est exposée au garage.':'',save.done.includes('exit')?'Le portillon de nuit fonctionne.':'',save.night==='destroy'?'Lise a fait détruire les dossiers.':save.night==='entrust'?'Lise conserve les preuves en lieu sûr.':''].filter(Boolean).join(' ')||'Aucune décision enregistrée.'}
function atlas(){return `<main class="shell subpage"><div class="page-head"><div class="hero-tag"><i class="slashes"></i>ANGOULÊME</div><h1>Carte de la ville</h1></div><article class="card"><div class="card-top"><span class="card-label">${icon('map')} RÉSEAU URBAIN</span><span class="chapter">N ↑</span></div><div class="atlas-map"><canvas></canvas></div><div class="atlas-legend">${districts.map((d,i)=>`<span><b>0${i+1}</b> ${d}</span>`).join('')}</div></article><p class="map-key"><i></i> Position du coursier <i></i> Objectif suivi</p><section class="addresses"><h2>Adresses</h2><div>${rooms.map(r=>`<button data-act="address-${r.id}" aria-pressed="${mapAddress===r.id}"><strong>${r.name}</strong><small>${districts[r.building.district]} · ${isHouse(r.id)?save.inventory.homes.includes(r.id)?'Votre maison':'À vendre':r.id==='dealer'?'Véhicules':r.id==='arms'?'Armes et munitions':'Repas'}</small></button>`).join('')}</div></section>${footer()}</main>`}
function render(){if(screen==='game')return;terminal.hidden=false;field.hidden=true
 terminal.innerHTML=header()+(backToGame?`<div class="return-bar">${btn('return','Retour en jeu','text-link','arrow')}</div>`:'')+(screen==='home'?home():screen==='journal'?journal():atlas());maps()}
function maps(){const c=terminal.querySelector<HTMLCanvasElement>('.map-preview canvas,.atlas-map canvas');if(c)drawMap(c,screen==='atlas'?'atlas':'preview',screen==='atlas'?(game?.q||sites.spawn):undefined,screen==='atlas'?(rooms.find(r=>!save.active&&r.id===mapAddress)?.entrance||game?.guidance().q||sites.garage):undefined)}
function toast(msg:string){const t=document.querySelector<HTMLElement>('#toast')!;t.textContent=msg;t.classList.add('visible');clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>t.classList.remove('visible'),3100)}
function showModal(kind:string,html:string){modal=kind;if(screen==='game')game?.pause();overlay.hidden=false;overlay.innerHTML=`<section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">${html}</section>`;overlay.querySelector<HTMLButtonElement>('button')?.focus()}
function closeModal(resume=true){modal='';overlay.hidden=true;overlay.innerHTML='';if(resume&&screen==='game')game?.resume()}
function controls(){showModal('controls',`<div class="dialog-top"><span class="card-label">${icon('keyboard')} INTERFACE COURSIER</span>${btn('close',icon('cross'),'icon-btn')}</div><h2 id="dialog-title">Commandes</h2><div class="keys">${keysHelp.map(([k,t])=>`<div><span>${t}</span><kbd>${k}</kbd></div>`).join('')}</div>${btn('close','Compris','primary')}`)}
function talk(d:Dialogue){dialog=d;showModal('talk',`<div class="dialog-top"><span class="card-label">${icon('signal')} ${d.from.toUpperCase()}</span></div><h2 id="dialog-title">${d.title}</h2><p>${d.body}</p><div class="choices">${d.choices.map((c,i)=>btn('choice-'+i,c.label,i?'secondary':'primary')).join('')}</div>`)}
function pause(){if(!game)return;showModal('pause',`<div class="hero-tag"><i class="slashes"></i>SESSION SUSPENDUE</div><h2 id="dialog-title">En pause</h2><p>${game.region} · ${game.job?jobNames[game.job]:'Exploration libre'}</p><div class="choices">${btn('close','Reprendre','primary','play')}${btn('controls','Commandes','secondary','keyboard')}${btn('recover','Dépannage · retour au garage','secondary')}${btn('journal','Journal','secondary','book')}${game.job?btn('abandon','Abandonner le contrat'):''}${btn('terminal','Quitter vers le terminal')}</div>`)}
function gameHud(){if(!game||screen!=='game')return;const g=game,h=document.querySelector<HTMLElement>('#hud')!
 if(!h.children.length)h.innerHTML=`<div class="hud-top"><div class="objective"><span class="card-label" id="mission-name"></span><strong id="goal"></strong></div><button data-act="pause" class="hud-pause" aria-label="Mettre en pause">${icon('pause')}</button></div><div class="hud-state"></div><div class="hud-compass"></div><div class="hud-bottom"><aside class="radar"><canvas></canvas><span></span></aside><div class="hud-vitals"><div class="health"><span>SANTÉ</span><b></b><i></i></div><div class="slots"></div><div class="loadout"></div></div><div class="hint"></div><div class="hud-tools">${btn('journal','Journal [J]','secondary','book')}${btn('atlas','Carte [M]','secondary','map')}</div></div>`
 const set=(s:string,t:string)=>{const n=h.querySelector(s)!;if(n.textContent!==t)n.textContent=t}
 const target=g.guidance();set('#mission-name',g.job?'CONTRAT / '+jobNames[g.job].toUpperCase():'EXPLORATION LIBRE');set('#goal',target.label)
 set('.hud-state',g.alert==='Discret'?(g.job==='chip'&&g.step===1&&g.quiet>=5?'●  Remise disponible':'●  Discret'):g.alert+' · '+(g.alert==='Observé'?g.observer+' '+Math.round(g.detection*100)+' %':g.source))
 if(g.patrol.level){
  const units=g.patrol.engaged,n=units.length
  const state=g.patrol.intercept>.15?'Interception dans '+Math.ceil(5-g.patrol.intercept)+' s':
   g.patrol.phase==='search'?(g.patrol.inTraffic?'Recherche dans le trafic · ':'Recherche · ')+Math.ceil(g.patrol.searchRemaining)+' s':
   n?'Poursuite · '+Math.round(Math.min(...units.map(u=>distance(g.q,u.q))))+' m':'Signalement transmis'
  set('.hud-state','Alerte '+g.patrol.level+'/3 · '+state+' · '+n+(n>1?' voitures':' voiture'))
 }
 h.querySelector('.hud-state')!.className='hud-state '+(g.alert==='Discret'&&!g.patrol.level?'':'danger')
 set('.radar span',g.region+' · '+g.hour);drawMap(h.querySelector('canvas')!,'mini',g.q,target.q,g.patrol.engaged.map(unit=>unit.q));set('.health b',String(Math.ceil(g.health)));(h.querySelector('.health i') as HTMLElement).style.width=g.health+'%'
 set('.loadout',g.driving?g.vehicle.name+' · '+Math.round(Math.abs(g.speed)*3.6)+' km/h':g.weapon.name+' · '+(g.reloadTime>0?'Recharge…':g.ammo.loaded+' / '+g.ammo.reserve));
 const slots=g.save.equip.map((n,i)=>`<span><kbd>${i+1}</kbd> ${n} ${g.cool[i]>0?Math.ceil(g.cool[i])+' s':''}</span>`).join('');const slot=h.querySelector('.slots')!;if(slot.innerHTML!==slots)slot.innerHTML=slots
 const hint=h.querySelector('.hint')!;const msg=(g.hint?`<kbd>E</kbd> ${g.hint}`:'')+(g.valid?`<small>${g.valid}</small>`:'');if(hint.innerHTML!==msg)hint.innerHTML=msg;hint.toggleAttribute('hidden',!msg)
 const arrow=h.querySelector<HTMLElement>('.hud-compass')!,v=g.view.screen(target.q);const far=v.x<40||v.x>innerWidth-40||v.y<95||v.y>innerHeight-105
 const arrowX=Math.max(54,Math.min(innerWidth-74,v.x)),status=h.querySelector('.hud-state')!.getBoundingClientRect()
 arrow.hidden=!far;arrow.style.left=arrowX+'px';arrow.style.top=Math.max(arrowX<status.right+35?status.bottom+16:104,Math.min(innerHeight-120,v.y))+'px';arrow.innerHTML=`<b style="transform:rotate(${Math.atan2(v.y-innerHeight/2,v.x-innerWidth/2)}rad)">➤</b> ${Math.round(distance(g.q,target.q))} m`
}
async function play(){if(loadError){location.reload();return}if(!loaded)return;closeModal(false);audio.start();terminal.hidden=true;field.hidden=false;screen='game';backToGame=false
 try{if(!game){const m=await modulePromise;game=new m.Game(document.querySelector('#world')!,save,audio,{talk,toast,hud:gameHud})}
 game.address=mapAddress;game.resume();gameHud();if(game.elapsed<.2)toast('ZQSD / WASD · Déplacement     E · Interaction     J · Journal')
 }catch(e){screen='home';render();showModal('error',`<h2 id="dialog-title">Rendu 3D indisponible</h2><p>Le jeu nécessite WebGL 2. Vérifiez l’accélération graphique du navigateur, puis relancez la partie.</p>${btn('close','Retour au terminal','primary')}`);console.error(e)}}
function navigate(id:'home'|'journal'|'atlas'){if(screen==='game'){game?.pause();backToGame=true}if(id==='journal')selected=save.active||save.track||chapter(save);closeModal(false);screen=id;render();window.scrollTo(0,0)}
function act(id:string){
 if(id.startsWith('address-')){const r=rooms.find(r=>r.id===id.slice(8));if(r){mapAddress=mapAddress===r.id?null:r.id;if(game)game.address=mapAddress;render();toast(mapAddress?(save.active?'Adresse mémorisée pour l’exploration libre':'Destination · '+r.name):'Destination effacée')}return}
 if(id==='home'||id==='journal'||id==='atlas'){navigate(id);return}
 if(id==='play'||id==='return'){void play();return}
 if(id==='sound'){save.sound=!save.sound;writeSave(save);audio.enable(save.sound);if(save.sound){audio.start();audio.beep(320)}render();return}
 if(id==='controls'){controls();return}if(id==='pause'){pause();return}
 if(id==='recover'){game?.recover(true);closeModal();return}
 if(id==='close'){closeModal();return}
 if(id==='terminal'){closeModal(false);backToGame=false;screen='home';render();return}
 if(id==='new-run'){showModal('restart',`<h2 id="dialog-title">Nouvelle campagne ?</h2><p>La nouvelle partie remplacera votre sauvegarde locale, vos crédits et les décisions du coursier.</p><div class="choices">${btn('close','Conserver ma partie','primary')}${btn('restart-confirm','Recommencer')}</div>`);return}
 if(id==='restart-confirm'){mapAddress=null;if(game)game.address=null;const sound=save.sound;Object.assign(save,fresh(),{sound});writeSave(save);game?.restore();if(game)game.started=false;selected='chip';closeModal(false);backToGame=false;screen='home';render();return}
 if(id==='track'){mapAddress=null;if(game)game.address=null;save.track=selected;writeSave(save);render();toast('Objectif suivi · '+jobNames[selected]);return}
 if(id.startsWith('select-')){selected=id.slice(7) as Job;render();return}
 if(id==='abandon'){talk({from:'Journal',title:'Abandonner le contrat ?',body:'Vous retrouverez la ville libre au garage. Le contrat pourra être accepté à nouveau.',choices:[{label:'Garder le contrat',act:()=>{}},{label:'Abandonner',act:()=>game?.abandon()}]});return}
 if(id.startsWith('choice-')&&dialog){const c=dialog.choices[Number(id.slice(7))];closeModal(false);c.act();if(!modal)game?.resume()}
}
document.addEventListener('click',e=>{const el=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]');if(el&&!el.disabled)act(el.dataset.act!)})
window.addEventListener('resize',()=>{maps();if(game&&screen==='game')game.view.resize()})
window.addEventListener('blur',()=>{if(screen==='game'&&!modal)pause();game?.clearInput()})
document.addEventListener('visibilitychange',()=>{if(document.hidden&&screen==='game'&&!modal)pause()})
window.addEventListener('keydown',e=>{
 const k=e.key.toLowerCase();if(modal){if(k==='escape'&&modal!=='talk')closeModal();if(k==='tab'){const b=[...overlay.querySelectorAll<HTMLButtonElement>('button')];if(b.length&&e.shiftKey&&document.activeElement===b[0]){e.preventDefault();b.at(-1)?.focus()}else if(b.length&&!e.shiftKey&&document.activeElement===b.at(-1)){e.preventDefault();b[0].focus()}}return}
 if(screen!=='game'){if(backToGame&&['escape','j','m'].includes(k))void play();return}
 if(!game)return;if([' ','arrowup','arrowdown','arrowleft','arrowright','tab'].includes(k))e.preventDefault();game.keys.add(k);if(e.repeat)return
 if(k==='escape')pause();else if(k==='e')game.interact();else if(k==='j')navigate('journal');else if(k==='m')navigate('atlas');else if(k==='i')game.workbench();else if(k==='r')game.reload();else if(k==='f')game.cycleWeapon();else if(k==='1'||k==='&'||e.code==='Digit1')game.implant(0);else if(k==='2'||k==='é'||e.code==='Digit2')game.implant(1)
})
window.addEventListener('keyup',e=>game?.keys.delete(e.key.toLowerCase()))
field.addEventListener('pointermove',e=>{if(game){game.nx=e.clientX/innerWidth*2-1;game.ny=1-e.clientY/innerHeight*2}})
field.addEventListener('pointerdown',e=>{if(e.target===document.querySelector('#world')&&game&&e.button===0){game.fire=true;game.shoot()}})
window.addEventListener('pointerup',()=>{if(game)game.fire=false})
render()
