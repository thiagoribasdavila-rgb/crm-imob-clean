export class RealtimeEngine {


process(

event:any

){


return {


received:true,


event,


action:

"Atualizar inteligência Atlas"


};


}


}



export const realtimeEngine =
new RealtimeEngine();
