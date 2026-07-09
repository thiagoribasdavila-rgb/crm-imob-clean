export interface MarketIndicator {


region:string;


inventory:number;


salesVelocity:number;


priceTrend:number;


}



export class MarketGraph {


private indicators:
MarketIndicator[]=[];



add(
indicator:MarketIndicator
){

this.indicators.push(indicator);

}



forecast(
region:string
){

return this.indicators.find(

item=>

item.region===region

);

}


}


export const marketGraph =
new MarketGraph();
