export type EntityType =

"customer"
|
"property"
|
"neighborhood"
|
"developer"
|
"broker"
|
"campaign"
|
"market";



export interface Entity {


id:string;


type:EntityType;


name:string;


metadata?:Record<string,any>;


createdAt:Date;


}
