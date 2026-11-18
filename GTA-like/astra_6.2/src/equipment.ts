export const weapons={
 courier:{name:'Pistolet du coursier',price:0,capacity:12,pack:24,packPrice:24,reload:1.1,interval:.31,range:25,damage:38,spread:[0],color:'#ffe88a'},
 arc:{name:'Carabine à arc',price:280,capacity:18,pack:36,packPrice:42,reload:1.45,interval:.19,range:31,damage:27,spread:[0],color:'#82e7ff'},
 prisme:{name:'Projecteur à prisme',price:420,capacity:5,pack:10,packPrice:38,reload:1.7,interval:.83,range:15,damage:19,spread:[-.14,-.07,0,.07,.14],color:'#fa98c9'}
} as const
export const vehicles={
 courier:{name:'Relais 07',price:0,width:2.08,length:4.24,speed:24,accel:11,steer:1.85,color:'#cbad48'},
 veloce:{name:'Véloce GT',price:650,width:1.84,length:3.92,speed:31,accel:15,steer:2.14,color:'#b15a52'},
 gabare:{name:'Gabare utilitaire',price:490,width:2.20,length:4.90,speed:19,accel:8.8,steer:1.55,color:'#6f9d91'}
} as const
export const houses={cour:{name:'Maison des Ateliers',price:700},terrasse:{name:'Maison des Belvédères',price:1100}} as const
export type Weapon=keyof typeof weapons
export type Vehicle=keyof typeof vehicles
export type House=keyof typeof houses
export type Inventory={weapon:Weapon,vehicle:Vehicle,garage:Vehicle[],homes:House[],home:House|null,ammo:Partial<Record<Weapon,{loaded:number,reserve:number}>>}
export const starter=():Inventory=>({weapon:'courier',vehicle:'courier',garage:['courier'],homes:[],home:null,ammo:{courier:{loaded:12,reserve:36}}})
export function readInventory(raw?:Partial<Inventory>):Inventory{
 const inv=starter();if(!raw)return inv
 for(const key of Object.keys(weapons) as Weapon[]){const a=raw.ammo?.[key];if(a&&Number.isFinite(a.loaded)&&Number.isFinite(a.reserve))inv.ammo[key]={loaded:Math.max(0,Math.min(weapons[key].capacity,Math.trunc(a.loaded))),reserve:Math.max(0,Math.trunc(a.reserve))}}
 inv.garage=(Object.keys(vehicles) as Vehicle[]).filter(k=>k==='courier'||(Array.isArray(raw.garage)&&raw.garage.includes(k)))
 inv.homes=(Object.keys(houses) as House[]).filter(k=>Array.isArray(raw.homes)&&raw.homes.includes(k))
 if(raw.vehicle&&inv.garage.includes(raw.vehicle))inv.vehicle=raw.vehicle
 if(raw.weapon&&Object.hasOwn(weapons,raw.weapon)&&inv.ammo[raw.weapon])inv.weapon=raw.weapon
 if(raw.home&&inv.homes.includes(raw.home))inv.home=raw.home
 return inv
}
