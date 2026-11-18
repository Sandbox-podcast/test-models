import{test}from'node:test';import assert from'node:assert/strict';
import{freshSave,acceptQuest,completeQuest,resumeSave,decodeSave,openGates,QUESTS,QUEST_BY_ID,type QuestId,type Save}from'../src/story.ts';
function finish(s:Save,id:QuestId,decision?:'nadia'|'sorel'|'publish'|'restore'|'destroy'|'entrust'){s=acceptQuest(s,id);assert.equal(s.active?.id,id);s.active!.step=QUEST_BY_ID[id].steps.length-1;return completeQuest(s,decision);}
test('six missions unlock in order and both routes allow both canonical endings',()=>{
 for(const route of ['nadia','sorel']as const)for(const ending of ['publish','restore']as const){let s=freshSave();assert.equal(acceptQuest(s,'M03'),s);for(const id of ['M01','M02','M03']as const)s=finish(s,id);s=finish(s,'M04',route);assert.equal(s.route,route);assert.equal(s.ending,null);assert.ok(openGates(s).has(route==='nadia'?'gallery':'badge'));s=finish(s,'M05');s=finish(s,'M06',ending);assert.deepEqual(s.completed,['M01','M02','M03','M04','M05','M06']);assert.equal(s.ending,ending);assert.equal(s.money,3120);assert.deepEqual(decodeSave(JSON.stringify(s)),s);}
});
test('unique quests persist their own visible consequences without determining the final ending',()=>{
 let s=freshSave();for(const id of ['M01','M02','M03']as const)s=finish(s,id);for(const id of ['U01','U02','U03','U04']as const)s=finish(s,id,id==='U03'?'entrust':undefined);assert.equal(s.nightChoice,'entrust');assert.ok(s.flags.includes('shortcutLit'));assert.ok(s.flags.includes('residence'));assert.ok(s.flags.includes('annotatedMap'));assert.equal(s.ending,null);assert.equal(acceptQuest(s,'U01'),s);
 s=finish(s,'M04','sorel');s=finish(s,'M05');s=finish(s,'M06','restore');s=finish(s,'U05');assert.ok(openGates(s).has('exit'));
});
test('one active contract, one payment per accepted offer and new IDs on repetition',()=>{
 let s=finish(freshSave(),'M01');s=acceptQuest(s,'C01-F');assert.equal(s.active?.offerId,'C01-F:0');assert.equal(acceptQuest(s,'C02-F'),s);s=completeQuest(s);const credited=s.money;assert.equal(completeQuest(s),s);s=acceptQuest(s,'C01-F');assert.equal(s.active?.offerId,'C01-F:1');s=completeQuest(s);assert.equal(s.money,credited+120);assert.deepEqual(s.rewarded,['M01','C01-F:0','C01-F:1']);
});
test('reloading an active sequence restores its briefing and retains its accepted occurrence',()=>{
 let s=finish(freshSave(),'M01');s=acceptQuest(s,'C04-Q');s.active!.step=1;s.active!.elapsed=45;const r=resumeSave(decodeSave(JSON.stringify(s)));assert.equal(r.active?.step,0);assert.equal(r.active?.offerId,'C04-Q:0');assert.equal(r.active?.elapsed,0);assert.equal(r.money,s.money);assert.deepEqual(r.flags,s.flags);
});
test('legacy progress is migrated without erasing credits or inventing the replacement ending',()=>{
 const legacy={version:1,money:2470,ghost:'complete',registry:'complete',node:'complete',side:'complete',route:'collective',ending:'destroy',implants:['intrusion','lure']};const s=decodeSave(null,JSON.stringify(legacy));assert.equal(s.money,2470);assert.ok(s.completed.includes('M05'));assert.ok(!s.completed.includes('M06'));assert.equal(s.ending,null);assert.equal(s.route,'nadia');assert.ok(s.rewarded.includes('M06'));assert.ok(s.flags.includes('legacyEnding'));const r=finish(s,'M06','publish');assert.equal(r.money,2470);assert.equal(r.ending,'publish');
});
test('all quest stages reference real points and corruption recovers safely',()=>{
 for(const q of QUESTS){assert.ok(q.steps.length>=1);assert.ok(q.reward>0);for(const s of q.steps)assert.ok(s.at);}
 for(const raw of ['oops','{}',JSON.stringify({...freshSave(),money:-1}),JSON.stringify({...freshSave(),active:{id:'unknown',step:0,offerId:'bad'}})])assert.deepEqual(decodeSave(raw),freshSave());
});
