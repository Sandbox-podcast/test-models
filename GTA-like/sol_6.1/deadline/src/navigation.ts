import type { Point } from './level';
import type { Wall } from './scene';
const STEP=3, W=101, H=86, X=-150,Z=-135;
export class Navigation {
 blocked=new Uint8Array(W*H); distance=new Int32Array(W*H); target=-1;
 rebuild(walls:Wall[]){
  this.blocked.fill(0);this.target=-1;
  for(let j=0;j<H;j++)for(let i=0;i<W;i++){
   const x=X+i*STEP,z=Z+j*STEP;
   if(walls.some(w=>w.collider.isEnabled()&&Math.abs(x-w.x)<w.w/2+.8&&Math.abs(z-w.z)<w.d/2+.8))this.blocked[j*W+i]=1;
  }
 }
 index(p:Point){return Math.max(0,Math.min(H-1,Math.round((p.z-Z)/STEP)))*W+Math.max(0,Math.min(W-1,Math.round((p.x-X)/STEP)));}
 flood(p:Point){
  const target=this.index(p);if(target===this.target)return;this.target=target;
  this.distance.fill(-1);const queue=new Int32Array(W*H);let head=0,tail=0;queue[tail++]=target;this.distance[target]=0;
  while(head<tail){const v=queue[head++];for(const n of [v-1,v+1,v-W,v+W]){
   if(n<0||n>=W*H||this.blocked[n]||this.distance[n]>=0||Math.abs(n%W-v%W)>1)continue;
   this.distance[n]=this.distance[v]+1;queue[tail++]=n;
  }}
 }
 next(p:Point,target:Point):Point{
  this.flood(target);const v=this.index(p);let best=v,score=this.distance[v]<0?1e9:this.distance[v];
  for(const n of [v-1,v+1,v-W,v+W])if(n>=0&&n<W*H&&Math.abs(n%W-v%W)<=1&&this.distance[n]>=0&&this.distance[n]<score){best=n;score=this.distance[n];}
  return best===v?target:{x:X+(best%W)*STEP,z:Z+Math.floor(best/W)*STEP};
 }
}
