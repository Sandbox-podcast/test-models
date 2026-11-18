import{test}from'node:test';import assert from'node:assert/strict';import RAPIER from'@dimforge/rapier3d-compat';
import{Physics,type Body}from'../src/world/physics.ts';import{LOC,PATHS}from'../src/world/data.ts';import{SurfaceNavigation}from'../src/world/navigation.ts';import{distance,atDistance,type Vec3}from'../src/world/geometry.ts';
import{QUESTS}from'../src/story.ts';
await RAPIER.init();
function follow(physics:Physics,body:Body,points:Vec3[],speed=5){let steps=0;for(const target of points){for(let i=0;i<600&&distance(body.position,target)>.28;i++){const p=body.position,d=distance(p,target),travel=Math.min(speed/60,d);physics.move(body,(target.x-p.x)/d*travel,(target.z-p.z)/d*travel,Math.atan2(target.x-p.x,target.z-p.z),speed,steps/60);physics.step();steps++;if(i===599)throw new Error(`stuck at ${JSON.stringify(body.position)} toward ${JSON.stringify(target)}`);}}return steps;}
test('the real depot walls have an equipment-free exit to the courtyard',()=>{
 const p=new Physics(),b=p.makeBody(LOC.chip);p.step();const nav=new SurfaceNavigation('foot'),end={x:116,y:6,z:54},route=nav.route(LOC.chip,end);assert.ok(route.length);follow(p,b,route);assert.ok(distance(b.position,end)<3);p.world.free();
});
test('the car leaves the garage without catching on internal floor triangle edges',()=>{
 const p=new Physics(),b=p.makeBody(LOC.car,'car');p.step();const ticks=follow(p,b,[{x:32,y:6,z:30}],6);assert.ok(distance(b.position,{x:32,y:6,z:30})<.4);assert.ok(ticks<190,`garage exit took ${ticks} fixed ticks`);p.world.free();
});
test('the foot escape physically descends below the rails instead of snapping across levels',()=>{
 const p=new Physics(),b=p.makeBody({x:125,y:6,z:64});p.step();follow(p,b,[{x:125,y:6,z:65},{x:125,y:0,z:70},{x:125,y:0,z:80},{x:125,y:0,z:90},LOC.drop],3.8);assert.ok(Math.abs(b.feet)<.12,`feet at ${b.feet}`);assert.ok(distance(b.position,LOC.drop)<.4);p.world.free();
});
test('the permanently opened service passage connects the workshop alley to the lower panel',()=>{
 const p=new Physics();p.setGate('shortcut',true);const b=p.makeBody({x:52,y:6,z:61});p.step();follow(p,b,[{x:52,y:6,z:63},{x:52,y:0,z:70},{x:52,y:0,z:82.5},LOC.panel],3.5);assert.ok(distance(b.position,LOC.panel)<.4);assert.ok(Math.abs(b.feet)<.1);p.world.free();
});
test('the car crosses the +6 m bridge and follows the curved ramp down to 0 m',()=>{
 const p=new Physics(),path=PATHS.find(p=>p.id==='F-avenue')!,ramp=PATHS.find(p=>p.id==='F-ramp')!,low=PATHS.find(p=>p.id==='F-low')!,start=atDistance(path,path.points.at(-1)!.s-25),b=p.makeBody(start,'car');p.step();const exit=atDistance(low,5),route=[...path.points.filter(q=>q.s>start.s),...ramp.points,exit];follow(p,b,route,7);assert.ok(Math.abs(b.feet)<.15,`car feet ${b.feet}`);assert.ok(distance(b.position,exit)<.5);p.world.free();
});
test('a new collision reports side and severity but a stationary continued contact does not add damage',()=>{
 const p=new Physics(),b=p.makeBody({x:32,y:6,z:52},'car');p.step();const impacts=[];for(let i=0;i<180;i++){const r=p.move(b,0,8/60,0,8,i/60);impacts.push(...r.impacts);p.step();}assert.ok(impacts.some(i=>i.side==='front'&&i.severity===2));const count=impacts.length;for(let i=180;i<360;i++){const r=p.move(b,0,0,0,0,i/60);impacts.push(...r.impacts);p.step();}assert.equal(impacts.length,count);assert.ok(b.position.z<56.4);p.world.free();
});
test('each authored road is physically drivable in both directions with the full car footprint',()=>{
 const p=new Physics();p.setGate('badge',true);p.setGate('exit',true);
 for(const path of PATHS.filter(path=>path.mode==='road'))for(const reverse of [false,true]){
  const end=path.points.at(-1)!.s,points=[];for(let s=4;s<end-4;s+=2)points.push(atDistance(path,s));if(points.length<2)continue;if(reverse)points.reverse();const body=p.makeBody(points[0],'car');p.step();try{follow(p,body,points.slice(1),5.5);}catch(e){throw new Error(`${path.id} ${reverse?'reverse':'forward'}: ${String(e)}`);}body.collider.setEnabled(false);
 }p.world.free();
});

test('all authored pedestrian passages can be walked with the real walls and thresholds',()=>{
 const p=new Physics();for(const gate of ['shortcut','gallery','badge','exit','depot','residence'])p.setGate(gate,true);
 for(const path of PATHS.filter(path=>path.mode==='walk')){
  const points=path.points,body=p.makeBody(points[0]);p.step();try{follow(p,body,points.slice(1),3.8);}catch(e){throw new Error(path.id+': '+String(e));}body.collider.setEnabled(false);
 }p.world.free();
});

test('every quest connects its giver and successive stages through physically walkable routes',()=>{
 const p=new Physics(),nav=new SurfaceNavigation('foot');
 for(const quest of QUESTS){const body=p.makeBody(LOC[quest.giver]);p.step();for(const step of quest.steps){
  const target=LOC[step.at],route=nav.route(body.position,target);assert.ok(route.length,quest.id+' / '+step.at+' route');
  try{follow(p,body,route,5);}catch(e){throw new Error(quest.id+' / '+step.at+': '+String(e));}
  assert.ok(distance(body.position,target)<3&&Math.abs(body.feet-target.y)<2,quest.id+' / '+step.at+' interaction range');
 }body.collider.setEnabled(false);}p.world.free();
});

test('both campaign access routes reach the plateau with clearance along the gallery edges',()=>{
 for(const route of ['gallery','badge']){const p=new Physics(),nav=new SurfaceNavigation('foot');p.setGate(route,true);nav.rebuild(new Set([route]));const start=route==='gallery'?LOC.nadia:LOC.sorel,b=p.makeBody(start);p.step();
  for(const target of [LOC.power,LOC.post,LOC.server]){follow(p,b,nav.route(b.position,target),5);assert.ok(distance(b.position,target)<3);}p.world.free();
 }
});
