export function investmentScore(

demand:number,

growth:number,

inventory:number

){


return Math.round(

(
demand +
growth +
(100-inventory)

)/3

);


}
