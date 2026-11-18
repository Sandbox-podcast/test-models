import Rapier from '@dimforge/rapier3d-compat';
import { Physics } from '../src/physics';
import { buildings, distance, elevation, gates, inRect, walls, type Point } from '../src/level';
import { furniture } from '../src/furniture';
import { poseOnAxis, ribbons, sampleAxis } from '../src/roads';
import { civilFlows, vehicleRoutes } from '../src/population';
import { getSide, newGame, sideIds } from '../src/progression';

await Rapier.init();
const physics=new Physics();
const audit: string[]=[];
const expect = (condition:boolean, message:string) => {if(!condition) audit.push(message);};
for(const road of ribbons.filter(path=>!path.pedestrian)){
  for(const lane of [-2.15,2.15]) for(const reverse of [false,true]){
    const samples=reverse?[...road.samples].reverse():road.samples;
    const points=samples.map(({x,z,yaw})=>[x+Math.cos(yaw)*lane,z-Math.sin(yaw)*lane] as Point);
    let at=points[0];
    for(let i=1;i<points.length;i++){
      const to=points[i];
      const yaw=Math.atan2(to[0]-at[0],to[1]-at[1]);
      const result=physics.move(at,to[0]-at[0],to[1]-at[1],yaw,true);
      if(distance(result.at,to)>.13){
        audit.push(road.id+' voie '+lane+' sens '+reverse+' bloqué à '+at.map(x=>x.toFixed(2)).join(',')+' par '+(result.contact?.id??'pente'));
        break;
      }
      at=to;
    }
  }
}
const centerline=(id:string,reverse=false):Point[]=>{
  const road=ribbons.find(item=>item.id===id)!;
  const points=road.samples.map(p=>[p.x,p.z] as Point);
  return reverse?points.reverse():points;
};
const cycle:Point[]=[
  ...centerline('J01'), [103.1,2.6],[105,9],[105,27], ...centerline('J05'),
  ...centerline('J06').slice(1),[222,0],[203,0], ...centerline('J04',true),
  [127,0],[126,-4.25],[134,-4.5],[141,-5.3], ...centerline('J03',true),
  ...centerline('J02',true).slice(1), ...centerline('P01',true).slice(1), [43,-12],[43,0],
];
for(const reverse of [false,true]){
  const loop=reverse?[...cycle].reverse():cycle;
  let at=loop[0];
  for(const target of loop.slice(1)){
    if(distance(at,target)<.02) continue;
    const yaw=Math.atan2(target[0]-at[0],target[1]-at[1]);
    const span=distance(at,target), pieces=Math.ceil(span/.45);
    for(let i=pieces;i>0;i--){
      const result=physics.move(at,(target[0]-at[0])/i,(target[1]-at[1])/i,yaw,true);
      at=result.at;
    }
    if(distance(at,target)>.16){audit.push('boucle complète sens '+reverse+' bloquée '+at+' vers '+target);break;}
  }
}
for(const prop of furniture) {
  const y=elevation(...prop.at);
  const b=buildings.find(b=>inRect(...prop.at,b.area));
  if (b) audit.push('mobilier '+prop.id+' dans '+b.id);
  const wall=walls.find(w=>inRect(...prop.at,w.area) && Math.abs((w.base??elevation(w.area[0],w.area[1]))-y)<w.height+.5);
  if (wall) audit.push('mobilier '+prop.id+' dans mur '+wall.area);
}
const walk = (points:Point[]) => {
  let at=points[0];
  for(const to of points.slice(1)){
    for(let i=0;i<1200&&distance(at,to)>.09;i++){
      const length=distance(at,to), step=Math.min(.14,length);
      at=physics.move(at,(to[0]-at[0])*step/length,(to[1]-at[1])*step/length).at;
    }
    if(distance(at,to)>.15) return 'bloqué à '+at.map(x=>x.toFixed(2)).join(',')+' vers '+to;
  }
};
const foot=walk([[4.7,-23.4],[4.7,-35.9],[19.8,-35.9],[20.4,-31],[20.7,-24],[20.4,-36],[14.65,-36],[14.65,-50]]);
if(foot) audit.push('Fuite à pied '+foot);
const ramp=walk([[45,-63],[39,-61],[32,-55],[18.4,-54.4],[13,-51.3]]);
if(ramp) audit.push('Arrivée pont à pied '+ramp);
const service=gates.find(g=>g.id==='service')!;
expect(physics.move([6.8,-50],4,0).hit,'grille de service fermée laisse passer');
physics.setGate(service.id,true);
expect(!physics.move([6.8,-50],4,0).hit,'grille de service ouverte bloque');
expect(physics.move([-7.5,20.8],0,-4,Math.PI,true).contact?.id==='utility-forecourt','collision borne');
const routes: {name:string; gate?:string; points:Point[]}[]=[
  {name:'M02 porche',gate:'records-front',points:[[-21.1,-20],[-21.1,-24.6],[-20.9,-26.6]]},
  {name:'M02 latéral',gate:'records-side',points:[[-11.3,-26.3],[-17.2,-26.3],[-19.5,-27.5]]},
  {name:'M03 escalier',points:[[94.35,-34.2],[94.35,-47.15],[97,-47.15],[102,-47.2]]},
  {name:'M03 entretien',points:[[118,-42.55],[113.8,-42.5],[110,-43],[104.5,-46.2]]},
  {name:'M04 guichet',points:[[102,-13],[102,-20],[102,-24],[106.8,-26.6],[107,-27.7]]},
  {name:'M04 galerie technique',points:[[114,-38],[114,-34.3],[114,-32.3],[112.9,-30.9],[111,-26]]},
  {name:'M05 galerie du coteau',gate:'gallery',points:[
    [117.9,-6.5],...ribbons.find(road=>road.id==='S02')!.samples.filter((_,i)=>i%2===0).map(p=>[p.x,p.z] as Point),
  ]},
  {name:'M06 vestibule',gate:'badge',points:[[192.55,-11.9],[192.55,-17.9],[192.55,-28.8],[199.65,-28.2]]},
  {name:'M06 couloir ouest',gate:'community',points:[[176,-28.7],[184,-28.7],[195.5,-28.5],[199.5,-28.5]]},
  {name:'M06 coursive',gate:'night-passage',points:[[197.5,-42],[197.5,-36],[199,-31.1],[199.75,-28.4]]},
  {name:'U03 cour',points:[[87.8,19.2],[85,19.2],[82.9,19.2]]},
  {name:'U03 arrière-boutique',gate:'shop-door',points:[[82,13],[82,16.8],[82,18.2]]},
  {name:'U04 porche',points:[[72,-84.8],[72,-88],[72,-89.4]]},
  {name:'U04 quai',points:[[73.6,-97.1],[73.6,-93.7],[73,-92.6]]},
];
for(const route of routes){
  if(route.gate) physics.setGate(route.gate,true);
  const failure=walk(route.points);
  if(failure) audit.push(route.name+' '+failure);
  if(route.gate) physics.setGate(route.gate,false);
}
for(const route of vehicleRoutes){
  const axis=sampleAxis(route.stops.map(([x,z])=>[x,z,0]),true);
  for(let position=.42;position<axis.at(-1)!.length;position+=.42){
    const previous=poseOnAxis(axis,position-.42), next=poseOnAxis(axis,position);
    const move=physics.move(previous.at,next.at[0]-previous.at[0],next.at[1]-previous.at[1],next.yaw,true);
    if(distance(move.at,next.at)>.10){audit.push(route.id+' trafic bloqué '+previous.at+' par '+(move.contact?.id??'pente'));break;}
  }
}
for(const flow of civilFlows){
  const itineraries=[flow.route,flow.day,flow.evening].filter(route=>route!==undefined);
  for(const route of itineraries) {
    const blocked=walk(route);
    if(blocked) audit.push(flow.label+' '+blocked);
  }
}
const save={...newGame(),chapter:6 as const};
for(const id of sideIds){
  const count=id==='C01'?2:id.startsWith('C')?3:1;
  for(let i=0;i<count;i++){
    if(id==='C01'||id==='C02'||id==='C03'||id==='C04') save.offers[id]=i;
    const quest=getSide(save,id);
    for(const step of quest.steps){
      const accessible=Array.from({length:20},(_,j)=>j*Math.PI/10).some(angle=>{
        const standing:Point=[step.at[0]+Math.sin(angle)*1.7,step.at[1]+Math.cos(angle)*1.7];
        return physics.canStand(standing)&&physics.ray(standing,step.at,1.3,1.4)>.89;
      });
      expect(accessible,quest.name+' étape inaccessible '+step.at);
    }
  }
}
if(audit.length){
  console.error(audit.join('\n'));
  process.exitCode=1;
} else console.log('PASS · voies et liaisons dans les deux sens, accès de mission, placements et trajets civils.');
