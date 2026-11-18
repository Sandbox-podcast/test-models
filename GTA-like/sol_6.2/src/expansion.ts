import type { Building, Point, Rect, Wall } from './level';
import type { Furniture } from './furniture';

export const extensionBlocks: Rect[] = [
  [65,-87.8,22,13],[92,-86,29,14],[125,-88,26,14],[91,-99,40,7],[131,-99,23,8],
  [129,57,28,13],[158,65,27,19],[174,81,18,14],[194,70,20,21],[208,98,24,11],
];
export const extensionBuildings: Building[] = [
  {id:'quais-hall',area:[108,-87,20,10],height:6.9,style:'workshop',sign:'HALLE DES QUAIS',accent:'#ffd087'},
  {id:'quais-storage',area:[128,-89.7,11,7.8],height:5,style:'brick',sign:'ENTREPÔT',accent:'#e4b581'},
  {id:'quais-workshop',area:[84,-85.5,7,7],height:5.3,style:'workshop',sign:'MANUTENTION',accent:'#f2c56c'},
  {id:'quais-canteen',area:[130,-99,8,4.4],height:3.9,style:'workshop',sign:'BUVETTE DE RIVE',accent:'#85dfc9'},
  {id:'belv-workshop',area:[124,55.7,10,6.7],height:4.9,style:'brick',sign:'ATELIERS DU COTEAU',accent:'#e0bf91'},
  {id:'belv-home',area:[151,59,16,12],height:8.2,style:'housing',sign:'MAISON DE QUARTIER',accent:'#efb486'},
  {id:'belv-cafe',area:[184,72,12,7.4],height:5.4,style:'housing',sign:'CAFÉ DES REMPARTS',accent:'#efad91'},
  {id:'belv-kiosk',area:[204,69,7.5,5.5],height:3.7,style:'workshop',sign:'KIOSQUE',accent:'#eda284'},
  {id:'belv-housing',area:[197,101,16,8],height:7.6,style:'housing',sign:'LES TERRASSES',accent:'#e9bda9'},
];

const rampRails: Wall[] = [];
for (const x of [37.15,48.85]) {
  for (let z=-45.5;z<=-32;z+=1) rampRails.push({area:[x,z,.24,1.04],height:.95,color:'#9a795a'});
}
export { rampRails };

export const extensionWalls: Wall[] = [
  ...rampRails,
  {area:[100,-111,111,.46],height:1.12,color:'#596974'},
  {area:[44.5,-96,.42,26],height:1.1,color:'#687778'},
  {area:[153.5,-92,.5,21],height:1.12,color:'#687778'},
  {area:[169,58,13,.54],height:1.35,color:'#b0a094'},
  {area:[185,59,14,.56],height:1.35,color:'#b0a094'},
  {area:[201,60.5,10,.56],height:1.35,color:'#b0a094'},
  {area:[167,104,28,.6],height:1.35,color:'#9a877b'},
  {area:[214,107,22,.6],height:1.35,color:'#9a877b'},
];
export const extensionNavigation: Point[] = [
  [43,-62],[55,-70],[64,-75],[77,-78],[99,-77],[119,-77],[142,-76],[152,-68],[155,-59],
  [155,-40],[151,-23],[145,-14],[144,-6],
  [57,-88],[54,-96],[55,-104],[64,-104],[80,-104],[101,-104],[118,-104],[140,-104],
  [144,-97],[137,-91],[126,-82],[108,-81],[93,-93],[96,-97],[118,-96],[124,-97],
  [106,51],[109,61],[124,72],[141,80],[157,88],[175,93],[193,92],[211,86],[223,73],[225,58],[225,43],[224,26],
  [113,59],[129,63],[141,65],[148,70],[163,77],[176,79],[193,79],[207,83],
  [124,-5.4],[126,0],[127,7.9],[136,8.7],[146,8.35],[156,8.65],[164,8.5],[169,6.8],[171,0],[172,-8.2],[174,-17.6],[175.5,-26],
];

export const extensionFurniture: Furniture[] = [
  ...([
    [58,-82],[74,-83.4],[92,-84.3],[119.6,-83.8],[136,-83.5],[50,-101],[78,-108.5],[106,-109],[137,-107],
    [105,70],[123,65.5],[135,88.2],[154,97.5],[178,102],[184,79.3],[203,80.4],[214,69.4],
  ] as Point[]).map((at,i):Furniture=>({id:'extension-lamp-'+i,at,size:[.32,3.65,.32],kind:'lamp',tint:i<9?'#d6c790':'#ffc398',fragile:true})),
  {id:'market-east',at:[119,-93],size:[3.3,2.38,1.9],kind:'stall',tint:'#9c5b58',fragile:true},
  {id:'market-west',at:[101,-94],size:[3.5,2.32,1.8],kind:'stall',tint:'#4b867e',fragile:true},
  {id:'market-lower',at:[104,-99],size:[3.2,2.3,1.75],kind:'stall',tint:'#887652',fragile:true},
  {id:'river-bench',at:[89,-108.3],size:[2.78,.85,.75],kind:'bench',tint:'#8c7160'},
  {id:'terrace-bench',at:[189,77.7],size:[2.75,.86,.71],kind:'bench',tint:'#93775c'},
  {id:'terrace-bench-west',at:[172,75.4],size:[2.65,.82,.69],kind:'bench',tint:'#93775c'},
  {id:'terrace-pot',at:[181,76.6],size:[1.4,.54,1.38],kind:'tree',tint:'#526652'},
];
