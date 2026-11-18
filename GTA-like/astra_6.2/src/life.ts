import * as T from 'three'
import type R from '@dimforge/rapier3d-compat'
import type {Streets} from './physics'
import {along,routes,distance,ground,clamp,type Point,type Route,type Sample,sites,blocks,fixtures} from './level'

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
export type TrafficCar={route:Route,s:number,dir:number,q:Point,angle:number,speed:number,stop:number,body:T.Group,collider:R.Collider,damage:number,cruise:number,home:number,heading:number,turn:number}
const colors=['#a0aa9f','#a46f58','#718999','#aa925a','#c0b8a9','#62667c']
export class Traffic{
 cars:TrafficCar[]=[];private step=0;private geo=new T.BoxGeometry(1,1,1);private mats=new Map<string,T.MeshStandardMaterial>()
 constructor(private scene:T.Scene,private streets:Streets){
  for(const r of [...axes,throughRoute()]){const density=[6,4,6,6,4][r.zone]??3
   for(let i=0;i<density;i++){const dir=i%2?1:-1,s=r.zone<0?r.length*(i+.65)/density:5+((busy[r.zone]-5+(i-density/2)*headways[r.zone]+r.length-10)%(r.length-10))
    const pos=along(r,s,dir*-r.width*.235),angle=pos.angle+(dir<0?Math.PI:0),body=new T.Group();scene.add(body)
    const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:string)=>{if(!this.mats.has(color))this.mats.set(color,new T.MeshStandardMaterial({color,roughness:.64}));const o=new T.Mesh(this.geo,this.mats.get(color));o.scale.set(w,h,d);o.position.set(x,y,z);body.add(o);return o}
    const col=colors[(i+r.zone+colors.length)%colors.length];box(0,.54,0,1.86,.65,4.14,col);box(0,1.03,-.12,1.65,.51,2.04,'#354a53');box(0,1.32,-.23,1.54,.10,1.3,col)
    for(const side of [-1,1]){box(side*.66,.63,2.07,.43,.15,.06,'#ffe5a1');box(side*.65,.61,-2.08,.4,.13,.06,'#fa7460');for(const z of [-1.32,1.32])box(side*.94,.34,z,.19,.55,.63,'#26292f')}
    const collider=streets.trafficCollider(pos,angle,this.cars.length);this.cars.push({route:r,s,dir,q:pos,angle,speed:0,stop:i*.6,body,collider,damage:0,cruise:4+i%3,turn:0,home:s,heading:dir})
   }
  }streets.world.step()
 }
 hit(index:number,severity:number){const car=this.cars[index];car.stop=2+severity;car.speed=0;car.damage+=severity;car.body.children[1].rotation.z=clamp(car.damage*.029,0,.15);car.body.children[0].scale.y=Math.max(.40,.65-car.damage*.015)}
 reset(){this.cars.forEach((c,i)=>{c.s=c.home;c.dir=c.heading;c.turn=0;c.speed=0;c.stop=i%3;c.damage=0;c.body.children[1].rotation.z=0;c.body.children[0].scale.y=.65;this.place(c)});this.streets.world.step()}
 private place(c:TrafficCar){const turn=c.turn>0?(1-c.turn/3)*Math.PI:0,radius=c.route.width*.235
  const pos=along(c.route,c.s+c.dir*Math.sin(turn)*radius,-c.dir*radius*Math.cos(turn));c.q=pos;c.angle=pos.angle+(c.dir<0?Math.PI:0)+turn;c.body.position.set(pos.x,pos.y+.07,pos.z);c.body.rotation.y=c.angle;c.collider.setTranslation({x:pos.x,y:pos.y+.72,z:pos.z});c.collider.setRotation({x:0,y:Math.sin(c.angle/2),z:0,w:Math.cos(c.angle/2)})}
 update(dt:number,player:Point,parked:Point,alert:boolean,walkers:Point[],time:number){
  this.step++
  for(const c of this.cars){const near=distance(c.q,player)<55;c.body.visible=near
   if(!near&&this.step%15!==0)continue
   const tick=near?dt:15*dt;c.stop=Math.max(0,c.stop-tick)
   if(c.turn>0){c.turn=Math.max(0,c.turn-tick);if(c.turn===0)c.dir*=-1;this.place(c);continue}
   const ahead=along(c.route,clamp(c.s+c.dir*4.3,0,c.route.length),-c.dir*c.route.width*.235)
   const obstructed=near&&(distance(ahead,player)<2.7||distance(ahead,parked)<3||walkers.some(q=>distance(q,ahead)<1.65)||this.cars.some(other=>other!==c&&distance(ahead,other.q)<3.4))
   const target=obstructed||c.stop>0?0:(alert&&near?2.3:c.cruise)*(clockPeriod(time)===2?.8:1)
   c.speed+=clamp(target-c.speed,-tick*11,tick*2.1);c.s+=c.dir*c.speed*tick
   if(c.route.zone<0)c.s=(c.s+c.route.length)%c.route.length
   else if(c.s<5||c.s>c.route.length-5){c.s=clamp(c.s,5,c.route.length-5);c.turn=3;c.speed=0}
   this.place(c)
  }
 }
}
