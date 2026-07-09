export class FeedbackLoop {


process(

result:any

){


return {


learned:

true,


improvement:

"Atualizar recomendação da IA"


};


}


}



export const feedbackLoop =
new FeedbackLoop();
