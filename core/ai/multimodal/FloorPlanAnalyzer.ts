export class FloorPlanAnalyzer {


analyze(

plan:string

){


return {


rooms:[

"sala",

"cozinha",

"dormitórios"

],


profile:

"família ou investidor"


};


}


}


export const floorPlanAnalyzer =
new FloorPlanAnalyzer();
