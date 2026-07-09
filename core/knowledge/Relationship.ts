export type RelationshipType =

"interested_in"
|
"located_in"
|
"similar_to"
|
"recommended_for"
|
"works_with"
|
"competes_with";



export interface Relationship {


from:string;


to:string;


type:RelationshipType;


weight:number;


createdAt:Date;


}
