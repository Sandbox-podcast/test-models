import {premises,parkingBays,inside,p,ground,type Block,type Wall,type Point} from './level'
import {houses,type House} from './equipment'
export type Place='dealer'|'arms'|'cafe'|House
export type Room={id:Place,name:string,building:Block,entrance:Point,counter:Point,bed:Point,walls:Wall[],fittings:(Wall&{label:string,color:string})[],door?:Wall}
function room(id:Place,name:string):Room{
 const b=premises[id]
 const edge=b.z+b.d/2,entrance=p(b.x,edge+.95),counter=p(b.x+2,b.z-.35),bed=p(b.x-b.w*.25,b.z)
 const halfDoor=1.45,wing=b.w/2-halfDoor
 const wall=(x:number,z:number,w:number,d:number,h:number):Wall=>({x,z,w,d,h,base:ground(x,z)-.45})
 const walls=[wall(b.x,b.z-b.d/2,b.w,.3,3.5),wall(b.x-b.w/2,b.z,.3,b.d,3.5),wall(b.x+b.w/2,b.z,.3,b.d,3.5)]
 for(const dir of [-1,1])walls.push(wall(b.x+dir*(halfDoor+wing/2),edge,wing,.3,3.5))
 const home=id==='cour'||id==='terrasse'
 const fittings=[{...wall(b.x+2,b.z-2,3.1,1,.98),label:home?'Cuisine':id==='cafe'?'Comptoir':'Caisse',color:home?'#b8aa86':'#758d89'},
 {...wall(b.x-b.w*.28,b.z-b.d*.23,home?2.55:2.1,home?1.6:.95,.7),label:home?'Lit':id==='dealer'?'Établi':id==='arms'?'Vitrine':'Banquette',color:home?'#81a39c':'#ab855f'}]
 if(home){fittings.push({...wall(b.x+b.w*.32,b.z+1.25,2.25,.88,.78),label:'Canapé',color:id==='cour'?'#a4745d':'#708f8a'})
  fittings.push({...wall(b.x-b.w*.40,b.z+1.1,.70,.72,1.45),label:'Bibliothèque',color:'#826d56'})}
 if(id==='arms')fittings.push({...wall(b.x+b.w*.36,b.z+1.2,1.36,1.05,.92),label:'Présentoir',color:'#647b78'})
 for(const f of fittings)f.base=ground(f.x,f.z)
 const door=home?{...wall(b.x,edge,halfDoor*2,.3,2.8),id:'logement-'+id}:undefined
 return {id,name,building:b,entrance,counter,bed,walls,fittings,door}
}
export const rooms=[room('dealer','Garage du Convoi'),room('arms','Comptoir Balise'),room('cour',houses.cour.name),room('terrasse',houses.terrasse.name),room('cafe','Café de la rive')]
export const roomAt=(q:Point)=>rooms.find(r=>inside(q,r.building,-.16))
export const isHouse=(id:Place):id is House=>id==='cour'||id==='terrasse'
// Keep the central doorway and its pedestrian approach clear when the longest van is parked.
export {parkingBays}
