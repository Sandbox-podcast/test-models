import { distance, elevation, type Point } from './level';
import { Physics } from './physics';
import { vehicleRoutes } from './population';
import { onStreet, poseOnAxis, ribbons, sampleAxis, type LaneSample } from './roads';

const stitches:Point[][]=[
  [[43,-26],[43,-12],[43,0]],
  [[43,0],[36,0],[13,0],[-13,0],[-39,0],[-51,0]],
  [[101,0],[109,0],[120,0],[129,0]],
  [[101,0],[103.1,2.6],[105,9],[105,27],[105,43]],
  [[129,0],[129,-3.6],[134,-4.5],[140.5,-4.9],[143.3,-10]],
  [[176,0],[184,0],[201,0],[215,0],[225,0]],
  [[143.3,-10],[144,-2],[144,14],[144,32],[144,43]],
  [[176,0],[175,9],[175,22],[175,41]],
  [[162,43],[180,43],[198,43],[218,43],[225,43]],
  [[43,0],[43,12],[43,28],[43,39]],
];

export const heading=(a:Point,b:Point)=>Math.atan2(b[0]-a[0],b[1]-a[1]);
export const turnAngle=(a:number,b:number)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
export type RoadNode={id:number;at:Point;edge:{id:number;cost:number}[]};

export class DrivingNetwork {
  readonly nodes:RoadNode[]=[];
  constructor(private physics:Physics){
    const paths=[...ribbons.filter(r=>!r.pedestrian).map(r=>r.samples),
      ...stitches.map(stops=>sampleAxis(stops.map(([x,z])=>[x,z,elevation(x,z)]))),
      ...vehicleRoutes.map(route=>sampleAxis(route.stops.map(([x,z])=>[x,z,elevation(x,z)]),true))];
    const links: Map<number,number>[]=[];
    const add=(at:Point)=>{
      const duplicate=this.nodes.find(node=>distance(node.at,at)<.36);
      if(duplicate) return duplicate;
      const node={id:this.nodes.length,at,edge:[]};
      this.nodes.push(node);links.push(new Map());return node;
    };
    const connect=(a:RoadNode,b:RoadNode,penalty:number)=>{
      const length=distance(a.at,b.at), cost=length+penalty;
      if(!length||links[a.id].has(b.id)||!this.safeLink(a.at,b.at)) return;
      links[a.id].set(b.id,cost);links[b.id].set(a.id,cost);
      a.edge.push({id:b.id,cost});b.edge.push({id:a.id,cost});
    };
    for(const path of paths){
      let previous:RoadNode|undefined;
      for(const at of this.sample(path)){
        const next=add(at);
        if(previous) connect(previous,next,0);
        previous=next;
      }
    }
    for(const [i,a] of this.nodes.entries()) for(let j=i+1;j<this.nodes.length;j++){
      const b=this.nodes[j];
      if(distance(a.at,b.at)<4.8) connect(a,b,1.7);
    }
  }

  private sample(axis:LaneSample[]){
    const total=axis.at(-1)!.length,count=Math.ceil(total/3.3);
    return Array.from({length:count+1},(_,i)=>poseOnAxis(axis,i*total/count).at);
  }

  private safeLink(a:Point,b:Point){
    const length=distance(a,b), yaw=heading(a,b), count=Math.ceil(length/.45);
    if(!this.physics.canTurn(a,yaw)||!this.physics.canTurn(b,yaw)) return false;
    let at=a;
    for(let i=1;i<=count;i++){
      const f=i/count, target:Point=[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];
      if(!onStreet(...target)) return false;
      const next=this.physics.move(at,target[0]-at[0],target[1]-at[1],yaw,true);
      if(distance(next.at,target)>.065) return false;
      at=target;
    }
    return true;
  }

  nearby(at:Point,within=19){
    const y=elevation(...at);
    return this.nodes.map(node=>({node,length:distance(at,node.at)}))
      .filter(row=>row.node.edge.length&&row.length<=within&&Math.abs(elevation(...row.node.at)-y)<3.2)
      .sort((a,b)=>a.length-b.length).map(row=>row.node);
  }

  route(from:RoadNode,to:RoadNode){
    if(from===to) return [to.at];
    const total=this.nodes.length, costs=new Float64Array(total).fill(Infinity), previous=new Int32Array(total).fill(-1);
    const open=new Set([from.id]);
    costs[from.id]=0;
    while(open.size){
      let best=Infinity, here=-1;
      for(const id of open){
        const cost=costs[id]+distance(this.nodes[id].at,to.at);
        if(cost<best){best=cost;here=id;}
      }
      if(here===to.id){
        const path:Point[]=[];
        for(let id=here;id>=0;id=previous[id]) path.push(this.nodes[id].at);
        return path.reverse();
      }
      open.delete(here);
      for(const edge of this.nodes[here].edge){
        const cost=costs[here]+edge.cost;
        if(cost>=costs[edge.id]) continue;
        costs[edge.id]=cost;previous[edge.id]=here;open.add(edge.id);
      }
    }
    return [];
  }
}
