/**
 * ABI-driven form hook.
 *
 * Replaces hand-written `useNodeState` for executable nodes. Reads which
 * fields are "config" vs "handle" from the ABI topology (after sourceSpec
 * overrides) and syncs the config subset back to React Flow `node.data`.
 *
 * Two binding flavors:
 *  - `bind(field)`  — for controls taking `{ value, onChange: (v) => void }`
 *                     (NodeTextarea, AspectRatioPicker, custom selects)
 *  - `register(field)` — for native inputs `{ value, onChange: e => void }`
 */

import { useNodeId } from "@xyflow/react";
import {
    type ChangeEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { NodeSlot, SlotInput } from "@/generated/abi";
import useFlow from "@/hooks/use-flow";

import { type ResolvedSpec, resolveSpec } from "@/lib/abi/resolve";
import type { FieldSourceOverride, SourceSpec } from "@/lib/abi/sources";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type ConfigState<F extends NodeSlot> = Partial<SlotInput<F>>;

export interface UseAbiFormReturn<F extends NodeSlot> {
    feature: F;
    spec: ResolvedSpec;
    /** Current config snapshot (handle-fed fields are excluded). */
    state: ConfigState<F>;
    /** Set a single field. */
    set: <K extends keyof ConfigState<F>>(
        field: K,
        value: ConfigState<F>[K],
    ) => void;
    /** Merge a partial patch. */
    patch: (partial: ConfigState<F>) => void;
    /** Bind a callback-style control: returns `{ value, onChange(value) }`. */
    bind: <K extends keyof ConfigState<F>>(
        field: K,
    ) => {
        value: ConfigState<F>[K] | undefined;
        onChange: (value: ConfigState<F>[K]) => void;
    };
    /** Bind a native input: returns `{ value, onChange(event) }`. */
    register: <K extends keyof ConfigState<F>>(
        field: K,
    ) => {
        value: string;
        onChange: (
            e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
        ) => void;
    };
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

export function useAbiForm<F extends NodeSlot>(
    feature: F,
    sourceSpec?: SourceSpec<F>,
): UseAbiFormReturn<F> {
    const spec = useMemo(
        () =>
            resolveSpec(
                feature,
                sourceSpec as Record<string, FieldSourceOverride> | undefined,
            ),
        [feature, sourceSpec],
    );

    const nodeId = useNodeId();
    const flowUpdates = useFlow((s) => s.updates);
    const data = useFlow(
        useCallback(
            (s) =>
                s.nodes.find((n) => n.id === nodeId)?.data as
                    | Record<string, unknown>
                    | undefined,
            [nodeId],
        ),
    );

    // Local mirror so we can throttle writes to the store.
    const [state, setState] = useState<ConfigState<F>>(() =>
        pickConfig(spec, data),
    );

    const dataRef = useRef(data);
    dataRef.current = data;

    // Mirror of `state` so set/patch can compute the next value without a
    // functional updater. Writing to the flow store inside a setState updater
    // would run during render and trip React's "setState while rendering"
    // warning (the flow store is shared with other components, e.g. SmartIsland).
    const stateRef = useRef(state);
    stateRef.current = state;

    // Sync inbound data changes (e.g. undo, programmatic edit) into local state.
    useEffect(() => {
        setState(pickConfig(spec, data));
        // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid spec churn
    }, [data]);

    const writeBack = useCallback(
        (next: ConfigState<F>) => {
            if (!nodeId) return;
            flowUpdates(nodeId, { ...(dataRef.current ?? {}), ...next });
        },
        [nodeId, flowUpdates],
    );

    const set = useCallback(
        <K extends keyof ConfigState<F>>(
            field: K,
            value: ConfigState<F>[K],
        ) => {
            const next = { ...stateRef.current, [field]: value };
            stateRef.current = next;
            setState(next);
            writeBack(next);
        },
        [writeBack],
    );

    const patch = useCallback(
        (partial: ConfigState<F>) => {
            const next = { ...stateRef.current, ...partial };
            stateRef.current = next;
            setState(next);
            writeBack(next);
        },
        [writeBack],
    );

    const bind = useCallback(
        <K extends keyof ConfigState<F>>(field: K) => ({
            value: state[field],
            onChange: (value: ConfigState<F>[K]) => set(field, value),
        }),
        [state, set],
    );

    const register = useCallback(
        <K extends keyof ConfigState<F>>(field: K) => ({
            value: (state[field] as unknown as string) ?? "",
            onChange: (
                e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
            ) => {
                set(field, e.target.value as unknown as ConfigState<F>[K]);
            },
        }),
        [state, set],
    );

    return {
        feature,
        spec,
        state,
        set,
        patch,
        bind,
        register,
    };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function pickConfig<F extends NodeSlot>(
    spec: ResolvedSpec,
    data: Record<string, unknown> | undefined,
): ConfigState<F> {
    if (!data) return {} as ConfigState<F>;
    const out: Record<string, unknown> = {};
    for (const [field, resolved] of Object.entries(spec.fields)) {
        const isManualHandle =
            resolved.kind === "handle" && resolved.manual === true;
        if ((resolved.kind === "config" || isManualHandle) && field in data) {
            out[field] = data[field];
        }
    }
    return out as ConfigState<F>;
}
