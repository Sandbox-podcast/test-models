import type { Point } from './level';

export type ActivityStop={at:Point;label:string;kind:'pass'|'park'|'use'};
type Activity={name:string;district:number;start:Point;vehicle:boolean;time:number;reward:number;
  description:string;stops:ActivityStop[];cargo?:boolean;};
const pass=(at:Point,label:string):ActivityStop=>({at,label,kind:'pass'});
const park=(at:Point,label:string):ActivityStop=>({at,label,kind:'park'});
const use=(at:Point,label:string):ActivityStop=>({at,label,kind:'use'});

export const activities={
  sprint:{name:'Tour des ateliers',district:0,start:[-42,42.7],vehicle:true,time:53,reward:165,
    description:'Validez les huit points de passage en voiture. Le meilleur temps est conservé.',stops:[
      pass([-26,42.7],'Rue basse'),pass([0,42.7],'Parvis des ateliers'),pass([30,42.7],'Traversée est'),pass([44.8,28],'Avenue sud'),
      pass([45,11],'Virage du dépôt'),pass([29,-2.4],'Avenue centrale'),pass([-14,-2.4],'Les anciennes halles'),pass([-43,-2.4],'Arrivée'),]},
  shuttle:{name:'Navette du coteau',district:1,start:[104.8,5.4],vehicle:true,time:77,reward:175,
    description:'Prenez une passagère en voiture, passez par le parvis et déposez-la au terminus. Marquez un arrêt à chaque halte.',stops:[
      park([104.2,17],'Attendre la passagère'),park([117,43.3],'Déposer un colis au parvis'),park([142.2,30],'Déposer la passagère'),]},
  relays:{name:'Relève des balises',district:2,start:[187,9.4],vehicle:false,time:68,reward:145,
    description:'Parcourez le parvis à pied et vérifiez les trois balises avec E.',stops:[
      use([192.8,8.9],'Tester la balise ouest'),use([201.5,9.6],'Tester la balise du parvis'),use([217,12.8],'Tester la balise de relève'),]},
  cargo:{name:'Chargement fragile',district:3,start:[80,-76.6],vehicle:true,time:84,reward:190,cargo:true,
    description:'Chargez les colis devant la halle et livrez-les à La Dalle. Les chocs diminuent le bonus de 75 ₡.',stops:[
      park([106,-76.2],'Charger les colis'),pass([139,-76.6],'Quitter les Quais'),pass([154,-52.5],'Remonter vers La Dalle'),
      park([144,-10],'Décharger les colis'),]},
  photos:{name:'Carnet des remparts',district:4,start:[129,63],vehicle:false,time:0,reward:125,
    description:'Suivez la promenade et utilisez E aux trois points de vue pour compléter le carnet.',stops:[
      use([143.3,66.8],'Photographier le coteau'),use([163,77],'Photographier les terrasses'),use([193,79],'Photographier la ceinture'),]},
} satisfies Record<string,Activity>;
export type ActivityId=keyof typeof activities;
export const activityIds=Object.keys(activities) as ActivityId[];
export type ActivityRecord={count:number;best:number};
export type ActivityHistory=Partial<Record<ActivityId,ActivityRecord>>;
export type ActivityRun={id:ActivityId;step:number;started:number;stationary:number;condition:number;car:string|null};
export const activitySpec=(id:ActivityId):Activity=>activities[id];
