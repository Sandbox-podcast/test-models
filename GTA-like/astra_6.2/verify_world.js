() => {
 const {sites,blocks,inside,p,distance,along,roads,routes,ground,watchRoutes}=level;
 const issues=[],heights={},samples={},st=g.streets;
 for(const [key,point] of Object.entries(sites)){
   const overlaps=blocks.filter(b=>inside(point,b,.42));
   if(overlaps.length)issues.push(key+' dans '+overlaps.map(b=>b.name).join(','));
 }
 for(const path of watchRoutes)for(const q of path)if(!st.vacant(q))issues.push('Patrouille bloquée '+JSON.stringify(q));
 // Survey road clearance without treating moving vehicles as misplaced static geometry.
 st.setParked(g.car,g.carAngle,false);const cars=g.traffic.cars;for(const c of cars)c.collider.setEnabled(false);st.world.step();
 for(const road of roads){let count=0;const conflicts=new Set();
  for(const v of road.points)for(const b of blocks){const d=Math.hypot(Math.max(Math.abs(v.x-b.x)-b.w/2,0),Math.max(Math.abs(v.z-b.z)-b.d/2,0));if(d<road.width/2+(road.width>=10?1.75:.1))conflicts.add('trottoir '+b.name+' '+d.toFixed(1))}
  for(const dir of [-1,1])for(let s=2.5;s<road.length-2;s+=1.8){
   const q=along(road,s,dir*road.width*.24),a=q.angle+(dir===1?0:Math.PI);
   if(!st.vacant(q,true,a)){const obstacles=st.obstacles.filter(b=>inside(q,b,2.5));conflicts.add((obstacles.map(b=>b.name||b.id||b.kind||'mur').join('/')||'volume')+' @ '+Math.round(q.x)+','+Math.round(q.z))}
   count++;
  }
  samples[road.id]=count;if(conflicts.size)issues.push(road.id+' · '+Array.from(conflicts).slice(0,12).join(' | '))
 }
 for(const [q,h,n] of [[p(165,75),6,'pont'],[p(125,75),0,'tunnel'],[p(141,100),0,'rue basse']]){heights[n]=ground(q.x,q.z);if(Math.abs(heights[n]-h)>.13)issues.push('Niveau '+n)}
 for(const [a,b,pass] of [[p(125,68),p(125,81),true],[p(110,68),p(110,81),false],[p(33,70),p(33,80),false]]){
  const m=st.move(a,b.x-a.x,b.z-a.z);if((distance(m,b)<.05)!==pass)issues.push('Franchissement '+JSON.stringify(a));
 }
 for(const id of ['entretien','maintenance','coursive','archives','cour','exit','paper','service','gallery']){
  const wall=st.gateAreas.get(id);if(!wall){issues.push('Accès manquant '+id);continue}const horizontal=wall.w>wall.d;
  const a=p(wall.x-(horizontal?0:.78),wall.z-(horizontal?.78:0)),b=p(wall.x+(horizontal?0:.78),wall.z+(horizontal?.78:0));
  for(const open of [false,true]){st.setGate(id,open);const end=st.move(a,b.x-a.x,b.z-a.z);if((distance(end,b)<.04)!==open)issues.push('Accès physique '+id+' '+open)}
  st.setGate(id,false);
 }
 for(const c of cars)c.collider.setEnabled(true);st.world.step();
 st.setParked(g.car,g.carAngle,true);return {issues,heights,samples,people:g.people.length,traffic:cars.length};
}
