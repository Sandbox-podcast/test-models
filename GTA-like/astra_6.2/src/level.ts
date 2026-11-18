export type Point = { x: number, z: number }
export type Block = Point & { w: number, d: number, h: number, name: string, district: number }
export const p = (x: number, z: number): Point => ({ x, z })
export const distance = (a: Point, b: Point) => Math.hypot(a.x-b.x,a.z-b.z)
export const bounds = { left: -66, right: 164, top: -55, bottom: 58 }
export const districts = ['Les Forges', 'La Dalle', 'Le Nœud']
export const district = (x: number) => x < 34 ? 0 : x < 99 ? 1 : 2
export const sites = {
  garage:p(-43,17), spawn:p(-40,19), car:p(-32,22), chip:p(-22,-12), gate:p(-9,-12),
  camera:p(-27,-6), drop:p(2,-25), shortcut:p(-37,-25), contact:p(9,34), parcel:p(-48,38),
  mina:p(46,8), sorel:p(84,-8), ledger:p(66,-20), gallery:p(93,14), service:p(119,-15),
  core:p(138,-5), relay:p(107,36)
}
export const siteNames: Record<string,string> = {garage:'Garage de Mina',chip:'Dépôt logistique',drop:'Sous les voies',contact:'Relais des ateliers',parcel:'Archives des ateliers',mina:'Collectif de La Dalle',sorel:'Bureau de Sorel',ledger:'Registre civil',core:'Terminal central',relay:'Relais du Nœud'}
export const roadsX = [-56,-5,25,58,95,126,155]
export const roadsZ = [-42,0,25,48]
export const blocks: Block[] = []
function block(name:string,x:number,z:number,w:number,d:number,h:number) { blocks.push({name,x,z,w,d,h,district:district(x)}) }
block('Garage de Mina',-44,10,17,9,4)
block('Atelier 07',-22,11,13,12,5)
block('Transbordement',-47,-13,10,14,5)
block('Dépôt',-26,-18,21,6,6)
block('Hangar Est',10,-10,16,10,6)
block('Fonderie',10,12,16,13,8)
block('Entrepôts',-32,36,20,13,6)
block('Messagerie',-14,36,9,14,5)
block('Chaufferie',11,39,16,6,6)
block('Halle des voies',-34,-35,32,5,6)
block('Gare basse',8,-35,18,6,5)
for (const [x,z,w,d,h] of [[43,-12,13,14,7],[75,-12,13,10,8],[46,15,15,7,10],[76,13,18,13,8],[43,37,15,13,8],[77,36,22,13,10],[45,-33,15,9,7],[77,-34,23,8,9],[111,-10,15,11,9],[137,-12,12,8,9],[150,12,5,16,10],[110,12,12,13,9],[135,13,11,11,12],[112,40,20,5,9],[140,37,18,13,11],[111,-34,20,8,8],[142,-34,18,8,11]]) block('Îlot urbain',x,z,w,d,h)
export type Wall = Point & {w:number,d:number,h:number,id?:string}
export const walls:Wall[]=[
  {x:-34,z:-6,w:8,d:.6,h:1.8},{x:-16,z:-6,w:14,d:.6,h:1.8},
  {x:-38,z:-12,w:.6,d:12,h:2},{x:-9,z:-7.8,w:.6,d:4,h:1.7},{x:-9,z:-17,w:.6,d:5,h:1.7},
  {x:-9,z:-12,w:.7,d:4.7,h:1.9,id:'gate'},
  {x:-37,z:-25,w:4,d:1,h:2.1,id:'shortcut'},
  {x:93,z:14,w:1,d:5,h:2.1,id:'gallery'},
  {x:93,z:7.2,w:1,d:8.6,h:2.1},{x:93,z:19.65,w:1,d:6.3,h:2.1},
  {x:119,z:-15,w:1,d:5,h:2.1,id:'service'},
  {x:119,z:-5,w:1,d:15,h:2.1},{x:119,z:-19,w:1,d:5,h:2.1},
  {x:128,z:-20,w:18,d:.6,h:2},{x:143,z:-20,w:6,d:.6,h:2}
]
export const trackZ = -25
export const underpasses = [-37,2]
export const streetProps:Wall[]=[]
// The railway is crossed underneath at two pedestrian openings or above it on the road bridge.
for(const [x1,x2] of [[-66,-39],[-35,-.6],[4.6,19.6],[30.4,34]]) streetProps.push({x:(x1+x2)/2,z:trackZ,w:x2-x1,d:2.3,h:2.1})
export const vehicleBarriers:Wall[]=[{x:2,z:-24,w:6,d:4,h:1},{x:-37,z:-24,w:5,d:4,h:1},{x:-11,z:-13,w:5,d:6,h:1}]
export const pointsOfInterest=[['GARAGE',sites.garage],['DÉPÔT',sites.chip],['REMISE',sites.drop]] as const
export const inside=(q:Point,b:Wall,pad=0)=>Math.abs(q.x-b.x)<b.w/2+pad&&Math.abs(q.z-b.z)<b.d/2+pad
export function ground(x:number,z:number) {
  if(x>19.5&&x<30.5 && z < -12 && z > -38) return 3.15*Math.min(1,(-z-12)/8,(z+38)/8)
  return x<34?0:x<56?(x-34)*.08:x<99?1.76:x<116?1.76+(x-99)*.095:3.375
}
