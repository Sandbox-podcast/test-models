export type AmmoId='9mm'|'12g'|'556';
export type WeaponId='pistol'|'smg'|'shotgun'|'rifle';
export type VehicleId='courier'|'compact'|'sport'|'van'|'utility';
export type HomeId='home-forges'|'home-dalle'|'home-belvederes';
export interface WeaponSpec{id:WeaponId;name:string;ammo:AmmoId;price:number;capacity:number;damage:number;pellets:number;spread:number;interval:number;reload:number;range:number;color:number;}
export const WEAPONS:Record<WeaponId,WeaponSpec>={
 pistol:{id:'pistol',name:'Pistolet M9',ammo:'9mm',price:0,capacity:12,damage:40,pellets:1,spread:.018,interval:.28,reload:1.3,range:42,color:0x9eaaa6},
 smg:{id:'smg',name:'PM Traverse',ammo:'9mm',price:260,capacity:30,damage:19,pellets:1,spread:.065,interval:.09,reload:1.8,range:30,color:0x638e92},
 shotgun:{id:'shotgun',name:'Fusil à pompe Rive',ammo:'12g',price:420,capacity:6,damage:17,pellets:7,spread:.20,interval:.85,reload:2.4,range:24,color:0xc39d72},
 rifle:{id:'rifle',name:'Carabine Plateau',ammo:'556',price:680,capacity:20,damage:56,pellets:1,spread:.009,interval:.40,reload:2.1,range:65,color:0x9ca77a}
};
export const AMMUNITION:Record<AmmoId,{name:string;pack:number;price:number;limit:number}>={
 '9mm':{name:'9 mm',pack:36,price:35,limit:360},'12g':{name:'Calibre 12',pack:12,price:45,limit:96},'556':{name:'5,56 mm',pack:40,price:65,limit:240}
};
export interface VehicleSpec{id:VehicleId;name:string;price:number;speed:number;reverse:number;acceleration:number;brake:number;steering:number;width:number;length:number;height:number;color:number;}
export const VEHICLES:Record<VehicleId,VehicleSpec>={
 courier:{id:'courier',name:'Kasai Courier',price:0,speed:28,reverse:10,acceleration:14,brake:28,steering:1.5,width:2.0,length:4.2,height:1.5,color:0xb99a6d},
 compact:{id:'compact',name:'Luma Citadine',price:650,speed:25,reverse:9,acceleration:17,brake:30,steering:1.9,width:1.75,length:3.55,height:1.5,color:0x7eaaa0},
 sport:{id:'sport',name:'Vesper GT',price:1450,speed:37,reverse:11,acceleration:21,brake:36,steering:1.6,width:1.98,length:4.25,height:1.3,color:0xa95e54},
 van:{id:'van',name:'Nil Fourgon',price:900,speed:23,reverse:7,acceleration:10,brake:24,steering:1.2,width:2.05,length:4.65,height:2.1,color:0xb7baa9},
 utility:{id:'utility',name:'Atlas Maintenance',price:1100,speed:27,reverse:9,acceleration:12,brake:29,steering:1.35,width:2.05,length:4.5,height:1.85,color:0x5f7d8b}
};
export const HOMES:Record<HomeId,{id:HomeId;building:string;name:string;price:number;description:string}>={
 'home-forges':{id:'home-forges',building:'low-houses',name:'Studio des Ateliers',price:850,description:'Un pied-à-terre près du garage. Lit, rangements et point de retour.'},
 'home-dalle':{id:'home-dalle',building:'home-a',name:'Appartement des Paliers',price:1500,description:'Un appartement sur le coteau, meublé et doté d’une entrée indépendante.'},
 'home-belvederes':{id:'home-belvederes',building:'bel-home',name:'Maison des Remparts',price:2400,description:'Une maison sur le plateau, avec lit, table et rangements au calme.'}
};
export interface Inventory{weapons:WeaponId[];equipped:WeaponId;magazines:Record<WeaponId,number>;ammo:Record<AmmoId,number>;vehicles:VehicleId[];homes:HomeId[];home:HomeId|null;}
export function freshInventory():Inventory{return{weapons:['pistol'],equipped:'pistol',magazines:{pistol:12,smg:0,shotgun:0,rifle:0},ammo:{'9mm':72,'12g':0,'556':0},vehicles:['courier'],homes:[],home:null};}
export function decodeInventory(raw:unknown):Inventory{
 const base=freshInventory();if(!raw||typeof raw!=='object')return base;const r=raw as Partial<Inventory>;
 const unique=<T extends string>(value:unknown,definitions:Record<T,unknown>,fallback:T[]):T[]=>Array.isArray(value)?[...new Set(value.filter((v):v is T=>typeof v==='string'&&v in definitions))]:fallback;
 base.weapons=unique(r.weapons,WEAPONS,['pistol']);if(!base.weapons.includes('pistol'))base.weapons.unshift('pistol');
 base.vehicles=unique(r.vehicles,VEHICLES,['courier']);if(!base.vehicles.includes('courier'))base.vehicles.unshift('courier');base.homes=unique(r.homes,HOMES,[]);
 if(r.equipped&&base.weapons.includes(r.equipped))base.equipped=r.equipped;
 for(const id of Object.keys(WEAPONS)as WeaponId[]){const n=r.magazines?.[id];base.magazines[id]=Number.isSafeInteger(n)&&n!>=0?Math.min(WEAPONS[id].capacity,n!):id==='pistol'?12:0;}
 for(const id of Object.keys(AMMUNITION)as AmmoId[]){const n=r.ammo?.[id];base.ammo[id]=Number.isSafeInteger(n)&&n!>=0?Math.min(AMMUNITION[id].limit,n!):base.ammo[id];}
 base.home=r.home&&base.homes.includes(r.home)?r.home:null;return base;
}
export type Purchase={kind:'weapon';id:WeaponId}|{kind:'ammo';id:AmmoId}|{kind:'vehicle';id:VehicleId}|{kind:'home';id:HomeId};
export interface Wallet{money:number;inventory:Inventory;}
export function offerPrice(p:Purchase){return p.kind==='weapon'?WEAPONS[p.id].price:p.kind==='ammo'?AMMUNITION[p.id].price:p.kind==='vehicle'?VEHICLES[p.id].price:HOMES[p.id].price;}
export function purchase<T extends Wallet>(state:T,offer:Purchase):{state:T;error?:string}{
 const inv=state.inventory,price=offerPrice(offer);if(!Number.isSafeInteger(state.money)||state.money<price)return{state,error:'Crédits insuffisants.'};
 if(offer.kind==='weapon'&&inv.weapons.includes(offer.id)||offer.kind==='vehicle'&&inv.vehicles.includes(offer.id)||offer.kind==='home'&&inv.homes.includes(offer.id))return{state,error:'Ce bien t’appartient déjà.'};
 if(offer.kind==='ammo'&&inv.ammo[offer.id]+AMMUNITION[offer.id].pack>AMMUNITION[offer.id].limit)return{state,error:'La réserve de ce calibre est pleine.'};
 const next=structuredClone(state);next.money-=price;const i=next.inventory;
 if(offer.kind==='weapon'){i.weapons.push(offer.id);i.equipped=offer.id;i.magazines[offer.id]=WEAPONS[offer.id].capacity;}
 else if(offer.kind==='ammo')i.ammo[offer.id]+=AMMUNITION[offer.id].pack;
 else if(offer.kind==='vehicle')i.vehicles.push(offer.id);
 else{i.homes.push(offer.id);i.home=offer.id;}
 return{state:next};
}
export function reloadWeapon(inventory:Inventory,id=inventory.equipped){const w=WEAPONS[id],n=Math.min(w.capacity-inventory.magazines[id],inventory.ammo[w.ammo]);if(n<=0)return false;inventory.magazines[id]+=n;inventory.ammo[w.ammo]-=n;return true;}
export function consumeShot(inventory:Inventory){const id=inventory.equipped;if(inventory.magazines[id]<=0)return false;inventory.magazines[id]--;return true;}
