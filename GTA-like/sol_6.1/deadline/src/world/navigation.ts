import { BOUNDS, landHeight, supportAt, surfacesNear, SOLIDS, GATES,RAIL_DECKS,RAIL_FENCES,CURBS } from './data.ts';
import { clamp, rectangleContains, distance, segmentHit, type Vec3, type Rect } from './geometry.ts';
import{FURNITURE}from'./furniture.ts';
class Heap {
 values:{id:number;score:number}[]=[];
 push(id:number,score:number){const q=this.values;let i=q.length;q.push({id,score});while(i){const p=(i-1)>>1;if(q[p].score<=score)break;q[i]=q[p];i=p;}q[i]={id,score};}
 pop(){const q=this.values,first=q[0],last=q.pop();if(q.length&&last){let i=0;while(i*2+1<q.length){let c=i*2+1;if(c+1<q.length&&q[c+1].score<q[c].score)c++;if(q[c].score>=last.score)break;q[i]=q[c];i=c;}q[i]=last;}return first?.id;}
 get size(){return this.values.length;}
}
export class SurfaceNavigation {
 readonly step=2;readonly width=Math.ceil((BOUNDS.maxX-BOUNDS.minX)/2)+1;readonly depth=Math.ceil((BOUNDS.maxZ-BOUNDS.minZ)/2)+1;
 readonly heights=new Float32Array(this.width*this.depth);readonly blocked=new Uint8Array(this.heights.length);open=new Set<string>();revision=0;
 readonly costs=new Float32Array(this.heights.length);
 private cache=new Map<string,Vec3[]>();private blockers=new Map<string,Rect[]>();private edges=new Map<number,boolean>();
 readonly mode:'foot'|'car';
 constructor(mode:'foot'|'car'){this.mode=mode;this.rebuild(new Set());}
 point(i:number):Vec3{return{x:BOUNDS.minX+(i%this.width)*this.step,y:this.heights[i],z:BOUNDS.minZ+Math.floor(i/this.width)*this.step};}
 index(p:{x:number;z:number}){return clamp(Math.round((p.z-BOUNDS.minZ)/this.step),0,this.depth-1)*this.width+clamp(Math.round((p.x-BOUNDS.minX)/this.step),0,this.width-1);}
 rebuild(open:Set<string>){
  this.open=new Set(open);this.revision++;this.cache.clear();this.heights.fill(NaN);this.blocked.fill(1);this.costs.fill(1);
  const solids=[...SOLIDS,...RAIL_DECKS,...RAIL_FENCES,...FURNITURE,...CURBS.filter(r=>this.mode==='car'||r.h>.24),...Object.values(GATES).filter(g=>!open.has(g.id))];this.blockers.clear();this.edges.clear();
  for(const r of solids){const radius=Math.hypot(r.w,r.d)/2+3.5;for(let x=Math.floor((r.x-radius)/8);x<=Math.floor((r.x+radius)/8);x++)for(let z=Math.floor((r.z-radius)/8);z<=Math.floor((r.z+radius)/8);z++){const key=x+','+z;if(!this.blockers.has(key))this.blockers.set(key,[]);this.blockers.get(key)!.push(r);}}
  for(let i=0;i<this.heights.length;i++){
   const x=BOUNDS.minX+(i%this.width)*this.step,z=BOUNDS.minZ+Math.floor(i/this.width)*this.step;
   const near=surfacesNear({x,z});let y=this.mode==='foot'?landHeight(x,z):null;
   const candidates=near.filter(q=>q.onStrip&&q.path.mode!=='rail'&&(this.mode==='foot'||q.path.mode==='road')&&(!q.path.gate||open.has(q.path.gate))&&q.distance<q.path.width/2+(this.mode==='foot'?q.path.sidewalk-.4:-1.05));
   if(y===null&&candidates.length)y=candidates.sort((a,b)=>a.distance-b.distance)[0].y;
   if(y===null)continue;
   if((this.blockers.get(Math.floor(x/8)+','+Math.floor(z/8))||[]).some(r=>y!+1.7>r.y&&y!<r.y+r.h&&rectangleContains({x,z},r,this.mode==='foot'?.4:1.03)))continue;
   this.heights[i]=y;this.blocked[i]=0;
   if(this.mode==='foot')for(const q of near)if(q.path.mode==='road'&&Math.abs(q.y-y)<.8&&q.distance<q.path.width/2+.25){const crossing=Math.abs((((q.s-18)%26)+26)%26)<2||Math.abs((((q.s-18)%26)+26)%26-26)<2;this.costs[i]=crossing?1:7.5;}
  }
 }
 nearest(p:Vec3,maxDistance=12){const center=this.index(p);let best=-1,score=Infinity;const radius=Math.ceil(maxDistance/this.step);for(let j=-radius;j<=radius;j++)for(let k=-radius;k<=radius;k++){const i=center+j*this.width+k;if(i<0||i>=this.heights.length||Math.abs(i%this.width-center%this.width)>radius||this.blocked[i])continue;const q=this.point(i),d=distance(p,q)+Math.abs(p.y-q.y)*4;if(d<score){score=d;best=i;}}return best;}
 route(from:Vec3,to:Vec3):Vec3[]{
  const start=this.nearest(from),end=this.nearest(to);if(start<0||end<0)return[];const key=start+'/'+end+'/'+this.revision;if(this.cache.has(key))return this.cache.get(key)!.map(p=>({...p}));
  const g=new Float32Array(this.heights.length);g.fill(Infinity);g[start]=0;const parents=new Int32Array(this.heights.length);parents.fill(-1);const visited=new Uint8Array(this.heights.length),heap=new Heap();heap.push(start,0);
  const target=this.point(end);let found=false;
  while(heap.size){const v=heap.pop()!;if(visited[v])continue;visited[v]=1;if(v===end){found=true;break;}
   const col=v%this.width,row=Math.floor(v/this.width);
   for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]){
    const c=col+dx,r=row+dz,n=r*this.width+c;if(c<0||c>=this.width||r<0||r>=this.depth||this.blocked[n]||visited[n])continue;
    if(dx&&dz&&(this.blocked[row*this.width+c]||this.blocked[r*this.width+col]))continue;
    const length=this.step*Math.hypot(dx,dz),rise=Math.abs(this.heights[n]-this.heights[v]);if(rise>length*(this.mode==='foot'?1.45:.42)+.14)continue;
    const edge=Math.min(v,n)*this.heights.length+Math.max(v,n);let blocked=this.edges.get(edge);if(blocked===undefined){const a=this.point(v),b=this.point(n);blocked=(this.blockers.get(Math.floor(a.x/8)+','+Math.floor(a.z/8))||[]).some(r=>segmentHit({...a,y:a.y+.9},{...b,y:b.y+.9},r,this.mode==='foot'?.38:1.03)!==null);
     if(!blocked&&this.mode==='foot'){let height=a.y;const samples=Math.ceil(length/.25);for(let k=1;k<=samples;k++){const t=k/samples,y=supportAt({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t},height,'foot',length/samples,this.open);if(y===null){blocked=true;break;}height=y;}if(Math.abs(height-b.y)>.5)blocked=true;}
     this.edges.set(edge,blocked);}if(blocked)continue;
    const cost=g[v]+length*this.costs[n]+rise*(this.mode==='foot'?.25:1.5);if(cost>=g[n])continue;g[n]=cost;parents[n]=v;const p=this.point(n);heap.push(n,cost+distance(p,target));
   }
  }
  if(!found)return[];const path:Vec3[]=[];for(let n=end;n!==-1;n=parents[n]){path.push(this.point(n));if(n===start)break;}path.reverse();
  // Keep every bend and elevation transition. Removing corners would cut through walls or across levels.
  this.cache.set(key,path);if(this.cache.size>240)this.cache.delete(this.cache.keys().next().value!);return path.map(p=>({...p}));
 }
}
