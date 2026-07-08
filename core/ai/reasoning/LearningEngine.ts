export class LearningEngine {



learn(

event:string

){


return {


learned:true,


event,


timestamp:new Date()


};


}


}



export const learningEngine =
new LearningEngine();
