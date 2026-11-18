import {test} from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';

test('Rapier sweep stops a vehicle at 115 km/h before a thin wall',async()=>{
 await RAPIER.init();
 const world=new RAPIER.World({x:0,y:0,z:0});world.timestep=1/60;
 world.createCollider(RAPIER.ColliderDesc.cuboid(.15,4,10).setTranslation(8,0,0));
 const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,.8,0).setCcdEnabled(true));
 const collider=world.createCollider(RAPIER.ColliderDesc.cuboid(.98,.65,2.05),body);
 const controller=world.createCharacterController(.08);world.step();
 for(let i=0;i<120;i++){const p=body.translation();controller.computeColliderMovement(collider,{x:32/60,y:0,z:0});const m=controller.computedMovement();body.setNextKinematicTranslation({x:p.x+m.x,y:p.y,z:p.z+m.z});world.step();}
 assert.ok(body.translation().x<6.95,`car crossed wall: ${body.translation().x}`);assert.ok(body.translation().x>6.6);world.free();
});
test('character controller slides along a wall instead of crossing or sticking',async()=>{
 await RAPIER.init();const world=new RAPIER.World({x:0,y:0,z:0});
 world.createCollider(RAPIER.ColliderDesc.cuboid(.5,4,15).setTranslation(4,0,0));
 const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,.9,0));const collider=world.createCollider(RAPIER.ColliderDesc.capsule(.38,.34),body);const controller=world.createCharacterController(.035);controller.setSlideEnabled(true);world.step();
 for(let i=0;i<90;i++){const p=body.translation();controller.computeColliderMovement(collider,{x:.1,y:0,z:.1});const m=controller.computedMovement();body.setNextKinematicTranslation({x:p.x+m.x,y:p.y,z:p.z+m.z});world.step();}
 assert.ok(body.translation().x<3.2);assert.ok(body.translation().z>8);world.free();
});
