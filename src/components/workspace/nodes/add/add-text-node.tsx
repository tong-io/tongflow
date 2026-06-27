import {
    Handle,
    type NodeProps,
    Position,
    useNodeId,
    useNodesData,
} from "@xyflow/react";
import { Edit3, Library, Lock, Type, Unlock } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import useFlow from "@/hooks/use-flow";
import { useNodeState } from "@/hooks/use-node-data";
import { useTaskStore } from "@/hooks/use-task";
import type { AddTextNodeData } from "@/types/nodes";
import { LibInput } from "../../share/lib-input";
import { BaseNodeShell } from "../base/base-node-shell";
import { NodeHeaderAction } from "../base/node-header";
import { NodeTextarea } from "../base/node-textarea";

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

    // Locate downstream nodes
    const downstreamEdge = useMemo(
        () => edges.find((e) => e.source === id),
        [edges, id],
    );
    const downstreamNodeId = downstreamEdge?.target;
    const downstreamNodeData = useNodesData(
        downstreamNodeId ? [downstreamNodeId] : [],
    );
    const downstreamNode = downstreamNodeData[0];

    // Add-text control only spawns neighbours when absent
    const addTextNode = () => {
        if (!manualValue.trim() || !id) return;
        if (!downstreamNodeId) {
            expands(id, [{ type: "textNode", data: { texts: [manualValue] } }]);
            // Keep manualValue so execution reuses composer text
        }
    };

    // On blur propagate manual edits when wired downstream
    const handleBlur = () => {
        if (!manualValue.trim() || !downstreamNodeId) return;
        // Assume downstream textNode owns a texts payload
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

const AddTextNode: React.FC<NodeProps> = ({ selected, data }) => {
    const id = useNodeId();
    const nodeData = data as AddTextNodeData;
    const { activeTab = "manual", locked = false } = nodeData;
    const updates = useFlow((s) => s.updates);

    const workspaceMode = useTaskStore((state) => state.workspaceMode);
    const t = useTranslations("Workspace.nodes");
    const tBase = useTranslations("Workspace.nodes.base");

    const handleToggleLock = useCallback(() => {
        if (id) updates(id, { ...data, locked: !locked });
    }, [id, data, locked, updates]);

    const handleTabChange = (value: string) => {
        if (locked) return;
        if (id) updates(id, { ...data, activeTab: value });
    };

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

    return (
        <BaseNodeShell
            selected={selected}
            className="min-w-[480px]"
            data={data as AddTextNodeData}
            title={t("titles.addText")}
            icon={<Type className="h-5 w-5" />}
            headerActions={lockAction}
            isInputNode
            showPluginSelect={false}
        >
            <Handle
                type="source"
                position={Position.Right}
                id="out:textNode"
                isConnectableStart={false}
            />
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
        </BaseNodeShell>
    );
};

AddTextNode.displayName = "AddTextNode";

export default memo(AddTextNode);
