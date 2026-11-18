import{test}from'node:test';import assert from'node:assert/strict';import RAPIER from'@dimforge/rapier3d-compat';import*as T from'three';
import{AlertState,PursuitDirector}from'../src/world/pursuit.ts';import{RoadNetwork,RoadTraffic,type MotorAgent}from'../src/world/driving.ts';import{Physics}from'../src/world/physics.ts';import{VEHICLES}from'../src/economy.ts';import{makeCar}from'../src/world/render.ts';import{distance,type Vec3}from'../src/world/geometry.ts';import{LOC,districtAt}from'../src/world/data.ts';
await RAPIER.init();
import{JUNCTIONS}from'../src/world/data.ts';
const absent={position:{x:-1000,y:6,z:-1000},angle:0,speed:0};
function agent(p:Physics,point:Vec3,id='test'):MotorAgent{return{id,model:'courier',body:p.makeBody(point,'car',VEHICLES.courier),mesh:makeCar(0x889999),angle:0,speed:0,blocked:0};}
function face(p:Physics,car:MotorAgent,angle:number){car.angle=angle;const q={x:0,y:Math.sin(angle/2),z:0,w:Math.cos(angle/2)};car.body.body.setRotation(q,true);car.body.body.setNextKinematicRotation(q);}

test('alert levels accumulate, keep only observed positions and expire after continuous sight loss',()=>{
 const alert=new AlertState();for(const[severity,level]of [[1.4,1],[2,2],[3,3],[4,4]]){alert.report({x:32,y:6,z:30},severity,0);assert.equal(alert.level,level);}
 const last={...alert.lastKnown!};alert.tick(1,15,null);assert.deepEqual(alert.lastKnown,last);assert.equal(alert.level,4);alert.tick(1,27,null);assert.equal(alert.level,4);alert.tick(1,28,null);assert.equal(alert.level,0);assert.equal(alert.escapes,1);
 alert.report(last,1,30);alert.tick(1,39,{x:120,y:6,z:30});alert.tick(1,48,null);assert.equal(alert.level,1);alert.tick(1,49,null);assert.equal(alert.level,0);
});
test('the road network connects every district without using pedestrian shortcuts',()=>{
 const n=new RoadNetwork();n.open.add('badge');const points=[{x:32,y:6,z:35},{x:252,y:4,z:35},{x:265,y:12,z:-178},{x:315,y:2,z:177},{x:140,y:12,z:-163}];for(const from of points)for(const to of points){const route=n.route(from,to);assert.ok(route.length,JSON.stringify({from,to}));assert.ok(route.every(p=>!p.road.includes('foot')&&p.road!=='S02'));}assert.ok(n.junctions.length>=6);
});
test('a closed service gate makes road pursuers use the other district route',()=>{
 const network=new RoadNetwork(),route=network.route({x:345,y:4,z:38},{x:250,y:12,z:-110});assert.ok(route.length);assert.ok(route.some(p=>p.road==='J06'),'route tried to force the closed badge gate');network.open.add('badge');const open=network.route({x:345,y:4,z:38},{x:250,y:12,z:-110});assert.ok(open.some(p=>p.road==='J04'));assert.ok(open.length<route.length);
});
test('a real security car follows the connected roads across district boundaries',()=>{
 const p=new Physics();p.setGate('badge',true);const roads=new RoadTraffic(p);roads.network.open=new Set(p.open);const start={x:135,y:6,z:30},target={x:276,y:4,z:35},route=roads.network.route(start,target),car=agent(p,route[0]);car.route=route;face(p,car,Math.atan2(route[0].tx,route[0].tz));p.step();const visited=new Set<string>();
 for(let i=0;i<6000&&distance(car.body.position,route.at(-1)!)>3.5;i++){roads.drive(car,12,1/60,i/60,[car.body],absent,true);p.step();visited.add(districtAt(car.body.position.x,car.body.position.z).id);}assert.ok(distance(car.body.position,route.at(-1)!)<3.5,JSON.stringify(car.body.position));assert.ok(distance(car.body.position,target)<12);assert.ok(visited.has('forges')&&visited.has('dalle'));p.world.free();
});
test('a pursuer can turn back toward the last sighting instead of taking a city-wide detour',()=>{
 const p=new Physics(),roads=new RoadTraffic(p),car=agent(p,{x:285,y:12,z:-176.1}),target={x:270,y:12,z:-178};face(p,car,Math.PI/2);p.step();roads.plan(car,target,0,false);assert.ok(car.route!.length<15,'unnecessary loop around the city');
 for(let i=0;i<2400&&distance(car.body.position,car.route!.at(-1)!)>3.5;i++){roads.drive(car,12,1/60,i/60,[car.body],absent,true);p.step();}assert.ok(distance(car.body.position,car.route!.at(-1)!)<3.5,JSON.stringify(car.body.position));p.world.free();
});
test('the pursuit director keeps the same active car behind a player driving into another district',()=>{
 const p=new Physics(),roads=new RoadTraffic(p),director=new PursuitDirector(p,roads,new T.Scene()),route=roads.network.route({x:110,y:6,z:25},{x:280,y:4,z:30}),player=agent(p,route[8],'player'),guard=director.vehicles[0];player.route=route.slice(8);face(p,player,Math.atan2(route[8].tx,route[8].tz));p.teleport(guard.body,route[0]);guard.active=true;guard.body.collider.setEnabled(true);face(p,guard,Math.atan2(route[0].tx,route[0].tz));p.step();director.report(player.body.position,3,0);director.spawnAt=Infinity;const visited=new Set<string>();
 for(let i=0;i<6000&&distance(player.body.position,route.at(-1)!)>4;i++){roads.drive(player,8,1/60,i/60,[player.body,guard.body],absent,true);director.update(1/60,i/60,{position:player.body.position,body:player.body,angle:player.angle,speed:player.speed},[player.body,...director.vehicles.map(c=>c.body)],false);p.step();visited.add(districtAt(guard.body.position.x,guard.body.position.z).id);}
 assert.ok(distance(player.body.position,route.at(-1)!)<4,'player did not reach La Dalle');assert.ok(visited.has('forges')&&visited.has('dalle'),'pursuer did not cross the district boundary');assert.ok(distance(player.body.position,guard.body.position)<30,'pursuer lost the route');assert.equal(guard.active,true);p.world.free();
});
test('the autonomous driver crosses all six inter-district connectors in both directions',()=>{
 const p=new Physics();p.setGate('badge',true);const roads=new RoadTraffic(p);roads.network.open=new Set(p.open);
 const approaches:Record<string,[Vec3,Vec3]>={J01:[{x:110,y:6,z:25},{x:250,y:4,z:32}],J02:[{x:100,y:0,z:108},{x:250,y:2,z:160.75}],J03:[{x:287.5,y:2,z:147},{x:345,y:4,z:38}],J04:[{x:345,y:4,z:38},{x:250,y:12,z:-110}],J05:[{x:250,y:4,z:32},{x:32,y:4,z:-104}],J06:[{x:140,y:12,z:-163},{x:240,y:12,z:-178}]};
 for(const j of JUNCTIONS)for(const reverse of [false,true]){const [a,b]=approaches[j.id],route=roads.network.route(reverse?b:a,reverse?a:b),car=agent(p,route[0],j.id+reverse);assert.ok(route.some(p=>p.road===j.id),j.id+' was bypassed');car.route=route;face(p,car,Math.atan2(route[0].tx,route[0].tz));p.step();
  for(let i=0;i<9000&&distance(car.body.position,route.at(-1)!)>3.5;i++){roads.drive(car,12,1/60,i/60,[car.body],absent,true);p.step();}
  assert.ok(distance(car.body.position,route.at(-1)!)<3.5,j.id+' '+reverse+' stuck at '+JSON.stringify(car.body.position));car.body.collider.setEnabled(false);
 }p.world.free();
});
test('a civilian pulls aside for the player and a hail can stop a moving vehicle',()=>{
 const p=new Physics(),roads=new RoadTraffic(p),route=roads.network.route({x:260,y:12,z:-178},{x:310,y:12,z:-178}),car=agent(p,route[0]);car.route=route;face(p,car,Math.PI/2);const player=p.makeBody({x:car.body.position.x-12,y:12,z:car.body.position.z},'car');p.step();car.speed=6;
 for(let i=0;i<240;i++){roads.drive(car,8,1/60,i/60,[car.body,player],{position:player.position,body:player,angle:Math.PI/2,speed:10});p.step();}assert.equal(car.yielding,true);assert.ok(car.speed<1,car.speed.toString());assert.ok(car.body.position.z-route[0].z>1,'did not pull toward the right curb');
 roads.requestStop(car,5);for(let i=0;i<240;i++){roads.drive(car,8,1/60,5+i/60,[car.body],absent);p.step();}assert.ok(car.speed<1);assert.ok(p.safeFootPosition(car.body.position,[car.body]));p.world.free();
});
test('the road driver still brakes for an ordinary resident crossing its lane',()=>{
 const p=new Physics(),roads=new RoadTraffic(p),route=roads.network.route({x:260,y:12,z:-178},{x:310,y:12,z:-178}),car=agent(p,route[0]);car.route=route;face(p,car,Math.PI/2);car.speed=6;roads.pedestrians=[{x:car.body.position.x+3,y:12,z:car.body.position.z}];p.step();for(let i=0;i<120;i++){roads.drive(car,8,1/60,i/60,[car.body],absent);p.step();}assert.ok(car.speed<.2);assert.ok(car.body.position.x<roads.pedestrians[0].x-1);p.world.free();
});
test('a junction waits for a clear exit and player priority, then clears an occupied crossing',()=>{
 const p=new Physics(),roads=new RoadTraffic(p),zone=roads.network.junctions.find(j=>j.point.y===6)!,car=agent(p,{x:zone.point.x-14,y:6,z:zone.point.z}),exit={x:zone.point.x+13,y:6,z:zone.point.z},blocker=p.makeBody(exit,'car'),player=p.makeBody({x:zone.point.x,y:6,z:zone.point.z+15},'car');p.step();
 assert.equal(roads.priority.mayEnter(car,zone,0,absent,[blocker],exit),false);assert.equal(roads.priority.mayEnter(car,zone,1,{position:player.position,body:player,angle:Math.PI,speed:8},[],exit),false);
 assert.equal(roads.priority.mayEnter(car,zone,2,absent,[],exit),true);p.teleport(car.body,zone.point);assert.equal(roads.priority.mayEnter(car,zone,3,{position:player.position,body:player,angle:Math.PI,speed:8},[],exit),true);p.world.free();
});
test('opposing and merging traffic clears the real Forges junction without parking inside it',()=>{
 const p=new Physics(),roads=new RoadTraffic(p);roads.network.open.add('badge');p.setGate('badge',true);const journeys:[Vec3,Vec3][]=[[{x:110,y:6,z:25},{x:280,y:4,z:30}],[{x:280,y:4,z:30},{x:90,y:6,z:25}],[{x:165,y:6,z:55},{x:310,y:4,z:33}]];
 const cars=journeys.map(([a,b],i)=>{const route=roads.network.route(a,b),car=agent(p,route[0],'queue-'+i);car.route=route;face(p,car,Math.atan2(route[0].tx,route[0].tz));return car;});p.step();
 const passed=new Set<string>();for(let i=0;i<12000;i++){for(const car of cars){if(passed.has(car.id))continue;roads.drive(car,9,1/60,i/60,cars.map(c=>c.body),absent);if(distance(car.body.position,car.route!.at(-1)!)<5){passed.add(car.id);car.body.collider.setEnabled(false);}}p.step();if(passed.size===cars.length)break;}
 for(const car of cars){assert.ok(distance(car.body.position,car.route!.at(-1)!)<5,car.id+' blocked at '+JSON.stringify(car.body.position));assert.equal(roads.network.junction(car.body.position),undefined,'car stopped inside a crossing');}p.world.free();
});
test('traffic occludes observation and reinforcement cars use physical roads instead of teleporting after a district change',()=>{
 const p=new Physics(),roads=new RoadTraffic(p),director=new PursuitDirector(p,roads,new T.Scene()),player=p.makeBody({x:310,y:12,z:-176.1},'car'),van=p.makeBody({x:290,y:12,z:-176.1},'car',VEHICLES.van),observer=director.vehicles[0];p.teleport(observer.body,{x:270,y:12,z:-176.1});observer.active=true;observer.body.collider.setEnabled(true);face(p,observer,Math.PI/2);p.step();
 assert.equal(p.lineOfSight({x:270,y:13.1,z:-176.1},{x:310,y:13.1,z:-176.1},[van]),false);director.report(player.position,7,0);for(let i=0;i<240;i++){director.update(1/60,i/60,{position:player.position,body:player,angle:0,speed:0},[player,van,...director.vehicles.map(c=>c.body)],false);p.step();}
 assert.ok(director.reinforcements>0);const before={...observer.body.position};p.teleport(player,{x:252,y:4,z:35});director.update(1/60,5,{position:player.position,body:player,angle:0,speed:0},[player,...director.vehicles.map(c=>c.body)],true);p.step();assert.ok(distance(observer.body.position,before)<1,'active pursuer teleported to another district');p.world.free();
});
test('radio tracking does not let a patrol shoot through a vehicle hiding the player',()=>{
 const p=new Physics(),roads=new RoadTraffic(p),director=new PursuitDirector(p,roads,new T.Scene()),car=director.vehicles[0],player={position:{x:280,y:12,z:-176.1},angle:0,speed:0},van=p.makeBody({x:275,y:12,z:-176.1},'car',VEHICLES.van);p.teleport(car.body,{x:270,y:12,z:-176.1});car.active=true;car.body.collider.setEnabled(true);face(p,car,Math.PI/2);p.step();director.report(player.position,3,0);director.spawnAt=100;let damage=0;
 director.update(1/60,1,player,[car.body,van],true,d=>damage+=d);p.step();assert.equal(damage,0);van.collider.setEnabled(false);p.step();director.update(1/60,2,player,[car.body],true,d=>damage+=d);p.step();assert.ok(damage>0);p.world.free();
});
