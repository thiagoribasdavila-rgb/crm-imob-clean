export interface ReasoningContext {

    objective:string;

    data:any[];

    constraints?:any[];

    previousDecisions?:any[];

    environment?:Record<string,unknown>;

}
