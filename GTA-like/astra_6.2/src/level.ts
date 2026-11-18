import plans from './plans.json'

export type Point = { x:number, z:number }
export type Wall = Point & { w:number, d:number, h:number, id?:string, base?:number, kind?:'light'|'bench'|'box'|'rail'|'stall'|'tree'|'table'|'terminal'|'stop' }
export type Block = Wall & { name:string, district:number }
export const p=(x:number,z:number):Point=>({x,z})
export const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z)
export const clamp=(n:number,min=0,max=1)=>Math.max(min,Math.min(max,n))
export const inside=(q:Point,b:Wall,pad=0)=>Math.abs(q.x-b.x)<b.w/2+pad&&Math.abs(q.z-b.z)<b.d/2+pad
export const districts=['Les Forges','La Dalle','Le Nœud','Les Quais','Les Belvédères']
export const origins=[p(0,0),p(211,-45),p(256,-196),p(208,106),p(32,-209)]
export const bounds={left:-4,right:426,top:-215,bottom:218}
export const local=(i:number,x:number,z:number)=>p(origins[i].x+x,origins[i].z+z)
export function district(x:number,z:number){
 let best=Infinity,id=0
 for(const [i,o] of origins.entries()){const dx=Math.max(o.x-x,0,x-o.x-(i?160:180)),dz=Math.max(o.z-z,0,z-o.z-(i?110:120))
  const d=dx*dx+dz*dz;if(d<best){best=d;id=i}}
 return id
}
const sitesD=(x:number,z:number)=>local(1,x,z),sitesN=(x:number,z:number)=>local(2,x,z)
export const sites={
 garage:p(25.8,50.5),spawn:p(27,49),car:p(32,46),chip:p(88,57),gate:p(104,54),camera:p(92.4,39.5),
 drop:p(135,90),shortcut:p(33,75),panel:p(35.4,82),module:p(24.2,55),parking:p(112,37.8),
 contact:p(54,36),parcel:p(64,55),archives:p(70.1,47),archivist:p(68.5,37),
 mina:sitesD(80,21.8),sorel:p(60.5,62.7),ledger:sitesD(132,57.8),gallery:sitesD(38.75,1),service:sitesN(72,15.6),
 core:sitesN(124,51.5),relay:sitesN(126,80),lise:sitesD(31,47),resident:sitesD(131,24.2),portique:sitesD(35,22.8),
 nightFile:sitesD(18,47.2),shopkeeper:sitesD(8,47.2),papeterie:local(3,18,48.7),proprio:local(3,27,17),
 cour:sitesD(42,30),power:sitesN(99.8,80),vestibule:sitesN(93.2,57),exit:sitesN(38,38),stairExit:sitesN(38,41),
 garageMap:p(23.6,52),market:local(3,77,54.6),cafe:local(4,138,42.5),quay:local(3,59,79),bench:local(4,95,80)
}
export type Site=keyof typeof sites
export const siteNames:Partial<Record<Site,string>>={garage:'Garage de Mina',chip:'Dépôt logistique',drop:'Sous les voies',mina:'Permanence de Nadia',core:'Poste de commande',papeterie:'Papeterie du quai',cafe:'Café des remparts'}
export const pointsOfInterest=[['GARAGE',sites.garage],['DÉPÔT',sites.chip],['REMISE',sites.drop]] as const
export const trackZ=75,underpasses=[33,125]
export const blocks:Block[]=[]
function block(name:string,i:number,x:number,z:number,w:number,d:number,h:number){blocks.push({...local(i,x,z),w,d,h,name,district:i})}
// The garage and depot are hollow. Their wings, walls and openings are independent solids.
block('Garage de Mina',0,18.5,50,7,17,5.2);block('Atelier mécanique',0,45.5,50,7,17,5.5)
block('Dépôt 09',0,78,52,6,24,7);block('Magasins du dépôt',0,95,43.5,18,7,6)
for(const [name,x,z,w,d,h] of [
 ['Ateliers',17.5,15.6,17,9.7,4.5],['Hangar',42.9,10.5,16,10.5,5],['Annexe',62.2,47.4,12.2,12.7,5],
 ['Archives',60.7,58.3,11.5,5.5,4],['Magasin',139.4,51,16.8,15.5,6],['Entrepôt bas',35,87.5,20,6.5,5],['Maisons',63,91.5,22.4,8,6],['Remises',94.5,91,22.5,7.5,4]
 ] as const)block(name,0,x,z,w,d,h)
for(let i=1;i<plans.length;i++)for(const [j,row] of plans[i].buildings.entries()){
 let [x,z,w,d]=row.slice(0,4).map(Number);if(i===2&&row[4]==='Dépôt technique'){x-=6;z-=1.4;w-=7}if(i===2&&row[4]==='Centre de commande')w-=5.5;if(i===1&&row[4]==='Galerie haute')z-=1.6;if(i===4&&row[4]==='Commerces')z+=2.5;block(String(row[4]),i,x+w/2,z+d/2,w,d,([0,7,8,5,6][i])+(j%3)*.9)
}
export const premises={
 dealer:blocks.find(b=>b.district===0&&b.name==='Hangar')!,
 arms:blocks.find(b=>b.district===0&&b.name==='Magasin')!,
 cour:blocks.find(b=>b.district===0&&b.name==='Maisons')!,
 terrasse:blocks.find(b=>b.district===4&&b.name==='Logements')!,
 cafe:blocks.find(b=>b.district===3&&b.name==='Buvette')!
}
export const parkingBays=[p(49.3,18.6),p(36.5,19.4),p(53.3,18)]
function reservedApproach(q:Point,w:number,d:number){
 return Object.values(premises).some(b=>Math.abs(q.x-b.x)<1.85+w/2&&Math.abs(q.z-(b.z+b.d/2+1.5))<2.3+d/2)||
  parkingBays.some(b=>Math.abs(b.x-q.x)<1.45+w/2&&Math.abs(b.z-q.z)<2.8+d/2)
}
export type Sample=Point & {y:number,s:number,angle:number}
export type Route={id:string,points:Sample[],width:number,road:boolean,zone:number,length:number}
export const routes:Route[]=[]
const svgNS='http://www.w3.org/2000/svg'
function route(id:string,zone:number,path:string,width:number,road:boolean,scale:number,offset:Point,profile:(q:Point,f:number)=>number){
 const el=document.createElementNS(svgNS,'path');el.setAttribute('d',path)
 const total=el.getTotalLength()*scale,steps=Math.ceil(total/1.6),points:Sample[]=[]
 for(let k=0;k<=steps;k++){const s=total*k/steps,u=el.getPointAtLength(s/scale),q=p(offset.x+u.x*scale,offset.z+u.y*scale)
  const a=el.getPointAtLength(Math.max(0,s/scale-.4)),b=el.getPointAtLength(Math.min(total/scale,s/scale+.4))
  points.push({...q,y:profile(q,k/steps),s,angle:Math.atan2(b.x-a.x,b.y-a.y)})}
 const r={id,width,zone,road,points,length:total};routes.push(r);return r
}
function baseHeight(q:Point,i:number){const z=q.z-origins[i].z
 if(i===0)return 6*(1-clamp((z-64)/6))
 if(i===1)return z<51?4+8*clamp((51-z)/37):4*(1-clamp((z-68)/36))
 if(i===2)return 12
 if(i===3)return 2*(1-clamp((z-51)/20))
 return 4+8*clamp((110-z)/85)
}
for(const [i,plan] of plans.entries())for(const [k,r] of plan.paths.entries()){
 if(i===0&&k===1)continue // Replaced by the full garage apron and the depot driveway below.
 for(const [j,part] of r.path.split('M').filter(Boolean).entries()){
  const id=['forges','dalle','noeud','quais','belvederes'][i]+'-'+k+'-'+j
  const lane=route(id,i,'M'+part,r.width,r.road,.25,origins[i],(q,f)=>{
   if(i===0&&r.road)return q.z<=87?6:0
   if(i===1&&r.road)return 4
   if(i===4&&r.road)return 12-f*8
   return baseHeight(q,i)
  })
  if(i===0&&k===0){const start=lane.points.find(v=>v.x>160&&v.z>=87)!,end=lane.points.find(v=>v.s>start.s&&v.x<=141)!
   for(const v of lane.points){const t=clamp((v.s-start.s)/(end.s-start.s-6));v.y=6*(1-t*t*(3-2*t))}}
 }
}
const globalRoute=(id:string,path:string,road:boolean,h1:number,h2:number,width=road?11:4)=>route(id,-1,path,width,road,1,p(0,0),(_,t)=>h1+(h2-h1)*t)
globalRoute('J01','M136 30 C138 15 158 11 176 15 S197 20 211 20',true,6,4)
globalRoute('J02','M141 100 C141 116 151 131.75 169 131.75 S192 131.75 208 131.75',true,0,2)
globalRoute('J03','M275.5 106 C275.5 78 311 91 311 62 L311 23',true,2,4)
globalRoute('J04','M371 20 C411 20 413 -58 374 -61 L308 -61 Q281 -61 278.5 -86',true,4,12)
globalRoute('J05','M211 20 C209 0 202 -47 158 -54 S66 -57 48.5 -99',true,4,4)
globalRoute('J06','M192 -187 C219 -187 229 -174 256 -174',true,12,12)
globalRoute('S02','M249.75 -45 C254 -72 333 -57 338 -86',false,12,12)
globalRoute('Sentier des ateliers','M140 40 Q174 45 191 32 L211 30',false,6,4)
globalRoute('Sentier des berges','M314 64 C314 80 323 85 325 106',false,0,2)
globalRoute('Terrasses du coteau','M211 -17.5 C187 -25 148 -48 112 -66 L87.25 -99',false,8,4)
globalRoute('Grille des ateliers','M33 65 L33 82 Q22 82 22 97',false,6,0)
globalRoute('Parvis du garage','M32 30 L32 54',true,6,6,8)
globalRoute('Quai du dépôt','M111 46 L111 60 L98 60 L88 57',false,6,6)
globalRoute('Parking du dépôt','M112 30 L112 48',true,6,6,7)
export const junctions=routes.filter(r=>/^J0[1-6]$/.test(r.id)).map(r=>({id:r.id,a:{...r.points[0],width:r.width},b:{...r.points.at(-1)!,width:r.width},route:r}))
export const roads=routes.filter(r=>r.road)
export function along(r:Route,s:number,lateral=0):Sample{
 const u=clamp(s/r.length)*(r.points.length-1),i=Math.min(r.points.length-2,Math.floor(u)),t=u-i,a=r.points[i],b=r.points[i+1],angle=Math.atan2(b.x-a.x,b.z-a.z)
 return {x:a.x+(b.x-a.x)*t+Math.cos(angle)*lateral,z:a.z+(b.z-a.z)*t-Math.sin(angle)*lateral,y:a.y+(b.y-a.y)*t,angle,s}
}
type Segment={r:Route,a:Sample,b:Sample}
const cells=new Map<string,Segment[]>(),cellSize=16
for(const r of routes)for(let i=1;i<r.points.length;i++){
 const a=r.points[i-1],b=r.points[i],pad=r.width/2+5,seg={r,a,b}
 for(let x=Math.floor((Math.min(a.x,b.x)-pad)/cellSize);x<=Math.floor((Math.max(a.x,b.x)+pad)/cellSize);x++)
 for(let z=Math.floor((Math.min(a.z,b.z)-pad)/cellSize);z<=Math.floor((Math.max(a.z,b.z)+pad)/cellSize);z++){const k=x+','+z;if(!cells.has(k))cells.set(k,[]);cells.get(k)!.push(seg)}
}
export function nearestLane(q:Point,onlyRoad=false){
 let best=Infinity,chosen:Segment|undefined,f=0
 for(const v of cells.get(Math.floor(q.x/cellSize)+','+Math.floor(q.z/cellSize))||[]){if(onlyRoad&&!v.r.road)continue
  const dx=v.b.x-v.a.x,dz=v.b.z-v.a.z,t=clamp(((q.x-v.a.x)*dx+(q.z-v.a.z)*dz)/(dx*dx+dz*dz||1)),d=(q.x-v.a.x-dx*t)**2+(q.z-v.a.z-dz*t)**2
  if(d<best){best=d;chosen=v;f=t}}
 return chosen?{r:chosen.r,d:Math.sqrt(best),y:chosen.a.y+(chosen.b.y-chosen.a.y)*f,s:chosen.a.s+(chosen.b.s-chosen.a.s)*f}:null
}
for(const route of routes.filter(r=>!r.road))for(const sample of route.points){
 const road=nearestLane(sample,true);if(road&&road.d<road.r.width/2+3){const blend=clamp((road.r.width/2+3-road.d)/1.5);sample.y+=blend*(road.y-sample.y)}
}
export function ground(x:number,z:number){const q=p(x,z),i=district(x,z),base=baseHeight(q,i)
 if(i===0&&z>=63&&z<=82&&underpasses.some(cx=>Math.abs(x-cx)<5))return base
 const road=nearestLane(q,true);if(road&&road.d<=road.r.width/2+1.65)return road.y
 const lane=nearestLane(q);if(!lane)return base
 const blend=clamp((lane.r.width/2+5-lane.d)/4);return base+(lane.y-base)*blend
}
export function inCity(q:Point){if(origins.some((o,i)=>q.x>=o.x-2&&q.x<=o.x+(i?162:182)&&q.z>=o.z-2&&q.z<=o.z+(i?112:122)))return !(district(q.x,q.z)===3&&q.z>origins[3].z+87)
 const lane=nearestLane(q);return !!lane&&lane.d<lane.r.width/2+3.5
}
export const walls:Wall[]=[]
function wall(x:number,z:number,w:number,d:number,h:number,id?:string,base?:number){walls.push({x,z,w,d,h,id,base})}
wall(32,58.3,20,.55,4.6);wall(24,42,4,.4,4);wall(40,42,4,.4,4)
wall(91,63.8,26,.55,4.5);wall(104,49.35,.5,4.7,3);wall(104,54,.5,4.6,2.4,'gate');wall(104,57.1,.5,1.6,2.5)
wall(106,43,4,.5,1.4);wall(123.2,43,9.6,.5,1.4);wall(128,52,.5,18,1.4)
wall(33,75,8,.6,2.5,'shortcut',0)
wall(sites.gallery.x,sites.gallery.z,4,.5,2.2,'gallery');wall(sites.service.x,sites.service.z,4,.5,2.2,'service')
wall(sites.cour.x,sites.cour.z,3.2,.48,1.7,'cour')
wall(sites.exit.x,sites.exit.z,3.2,.48,1.9,'exit')
const bankPath=routes.find(r=>r.id==='Sentier des berges')!,bankGate=bankPath.points.reduce((a,b)=>Math.abs(b.z-88)<Math.abs(a.z-88)?b:a)
wall(bankGate.x,bankGate.z,4.1,.52,1.9,'paper')
// Front rails lead the player to the open corridor or the controlled side entrance.
function frontage(zone:number,x:number,z:number,w:number,d:number,id:string){
 const front=local(zone,x,z);wall(front.x,front.z,w,.28,1.15)
 wall(front.x+w/2,front.z-d/2,.28,d,2,id)
}
frontage(1,34,26.3,12,4.8,'entretien')
frontage(1,131,59.9,13,4.6,'maintenance')
frontage(2,124,54.6,13,5.3,'coursive')
wall(71.6,49.8,6.8,.28,1.8,'archives')
for(const [l,r] of [[0,29],[37,121],[129,158],[172,180]])wall((l+r)/2,75,r-l,10,2.59,undefined,0)
for(const x of [158.65,171.35])wall(x,76,.35,22,.95,undefined,6)
export const architecture:Wall[]=[]
for(const [cx,cz,w,d,h] of [[32,50,21,17,4.8],[91.8,52,24,24,5.9]])
 for(const sign of [-1,1]){architecture.push({x:cx+sign*(w/2-.2),z:cz-d/2,w:.35,d:.35,h,base:6},{x:cx+sign*(w/2-.8),z:cz+1.4,w:.78,d:4.3,h:2.65,base:7.04})}
for(const x of underpasses)for(const side of [-1,1])for(let z=66.5;z<82;z+=1.25)architecture.push({x:x+side*3.92,z,w:.13,d:1.25,h:1.4})
export const vehicleBarriers:Wall[]=underpasses.map(x=>({x,z:68,w:8,d:.8,h:12,base:0}))
export const streetProps:Wall[]=[]
for(const lane of roads)for(let s=10;s<lane.length-8;s+=28){const q=along(lane,s,lane.width/2+2.35),near=nearestLane(q,true)
 if(reservedApproach(q,.3,.3)||!near||near.d<near.r.width/2+1||blocks.some(b=>inside(q,b,1.1))||Object.values(sites).some(v=>distance(v,q)<4)||distance(q,p(165,75))<20)continue
 streetProps.push({...q,w:.28,d:.28,h:3.6,kind:'light'})}
export const fixtures:{point:Wall,label:string}[]=[]
function furnish(q:Point,kind:NonNullable<Wall['kind']>,w:number,d:number,h:number,label=''){
 const item={...q,kind,w,d,h},lane=nearestLane(q,true)
 if(reservedApproach(q,w,d)||!inCity(q)||blocks.some(b=>inside(q,b,Math.max(w,d)/2+.4))||lane&&lane.d<lane.r.width/2+Math.max(w,d)/2+.65||Object.values(sites).some(s=>distance(s,q)<1.25))return
 streetProps.push(item);fixtures.push({point:item,label})
}
for(const [i,kind,label] of [[0,'box','Ateliers'],[1,'bench','Permanence'],[2,'stop','Accueil Civis'],[3,'stall','Halle du quai'],[4,'table','Café des remparts']] as const){
 const main=roads.find(r=>r.zone===i)!;const busy=[32,72,71,58,87][i]
 for(let j=-2;j<=2;j++){const q=along(main,Math.max(3,busy+j*8),main.width/2+4.8);furnish(q,kind,kind==='stall'?2.7:1.4,kind==='stall'?1.6:.85,kind==='stall'?2.6:1.3,j===0?label:'')
  if(i===1||i===4)furnish(along(main,Math.max(3,busy+j*8+3),-main.width/2-3.2),'tree',.6,.6,4)}
}
for(const [key,label] of [['archives','Archives papier'],['portique','Portique B'],['ledger','Relais Civis'],['core','Commande'],['relay','Maintenance'],['contact','Courses'],['panel','Éclairage'],['power','Alimentation']] as const){const q=sites[key];furnish(p(q.x+1.55,q.z+.2),'terminal',1.0,.72,1.2,label)}
for(const [x,z,w,d,h,name] of [
 [23.2,45.5,1.55,.8,1.2,'Servante'],[40.8,55.6,1.5,.85,1.7,'Outillage'],[39.6,53.7,1.2,.85,1,'Pneus'],
 [81.9,54.4,1.5,1.6,1.5,'Papier'],[94,62.5,2,1.1,1.4,'Palettes'],[126.5,47.8,1.8,1.6,1.45,'Papier'],
 [126.5,55.8,1.6,1.6,1.1,'Palettes'],[137.8,86.7,1.4,.7,1.55,'Boîtier']
 ] as const){const obj:Wall={x,z,w,d,h,kind:'box'};streetProps.push(obj);fixtures.push({point:obj,label:name})}
export const watchRoutes=[[p(84,42),p(89,37),p(98,37)],[p(114,51),p(122,55),p(120,61)],[sitesD(127,58),sitesD(135,58),sitesD(139,61)],[sitesN(109,53),sitesN(121,53),sitesN(132,52)],[sitesD(42.8,23.8),sitesD(47.8,27.1),sitesD(45.2,31)]]
export function ribbon(route:Route,left:number,right:number,raise=0){
 const verts:number[]=[],indices:number[]=[]
 for(const v of route.points){const nx=Math.cos(v.angle),nz=-Math.sin(v.angle)
  for(const d of [left,right])verts.push(v.x+nx*d,v.y+raise,v.z+nz*d)
 }
 for(let i=0;i<route.points.length-1;i++){const j=i*2;indices.push(j,j+2,j+1,j+1,j+2,j+3)}
 return {vertices:new Float32Array(verts),indices:new Uint32Array(indices)}
}
