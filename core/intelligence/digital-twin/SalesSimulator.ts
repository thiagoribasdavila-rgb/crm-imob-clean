export class SalesSimulator {


simulate(

leads:number,

conversion:number

){


return {


sales:

Math.floor(
leads * conversion
),


};


}


}


export const salesSimulator =
new SalesSimulator();
