import{test}from'node:test';import assert from'node:assert/strict';import{auditRoads,roadMesh}from'../src/world/roads.ts';import{PATHS}from'../src/world/data.ts';import{pathMesh}from'../src/world/geometry.ts';
test('carriageways have no self-intersection, conflicting levels or low-clearance road overlaps',()=>assert.deepEqual(auditRoads(),[]));
test('junctions render as a union rather than duplicate coplanar carriageways',()=>{
 let raw=0,united=0;for(const path of PATHS.filter(p=>p.mode==='road')){const a=pathMesh(path),b=roadMesh(path);const area=(m:typeof a)=>{let total=0;for(let i=0;i<m.indices.length;i+=3){const[a,b,c]=Array.from(m.indices.slice(i,i+3),n=>[m.positions[n*3],m.positions[n*3+2]]);total+=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;}return total;};raw+=area(a);united+=area(b);for(let i=0;i<b.indices.length;i+=3){const[a,c,d]=Array.from(b.indices.slice(i,i+3),n=>[b.positions[n*3],b.positions[n*3+2]]);assert.ok((c[1]-a[1])*(d[0]-a[0])-(c[0]-a[0])*(d[1]-a[1])>=-1e-5,path.id+' winding');}}
 assert.ok(raw-united>40,'junction overlap was not removed');assert.ok(united>raw*.85,'road union discarded too much surface');
});
