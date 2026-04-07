import { useState, useCallback, useEffect } from "react";
import { useNodeId } from "@xyflow/react";
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

    // 当 nodeData 改变时，同步更新状态
    useEffect(() => {
        setState((prev) => ({
            ...prev,
            ...nodeData,
        }));
    }, [nodeData]);

    // Update state and sync to node data
    const updateState = useCallback(
        (updates: Partial<T> | ((prev: T) => T)) => {
            setState((prev) => {
                const newState =
                    typeof updates === "function"
                        ? updates(prev)
                        : { ...prev, ...updates };
                if (id) {
                    // Sync to node data
                    flowUpdates(id, newState);
                }
                return newState;
            });
        },
        [id, flowUpdates],
    );

    return [state, updateState] as const;
}
