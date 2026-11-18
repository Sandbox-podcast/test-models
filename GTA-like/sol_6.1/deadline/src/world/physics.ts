import RAPIER from '@dimforge/rapier3d-compat';
import { PATHS, SOLIDS, GATES, LOC, BUILDINGS,RAIL_DECKS,RAIL_FENCES,CURBS, supportAt, type DistrictId } from './data.ts';
import { pathMesh, segmentHit,rectangleContains, type Rect, type Vec3 } from './geometry.ts';
import {TERRAIN}from'./terrain.ts';
import{FURNITURE}from'./furniture.ts';
export interface Obstacle extends Rect {collider:RAPIER.Collider;kind:'building'|'furniture'|'rail'|'gate';fragile?:boolean;broken?:boolean}
export interface Body {body:RAPIER.RigidBody;collider:RAPIER.Collider;position:Vec3;previous:Vec3;feet:number;mode:'foot'|'car';radius:number}
export interface Impact {id:string;speed:number;point:Vec3;normal:Vec3;side:'front'|'rear'|'left'|'right';severity:1|2|3;newContact:boolean}
export class Physics {
 world=new RAPIER.World({x:0,y:-20,z:0});obstacles:Obstacle[]=[];gates=new Map<string,Obstacle>();open=new Set<string>();grounds=new Set<number>();groundLabels=new Map<number,string>();
 character=this.world.createCharacterController(.025);vehicle=this.world.createCharacterController(.04);
 private contacts=new Set<string>();private damageTime=new Map<string,number>();
 private spatial=new Map<string,Obstacle[]>();private lowCurbs=new Set<number>();
 constructor(){this.world.timestep=1/60;this.character.setSlideEnabled(true);this.character.setMaxSlopeClimbAngle(1.1);this.character.setMinSlopeSlideAngle(1.25);this.character.enableAutostep(.23,.15,true);this.vehicle.setSlideEnabled(true);
  for(const r of SOLIDS)this.addObstacle(r,'building');for(const [id,g]of Object.entries(GATES))this.gates.set(id,this.addObstacle(g,'gate'));
  for(const r of [...RAIL_DECKS,...RAIL_FENCES])this.addObstacle(r,'rail');
  for(const r of CURBS){const obstacle=this.addObstacle(r,'furniture');if(r.h<.24)this.lowCurbs.add(obstacle.collider.handle);}
  for(const r of FURNITURE)this.addObstacle(r,'furniture',r.fragile);
  for(const path of PATHS){const mesh=pathMesh(path,path.width+path.sidewalk*2);const col=this.world.createCollider(RAPIER.ColliderDesc.trimesh(mesh.positions,mesh.indices,RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(.8));this.grounds.add(col.handle);this.groundLabels.set(col.handle,path.id);}
  for(const terrain of TERRAIN)this.addGround(terrain.positions,terrain.indices);
  for(const building of BUILDINGS)this.addFloor({...building,h:0,id:building.id+'-floor'});
 }
 addGround(positions:Float32Array,indices:Uint32Array){const c=this.world.createCollider(RAPIER.ColliderDesc.trimesh(positions,indices,RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(.8));this.grounds.add(c.handle);this.groundLabels.set(c.handle,'terrain');return c;}
 addFloor(r:Rect){const c=this.world.createCollider(RAPIER.ColliderDesc.cuboid(r.w/2,.15,r.d/2).setTranslation(r.x,r.y-.15,r.z));this.grounds.add(c.handle);this.groundLabels.set(c.handle,r.id);return c;}
 addObstacle(r:Rect,kind:Obstacle['kind'],fragile=false){const a=r.angle||0;const collider=this.world.createCollider(RAPIER.ColliderDesc.cuboid(r.w/2,r.h/2,r.d/2).setTranslation(r.x,r.y+r.h/2,r.z).setRotation({x:0,y:Math.sin(a/2),z:0,w:Math.cos(a/2)}));const obstacle:Obstacle={...r,collider,kind,fragile};this.obstacles.push(obstacle);const radius=Math.hypot(r.w,r.d)/2;for(let x=Math.floor((r.x-radius)/12);x<=Math.floor((r.x+radius)/12);x++)for(let z=Math.floor((r.z-radius)/12);z<=Math.floor((r.z+radius)/12);z++){const key=x+','+z;if(!this.spatial.has(key))this.spatial.set(key,[]);this.spatial.get(key)!.push(obstacle);}return obstacle;}
 setGate(id:string,open:boolean){const gate=this.gates.get(id);if(!gate)return;if(open)this.open.add(id);else this.open.delete(id);gate.collider.setEnabled(!open);}
 makeBody(p:Vec3,mode:'foot'|'car'='foot'):Body {
  const offset=mode==='car'?.8:.9,desc=RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x,p.y+offset,p.z).setCcdEnabled(true);const body=this.world.createRigidBody(desc);
  const collider=this.world.createCollider(mode==='car'?RAPIER.ColliderDesc.cuboid(1.10,.78,2.20):RAPIER.ColliderDesc.capsule(.56,.32),body);
  return{body,collider,position:{...p},previous:{...p},feet:p.y,mode,radius:mode==='car'?1.02:.34};
 }
 teleport(b:Body,p:Vec3){const q={x:p.x,y:p.y+(b.mode==='car'?.8:.9),z:p.z};b.body.setTranslation(q,true);b.body.setNextKinematicTranslation(q);b.position={...p};b.previous={...p};b.feet=p.y;}
 clearAt(p:Vec3,radius=.4,except?:number,stepHeight=.04){for(let x=Math.floor((p.x-radius)/12);x<=Math.floor((p.x+radius)/12);x++)for(let z=Math.floor((p.z-radius)/12);z<=Math.floor((p.z+radius)/12);z++)if((this.spatial.get(x+','+z)||[]).some(r=>r.collider.handle!==except&&r.collider.isEnabled()&&!r.broken&&p.y+stepHeight<r.y+r.h&&p.y+1.65>r.y&&rectangleContains(p,r,radius)))return false;return true;}
 move(b:Body,dx:number,dz:number,angle=0,velocity=0,time=0,otherCars:Body[]=[]):{moved:number;impacts:Impact[];blocked:boolean} {
  const pos=b.body.translation(),feet=b.feet,offset=b.mode==='car'?.8:.9,travel=Math.hypot(dx,dz);let nx=pos.x+dx,nz=pos.z+dz;
  let support=supportAt({x:nx,z:nz},feet,b.mode,travel+(b.mode==='car'?1:0),this.open);let pitch=0;
  // A vehicle footprint must remain on a road/garage at both axles. Curbs cannot teleport it to a foot ramp.
  if(b.mode==='car'&&support!==null){const axleHeights:number[]=[];for(const side of [-1,1]){const q=supportAt({x:nx+Math.sin(angle)*1.55*side,z:nz+Math.cos(angle)*1.55*side},support,'car',travel+1,this.open);if(q===null||Math.abs(q-support)>1.1){support=null;break;}axleHeights.push(q);}if(axleHeights.length===2)pitch=-Math.atan2(axleHeights[1]-axleHeights[0],3.1);}
  if(support===null){nx=pos.x;nz=pos.z;dx=0;dz=0;support=feet;}
  // Sample the actual Rapier floor at the intended level. Horizontal sweeps exclude floor
  // triangles: their internal coplanar edges otherwise snag the long vehicle cuboid.
  // Solids, gates, rail decks and other vehicles remain in the swept-volume query.
  const rayTop=support+.30;
  const hit=this.world.castRay(new RAPIER.Ray({x:nx,y:rayTop,z:nz},{x:0,y:-1,z:0}),.8,true,undefined,undefined,undefined,undefined,c=>this.grounds.has(c.handle));
  if(hit){const actual=rayTop-hit.timeOfImpact;if(Math.abs(actual-support)<.20)support=actual+.006;}
  if(b.mode==='car'){
   // Rotation is swept conservatively as well: check the prospective oriented footprint before committing.
   const rotation={x:Math.cos(angle/2)*Math.sin(pitch/2),y:Math.sin(angle/2)*Math.cos(pitch/2),z:-Math.sin(angle/2)*Math.sin(pitch/2),w:Math.cos(angle/2)*Math.cos(pitch/2)};
   let blockedRotation=false;for(const x of [-.85,.85])for(const z of [-1.8,1.8]){const q={x:pos.x+Math.cos(angle)*x+Math.sin(angle)*z,z:pos.z-Math.sin(angle)*x+Math.cos(angle)*z,y:feet};if(!this.clearAt(q,.06,b.collider.handle))blockedRotation=true;}
   if(!blockedRotation){b.body.setRotation(rotation,true);b.body.setNextKinematicRotation(rotation);}
  }
  const cc=b.mode==='car'?this.vehicle:this.character;
  cc.computeColliderMovement(b.collider,{x:dx,y:support-feet,z:dz},RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,c=>!this.grounds.has(c.handle)&&!(b.mode==='foot'&&this.lowCurbs.has(c.handle))&&(!c.parent()||otherCars.some(v=>v.collider.handle===c.handle)));
  const m=cc.computedMovement();const impacts:Impact[]=[];const nextContacts=new Set<string>();
  if(b.mode==='car')for(let i=0;i<cc.numComputedCollisions();i++){
   const collision=cc.computedCollision(i);if(!collision?.collider||this.grounds.has(collision.collider.handle)||Math.abs(collision.normal1.y)>.7)continue;
   const id=String(collision.collider.handle),key=b.collider.handle+':'+id;nextContacts.add(key);
   const otherVelocity=collision.collider.parent()?.linvel()||{x:0,y:0,z:0};
   const impactSpeed=Math.abs((velocity*Math.sin(angle)-otherVelocity.x)*collision.normal1.x+(velocity*Math.cos(angle)-otherVelocity.z)*collision.normal1.z);const fresh=!this.contacts.has(key);
   if(impactSpeed<.3||!fresh&&(Math.hypot(m.x,m.z)<.003||time-(this.damageTime.get(key)||0)<1.2))continue;
   const n=collision.normal1,forward=n.x*Math.sin(angle)+n.z*Math.cos(angle),right=n.x*Math.cos(angle)-n.z*Math.sin(angle),side=Math.abs(forward)>Math.abs(right)?(forward<0?'front':'rear'):(right<0?'right':'left');
   const point={x:pos.x-n.x*.95,y:feet+.65,z:pos.z-n.z*1.5};impacts.push({id,speed:impactSpeed,point,normal:{...n},side,severity:impactSpeed>13?3:impactSpeed>5?2:1,newContact:fresh});this.damageTime.set(key,time);
  }
  if(b.mode==='car'){for(const key of [...this.contacts])if(key.startsWith(b.collider.handle+':'))this.contacts.delete(key);for(const key of nextContacts)this.contacts.add(key);}
  b.previous={...b.position};b.feet=feet+m.y;b.position={x:pos.x+m.x,y:b.feet,z:pos.z+m.z};b.body.setNextKinematicTranslation({x:b.position.x,y:b.feet+offset,z:b.position.z});
  return{moved:Math.hypot(m.x,m.z),impacts,blocked:travel>.001&&Math.hypot(m.x,m.z)<travel*.7};
 }
 step(){this.world.step();}
 resetContacts(){this.contacts.clear();this.damageTime.clear();}
 lineOfSight(a:Vec3,b:Vec3){const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,len=Math.hypot(dx,dy,dz);if(len<.01)return true;return !this.world.castRay(new RAPIER.Ray(a,{x:dx/len,y:dy/len,z:dz/len}),Math.max(0,len-.05),true,undefined,undefined,undefined,undefined,c=>!this.grounds.has(c.handle)&&!c.parent());}
}
