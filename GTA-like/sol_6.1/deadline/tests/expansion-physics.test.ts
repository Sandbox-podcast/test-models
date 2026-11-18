import{test}from'node:test';import assert from'node:assert/strict';import RAPIER from'@dimforge/rapier3d-compat';import*as T from'three';
import{Physics,type Body}from'../src/world/physics.ts';import{SurfaceNavigation}from'../src/world/navigation.ts';import{Fleet}from'../src/world/fleet.ts';import{HOMES,VEHICLES}from'../src/economy.ts';import{HOME_POINTS}from'../src/world/services.ts';import{LOC,BUILDINGS,PATHS}from'../src/world/data.ts';import{distance,rectangleContains,atDistance,type Vec3}from'../src/world/geometry.ts';
import{landHeight}from'../src/world/data.ts';
await RAPIER.init();
function walk(p:Physics,b:Body,route:Vec3[],speed=4.8){for(const target of route)for(let tick=0;distance(b.position,target)>.25;tick++){assert.ok(tick<450,'stuck at '+JSON.stringify(b.position)+' towards '+JSON.stringify(target));const pos=b.position,d=distance(pos,target),travel=Math.min(d,speed/60);p.move(b,(target.x-pos.x)/d*travel,(target.z-pos.z)/d*travel,Math.atan2(target.x-pos.x,target.z-pos.z),speed,tick/60);p.step();}}
test('each home can be entered, crossed and exited once its purchased door opens',()=>{
 const p=new Physics(),nav=new SurfaceNavigation('foot');for(const h of Object.values(HOMES))p.setGate(h.id,true);nav.rebuild(p.open);
 for(const h of Object.values(HOMES)){const point=HOME_POINTS[h.id],body=p.makeBody(point.entry),building=BUILDINGS.find(b=>b.id===h.building)!;p.step();const route=nav.route(body.position,point.inside);assert.ok(route.length,h.id+' entrance');walk(p,body,route);assert.ok(rectangleContains(body.position,{...building,id:h.id},-.5),h.id+' not really inside');assert.ok(Math.abs(body.feet-building.y)<.2);walk(p,body,nav.route(body.position,point.entry));assert.ok(distance(body.position,point.entry)<2.5,h.id+' exit');body.collider.setEnabled(false);}p.world.free();
});

test('both shops, the café and the buvette have physically usable furnished entrances and exits',()=>{
 const p=new Physics();for(const id of ['annex','store','cafes','buvette']){const b=BUILDINGS.find(b=>b.id===id)!;
  for(const door of b.doors!){const horizontal=door.side==='n'||door.side==='s',sign=door.side==='n'||door.side==='w'?-1:1;
   const threshold={x:b.x+(horizontal?door.offset:sign*b.w/2),z:b.z+(horizontal?sign*b.d/2:door.offset),y:b.y};
   const outside={x:threshold.x+(horizontal?0:sign*2.1),z:threshold.z+(horizontal?sign*2.1:0),y:b.y};outside.y=landHeight(outside.x,outside.z)??b.y;
   const inside={x:threshold.x-(horizontal?0:sign*1.2),z:threshold.z-(horizontal?sign*1.2:0),y:b.y},body=p.makeBody(outside);p.step();
   walk(p,body,[threshold,inside]);assert.ok(rectangleContains(body.position,{...b,id},-.4),id+' '+door.side+' entrance');walk(p,body,[threshold,outside]);assert.ok(distance(body.position,outside)<.4,id+' '+door.side+' exit');body.collider.setEnabled(false);
  }
 }p.world.free();
});
test('all vehicle models can leave their parking spaces and provide a safe on-foot exit',()=>{
 const p=new Physics(),fleet=new Fleet(p,new T.Scene());p.step();for(const vehicle of fleet.vehicles){const from={...vehicle.body.position};for(let t=0;t<90;t++){p.move(vehicle.body,0,-3/60,Math.PI,-3,t/60,fleet.vehicles.filter(v=>v!==vehicle).map(v=>v.body));p.step();}assert.ok(distance(from,vehicle.body.position)>1.4,vehicle.model+' cannot leave');assert.ok(p.safeFootPosition(vehicle.body.position,fleet.vehicles.map(v=>v.body)),vehicle.model+' traps its driver');}p.world.free();
});
test('blocked side doors still allow a front or rear exit without crossing walls or changing levels',()=>{
 const p=new Physics(),car=p.makeBody(LOC.car,'car');p.addObstacle({id:'left',x:30.45,z:45,y:6,w:.2,d:5,h:3},'building');p.addObstacle({id:'right',x:33.55,z:45,y:6,w:.2,d:5,h:3},'building');p.step();const safe=p.safeFootPosition(car.position,[car]);assert.ok(safe);assert.ok(Math.abs(safe.x-32)<1);assert.ok(Math.abs(safe.z-45)>2.5);assert.ok(Math.abs(safe.y-6)<.1);assert.ok(p.hasFloor(safe));p.world.free();
});

test('turning cannot sweep a vehicle through a thin wall or another parked vehicle',()=>{
 const p=new Physics(),car=p.makeBody(LOC.car,'car'),other=p.makeBody({x:35,y:6,z:45},'car');p.step();
 const turn=p.move(car,0,0,Math.PI/2,0,0,[other]);p.step();assert.ok(Math.abs(turn.angle)<.001,'rotation entered the neighbouring car');assert.ok(Math.abs(p.bodyAngle(car))<.001);
 const before={...car.position};p.move(car,100,0,Math.PI/2,4,.1,[other]);p.step();assert.ok(distance(car.position,before)<.01,'a blocked turn restored movement previously refused for lack of a road');
 other.collider.setEnabled(false);p.addObstacle({id:'turn-wall',x:34,z:45,y:6,w:.1,d:1,h:3},'building');p.step();
 const wall=p.move(car,0,0,Math.PI,0,1);p.step();assert.ok(Math.abs(wall.angle)<.001,'the middle of a half-turn swept through a thin wall');
 assert.ok(p.safeFootPosition(car.position,[car]),'blocked turn trapped the driver');p.world.free();
});

test('vehicle recall rejects occupied places and preserves full-body clearance',()=>{
 const p=new Physics(),fleet=new Fleet(p,new T.Scene());p.step();const van=fleet.vehicles.find(v=>v.model==='van')!;
 assert.ok(fleet.recall('van',LOC.motors,fleet.vehicles.map(v=>v.body)));p.step();assert.ok(p.carFits(van.body,van.body.position,van.angle,fleet.vehicles.filter(v=>v!==van).map(v=>v.body)));
 van.controlled=true;const before={...van.body.position};assert.equal(fleet.recall('van',LOC.spawn,fleet.vehicles.map(v=>v.body)),false);assert.deepEqual(van.body.position,before);p.world.free();
});
test('the largest vehicle traverses all roads and junctions in both directions',()=>{
 const p=new Physics();p.setGate('badge',true);for(const path of PATHS.filter(p=>p.mode==='road'))for(const reverse of [false,true]){const route=[];for(let s=4;s<path.points.at(-1)!.s-4;s+=2)route.push(atDistance(path,s));if(reverse)route.reverse();const body=p.makeBody(route[0],'car',VEHICLES.van);p.step();try{walk(p,body,route,5);}catch(e){throw new Error(path.id+' '+reverse+': '+String(e));}body.collider.setEnabled(false);}p.world.free();
});
