export class ResourceOptimizer {


optimize(

team:number

){


return {


recommendation:

team < 5

?

"Contratar corretores"

:

"Equipe adequada"


};


}


}


export const resourceOptimizer =
new ResourceOptimizer();
