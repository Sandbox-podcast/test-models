async()=>{
 const {along,distance,p,sites}=level,{crossings}=await import('/src/roadnet.ts'),t=g.traffic,st=g.streets,all=t.cars;
 const issues=[],stats={},assert=(condition,label)=>{if(!condition)throw Error(label)},far=p(-360,400),dt=1/60;
 const tick=n=>{for(let i=0;i<n;i++)g.simulate(dt)};
 const set=(c,r,s,dir=1)=>{Object.assign(c,{route:r,s,dir,mode:'traffic',turn:0,stop:0,offset:0,speed:4});t.place(c)};
 const reset=()=>{Object.assign(g.save,quest.fresh());g.restore();g.paused=false;g.elapsed=0};
 const originals=all.map(c=>c.route),enabled=all.map(c=>c.collider.isEnabled());
 try{
  reset();const c=all.find(o=>o.route.zone===3),r=c.route;set(c,r,c.home,1);st.world.step();
  const owned={...g.car},door=p(c.q.x+Math.cos(c.angle)*1.65,c.q.z-Math.sin(c.angle)*1.65);teleport(door);
  const pressE=()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'e'}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'e'}))};
  pressE();assert(!g.driving&&c.stop>1,'La voiture en circulation doit freiner sur demande · '+g.hint);tick(25);pressE();
  assert(g.driving&&g.borrowed===c&&!c.collider.isEnabled()&&g.alertTTL>0,'Passage réel du conducteur au joueur · '+g.hint);
  assert(distance(owned,st.parked.translation())<.01,'Le véhicule personnel reste garé');
  const initial={...c.q};g.keys.add('w');tick(54);g.keys.clear();assert(distance(initial,c.q)>2&&distance(c.q,g.car)<.01,'La berline suit les commandes');
  g.keys.add(' ');tick(65);g.keys.clear();assert(g.patrol.phase==='pursuit','Les vigiles dépêchent un véhicule');
  const first=distance(g.patrol.units[0].q,g.q),patrolStart={...g.patrol.units[0].q};let nearest=first,saw=false;
  for(let i=0;i<60*13;i++){g.simulate(dt);nearest=Math.min(nearest,distance(g.q,g.patrol.units[0].q));saw||=g.source==='Patrouille motorisée';if(nearest<6.5&&saw)break}
  stats.patrouille={depart:Math.round(first),minimum:Math.round(nearest),parcours:Math.round(distance(patrolStart,g.patrol.units[0].q))};
  assert(nearest<first-7&&saw,'La patrouille rejoint et observe la berline · '+JSON.stringify(stats.patrouille));
  g.exitCar();assert(!g.borrowed&&!g.driving&&c.mode==='parked'&&c.collider.isEnabled()&&distance(g.car,owned)<.01,'Descente et restitution de la voiture personnelle');
  g.interact();assert(g.borrowed===c,'Reprise de la berline stationnée');g.exitCar();
  teleport(sites.spawn);tick(60*20);assert(g.patrol.phase==='idle'||g.patrol.phase==='depart','Fin de la recherche après perte du contact');
  reset();assert(c.mode==='traffic'&&c.collider.isEnabled()&&g.patrol.phase==='idle','Reprise de la simulation après restauration');
  // Follow a moving car through the turn from J01 onto J05 using the live road graph.
  const road1=level.roads.find(r=>r.id==='J01'),road2=level.roads.find(r=>r.id==='J05');
  const patrol=g.patrol,startOn=road1.length-28;let seen=0,journey=0,last=null,closest=Infinity;
  for(let i=0;i<960;i++){const s=Math.max(0,(i-240)*dt*6),r=s+startOn<road1.length?road1:road2;
   const target=along(r,r===road1?startOn+s:s+startOn-road1.length,-2.4);
   patrol.update(dt,target,target.angle,true,6,i<480?8:0,i<240?target:null,[],()=>{seen++},()=>{});st.world.step();
   if(last){const step=distance(patrol.units[0].q,last);assert(step<.38,'Saut de position de la patrouille');journey+=step}last={...patrol.units[0].q};
   if(r===road2&&s>45)closest=Math.min(closest,distance(patrol.units[0].q,target))
  }
  stats.poursuiteEnVirage={metres:Math.round(journey),ecart:Math.round(closest)};
  assert(seen>120&&closest<16,'Poursuite du véhicule en mouvement '+JSON.stringify(stats.poursuiteEnVirage));
  reset();set(c,r,c.home,1);st.world.step();teleport(door);pressE();tick(25);pressE();
  assert(g.borrowed===c,'Préparation du contrôle à l’arrêt');
  for(let i=0;i<1200&&!g.paused;i++)g.simulate(dt);
  assert(g.paused&&document.querySelector('#dialog-title')?.textContent==='Véhicule intercepté'&&!g.borrowed&&!g.driving,'Interception et retour au point de reprise');
  document.querySelector('[data-act="choice-0"]').click();reset();
  // Exercise traffic independently of a particular player's mission, at real junction locations.
  const a=all[0],b=all[1];for(const other of all)other.collider.setEnabled(false);a.collider.setEnabled(true);st.world.step();t.cars=[a];const drive=(n,player=far,velocity=p(0,0),driving=false)=>{
   for(let i=0;i<n;i++){t.update(dt,player,far,false,[],i*dt,velocity,driving);st.world.step()}};
  const tested=[];for(const j of crossings){
   // Prefer a continuous road traversing the node; otherwise the local road does a U-turn.
   const choices=[...new Set(originals)].map(road=>{const mid=road.points.reduce((x,y)=>distance(j,x)<distance(j,y)?x:y);return {road,mid}}).filter(v=>distance(j,v.mid)<4);
   const choice=choices.find(x=>x.mid.s>30&&x.road.length-x.mid.s>30)||choices.find(x=>x.road.zone>=0);
   assert(choice,'Jonction sans desserte '+JSON.stringify(j));const {road,mid}=choice,dir=mid.s>25?1:-1;
   for(const lock of t.junctions){lock.owner=null;lock.queue=[]}set(a,road,mid.s-dir*24,dir);
   drive(360,j);const approach=distance(a.q,j);
   assert(approach>8&&approach<18,'Priorité du joueur '+JSON.stringify([j,approach]));
   const start=a.s;let entered=false,cleared=false;
   for(let i=0;i<1800;i++){t.update(dt,far,far,false,[],i*dt);const d=distance(a.q,j);if(d<8.2)entered=true;if(entered&&d>14){cleared=true;break}}
   assert(cleared,'Carrefour encombré après libération '+JSON.stringify([j,road.id,start,a.s,a.turn,approach]));
   tested.push([Math.round(j.x),Math.round(j.z)])
  }
  stats.carrefours=tested.length;
  const road=life.axes[0],j=crossings.find(q=>Math.abs(q.x-112)<2&&Math.abs(q.z-30)<2);
  const mid=road.points.reduce((x,y)=>distance(j,x)<distance(j,y)?x:y);
  t.cars=[a,b];b.collider.setEnabled(true);set(a,road,mid.s-22);set(b,road,mid.s+11);b.mode='parked';st.world.step();drive(420);
  assert(distance(a.q,j)>8&&a.speed<.1,'Le conducteur doit attendre avant le carrefour lorsque la sortie est occupée');
  set(b,road,mid.s+36);drive(900);assert(a.s>mid.s+12,'La file redémarre après dégagement de la sortie '+JSON.stringify([mid.s,a.s,a.speed,b.s]));
  // A pedestrian crossing mid-block has priority before contact; a faster driver can pass on the outside.
  t.cars=[a];b.collider.setEnabled(false);set(a,road,63);const crossing=along(road,75,-road.width*.235);drive(360,crossing);
  assert(distance(a.q,crossing)>2&&a.speed<.1,'Passant protégé sur la chaussée');drive(280);assert(a.s>77,'Reprise après traversée du piéton');
  set(a,road,70);const behind=along(road,64,-road.width*.235),v=p(Math.sin(a.angle)*12,Math.cos(a.angle)*12);
  drive(35,behind,v,true);assert(a.offset>.1,'Le trafic se range pour le joueur en voiture '+JSON.stringify([a.offset,a.s,road.width]));
  // Overtake through real Rapier movement. The player's car draws out, passes and returns to its lane.
  set(a,road,66);st.world.step();const lane=-road.width*.235;let driver=along(road,56,lane),pass=56,shift=0;
  for(let i=0;i<240;i++){
   const side=pass<69?Math.min(3.3,(pass-56)*.3):pass<83?3.3:Math.max(0,3.3-(pass-83)*.4);
   const dest=along(road,pass+11*dt,lane+side),dx=dest.x-driver.x,dz=dest.z-driver.z;
   t.update(dt,driver,far,false,[],i*dt,p(dx/dt,dz/dt),true);st.world.step();
   const moved=st.move(driver,dx,dz,true,Math.atan2(dx,dz));assert(distance(moved,dest)<.025,'Dépassement entravé à '+pass.toFixed(1)+' m');
   driver=moved;pass+=11*dt;shift=Math.max(shift,a.offset);if(pass>94)break
  }
  assert(shift>.2&&pass>a.s+6,'Le joueur doit pouvoir terminer son dépassement');
  stats.depassement=true;
  // Two independent approaches meet at the Forges entrance of J01.
  const shared=crossings.find(q=>distance(q,p(136,30))<1),loop=originals.find(r=>r.zone<0);
  const entry=road.points.reduce((x,y)=>distance(shared,x)<distance(shared,y)?x:y);
  t.cars=[a,b];b.collider.setEnabled(true);set(a,road,entry.s-22);set(b,loop,22,-1);
  const crossed=new Set(),left=new Set();let peak=0;
  for(let i=0;i<1800;i++){drive(1);let inside=0;for(const c of t.cars){
    const d=distance(c.q,shared);if(d<8){crossed.add(c.id);inside++}if(crossed.has(c.id)&&d>14)left.add(c.id)
   }peak=Math.max(peak,inside);if(left.size===2)break}
  assert(left.size===2&&peak===1,'Priorité entre deux branches '+JSON.stringify([left.size,peak,a.s,b.s]));
  stats.voituresCarrefour=left.size;
  all.forEach((c,i)=>{c.route=originals[i];c.collider.setEnabled(true)});t.cars=all;t.reset();
  const stopped=new Map(),jams=new Map();let longest=0;
  for(let i=0;i<7200;i++){t.update(dt,far,far,false,[],i*dt);if(i%12!==0)continue;
   for(const c of all){const core=crossings.find(j=>distance(j,c.q)<8),last=stopped.get(c);
    if(!core||!last||distance(c.q,last.q)>.45){stopped.set(c,{q:{...c.q},i});continue}
    const seconds=(i-last.i)*dt;longest=Math.max(longest,seconds);
    if(seconds>9)jams.set(c.id,[c.id,c.route.id,Math.round(core.x),Math.round(core.z),Math.round(seconds),c.turn])
   }}
  stats.arretMaxAuCentre=+longest.toFixed(1);
  assert(!jams.size,'Immobilisation prolongée dans le trafic complet '+JSON.stringify([...jams.values()]));
 }catch(error){issues.push(error.message)}finally{all.forEach((c,i)=>c.route=originals[i]);t.cars=all;reset();all.forEach((c,i)=>c.collider.setEnabled(enabled[i]));st.world.step();g.pause()}
 return {issues,stats}
}
