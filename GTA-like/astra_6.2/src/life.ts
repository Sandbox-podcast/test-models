import {crossings} from './roadnet'
import * as T from 'three'
import type R from '@dimforge/rapier3d-compat'
import type {Streets} from './physics'
import {along,routes,distance,ground,clamp,nearestLane,type Point,type Route,type Sample,sites,blocks,fixtures} from './level'

export const periods=['Matin','Journée','Soirée']
export const busy=[32,72,71,58,87]
export const axes=routes.filter(r=>r.id.endsWith('-0-0')&&r.zone>=0).sort((a,b)=>a.zone-b.zone)
const destinations=[
 ['Atelier mécanique','Archives','Ateliers'],['École','Permanence','Commerces'],
 ['Civis','Annexe','Services'],['Marché','Buvette','Halle'],['Cafés','Maison de quartier','Commerces']]
const headways=[21,26,20,20,25]
export const clockPeriod=(seconds:number)=>Math.floor(seconds/120)%3
export function footFlow(zone:number,index:number,period:number){
 const road=axes[zone],s=busy[zone]+((index*7)%40)-19,side=index%2?1:-1
 const rim=road.width/2+1.15,shift=period===0?-4:period===1?4:0
 const a=along(road,clamp(s+shift,3,road.length-3),side*rim)
 const b=along(road,clamp(s+5+index%12+shift,3,road.length-3),side*rim)
 const c=along(road,clamp(s+8+shift,3,road.length-3),side*(rim+1.8+(index%3)*.55))
 const role=index%5,venue=destinations[zone][(period+(index%3))%3]
 const bld=blocks.find(b=>b.district===zone&&b.name===venue)!
 const door={x:bld.x+(index%3-1)*.7,z:bld.z+bld.d/2+1.1}
 const places=fixtures.filter(f=>Math.hypot(f.point.x-a.x,f.point.z-a.z)<33)
 const stop=places.length?places[index%places.length].point:null
 const streetStop=stop?{x:stop.x,z:stop.z+stop.d/2+1}:c
 const crossing=[22,road.length*.48].sort((u,v)=>Math.abs(s-u)-Math.abs(s-v))[0]
 const curb=along(road,crossing,side*rim),opposite=along(road,crossing,-side*rim)
 let points:Point[]=[a,b,c,b],label='Promenade'
 if(role===0){points=[a,b,door,b];label=venue}
 if(role===1){points=[a,streetStop,b,streetStop];label='Halte de quartier'}
 if(role===2){points=[a,curb,opposite,along(road,crossing+5,-side*rim),opposite,curb];label='Traversée'}
 if(role===3){points=[a,b,streetStop];label='Rendez-vous'}
 return {zone,label,points,door:role===0?door:undefined,wait:(role===1?5:1)+(period===2?4+index%9:period===1?2+index%5:1+index%3)}

}
// Join the through traffic along the same interchanges as the player's road loop.
function throughRoute():Route {
 const parts:Sample[]=[],get=(id:string)=>routes.find(r=>r.id===id)!
 const section=(id:string,from?:Point|'end',to?:Point|'start')=>{
  const road=get(id),nearest=(q:Point)=>road.points.reduce((a,b)=>distance(q,b)<distance(q,a)?b:a).s
  const a=from==='end'?road.length:from?nearest(from):0,b=to==='start'?0:to?nearest(to):road.length,count=Math.ceil(Math.abs(b-a)/1.4)
  for(let i=0;i<=count;i++){const q=along(road,a+(b-a)*i/Math.max(1,count)),last=parts.at(-1)
   if(last&&distance(last,q)<.55)continue;parts.push({...q,s:last?last.s+distance(last,q):0})}
 }
 section('J01');section('J05');section(axes[4].id,'end','start');section('J06');section(axes[2].id);section('J04','end','start')
 section(axes[1].id,'end',get('J03').points.at(-1));section('J03','end','start');section('quais-1-0')
 section(axes[3].id,get('quais-1-0').points.at(-1),'start');section('J02','end','start');section(axes[0].id,get('J02').points[0],get('J01').points[0])
 const length=parts.at(-1)!.s,points:Sample[]=[];let k=0
 for(let i=0,steps=Math.ceil(length/1.4);i<=steps;i++){const s=length*i/steps;while(k<parts.length-2&&parts[k+1].s<s)k++
  const a=parts[k],b=parts[k+1],t=(s-a.s)/(b.s-a.s);points.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,y:a.y+(b.y-a.y)*t,angle:Math.atan2(b.x-a.x,b.z-a.z),s})}
 return {id:'navette',length,zone:-1,road:true,width:9.5,points}
}
export type TrafficCar={id:number,mode:'traffic'|'player'|'parked',offset:number,route:Route,s:number,dir:number,q:Point,angle:number,speed:number,stop:number,body:T.Group,tailLights:T.Mesh[],collider:R.Collider,damage:number,cruise:number,home:number,heading:number,turn:number}
const colors=['#a0aa9f','#a46f58','#718999','#aa925a','#c0b8a9','#62667c']
export class Traffic{
 private junctions=crossings.map(q=>({q,owner:null as TrafficCar|null,queue:[] as TrafficCar[]}));
 cars:TrafficCar[]=[];private brakeLamp=new T.MeshBasicMaterial({color:0xff4539});private step=0;private geo=new T.BoxGeometry(1,1,1);private mats=new Map<string,T.MeshStandardMaterial>()
 constructor(private scene:T.Scene,private streets:Streets){
  for(const r of [...axes,throughRoute()]){const density=[6,4,6,6,4][r.zone]??3
   for(let i=0;i<density;i++){const dir=i%2?1:-1,s=r.zone<0?r.length*(i+.65)/density:5+((busy[r.zone]-5+(i-density/2)*headways[r.zone]+r.length-10)%(r.length-10))
    const pos=along(r,s,dir*-r.width*.235),angle=pos.angle+(dir<0?Math.PI:0),body=new T.Group();scene.add(body)
    const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:string)=>{if(!this.mats.has(color))this.mats.set(color,new T.MeshStandardMaterial({color,roughness:.64}));const o=new T.Mesh(this.geo,this.mats.get(color));o.scale.set(w,h,d);o.position.set(x,y,z);body.add(o);return o}
    const col=colors[(i+r.zone+colors.length)%colors.length];box(0,.54,0,1.86,.65,4.14,col);box(0,1.03,-.12,1.65,.51,2.04,'#354a53');box(0,1.32,-.23,1.54,.10,1.3,col)
    const tailLights:T.Mesh[]=[];for(const side of [-1,1]){box(side*.66,.63,2.07,.43,.15,.06,'#ffe5a1');tailLights.push(box(side*.65,.61,-2.08,.4,.13,.06,'#96403b'));for(const z of [-1.32,1.32])box(side*.94,.34,z,.19,.55,.63,'#26292f')}
    const collider=streets.trafficCollider(pos,angle,this.cars.length);this.cars.push({id:this.cars.length,mode:'traffic',offset:0,route:r,s,dir,q:pos,angle,speed:0,stop:i*.6,body,tailLights,collider,damage:0,cruise:4+i%3,turn:0,home:s,heading:dir})
   }
  }streets.world.step()
 }
 brakeLights(c:TrafficCar,on:boolean){const lamp=on?this.brakeLamp:this.mats.get('#96403b')!;for(const light of c.tailLights)light.material=lamp}
 hit(index:number,severity:number){const car=this.cars[index];car.stop=2+severity;car.speed=0;car.damage+=severity;car.body.children[1].rotation.z=clamp(car.damage*.029,0,.15);car.body.children[0].scale.y=Math.max(.40,.65-car.damage*.015)}
 reset(){for(const j of this.junctions){j.owner=null;j.queue=[]}this.cars.forEach((c,i)=>{if(c.mode!=='traffic')c.collider.setEnabled(true);c.mode='traffic';this.brakeLights(c,false);c.offset=0;c.s=c.home;c.dir=c.heading;c.turn=0;c.speed=0;c.stop=i%3;c.damage=0;c.body.children[1].rotation.z=0;c.body.children[0].scale.y=.65;this.place(c)});this.streets.world.step()}
 private lanePose(c:TrafficCar,s=c.s,dir=c.dir,remaining=c.turn){
  const turn=remaining>0?(1-remaining/3)*Math.PI:0,radius=c.route.width*.235
  const pos=along(c.route,s+dir*Math.sin(turn)*radius,-dir*(radius+c.offset)*Math.cos(turn))
  return {pos,angle:pos.angle+(dir<0?Math.PI:0)+turn}
 }
 private place(c:TrafficCar,pose=this.lanePose(c)){const {pos,angle}=pose;c.q=pos;c.angle=angle;c.body.position.set(pos.x,pos.y+.07,pos.z);c.body.rotation.y=c.angle;c.collider.setTranslation({x:pos.x,y:pos.y+.72,z:pos.z});c.collider.setRotation({x:0,y:Math.sin(c.angle/2),z:0,w:Math.cos(c.angle/2)})}
 inFlow(q:Point,angle:number,speed:number){
  if(speed<1||speed>11)return false
  return this.cars.some(c=>c.mode==='traffic'&&c.speed>1&&Math.abs(c.speed-speed)<5&&distance(c.q,q)<11&&
   Math.cos(c.angle-angle)>.65&&Math.abs(ground(q.x,q.z)-c.body.position.y)<2)
 }
 candidate(q:Point){
  let best:TrafficCar|undefined,range=3.6
  for(const c of this.cars){const d=distance(c.q,q);if(c.mode==='player'||d>=range||Math.abs(ground(q.x,q.z)-c.body.position.y)>1.7)continue
   if(!this.streets.clear(q,c.q,false,c.collider))continue;best=c;range=d}
  return best
 }
 control(c:TrafficCar,on:boolean,q:Point,a:number){
  c.mode=on?'player':'parked';this.brakeLights(c,false);c.turn=0;c.stop=0;c.speed=0;c.collider.setEnabled(!on);this.position(c,q,a);this.streets.world.step()
 }
 position(c:TrafficCar,q:Point,a:number){
  c.q={...q};c.angle=a;const y=ground(q.x,q.z);c.body.position.set(q.x,y+.07,q.z);c.body.rotation.y=a
  c.collider.setTranslation({x:q.x,y:y+.72,z:q.z});c.collider.setRotation({x:0,y:Math.sin(a/2),z:0,w:Math.cos(a/2)})
 }
 private ahead(c:TrafficCar,metres:number){
  let s=c.s+c.dir*metres,dir=c.dir;const length=c.route.length
  if(c.route.zone<0)s=(s+length)%length
  else if(s>length-5||s<5){s=s>length-5?2*(length-5)-s:10-s;dir=-dir}
  return along(c.route,clamp(s,0,length),-dir*(c.route.width*.235+c.offset))
 }
 private exitFree(c:TrafficCar,j:Point,obstacles:Point[]){
  // Require room for the rear bumper beyond the whole conflict area.
  for(let d=5;d<=40;d+=1.5){const q=this.ahead(c,d);if(distance(q,j)<11)continue
   if(distance(c.q,j)>9&&distance(this.ahead(c,d*.5),j)>9)continue
   const sx=Math.sin(q.angle),sz=Math.cos(q.angle)
    return !obstacles.some(o=>{const dx=o.x-q.x,dz=o.z-q.z
     return Math.abs(dx*sx+dz*sz)<5.6&&Math.abs(dx*sz-dz*sx)<2.45})}
  return false
 }
 update(dt:number,player:Point,parked:Point,alert:boolean,walkers:Point[],time:number,velocity:Point={x:0,z:0},driving=false,response:Point[]=[],playerHeading=Math.atan2(velocity.x,velocity.z)){
  this.step++;const predicted={x:player.x+velocity.x*.85,z:player.z+velocity.z*.85}
  const onRoad=(q:Point)=>{const lane=nearestLane(q,true);return lane&&lane.d<lane.r.width/2+(driving?1:.35)}
  const playerOnRoad=onRoad(player),predictedOnRoad=onRoad(predicted)
  const holds=new Set<TrafficCar>(),moving=this.cars.filter(c=>c.mode==='traffic'),fixed=[parked,...response]
  for(const j of this.junctions){
   if(j.owner&&(j.owner.mode!=='traffic'||distance(j.owner.q,j.q)>16))j.owner=null
   const approaches=moving.filter(c=>distance(c.q,j.q)<15&&distance(this.ahead(c,4),j.q)<distance(c.q,j.q))
   j.queue=j.queue.filter(c=>approaches.includes(c))
   for(const c of approaches)if(!j.queue.includes(c))j.queue.push(c)
   const inside=moving.filter(c=>distance(c.q,j.q)<8.1)
   if(j.owner&&!inside.includes(j.owner)&&!approaches.includes(j.owner))j.owner=null
   const playerFirst=playerOnRoad&&distance(player,j.q)<9||predictedOnRoad&&distance(predicted,j.q)<10
   if(!j.owner&&!playerFirst&&!inside.length){
    j.owner=j.queue.find(c=>this.exitFree(c,j.q,[...fixed,player,...walkers,...this.cars.filter(o=>o!==c).map(o=>o.q)]))??null
   }
   for(const c of approaches)if(distance(c.q,j.q)>=8.1&&c!==j.owner)holds.add(c)
   // A driver who already entered clears the junction. Other applicants wait outside.
   if(j.owner&&distance(j.owner.q,j.q)>8.2&&playerFirst)holds.add(j.owner)
  }
  for(const c of this.cars){
   const near=distance(c.q,player)<58;c.body.visible=near||c.mode==='player'
   if(c.mode!=='traffic'||(!near&&this.step%12!==0))continue
   const tick=near?dt:12*dt;c.stop=Math.max(0,c.stop-tick)
   const sx=Math.sin(c.angle),sz=Math.cos(c.angle),px=player.x-c.q.x,pz=player.z-c.q.z
   const forward=px*sx+pz*sz,lateral=Math.abs(px*sz-pz*sx)
   const approachSpeed=velocity.x*sx+velocity.z*sz
   const catchingUp=forward<1&&forward> -16&&approachSpeed>c.speed+.3
   const oncoming=forward>=0&&forward<19&&approachSpeed< -1
   const passing=near&&driving&&lateral<3.1&&(catchingUp||oncoming)
   const room=Math.max(0,c.route.width/2-c.route.width*.235-1.25)
   const oldOffset=c.offset,oldS=c.s
   const nextOffset=c.offset+clamp((passing?room:0)-c.offset,-tick*1.1,tick*1.3)
   if(Math.abs(nextOffset-c.offset)>.001&&!c.turn){const side=along(c.route,c.s,-c.dir*(c.route.width*.235+nextOffset))
    const playerClear=!driving||Math.abs(forward)>4.5||distance(side,player)>=distance(c.q,player)||distance(side,player)>4.5
    if(playerClear&&this.streets.carFits(side,c.angle,c.collider))c.offset=nextOffset}
   // A stopped vehicle or pedestrian must remain outside the full swept bumper.
   const hazards=[...fixed,...this.cars.filter(o=>o!==c&&o.mode!=='player'&&distance(c.q,o.q)<17).map(o=>o.q)]
   const clearance=(q:Point)=>{const dx=q.x-c.q.x,dz=q.z-c.q.z;return [dx*sx+dz*sz,Math.abs(dx*sz-dz*sx)]}
   const brake=5+c.speed*c.speed/16
   const blocked=hazards.some(q=>{const [a,b]=clearance(q);return a>0&&a<brake+.6&&b<2.05})
   const pedestrian=near&&walkers.some(q=>{const [a,b]=clearance(q);return a>.1&&a<brake&&b<1.5})
   const [aheadPlayer,crossPlayer]=clearance(predicted)
   const giveWay=near&&((forward>-.3&&forward<brake+(driving?2:0)&&lateral<(driving?2.15:1.6))||
    (aheadPlayer>0&&aheadPlayer<brake+2&&crossPlayer<(driving?2.2:1.6)))
   const halted=blocked||pedestrian||giveWay||holds.has(c)||c.stop>0
   if(near)this.brakeLights(c,halted||passing)
   if(c.turn>0){
    if(blocked||giveWay||pedestrian||c.stop>0)continue
    const remaining=Math.max(0,c.turn-tick),dir=remaining>0?c.dir:-c.dir,pose=this.lanePose(c,c.s,dir,remaining)
    if(near){const sx=Math.sin(pose.angle),sz=Math.cos(pose.angle),dx=player.x-pose.pos.x,dz=player.z-pose.pos.z,pad=driving?2.15:.45
     if(Math.abs(dx*sx+dz*sz)<2.12+pad&&Math.abs(dx*sz-dz*sx)<.96+pad)continue}
    c.turn=remaining;c.dir=dir;this.place(c,pose);continue
   }
   const target=halted?0:(passing?Math.min(2.5,c.cruise):alert&&near?3.8:c.cruise)*(clockPeriod(time)===2?.8:1)
   c.speed+=clamp(target-c.speed,-tick*11,tick*2.1);c.s+=c.dir*c.speed*tick
   if(c.route.zone<0)c.s=(c.s+c.route.length)%c.route.length
   else if(c.s<5||c.s>c.route.length-5){c.s=clamp(c.s,5,c.route.length-5);c.turn=3;c.speed=0;c.offset=0}
   const pose=this.lanePose(c)
   if(near&&driving&&this.streets.overlapsDriver(pose.pos,pose.angle,player,playerHeading)){c.s=oldS;c.offset=oldOffset;c.speed=0;c.turn=0;continue}
   this.place(c,pose)
  }
 }
}
