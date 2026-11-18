async () => {
 const {along,distance,districts,sites,p}=level,{axes,busy}=life;
 const issues=[],density={},activities=new Set(),check=(ok,msg)=>{if(!ok)issues.push(msg)};
 Object.assign(g.save,quest.fresh());g.restore();g.elapsed=0;g.paused=false;
 const visible=q=>{const v=g.view.screen(q);return v.x>=0&&v.x<innerWidth&&v.y>=0&&v.y<innerHeight};
 const street=(i,lateral=0)=>along(axes[i],busy[i],lateral);
 for(let i=0;i<5;i++){teleport(street(i));g.simulate(1/60);density[districts[i]]={passants:g.people.filter(n=>!n.guard&&!n.indoors&&visible(n.q)).length,voitures:g.traffic.cars.filter(c=>visible(c.q)).length}}
 const targets=[[8,14,2,4],[14,24,1,3],[10,18,2,4],[14,24,2,4],[10,18,1,3]];
 districts.forEach((name,i)=>{const {passants,voitures}=density[name],[pmin,pmax,vmin,vmax]=targets[i];check(passants>=pmin&&passants<=pmax&&voitures>=vmin&&voitures<=vmax,'Densité hors cible · '+name)});
 const axis=axes[3];teleport(street(3,axis.width/2+.9));const people=g.people.filter(n=>n.zone===3),initial=new Map(people.map(n=>[n,{...n.q}])),cars=g.traffic.cars.filter(c=>c.route.zone===3),start=cars.map(c=>({...c.q}));
 let stops=0,crossings=0,travel=0,goal=1;
 for(let i=0;i<7200;i++){
  const end=along(axis,busy[3]+goal*9,axis.width/2+1.4),dx=end.x-g.q.x,dz=end.z-g.q.z;
  if(distance(end,g.q)<1||i%900===899)goal*=-1;
  g.keys.clear();if(Math.abs(dx)>.14)g.keys.add(dx>0?'d':'a');if(Math.abs(dz)>.14)g.keys.add(dz>0?'s':'w');
  const last=g.q;g.simulate(1/60);travel+=distance(last,g.q);
  if(i%60===0){g.view.snap(g.q);for(const n of people.filter(n=>visible(n.q)&&!n.indoors)){activities.add(n.activity);if(n.dwell>1)stops++;if(distance(n.q,initial.get(n))>3)crossings++}}
 }
 g.keys.clear();check(stops&&crossings&&activities.size>=3&&travel>50,'Vie de quartier pendant deux minutes');check(cars.some((c,i)=>distance(c.q,start[i])>5),'Trafic des Quais immobile');
 async function frame(){return new Promise(r=>requestAnimationFrame(r))}
 async function periodAt(time){g.elapsed=time;g.resume();for(let i=0;i<12;i++)await frame();g.pause();return {heure:g.hour,marche:g.view.market.visible}}
 const matin=await periodAt(0),soir=await periodAt(241);
 check(matin.marche&&!soir.marche&&matin.heure!==soir.heure,'Fermeture des étals');
 g.save.ending='public';await periodAt(121);check(g.view.publicRelays.visible&&!g.drone.visible,'Relais publics et retrait du drone');
 g.save.ending='seal';await periodAt(121);check(g.view.official.visible&&g.drone.visible,'Cellule de recours et surveillance');
 async function benchmark(pursuit){
  g.save.ending=null;g.restore();g.elapsed=121;teleport(street(pursuit?3:0,8));g.resume();
  if(pursuit)g.keys.add('d');let last=await frame();const samples=[],firstFrame=g.view.renderer.info.render.frame;
  for(let i=0;i<155;i++){
   if(pursuit&&i%32===0){g.keys.clear();g.keys.add(i%64?'a':'d');g.keys.add('shift')}
   if(pursuit&&i%16===0){g.confirm(g.q,'Témoin');g.view.impact(g.q,.9,.1,true)}
   const now=await frame();if(i>=35)samples.push(now-last);last=now;
  }
  g.pause();const sorted=[...samples].sort((a,b)=>a-b),mean=samples.reduce((a,b)=>a+b,0)/samples.length;
  const rendered=g.view.renderer.info.render.frame-firstFrame;check(rendered>=150,'Rendu suspendu pendant le benchmark · '+rendered);return {rendered,fps:+(1000/mean).toFixed(1),msP95:+sorted[Math.floor(.95*sorted.length)].toFixed(1),largeur:g.view.renderer.domElement.width,hauteur:g.view.renderer.domElement.height}
 }
 const normal=await benchmark(false),poursuite=await benchmark(true);
 Object.assign(g.save,quest.fresh());g.elapsed=0;g.restore();g.pause();
 return {issues,density,explorationMetres:Math.round(travel),activites:[...activities],matin,soir,normal,poursuite};
}
