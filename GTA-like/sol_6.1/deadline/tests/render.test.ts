import{test}from'node:test';import assert from'node:assert/strict';import{makeCar,applyCarDamage,repairCar}from'../src/world/render.ts';
test('car impacts stay local, use bounded pools and repair restores the lamps',()=>{
 const car=makeCar();car.position.set(50,6,20);const children=car.children.length;
 for(let i=0;i<100;i++)applyCarDamage(car,{id:'wall',speed:20,point:{x:50.7,y:6.7,z:22},normal:{x:0,y:0,z:-1},side:'front',severity:3,newContact:true});
 assert.equal(car.children.length,children);assert.equal(car.userData.damage.front,3);assert.equal(car.userData.lamps.visible,false);assert.equal(car.userData.damageMarks.length,12);assert.equal(car.userData.dents.length,8);assert.ok(car.userData.damageMarks.every(m=>Math.abs(m.position.x)<1&&Math.abs(m.position.z)<2.3));
 repairCar(car);assert.ok(car.userData.lamps.visible);assert.ok([...car.userData.damageMarks,...car.userData.dents].every(m=>!m.visible));assert.deepEqual(car.userData.damage,{front:0,rear:0,left:0,right:0});
});
