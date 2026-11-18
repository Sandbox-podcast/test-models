import*as T from'three';import{VEHICLES,type VehicleId}from'../economy.ts';import{Physics,type Body}from'./physics.ts';import{makeCar,repairCar}from'./render.ts';import{PARKING_SPOTS}from'./services.ts';import{distance,rectanglesOverlap,type Vec3}from'./geometry.ts';
export interface Driveable{id:string;model:VehicleId;mesh:T.Group;body:Body;angle:number;speed:number;controlled?:boolean;parked?:boolean;}
export class Fleet{
 vehicles:Driveable[]=[];physics:Physics;scene:T.Scene;
 constructor(physics:Physics,scene:T.Scene){this.physics=physics;this.scene=scene;(['courier','compact','van','sport','utility']as VehicleId[]).forEach((model,i)=>{
   const spec=VEHICLES[model],body=physics.makeBody(PARKING_SPOTS[i],'car',spec),mesh=makeCar(spec.color,model),angle=Math.PI;body.body.setRotation({x:0,y:1,z:0,w:0},true);body.body.setNextKinematicRotation({x:0,y:1,z:0,w:0});mesh.position.set(body.position.x,body.position.y,body.position.z);mesh.rotation.y=angle;scene.add(mesh);this.vehicles.push({id:'fleet:'+model,model,body,mesh,angle,speed:0,parked:true});
  });}
 recall(model:VehicleId,near:Vec3,others:Body[]){const vehicle=this.vehicles.find(v=>v.model===model)!;if(vehicle.controlled)return false;
  const candidates=[...PARKING_SPOTS].sort((a,b)=>distance(a,near)-distance(b,near));const spot=candidates.find(p=>this.physics.carFits(vehicle.body,p,Math.PI,others)&&others.every(b=>b===vehicle.body||Math.abs(b.feet-p.y)>2||!rectanglesOverlap({id:'candidate',x:p.x,z:p.z,y:p.y,h:2,w:vehicle.body.halfWidth*2,d:vehicle.body.halfLength*2,angle:Math.PI},{id:'parked',x:b.position.x,z:b.position.z,y:b.feet,h:2,w:b.halfWidth*2,d:b.halfLength*2,angle:this.physics.bodyAngle(b)},.35)));if(!spot)return false;
  this.physics.teleport(vehicle.body,spot);vehicle.body.body.setRotation({x:0,y:1,z:0,w:0},true);vehicle.body.body.setNextKinematicRotation({x:0,y:1,z:0,w:0});vehicle.mesh.position.set(spot.x,spot.y,spot.z);vehicle.mesh.rotation.y=Math.PI;vehicle.angle=Math.PI;vehicle.speed=0;repairCar(vehicle.mesh);return true;
 }
 reset(){this.vehicles.forEach((v,i)=>{v.controlled=false;v.speed=0;v.angle=Math.PI;this.physics.teleport(v.body,PARKING_SPOTS[i]);v.body.body.setRotation({x:0,y:1,z:0,w:0},true);v.body.body.setNextKinematicRotation({x:0,y:1,z:0,w:0});v.mesh.position.set(v.body.position.x,v.body.position.y,v.body.position.z);v.mesh.rotation.y=Math.PI;repairCar(v.mesh);});}
}
