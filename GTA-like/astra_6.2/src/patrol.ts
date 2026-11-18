import * as T from 'three'
import type R from '@dimforge/rapier3d-compat'
import type {Streets} from './physics'
import {roadPath,responsePositions,nearestNode,searchExits} from './roadnet'
import {along,clamp,distance,ground,p,type Point} from './level'
type Phase='idle'|'pursuit'|'search'|'depart'
class PatrolCar{
 body=new T.Group();collider:R.Collider;phase:Phase='idle';q=p(0,0);angle=0;speed=0;identified=false
 private path:Point[]=[];private destination:Point|null=null;private lastGoal:Point|null=null
 private flashTime=0;private recognition=0;private replan=0;private blocked=0;private reverse=0
 private lights:T.MeshBasicMaterial[]=[]
 constructor(scene:T.Scene,private streets:Streets,readonly index:number){
  const geo=new T.BoxGeometry(1,1,1),part=(x:number,y:number,z:number,w:number,h:number,d:number,color:string)=>{
   const m=new T.Mesh<T.BoxGeometry,T.Material>(geo,new T.MeshStandardMaterial({color,roughness:.65}));m.scale.set(w,h,d);m.position.set(x,y,z);this.body.add(m);return m}
  part(0,.55,0,1.93,.65,4.2,['#465164','#40576a','#555869'][index]);part(0,1.03,-.12,1.73,.48,2.2,'#2b404c');part(0,1.32,-.1,1.57,.11,1.36,'#d5cdc1')
  for(const sign of [-1,1]){part(sign*.975,.7,0,.05,.18,2.55,'#eac685');part(sign*.69,.62,2.09,.47,.16,.09,'#f9efa5')
   for(const z of [-1.33,1.33])part(sign*.95,.32,z,.18,.52,.62,'#242a30')
   const m=part(sign*.4,1.48,-.07,.65,.17,.34,'#ffffff');const lamp=new T.MeshBasicMaterial({color:'#4778ef'});m.material.dispose();m.material=lamp;this.lights.push(lamp)}
  scene.add(this.body);this.collider=streets.trafficCollider(this.q,0);this.reset()
 }
 reset(){
  this.phase='idle';this.identified=false;this.recognition=0;this.path=[];this.destination=null;this.lastGoal=null
  this.speed=0;this.replan=0;this.blocked=0;this.reverse=0;this.body.visible=false;this.collider.setEnabled(false)
 }
 private place(){
  const y=ground(this.q.x,this.q.z);this.body.position.set(this.q.x,y+.06,this.q.z);this.body.rotation.y=this.angle
  this.collider.setTranslation({x:this.q.x,y:y+.72,z:this.q.z});this.collider.setRotation({x:0,y:Math.sin(this.angle/2),z:0,w:Math.cos(this.angle/2)})
 }
 dispatch(report:Point,heading:number,others:Point[],player:Point){
  const bearing=heading+[0,.38,-.38][this.index]
  for(const node of responsePositions(report,bearing,45+this.index*6)){
   const at=along(node.road,node.s,-node.road.width*.23)
   if(distance(at,player)<32||others.some(q=>distance(q,at)<16))continue
   const path=roadPath(at,report);if(path.length<3)continue
   const goal=path[2],angle=Math.atan2(goal.x-at.x,goal.z-at.z)
   if(!this.streets.carFits(at,angle))continue
   this.reset();this.phase='pursuit';this.angle=angle;this.q=at;this.speed=4
   this.body.visible=true;this.collider.setEnabled(true);this.place();this.streets.world.step();return true
  }
  return false
 }
 observe(dt:number,player:Point,driving:boolean,inFlow:boolean){
  const blended=inFlow&&!this.identified&&distance(this.q,player)>7
  const needed=blended?2.4:.65
  const visible=driving&&distance(this.q,player)<(blended?13:30)&&Math.abs(ground(player.x,player.z)-ground(this.q.x,this.q.z))<4
   &&this.streets.clear(this.q,player,false,this.collider)
  // After a car masks the player, a fleeting gap between bumpers is insufficient for identification.
  this.recognition=visible?Math.min(needed,this.recognition+dt):0
  this.identified=visible&&(this.identified||this.recognition>=needed)
  return this.identified
 }
 respond(){this.phase='pursuit';this.replan=0;this.destination=null}
 depart(){
  this.phase='depart';this.destination=null;this.identified=false;this.recognition=0;this.replan=0
 }
 drive(dt:number,report:Point,player:Point,heading:number,driving:boolean,playerSpeed:number,walkers:Point[]){
  const separation=distance(this.q,player)
  if(this.phase==='depart'&&separation>48){this.reset();return}
  let goal=report
  if(this.phase==='depart'){
   if(!this.destination||distance(this.destination,this.q)<5){
    const away=responsePositions(this.q,this.angle+Math.PI)[0]
    this.destination=away?p(away.x,away.z):null
   }
   if(!this.destination)return
   goal=this.destination
  }
  this.flashTime=(this.flashTime+dt)%.31
  this.lights.forEach((m,i)=>m.color.set(this.phase==='depart'?'#585e70':i===Number(this.flashTime>=.155)?(i?'#ff704f':'#68afff'):'#404961'))
  this.replan-=dt
  if(this.replan<=0||!this.lastGoal||distance(this.lastGoal,goal)>9){
   this.path=roadPath(this.q,goal).slice(1);this.lastGoal={...goal};this.replan=.8
  }
  while(this.path.length>1&&distance(this.q,this.path[0])<4)this.path.shift()
  const target=this.path[0]||nearestNode(goal),next=this.path[1]
  const bearing=next?Math.atan2(next.x-target.x,next.z-target.z):this.angle
  const offset=[0,-1.65,1.65][this.index]
  const desired=Math.atan2(target.x+Math.cos(bearing)*offset-this.q.x,target.z-Math.sin(bearing)*offset-this.q.z)
  const err=Math.atan2(Math.sin(desired-this.angle),Math.cos(desired-this.angle))
  const nose=p(this.q.x+Math.sin(this.angle)*2.4,this.q.z+Math.cos(this.angle)*2.4)
  let cap=Math.abs(err)>.45?4.6:this.phase==='pursuit'?20:this.phase==='search'?9:8
  if(this.identified){
   const pace=Math.max(0,playerSpeed*Math.cos(heading-this.angle))
   const gap=pace>1.5?8+this.index*4:5.2+this.index
   cap=Math.min(cap,Math.max(0,pace+(separation-gap)*.9))
  }
  if((distance(target,this.q)<2.3&&this.path.length<2)||(this.phase!=='depart'&&separation<(driving?5.7:4.3))||walkers.some(q=>distance(nose,q)<3))cap=0
  this.speed+=clamp(cap-this.speed,-18*dt,7*dt)
  this.reverse=Math.max(0,this.reverse-dt)
  const backing=this.reverse>0,step=(backing?-2.1:this.speed)*dt
  const angle=this.angle+clamp(err,-2.2*dt,2.2*dt)*(backing?-1:1)
  const proposed=p(this.q.x+Math.sin(angle)*step,this.q.z+Math.cos(angle)*step)
  const playerClear=driving?!this.streets.overlapsDriver(proposed,angle,player,heading):distance(proposed,player)>2.7
  if(playerClear&&this.streets.carFits(proposed,angle,this.collider)){
   this.angle=angle;this.q=proposed;this.blocked=0
  }else if(cap>0){this.speed=0;this.blocked+=dt;if(this.blocked>1){this.reverse=.7;this.replan=0;this.blocked=0}}
  this.place()
 }
}

const thresholds=[0,6,16]
const searchSeconds=[0,12,15,18]

export class MotorResponse{
 readonly units:PatrolCar[]
 level=0;phase:Phase='idle';intercept=0;unseen=0;inTraffic=false
 private trail:Point[]=[];private exits:Point[]=[];private contact=0;private dispatchDelay=0;private siren=0
 private report:Point|null=null;private incoming:Point|null=null
 constructor(scene:T.Scene,streets:Streets){
  this.units=thresholds.map((_,index)=>new PatrolCar(scene,streets,index))
 }
 get engaged(){return this.units.filter(unit=>unit.phase==='pursuit'||unit.phase==='search')}
 get positions(){return this.units.filter(unit=>unit.phase!=='idle').map(unit=>unit.q)}
 get searchRemaining(){return Math.max(0,searchSeconds[this.level]-this.unseen)}
 notify(q:Point){this.incoming={...q}}
 reset(){
  for(const unit of this.units)unit.reset()
  this.level=0;this.phase='idle';this.intercept=0;this.contact=0;this.unseen=0
  this.report=null;this.incoming=null;this.exits=[];this.trail=[];this.inTraffic=false;this.dispatchDelay=0;this.siren=0
 }
 update(dt:number,player:Point,heading:number,driving:boolean,playerSpeed:number,alert:number,lastReport:Point|null,walkers:Point[],onSight:()=>void,onSiren:()=>void,inFlow=false){
  this.dispatchDelay=Math.max(0,this.dispatchDelay-dt);this.siren=Math.max(0,this.siren-dt)
  const fresh=this.incoming;this.incoming=null
  const tip=fresh||(alert>0?lastReport:null)
  if(!this.level&&driving&&tip&&(fresh||this.phase==='idle'&&!this.dispatchDelay)){
   this.level=1;this.contact=0;this.unseen=0;this.report={...tip};this.trail=[{...tip}];this.phase='pursuit';this.dispatchDelay=0
  }
  if(this.level&&this.report){
   const observing=this.engaged.filter(unit=>unit.observe(dt,player,driving,inFlow))
   this.inTraffic=inFlow&&!observing.length&&!fresh
   if(observing.length||fresh){
    this.report={...(observing.length?player:fresh!)};this.unseen=0;this.phase='pursuit'
    const tail=this.trail.at(-1)
    if(!tail||distance(tail,this.report)>30)this.trail=[{...this.report}]
    else if(distance(tail,this.report)>=2){this.trail.push({...this.report});if(this.trail.length>16)this.trail.shift()}
    if(observing.length){this.contact+=dt;onSight()}
   }else this.unseen+=dt
   this.intercept=observing.some(unit=>distance(unit.q,player)<7)&&Math.abs(playerSpeed)<1.5?this.intercept+dt:0
   if(this.unseen>=searchSeconds[this.level]){
    this.phase='depart';this.level=0;this.inTraffic=false;this.intercept=0;this.dispatchDelay=2
    for(const unit of this.engaged)unit.depart()
   }else{
    if(this.unseen>2.5&&this.phase!=='search'){this.phase='search';this.exits=searchExits(this.report)}
    const required=this.contact>=thresholds[2]?3:this.contact>=thresholds[1]?2:1
    this.level=Math.max(this.level,required)
    const engaged=this.engaged
    for(const unit of engaged)unit.phase=this.phase
    if(driving&&engaged.length<this.level&&this.phase==='pursuit'&&this.dispatchDelay===0&&(engaged.length===0||observing.length)){
     const returning=this.units.find(u=>u.phase==='depart'&&distance(u.q,this.report!)<58)
     if(returning)returning.respond()
     else this.units.find(u=>u.phase==='idle')?.dispatch(this.report,heading,this.positions,player)
     this.dispatchDelay=1
    }
    if(this.siren===0&&this.engaged.some(unit=>distance(unit.q,player)<48)){onSiren();this.siren=1.45}
   }
  }
  for(const unit of this.units)if(unit.phase!=='idle'){
   const branch=unit.phase==='search'&&unit.index>0?this.exits[unit.index-1]:null
   const trailing=unit.phase==='pursuit'&&unit.index>0?this.trail[Math.max(0,this.trail.length-1-unit.index*3)]:null
   unit.drive(dt,branch||trailing||this.report||unit.q,player,heading,driving,playerSpeed,walkers)
  }
  if(!this.level&&!this.positions.length)this.phase='idle'
 }
}
