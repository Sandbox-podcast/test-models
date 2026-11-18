import * as T from 'three';
import { DrivingNetwork, heading, turnAngle, type RoadNode } from './driving-network';
import { clamp, distance, elevation, type Point } from './level';
import { Physics } from './physics';
import { makeCar, type CarModel } from './visuals';
import { type VehicleClass } from './fleet';
import { onStreet } from './roads';

export type WantedLevel=0|1|2|3;
type Suspect={at:Point;driven:boolean;yaw:number;speed:number;kind?:VehicleClass};
type Unit={ id:string; at:Point; previous:Point; yaw:number; lastYaw:number; speed:number; active:boolean;
  path:Point[]; refresh:number; stuck:number; yields:number; model:CarModel; bar:T.Mesh<T.BoxGeometry,T.MeshBasicMaterial>[] };
const searchTime=[0,8,11,15];
const reinforcement=[0,1,2,4];
const sight=[0,23,28,34];

export class Pursuit {
  readonly road:DrivingNetwork;
  readonly units:Unit[]=[];
  level:WantedLevel=0;
  phase:'clear'|'pursuit'|'search'='clear';
  blind=0;
  visible=false;
  lastKnown:Point|null=null;
  arrest=0;
  private danger=0;
  private dispatch=0;
  private fresh=0;
  private now=0;
  private readonly wash=new T.PointLight('#89caff',0,12,2);
  constructor(scene:T.Scene,private readonly physics:Physics){
    this.road=new DrivingNetwork(physics);
    scene.add(this.wash);
    for(let i=0;i<4;i++){
      const id='police-'+i,model=makeCar(i===3?'#b4c9df':'#365676');
      const bar=[-.34,.34].map((x,j)=>{
        const part=new T.Mesh(new T.BoxGeometry(.62,.147,.24),new T.MeshBasicMaterial({color:j?'#8ad9ff':'#ff8b86'}));
        part.position.set(x,1.49,-.21);model.add(part);return part;
      });
      const strip=new T.Mesh(new T.BoxGeometry(1.51,.028,.67),new T.MeshBasicMaterial({color:'#d4e4ed'}));
      strip.position.set(0,.968,1.29);model.add(strip);
      model.visible=false;scene.add(model);
      this.physics.addVehicle(id,[0,0],0);
      this.physics.placeVehicle(id,[0,0],0,false);
      this.units.push({id,at:[0,0],previous:[0,0],yaw:0,lastYaw:0,speed:0,active:false,path:[],refresh:0,stuck:0,yields:0,model,bar});
    }
  }

  reset(){
    this.level=0;this.phase='clear';this.lastKnown=null;this.visible=false;this.blind=0;this.arrest=0;
    this.danger=0;this.dispatch=0;this.fresh=0;this.wash.intensity=0;
    for(const unit of this.units) this.retire(unit);
  }

  get remaining(){return this.phase==='search' ? Math.max(0,searchTime[this.level]-this.blind) : 0;}
  get audible(){return this.level ? this.units.filter(u=>u.active).map(u=>u.at) : [];}
  get(id:string){return this.units.find(u=>u.id===id&&u.active);}

  report(at:Point,severity=1){
    this.level=Math.min(3,this.level+severity) as WantedLevel;
    this.danger=Math.max(this.danger,this.level);
    this.phase='pursuit';this.lastKnown=at;this.fresh=3.35;this.blind=0;
    this.dispatch=Math.min(this.dispatch,.42);
  }

  impact(id:string,strength:number){
    const unit=this.get(id);
    if(!unit) return;
    unit.speed*=.28;
    unit.yields=Math.max(unit.yields,Math.min(1.75,.28+strength*.075));
  }

  private retire(unit:Unit){
    unit.active=false;unit.model.visible=false;unit.path=[];
    this.physics.placeVehicle(unit.id,unit.at,unit.yaw,false);
  }

  private deploy(unit:Unit,suspect:Suspect,index:number){
    const target=this.lastKnown!;
    const goal=this.road.nearby(target)[0];
    if(!goal) return false;
    const dir:Point=[Math.sin(suspect.yaw),Math.cos(suspect.yaw)];
    const candidates=this.road.nodes.filter(node=>node.edge.length&&distance(node.at,target)>19&&distance(node.at,target)<58)
      .map(node=>{
        const d=distance(node.at,target), front=(node.at[0]-target[0])*dir[0]+(node.at[1]-target[1])*dir[1];
        const from=distance(node.at,suspect.at);
        return {node,score:Math.abs(d-32)+(index===3?-front*.26:front*.16)+Math.max(0,24-from)*2.5};
      }).sort((a,b)=>a.score-b.score).slice(0,32);
    for(const {node} of candidates){
      if(distance(node.at,suspect.at)<15||this.units.some(u=>u.active&&distance(u.at,node.at)<6)) continue;
      const path=this.road.route(node,goal);
      if(path.length<3||path.length>28) continue;
      const yaw=heading(node.at,path[1]);
      if(!this.physics.canTurn(node.at,yaw,'sedan',unit.id)) continue;
      Object.assign(unit,{at:node.at,previous:node.at,yaw,lastYaw:yaw,speed:6,active:true,path:path.slice(1),refresh:.8,stuck:0,yields:0});
      unit.model.resetDamage();
      this.physics.placeVehicle(unit.id,unit.at,unit.yaw,true);
      return true;
    }
    return false;
  }

  private follow(unit:Unit,dt:number,target:Point,suspect:Suspect,index:number){
    unit.previous=unit.at;unit.lastYaw=unit.yaw;
    unit.refresh-=dt;
    unit.yields=Math.max(0,unit.yields-dt);
    const end=unit.path.at(-1);
    if(unit.refresh<=0&&(!end||distance(end,target)>5.6||unit.stuck>.55)) {
      unit.refresh=.69+index*.12;
      this.replan(unit,target,index);
    }
    while(unit.path.length&&distance(unit.at,unit.path[0])<Math.min(2.02,.94+Math.abs(unit.speed)*.066)) unit.path.shift();
    let next=unit.path[0];
    const ahead=unit.path[1], range=distance(unit.at,suspect.at);
    const bend=next&&ahead?Math.abs(turnAngle(heading(unit.at,next),heading(next,ahead))):0;
    if(next&&ahead&&bend<.63&&unit.stuck<.45){
      const aim=heading(next,ahead), offset=.89;
      const lane:Point=[next[0]+Math.cos(aim)*offset,next[1]-Math.sin(aim)*offset];
      if(onStreet(...lane)&&this.physics.canTurn(lane,aim,'sedan',unit.id)) next=lane;
    }
    const d=next?distance(unit.at,next):0;
    const targetAngle=next?turnAngle(unit.yaw,heading(unit.at,next)):0;
    const reversing=unit.stuck>.76&&unit.stuck<1.65;
    const desired=reversing?-4:!next||unit.yields>0?0:Math.min(this.phase==='search'?11:18+this.level*2.7,
      unit.path.length===1?d*3.2:28,Math.abs(targetAngle)>.53?4.2+3.8*Math.cos(targetAngle):28,
      bend>.5?Math.max(6,19-bend*7)+d:29,
      range<7&&this.visible?Math.max(0,(range-3)*2.8):28);
    unit.speed+=clamp(desired-unit.speed,-dt*24,dt*10.5);
    const playerKind=suspect.driven?suspect.kind??'sedan':undefined;
    if(next) {
      const nextYaw=unit.yaw+clamp(targetAngle,-2.6*dt,2.6*dt);
      if(this.physics.canTurn(unit.at,nextYaw,'sedan',unit.id)&&this.physics.policeClearance(unit.at,nextYaw,suspect.at,suspect.yaw,playerKind)) unit.yaw=nextYaw;
    }
    const dx=Math.sin(unit.yaw)*unit.speed*dt,dz=Math.cos(unit.yaw)*unit.speed*dt;
    const nextAt:Point=[unit.at[0]+dx,unit.at[1]+dz];
    const againstPlayer=!this.physics.policeClearance(nextAt,unit.yaw,suspect.at,suspect.yaw,playerKind);
    const result=againstPlayer?{at:unit.at,hit:true}:this.physics.move(unit.at,dx,dz,unit.yaw,true,unit.id);
    unit.at=result.at;
    const blocked=next&& !againstPlayer && (result.hit||Math.abs(targetAngle)>.6&&unit.yaw===unit.lastYaw);
    if(blocked) unit.stuck+=dt;
    else if(unit.stuck>=1.65||!reversing) unit.stuck=Math.max(0,unit.stuck-dt*1.65);
    if(unit.stuck>2.6&&!againstPlayer&&range>27){this.retire(unit);return;}
    if(result.hit) unit.speed*=.72;
    this.physics.placeVehicle(unit.id,unit.at,unit.yaw,true);
  }

  private replan(unit:Unit,target:Point,index:number){
    const goals=this.road.nearby(target,18);
    const arrival=(node:RoadNode)=>{
      const d=distance(unit.at,node.at);
      return d+(d<1.2?0:Math.abs(turnAngle(unit.yaw,heading(unit.at,node.at)))*1.7);
    };
    const starts=this.road.nearby(unit.at,8).filter(node=>this.physics.ray(unit.at,node.at,.7,.7,unit.id)>.94)
      .sort((a,b)=>arrival(a)-arrival(b)).slice(0,4);
    const goal=goals[this.phase==='search'?Math.min(goals.length-1,index*2):0];
    if(!goal) return;
    let path:Point[]=[];
    for(const node of starts){
      const candidate=this.road.route(node,goal);
      if(candidate.length){path=candidate;break;}
    }
    if(path.length) unit.path=path;
  }

  update(dt:number,suspect:Suspect){
    this.now+=dt;
    if(!this.level) return;
    this.fresh=Math.max(0,this.fresh-dt);
    this.visible=this.units.some(unit=>unit.active&&distance(unit.at,suspect.at)<sight[this.level]
      &&Math.abs(elevation(...unit.at)-elevation(...suspect.at))<2.65
      &&this.physics.ray(unit.at,suspect.at,1.48,suspect.driven?1.23:1.45,unit.id)>.975);
    if(this.visible){
      this.lastKnown=suspect.at;this.blind=0;this.phase='pursuit';
      if(suspect.driven){this.danger=Math.min(3,this.danger+dt*.061);this.level=(this.danger>=2.7?3:this.danger>=1.79?2:1);}
    } else if(this.fresh<=0){
      this.phase='search';this.blind+=dt;
      if(this.blind>=searchTime[this.level]) {
        if(this.level===1){this.reset();return;}
        this.level=(this.level-1) as WantedLevel;this.danger=this.level;this.blind=0;
        const overflow=this.units.filter(unit=>unit.active).slice(reinforcement[this.level]);
        for(const unit of overflow) this.retire(unit);
      }
    }
    this.dispatch-=dt;
    if(this.phase==='pursuit'&&this.dispatch<=0&&this.lastKnown){
      const index=this.units.findIndex(unit=>!unit.active);
      if(index>=0&&this.units.filter(unit=>unit.active).length<reinforcement[this.level]) {
        this.dispatch=this.deploy(this.units[index],suspect,index)?1.35:.83;
      }
    }
    for(const [index,unit] of this.units.entries()) if(unit.active) this.follow(unit,dt,this.lastKnown!,suspect,index);
    const near=this.visible&&this.units.some(unit=>unit.active&&distance(unit.at,suspect.at)<(suspect.driven?4.65:3.5));
    this.arrest=near&&Math.abs(suspect.speed)<2.1?Math.min(1,this.arrest+dt/4.2):Math.max(0,this.arrest-dt*.56);
  }

  render(alpha:number,at:Point){
    let closest:Unit|undefined, gap=30;
    for(const [i,unit] of this.units.entries()){
      const d=distance(unit.at,at);
      unit.model.visible=unit.active&&d<64;
      if(!unit.model.visible) continue;
      const x=unit.previous[0]+(unit.at[0]-unit.previous[0])*alpha,z=unit.previous[1]+(unit.at[1]-unit.previous[1])*alpha;
      unit.model.position.set(x,elevation(x,z),z);
      unit.model.rotation.y=unit.lastYaw+turnAngle(unit.lastYaw,unit.yaw)*alpha;
      unit.model.setBrake(unit.speed<2);
      const blink=Math.floor(this.now*8+i)%4;
      unit.bar[0].material.color.set(blink<2?'#ff757c':'#662a40');
      unit.bar[1].material.color.set(blink>=2?'#9ddaff':'#263b6d');
      if(d<gap){closest=unit;gap=d;}
    }
    this.wash.intensity=closest?(this.phase==='search'?15:34):0;
    if(closest){this.wash.color.set(Math.floor(this.now*4)%2?'#e56985':'#79c3ff');this.wash.position.copy(closest.model.position);this.wash.position.y+=1.19;}
  }
}
