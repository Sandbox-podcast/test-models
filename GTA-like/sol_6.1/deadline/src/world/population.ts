import{VEHICLES,type VehicleId}from'../economy.ts';
import{RoadTraffic,type MotorAgent,type DriverContext}from'./driving.ts';
import * as T from 'three';
import { DISTRICTS, PATHS, LOC, landHeight, isClear, surfacesNear, type DistrictId } from './data.ts';
import { atDistance, distance, clamp, mix, type Vec3, type Path, type Sample } from './geometry.ts';
import { SurfaceNavigation } from './navigation.ts';
import { Physics, type Body, type Impact } from './physics.ts';
import { makeHuman,animateHuman,makeCar,applyCarDamage,repairCar } from './render.ts';
export type Period='matin'|'journée'|'soirée';
export const periodAt=(hour:number):Period=>hour>=6&&hour<11?'matin':hour>=11&&hour<19?'journée':'soirée';
export interface Citizen {id:string;district:DistrictId;mesh:T.Group;position:Vec3;hp:number;state:'walk'|'wait'|'work'|'talk'|'refuge'|'dead';origin:string;destination:string;path:Vec3[];index:number;speed:number;wait:number;age:number;activity:string;}
export interface Traffic extends MotorAgent {model:VehicleId;id:string;district:DistrictId;mesh:T.Group;body:Body;track:Path;s:number;direction:1|-1;speed:number;desired:number;wait:number;angle:number;blocked:number;destination:string;stolen?:boolean;}
interface Place {id:string;position:Vec3;activity:string}
const COLORS=[0x8c725e,0x7f8f87,0x9a8192,0x5e7d8d,0xa79566,0x6d7b70,0x9b6860,0xa6aa94];
export class Population {
 citizens:Citizen[]=[];traffic:Traffic[]=[];places=new Map<DistrictId,Place[]>();period:Period='soirée';private tickCounter=0;
 physics:Physics;scene:T.Scene;pedestrians:SurfaceNavigation;roads:RoadTraffic;
 constructor(physics:Physics,scene:T.Scene,pedestrians:SurfaceNavigation){
  this.physics=physics;this.scene=scene;this.pedestrians=pedestrians;this.roads=new RoadTraffic(physics);
  const activities:Record<DistrictId,string[]>= {forges:['atelier','arrêt de la gare','domicile','livraison'],dalle:['école','commerce','permanence','hall'],node:['guichet','bureau','relève','salle d’attente'],quais:['marché','manutention','promenade','halle'],belvederes:['café','banc','rempart','terrasse']};
  for(const district of DISTRICTS){
   const paths=PATHS.filter(p=>p.district===district.id&&!p.id.startsWith('J')&&p.mode==='road');const places:Place[]=[];
   for(const path of paths)for(let s=10;s<path.points.at(-1)!.s-5;s+=14){
    for(const side of [-1,1]){const p=atDistance(path,s,side*(path.width/2+path.sidewalk*.5));const h=landHeight(p.x,p.z);const q={x:p.x,y:h??p.y,z:p.z};if(!isClear(q,.65,physics.open))continue;const index=places.length;places.push({id:district.id+'-'+index,position:q,activity:activities[district.id][index%4]});}
   }
   // Contacts are real occupied destinations, as well as the sidewalk stops.
   for(const id of district.id==='forges'?['garage','sorel']:district.id==='dalle'?['nadia','lise']:district.id==='node'?['nightCrew','sorelNode']:district.id==='quais'?['paperOwner','boardQ']:[])places.push({id,position:{...LOC[id]},activity:district.id==='dalle'?'permanence':'relais'});
   this.places.set(district.id,places);
   const count={forges:48,dalle:30,node:36,quais:32,belvederes:26}[district.id];
   for(let i=0;i<count;i++){
    const from=places[i%places.length],to=places[(i*7+3)%places.length];if(!from||!to)continue;
    const path=pedestrians.route(from.position,to.position);if(!path.length)continue;
    const fraction=(i*.6180339)%1,index=Math.floor(path.length*fraction),position={...path[index]},mesh=makeHuman(COLORS[i%COLORS.length]);mesh.position.set(position.x,position.y,position.z);scene.add(mesh);
    const waiting=i%4===0;this.citizens.push({id:district.id+'-resident-'+i,district:district.id,mesh,position,hp:45,state:waiting?(i%8===0?'talk':'work'):'walk',origin:from.id,destination:to.id,path,index,speed:1.05+(i%5)*.14,wait:waiting?12+(i%5)*6:0,age:i*7,activity:from.activity});
   }
   const trafficPaths=paths.filter(p=>p.width>8);
   for(let i=0;i<district.traffic*2-(district.id==='belvederes'?1:0);i++){
    const track=trafficPaths[district.id==='forges'&&i<4?0:i%trafficPaths.length];if(!track)continue;const direction=i%2?1:-1,s=district.id==='forges'&&i<4?12+i*19:(.1+(i*.17)% .8)*track.points.at(-1)!.s,p=atDistance(track,s,direction*2.3);const model=(['compact','van','utility','sport','courier']as VehicleId[])[i%5],body=physics.makeBody(p,'car',VEHICLES[model]),mesh=makeCar([0x8d9a91,0xb59b72,0x687c88,0xa59c8d,0x836b68][i%5],model);scene.add(mesh);let angle=Math.atan2(p.tx*direction,p.tz*direction);
    const candidates=this.roads.network.nodes.filter(n=>n.path.width>8&&n.s>7&&n.s<n.path.points.at(-1)!.s-7&&!this.roads.network.junction(n.point,4)).sort((a,b)=>distance(a.point,p)-distance(b.point,p));
    let lane=atDistance(track,s,direction*1.9),actualTrack=track,actualS=s;
    for(const n of candidates){const q=atDistance(n.path,n.s,direction*1.9);if(this.traffic.some(c=>Math.abs(c.body.feet-q.y)<2&&distance(c.body.position,q)<8)||!physics.clearAt(q,1.15))continue;lane=q;actualTrack=n.path;actualS=n.s;angle=Math.atan2(q.tx*direction,q.tz*direction);break;}
    physics.teleport(body,lane);const q={x:0,y:Math.sin(angle/2),z:0,w:Math.cos(angle/2)};body.body.setRotation(q,true);body.body.setNextKinematicRotation(q);mesh.position.set(lane.x,lane.y,lane.z);mesh.rotation.y=angle;
    this.traffic.push({model,id:district.id+'-traffic-'+i,district:district.id,mesh,body,track:actualTrack,s:actualS,direction:direction as 1|-1,speed:0,desired:district.id==='dalle'?6:9,wait:0,angle,blocked:0,destination:activities[district.id][i%4]});
   }
  }
 }
 update(dt:number,time:number,hour:number,player:Vec3,incident:{point:Vec3;until:number}|null,playerCar?:Body|Body[],driver?:DriverContext){
  const period=periodAt(hour),changed=period!==this.period;this.period=period;this.tickCounter++;
  for(const c of this.citizens){
   const near=distance(c.position,player)<82;c.mesh.visible=near;
   const knock=c.mesh.userData.knock as {x:number;z:number;life:number}|undefined;if(knock&&knock.life>0){const next={x:c.position.x+knock.x*dt,y:c.position.y,z:c.position.z+knock.z*dt};if(this.physics.clearAt(next,.3)&&isClear(next,.3,this.physics.open)){c.position=next;c.mesh.position.set(next.x,next.y+(c.hp<=0?.2:0),next.z);}knock.x*=Math.exp(-dt*5);knock.z*=Math.exp(-dt*5);knock.life-=dt;}
   if(c.state==='dead')continue;
   if(!near&&this.tickCounter%15!==0)continue;const delta=near?dt:dt*15;c.age+=delta;
   if(incident&&time<incident.until&&distance(c.position,incident.point)<20&&c.state!=='refuge'){
    const places=this.places.get(c.district)!;const refuge=places.reduce((a,b)=>distance(a.position,incident.point)>distance(b.position,incident.point)?a:b);const path=this.pedestrians.route(c.position,refuge.position);if(path.length){c.path=path;c.index=0;c.state='refuge';c.destination=refuge.id;c.activity='cherche un refuge';c.wait=8;}
   }
   if(c.state==='refuge'&&(!incident||time>incident.until)&&c.index>=c.path.length){c.state='wait';c.wait=3;}
   if(changed&&c.state!=='refuge')c.wait=0;
   if(c.wait>0&&c.state!=='refuge'){c.wait-=delta;animateHuman(c.mesh,false,time);if(c.wait>0)continue;}
   if(c.index>=c.path.length){
    if(c.state==='refuge'&&incident&&time<incident.until)continue;
    const places=this.places.get(c.district)!,priorities=({forges:{matin:['atelier','livraison','arrêt de la gare'],journée:['atelier','livraison','relais'],soirée:['domicile','relais','arrêt de la gare']},dalle:{matin:['école','commerce','permanence'],journée:['commerce','permanence','hall'],soirée:['permanence','hall','commerce']},node:{matin:['bureau','guichet','relève'],journée:['guichet','bureau','salle d’attente'],soirée:['relève','relais','salle d’attente']},quais:{matin:['manutention','halle','marché'],journée:['marché','halle','promenade'],soirée:['promenade','relais','halle']},belvederes:{matin:['café','rempart'],journée:['rempart','terrasse','banc'],soirée:['café','terrasse','banc']}})[c.district][period];
    const preferred=places.filter(p=>priorities.includes(p.activity)),seed=Number(c.id.split('-').at(-1))||0,pool=preferred.length&&seed%4!==0?preferred:places,choice=(Math.floor(c.age/10)+seed)%pool.length,to=pool[choice],path=this.pedestrians.route(c.position,to.position);
    c.origin=c.destination;c.destination=to.id;c.activity=to.activity;c.path=path;c.index=0;
    c.wait=period==='matin'?2:period==='journée'?(c.activity==='marché'?22:9):c.activity==='café'||c.activity==='hall'?35:14;
    c.state=period==='matin'?'walk':choice%3===0?'talk':choice%3===1?'work':'wait';if(!path.length)c.wait=8;continue;
   }
   const target=c.path[c.index],len=distance(c.position,target),speed=c.state==='refuge'?3.7:c.speed;
   if(len<.3){c.index++;continue;}
   const t=Math.min(1,speed*delta/len),next={x:mix(c.position.x,target.x,t),y:mix(c.position.y,target.y,t),z:mix(c.position.z,target.z,t)};
   if(!isClear(next,.28,this.physics.open)||!this.physics.clearAt(next,.28,undefined,.25)){c.index=c.path.length;c.wait=1;continue;}
   // Small reciprocal separation keeps queues and groups legible without body-blocking mission doors.
   if(near&&this.tickCounter%3===0)for(const other of this.citizens){if(other===c||other.hp<=0||Math.abs(other.position.y-next.y)>1)continue;const d=distance(next,other.position);if(d>.05&&d<.65){const q={x:next.x+(next.x-other.position.x)/d*.05,y:next.y,z:next.z+(next.z-other.position.z)/d*.05};if(isClear(q,.30,this.physics.open)){next.x=q.x;next.z=q.z;}break;}}
   c.mesh.rotation.y=Math.atan2(next.x-c.position.x,next.z-c.position.z);c.position=next;c.mesh.position.set(next.x,next.y,next.z);animateHuman(c.mesh,true,time,c.state==='refuge'?1.6:1);
  }
  const bodies=this.traffic.map(c=>c.body);if(playerCar)bodies.push(...(Array.isArray(playerCar)?playerCar:[playerCar]));
  this.roads.pedestrians=this.citizens.filter(c=>c.hp>0&&distance(c.position,player)<110).map(c=>c.position);this.roads.update(this.traffic,dt,time,driver||{position:player,angle:0,speed:0},bodies);
 }
 hitCitizen(c:Citizen,damage:number,direction:Vec3){if(c.hp<=0)return;const dx=c.position.x-direction.x,dz=c.position.z-direction.z,len=Math.hypot(dx,dz)||1,strength=Math.min(8,damage*.10);c.mesh.userData.knock={x:dx/len*strength,z:dz/len*strength,life:1};c.hp-=damage;if(c.hp<=0){c.hp=0;c.state='dead';c.mesh.rotation.z=Math.PI/2;c.mesh.position.y=c.position.y+.2;}else{c.state='refuge';c.wait=0;c.index=c.path.length;}}
 reset(){
  for(const[i,c]of this.citizens.entries()){const places=this.places.get(c.district)!,from=places[i%places.length],to=places[(i*7+3)%places.length];c.hp=45;c.state='wait';c.origin=from.id;c.destination=to.id;c.position={...from.position};c.path=this.pedestrians.route(from.position,to.position);c.index=0;c.wait=i%9;c.age=i*7;c.activity=from.activity;c.mesh.rotation.z=0;c.mesh.userData.knock=undefined;c.mesh.position.set(c.position.x,c.position.y,c.position.z);}
  for(const[i,c]of this.traffic.entries()){c.controlled=false;c.parked=false;c.route=[];c.requestedUntil=0;c.stolen=false;c.s=10+(i*19)%(c.track.points.at(-1)!.s-20);c.direction=i%2?1:-1;c.angle=Math.atan2(atDistance(c.track,c.s).tx*c.direction,atDistance(c.track,c.s).tz*c.direction);c.speed=0;c.wait=0;c.blocked=0;this.physics.teleport(c.body,atDistance(c.track,c.s,c.direction*1.9));const q={x:0,y:Math.sin(c.angle/2),z:0,w:Math.cos(c.angle/2)};c.body.body.setRotation(q,true);c.body.body.setNextKinematicRotation(q);repairCar(c.mesh);}
 }
 countVisible(camera:T.Camera){const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));const citizens=this.citizens.filter(c=>c.mesh.visible&&c.hp>0&&frustum.containsPoint(new T.Vector3(c.position.x,c.position.y+1,c.position.z)));const cars=this.traffic.filter(c=>c.mesh.visible&&frustum.containsPoint(new T.Vector3(c.body.position.x,c.body.position.y+1,c.body.position.z)));return{pedestrians:citizens.length,vehicles:cars.length,period:this.period,groups:[...new Set(citizens.map(c=>c.activity))]};}
}
