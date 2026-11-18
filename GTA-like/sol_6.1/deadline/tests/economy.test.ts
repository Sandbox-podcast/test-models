import{test}from'node:test';import assert from'node:assert/strict';
import{freshInventory,purchase,reloadWeapon,consumeShot,decodeInventory,WEAPONS}from'../src/economy.ts';
import{freshSave,decodeSave,resumeSave}from'../src/story.ts';
test('purchases debit once, reject insufficient funds and persist independent ownership',()=>{
 let state={...freshSave(),money:5000};for(const offer of [{kind:'weapon',id:'smg'},{kind:'vehicle',id:'compact'},{kind:'home',id:'home-forges'}]as const){const old=state,result=purchase(state,offer);assert.ok(!result.error);state=result.state;assert.notEqual(state,old);assert.equal(purchase(state,offer).state,state);}
 assert.equal(state.money,3240);assert.ok(state.inventory.weapons.includes('smg'));assert.ok(state.inventory.vehicles.includes('compact'));assert.equal(state.inventory.home,'home-forges');assert.deepEqual(decodeSave(JSON.stringify(state)),state);
 assert.equal(purchase({...state,money:0},{kind:'weapon',id:'rifle'}).error,'Crédits insuffisants.');
});
test('ammunition is shared by calibre, transferred into magazines and conserved across reload and resume',()=>{
 let s={...freshSave(),money:1000};s=purchase(s,{kind:'weapon',id:'smg'}).state;const i=s.inventory;i.magazines.smg=0;assert.ok(reloadWeapon(i));assert.equal(i.magazines.smg,30);assert.equal(i.ammo['9mm'],42);assert.ok(consumeShot(i));assert.equal(i.magazines.smg,29);assert.ok(reloadWeapon(i));assert.equal(i.ammo['9mm'],41);assert.equal(i.magazines.pistol,12);assert.equal(i.ammo['12g'],0);
 i.magazines.smg=0;i.ammo['9mm']=0;assert.equal(reloadWeapon(i),false);assert.equal(consumeShot(i),false);assert.deepEqual(resumeSave(decodeSave(JSON.stringify(s))).inventory,i);
 const r=purchase(s,{kind:'ammo',id:'12g'});assert.equal(r.state.inventory.ammo['12g'],12);assert.equal(r.state.inventory.ammo['9mm'],0);
});
test('old saves gain starter possessions and corrupt inventory cannot create invalid equipment',()=>{
 const old=JSON.parse(JSON.stringify(freshSave()));delete old.inventory;assert.deepEqual(decodeSave(JSON.stringify(old)).inventory,freshInventory());
 const i=decodeInventory({weapons:['rifle','invalid'],vehicles:['sport','bad'],homes:['bad'],equipped:'smg',magazines:{pistol:-5,rifle:900},ammo:{'9mm':-5,'556':900}});assert.equal(i.equipped,'pistol');assert.equal(i.magazines.rifle,WEAPONS.rifle.capacity);assert.equal(i.ammo['556'],240);assert.deepEqual(i.homes,[]);
});
