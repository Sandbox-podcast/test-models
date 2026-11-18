import type { Point } from './level';

// Dimensions are relative to the standard car model and its Rapier shape.
export const vehicleClasses = {
  sedan: { name:'Berline', x:1, y:1, z:1, speed:23.2, acceleration:13, turn:1, color:'#48636d' },
  compact: { name:'Citadine', x:.89, y:.99, z:.84, speed:21.7, acceleration:15, turn:1.2, color:'#539b90' },
  van: { name:'Fourgon', x:1.06, y:1.12, z:1.12, speed:18.2, acceleration:9.8, turn:.82, color:'#a99677' },
  sport: { name:'Coupé', x:1.02, y:.84, z:1.025, speed:29.5, acceleration:17, turn:1.06, color:'#af5868' },
} as const;
export type VehicleClass = keyof typeof vehicleClasses;
type Parking = { at:Point; yaw:number };
type StreetVehicle = Parking & { id:string; kind:VehicleClass; tint?:string; name?:string };

export const streetVehicles:StreetVehicle[] = [
  {id:'parked-0',kind:'van',at:[-49,-16],yaw:.03,tint:'#756564'},
  {id:'parked-1',kind:'compact',at:[33,38],yaw:-1.55,tint:'#668a96'},
  {id:'parked-2',kind:'sedan',at:[96,39],yaw:1.57,tint:'#8d6f7a'},
  {id:'parked-3',kind:'sport',at:[218.8,10],yaw:Math.PI/2,tint:'#9f657b'},
  {id:'quais-van',kind:'van',at:[123,-83.25],yaw:Math.PI/2,tint:'#ab9372'},
  {id:'terraces-compact',kind:'compact',at:[209.5,98.3],yaw:1.44,tint:'#679b93'},
  {id:'upland-sedan',kind:'sedan',at:[215,37.5],yaw:Math.PI/2,tint:'#7092aa'},
];

export const showroom = {
  mica: { name:'Mica 4', kind:'compact', price:360, at:[-34.3,34] as Point, yaw:Math.PI/2 },
  courier: { name:'Courrier', kind:'van', price:640, at:[-34.3,37.2] as Point, yaw:Math.PI/2 },
  meridian: { name:'Méridien', kind:'sedan', price:720, at:[-13.55,37.8] as Point, yaw:Math.PI/2 },
  eclipse: { name:'Éclipse', kind:'sport', price:960, at:[-13.1,24.8] as Point, yaw:Math.PI/2 },
} as const satisfies Record<string,Parking & { name:string; kind:VehicleClass; price:number }>;
export type VehicleId = keyof typeof showroom;
export const vehicleIds = Object.keys(showroom) as VehicleId[];
