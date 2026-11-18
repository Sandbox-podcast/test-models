import type { Scene } from 'three';
import { distance, elevation, type Point } from './level';
import { Physics } from './physics';
import { vehicleRoutes } from './population';
import { poseOnAxis, sampleAxis, type LaneSample } from './roads';
import { makeCar, type CarModel } from './visuals';

type TrafficCar = {
  id: string; model: CarModel; axis: LaneSample[]; length: number; start: number; at:Point;
  previous:Point; yaw:number; lastYaw:number; speed:number; cruise:number; knocked:number; lit:boolean;
};
const colors=['#6b4c45','#5b7177','#86816b','#3f515c','#4c6268','#686980','#816453'];
const rootOf = (axis:LaneSample[],length:number) => poseOnAxis(axis,(length+axis.at(-1)!.length)%axis.at(-1)!.length);

export class Traffic {
  readonly cars: TrafficCar[]=[];
  private farTick=0;
  constructor(scene: Scene, private readonly physics:Physics) {
    for(const route of vehicleRoutes){
      const axis=sampleAxis(route.stops.map(([x,z])=>[x,z,0]),true);
      for(let i=0;i<route.count;i++){
        const length=i*route.spacing+2, {at,yaw}=rootOf(axis,length);
        const id=route.id+'-'+i, model=makeCar(colors[this.cars.length%colors.length]);
        scene.add(model);
        this.cars.push({id,model,axis,length,start:length,at,previous:at,yaw,lastYaw:yaw,speed:route.speed*.74,cruise:route.speed,knocked:0,lit:false});
        physics.addVehicle(id,at,yaw);
        physics.placeVehicle(id,at,yaw,false);
      }
    }
  }
  reset() {
    for(const car of this.cars){
      const {at,yaw}=rootOf(car.axis,car.start);
      Object.assign(car,{at,yaw,previous:at,lastYaw:yaw,length:car.start,speed:car.cruise*.74,knocked:0,lit:false});
      car.model.resetDamage();
      this.physics.placeVehicle(car.id,at,yaw,false);
    }
  }
  get(id:string){ return this.cars.find(v=>v.id===id); }
  hold(id:string,strength:number){
    const vehicle=this.get(id);
    if(!vehicle) return;
    vehicle.speed*=.22;
    vehicle.knocked=Math.min(4, .7+strength*.12);
  }

  update(dt:number, player:Point, blockingPeople:Point[], chase:boolean) {
    this.farTick+=dt;
    const runFar=this.farTick>=.20;
    for(const v of this.cars) {
      const near=distance(v.at,player)<59;
      if(!near&&!runFar) continue;
      const step=near?dt:this.farTick;
      v.previous=v.at;
      v.lastYaw=v.yaw;
      v.knocked=Math.max(0,v.knocked-step);
      const horizon=rootOf(v.axis,v.length+4.2+v.speed*.64).at;
      const unit:Point=[Math.sin(v.yaw),Math.cos(v.yaw)];
      const gap=(p:Point,width:number)=>{
        if(Math.abs(elevation(...p)-elevation(...v.at))>1.8) return Infinity;
        const x=p[0]-v.at[0],z=p[1]-v.at[1], along=x*unit[0]+z*unit[1];
        if(along<-.33||along>13 || Math.abs(x*unit[1]-z*unit[0])>width+Math.max(0,along-4)*.13) return Infinity;
        return along;
      };
      let desired=v.knocked>0?0:v.cruise;
      if(near){
        let clearance=gap(player,1.65);
        for(const person of blockingPeople) clearance=Math.min(clearance,gap(person,1.43));
        for(const other of this.cars) {
          if(other===v||distance(v.at,other.at)>18) continue;
          clearance=Math.min(clearance,gap(other.at,2.4)-1.9);
          if(distance(horizon,other.at)<2.3&&distance(v.at,other.at)<8) clearance=Math.min(clearance,4.6);
        }
        desired=Math.max(0,Math.min(desired,(clearance-2.75)*1.8));
        if(chase && distance(v.at,player)<17) desired=Math.min(desired,2.4);
      }
      v.speed+=Math.max(-step*16,Math.min(step*4.7,desired-v.speed));
      if(v.speed<.025) v.speed=0;
      const length=v.length+v.speed*step, planned=rootOf(v.axis,length);
      const next=near
        ? this.physics.move(v.at,planned.at[0]-v.at[0],planned.at[1]-v.at[1],planned.yaw,true,v.id)
        : {at:planned.at,hit:false};
      if(next.hit) v.speed*=.47;
      else v.length=length%v.axis.at(-1)!.length;
      v.at=next.at;
      v.yaw=planned.yaw;
      v.lit=v.speed < Math.max(1,desired-.75) || desired < v.cruise*.7;
      this.physics.placeVehicle(v.id,v.at,v.yaw,near);
    }
    if(runFar) this.farTick=0;
  }

  render(alpha:number,player:Point) {
    for(const v of this.cars){
      const visible=distance(v.at,player)<57;
      v.model.visible=visible;
      if(!visible) continue;
      const x=v.at[0]*alpha+v.previous[0]*(1-alpha), z=v.at[1]*alpha+v.previous[1]*(1-alpha);
      v.model.position.set(x,elevation(x,z),z);
      const turn=v.yaw-v.lastYaw;
      v.model.rotation.y=v.lastYaw+Math.atan2(Math.sin(turn),Math.cos(turn))*alpha;
      v.model.setBrake(v.lit);
    }
  }
}
