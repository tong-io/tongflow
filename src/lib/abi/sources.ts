/**
 * Source DSL for ABI-driven nodes.
 *
 * A node declares per-field overrides of the default classification produced by
 * `handle-introspect.ts`. Most fields need no override (ref → handle, scalar → config),
 * but ambiguous cases (e.g. scalar `text` fed from upstream textNode) require an
 * explicit `handle(...)`.
 *
 * `SourceSpec<F>` is keyed by the ABI feature `F`, so field-name typos surface at
 * compile time.
 */

import type { NodeSlot, SlotInput } from "@/generated/abi";
import type { DataNodeType } from "./handle-introspect";

/* ------------------------------------------------------------------ */
/* Override variants                                                   */
/* ------------------------------------------------------------------ */

export interface HandleOverride {
    kind: "handle";
    /** Upstream node type accepted on this handle. */
    nodeType?: DataNodeType;
    /**
     * Data-extraction path on the upstream node's data, e.g. "fileKeys[0]" or "texts".
     * If omitted, defaults are: `fileKeys[0]` (file refs, scalar), `fileKeys` (array),
     * `texts[0]` (text scalar), `texts` (text array).
     */
    path?: string;
    /** True if this handle accepts an array of values (drives batch expansion: one prompt per item). */
    batch?: boolean;
    /**
     * True if this handle should collect values from every matching incoming edge
     * into a single array, **without** expanding into multiple prompts.
     * Use for concat-style fields (e.g. `videos: Asset[]`).
     */
    collect?: boolean;
    /**
     * True if this field is *also* manually settable via the node form (ComfyUI-style
     * widget ⇄ input duality). An upstream edge always wins; the manual config value
     * is used as a fallback when nothing is connected. Requires the node to render a
     * manual control bound to the same field.
     */
    manual?: boolean;
}

export interface ConfigOverride {
    kind: "config";
}

export interface StaticOverride {
    kind: "static";
    value: unknown;
}

export interface InputOverride {
    kind: "input";
    inputName?: string;
}

export type FieldSourceOverride =
    | HandleOverride
    | ConfigOverride
    | StaticOverride
    | InputOverride;

/* ------------------------------------------------------------------ */
/* Helpers (user-facing DSL)                                           */
/* ------------------------------------------------------------------ */

/** Mark a field as fed from an upstream handle. Pass options to refine type/path. */
export function handle(opts?: {
    nodeType?: DataNodeType;
    path?: string;
    batch?: boolean;
    manual?: boolean;
}): HandleOverride {
    return { kind: "handle", ...opts };
}

/** Mark a handle field as accepting batched upstream values (one prompt per value). */
export function batchOn(opts?: {
    nodeType?: DataNodeType;
    path?: string;
}): HandleOverride {
    return { kind: "handle", batch: true, ...opts };
}

/**
 * Mark a handle field as collecting values from every matching incoming edge
 * into a single array (concat-style; no batch expansion).
 */
export function collectAll(opts?: {
    nodeType?: DataNodeType;
    path?: string;
}): HandleOverride {
    return { kind: "handle", collect: true, ...opts };
}

/** Force a field to be a form-config value (defaults already do this for scalars). */
export function configField(): ConfigOverride {
    return { kind: "config" };
}

/** Pin a field to a static literal. */
export function staticValue(value: unknown): StaticOverride {
    return { kind: "static", value };
}

/** Pass-through workflow-level input. */
export function workflowInput(inputName?: string): InputOverride {
    return { kind: "input", inputName };
}

/* ------------------------------------------------------------------ */
/* SourceSpec — keyed by ABI feature                                   */
/* ------------------------------------------------------------------ */

type AbiInputKey<F extends NodeSlot> = Extract<keyof SlotInput<F>, string>;

export type SourceSpec<F extends NodeSlot> = Partial<
    Record<AbiInputKey<F>, FieldSourceOverride>
>;

/** Untyped/erased form for cross-feature plumbing (registry, exporter, validators). */
export type AnySourceSpec = Record<string, FieldSourceOverride>;
