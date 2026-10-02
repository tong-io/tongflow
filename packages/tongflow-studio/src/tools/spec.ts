/**
 * Host-neutral tool definitions. A `ToolSpec` is a name, a description, a
 * parameter schema and an execute function returning plain JSON; each host
 * (dsh's tool registry, the MCP server) adapts the list to its own registry.
 *
 * The parameter DSL is JSON Schema with one convenience: a property is marked
 * required on itself (`required: true`) instead of in a sibling array, so a
 * tool reads top to bottom. `toJsonSchema` hoists the flags for hosts that
 * want the standard form.
 */
import type { RunRecord } from "../engine/runs.ts";

export type Json =
    | string
    | number
    | boolean
    | null
    | Json[]
    | { [key: string]: Json };

interface Annotations {
    description?: string;
}

export type ValueSpec =
    | (Annotations & { type: "string"; enum?: readonly string[] })
    | (Annotations & { type: "number" | "integer" })
    | (Annotations & { type: "boolean" })
    | (Annotations & { type: "array"; items?: ValueSpec })
    | (Annotations & {
          type: "object";
          properties?: ParameterSpec;
          additionalProperties: boolean;
      });

export type PropertySpec = ValueSpec & { required?: true };

export type ParameterSpec = { [key: string]: PropertySpec };

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type RequiredKeys<S> = {
    [K in keyof S]: S[K] extends { required: true } ? K : never;
}[keyof S];

type InferValue<V> = V extends { type: "string"; enum: readonly (infer E)[] }
    ? E
    : V extends { type: "string" }
      ? string
      : V extends { type: "number" | "integer" }
        ? number
        : V extends { type: "boolean" }
          ? boolean
          : V extends { type: "array"; items: infer I }
            ? InferValue<I>[]
            : V extends { type: "array" }
              ? Json[]
              : V extends { type: "object"; properties: infer P }
                ? V extends { additionalProperties: true }
                    ? InferArgs<P> & Record<string, Json>
                    : InferArgs<P>
                : V extends { type: "object" }
                  ? Record<string, Json>
                  : never;

/** The argument object a parameter spec describes: required keys present, the rest optional. */
export type InferArgs<S> = Simplify<
    { [K in RequiredKeys<S>]: InferValue<S[K]> } & {
        [K in Exclude<keyof S, RequiredKeys<S>>]?: InferValue<S[K]>;
    }
>;

/** An image a tool wants the model to see. */
export interface ToolImage {
    data: Uint8Array;
    mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
    name?: string;
}

/** What a host answers after taking an image: a handle to ride the tool value, and the size when it knows it. */
export interface ShownImage {
    attachment?: Json;
    width?: number;
    height?: number;
}

/**
 * One call as the host sees it. Everything beyond `signal` is optional: a host
 * leaves out what it does not have, and the tools degrade (an unknown session
 * remembers no project, a host without images answers with the file path).
 */
export interface ToolCall {
    /** Aborts when the host cancels the call. */
    signal: AbortSignal;
    /** The host session the call belongs to; keys the session's working project. */
    sessionId?: string;
    /** The session's working directory. */
    cwd?: string;
    /** Whether the session's model accepts image content. Absent: assume it does. */
    takesImages?(): Promise<boolean>;
    /** Hand an image to the model. Absent: the host cannot show images inline. */
    showImage?(image: ToolImage): Promise<ShownImage>;
    /** Track a started run as a host background job and return its job id. Absent: the run is polled by its run id. */
    startBackground?(workflow: string, record: RunRecord): string;
    /** Progress of a foreground call, for hosts that surface it. */
    progress?(message: string): void;
}

export interface ToolSpec {
    name: string;
    description: string;
    parameters: ParameterSpec;
    /** The value's shape: structured JSON (default) or one plain string. */
    returns?: "json" | "string";
    execute(args: never, call: ToolCall): Promise<Json>;
}

/** Define a tool with its arguments inferred from the parameter spec. */
export function tool<const S extends ParameterSpec>(spec: {
    name: string;
    description: string;
    parameters: S;
    returns?: "json" | "string";
    execute(args: InferArgs<S>, call: ToolCall): Promise<Json>;
}): ToolSpec {
    return spec as unknown as ToolSpec;
}

/** Standard JSON Schema for a parameter spec: per-property `required` flags hoisted into the `required` array. */
export function toJsonSchema(parameters: ParameterSpec): {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
} {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, spec] of Object.entries(parameters)) {
        const { required: isRequired, ...value } = spec;
        if (isRequired) required.push(key);
        properties[key] = valueSchema(value);
    }
    return {
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
    };
}

function valueSchema(spec: ValueSpec): unknown {
    if (spec.type === "array" && spec.items)
        return { ...spec, items: valueSchema(spec.items) };
    if (spec.type === "object" && spec.properties) {
        const { properties, ...rest } = spec;
        return { ...rest, ...toJsonSchema(properties) };
    }
    return spec;
}
