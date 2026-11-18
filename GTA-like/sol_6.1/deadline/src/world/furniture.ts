import{PATHS,BUILDINGS,DISTRICTS,LOC,GATES,RAIL_DECKS,landHeight,surfacesNear}from'./data.ts';
import{atDistance,rectangleContains,distance,type Rect}from'./geometry.ts';
export interface Furniture extends Rect{kind:'lamp'|'tree'|'stall'|'bench';color:number;fragile:boolean;}
export const FURNITURE:Furniture[]=[];
function place(r:Rect,kind:Furniture['kind'],color:number,fragile=false){
 const radius=Math.hypot(r.w,r.d)/2;
 if(Object.values(LOC).some(p=>Math.abs(p.y-r.y)<2&&distance(p,r)<radius+1.7))return;
 if(Object.values(GATES).some(p=>Math.abs(p.y-r.y)<2&&distance(p,r)<radius+3))return;
 if(BUILDINGS.some(b=>rectangleContains(r,{...b,id:b.id},radius+.4)))return;
 for(const b of BUILDINGS.filter(b=>b.interior))for(const door of b.doors||[]){const horizontal=door.side==='n'||door.side==='s',x=b.x+(horizontal?door.offset:(door.side==='e'?b.w/2:-b.w/2)),z=b.z+(horizontal?(door.side==='s'?b.d/2:-b.d/2):door.offset);if(distance(r,{x,z})<radius+2.5)return;}
 if(surfacesNear(r).some(q=>q.onStrip&&q.path.mode==='walk'&&Math.abs(q.y-r.y)<2&&q.distance<q.path.width/2+radius+.6))return;
 if(surfacesNear(r).some(q=>q.onStrip&&q.path.mode==='road'&&r.y<q.y+2&&r.y+r.h>q.y-.1&&q.distance<q.path.width/2+q.path.sidewalk+radius+.1))return;
 if(RAIL_DECKS.some(q=>r.y<q.y+q.h&&r.y+r.h>q.y&&rectangleContains(r,q,radius)))return;
 if(FURNITURE.some(p=>distance(p,r)<Math.hypot(p.w,p.d)/2+radius+.3))return;
 FURNITURE.push({...r,kind,color,fragile});
}
for(const path of PATHS.filter(p=>p.mode==='road'))for(let s=10;s<path.points.at(-1)!.s-8;s+=18)for(const side of [-1,1]){
 const p=atDistance(path,s,side*(path.width/2+path.sidewalk+.35));
 if(surfacesNear(p).some(q=>q.path.id!==path.id&&q.path.mode==='road'&&q.onStrip&&q.distance<q.path.width/2+1.5&&Math.abs(q.y-p.y)<1))continue;
 place({id:'lamp-'+path.id+'-'+s+'-'+side,x:p.x,z:p.z,y:p.y,w:.18,h:3.8,d:.18},'lamp',0x4c6266,true);
}
for(const d of DISTRICTS)for(let i=0;i<20;i++){
 const x=d.origin.x+9+(i*37.7)%(d.w-18),z=d.origin.z+8+(i*19.3)%(d.d-25),y=landHeight(x,z);if(y===null)continue;
 if(surfacesNear({x,z}).some(q=>q.path.mode==='road'&&q.distance<q.path.width/2+q.path.sidewalk+3&&Math.abs(q.y-y)<3))continue;
 if(BUILDINGS.some(b=>rectangleContains({x,z},{...b,id:b.id},3)))continue;
 place({id:'tree-'+d.id+i,x,z,y,w:.35,h:2.8,d:.35},'tree',[0x698677,0x74836b,0x8f8d69][i%3]);
}
for(const p of [{x:250,z:188},{x:255,z:188},{x:261,z:188},{x:338,z:174},{x:343,z:174}])place({id:'market-stall-'+p.x,...p,y:landHeight(p.x,p.z)||0,w:3.2,h:1,d:1.6},'stall',0xa18b62);
for(const p of [{x:23,z:61},{x:40,z:61},{x:258,z:-130},{x:276,z:-6},{x:132,z:-138},{x:126,z:-142}]){const y=landHeight(p.x,p.z);if(y!==null)place({id:'bench-'+p.x+p.z,...p,y,w:2.4,h:.5,d:.6},'bench',0x7e7762,true);}
