import type { ValidateFunction } from "ajv";
import Ajv, { type ErrorObject } from "ajv";
import type { JSONSchema7 } from "json-schema";

import { ABI_DEFINITIONS, ABI_NODES, type NodeSlot } from "@/generated/abi";

/** Platform routing keys: validated separately by API / runner, not ABI input schemas. */
const ROUTING_KEYS = ["pluginId", "nodeSlot"] as const;

const ajvSingleton = new Ajv({
    allErrors: true,
    strict: false,
});

type AbiDirection = "input" | "output";

const compileCache = new Map<string, ValidateFunction>();

function normalizeSchemaRoot(slot: NodeSlot, direction: AbiDirection): object {
    const fragment =
        direction === "input"
            ? ABI_NODES[slot].inputs
            : ABI_NODES[slot].outputs;

    const defsUnknown = ABI_DEFINITIONS as Record<string, JSONSchema7>;
    return {
        $defs: defsUnknown,
        ...(fragment as Record<string, unknown>),
    };
}

function compileSlotValidator(slot: NodeSlot, direction: AbiDirection) {
    const key = `${slot}:${direction}`;
    let fn = compileCache.get(key);
    if (fn) return fn;

    fn = ajvSingleton.compile(normalizeSchemaRoot(slot, direction));
    compileCache.set(key, fn);
    return fn;
}

/** Shallow copy omitting platform routing (`routing`, `pluginId`, `nodeSlot`). ABI payloads are plain data. */
export function extractAbiBusinessInput(
    params: Record<string, unknown>,
): Record<string, unknown> {
    const out = { ...params };
    delete out.routing;
    for (const k of ROUTING_KEYS) {
        delete out[k];
    }
    return out;
}

export type AbiValidationFailure = {
    errorsText: string;
    ajvErrors: ErrorObject[] | undefined;
};

/** ABI validation failure thrown from runners (workflow callApi parity with HTTP 400 body). */
export class AbiValidationError extends Error {
    readonly kind: "input" | "output";
    readonly nodeSlot: NodeSlot;
    readonly failure: AbiValidationFailure;

    constructor(
        kind: "input" | "output",
        nodeSlot: NodeSlot,
        failure: AbiValidationFailure,
    ) {
        super(
            kind === "input"
                ? `ABI input validation failed (${nodeSlot}): ${failure.errorsText}`
                : `ABI output validation failed (${nodeSlot}): ${failure.errorsText}`,
        );
        this.name = "AbiValidationError";
        this.kind = kind;
        this.nodeSlot = nodeSlot;
        this.failure = failure;
    }
}

export function isAbiValidationError(e: unknown): e is AbiValidationError {
    return e instanceof AbiValidationError;
}

function buildFailure(errors: unknown): AbiValidationFailure {
    const errs = errors as ErrorObject[] | undefined;
    const errorsText =
        ajvSingleton.errorsText(errs || undefined, { separator: "\n" }) ||
        "ABI JSON Schema validation failed";
    return {
        errorsText,
        ajvErrors: errs,
    };
}

export function validateSlotInput(
    slot: NodeSlot,
    data: unknown,
): { ok: true } | { ok: false; failure: AbiValidationFailure } {
    const validate = compileSlotValidator(slot, "input");
    if (validate(data)) return { ok: true };
    return { ok: false, failure: buildFailure(validate.errors) };
}

export function validateSlotOutput(
    slot: NodeSlot,
    data: unknown,
): { ok: true } | { ok: false; failure: AbiValidationFailure } {
    const validate = compileSlotValidator(slot, "output");
    if (validate(data)) return { ok: true };
    return { ok: false, failure: buildFailure(validate.errors) };
}

/** One failed workflow node; `summary` is that node's short text (distinct from envelope `SerializedTaskError.message`). */
export type SerializedWorkflowFailure = {
    nodeId: string;
    summary: string;
    validationKind?: "input" | "output";
    nodeSlot?: NodeSlot;
    details?: string;
    ajvErrors?: ErrorObject[] | undefined;
};

/** Uniform JSON persisted to `tasks.error`; UI reads `message`. */
export type SerializedTaskError = {
    message: string;
    failures?: SerializedWorkflowFailure[];
    ajvErrors?: ErrorObject[] | undefined;
};

export function serializeTaskErrorForDb(e: SerializedTaskError): string {
    return JSON.stringify(e);
}

export function standaloneAbiValidationEnvelope(
    failure: AbiValidationFailure,
): SerializedTaskError {
    return {
        message: failure.errorsText,
        ajvErrors: failure.ajvErrors,
    };
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
