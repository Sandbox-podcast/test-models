async()=>{
 const {pavement}=await import('/src/pavement.ts'),{vehicles}=await import('/src/equipment.ts');
 const cells=new Map(),issues=[],cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
 const pointIn=(q,tri)=>{const sides=tri.map((a,i)=>cross(a,tri[(i+1)%3],q));return sides.every(v=>v>=-.00012)||sides.every(v=>v<=.00012)};
 const cell=(x,z)=>Math.floor(x/8)+','+Math.floor(z/8);
 let overlaps=0,triangles=0,uncovered=0,clearance=0;
 function penetrates(a,b){for(const face of [a,b])for(let i=0;i<3;i++){
  const u=face[i],v=face[(i+1)%3],dx=u.z-v.z,dz=v.x-u.x,length=Math.hypot(dx,dz);if(length<.00001)continue;
  const interval=t=>t.map(p=>(dx*p.x+dz*p.z)/length),va=interval(a),vb=interval(b);
  if(Math.min(Math.max(...va),Math.max(...vb))-Math.max(Math.min(...va),Math.min(...vb))<.00008)return false
 }return true}
 for(const surface of pavement){const {vertices,indices,kind}=surface;
  for(let i=0;i<indices.length;i+=3){
   const tri=Array.from(indices.slice(i,i+3),n=>({x:vertices[n*3],z:vertices[n*3+2]}));
   if(Math.abs(cross(...tri))<.00001)continue;triangles++;
   const xx=tri.map(v=>v.x),zz=tri.map(v=>v.z),ids=[],near=new Set();
   for(let x=Math.floor(Math.min(...xx)/8);x<=Math.floor(Math.max(...xx)/8);x++)for(let z=Math.floor(Math.min(...zz)/8);z<=Math.floor(Math.max(...zz)/8);z++){const k=x+','+z;ids.push(k);for(const item of cells.get(k)||[])near.add(item)}
   for(const other of near)if(penetrates(tri,other.tri)){overlaps++;if(issues.length<4)issues.push('Faces superposées '+surface.route.id+' / '+other.id+' · '+kind+' / '+other.kind+' '+JSON.stringify([tri,other.tri]))}
   const item={tri,kind,id:surface.route.id};for(const k of ids){if(!cells.has(k))cells.set(k,[]);cells.get(k).push(item)}
  }
 }
 for(const road of level.roads){const raw=level.ribbon(road,-road.width/2,road.width/2);
  for(let i=0;i<raw.indices.length;i+=3){let x=0,z=0;for(const n of raw.indices.slice(i,i+3)){x+=raw.vertices[n*3]/3;z+=raw.vertices[n*3+2]/3}
   if(!(cells.get(cell(x,z))||[]).some(t=>t.kind==='road'&&pointIn({x,z},t.tri)))uncovered++}
 }
 if(uncovered)issues.push('Chaussée discontinue · '+uncovered)
 for(const c of g.traffic.cars)c.collider.setEnabled(false);g.streets.setParked(g.car,g.carAngle,false);g.streets.world.step();
 for(const model of Object.keys(vehicles)){g.streets.setVehicle(model);for(const r of level.roads)for(const dir of [-1,1])for(let s=2.65;s<r.length-2;s+=1.65){
   const q=level.along(r,s,dir*r.width*.235),angle=q.angle+(dir>0?0:Math.PI);clearance++;if(!g.streets.vacant(q,true,angle)&&issues.length<10)issues.push('Gabarit '+model+' · '+r.id+' '+s.toFixed(1))
 }}
 g.streets.setVehicle('courier');for(const c of g.traffic.cars)c.collider.setEnabled(true);g.restore();g.pause();
 return {issues,triangles,overlaps,uncovered,clearance}
}
