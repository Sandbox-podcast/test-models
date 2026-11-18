() => {
 const {p,sites,along,roads,distance,ground,origins,nearestLane,watchRoutes}=level,st=g.streets;
 const issues=[],events=[],assert=(ok,s)=>{if(!ok)issues.push(s)};
 const state=g.save;const reset=()=>{Object.assign(state,quest.fresh());g.restore();g.paused=false};
 const choose=(i=0)=>{const b=document.querySelector('[data-act="choice-'+i+'"]');if(!b)throw Error('Choix absent: '+document.getElementById('modal').innerText);b.click()};
 const arrive=q=>{teleport(q);g.paused=false};
 const use=q=>{arrive(q);g.interact()};
 const road=roads[0];
 function walkLine(points){for(const dest of points){let ticks=0;while(distance(g.q,dest)>.125&&ticks++<1100){
   const dx=dest.x-g.q.x,dz=dest.z-g.q.z;g.keys.clear();g.keys.add('shift');if(Math.abs(dx)>.065)g.keys.add(dx>0?'d':'a');if(Math.abs(dz)>.065)g.keys.add(dz>0?'s':'w');
   g.simulate(1/60);if(g.health<=0)throw Error('Coursier tombé '+JSON.stringify(g.q))}
   if(distance(g.q,dest)>.13)throw Error('Marche bloquée '+JSON.stringify([g.q,dest]));}g.keys.clear()}
 function behind(q){const pts=st.path(g.q,q);if(!pts.length)throw Error('Aucun accès à '+JSON.stringify(q));walkLine(pts)}
 reset();
 // The unsigned chip can be acquired and delivered on foot with the street population live.
 use(sites.garage);choose();assert(g.job==='chip','Briefing M01');
 behind(p(28.5,38));behind(p(68,34));behind(p(89,36));walkLine([p(89,39),p(83.5,39),p(83.5,51),p(88,57)]);g.interact();
 assert(g.step===1,'Vol par entrée principale');
 walkLine([p(91,60.6),p(106,60.6),p(116,60.6),p(117,64.8),p(125,64.8),p(125,82),p(135,90)]);
 for(let i=0;i<325;i++)g.simulate(1/60);g.interact();choose()
 assert(state.done.includes('chip')&&st.open.has('shortcut'),'M01 remise et raccourci');
 events.push('M01 · portail principal → escalier → S01 → remise, population active');
 const mark=state.money;quest.finish(state,'chip');assert(state.money===mark,'Double récompense');
 // Check action choices and consequences at their real contact/terminal, across all branches.
 const accept=j=>{state.track=j;const q=sites[quest.startSite(state,j)];use(q);
  const found=[...document.querySelectorAll('#modal button')].find(b=>b.textContent.startsWith(quest.missions[j].id+' ·'));if(found)found.click();choose();assert(g.job===j,'Acceptation '+j)};
 const transact=(j,branch)=>{accept(j);let guard=0;while(g.job===j&&guard++<10){
   const target=g.target().q;
   if(j==='calendar'&&g.step===2){arrive(p(75,35));for(let t=0;t<1100;t++)g.simulate(1/60);assert(g.archTime>=18,'Suivi de l’archiviste')}
   if(g.escort){const n=g.escort;arrive(p(n.q.x+3.7,n.q.z));const begin={...n.q};for(let t=0;t<170;t++)g.simulate(1/60);assert(distance(begin,n.q)>.7,'Résidente suit le coursier');n.q={...target}}
   if(j==='ledger'&&g.step===2){use(branch==='sorel'?sites.sorel:sites.mina);choose()}
   else if(j==='core'&&g.step===1){use(sites.core);choose(branch==='seal'?1:0);choose()}
   else if(j==='parcel'&&g.step===2){use(sites.lise);choose(branch==='entrust'?1:0)}
   else if(j==='parcel'&&g.step===0){use(target);choose()}
   else use(target);
  }assert(state.done.includes(j)||quest.common.includes(j)&&!g.job,'Achèvement '+j);
 };
 for(const j of ['module','calendar','paper','door','escort','parcel'])transact(j,'destroy');
 const sideState=JSON.parse(JSON.stringify(state));state.done=state.done.filter(j=>j!=='parcel');transact('parcel','entrust');assert(state.night==='entrust','Lise garde le dossier');Object.assign(state,sideState);
 const before=JSON.parse(JSON.stringify(state));
 for(const route of ['collectif','sorel'])for(const ending of ['public','seal']){
  Object.assign(state,JSON.parse(JSON.stringify(before)));g.restore();
  transact('ledger',route);transact('ascent',route);transact('core',ending);transact('exit',ending);
  assert(state.route===route&&state.ending===ending,'Filière et fin '+route+'/'+ending)
  assert(quest.readSave().ending===ending&&st.open.has('exit'),'Persistance après M06');
 }
 Object.assign(state,quest.fresh());state.done=['chip','calendar','door'];g.restore();transact('ledger','collectif');transact('ascent','collectif');transact('core','seal');assert(!state.done.some(j=>quest.missions[j].id[0]==='U'),'Fin sans quête annexe')
 for(let i=0;i<12;i++){const j=quest.common[state.offers%4],n=state.offers,c=state.money;transact(j,'');assert(state.offers===n+1&&state.money===c+quest.missions[j].reward,'Occurrence '+i)}
 events.push('M01–M06, U01–U05, 12 offres C01–C04, quatre combinaisons filière/fin');
 accept(quest.common[state.offers%4]);const active=state.active,offer=state.activeOffer;use(g.target().q);g.damage(100);choose();assert(g.job===active&&g.step===0&&distance(g.q,sites.spawn)<.1&&distance(g.car,sites.car)<.1,'Échec et reprise');g.abandon();assert(!g.job&&!state.activeOffer,'Créneau libéré');accept(active);assert(state.activeOffer===offer&&quest.readSave().activeOffer===offer,'Même offre après abandon');g.abandon();
 reset();return {issues,events};
}
