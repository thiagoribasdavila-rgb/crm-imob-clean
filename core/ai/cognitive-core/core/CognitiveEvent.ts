export interface CognitiveEvent {

    id:string;

    type:
    | "INPUT"
    | "MEMORY"
    | "REASONING"
    | "DECISION"
    | "ACTION";

    payload: unknown;

    timestamp: Date;
}
