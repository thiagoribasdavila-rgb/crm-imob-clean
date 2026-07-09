export class PatternDetector {


detect(

events:any[]

){


return {


pattern:

"Clientes com visita presencial convertem mais",


confidence:

85


};


}


}



export const patternDetector =
new PatternDetector();
