import {test} from 'node:test';
import assert from 'node:assert/strict';
import {freshSave,decodeSave,resumeSave,finishGhost,finishRegistry,finishNode,reward} from '../src/campaign.ts';
test('first delivery commits the shortcut, chapter and reward exactly once',()=>{
 const finished=finishGhost({...freshSave(),ghost:'carrying'});
 assert.equal(finished.shortcut,true);assert.equal(finished.ghost,'complete');assert.equal(finished.chapter,2);assert.equal(finished.money,570);
 assert.deepEqual(finishGhost(finished),finished);assert.deepEqual(decodeSave(JSON.stringify(finished)),finished);
});
test('active missions resume at the briefing without duplicating stolen items',()=>{
 const save={...freshSave(),ghost:'carrying' as const,side:'carrying' as const,checkpoint:true};
 const resumed=resumeSave(decodeSave(JSON.stringify(save)));
 assert.equal(resumed.ghost,'accepted');assert.equal(resumed.side,'accepted');assert.equal(resumed.checkpoint,true);assert.equal(resumed.money,120);
});
test('both branches reach every ending and all rewards remain idempotent after reload',()=>{
 for(const route of ['sorel','collective']as const)for(const ending of ['publish','protect','destroy']as const){
  let s=finishGhost(freshSave());s=finishRegistry(s,route);assert.equal(s.route,route);s=finishNode(s,ending);
  const loaded=resumeSave(decodeSave(JSON.stringify(s)));
  assert.equal(loaded.ending,ending);assert.equal(loaded.chapter,4);assert.equal(loaded.money,2220);
  assert.deepEqual(finishNode(finishRegistry(finishGhost(loaded),route),ending),loaded);
 }
});
test('side reward cannot be duplicated and does not change the main chapter',()=>{
 const s=finishGhost(freshSave()),paid=reward(s,'side',250);assert.equal(paid.chapter,2);assert.equal(reward(paid,'side',250).money,820);
});
test('corrupt and incompatible saves recover to a valid new campaign',()=>{
 for(const raw of [null,'oops','{}','{"version":2}',JSON.stringify({...freshSave(),money:null}),JSON.stringify({...freshSave(),implants:['nope','lure']})])assert.deepEqual(decodeSave(raw),freshSave());
});
