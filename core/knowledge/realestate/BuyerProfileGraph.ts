export interface BuyerProfile {


customerId:string;


incomeProfile:string;


preferredRegions:string[];


propertyTypes:string[];


budget:number;


}



export class BuyerProfileGraph {


private buyers:
BuyerProfile[]=[];



add(
profile:BuyerProfile
){

this.buyers.push(profile);

}



find(
customerId:string
){

return this.buyers.find(

buyer =>

buyer.customerId===customerId

);

}


}


export const buyerProfileGraph =
new BuyerProfileGraph();
