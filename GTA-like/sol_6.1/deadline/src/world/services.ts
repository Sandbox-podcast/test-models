import{BUILDINGS,landHeight}from'./data.ts';import{HOMES,type HomeId}from'../economy.ts';import type{Vec3}from'./geometry.ts';
export const HOME_POINTS=Object.fromEntries(Object.values(HOMES).map(home=>{const b=BUILDINGS.find(b=>b.id===home.building)!;return[home.id,{entry:{x:b.x,y:landHeight(b.x,b.z+b.d/2+2.1)??b.y,z:b.z+b.d/2+2.1},inside:{x:b.x,y:b.y,z:b.z}}];}))as Record<HomeId,{entry:Vec3;inside:Vec3}>;
export const PARKING_SPOTS:Vec3[]=[{x:32,y:6,z:45},{x:110.6,y:6,z:38},{x:113.4,y:6,z:38},{x:140,y:6,z:40},{x:315,y:2,z:177}];
