import{test}from'node:test';import assert from'node:assert/strict';import * as T from'three';import RAPIER from'@dimforge/rapier3d-compat';
import{Population,periodAt}from'../src/world/population.ts';import{Physics}from'../src/world/physics.ts';import{SurfaceNavigation}from'../src/world/navigation.ts';import{LOC}from'../src/world/data.ts';import{distance}from'../src/world/geometry.ts';
await RAPIER.init();
function fixture(){const physics=new Physics(),nav=new SurfaceNavigation('foot'),population=new Population(physics,new T.Scene(),nav);physics.step();return{physics,population};}
test('time bands select different coherent destinations rather than changing only lighting',()=>{
 const {physics,population}=fixture();const c=population.citizens.find(c=>c.id==='forges-resident-1')!;c.index=c.path.length;c.wait=0;population.update(1/60,0,8,c.position,null);assert.ok(['atelier','livraison','arrêt de la gare'].includes(c.activity),c.activity);c.index=c.path.length;c.wait=0;population.update(1/60,1,21.5,c.position,null);assert.ok(['domicile','relais','arrêt de la gare'].includes(c.activity),c.activity);assert.equal(periodAt(8),'matin');assert.equal(periodAt(14),'journée');assert.equal(periodAt(21),'soirée');physics.world.free();
});
test('citizens seek refuge near an incident and resume ordinary activity afterwards',()=>{
 const {physics,population}=fixture();const c=population.citizens.find(c=>c.district==='forges')!,incident={point:{...c.position},until:20};population.update(1/60,0,21,c.position,incident);assert.equal(c.state,'refuge');assert.equal(c.activity,'cherche un refuge');c.index=c.path.length;population.update(1/60,21,21,c.position,null);assert.notEqual(c.state,'refuge');physics.world.free();
});
test('traffic actually travels toward its stops and brakes for a stationary person ahead',()=>{
 const {physics,population}=fixture(),car=population.traffic[0],start={...car.body.position};for(let i=0;i<120;i++){population.update(1/60,i/60,21,LOC.garage,null);physics.step();}assert.ok(distance(start,car.body.position)>.5,'no traffic displacement');
 car.speed=6;const ahead={x:car.body.position.x+Math.sin(car.angle)*2,y:car.body.position.y,z:car.body.position.z+Math.cos(car.angle)*2};for(let i=0;i<120;i++){population.update(1/60,2+i/60,21,ahead,null);physics.step();}assert.ok(car.speed<.2,`traffic speed ${car.speed}`);physics.world.free();
});
