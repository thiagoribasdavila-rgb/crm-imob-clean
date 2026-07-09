export interface NeighborhoodProfile {


name:string;


priceM2:number;


demandScore:number;


lifestyleScore:number;


investmentScore:number;


}



export class NeighborhoodIntelligence {


analyze(
profile:NeighborhoodProfile
){


return {


region:
profile.name,


opportunity:

profile.investmentScore > 80

?

"Alta oportunidade"

:

"Mercado estável",



};


}


}



export const neighborhoodIntelligence =
new NeighborhoodIntelligence();
