import R from '@dimforge/rapier3d-compat'
import {blocks,walls,streetProps,vehicleBarriers,bounds,inside,p,distance,type Point,type Wall} from './level'
const rot=(a:number)=>({x:0,y:Math.sin(a/2),z:0,w:Math.cos(a/2)})
export class Streets{
 world=new R.World({x:0,y:0,z:0});gates=new Map<string,R.Collider>();open=new Set<string>()
 obstacles:Wall[]=[...blocks,...walls,...streetProps];carOnly=new Set<number>()
 walker=new R.Ball(.40);vehicle=new R.Cuboid(1.04,.55,2.12)
 constructor(){
  this.world.timestep=1/60
  const {left,right,top,bottom}=bounds
  for(const b of [{x:left,z:1,w:2,d:120,h:4},{x:right,z:1,w:2,d:120,h:4},{x:49,z:top,w:235,d:2,h:4},{x:49,z:bottom,w:235,d:2,h:4}])this.obstacles.push(b)
  for(const b of [...this.obstacles,...vehicleBarriers]){const c=this.world.createCollider(R.ColliderDesc.cuboid(b.w/2,2,b.d/2).setTranslation(b.x,1,b.z));if(b.id)this.gates.set(b.id,c);if(vehicleBarriers.includes(b))this.carOnly.add(c.handle)}
  this.world.step()
 }
 setGate(id:string,open:boolean){const c=this.gates.get(id);if(!c)return;if(open)this.open.add(id);else this.open.delete(id);if(c.isEnabled()===open){c.setEnabled(!open);this.world.step()}}
 move(q:Point,dx:number,dz:number,vehicle=false,a=0){
  const len=Math.hypot(dx,dz);if(len<.00001)return {...q}
  const hit=this.world.castShape({x:q.x,y:1,z:q.z},rot(a),{x:dx,y:0,z:dz},vehicle?this.vehicle:this.walker,.025,1,true,undefined,undefined,undefined,undefined,c=>vehicle||!this.carOnly.has(c.handle))
  const t=hit?Math.max(0,Math.min(1,hit.time_of_impact-.006/len)):1;return p(q.x+dx*t,q.z+dz*t)
 }
 vacant(q:Point,car=false,angle=0){let empty=true;this.world.intersectionsWithShape({x:q.x,y:1,z:q.z},rot(angle),car?this.vehicle:this.walker,c=>{if(car||!this.carOnly.has(c.handle)){empty=false;return false}return true});return empty}
 clear(a:Point,b:Point){const d=distance(a,b);if(d<.02)return true;const ray=new R.Ray({x:a.x,y:1,z:a.z},{x:(b.x-a.x)/d,y:0,z:(b.z-a.z)/d});return !this.world.castRay(ray,d,true,undefined,undefined,undefined,undefined,c=>!this.carOnly.has(c.handle))}
 path(from:Point,to:Point){
  const corridor=(a:Point,b:Point)=>distance(this.move(a,b.x-a.x,b.z-a.z),b)<.06
  if(corridor(from,to))return [{...to}]
  const step=2, key=(x:number,z:number)=>x+','+z
  const start=p(Math.round(from.x/step)*step,Math.round(from.z/step)*step)
  const queue=[{v:start,g:0,f:distance(start,to)}],parents=new Map<string,Point>(),cost=new Map<string,number>([[key(start.x,start.z),0]])
  let end=start
  for(let i=0;queue.length&&i<1200;i++){
   queue.sort((a,b)=>b.f-a.f);const cur=queue.pop()!;end=cur.v
   if(distance(end,to)<2.9&&corridor(end,to))break
   for(const [dx,dz] of [[step,0],[-step,0],[0,step],[0,-step]]){const n=p(end.x+dx,end.z+dz),k=key(n.x,n.z),g=cur.g+step
    if((cost.get(k)??Infinity)<=g||n.x<bounds.left+1||n.x>bounds.right-1||n.z<bounds.top+1||n.z>bounds.bottom-1)continue
    if(this.obstacles.some(b=>!(b.id&&this.open.has(b.id))&&inside(n,b,.52))||!corridor(end,n))continue
    parents.set(k,end);cost.set(k,g);queue.push({v:n,g,f:g+distance(n,to)})
   }
  }
  const path:Point[]=[];if(distance(end,to)<2.9)path.push({...to});let prev:Point|undefined=end
  while(prev&&parents.has(key(prev.x,prev.z))){path.push(prev);prev=parents.get(key(prev.x,prev.z))}return path.reverse()
 }
}
