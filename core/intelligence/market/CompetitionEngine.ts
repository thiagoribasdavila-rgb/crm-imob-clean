export class CompetitionEngine {


analyze(

competitors:number

){


return {


competitionLevel:

competitors > 10

?

"Alta"

:

"Moderada",



};


}


}


export const competitionEngine =
new CompetitionEngine();
