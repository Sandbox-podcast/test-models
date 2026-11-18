import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PATHS,BUILDINGS,JUNCTIONS,LOC,isClear,supportAt,surfacesNear}from'../src/world/data.ts';
import{FURNITURE}from'../src/world/furniture.ts';
import {rectangleContains,closestOnPath,atDistance,pathMesh}from'../src/world/geometry.ts';
import {SurfaceNavigation}from'../src/world/navigation.ts';
test('all mission objects and named contacts stand in clear space',()=>{
 for(const [id,p]of Object.entries(LOC))assert.ok(isClear(p,.36,new Set(['shortcut','gallery','badge','exit','residence'])),`${id} intersects a wall at ${JSON.stringify(p)}`);
});

test('furniture respects carriageways at every elevation and reserves pedestrian passages',()=>{
 for(const r of FURNITURE)for(const q of surfacesNear(r)){
  if(!q.onStrip)continue;const radius=Math.hypot(r.w,r.d)/2;
  if(q.path.mode==='road'&&r.y<q.y+2&&r.y+r.h>q.y-.1)assert.ok(q.distance>=q.path.width/2+q.path.sidewalk+radius+.1,r.id+' intersects '+q.path.id);
  if(q.path.mode==='walk'&&Math.abs(q.y-r.y)<2)assert.ok(q.distance>=q.path.width/2+radius+.6,r.id+' blocks '+q.path.id);
 }
});
test('no building occupies the carriageway, sidewalks or bridge approaches',()=>{
 const errors:string[]=[];for(const b of BUILDINGS)for(const p of PATHS.filter(p=>p.mode==='road'&&!['F-garage','F-parking'].includes(p.id))){
  if(p.points.some(q=>Math.abs(q.y-b.y)<2&&rectangleContains(q,{...b,h:0,id:b.id},p.width/2+p.sidewalk+.6)))errors.push(b.id+' / '+p.id);
 }assert.deepEqual(errors,[]);
});
test('six paired junctions have the specified continuous endpoint elevations',()=>{
 const expected={J01:[6,4],J02:[0,2],J03:[2,4],J04:[4,12],J05:[4,4],J06:[12,12]};assert.equal(JUNCTIONS.length,6);
 for(const j of JUNCTIONS){assert.equal(j.width,11);assert.ok(Math.abs(j.a.y-expected[j.id as keyof typeof expected][0])<.001);assert.ok(Math.abs(j.b.y-expected[j.id as keyof typeof expected][1])<.001);const path=PATHS.find(p=>p.id===j.id)!;for(let i=1;i<path.points.length;i++){const a=path.points[i-1],b=path.points[i];assert.ok(Math.abs(a.y-b.y)<Math.hypot(a.x-b.x,a.z-b.z)*.43+.02,j.id+' slope');}}
});
test('bridge and tunnel stay on separate surfaces and a car cannot enter the staircase',()=>{
 assert.ok(Math.abs(supportAt({x:165,z:75},6,'car',.2)!-6)<.01);
 assert.ok(Math.abs(supportAt({x:125,z:75},0,'foot',.2)!)<.01);
 assert.equal(supportAt({x:125,z:75},0,'car',.2),null);
 assert.equal(supportAt({x:165,z:75},0,'foot',.2),null);
});
test('road meshes face up and lane samples follow the same arc-length geometry',()=>{
 for(const p of PATHS.filter(p=>p.mode==='road')){const m=pathMesh(p);const [a,b,c]=Array.from(m.indices.slice(0,3));const ax=m.positions[b*3]-m.positions[a*3],az=m.positions[b*3+2]-m.positions[a*3+2],bx=m.positions[c*3]-m.positions[a*3],bz=m.positions[c*3+2]-m.positions[a*3+2];assert.ok(az*bx-ax*bz>0,p.id+' normals');for(let s=0;s<p.points.at(-1)!.s;s+=5){const q=atDistance(p,s);assert.ok(closestOnPath(q,p).distance<.01);}}
});
test('a baseline pedestrian route reaches every mission without implants or optional gates',()=>{
 const nav=new SurfaceNavigation('foot');const errors:string[]=[];for(const [id,p]of Object.entries(LOC))if(nav.route(LOC.spawn,p).length===0)errors.push(id);assert.deepEqual(errors,[]);
});
test('the five-district driving loop is connected in both directions',()=>{
 const nav=new SurfaceNavigation('car');nav.rebuild(new Set(['badge']));const points=['F-avenue','D-coteau','B-hairpin','N-loop','Q-road'].map(id=>atDistance(PATHS.find(p=>p.id===id)!,15));
 for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];assert.ok(nav.route(a,b).length>0,`driving ${i} forward`);assert.ok(nav.route(b,a).length>0,`driving ${i} reverse`);}
});
