export class VideoAnalyzer {


analyze(

video:string

){


return {


scenes:[

"fachada",

"área comum",

"apartamento"

],


suggestion:

"Criar campanha de lifestyle"


};


}


}


export const videoAnalyzer =
new VideoAnalyzer();
