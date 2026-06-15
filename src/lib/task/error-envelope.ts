/**
 * Task-error JSON shape persisted to `tasks.error` (sqlite TEXT column).
 *
 * This used to live alongside ABI runtime validation in `lib/schema/abi-schema-validate.ts`.
 * Now that the validator is gone (the contract is enforced statically by TS + the
 * generated Pydantic models on the plugin side), this is the only thing that
 * survives — a thin envelope for serializing task / workflow failures.
 */

/** One failed workflow node, captured inside `SerializedTaskError.failures`. */
export type SerializedWorkflowFailure = {
    nodeId: string;
    summary: string;
    details?: string;
};

/** Uniform JSON written to `tasks.error`; UI reads `message`. */
export type SerializedTaskError = {
    message: string;
    failures?: SerializedWorkflowFailure[];
};

export function serializeTaskErrorForDb(e: SerializedTaskError): string {
    return JSON.stringify(e);
}

export function workflowTaskFailureEnvelope(
    summaries: string[],
    failures: SerializedWorkflowFailure[],
): SerializedTaskError {
    return {
        message: summaries.join("; "),
        failures,
    };
}
