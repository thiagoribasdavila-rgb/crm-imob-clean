export class PriceEngine {


compare(

current:number,

market:number

){


const variation =
((current-market)/market)*100;


return {


variation,


status:

variation < 0

?

"Abaixo do mercado"

:

"Acima do mercado"


};


}


}


export const priceEngine =
new PriceEngine();
