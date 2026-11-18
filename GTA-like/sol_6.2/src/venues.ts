import type { Point, Rect, Wall } from './level';

type Furnishing = { area:Rect; height:number; tint:string; kind:'counter'|'table'|'shelf'|'sofa'|'bed'|'stall' };
type Venue = {
  id:string; building:string; name:string; kind:'arsenal'|'showroom'|'public'|'home'; district:number;
  area:Rect; height:number; accent:string; entrance:Point; use:Point; side:1|-1;
  description:string; price?:number; hours?:'market'; furniture:Furnishing[];
};

export const venues = [
  { id:'armory', building:'printing', name:'Comptoir Impulsion', kind:'arsenal', district:0,
    area:[-8.5,30.5,6,8], height:4.6, accent:'#f6ba7f', entrance:[-8.5,34.5], use:[-8.5,30.9], side:1,
    description:'Armes et réserves d’énergie. Chaque arme utilise ses propres munitions.',
    furniture:[{area:[-8.5,29,3.9,.86],height:1,tint:'#4e676f',kind:'counter'}, {area:[-8.5,27.25,4.28,.48],height:2.05,tint:'#566476',kind:'shelf'}] },
  { id:'dealership', building:'repair', name:'Véhicules Mina', kind:'showroom', district:0,
    area:[-22,34,12,7], height:3.8, accent:'#8de1ee', entrance:[-21.8,37.5], use:[-22.1,34.1], side:1,
    description:'Sélectionnez un véhicule. Il sera garé sur le parvis, à l’emplacement indiqué.',
    furniture:[{area:[-22.1,32.55,4.4,.95],height:1.05,tint:'#416775',kind:'counter'}, {area:[-26,34.2,1.45,1.65],height:.69,tint:'#ac934e',kind:'table'}, {area:[-17.1,33,.75,2.3],height:1.55,tint:'#466477',kind:'shelf'}] },
  { id:'market', building:'quais-hall', name:'Halle des Quais', kind:'public', district:3,
    area:[108,-87,20,10], height:6.9, accent:'#ffd087', entrance:[108,-82], use:[108,-87.3], side:1, hours:'market',
    description:'Le comptoir du marché sert une collation à 18 ₡. La halle ferme le soir.',
    furniture:[{area:[108,-89.1,5.2,1.45],height:1.25,tint:'#a28359',kind:'stall'}, {area:[101.3,-85.7,3.35,1.5],height:1.2,tint:'#597e6f',kind:'stall'}, {area:[114.8,-85.7,3.45,1.5],height:1.25,tint:'#915e58',kind:'stall'}, {area:[102.2,-90,3.3,1.4],height:.86,tint:'#665f4f',kind:'table'}] },
  { id:'terrace-cafe', building:'belv-cafe', name:'Café des Remparts', kind:'public', district:4,
    area:[184,72,12,7.4], height:5.4, accent:'#ffb69a', entrance:[184,75.7], use:[183.8,72.55], side:1,
    description:'Le café sert un repas à 18 ₡. Les tables donnent sur les remparts.',
    furniture:[{area:[184,70.95,4.4,.85],height:1.08,tint:'#a47159',kind:'counter'}, {area:[180.7,73.5,1.5,1.2],height:.82,tint:'#896954',kind:'table'}, {area:[187.5,73.5,1.5,1.2],height:.82,tint:'#896954',kind:'table'}] },
  { id:'traverse', building:'arcade', name:'Maison de la Traverse', kind:'home', district:0,
    area:[30,29,16,10], height:8, accent:'#aebdfa', entrance:[29.2,34], use:[29.2,29.5], side:1,
    description:'Un pied-à-terre aux Forges. Reposez-vous pour restaurer votre intégrité et reprendre ici en ville libre.',price:560,
    furniture:[{area:[25.2,26.1,2.1,2.9],height:.71,tint:'#7182b0',kind:'bed'}, {area:[33.9,27.1,3.35,1.05],height:.87,tint:'#ae7f70',kind:'sofa'}, {area:[34.5,29.9,1.7,1.05],height:.63,tint:'#7b6b52',kind:'table'}] },
  { id:'terraces', building:'belv-housing', name:'Maison des Terrasses', kind:'home', district:4,
    area:[197,101,16,8], height:7.6, accent:'#efad90', entrance:[200,97], use:[200.2,101.1], side:-1,
    description:'Une maison sur le plateau des Belvédères. Le repos restaure votre intégrité et fixe votre point de reprise en ville libre.',price:1150,
    furniture:[{area:[193,101.2,2.1,2.9],height:.71,tint:'#b47e78',kind:'bed'}, {area:[201.8,103.15,3.35,1.05],height:.87,tint:'#668a7d',kind:'sofa'}, {area:[195.7,98.6,2.2,1.1],height:.68,tint:'#8a745e',kind:'table'}] },
] as const satisfies readonly Venue[];

export type VenueId = (typeof venues)[number]['id'];
export type HomeId = Extract<(typeof venues)[number],{kind:'home'}>['id'];
export const homes = venues.filter(venue=>venue.kind==='home');
export const venueRooms = venues.map(venue=>({id:venue.id,area:venue.area,height:venue.height,accent:venue.accent}));
export const venueGates = venues.filter(venue=>venue.kind==='home'||venue.id==='market').map(venue=>({
  id:`venue-${venue.id}`,area:[...venue.entrance,2.6,.48] as Rect,accent:venue.accent,label:venue.name,
}));
export const venueWalls:Wall[] = venues.flatMap(venue=>{
  const {area:[x,z,w,d],entrance:[doorX,front],side,height}=venue;
  const left=x-w/2, right=x+w/2, gap=1.30;
  const wall=(area:Rect):Wall=>({area,height:Math.min(height-.3,4.05),color:'#526470'});
  return [wall([left,z,.48,d]),wall([right,z,.48,d]),wall([x,z-side*d/2,w,.48]),
    wall([(left+doorX-gap)/2,front,doorX-gap-left,.48]),wall([(doorX+gap+right)/2,front,right-doorX-gap,.48])];
});
