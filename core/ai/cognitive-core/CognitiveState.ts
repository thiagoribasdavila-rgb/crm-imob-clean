export interface CognitiveState {

    entityId: string;

    entityType:
    | "lead"
    | "customer"
    | "property"
    | "market"
    | "business";

    context: Record<string, any>;

    memories: any[];

    predictions: any[];

    decisions: any[];

    confidence: number;

    updatedAt: Date;
}
