export type RealEstateEntityType =

"property"
|
"unit"
|
"developer"
|
"neighborhood"
|
"buyer"
|
"broker"
|
"campaign"
|
"market";


export interface RealEstateEntity {


id:string;


type:RealEstateEntityType;


name:string;


attributes?:Record<string,any>;


createdAt:Date;


}
