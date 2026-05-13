/**
 * Runtime ABI input validators (ajv-backed, lazily compiled and cached).
 *
 * Each ABI feature gets a per-input validator constructed from
 * `ABI_NODES[feature].inputs` with `ABI_DEFINITIONS` made available under
 * `$defs` for `$ref` resolution.
 *
 * Usage:
 *   const result = validateAbiInput("text-gen-speech-clone", prompt);
 *   if (!result.valid) { ...result.errors }
 */

import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";

import { ABI_DEFINITIONS, ABI_NODES, type NodeSlot } from "@/generated/abi";

let ajvInstance: Ajv | null = null;

function getAjv(): Ajv {
    if (ajvInstance) return ajvInstance;
    const ajv = new Ajv({
        allErrors: true,
        strict: false,
        allowUnionTypes: true,
        // Don't throw on unknown JSON Schema keywords (e.g. our `x-expand-each`).
        validateSchema: false,
    });
    ajvInstance = ajv;
    return ajv;
}

const validatorCache = new Map<NodeSlot, ValidateFunction>();

function compileValidator(feature: NodeSlot): ValidateFunction {
    const ajv = getAjv();
    const inputs = ABI_NODES[feature].inputs as Record<string, unknown>;
    const schema = {
        ...inputs,
        $defs: ABI_DEFINITIONS,
    };
    return ajv.compile(schema);
}

function getValidator(feature: NodeSlot): ValidateFunction {
    const cached = validatorCache.get(feature);
    if (cached) return cached;
    const v = compileValidator(feature);
    validatorCache.set(feature, v);
    return v;
}

export interface AbiValidationResult {
    valid: boolean;
    errors: AbiValidationError[];
}

export interface AbiValidationError {
    /** ABI input field path (e.g. "/text", "/options/duration"). */
    instancePath: string;
    /** Human-readable error message. */
    message: string;
    /** Raw ajv keyword (e.g. "required", "type", "minLength"). */
    keyword: string;
    /** Field name extracted from instancePath or `missingProperty`. */
    field?: string;
}

function toAbiError(e: ErrorObject): AbiValidationError {
    const field =
        e.keyword === "required"
            ? ((e.params as { missingProperty?: string })?.missingProperty ??
              undefined)
            : (e.instancePath?.split("/").filter(Boolean)[0] ?? undefined);
    return {
        instancePath: e.instancePath ?? "",
        message: e.message ?? "invalid",
        keyword: e.keyword,
        field,
    };
}

export function validateAbiInput(
    feature: NodeSlot,
    value: unknown,
): AbiValidationResult {
    const validator = getValidator(feature);
    const ok = validator(value);
    if (ok) return { valid: true, errors: [] };
    const errors = (validator.errors ?? []).map(toAbiError);
    return { valid: false, errors };
}

/** Pre-warm a validator (optional optimization for hot features). */
export function warmValidator(feature: NodeSlot): void {
    getValidator(feature);
}
