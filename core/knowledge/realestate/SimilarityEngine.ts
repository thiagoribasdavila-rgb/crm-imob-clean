export function calculateSimilarity(

profileA:string[],

profileB:string[]

){


const matches =
profileA.filter(

item=>

profileB.includes(item)

);



return {

score:

(matches.length /
Math.max(
profileA.length,
profileB.length
)
)*100


};


}
