export class RevenueSimulator {


calculate(

sales:number,

averageTicket:number

){


return {


revenue:

sales * averageTicket,


confidence:

85


};


}


}


export const revenueSimulator =
new RevenueSimulator();
