export interface CognitiveContext {

    user?: {
        id?: string;
        name?: string;
        profile?: string;
    };

    objective: string;

    environment: {
        channel?: string;
        source?: string;
        metadata?: Record<string, unknown>;
    };

    history?: unknown[];
}
