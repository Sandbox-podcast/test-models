() => {
 const {sites,p,along,distance,routes,clamp}=level,st=g.streets,issues=[],events=[];
 const assert=(v,s)=>{if(!v)issues.push(s)},by=id=>routes.find(r=>r.id===id);
 const project=(r,q)=>r.points.reduce((a,b)=>distance(b,q)<distance(a,q)?b:a);
 function segment(r,start,end){const a=typeof start==='number'?along(r,start):project(r,start),b=typeof end==='number'?along(r,end):project(r,end);
 const count=Math.ceil(Math.abs(b.s-a.s)/1.25);return Array.from({length:count+1},(_,i)=>along(r,a.s+(b.s-a.s)*i/Math.max(1,count)))}
 const r=by('forges-0-0'),d=by('dalle-0-0'),n=by('noeud-0-0'),b=by('belvederes-0-0'),q=by('quais-0-0'),qu=by('quais-1-0');
 const entire=(id,reverse=false)=>{const lane=by(id);return segment(lane,reverse?lane.length:0,reverse?0:lane.length)};
 const loop=[...entire('J01'),...entire('J05'),...entire(b.id,true),...entire('J06'),...entire(n.id),...entire('J04',true),
 ...segment(d,d.length,by('J03').points.at(-1)),...entire('J03',true),...entire(qu.id),...segment(q,qu.points.at(-1),0),...entire('J02',true),
 ...segment(r,by('J02').points[0],by('J01').points[0])];
 const length=loop.reduce((s,v,i)=>s+(i?distance(v,loop[i-1]):0),0);
 for(const c of g.traffic.cars)c.collider.setEnabled(false);st.world.step();
 for(const path of [loop,[...loop].reverse()]){let last=path[0];for(const dest of path.slice(1)){const dx=dest.x-last.x,dz=dest.z-last.z;if(Math.hypot(dx,dz)<.01)continue;const moved=st.move(last,dx,dz,true,Math.atan2(dx,dz));if(distance(moved,dest)>.06){issues.push('Boucle bloquée '+JSON.stringify([last,dest]));break}last=dest}}
 // Drive the junctions at a controlled speed with the normal game inputs.
 const driveCircuit=(path,label)=>{
  const first=path[0],next=path.find(q=>distance(q,first)>1);
  g.restore();g.q={...first};g.car={...first};g.prev={...first};g.prevCar={...first};g.carAngle=Math.atan2(next.x-first.x,next.z-first.z);g.driving=true;g.speed=0;g.paused=false;
  g.streets.setParked(g.car,g.carAngle,false);let index=1,idle=0;
  for(let tick=0;tick<26000;tick++){
   const before=index;while(index<path.length-1&&distance(g.car,path[index])<3.9)index++;
   if(index===path.length-1&&distance(g.car,path[index])<3.9){g.keys.clear();return}
   const target=path[index],heading=Math.atan2(target.x-g.car.x,target.z-g.car.z),err=Math.atan2(Math.sin(heading-g.carAngle),Math.cos(heading-g.carAngle));
   const cap=Math.abs(err)>.55?2.7:Math.abs(err)>.22?5:12;
   g.keys.clear();if(Math.abs(err)>.025)g.keys.add(err>0?'a':'d');if(g.speed<cap)g.keys.add('w');if(g.speed>cap+1)g.keys.add(' ');
   g.simulate(1/60);idle=before===index?idle+1:0;
   if(idle>850||g.paused){issues.push(label+' '+JSON.stringify([index,g.car,target,g.speed,g.health,st.lastImpact]));break}
   if(tick===25999)issues.push('Temps de parcours dépassé '+label);
  }g.keys.clear()
 };
 for(const model of ['courier','veloce','gabare']){
  g.save.inventory.vehicle=model;driveCircuit(loop,'Boucle aller '+model);driveCircuit([...loop].reverse(),'Boucle retour '+model)
 }
 g.save.inventory.vehicle='courier';g.restore();
 events.push('Double boucle à gabarit réel · '+Math.round(length)+' m par sens');
 const impact=(x,z,a,speed,frames=48)=>{g.driving=true;g.car=p(x,z);g.q={...g.car};g.prev={...g.q};g.speed=speed;g.carAngle=a;g.paused=false;g.keys.clear();for(let i=0;i<frames;i++)g.simulate(1/60)};
 g.restore();g.paused=false;impact(32,55.3,0,3.6);const scratch=g.view.carMarks.at(-1);assert(scratch&&scratch.position.z>0,'Rayure localisée avant');
 const count=g.view.carMarks.length;g.keys.add('w');for(let i=0;i<120;i++)g.simulate(1/60);g.keys.clear();assert(g.view.carMarks.length===count,'Dégât répété en appui '+JSON.stringify([count,g.view.carMarks.length,g.car,g.impactId,g.streets.lastImpact]));
 g.impactId=null;impact(32,50,0,19);assert(g.view.carMarks.length>count,'Déformation choc grave');
 const pole=st.obstacles.find(o=>o.kind==='light'&&o.x<150&&o.z<45);g.impactId=null;impact(pole.x,pole.z+4.5,Math.PI,12);assert(Math.abs(g.view.furniture.get(pole).rotation.z)>.1,'Mobilier intact après choc '+JSON.stringify([pole,g.car,g.streets.lastImpact,g.impactId]));
 const npc=g.people.find(o=>!o.guard);npc.q=p(32,47);npc.dwell=8;impact(32,41.8,0,17,21);assert(npc.hp<=0&&g.view.stains.some(s=>s.visible),'Impact sur passant');
 g.restore();g.paused=false;assert(g.view.carMarks.length===0&&g.view.furniture.get(pole).rotation.z===0,'Réinitialisation des dégâts');
 g.impactId=null;impact(160.22,71,-.21,10,65);
 assert(g.view.carMarks.some(m=>m.position.x<-.99),'Frottement localisé à gauche sur le garde-corps du pont');g.restore();
 const parkedTraffic=g.traffic.cars[0];parkedTraffic.collider.setEnabled(true);parkedTraffic.s=parkedTraffic.home;parkedTraffic.stop=8;g.traffic.place(parkedTraffic);st.world.step();
 const axis=parkedTraffic.angle,dx=Math.sin(axis),dz=Math.cos(axis);g.impactId=null;impact(parkedTraffic.q.x-dx*7,parkedTraffic.q.z-dz*7,axis,16,32);
 assert(parkedTraffic.damage>0,'Impact entre voitures');g.restore();
 for(const c of g.traffic.cars)c.collider.setEnabled(true);st.world.step();
 Object.assign(g.save,quest.fresh());g.restore();g.startJob('chip');g.paused=false;g.car={...sites.parking};g.carAngle=Math.PI/2;
 g.q=p(108,54);g.aim=sites.gate;g.implant(0);assert(st.open.has('gate'),'Intrusion cour');g.aim=p(122,58);g.implant(1);
 const walkTo=dest=>{const path=st.path(g.q,dest);if(!path.length)throw Error('Marche inaccessible '+JSON.stringify([g.q,dest]));for(const step of path){let i=0;while(distance(g.q,step)>.115&&i++<220){
   const dx=step.x-g.q.x,dz=step.z-g.q.z;g.keys.clear();g.keys.add('shift');if(Math.abs(dx)>.065)g.keys.add(dx>0?'d':'a');if(Math.abs(dz)>.065)g.keys.add(dz>0?'s':'w');g.simulate(1/60)}
   if(distance(g.q,step)>.13)throw Error('Marche interrompue '+JSON.stringify([g.q,step]))}g.keys.clear()};
 walkTo(p(100,54));walkTo(sites.chip);g.interact();assert(g.step===1,'Puce cour');walkTo(p(100,54));walkTo(p(107,54));walkTo(p(g.car.x,g.car.z+2.1));g.interact();assert(g.driving,'Voiture parking');
 const targets=[p(115,35),p(119,31),...segment(r,p(120,30),p(141,100)),p(137,97)];
 let best=0;for(let tick=0;tick<4000;tick++){while(best<targets.length-1&&distance(g.car,targets[best])<3.6)best++;const target=targets[best],dist=distance(g.car,target);if(best===targets.length-1&&dist<1.8)break;
  const angle=Math.atan2(target.x-g.car.x,target.z-g.car.z),err=Math.atan2(Math.sin(angle-g.carAngle),Math.cos(angle-g.carAngle));g.keys.clear();if(Math.abs(err)>.035)g.keys.add(err>0?'a':'d');const max=Math.abs(err)>.22?4.5:10;
  if(g.speed<max)g.keys.add('w');if(g.speed>max+2)g.keys.add(' ');g.simulate(1/60);if(tick===3999)issues.push('Conduite interrompue '+JSON.stringify([g.car,target,best,g.carAngle,g.speed,g.health,st.lastImpact,level.ground(g.car.x,g.car.z),level.ground(g.car.x+.01,g.car.z+.02),st.move(g.car,.05,.08,true,g.carAngle),st.lastImpact,g.traffic.cars.filter(c=>distance(c.q,g.car)<7).map(c=>[c.q,c.angle])]));
 }
 g.keys.clear();g.keys.add(' ');for(let i=0;i<80;i++)g.simulate(1/60);g.keys.clear();g.exitCar();
 if(distance(g.q,sites.drop)<30){walkTo(sites.drop);for(let i=0;i<315;i++)g.simulate(1/60);g.interact();document.querySelector('[data-act="choice-0"]')?.click()}assert(g.save.done.includes('chip'),'Remise après conduite');
 events.push('Cour, puce, parking, pont, rampe et remise à pied');Object.assign(g.save,quest.fresh());g.restore();g.pause();return {issues,events}
}
