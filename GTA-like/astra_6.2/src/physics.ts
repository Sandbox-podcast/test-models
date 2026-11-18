import {pavement} from './pavement'
import {rooms} from './rooms'
import {vehicles,type Vehicle} from './equipment'
import R from '@dimforge/rapier3d-compat'
import {blocks,walls,streetProps,vehicleBarriers,bounds,inside,p,distance,architecture,ground,inCity,type Point,type Wall} from './level'
const rot=(a:number)=>({x:0,y:Math.sin(a/2),z:0,w:Math.cos(a/2)})
export class Streets{
 gateAreas=new Map(walls.filter(b=>b.id).map(b=>[b.id!,b]));world=new R.World({x:0,y:0,z:0});gates=new Map<string,R.Collider>();open=new Set<string>()
 obstacles:Wall[]=[...blocks.filter(b=>!rooms.some(r=>r.building===b)),...rooms.flatMap(r=>[...r.walls,...r.fittings,...r.door?[r.door]:[]]),...walls,...streetProps,...architecture];carOnly=new Set<number>()
 walker=new R.Ball(.40);vehicle=new R.Cuboid(1.04,.55,2.12)
 model:Vehicle='courier';
 setVehicle(model:Vehicle){if(this.model===model)return;this.model=model;const v=vehicles[model];this.vehicle=new R.Cuboid(v.width/2,.55,v.length/2);this.parkedPose=''}
 parked?:R.Collider;private parkedPose='';
 setParked(q:Point,a:number,on:boolean,model=this.model){const pose=on?[q.x,q.z,a,model].join(','):'off';if(this.parkedPose===pose)return;this.parkedPose=pose
  if(!this.parked)this.parked=this.world.createCollider(R.ColliderDesc.cuboid(this.vehicle.halfExtents.x,.55,this.vehicle.halfExtents.z));this.parked.setEnabled(on);if(on){const v=vehicles[model];this.parked.setShape(new R.Cuboid(v.width/2,.55,v.length/2));this.parked.setTranslation({x:q.x,y:ground(q.x,q.z)+.72,z:q.z});this.parked.setRotation(rot(a))}this.world.step()}
 support=new Set<number>();solids=new Map<number,Wall>();cars=new Map<number,number>();lastImpact:{id:number,q:Point,contact:Point,normal:Point,solid?:Wall}|null=null
 private filter=(vehicle:boolean,c:R.Collider)=>!this.support.has(c.handle)&&(vehicle||!this.carOnly.has(c.handle))
 trafficCollider(q:Point,angle:number,index?:number){const c=this.world.createCollider(R.ColliderDesc.cuboid(.96,.65,2.12).setTranslation(q.x,ground(q.x,q.z)+.71,q.z).setRotation(rot(angle)));if(index!==undefined)this.cars.set(c.handle,index);return c}
 private sedan=new R.Cuboid(.96,.55,2.12)
 overlapsDriver(q:Point,angle:number,player:Point,heading:number){
  if(distance(q,player)>5.5)return false
  return this.sedan.intersectsShape({x:q.x,y:ground(q.x,q.z)+.72,z:q.z},rot(angle),this.vehicle,
   {x:player.x,y:ground(player.x,player.z)+.73,z:player.z},rot(heading))
 }
 carFits(q:Point,a:number,ignore?:R.Collider){
  if(!inCity(q))return false
  return !this.world.intersectionWithShape({x:q.x,y:ground(q.x,q.z)+.72,z:q.z},rot(a),this.sedan,undefined,undefined,ignore,undefined,c=>this.filter(true,c))
 }
 constructor(){
  this.world.timestep=1/60
  for(const b of [...this.obstacles,...vehicleBarriers]){const base=b.base??ground(b.x,b.z)
   const c=this.world.createCollider(R.ColliderDesc.cuboid(b.w/2,b.h/2,b.d/2).setTranslation(b.x,base+b.h/2,b.z))
   this.solids.set(c.handle,b);if(b.id){this.gates.set(b.id,c);this.gateAreas.set(b.id,b)}if(vehicleBarriers.includes(b))this.carOnly.add(c.handle)}
  for(const {vertices,indices} of pavement){
   this.support.add(this.world.createCollider(R.ColliderDesc.trimesh(vertices,indices)).handle)}
  // A train bed crosses above S01 and underneath P01. Its collider always stays in place.
  this.world.createCollider(R.ColliderDesc.cuboid(90,.21,5).setTranslation(90,2.78,75))
  this.support.add(this.world.createCollider(R.ColliderDesc.cuboid(4,.12,6).setTranslation(125,-.12,75)).handle)
  this.world.step()
 }
 setGate(id:string,open:boolean){const c=this.gates.get(id);if(!c)return;if(open)this.open.add(id);else this.open.delete(id);if(c.isEnabled()===open){c.setEnabled(!open);this.world.step()}}
 move(q:Point,dx:number,dz:number,vehicle=false,a=0){
  const len=Math.hypot(dx,dz);if(len<.00001)return {...q}
  if(len>1.65){const n=Math.ceil(len/1.6);let result={...q};for(let i=0;i<n;i++){const prev=result;result=this.move(prev,dx/n,dz/n,vehicle,a);if(distance(prev,result)<len/n-.002)break}return result}
  if(vehicle)this.lastImpact=null
  const next=p(q.x+dx,q.z+dz),y=ground(q.x,q.z),endY=ground(next.x,next.z)
  if(!inCity(next)||Math.abs(endY-y)>Math.max(.48,len*1.45))return {...q}
  const hit=this.world.castShape({x:q.x,y:y+(vehicle?.73:.85),z:q.z},rot(a),{x:dx,y:endY-y,z:dz},vehicle?this.vehicle:this.walker,.018,1,true,undefined,undefined,undefined,undefined,c=>this.filter(vehicle,c))
  if(vehicle&&hit)this.lastImpact={id:hit.collider.handle,q:p(hit.witness1.x,hit.witness1.z),contact:p(hit.witness2.x,hit.witness2.z),normal:p(hit.normal1.x,hit.normal1.z),solid:this.solids.get(hit.collider.handle)}
  const t=hit?Math.max(0,Math.min(1,hit.time_of_impact-.004/len)):1;return p(q.x+dx*t,q.z+dz*t)
 }
 vacant(q:Point,car=false,angle=0){if(!inCity(q))return false;let empty=true;this.world.intersectionsWithShape({x:q.x,y:ground(q.x,q.z)+(car?.73:.85),z:q.z},rot(angle),car?this.vehicle:this.walker,c=>{if(this.filter(car,c)){empty=false;return false}return true});return empty}
 clear(a:Point,b:Point,ignoreParked=false,ignore?:R.Collider){const d=distance(a,b);if(d<.02)return true;const from=ground(a.x,a.z)+1.1,to=ground(b.x,b.z)+1.1,span=Math.hypot(d,to-from);const ray=new R.Ray({x:a.x,y:from,z:a.z},{x:(b.x-a.x)/span,y:(to-from)/span,z:(b.z-a.z)/span});return !this.world.castRay(ray,span,true,undefined,undefined,ignore,undefined,c=>this.filter(false,c)&&(!ignoreParked||c.handle!==this.parked?.handle))}
 path(from:Point,to:Point){
  const corridor=(a:Point,b:Point)=>distance(this.move(a,b.x-a.x,b.z-a.z),b)<.06
  if(distance(from,to)<45&&corridor(from,to))return [{...to}]
  const step=2, key=(x:number,z:number)=>x+','+z
  const start=p(Math.round(from.x/step)*step,Math.round(from.z/step)*step)
  const queue:{v:Point,g:number,f:number}[]=[],parents=new Map<string,Point>(),cost=new Map<string,number>()
  // A pedestrian leaving a car can stand between the kerb and a blocked grid cell.
  for(const dx of [-step,0,step])for(const dz of [-step,0,step]){
   const v=p(start.x+dx,start.z+dz);if(!this.vacant(v)||!corridor(from,v))continue
   const g=distance(from,v);cost.set(key(v.x,v.z),g);queue.push({v,g,f:g+distance(v,to)})
  }
  let end=start
  for(let i=0;queue.length&&i<9000;i++){
   queue.sort((a,b)=>b.f-a.f);const cur=queue.pop()!;end=cur.v
   if(distance(end,to)<2.9&&corridor(end,to))break
   for(const [dx,dz] of [[step,0],[-step,0],[0,step],[0,-step]]){const n=p(end.x+dx,end.z+dz),k=key(n.x,n.z),g=cur.g+step
    if((cost.get(k)??Infinity)<=g||n.x<bounds.left+1||n.x>bounds.right-1||n.z<bounds.top+1||n.z>bounds.bottom-1)continue
    if(this.obstacles.some(b=>!(b.id&&this.open.has(b.id))&&inside(n,b,.52))||!corridor(end,n))continue
    parents.set(k,end);cost.set(k,g);queue.push({v:n,g,f:g+distance(n,to)})
   }
  }
  const path:Point[]=[];if(distance(end,to)>=2.9||!corridor(end,to))return [];path.push({...to});let prev:Point|undefined=end
  while(prev){if(distance(prev,from)>.06)path.push(prev);prev=parents.get(key(prev.x,prev.z))}return path.reverse()
 }
}
