import {
ReasoningContext
}
from "./ReasoningContext";



export class RecommendationEngine {



recommend(

context:ReasoningContext

){


return {


action:

context.propertiesViewed.length > 0

?

"Enviar imóveis semelhantes"

:

"Apresentar novos empreendimentos"



};


}


}



export const recommendationEngine =
new RecommendationEngine();
