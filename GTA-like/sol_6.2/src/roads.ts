import type { Point } from './level';

type Knot = readonly [x: number, z: number, y: number];
export type Road = { id: string; width: number; axis: Knot[]; pedestrian?: boolean };
export type LaneSample = { x: number; z: number; y: number; length: number; yaw: number };
const mix = (a: number, b: number, t: number) => a + (b-a)*t;
const curve = (a: number,b: number,c: number,d: number,t: number) =>
  .5 * ((2*b) + (-a+c)*t + (2*a-5*b+4*c-d)*t*t + (-a+3*b-3*c+d)*t*t*t);

export function sampleAxis(axis: Knot[], loop = false) {
  const result: LaneSample[] = [];
  const point = (n: number) => loop ? axis[(n+axis.length)%axis.length] : axis[Math.max(0,Math.min(n,axis.length-1))];
  const count = loop ? axis.length : axis.length-1;
  let length = 0;
  for (let i=0;i<count;i++) {
    const a=point(i-1), b=point(i), c=point(i+1), d=point(i+2);
    const slices=Math.max(4,Math.ceil(Math.hypot(c[0]-b[0],c[1]-b[1])/1.4));
    for (let j=0;j<slices;j++) {
      const t=j/slices;
      const x=curve(a[0],b[0],c[0],d[0],t), z=curve(a[1],b[1],c[1],d[1],t);
      const previous=result.at(-1);
      if(previous) length+=Math.hypot(x-previous.x,z-previous.z);
      result.push({x,z,y:mix(b[2],c[2],t),length,yaw:0});
    }
  }
  const last=point(count), previous=result.at(-1)!;
  length+=Math.hypot(last[0]-previous.x,last[1]-previous.z);
  result.push({x:last[0],z:last[1],y:last[2],length,yaw:0});
  for(const [i,p] of result.entries()){
    const a=result[Math.max(0,i-1)], b=result[Math.min(result.length-1,i+1)];
    p.yaw=Math.atan2(b.x-a.x,b.z-a.z);
  }
  return result;
}

export function poseOnAxis(axis: LaneSample[], length: number) {
  let lo=0, hi=axis.length-1;
  while(hi-lo>1){
    const mid=(lo+hi)>>1;
    if(axis[mid].length <= length) lo=mid;
    else hi=mid;
  }
  const a=axis[lo], b=axis[hi], t=Math.max(0,Math.min(1,(length-a.length)/(b.length-a.length)));
  return { at:[mix(a.x,b.x,t),mix(a.z,b.z,t)] as Point, yaw:Math.atan2(b.x-a.x,b.z-a.z) };
}

export const roads3D: Road[] = [
  { id:'P01',width:12,axis:[[43,-26,6],[43,-38,6],[43,-47,6],[43,-53,4.3],[45,-59,2.1],[48,-65,.7],[54,-69,0]] },
  { id:'J02',width:11,axis:[[54,-69,0],[62,-74,1.1],[78,-77,2],[108,-77,2],[133,-77,2],[143,-76,2]] },
  { id:'J03',width:11,axis:[[143,-76,2],[151,-71,2.5],[155,-61,3],[155,-43,4],[154,-29,4],[147,-19,4],[144,-6,4]] },
  { id:'J01',width:12,axis:[[43,0,6],[57,0,6],[64,-1.3,5.35],[74,1.5,4.55],[86,0,4],[101,0,4]] },
  { id:'J04',width:11,axis:[[129,0,4],[143,0,5],[151,-.6,7.9],[163,0,12],[176,0,12]] },
  { id:'J05',width:11,axis:[[105,43,3.45],[105,54,4],[110,64,5.1],[122,72,6.4],[140,79,8],[157,89,10],[175,94,11.5],[195,92,12]] },
  { id:'J06',width:11,axis:[[195,92,12],[209,88,12],[224,77,12],[225,63,12],[225,43,12],[225,15,12],[225,0,12]] },
  { id:'quais-promenade',width:4, pedestrian:true,axis:[[53,-103,0],[71,-105,0],[102,-106,0],[127,-105,0],[147,-103,0]] },
  { id:'quais-rampe-ouest',width:3.6,pedestrian:true,axis:[[60,-79,2],[57,-88,1.9],[54,-94,1],[53,-103,0]] },
  { id:'quais-rampe-est',width:4.1,pedestrian:true,axis:[[135,-80,2],[139,-90,1.65],[143,-98,.65],[147,-103,0]] },
  { id:'belvederes-promenade',width:3.8,pedestrian:true,axis:[[113,59,4.5],[121,61,5],[133,64,6],[146,69,7.8],[163,77,9.4],[178,79,10.2],[195,78,11.5],[207,85,12]] },
  { id:'dalle-paliers',width:3.5,pedestrian:true,axis:[[97,14,3.4],[97,8,3.8],[98,0,4],[96,-8,5.2],[95,-17,6.1],[94,-26,7.2],[94,-39,8.4],[98,-50,9.8]] },
  { id:'S02',width:3.8,pedestrian:true,axis:[[121,-6.5,4.1],[129,-7.8,4.3],[141,-10.5,5],[151,-12.8,8.3],[166,-12.8,11.7],[174,-17.6,12],[177,-28.7,12]] },
];

export const ribbons = roads3D.map(road=>({ ...road, samples:sampleAxis(road.axis) }));
const gridSize=12;
type Segment = { a:LaneSample; b:LaneSample; width:number; path:Road; };
const grid=new Map<string,Segment[]>();
for(const road of ribbons){
  const {samples,width}=road, reach=width/2+2.75;
  for(let i=0;i<samples.length-1;i++){
    const a=samples[i],b=samples[i+1], segment={a,b,width,path:road};
    for(let x=Math.floor((Math.min(a.x,b.x)-reach)/gridSize);x<=Math.floor((Math.max(a.x,b.x)+reach)/gridSize);x++){
      for(let z=Math.floor((Math.min(a.z,b.z)-reach)/gridSize);z<=Math.floor((Math.max(a.z,b.z)+reach)/gridSize);z++){
        const key=x+':'+z, cell=grid.get(key);
        if(cell) cell.push(segment);
        else grid.set(key,[segment]);
      }
    }
  }
}

export function roadHeight(x:number,z:number) {
  const cell = grid.get(Math.floor(x/gridSize)+':'+Math.floor(z/gridSize));
  if(!cell) return;
  let street={rank:Infinity,height:0,weight:0}, walk={rank:Infinity,height:0,weight:0};
  for(const {a,b,width,path} of cell){
    const dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
    const offset=Math.hypot(x-(a.x+t*dx),z-(a.z+t*dz));
    const rank=offset/(width/2);
    if(offset > width/2+2.65) continue;
    const current=path.pedestrian?walk:street;
    if(rank>=current.rank) continue;
    const value={rank,height:mix(a.y,b.y,t),weight:Math.max(0,Math.min(1,(width/2+2.65-offset)/2.65))};
    if(path.pedestrian) walk=value;
    else street=value;
  }
  // Sidewalks follow their own profile, then meet the grade of the carriageway on its shoulder.
  const slope=walk.weight*(1-street.weight);
  const weight=street.weight+slope;
  if(weight>0) return {height:(street.height*street.weight+walk.height*slope)/weight,weight};
}
