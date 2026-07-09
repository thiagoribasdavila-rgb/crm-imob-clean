export class ActionPlanner {


createPlan(

issue:string

){


return {


issue,


actions:[

"Analisar causa",

"Criar estratégia",

"Acompanhar resultado"

],


owner:

"gestor"


};


}


}


export const actionPlanner =
new ActionPlanner();
