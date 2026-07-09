export class DemandEngine {


calculate(

views:number,

leads:number,

visits:number

){


const score =
(
views +
leads*5 +
visits*10
);



return {


demandScore:
score


};


}


}


export const demandEngine =
new DemandEngine();
