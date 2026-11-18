import {routes,ribbon,type Route} from './level'

// Split an incoming surface at previously laid edges. Positions retain their grade when clipped.
type Vertex={x:number,y:number,z:number}
type Face=Vertex[]
type Surface='road'|'sidewalk'|'path'|'verge'
type Tile={face:Face,minX:number,maxX:number,minZ:number,maxZ:number,route:Route}
function area(v:Face){let sum=0;for(let i=1;i<v.length-1;i++)sum+=side(v[0],v[i],v[i+1]);return sum/2}
function side(a:Vertex,b:Vertex,p:Vertex){return (b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x)}
function cut(poly:Face,a:Vertex,b:Vertex,sign:number){
 const keep:Face=[],drop:Face=[]
 for(let i=0;i<poly.length;i++){
  const u=poly[i],v=poly[(i+1)%poly.length],s=sign*side(a,b,u),t=sign*side(a,b,v)
  if(s>=-1e-9)keep.push(u);if(s<=1e-9)drop.push(u)
  if(s*t<0&&Math.abs(s)>1e-9&&Math.abs(t)>1e-9){const k=s/(s-t),w={x:u.x+(v.x-u.x)*k,y:u.y+(v.y-u.y)*k,z:u.z+(v.z-u.z)*k};keep.push(w);drop.push(w)}
 }
 return {inner:Math.abs(area(keep))>1e-14?keep:undefined,outer:Math.abs(area(drop))>1e-14?drop:undefined}
}
function subtract(poly:Face,clip:Face){
 const sign=Math.sign(area(clip)),outside:Face[]=[];let inside:Face|undefined=poly
 for(let i=0;i<3&&inside;i++){const split=cut(inside,clip[i],clip[(i+1)%3],sign);if(split.outer)outside.push(split.outer);inside=split.inner}
 return inside?outside:[poly]
}
const tiles=new Map<string,Tile[]>()
function buckets(t:Tile){const keys:string[]=[];for(let x=Math.floor(t.minX/12);x<=Math.floor(t.maxX/12);x++)for(let z=Math.floor(t.minZ/12);z<=Math.floor(t.maxZ/12);z++)keys.push(x+','+z);return keys}
export const pavement:{kind:Surface,route:Route,vertices:Float32Array,indices:Uint32Array}[]=[]
function lay(route:Route,left:number,right:number,kind:Surface){
 const input=ribbon(route,left,right),coords:number[]=[],indices:number[]=[]
 for(let i=0;i<input.indices.length;i+=3){
  const face=Array.from(input.indices.slice(i,i+3),index=>({x:input.vertices[index*3],y:input.vertices[index*3+1],z:input.vertices[index*3+2]}))
  const xx=face.map(v=>v.x),zz=face.map(v=>v.z),tile={face,route,minX:Math.min(...xx),maxX:Math.max(...xx),minZ:Math.min(...zz),maxZ:Math.max(...zz)},keys=buckets(tile)
  let pieces=[face];const candidates=new Set(keys.flatMap(k=>tiles.get(k)||[]))
  for(const other of candidates){if(other.maxX<=tile.minX||other.minX>=tile.maxX||other.maxZ<=tile.minZ||other.minZ>=tile.maxZ)continue
   pieces=pieces.flatMap(piece=>subtract(piece,other.face));if(!pieces.length)break}
  for(const poly of pieces){const first=coords.length/3;for(const v of poly)coords.push(v.x,v.y,v.z);for(let j=1;j<poly.length-1;j++)indices.push(first,first+j,first+j+1)}
  for(const k of keys){if(!tiles.has(k))tiles.set(k,[]);tiles.get(k)!.push(tile)}
 }
 if(indices.length)pavement.push({kind,route,vertices:new Float32Array(coords),indices:new Uint32Array(indices)})
}
for(const r of routes.filter(r=>r.road))lay(r,-r.width/2,r.width/2,'road')
for(const r of routes.filter(r=>r.road)){const w=r.width/2;lay(r,-w-1.55,-w,'sidewalk');lay(r,w,w+1.55,'sidewalk')}
for(const r of routes.filter(r=>!r.road))lay(r,-r.width/2,r.width/2,'path')
for(const r of routes.filter(r=>r.zone<0)){const w=r.width/2,edge=w+(r.road?1.55:0);lay(r,-w-3.1,-edge,'verge');lay(r,edge,w+3.1,'verge')}
tiles.clear()
