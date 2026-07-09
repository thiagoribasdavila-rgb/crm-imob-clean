export interface NeighborhoodData {


name:string;


averagePriceM2:number;


demandScore:number;


growthPotential:number;


}



export class NeighborhoodGraph {


private neighborhoods:
NeighborhoodData[]=[];



add(
data:NeighborhoodData
){

this.neighborhoods.push(data);

}



analyze(
name:string
){


return this.neighborhoods.find(

item=>

item.name===name

);


}


}


export const neighborhoodGraph =
new NeighborhoodGraph();
