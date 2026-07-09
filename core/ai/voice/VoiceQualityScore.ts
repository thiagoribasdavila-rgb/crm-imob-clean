export function calculateVoiceScore(

clarity:number,

empathy:number,

conversion:number

){


return Math.round(

(
clarity+
empathy+
conversion

)/3

);


}
