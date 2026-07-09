export interface CognitiveMemory {

    id:string;

    type:
    | "SHORT_TERM"
    | "LONG_TERM"
    | "VECTOR"
    | "SEMANTIC";

    content: unknown;

    relevanceScore:number;

    createdAt:Date;
}
