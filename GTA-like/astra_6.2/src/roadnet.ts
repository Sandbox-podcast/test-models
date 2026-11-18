import {along,roads,distance,ground,type Point,type Route,type Sample} from './level'

type Node=Sample & {road:Route,edges:Node[]}
const nodes:Node[]=[],ends:Node[]=[]
export const crossings:Point[]=[]
const byRoad=new Map<Route,Node[]>()
for(const road of roads){
 const line:Node[]=[],count=Math.ceil(road.length/3.5)
 for(let i=0;i<=count;i++){const n:Node={...along(road,road.length*i/count),road,edges:[]},prev=line.at(-1)
  if(prev){prev.edges.push(n);n.edges.push(prev)}line.push(n);nodes.push(n)}
 ends.push(line[0],line.at(-1)!);byRoad.set(road,line)
}
/** Short, distinct road branches reachable from a reported position. */
export function searchExits(report:Point){
 const origin=nearestNode(report),visited=new Set<Node>([origin]),queue=[origin],exits:Point[]=[]
 for(let i=0;i<queue.length;i++){
  const node=queue[i]
  if(distance(node,origin)>=14){if(exits.every(q=>distance(q,node)>8))exits.push({x:node.x,z:node.z});continue}
  for(const next of node.edges)if(!visited.has(next)){visited.add(next);queue.push(next)}
 }
 return exits
}
// Connections are made only at real ends of roads at the same elevation.
for(const end of ends)for(const [road,line] of byRoad){
 if(road===end.road)continue
 const near=line.reduce((a,b)=>distance(end,a)<distance(end,b)?a:b)
 if(distance(end,near)>3.5||Math.abs(end.y-near.y)>1.1)continue
 if(!end.edges.includes(near)){end.edges.push(near);near.edges.push(end)}
 if(!crossings.some(q=>distance(q,end)<5))crossings.push({x:end.x,z:end.z})
}
export function nearestNode(q:Point){
 const h=ground(q.x,q.z),score=(n:Node)=>(n.x-q.x)**2+(n.z-q.z)**2+4*(n.y-h)**2
 return nodes.reduce((a,b)=>score(a)<score(b)?a:b)
}
export function roadPath(from:Point,to:Point):Point[]{
 const start=nearestNode(from),end=nearestNode(to),open=[start],cost=new Map([[start,0]]),parent=new Map<Node,Node>(),done=new Set<Node>()
 while(open.length){
  open.sort((a,b)=>cost.get(b)!+distance(b,end)-cost.get(a)!-distance(a,end))
  const n=open.pop()!;if(n===end){const path:Point[]=[n];let prev=parent.get(n);while(prev){path.push(prev);prev=parent.get(prev)}return path.reverse()}
  if(done.has(n))continue;done.add(n)
  for(const next of n.edges){const d=cost.get(n)!+distance(n,next);if(d>=(cost.get(next)??Infinity))continue;cost.set(next,d);parent.set(next,n);open.push(next)}
 }return []
}
export function responsePositions(q:Point,heading:number,range=45){
 const score=(n:Node)=>Math.abs(distance(n,q)-range)+.75*((n.x-q.x)*Math.sin(heading)+(n.z-q.z)*Math.cos(heading))
 return nodes.filter(n=>n.road.width>=9&&distance(n,q)>range-10&&distance(n,q)<range+14&&!crossings.some(j=>distance(j,n)<11)).sort((a,b)=>score(a)-score(b))
}
