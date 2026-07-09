export interface LearningMemory {


id:string;


event:string;


result:

"success"
|
"failure";


context:Record<string,any>;


impact:number;


createdAt:Date;


}
