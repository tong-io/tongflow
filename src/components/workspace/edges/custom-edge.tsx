import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

const CustomEdge = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
}: EdgeProps) => {
    const [edgePath] = getBezierPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
    });

    // 边的样式：更粗、更明显
    const edgeStyle = {
        ...style,
        strokeWidth: 3,
        stroke: "#94a3b8",
        strokeLinecap: "round" as const,
    };

    return <BaseEdge id={id} path={edgePath} style={edgeStyle} />;
};

CustomEdge.displayName = "CustomEdge";

export default CustomEdge;
