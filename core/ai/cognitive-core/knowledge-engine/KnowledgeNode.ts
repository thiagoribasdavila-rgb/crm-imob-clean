export interface KnowledgeNode {

    id:string;

    type:
    | "PROPERTY"
    | "CUSTOMER"
    | "MARKET"
    | "CONTRACT"
    | "CAMPAIGN"
    | "EVENT"
    | "DOCUMENT";


    data:Record<string,unknown>;


    relationships:string[];


    confidence:number;


    createdAt:Date;

}
