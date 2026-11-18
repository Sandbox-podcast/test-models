import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { activityIds, activitySpec } from '../src/activities';
import { DrivingNetwork } from '../src/driving-network';
import { distance, districtAt, type Point } from '../src/level';
import { Physics } from '../src/physics';
import { onStreet, ribbons } from '../src/roads';

await R.init();
const physics=new Physics(), network=new DrivingNetwork(physics);
const districts:Point[]=[[-22,0],[105,0],[202,0],[107,-77],[192,92]];
const node=(at:Point)=>{const first=network.nearby(at)[0];assert.ok(first,'Pas de nœud vers '+at);return first;};
for(const [i,a] of districts.entries()) for(const [j,b] of districts.entries()) {
  assert.equal(districtAt(...a),i);
  if(i===j) continue;
  const path=network.route(node(a),node(b));
  assert.ok(path.length>2,`Trajet police manquant entre les quartiers ${i} et ${j}`);
  assert.ok(path.every(at=>onStreet(...at)),`Hors chaussée entre ${i} et ${j}`);
}
for(const road of ribbons.filter(r=>!r.pedestrian)){
  const ends=[road.samples[0],road.samples.at(-1)!].map(({x,z})=>node([x,z]));
  for(const [from,to] of [ends,[...ends].reverse()]){
    const path=network.route(from,to);
    assert.ok(path.length>3,road.id+' sans connexion');
    for(const sample of road.samples.filter((_,i)=>i%5===0))
      assert.ok(path.some(at=>distance(at,[sample.x,sample.z])<5),road.id+' trajet dévie à '+sample.x+','+sample.z);
  }
}
for(const id of activityIds){
  const job=activitySpec(id);
  let at=job.start;
  for(const target of job.stops.map(stop=>stop.at)){
    if(job.vehicle){
      assert.ok(onStreet(...at)&&onStreet(...target),`${id} hors chaussée ${target}`);
      assert.ok(network.route(node(at),node(target)).length,`${id} arrêt inaccessible ${target}`);
    } else {
      assert.ok(physics.canStand(target),`${id} repère obstrué ${target}`);
      const path=physics.findRoute(at,target);
      let current=at;
      for(const next of path){
        const steps=Math.ceil(distance(current,next)/.15);
        for(let remain=steps;remain>0;remain--)
          current=physics.move(current,(next[0]-current[0])/remain,(next[1]-current[1])/remain).at;
      }
      assert.ok(distance(current,target)<.25,`${id} à pied bloqué ${at} vers ${target}`);
    }
    at=target;
  }
}
console.log('PASS · 20 trajets interquartiers, J01–J06 et P01 dans les deux sens, cinq parcours d’activité.');
