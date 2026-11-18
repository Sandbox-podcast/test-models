import type { Point } from './level';

export type CivilFlow = {
  district: number;
  label: string;
  role: 'transit' | 'work' | 'wait' | 'social';
  route: Point[];
  count: number;
  day?: Point[];
  evening?: Point[];
  civic?: boolean;
};

export const civilFlows: CivilFlow[] = [
  {district:0,label:'Ateliers',role:'work',count:3,route:[[-29.5,23.8],[-25.8,24.2],[-23.4,26.1]],evening:[[-29.5,23.8],[-32.1,25],[-32.7,29]]},
  {district:0,label:'Arrêt des Forges',role:'wait',count:3,route:[[-40.7,6.85],[-33.7,6.85],[-29.7,8]],day:[[-22.5,8.6],[-18.8,8.3],[-15.7,7.4]]},
  {district:0,label:'Livraisons',role:'transit',count:4,route:[[-11.5,6.9],[1.5,6.9],[11.3,6.7],[22.2,6.2],[35.2,6.3]]},
  {district:0,label:'Rue du dépôt',role:'transit',count:3,route:[[6.3,-6.8],[21,-6.8],[33.8,-6.8],[39,-7.4]]},
  {district:0,label:'Rue basse',role:'transit',count:3,route:[[-24.7,-52.1],[-8.7,-52.1],[6.9,-53.3],[17.7,-53.6],[32,-53.8]]},
  {district:1,label:'École',role:'transit',count:5,route:[[72,7.2],[81.3,7.4],[86.6,11.1],[96.7,13.5]],evening:[[72,7.2],[77.7,8.7],[86.3,12.2],[89.8,15.6]]},
  {district:1,label:'Paliers résidentiels',role:'transit',count:5,route:[[94,-33],[95,-20],[96,-10],[97,-7],[98,7],[97,13]]},
  {district:1,label:'Permanence de Nadia',role:'wait',count:5,route:[[108.2,8.2],[112,9.3],[114.5,10],[115.6,10.4]],evening:[[108.2,8.2],[111.2,12.5],[118.4,14.6],[123.2,15.1]]},
  {district:1,label:'Commerces du coteau',role:'social',count:4,route:[[87.3,-8.6],[86.6,-9.7],[88.5,-11]],day:[[87,-8.8],[91,-9.2],[94,-8.6]]},
  {district:1,label:'Maisons civiles',role:'transit',count:4,route:[[127,-8.4],[129.2,-8.7],[134,-8.4],[137.2,-7.1],[142.8,-6]]},
  {district:2,label:'Guichets Civis',role:'wait',count:6,civic:true,route:[[162.3,7.2],[165.6,8.1],[168.4,8.8],[174.3,11.4]],evening:[[166,7.4],[169.8,8.3],[173.2,10.6],[175.5,11.3]]},
  {district:2,label:'Équipe de relève',role:'transit',count:4,civic:true,route:[[187,-6.6],[192,-7.4],[203,-7.4],[211.7,-7.5],[218.5,-7.6]]},
  {district:2,label:'Parvis',role:'social',count:4,route:[[191,8.2],[193.2,9.1],[196.5,9.7],[200.9,9]]},
  {district:2,label:'Archives municipales',role:'transit',count:4,route:[[187,6.6],[200,6.6],[208,7],[216.5,7.2],[219.5,12]]},
  {district:3,label:'Papeterie',role:'work',count:4,route:[[66,-85.4],[72,-85.3],[77.2,-85.6],[79.4,-83.7]]},
  {district:3,label:'Halle des Quais',role:'wait',count:5,route:[[95,-80.6],[99,-80.55],[105,-80.7],[112,-80.7]],evening:[[95,-81.2],[94,-89.3],[92,-96],[97.3,-102]]},
  {district:3,label:'Marché',role:'social',count:5,route:[[98,-95.9],[104,-95.8],[113.6,-94.8],[116.2,-94.8]],evening:[[98,-95.9],[97,-101.9],[109,-103.8],[117,-104.5]]},
  {district:3,label:'Promenade basse',role:'transit',count:6,route:[[56,-102.4],[76,-104.2],[104,-105.2],[123.5,-104.3],[145,-102.7]]},
  {district:3,label:'Rampe de manutention',role:'work',count:3,route:[[139,-82.9],[140,-90.8],[143.5,-96.8]]},
  {district:4,label:'Maison de quartier',role:'transit',count:4,route:[[113,59],[122,61.3],[132,62.8],[140.2,65],[150,68.9]]},
  {district:4,label:'Terrasse des remparts',role:'social',count:5,route:[[163,76.4],[167.3,76.8],[175.1,77.3],[178.7,77.7]],evening:[[163,76.4],[169.2,79.4],[177,81.4],[183.6,82.1]]},
  {district:4,label:'Kiosque',role:'wait',count:3,route:[[207,75.2],[204,75.6],[199.1,77.8]]},
  {district:4,label:'Promenade du belvédère',role:'transit',count:5,route:[[175.6,79.6],[183.6,80.8],[194,79.9],[205,82],[210.3,80.8]]},
];

export const populationHour = (time: number) => (6+time/12)%24;
export function populationPeriod(time: number) {
  const hour=populationHour(time);
  return hour>=5 && hour<12 ? 'morning' : hour>=12 && hour<19 ? 'day' : 'evening';
}

type VehicleRoute = { id:string; stops:Point[]; count:number; spacing:number; speed:number; };
export const vehicleRoutes: VehicleRoute[] = [
  {id:'forges-avenue',count:3,spacing:32,speed:9.4,stops:[
    [-46,-2.4],[-27,-2.4],[6,-2.4],[27,-2.4],[40,-1.6],[45.2,4.3],[45.2,16],[44.6,34],
    [40.3,42.7],[23,42.7],[0,42.7],[-25,42.7],[-44,42.7],[-51,37.7],[-51,24],[-51,10],[-51,.3],
  ]},
  {id:'dalle-coteau',count:2,spacing:26,speed:8.1,stops:[
    [68,-1.1],[80,.5],[94,-1.8],[112,-.3],[121,.6],[136,-.7],[142.7,2.1],[142.7,15],[142.6,31],[141.8,40.8],
    [134,43.5],[119,43.5],[108,43.5],[104,38],[104,22],[104,9],[100,3],[81,3.6],[70,2.5],
  ]},
  {id:'noeud-service',count:4,spacing:47,speed:8.8,stops:[
    [176.8,-2.3],[192,-2.3],[216,-2.3],[224,2],[225,14],[225,32],[224,40],[218,44.8],
    [204,44.8],[185,44.8],[175,44.1],[171.5,38.8],[171.5,22],[171.5,7],
  ]},
  {id:'quais-haut',count:3,spacing:29,speed:7.6,stops:[
    [57,-72.8],[70,-76],[88,-78.8],[109,-78.8],[133,-78.8],[143,-77.5],[146.2,-75.4],[141,-73.9],
    [128,-74.4],[106,-74.5],[85,-74.5],[70,-73.2],[59,-69.8],[55.8,-70.5],
  ]},
  {id:'belvederes-lacets',count:2,spacing:52,speed:8.1,stops:[
    [111,64.4],[120,71],[132,75.6],[145,80.4],[158,87.3],[174,92.4],[190,91.3],[206,88],[218,79.7],
    [222.8,73],[225.6,71],[226,75],[221,83],[208,92.1],[193,94.8],[174,96],[156,91.8],[142,83.8],[128,78.9],[115,72.9],[109,67.9],
  ]},
];
