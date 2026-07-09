export interface KnowledgeMemory {


    id:string;


    embedding:number[];


    content:string;


    metadata:Record<string,unknown>;


    relevance:number;


    createdAt:Date;


}
