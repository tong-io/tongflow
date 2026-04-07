import {
    Handle,
    Position,
    useNodeId,
    useNodesData,
    type NodeProps,
} from "@xyflow/react";
import { memo, useCallback, useMemo } from "react";
import { Type, Edit3, Library, Lock, Unlock } from "lucide-react";
import type { AddTextNodeData, AddTextNode } from "@/types/nodes";

import { BaseNode } from "../base/base-node";
import { Button } from "@/components/ui/button";
import { NodeTextarea } from "../base/node-textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import useFlow from "@/hooks/use-flow";
import { useNodeState } from "@/hooks/use-node-data";
import { LibInput } from "../../share/lib-input";
import { useTaskStore } from "@/hooks/use-task";
import { NodeHeaderAction } from "../base/node-header";
import { useTranslations } from "next-intl";

const ManualInputTab = ({
    data,
    locked,
}: {
    data: AddTextNodeData;
    locked?: boolean;
}) => {
    const expands = useFlow((s) => s.expands);
    const edges = useFlow((s) => s.edges);
    const updateNode = useFlow((s) => s.updates);
    const id = useNodeId();
    const t = useTranslations("Workspace.nodes");

    const [state, updateState] = useNodeState(
        {
            manualValue: "",
        },
        data,
    );
    const { manualValue } = state;

    // 查找下游节点
    const downstreamEdge = useMemo(
        () => edges.find((e) => e.source === id),
        [edges, id],
    );
    const downstreamNodeId = downstreamEdge?.target;
    const downstreamNodeData = useNodesData(
        downstreamNodeId ? [downstreamNodeId] : [],
    );
    const downstreamNode = downstreamNodeData[0];

    // Add Text 按钮：仅在没有下游节点时添加新节点
    const addTextNode = () => {
        if (!manualValue.trim() || !id) return;
        if (!downstreamNodeId) {
            expands(id, [{ type: "textNode", data: { texts: [manualValue] } }]);
            // 不再清空 manualValue，保留用户输入的值用于工作流执行
        }
    };

    // onBlur: 如果有下游节点则自动更新
    const handleBlur = () => {
        if (!manualValue.trim() || !downstreamNodeId) return;
        // 假设下游节点类型为 textNode，且有 texts 字段
        updateNode(downstreamNodeId, {
            ...downstreamNode?.data,
            texts: [manualValue],
        });
    };

    return (
        <div className="w-full space-y-2">
            <NodeTextarea
                rows={6}
                placeholder={t("common.enterText")}
                value={manualValue}
                onChange={(value) => {
                    updateState({ manualValue: value });
                }}
                className="min-h-[120px] max-h-[240px] overflow-y-auto scrollbar-thin"
                disabled={locked}
                onBlur={handleBlur}
            />
            <Button
                onClick={addTextNode}
                disabled={!manualValue.trim() || locked || !!downstreamNodeId}
                className="w-full h-10"
            >
                {t("common.addText")}
            </Button>
        </div>
    );
};

const LibraryTab = ({ locked }: { locked?: boolean }) => {
    return (
        <div className="w-full relative">
            <LibInput resourceType="TEXT" />
            {locked && (
                <div className="absolute inset-0 bg-white/50 dark:bg-gray-800/50 cursor-not-allowed" />
            )}
        </div>
    );
};

// 工作流执行配置 - 手动输入模式（透传用户输入的文本，无需调用 API）
// 不设置 feature，后端会直接从 rawConfig.manualValue 读取并透传
const manualWorkflowConfig = {
    feature: "",
    label: "Manual Input", // Kept as internal label or use generic
    outputType: "textNode",
    outputField: "texts" as const,
    supportsBatch: false,
    paramMappings: {},
};

const AddTextNode: React.FC<NodeProps> = ({ selected, data }) => {
    const id = useNodeId();
    const nodeData = data as AddTextNodeData;
    const {
        taskId = "",
        query = "",
        activeTab = "manual",
        locked = false,
    } = nodeData;
    const updates = useFlow((s) => s.updates);

    const workspaceMode = useTaskStore((state) => state.workspaceMode);
    const t = useTranslations("Workspace.nodes");
    const tBase = useTranslations("Workspace.nodes.base");

    // 切换锁定状态
    const handleToggleLock = useCallback(() => {
        if (id) {
            updates(id, { ...data, locked: !locked });
        }
    }, [id, data, locked, updates]);

    const handleTabChange = (value: string) => {
        // 锁定时不允许切换 Tab
        if (locked) return;
        if (id) {
            updates(id, { ...data, activeTab: value });
        }
    };

    // 获取带配置的 data（manual 模式不需要 feature）
    const dataWithFeature = useMemo(() => {
        return data;
    }, [data]);

    // 获取统一的工作流配置
    const getWorkflowConfig = useCallback(() => {
        // 锁定按钮 - 只在创作模式下显示
        const lockAction =
            workspaceMode === "create" ? (
                <NodeHeaderAction
                    onClick={handleToggleLock}
                    variant="ghost"
                    label={locked ? tBase("unlock") : tBase("lock")}
                    className={locked ? "text-amber-500" : ""}
                >
                    {locked ? (
                        <Lock className="h-4 w-4 fill-current" />
                    ) : (
                        <Unlock className="h-4 w-4" />
                    )}
                </NodeHeaderAction>
            ) : null;

        if (activeTab === "manual") {
            return {
                ...manualWorkflowConfig,
                title: t("titles.addText"),
                icon: <Type className="h-5 w-5" />,
                headerActions: lockAction,
                isInputNode: true,
            };
        }
        return {
            feature: "",
            title: t("titles.addText"),
            icon: <Type className="h-5 w-5" />,
            headerActions: lockAction,
            isInputNode: true,
        };
    }, [activeTab, locked, handleToggleLock, workspaceMode]);

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={dataWithFeature}
            workflowConfig={getWorkflowConfig()}
        >
            <div className="p-4 space-y-2">
                <Tabs
                    value={activeTab}
                    className="w-full"
                    onValueChange={handleTabChange}
                >
                    <TabsList className="w-full grid grid-cols-2 gap-2 bg-transparent h-auto p-0">
                        <TabsTrigger
                            key="manual"
                            value="manual"
                            className="h-9 flex flex-row items-center justify-center gap-2 data-[state=active]:bg-secondary"
                        >
                            <Edit3 className="h-4 w-4" />
                            <span className="text-xs font-medium">
                                {t("common.manualInput")}
                            </span>
                        </TabsTrigger>
                        <TabsTrigger
                            key="library"
                            value="library"
                            className="h-9 flex flex-row items-center justify-center gap-2 data-[state=active]:bg-secondary"
                        >
                            <Library className="h-4 w-4" />
                            <span className="text-xs font-medium">
                                {t("common.library")}
                            </span>
                        </TabsTrigger>
                    </TabsList>

                    <div className="mt-2">
                        <TabsContent
                            key="manual"
                            value="manual"
                            className="mt-0"
                        >
                            <ManualInputTab data={nodeData} locked={locked} />
                        </TabsContent>
                        <TabsContent
                            key="library"
                            value="library"
                            className="mt-0"
                        >
                            <LibraryTab locked={locked} />
                        </TabsContent>
                    </div>
                </Tabs>
            </div>

            <Handle
                type="target"
                position={Position.Left}
                id="a"
                isConnectable={true}
            />
            <Handle
                type="source"
                position={Position.Right}
                id="b"
                isConnectable={true}
            />
        </BaseNode>
    );
};

AddTextNode.displayName = "AddTextNode";

export default memo(AddTextNode);
