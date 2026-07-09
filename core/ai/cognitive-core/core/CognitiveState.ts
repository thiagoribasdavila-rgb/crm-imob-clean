export interface CognitiveState {
    sessionId: string;
    userId?: string;

    context: Record<string, unknown>;

    memoryState: {
        shortTerm: unknown[];
        longTerm: unknown[];
    };

    confidence: number;

    createdAt: Date;
    updatedAt: Date;
}
