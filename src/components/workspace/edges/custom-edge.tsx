import {
    BaseEdge,
    EdgeLabelRenderer,
    type EdgeProps,
    getBezierPath,
    useReactFlow,
} from "@xyflow/react";
import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useFlow } from "@/hooks/use-flow";
import { getEdgeTargetOptions } from "@/lib/abi/edge-target-options";

const CustomEdge = ({
    id,
    source,
    target,
    sourceHandleId: sourceHandle,
    targetHandleId: targetHandle,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
}: EdgeProps) => {
    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
    });

    // Edge style: thicker and more visible
    const edgeStyle = {
        ...style,
        strokeWidth: 3,
        stroke: "#94a3b8",
        strokeLinecap: "round" as const,
    };

    const { getNodes } = useReactFlow();
    const t = useTranslations("Workspace.handles");

    // Fields this edge could plug into. Node types are fixed after creation, so
    // computing from a non-reactive snapshot is fine (the edge re-renders as its
    // endpoints move anyway).
    const options = useMemo(
        () =>
            getEdgeTargetOptions(
                { id, source, target, sourceHandle, targetHandle },
                getNodes(),
            ),
        [id, source, target, sourceHandle, targetHandle, getNodes],
    );

    const onSelect = useCallback(
        (newHandle: string) => {
            if (newHandle === targetHandle) return;
            const { edges, setEdges } = useFlow.getState();
            const picked = options.find((o) => o.handleId === newHandle);

            // Swap with the edge currently occupying a single-edge target.
            const occupant =
                picked?.single &&
                edges.find(
                    (e) =>
                        e.id !== id &&
                        e.target === target &&
                        e.targetHandle === newHandle,
                );

            const next = edges.map((e) => {
                if (e.id === id) return { ...e, targetHandle: newHandle };
                if (occupant && e.id === occupant.id) {
                    return { ...e, targetHandle: targetHandle };
                }
                return e;
            });
            setEdges(next);
        },
        [id, target, targetHandle, options],
    );

    return (
        <>
            <BaseEdge id={id} path={edgePath} style={edgeStyle} />
            {options.length >= 2 && (
                <EdgeLabelRenderer>
                    <div
                        className="nodrag nopan absolute"
                        style={{
                            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                            pointerEvents: "all",
                        }}
                    >
                        <Select
                            value={targetHandle ?? undefined}
                            onValueChange={onSelect}
                        >
                            <SelectTrigger
                                size="sm"
                                className="h-6 bg-white px-2 text-xs shadow-sm"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {options.map((o) => {
                                    // Per-node override (e.g. `image` reads as
                                    // "first frame" on the first/last-frame node)
                                    // falls back to the global field label, then
                                    // the raw field name.
                                    const perNode = `byFeature.${o.feature}.${o.field}`;
                                    const label = t.has(perNode)
                                        ? t(perNode)
                                        : t.has(o.field)
                                          ? t(o.field)
                                          : o.field;
                                    return (
                                        <SelectItem
                                            key={o.handleId}
                                            value={o.handleId}
                                            className="text-xs"
                                        >
                                            {label}
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
};

CustomEdge.displayName = "CustomEdge";

export default CustomEdge;
