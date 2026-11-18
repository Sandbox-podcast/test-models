async()=>{
 const {along,distance,district,roads,p}=level,dt=1/60,traffic=g.traffic,response=g.patrol,st=g.streets;
 const issues=[],stats={},require=(ok,message)=>{if(!ok)throw Error(message)};
 function road(id){return roads.find(r=>r.id===id)}
 function segment(r,start,end,side){const count=Math.ceil(Math.abs(end-start)/1.2);return Array.from({length:count+1},(_,i)=>along(r,start+(end-start)*i/count,side))}
 function begin(path){
  Object.assign(g.save,quest.fresh());g.restore();g.elapsed=0;g.paused=false;
  const q=path[0],angle=Math.atan2(path[1].x-q.x,path[1].z-q.z);
  g.car={...q};g.prevCar={...q};g.carAngle=angle;g.driving=true;g.q={...q};g.prev={...q};g.speed=0;
  st.setParked(q,angle,false);g.confirm(q,'Témoin');
 }
 function steer(path,index,pace){
  while(index<path.length-1&&distance(g.car,path[index])<3.6)index++;
  const d=path[index],angle=Math.atan2(d.x-g.car.x,d.z-g.car.z),err=Math.atan2(Math.sin(angle-g.carAngle),Math.cos(angle-g.carAngle));
  g.keys.clear();if(Math.abs(err)>.025)g.keys.add(err>0?'a':'d');
  const speed=Math.abs(err)>.5?Math.min(3,pace):pace;
  if(g.speed<speed)g.keys.add('w');if(g.speed>speed+1)g.keys.add(' ');
  g.simulate(dt);return index
 }
 try{
  const j=road('J01'),dalle=life.axes[1],path=[...segment(j,23,j.length,-2.5),...segment(dalle,0,85,-2.5)];
  begin(path);const levels=[],forces=new Set(),zones=new Set(),playerZones=new Set(),travel=new Map(),prev=new Map();let index=1,both=false;
  for(let i=0;i<2600&&!g.paused;i++){
   index=steer(path,index,i<240?2.8:5.2);playerZones.add(district(g.q.x,g.q.z));
   if(response.level&&levels.at(-1)!==response.level)levels.push(response.level);
   for(const unit of response.engaged){
    const last=prev.get(unit);if(last){
     const step=distance(last,unit.q);require(step<.37,'Déplacement discontinu du véhicule '+unit.index);
     travel.set(unit,(travel.get(unit)||0)+step)
    }
    prev.set(unit,{...unit.q});forces.add(unit);
    require(unit.collider.isEnabled()&&unit.body.visible,'Renfort dépourvu de présence physique');
    if(unit.index===0){zones.add(district(unit.q.x,unit.q.z));if(unit.identified&&district(unit.q.x,unit.q.z)===1&&district(g.q.x,g.q.z)===1)both=true}
   }
   if(both&&g.driving&&response.level===3&&forces.size===3&&[...forces].every(u=>travel.get(u)>12))break;
  }
  stats.liaison={niveaux:levels,quartiersJoueur:[...playerZones],quartiersPatrouille:[...zones],distances:[...forces].map(u=>Math.round(travel.get(u)||0))};
  require(both&&zones.has(0)&&playerZones.has(0)&&levels.join(',')==='1,2,3'&&forces.size===3&&[...forces].every(u=>travel.get(u)>8),'Renforts et continuité interquartiers '+JSON.stringify(stats.liaison));

  // Isolate road following from local queues. The city-traffic run above covers their interaction.
  const colliders=traffic.cars.map(c=>c.collider.isEnabled());
  const links={};
  try{
   response.reset();for(const c of traffic.cars)c.collider.setEnabled(false);st.world.step();
   for(const link of roads.filter(r=>/^J0[1-6]$/.test(r.id))){
    const unit=response.units[0],start=along(link,1.5,-2);
    unit.reset();unit.q=start;unit.angle=start.angle;unit.speed=4;unit.phase='pursuit';unit.body.visible=true;unit.collider.setEnabled(true);unit.place();st.world.step();
    const origin=district(start.x,start.z),end=along(link,link.length-2,-2);
    let fix=along(link,12,-2.5),player=fix,travel=0,seenAtEnd=false;
    for(let s=12;s<=link.length+9;s+=6*dt){
     const next=along(link,Math.min(link.length-2,s),-2.5);
     const moved=st.move(player,next.x-player.x,next.z-player.z,true,next.angle);
     require(distance(next,moved)<.08,'Passage du joueur obstrué sur '+link.id);
     player={...next,...moved};const speed=s<link.length-2?6:0;
     if(unit.observe(dt,player,true,false))fix={...player};
     const previous=unit.q;unit.drive(dt,fix,player,next.angle,true,speed,[]);st.world.step();
     const step=distance(previous,unit.q);require(step<.36,'Discontinuité sur '+link.id);travel+=step;
     if(unit.identified&&district(unit.q.x,unit.q.z)===district(end.x,end.z)&&distance(unit.q,end)<12)seenAtEnd=true
    }
    links[link.id]={depart:origin,arrivee:district(end.x,end.z),metres:Math.round(travel)};
    require(seenAtEnd&&origin!==district(end.x,end.z)&&travel>link.length*.7,'Liaison interrompue '+link.id+' '+JSON.stringify([links[link.id],unit.q,end]));
   }
  }finally{response.reset();traffic.cars.forEach((c,i)=>c.collider.setEnabled(colliders[i]));st.world.step()}
  stats.liaisons=links;
  const control=escapeRun(false),convoy=escapeRun(true);
  stats.comparaison={routeLibre:control,convoi:convoy};
  require(control.seen>20&&!control.escaped&&control.masked===0,'Contact perdu dans le parcours témoin');
  require(convoy.seen>1&&convoy.masked>.3&&convoy.inFlow>5&&convoy.travelBlind>35&&convoy.escaped,'Les trois unités doivent perdre la voiture dans le trafic');

  function escapeRun(withConvoy){
   // Recreate the same level-three chase at the entrance to a moving convoy.
   // All positions below are initial conditions. The game handles every subsequent frame.
   const link=road('J05'),start=70,points=segment(link,start,link.length-8,0).map(q=>along(link,q.s,1.8-4.4*Math.min(1,(q.s-start)/15)));
   const original=traffic.cars.map(c=>c.route);
   begin(points);traffic.step=0;
   try{
    if(withConvoy)for(const [i,[s,dir]] of [[64,1],[54,1],[80,1],[121,-1]].entries()){
     const c=traffic.cars[16+i];Object.assign(c,{route:link,s,dir,mode:'traffic',turn:0,stop:0,offset:0,speed:4});traffic.place(c)
    }
    st.world.step();response.update(dt,g.q,g.carAngle,true,3,8,g.q,[],()=>{},()=>{});
    for(const [i,back] of [22,32,43].entries()){
     const u=response.units[i],at=along(link,start-back,1.4);
     u.q=at;u.angle=at.angle;u.speed=3;u.phase='pursuit';u.identified=i===0;
     u.body.visible=true;u.collider.setEnabled(true);u.place()
    }
    response.level=3;response.contact=16;g.speed=3;st.world.step();
    let index=1,seen=0,masked=0,inFlow=0,escaped=false,search=false,travelBlind=0,lastFix=null;
    for(let i=0;i<1560;i++){
     index=steer(points,index,3.8);
     require(g.driving&&!g.paused,'Sortie du véhicule pendant la fuite');
     const units=response.engaged,visible=units.some(u=>u.identified);
     if(visible){seen+=dt;lastFix={...response.report}}
     else if(lastFix&&units.length){
      if(units.some(civilianInSightline))masked+=dt;
      require(distance(lastFix,response.report)<.01,'Position du joueur transmise à travers le trafic');
      travelBlind=distance(g.q,lastFix)
     }
     if(response.inTraffic)inFlow+=dt;
     if(response.phase==='search')search=true;
     if(!response.level&&lastFix&&search){
      require(!units.length&&response.units.every(u=>!u.identified),'Renfort actif après la levée de l’alerte');
      escaped=true;break
     }
    }
    return {seen:+seen.toFixed(1),masked:+masked.toFixed(1),inFlow:+inFlow.toFixed(1),travelBlind:Math.round(travelBlind),escaped}
   }finally{traffic.cars.forEach((c,i)=>c.route=original[i]);g.restore()}
  }
  function civilianInSightline(unit){
   const a=unit.q,b=g.q,d=distance(a,b);if(d<.05||d>30)return false;
   const y=level.ground(a.x,a.z)+1.1,dy=level.ground(b.x,b.z)+1.1-y,len=Math.hypot(d,dy);
   const ray={origin:{x:a.x,y,z:a.z},dir:{x:(b.x-a.x)/len,y:dy/len,z:(b.z-a.z)/len}};
   const hit=st.world.castRay(ray,len,true,undefined,undefined,unit.collider,undefined,c=>!st.support.has(c.handle)&&!st.carOnly.has(c.handle));
   return hit&&st.cars.has(hit.collider.handle)
  }
 }catch(e){issues.push(e.message)}finally{Object.assign(g.save,quest.fresh());g.restore();g.pause()}
 return {issues,stats}
}
