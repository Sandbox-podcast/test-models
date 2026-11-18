import*as T from'three';
import{VEHICLES}from'../economy.ts';
import{makeCar,repairCar}from'./render.ts';
import{distance,type Vec3}from'./geometry.ts';
import{Physics,type Body}from'./physics.ts';
import{RoadTraffic,type MotorAgent,type DriverContext}from'./driving.ts';

export const ALERT_NAMES=['Hors surveillance','Signalement','Poursuite','Renforts','Chasse renforcée'];
export class AlertState{
 score=0;lastSeen=-100;lastKnown:Vec3|null=null;observed=false;escapes=0;
 get level(){return this.score>=10?4:this.score>=6?3:this.score>=3?2:this.score>0?1:0;}
 get escapeSeconds(){return[0,10,15,22,28][this.level];}
 get remaining(){return this.level?this.escapeSeconds:0;}
 report(point:Vec3,severity:number,time:number){this.score=Math.min(13,this.score+severity);this.lastKnown={...point};this.lastSeen=time;}
 tick(dt:number,time:number,observation:Vec3|null){this.observed=!!observation;
  if(observation){this.score=Math.min(13,Math.max(1,this.score)+dt*.085);this.lastKnown={...observation};this.lastSeen=time;}
  else if(this.level&&time-this.lastSeen>=this.escapeSeconds){this.score=0;this.lastKnown=null;this.escapes++;}
 }
 reset(){this.score=0;this.lastSeen=-100;this.lastKnown=null;this.observed=false;}
}
export interface PatrolCar extends MotorAgent{active:boolean;shotAt:number;retiring:boolean;beacons:T.Mesh[];}
export class PursuitDirector{
 alert=new AlertState();vehicles:PatrolCar[]=[];spawnAt=0;observed=false;reinforcements=0;
 physics:Physics;roads:RoadTraffic;constructor(physics:Physics,roads:RoadTraffic,scene:T.Scene){this.physics=physics;this.roads=roads;
  for(let i=0;i<4;i++){const model=i%2?'utility':'courier',body=physics.makeBody({x:0,y:-500,z:0},'car',VEHICLES[model]),mesh=makeCar(0x334a54,model),beacons:T.Mesh[]=[];
   for(const side of [-1,1]){const lamp=new T.Mesh(new T.BoxGeometry(.45,.15,.36),new T.MeshBasicMaterial({color:side<0?0xf4ac58:0x82cbe8}));lamp.position.set(side*.29,1.72,0);mesh.add(lamp);beacons.push(lamp);}scene.add(mesh);mesh.visible=false;body.collider.setEnabled(false);
   this.vehicles.push({id:'security-'+i,model,body,mesh,angle:0,speed:0,blocked:0,active:false,shotAt:0,retiring:false,beacons});
  }
 }
 report(point:Vec3,severity:number,time:number){const fresh=!this.alert.level;this.alert.report(point,severity,time);if(fresh)this.spawnAt=time+1.5;for(const car of this.vehicles)if(car.active&&!car.controlled&&car.retiring){car.retiring=false;car.planAt=time;}}
 private spawn(player:DriverContext,bodies:Body[],time:number){const car=this.vehicles.find(c=>!c.active&&!c.controlled);if(!car||!this.alert.lastKnown)return false;
  const candidates=this.roads.network.nodes.filter(n=>n.path.width>8&&n.links.length>1&&!this.roads.network.junction(n.point,3)&&distance(n.point,player.position)>66&&distance(n.point,player.position)<145).sort((a,b)=>distance(a.point,this.alert.lastKnown!)-distance(b.point,this.alert.lastKnown!));
  for(const n of candidates){const route=this.roads.network.route(n.point,this.alert.lastKnown);if(route.length<3)continue;const p=route[0],angle=Math.atan2(p.tx,p.tz);if(!this.physics.carFits(car.body,p,angle,bodies)||bodies.some(b=>b.collider.isEnabled()&&Math.abs(b.feet-p.y)<2&&distance(b.position,p)<7))continue;
   this.physics.teleport(car.body,p);const q={x:0,y:Math.sin(angle/2),z:0,w:Math.cos(angle/2)};car.body.body.setRotation(q,true);car.body.body.setNextKinematicRotation(q);car.body.collider.setEnabled(true);car.active=true;car.retiring=false;car.parked=false;car.speed=0;car.angle=angle;car.route=route;car.routeIndex=0;car.planAt=time+2;car.blocked=0;repairCar(car.mesh);this.reinforcements++;return true;
  }return false;
 }
 update(dt:number,time:number,player:DriverContext,bodies:Body[],externalSeen:boolean,hurt:(damage:number)=>void=()=>{}){
  let sees=externalSeen;const visible=new Set<PatrolCar>();
  for(const car of this.vehicles){if(!car.active||car.controlled||!this.alert.level)continue;const p=car.body.position,d=distance(p,player.position),heading=Math.atan2(player.position.x-p.x,player.position.z-p.z),cone=Math.abs(Math.atan2(Math.sin(heading-car.angle),Math.cos(heading-car.angle)))<1.35||d<11;
   if(d<55&&Math.abs(p.y-player.position.y)<4&&cone&&this.physics.lineOfSight({...p,y:p.y+1.15},{...player.position,y:player.position.y+1.1},bodies.filter(b=>b!==car.body&&b!==player.body))){sees=true;visible.add(car);}
  }
  this.alert.tick(dt,time,sees?player.position:null);this.observed=sees;
  const level=this.alert.level,active=this.vehicles.filter(c=>c.active&&!c.controlled&&!c.retiring).length;
  if(level&&active<level&&time>=this.spawnAt){if(this.spawn(player,bodies,time))this.spawnAt=time+(level>=3?6:9);else this.spawnAt=time+2;}
  for(const[i,car]of this.vehicles.entries()){
   if(!car.active||car.controlled)continue;const p=car.body.position;car.mesh.visible=distance(p,player.position)<115;
   car.beacons.forEach((lamp,j)=>lamp.visible=level>0&&Math.floor(time*5+j)%2===0);
   if(!level&&!car.retiring){car.retiring=true;this.roads.plan(car,this.roads.network.destination(p,i*83+211),time);}
   if(car.retiring&&distance(p,player.position)>80){car.active=false;car.mesh.visible=false;car.body.collider.setEnabled(false);continue;}
   if(level&&time>=(car.planAt||0)){
    let target=this.alert.lastKnown!;if(sees&&player.body)target={x:target.x+Math.sin(player.angle)*Math.min(12,Math.abs(player.speed)*.55),y:target.y,z:target.z+Math.cos(player.angle)*Math.min(12,Math.abs(player.speed)*.55)};
    else if(distance(p,target)<10){const a=time*.18+i*1.7;target={x:target.x+Math.sin(a)*17,y:target.y,z:target.z+Math.cos(a)*17};}
    this.roads.plan(car,target,time,false);car.planAt=time+1.5+i*.15;
   }
   const close=distance(p,player.position),desired=car.retiring?8:!player.body&&close<7?0:[0,12,16,20,24][level];
   this.roads.drive(car,desired,dt,time,bodies,player,true);
   if(level&&visible.has(car)&&close<(player.body?4.5:13)&&time>car.shotAt&&Math.abs(p.y-player.position.y)<2){car.shotAt=time+2.5;if(!player.body||close<4.5)hurt(player.body?2:3);}
  }
 }
 reset(){this.alert.reset();this.spawnAt=0;this.observed=false;for(const car of this.vehicles){car.active=false;car.controlled=false;car.parked=false;car.speed=0;car.route=[];car.mesh.visible=false;car.body.collider.setEnabled(false);}this.roads.priority.reservations.clear();}
}
