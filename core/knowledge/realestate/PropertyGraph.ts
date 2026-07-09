import {
RealEstateEntity
}
from "./RealEstateEntity";


export class PropertyGraph {


private properties:
RealEstateEntity[]=[];



addProperty(
property:RealEstateEntity
){

this.properties.push(property);

}



findByFeature(
feature:string
){


return this.properties.filter(

property =>

JSON.stringify(
property.attributes
)
.includes(feature)

);


}



list(){

return this.properties;

}


}


export const propertyGraph =
new PropertyGraph();
