export const weapons = {
  spark: { name:'Étincelle', magazine:12, reserve:36, box:24, price:0, ammoPrice:35, cycle:.24, reload:1.1, range:35, power:36, rays:1, spread:0, color:'#ffd59b', description:'Pistolet de départ. Précis à moyenne distance.' },
  pulse: { name:'Impulsion', magazine:24, reserve:72, box:48, price:260, ammoPrice:64, cycle:.105, reload:1.55, range:28, power:19, rays:1, spread:.035, color:'#a9eeff', description:'Cadence élevée. Les rafales s’élargissent quand vous bougez.' },
  surge: { name:'Ressac', magazine:6, reserve:18, box:12, price:390, ammoPrice:76, cycle:.67, reload:1.75, range:17, power:18, rays:5, spread:.19, color:'#ffb791', description:'Gerbe d’énergie à courte portée.' },
  prism: { name:'Prisme', magazine:5, reserve:15, box:10, price:560, ammoPrice:92, cycle:.78, reload:1.9, range:53, power:84, rays:1, spread:0, color:'#dfb3ff', description:'Tir puissant à longue portée, avec une cadence lente.' },
} as const;

export type WeaponId = keyof typeof weapons;
export type Ammo = { loaded:number; spare:number };
export type Arsenal = { equipped:WeaponId; ammo:Partial<Record<WeaponId,Ammo>> };
export const weaponIds = Object.keys(weapons) as WeaponId[];
export const starterArsenal = ():Arsenal => ({equipped:'spark',ammo:{spark:{loaded:12,spare:36}}});
export const startingAmmo = (id:WeaponId):Ammo => ({loaded:weapons[id].magazine,spare:weapons[id].reserve});
