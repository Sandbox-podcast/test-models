import{PATHS}from'./data.ts';
import{pathMesh,type Path,type Vec3}from'./geometry.ts';
interface Triangle{points:Vec3[];road:string;order:number;minX:number;maxX:number;minZ:number;maxZ:number;}
const area=(p:Vec3[])=>p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a.x*b.z-b.x*a.z;},0)/2;
const cross=(a:Vec3,b:Vec3,p:Vec3)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
function halfPlane(poly:Vec3[],a:Vec3,b:Vec3,inside:boolean){
 const out:Vec3[]=[];for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],dp=cross(a,b,p)*(inside?1:-1),dq=cross(a,b,q)*(inside?1:-1),pin=dp>=-1e-7,qin=dq>=-1e-7;
  if(pin)out.push(p);if(pin!==qin){const t=dp/(dp-dq);out.push({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t,z:p.z+(q.z-p.z)*t});}
 }return out;
}
function intersection(a:Vec3[],b:Vec3[]){let p=a;for(let i=0;i<b.length&&p.length;i++)p=halfPlane(p,b[i],b[(i+1)%b.length],true);return p;}
function subtract(poly:Vec3[],clip:Vec3[]){let remaining=poly;const pieces:Vec3[][]=[];for(let i=0;i<clip.length&&remaining.length;i++){const outside=halfPlane(remaining,clip[i],clip[(i+1)%clip.length],false);if(outside.length>=3&&Math.abs(area(outside))>1e-6)pieces.push(outside);remaining=halfPlane(remaining,clip[i],clip[(i+1)%clip.length],true);}return pieces;}
function height(t:Triangle,p:Vec3){const[a,b,c]=t.points,den=cross(a,b,c),u=cross(a,p,c)/den,v=cross(a,b,p)/den;return a.y+(b.y-a.y)*u+(c.y-a.y)*v;}
function triangles(path:Path,width=path.width,offset=0){const mesh=pathMesh(path,width,offset),out:Triangle[]=[];
 for(let i=0;i<mesh.indices.length;i+=3){let points=Array.from(mesh.indices.slice(i,i+3),index=>({x:mesh.positions[index*3],y:mesh.positions[index*3+1],z:mesh.positions[index*3+2]}));if(Math.abs(area(points))<1e-6)continue;if(area(points)<0)points.reverse();out.push({points,road:path.id,order:PATHS.indexOf(path),minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z))});}return out;
}
const roads=PATHS.filter(p=>p.mode==='road'),all=roads.flatMap(p=>triangles(p)),grid=new Map<string,Triangle[]>();
for(const t of all)for(let x=Math.floor(t.minX/16);x<=Math.floor(t.maxX/16);x++)for(let z=Math.floor(t.minZ/16);z<=Math.floor(t.maxZ/16);z++){const key=x+','+z;if(!grid.has(key))grid.set(key,[]);grid.get(key)!.push(t);}
function nearby(t:Triangle){const found=new Set<Triangle>();for(let x=Math.floor(t.minX/16);x<=Math.floor(t.maxX/16);x++)for(let z=Math.floor(t.minZ/16);z<=Math.floor(t.maxZ/16);z++)for(const q of grid.get(x+','+z)||[])if(t.maxX>=q.minX&&q.maxX>=t.minX&&t.maxZ>=q.minZ&&q.maxZ>=t.minZ)found.add(q);return found;}
/** Exact intersections of the rendered carriageway triangles, not rounded centreline distances. */
export function auditRoads(){const issues=new Map<string,{a:string;b:string;area:number;clearance:number;at:Vec3}>();
 const ranks=new Map(all.map((t,i)=>[t,i]));for(const a of all)for(const b of nearby(a)){const same=a.road===b.road;if(a.order>b.order||same&&ranks.get(a)!>=ranks.get(b)!)continue;const poly=intersection(a.points,b.points);if(poly.length<3||Math.abs(area(poly))<.015)continue;const differences=poly.map(p=>Math.abs(p.y-height(b,p))),max=Math.max(...differences),min=Math.min(...differences);if(!same&&max<.045||min>=4.5)continue;
  const key=a.road+'/'+b.road,old=issues.get(key);if(old){old.area+=Math.abs(area(poly));old.clearance=Math.min(old.clearance,min);}else issues.set(key,{a:a.road,b:b.road,area:Math.abs(area(poly)),clearance:min,at:poly[0]});
 }return[...issues.values()];
}
/** Planar union: every junction has one road surface; sidewalks yield to crossing carriageways. */
export function roadMesh(path:Path,width=path.width,offset=0,lift=.015,sidewalk=false){const positions:number[]=[],indices:number[]=[];
 for(const t of triangles(path,width,offset)){let pieces=[t.points];for(const other of nearby(t)){if(other.road===path.id||!sidewalk&&other.order>t.order)continue;
   const overlap=intersection(t.points,other.points);if(overlap.length<3||Math.abs(area(overlap))<1e-6||overlap.some(p=>Math.abs(p.y-height(other,p))>.04))continue;
   pieces=pieces.flatMap(piece=>subtract(piece,other.points));if(!pieces.length)break;
  }
  for(const p of pieces){const base=positions.length/3;for(const v of p)positions.push(v.x,v.y+lift,v.z);for(let i=1;i<p.length-1;i++)indices.push(base,base+i+1,base+i);}
 }return{positions:new Float32Array(positions),indices:new Uint32Array(indices)};
}
