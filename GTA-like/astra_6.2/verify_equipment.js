async()=>{
 const {rooms}=await import('/src/rooms.ts'),{weapons,vehicles,houses}=await import('/src/equipment.ts');
 const {p,distance,sites}=level,issues=[],tested=[];const check=(v,msg)=>{if(!v)throw Error(msg)};
 Object.assign(g.save,quest.fresh());g.restore();g.paused=false;const st=g.streets;
 const room=id=>rooms.find(r=>r.id===id);
 const choose=(text)=>{const button=[...document.querySelectorAll('#modal button')].find(b=>b.textContent.includes(text));check(button,'Choix absent · '+text+' / '+document.querySelector('#modal').innerText);button.click()};
 const walk=dest=>{const path=st.path(g.q,dest);check(path.length,'Destination inaccessible '+JSON.stringify([g.q,dest,g.car,Array.from({length:16},(_,i)=>{const q=p(g.q.x+(dest.x-g.q.x)*i/15,g.q.z+(dest.z-g.q.z)*i/15);return [q.z,st.vacant(q),level.ground(q.x,q.z),st.obstacles.filter(o=>level.inside(q,o,.45)).map(o=>[o.kind||o.name||o.id,o.x,o.z])]})]));
  for(const point of path){let i=0;for(;distance(g.q,point)>.105&&i<400;i++){const dx=point.x-g.q.x,dz=point.z-g.q.z;g.keys.clear();if(Math.abs(dx)>.055)g.keys.add(dx>0?'d':'a');if(Math.abs(dz)>.055)g.keys.add(dz>0?'s':'w');g.simulate(1/60)}
   check(i<400,'Passage bloqué '+JSON.stringify([g.q,point]))}g.keys.clear()};
 const open=()=>{g.paused=false;g.interact()};
 const enter=r=>{teleport(p(r.entrance.x,r.entrance.z+1));g.paused=false;walk(p(r.entrance.x,r.building.z));walk(r.counter)};
 const leave=r=>{walk(p(r.entrance.x,r.building.z));walk(p(r.entrance.x,r.entrance.z+1.15))};
 try{
  let inv=g.save.inventory;
  for(const r of rooms)for(const f of r.fittings)check(!st.vacant(f),'Mobilier traversable · '+r.id+' / '+f.label);
  enter(room('arms'));open();choose('Carabine à arc');check(!inv.ammo.arc&&g.save.money===0,'Refus de paiement');
  g.save.money=5000;
  for(const id of ['arc','prisme']){const w=weapons[id],before=g.save.money;open();choose(w.name+' · '+w.price);check(inv.weapon===id&&g.save.money===before-w.price,'Achat '+id);
   g.paused=false;g.aim=p(g.q.x+10,g.q.z);g.gun=0;g.shoot();check(g.ammo.loaded===w.capacity-1,'Tir '+id);g.shoot();check(g.ammo.loaded===w.capacity-1,'Cadence '+id);
   const reserve=g.ammo.reserve;g.reload();check(g.reloadTime>0,'Rechargement '+id);for(let i=0;i<125;i++)g.simulate(1/60);
   check(g.ammo.loaded===w.capacity&&g.ammo.reserve===reserve-1,'Transfert réserve '+id);
   const cash=g.save.money;open();choose(w.name+' · '+w.pack+' munitions');check(g.save.money===cash-w.packPrice&&g.ammo.reserve===reserve-1+w.pack,'Achat de munitions '+id);
  }
  g.ammo.loaded=0;g.ammo.reserve=0;g.gun=0;g.shoot();check(g.ammo.loaded===0&&g.reloadTime===0,'Chargeur vide');g.cycleWeapon();check(g.save.inventory.weapon==='courier','Changement d’arme');leave(room('arms'));tested.push('Armes, cadence, rechargement et munitions');
  for(const id of ['gabare','veloce']){
   const dealer=room('dealer'),v=vehicles[id];enter(dealer);const cash=g.save.money;open();choose('Acheter '+v.name);
   check(inv.garage.includes(id)&&inv.vehicle===id&&g.save.money===cash-v.price&&st.model===id,'Achat véhicule '+id);
   leave(dealer);walk(p(g.car.x+v.width/2+.85,g.car.z));open();check(g.driving,'Monter '+id);
   const start={...g.car};g.keys.add('w');for(let i=0;i<48;i++)g.simulate(1/60);g.keys.clear();check(distance(start,g.car)>1.1,'Conduite '+id);g.keys.add(' ');for(let i=0;i<70;i++)g.simulate(1/60);g.keys.clear();g.exitCar();check(!g.driving&&g.canWalkAway(g.q),'Sortie '+id)
  }
  enter(room('dealer'));const balance=g.save.money;open();choose('Sortir Gabare');check(g.save.money===balance&&inv.vehicle==='gabare','Récupérer un véhicule possédé');leave(room('dealer'));tested.push('Parc automobile, mise à disposition, conduite et stationnement');
  for(const id of ['cour','terrasse']){const r=room(id),d=r.door;teleport(r.entrance);g.paused=false;
   check(!st.vacant(p(d.x,d.z)),'Porte privée avant achat');open();const before=g.save.money;choose('Acheter ·');check(g.save.money===before-houses[id].price&&inv.homes.includes(id)&&st.vacant(p(d.x,d.z)),'Acquisition des clés '+id);
   walk(p(r.entrance.x,r.building.z));walk(r.counter);open();choose('Choisir comme domicile');g.health=67;open();choose('Se reposer');check(g.health===100&&inv.home===id,'Repos et domicile '+id);leave(r);g.restore();check(distance(g.q,r.bed)<.15,'Réapparition au domicile '+id)
  }
  const saved=quest.readSave();window.purchasedSnapshot=structuredClone(saved);check(saved.money===g.save.money&&saved.inventory.home==='terrasse'&&saved.inventory.garage.length===3&&Object.keys(saved.inventory.ammo).length===3,'Possessions persistantes');
  enter(room('cafe'));g.health=60;open();choose('Repas');check(g.health===95,'Café ouvert');leave(room('cafe'));tested.push('Cinq intérieurs, deux logements, repos et sauvegarde');
  const victim=g.people.find(n=>!n.guard&&n.flow!==undefined);teleport(p(32,45));g.aim=p(32,51);g.paused=false;st.setParked(g.car,g.carAngle,false);
  for(const id of ['arc','prisme']){g.equipWeapon(id);g.ammo.loaded=2;victim.q=p(32,48);victim.hp=150;victim.indoors=false;const count=g.view.flashIndex;g.gun=0;g.shoot();
   check(victim.hp<150&&g.ammo.loaded===1&&g.view.flashIndex-count===weapons[id].spread.length,'Impact et tracés '+id)}
  g.view.lighting.update(g.q,.02,241,true,true);check(g.view.lighting.head.intensity>0&&g.view.lighting.flash.intensity>0,'Phare et flash');
  tested.push('Tirs distincts, impacts, faisceaux et flash');
  g.startJob('chip');const money=g.save.money;g.safeTrail=[];teleport(p(78,52));g.paused=false;for(let i=0;i<100;i++)g.simulate(1/60);check(g.canWalkAway(g.q)&&g.job==='chip'&&g.save.money===money,'Récupération automatique dans un solide');
  teleport(p(-90,-300));g.safeTrail=[];g.recover();check(g.canWalkAway(g.q)&&g.job==='chip','Récupération hors limites');teleport(p(401,13));g.safeTrail=[p(399,13)];g.recover(true);check(distance(g.q,sites.spawn)<26&&g.canWalkAway(g.q)&&g.job==='chip','Dépannage vers le garage depuis une cour fermée');
  teleport(p(-70,-307));g.car={...g.q};g.driving=true;st.setParked(g.car,g.carAngle,false);g.recover();
  check(!g.driving&&g.canWalkAway(g.q)&&level.inCity(g.car),'Récupération du véhicule et du joueur');tested.push('Dégagement à pied et en voiture dans le décor et hors limites');
 }catch(e){issues.push(e.message)}finally{Object.assign(g.save,quest.fresh());quest.writeSave(g.save);g.restore();g.pause()}
 return {issues,tested}
}
