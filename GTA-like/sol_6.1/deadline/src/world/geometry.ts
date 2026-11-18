/** Shared geometry for rendering, Rapier, placement audits and navigation. Metres, Y up. */
export interface Vec3 { x:number; y:number; z:number }
export interface Rect { x:number; z:number; w:number; d:number; y:number; h:number; angle?:number; id:string }
export interface Sample extends Vec3 { s:number; tx:number; tz:number }
export interface Path { id:string; points:Sample[]; width:number; sidewalk:number; mode:'road'|'walk'|'rail'; district:string; gate?:string; heightAt?:(x:number,z:number)=>number|null }
export const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
export const distance=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);
export function rectangleContains(p:{x:number;z:number},r:Rect,margin=0) {
 const dx=p.x-r.x,dz=p.z-r.z,c=Math.cos(r.angle||0),s=Math.sin(r.angle||0);
 return Math.abs(dx*c-dz*s)<r.w/2+margin&&Math.abs(dx*s+dz*c)<r.d/2+margin;
}
export function segmentHit(a:Vec3,b:Vec3,r:Rect,margin=0):number|null {
 const c=Math.cos(r.angle||0),s=Math.sin(r.angle||0),ax=(a.x-r.x)*c-(a.z-r.z)*s,az=(a.x-r.x)*s+(a.z-r.z)*c;
 const dx=(b.x-a.x)*c-(b.z-a.z)*s,dz=(b.x-a.x)*s+(b.z-a.z)*c,dy=b.y-a.y;
 let lo=0,hi=1;
 for(const [pos,dir,min,max]of [[ax,dx,-r.w/2-margin,r.w/2+margin],[az,dz,-r.d/2-margin,r.d/2+margin],[a.y,dy,r.y-margin,r.y+r.h+margin]]){
  if(Math.abs(dir)<1e-8){if(pos<min||pos>max)return null;}else{const u=(min-pos)/dir,v=(max-pos)/dir;lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));if(lo>hi)return null;}
 }return lo;
}
export function closestOnPath(p:{x:number;z:number},path:Path) {
 let best={distance:Infinity,x:0,y:0,z:0,s:0,tx:0,tz:1,index:0};
 for(let i=0;i<path.points.length-1;i++){
  const a=path.points[i],b=path.points[i+1],dx=b.x-a.x,dz=b.z-a.z,len=dx*dx+dz*dz;
  const t=clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(len||1),0,1),x=mix(a.x,b.x,t),z=mix(a.z,b.z,t),d=Math.hypot(p.x-x,p.z-z);
  if(d<best.distance)best={distance:d,x,y:mix(a.y,b.y,t),z,s:mix(a.s,b.s,t),tx:dx/Math.sqrt(len||1),tz:dz/Math.sqrt(len||1),index:i};
 }return best;
}
export function atDistance(path:Path,metres:number,offset=0):Sample {
 const pts=path.points;const s=clamp(metres,0,pts.at(-1)!.s);let lo=0,hi=pts.length-1;
 while(lo+1<hi){const mid=(lo+hi)>>1;if(pts[mid].s<s)lo=mid;else hi=mid;}
 const a=pts[lo],b=pts[hi],t=(s-a.s)/(b.s-a.s||1),tx=mix(a.tx,b.tx,t),tz=mix(a.tz,b.tz,t),n=Math.hypot(tx,tz)||1;
 return{x:mix(a.x,b.x,t)-tz/n*offset,y:mix(a.y,b.y,t),z:mix(a.z,b.z,t)+tx/n*offset,s,tx:tx/n,tz:tz/n};
}

/** Absolute SVG path sampler. Includes reflected S/T controls from the bible plans. */
export function svgPath(d:string,origin:{x:number;z:number},height:(x:number,z:number,t:number)=>number,scale=.25):Sample[] {
 const ts=d.match(/[MLHVCSQTZ]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)||[];
 let i=0,cmd='',x=0,z=0,cx=0,cz=0,prev='',startX=0,startZ=0;const raw:{x:number;z:number}[]=[];
 const number=()=>Number(ts[i++]);
 while(i<ts.length){
  if(/^[a-z]$/i.test(ts[i]))cmd=ts[i++].toUpperCase();
  if(cmd==='Z'){raw.push({x:startX,z:startZ});x=startX;z=startZ;prev=cmd;cmd='';continue;}
  const ax=x,az=z;let bx=x,bz=z,c1x=x,c1z=z,c2x=x,c2z=z;
  if(cmd==='M'||cmd==='L'){bx=number();bz=number();if(cmd==='M'){startX=bx;startZ=bz;raw.push({x:bx,z:bz});x=bx;z=bz;prev='M';cmd='L';continue;}}
  else if(cmd==='H')bx=number();else if(cmd==='V')bz=number();
  else if(cmd==='C'){c1x=number();c1z=number();c2x=number();c2z=number();bx=number();bz=number();}
  else if(cmd==='S'){c1x=prev==='C'||prev==='S'?2*x-cx:x;c1z=prev==='C'||prev==='S'?2*z-cz:z;c2x=number();c2z=number();bx=number();bz=number();}
  else if(cmd==='Q'){c1x=number();c1z=number();bx=number();bz=number();}
  else if(cmd==='T'){c1x=prev==='Q'||prev==='T'?2*x-cx:x;c1z=prev==='Q'||prev==='T'?2*z-cz:z;bx=number();bz=number();}
  else throw new Error(`Unsupported SVG command ${cmd}`);
  const curved=['C','S','Q','T'].includes(cmd),length=curved?Math.hypot(ax-c1x,az-c1z)+Math.hypot(c1x-c2x,c1z-c2z)+Math.hypot(c2x-bx,c2z-bz):Math.hypot(bx-ax,bz-az);
  const steps=Math.max(1,Math.ceil(length*scale/1.6));
  for(let j=1;j<=steps;j++){const t=j/steps,u=1-t;
   if(cmd==='C'||cmd==='S')raw.push({x:u*u*u*ax+3*u*u*t*c1x+3*u*t*t*c2x+t*t*t*bx,z:u*u*u*az+3*u*u*t*c1z+3*u*t*t*c2z+t*t*t*bz});
   else if(cmd==='Q'||cmd==='T')raw.push({x:u*u*ax+2*u*t*c1x+t*t*bx,z:u*u*az+2*u*t*c1z+t*t*bz});
   else raw.push({x:mix(ax,bx,t),z:mix(az,bz,t)});
  }cx=cmd==='C'||cmd==='S'?c2x:c1x;cz=cmd==='C'||cmd==='S'?c2z:c1z;x=bx;z=bz;prev=cmd;
 }
 let length=0;const samples=raw.filter((p,j)=>j===0||distance(p,raw[j-1])>1e-5).map((p,j,a)=>{if(j)length+=distance(p,a[j-1])*scale;return{x:origin.x+p.x*scale,z:origin.z+p.z*scale,y:0,s:length,tx:0,tz:1};});
 for(let j=0;j<samples.length;j++){const a=samples[Math.max(0,j-1)],b=samples[Math.min(samples.length-1,j+1)],len=distance(a,b)||1;samples[j].tx=(b.x-a.x)/len;samples[j].tz=(b.z-a.z)/len;samples[j].y=height(samples[j].x-origin.x,samples[j].z-origin.z,samples[j].s/(length||1));}
 return samples;
}
export function pathMesh(path:Path,width=path.width,offset=0,lift=0) {
 const positions:number[]=[],indices:number[]=[];
 for(const p of path.points)for(const side of [-1,1]){const x=p.x-p.tz*(side*width/2+offset),z=p.z+p.tx*(side*width/2+offset);positions.push(x,(path.heightAt?.(x,z)??p.y)+lift,z);}
 for(let i=0;i<path.points.length-1;i++){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
 return{positions:new Float32Array(positions),indices:new Uint32Array(indices)};
}
