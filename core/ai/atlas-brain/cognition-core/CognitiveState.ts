export interface CognitiveState {

    id:string;

    entityType:
    | "customer"
    | "lead"
    | "property"
    | "business"
    | "market";


    objective:string;


    attention:{
        priority:number;
        focus:string;
    };


    context:Record<string,unknown>;


    confidence:number;


    status:
    | "idle"
    | "processing"
    | "deciding"
    | "executing"
    | "learning";


    createdAt:Date;

    updatedAt:Date;

}
