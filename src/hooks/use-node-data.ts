import { useNodeId } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import useFlow from "./use-flow";

/**
 * Hook for managing multiple states of a node
 * @param initialState Initial state object
 * @param nodeData Node's data object
 * @returns [state, updateState] Similar to useState interface, but supports object updates
 */
export function useNodeState<T extends Record<string, any>>(
    initialState: T,
    nodeData: any,
) {
    const id = useNodeId();
    const flowUpdates = useFlow((s) => s.updates);

    // Merge node data and initial state
    const [state, setState] = useState<T>(() => ({
        ...initialState,
        ...nodeData,
    }));

    // Track the latest state so updateState can derive the next value without
    // running side effects inside the setState updater (updaters execute during
    // the render phase; mutating the flow store there would update other
    // subscribers mid-render — e.g. "Cannot update SmartIsland while rendering").
    const stateRef = useRef(state);
    stateRef.current = state;

    // Synchronize state when nodeData changes
    useEffect(() => {
        setState((prev) => ({
            ...prev,
            ...nodeData,
        }));
    }, [nodeData]);

    // Update state and sync to node data
    const updateState = useCallback(
        (updates: Partial<T> | ((prev: T) => T)) => {
            const prev = stateRef.current;
            const newState =
                typeof updates === "function"
                    ? updates(prev)
                    : { ...prev, ...updates };
            stateRef.current = newState;
            setState(newState);
            if (id) {
                // Sync to node data (event-scoped, outside the render phase)
                flowUpdates(id, newState);
            }
        },
        [id, flowUpdates],
    );

    return [state, updateState] as const;
}
