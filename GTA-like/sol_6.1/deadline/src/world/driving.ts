import type*as T from'three';
import{PATHS,GATES,isClear,supportAt}from'./data.ts';
import{atDistance,distance,clamp,rectanglesOverlap,segmentHit,type Vec3,type Path}from'./geometry.ts';
import{VEHICLES,type VehicleId}from'../economy.ts';
import{Physics,type Body}from'./physics.ts';
import{applyCarDamage}from'./render.ts';

export interface LanePoint extends Vec3{tx:number;tz:number;road:string;width:number;}
interface Node{point:Vec3;path:Path;s:number;links:number[];}
export interface Junction{id:number;point:Vec3;radius:number;}
/** Shared, connected road graph. Traffic and pursuers use the same junctions and elevations. */
export class RoadNetwork{
 nodes:Node[]=[];junctions:Junction[]=[];
 constructor(){
  const paths=PATHS.filter(p=>p.mode==='road'),ends:number[]=[];
  for(const path of paths){const length=path.points.at(-1)!.s,count=Math.ceil(length/3);let previous=-1;
   for(let i=0;i<=count;i++){const s=length*i/count,id=this.nodes.length;this.nodes.push({point:atDistance(path,s),path,s,links:previous<0?[]:[previous]});if(previous>=0)this.nodes[previous].links.push(id);if(i===0||i===count)ends.push(id);previous=id;}
  }
  for(const id of ends){const a=this.nodes[id],matches=this.nodes.map((b,i)=>({b,i,d:distance(a.point,b.point)})).filter(q=>q.b.path!==a.path&&q.d<7.5&&Math.abs(q.b.point.y-a.point.y)<.35).sort((a,b)=>a.d-b.d);const seen=new Set<string>();
   for(const {b,i}of matches){if(seen.has(b.path.id)||!this.connected(a.point,b.point))continue;seen.add(b.path.id);a.links.push(i);b.links.push(id);
    const point={x:(a.point.x+b.point.x)/2,y:(a.point.y+b.point.y)/2,z:(a.point.z+b.point.z)/2};if(!this.junctions.some(j=>distance(j.point,point)<8&&Math.abs(j.point.y-point.y)<1))this.junctions.push({id:this.junctions.length,point,radius:6});
   }
  }
 }
 private connected(a:Vec3,b:Vec3){const length=distance(a,b),n=Math.max(1,Math.ceil(length/.4));let y=a.y;for(let i=0;i<=n;i++){const t=i/n,p={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t},h=supportAt(p,y,'car',.4,new Set(['badge']));if(h===null||!isClear({...p,y:h},1.08,new Set(['badge'])))return false;y=h;}return true;}
 nearest(p:Vec3){let best=-1,score=Infinity;this.nodes.forEach((n,i)=>{const d=distance(p,n.point)+Math.abs(p.y-n.point.y)*15;if(d<score){score=d;best=i;}});return best;}
 route(from:Vec3,to:Vec3,heading?:number,lane=1.9):LanePoint[]{
  const start=this.nearest(from),end=this.nearest(to);if(start<0||end<0)return[];const costs=new Float64Array(this.nodes.length).fill(Infinity),parents=new Int32Array(this.nodes.length).fill(-1),done=new Set<number>();costs[start]=0;
  const closed=Object.entries(GATES).filter(([id])=>!this.open.has(id)).map(([,gate])=>gate);
  for(let count=0;count<this.nodes.length;count++){let id=-1,best=Infinity;for(let i=0;i<costs.length;i++)if(!done.has(i)&&costs[i]<best){id=i;best=costs[i];}if(id<0)break;if(id===end)break;done.add(id);const a=this.nodes[id];
   for(const next of a.links){if(done.has(next))continue;const b=this.nodes[next];if(b.path.gate&&!this.open.has(b.path.gate)||closed.some(g=>segmentHit({...a.point,y:a.point.y+.9},{...b.point,y:b.point.y+.9},g,1.05)!==null))continue;const headingCost=id===start&&heading!==undefined&&((b.point.x-a.point.x)*Math.sin(heading)+(b.point.z-a.point.z)*Math.cos(heading))<-.2?1000:0;const cost=best+Math.max(.1,distance(a.point,b.point))+headingCost;if(cost<costs[next]){costs[next]=cost;parents[next]=id;}}
  }
  if(!Number.isFinite(costs[end]))return[];let ids:number[]=[];for(let id=end;id>=0;id=parents[id]){ids.push(id);if(id===start)break;}ids.reverse();const unique:number[]=[];for(const id of ids){if(unique.length&&distance(this.nodes[unique.at(-1)!].point,this.nodes[id].point)<.15)unique[unique.length-1]=id;else unique.push(id);}ids=unique;const out:LanePoint[]=[];
  for(let i=0;i<ids.length;i++){const n=this.nodes[ids[i]],next=this.nodes[ids[Math.min(i+1,ids.length-1)]],prior=this.nodes[ids[Math.max(0,i-1)]];let tx=next.point.x-n.point.x,tz=next.point.z-n.point.z;if(Math.hypot(tx,tz)<.05){tx=n.point.x-prior.point.x;tz=n.point.z-prior.point.z;}if(Math.hypot(tx,tz)<.05){const p=atDistance(n.path,n.s);tx=p.tx;tz=p.tz;}const d=Math.hypot(tx,tz)||1;tx/=d;tz/=d;
   const junction=this.junction(n.point,3),offset=junction?lane*clamp((distance(n.point,junction.point)-1)/7,0,1):lane;
   const p={x:n.point.x-tz*offset,y:n.point.y,z:n.point.z+tx*offset};const y=supportAt(p,n.point.y,'car',.2,this.open);out.push({...p,y:y??n.point.y,tx,tz,road:n.path.id,width:n.path.width});
  }return out;
 }
 open=new Set<string>();
 destination(from:Vec3,seed:number){const pool=this.nodes.filter(n=>n.path.width>8&&n.links.length>1&&!this.junction(n.point,9)&&distance(n.point,from)>90);return(pool[Math.abs(seed)%pool.length]||this.nodes[0]).point;}
 junction(p:Vec3,padding=0){return this.junctions.find(j=>Math.abs(j.point.y-p.y)<1.5&&distance(j.point,p)<j.radius+padding);}
}
export interface MotorAgent{id:string;model:VehicleId;body:Body;mesh:T.Group;angle:number;speed:number;controlled?:boolean;parked?:boolean;route?:LanePoint[];routeIndex?:number;planAt?:number;blocked:number;requestedUntil?:number;yielding?:boolean;yieldUntil?:number;journey?:number;reverseUntil?:number;}
export interface DriverContext{position:Vec3;body?:Body;angle:number;speed:number;}
export class JunctionPriority{
 reservations=new Map<number,{id:string;until:number}>();
 mayEnter(car:MotorAgent,zone:Junction,time:number,player:DriverContext,bodies:Body[],exit:Vec3){
  if(distance(car.body.position,zone.point)<zone.radius)return true; // clear the crossing before yielding
  const playerNear=player.body&&Math.abs(player.position.y-zone.point.y)<1.5&&distance(player.position,zone.point)<24&&((zone.point.x-player.position.x)*Math.sin(player.angle)+(zone.point.z-player.position.z)*Math.cos(player.angle))>-3;
  const claim=this.reservations.get(zone.id);if(playerNear||claim&&claim.until>time&&claim.id!==car.id)return false;
  const heading=Math.atan2(exit.x-zone.point.x,exit.z-zone.point.z);
  if(bodies.some(b=>b!==car.body&&b!==player.body&&b.collider.isEnabled()&&Math.abs(b.feet-zone.point.y)<1.5&&(distance(b.position,zone.point)<4.8||rectanglesOverlap({id:'exit',x:exit.x,z:exit.z,y:exit.y,w:car.body.halfWidth*2+.5,d:car.body.halfLength*2+2,angle:heading,h:2},{id:'other',x:b.position.x,z:b.position.z,y:b.feet,w:b.halfWidth*2,d:b.halfLength*2,angle:Math.atan2(2*b.body.rotation().w*b.body.rotation().y,1-2*b.body.rotation().y**2),h:2}))))return false;
  this.reservations.set(zone.id,{id:car.id,until:time+5});return true;
 }
 release(car:MotorAgent){for(const[id,claim]of this.reservations)if(claim.id===car.id&&distance(car.body.position,this.zones.find(z=>z.id===id)!.point)>10)this.reservations.delete(id);}
 private zones:Junction[];constructor(zones:Junction[]){this.zones=zones;}
}
export class RoadTraffic{
 network=new RoadNetwork();priority=new JunctionPriority(this.network.junctions);
 pedestrians:Vec3[]=[];
 physics:Physics;constructor(physics:Physics){this.physics=physics;}
 plan(car:MotorAgent,target:Vec3,time:number,keepDirection=true){car.route=this.network.route(car.body.position,target,keepDirection?car.angle:undefined);car.routeIndex=0;car.planAt=time+4;}
 requestStop(car:MotorAgent,time:number){if(car.controlled||car.parked)return false;car.requestedUntil=time+18;return true;}
 drive(car:MotorAgent,desired:number,dt:number,time:number,bodies:Body[],player:DriverContext,security=false){
  const route=car.route||[];let index=car.routeIndex||0;if(!route.length){car.speed=0;return;}
  // The closest upcoming sample prevents a newly planned route from aiming behind the car.
  let nearest=index,best=Infinity;for(let i=index;i<Math.min(route.length,index+9);i++){const d=distance(car.body.position,route[i]);if(d<best){nearest=i;best=d;}}index=nearest;while(index<route.length-1&&distance(car.body.position,route[index])<3)index++;car.routeIndex=index;
  const p=car.body.position,nearZone=this.network.junction(p),target={...route[index]};let look=index;while(look<route.length-1&&distance(p,route[look])<5.5)look++;Object.assign(target,route[look]);
  const request=(car.requestedUntil||0)>time,dx=p.x-player.position.x,dz=p.z-player.position.z,along=dx*Math.sin(player.angle)+dz*Math.cos(player.angle),across=Math.abs(dx*Math.cos(player.angle)-dz*Math.sin(player.angle));
  const playerPriority=!!player.body&&Math.abs(p.y-player.position.y)<1.5&&along>-5&&along<29&&across<3.5&&Math.abs(player.speed)>1.2;
  if(playerPriority)car.yieldUntil=time+2;car.yielding=!security&&(request||playerPriority||time<(car.yieldUntil||0))&&!nearZone;
  if(car.yielding){const extra=Math.max(0,target.width/2-VEHICLES[car.model].width/2-.12-1.9),side=-(p.x-route[index].x)*target.tz+(p.z-route[index].z)*target.tx,gap=Math.max(0,extra-side);target.x=p.x+target.tx*1.2-target.tz*gap;target.z=p.z+target.tz*1.2+target.tx*gap;desired=gap>.18?2:0;}

  const entering=this.network.junction(target,5);if(entering&&!nearZone){let closest=index;for(let i=index;i<Math.min(route.length,index+14);i++)if(distance(route[i],entering.point)<distance(route[closest],entering.point))closest=i;let exit=route.at(-1)!;for(let i=closest;i<route.length;i++)if(distance(route[i],entering.point)>entering.radius+5){exit=route[i];break;}if(!this.priority.mayEnter(car,entering,time,security?{...player,body:undefined}:player,bodies,exit))desired=0;}
  // Never wait in a junction merely because a driver has hailed the car.
  if(nearZone&&request)desired=Math.max(desired,4);
  const heading=Math.atan2(target.x-p.x,target.z-p.z),error=Math.atan2(Math.sin(heading-car.angle),Math.cos(heading-car.angle));desired=Math.min(desired,Math.abs(error)>1?2.5:Math.abs(error)>.45?5:desired);
  if(index>=route.length-2&&distance(p,route.at(-1)!)<3)desired=0;
  for(const b of bodies){if(b===car.body||!b.collider.isEnabled()||Math.abs(b.feet-p.y)>1.7)continue;const x=b.position.x-p.x,z=b.position.z-p.z,f=x*Math.sin(car.angle)+z*Math.cos(car.angle),side=Math.abs(x*Math.cos(car.angle)-z*Math.sin(car.angle));if(f>0&&f<Math.max(7,car.speed*1.2)&&side<car.body.halfWidth+b.halfWidth+.25)desired=Math.min(desired,f<4.8?0:Math.max(0,(f-4.8)*1.6));}
  if(!player.body&&Math.abs(player.position.y-p.y)<1.5&&distance(p,player.position)<6){const f=(player.position.x-p.x)*Math.sin(car.angle)+(player.position.z-p.z)*Math.cos(car.angle);if(f>0)desired=0;}
  for(const person of this.pedestrians){const x=person.x-p.x,z=person.z-p.z;if(Math.abs(x)>8||Math.abs(z)>8||Math.abs(person.y-p.y)>1.5)continue;const forward=x*Math.sin(car.angle)+z*Math.cos(car.angle),side=Math.abs(x*Math.cos(car.angle)-z*Math.sin(car.angle));if(forward>0&&forward<7&&side<car.body.halfWidth+.6)desired=Math.min(desired,forward<4?0:2);}
  if(!nearZone&&car.blocked>2&&!request){car.reverseUntil=time+.8;car.blocked=0;}
  const reversing=(car.reverseUntil||0)>time;car.speed+=(reversing?-2:desired-car.speed)*Math.min(1,dt*(desired<car.speed?7:2));if(reversing)car.speed=-2;
  if(Math.abs(car.speed)>.1&&!reversing)car.angle+=clamp(error,-2.3*dt,2.3*dt);
  const result=this.physics.move(car.body,Math.sin(car.angle)*car.speed*dt,Math.cos(car.angle)*car.speed*dt,car.angle,car.speed,time,bodies.filter(b=>b!==car.body&&b.collider.isEnabled()));car.angle=result.angle;
  if(result.blocked&&Math.abs(car.speed)>.3){car.blocked+=dt;car.speed*=.4;}else car.blocked=Math.max(0,car.blocked-dt);result.impacts.forEach(i=>applyCarDamage(car.mesh,i));
  car.mesh.position.set(car.body.position.x,car.body.position.y,car.body.position.z);const q=car.body.body.rotation();car.mesh.quaternion.set(q.x,q.y,q.z,q.w);car.mesh.userData.brakes.visible=desired<1||request;this.priority.release(car);
 }
 update(cars:MotorAgent[],dt:number,time:number,player:DriverContext,bodies:Body[]){this.network.open=new Set(this.physics.open);
  for(const[i,car]of cars.entries()){car.mesh.visible=car.controlled||distance(car.body.position,player.position)<105;if(car.controlled||car.parked)continue;
   if(!car.route?.length||(car.routeIndex||0)>=car.route.length-2){car.journey=(car.journey||0)+1;this.plan(car,this.network.destination(car.body.position,i*73+car.journey*131),time);}
   this.drive(car,8.5,dt,time,bodies,player);
  }
 }
}
