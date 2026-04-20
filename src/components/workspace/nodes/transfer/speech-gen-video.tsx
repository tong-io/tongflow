import {
    Handle,
    Position,
    useNodeId,
    useNodesData,
    type NodeProps,
} from "@xyflow/react";
import { memo, useCallback, useMemo } from "react";
import { Atom, Wand2 } from "lucide-react";
import { BaseNode } from "../base/base-node";
import { useNodeState } from "@/hooks/use-node-data";
import useFlow from "@/hooks/use-flow";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NodeTextarea } from "../base/node-textarea";
import { useR2AsyncLoader } from "@/hooks/use-r2-async-loader";
import { getR2Url } from "@/lib/r2-utils";
import {
    upstreamParam,
    configParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";
import { clampToAllowedModel } from "@/utils/node-model-feature";
import { NodeModelSelect } from "../base/node-model-select";
import { singleModelSelectOptions } from "@/utils/node-model-select-label";

// 视频缩略图组件
const VideoThumbnail = memo(
    ({ fileKey, label }: { fileKey?: string; label: string }) => {
        const { url } = useR2AsyncLoader(fileKey, { priority: "high" });
        const t = useTranslations("Workspace.nodes.speechGenVideo");

        return (
            <div className="flex flex-col items-center gap-1.5">
                <div className="relative w-16 h-16 rounded-md border-2 border-gray-300 overflow-hidden bg-gray-50 transition-colors">
                    {url ? (
                        <div className="flex items-center justify-center h-full w-full">
                            <div className="text-2xl">🎬</div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full w-full">
                            <div className="text-xs text-gray-400">
                                {t("loading")}
                            </div>
                        </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 transition-colors" />
                </div>
                <div className="px-1.5 py-0.5 bg-gray-100 text-gray-700 text-xs font-medium rounded">
                    {label}
                </div>
            </div>
        );
    },
);

VideoThumbnail.displayName = "VideoThumbnail";

const DEFAULT_FEATURE = "speech-text-gen-video";

const SpeechGenVideoNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const { ids = [], fileKeys: localFileKeys = [] } = data as {
        ids?: string[];
        fileKeys?: string[];
    };
    const expands = useFlow((s) => s.expands);
    const updates = useFlow((s) => s.updates);
    const id = useNodeId()!;
    const featureName = clampToAllowedModel(
        (data as { feature?: string }).feature,
        [DEFAULT_FEATURE],
        DEFAULT_FEATURE,
    );

    // 如果有 ids，从关联节点获取数据（组合模式）
    const fromNodes = useNodesData(ids);
    const videoNode = fromNodes.find((node) => node.type === "videoNode");
    const textNode = fromNodes.find((node) => node.type === "textNode");

    // 从组合节点或直接从 data 获取 fileKeys 和 texts
    const fileKeys: string[] = useMemo(() => {
        if (videoNode) {
            return (videoNode.data as any)?.fileKeys || [];
        }
        return localFileKeys;
    }, [videoNode, localFileKeys]);

    const upstreamTexts: string[] = useMemo(() => {
        if (textNode) {
            return (textNode.data as any)?.texts || [];
        }
        return (data as any)?.texts || [];
    }, [textNode, data]);

    // 判断是否有上游文本输入
    const hasUpstreamTexts = upstreamTexts && upstreamTexts.length > 0;
    // 获取实际使用的提示词
    const effectivePrompt = hasUpstreamTexts ? upstreamTexts[0] : "";

    // 使用新的Hook来管理状态持久化
    const [state, setState] = useNodeState(
        {
            videoPrompt: "",
        },
        data,
    );
    const { videoPrompt } = state;

    // 自定义任务更新处理 - 因为返回字段是 file_key
    const handleTaskUpdate = useCallback(
        (task: any) => {
            if (task?.status === "COMPLETED") {
                const audioKey = task?.data?.file_key;
                if (audioKey) {
                    expands("", [
                        { type: "videoNode", data: { fileKeys: [audioKey] } },
                    ]);
                }
                return true; // 已处理，跳过默认逻辑
            }
            return false;
        },
        [expands],
    );

    const workflowConfig = {
        feature: "speech-text-gen-video",
        label: "音频生成视频",
        outputType: "videoNode",
        outputField: "fileKeys" as const,
        paramMappings: {
            audio: {
                sources: [
                    upstreamParam("videoNode", "fileKeys[0]", {
                        needsUrlTransform: true,
                    }),
                ],
                required: true,
            },
            text: {
                sources: [configParam("videoPrompt", "")],
            },
        },
    };

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={{
                ...workflowConfig,
                feature: featureName,
                title: t("titles.speechGenVideo"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: t("actions.generateAudio"),
                executeDisabled:
                    !(videoPrompt || hasUpstreamTexts) || !fileKeys?.length,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamKeys = ctx?.getAllUpstreamData(
                        "videoNode",
                        "fileKeys",
                    ) as string[] | undefined;
                    const keys =
                        upstreamKeys && upstreamKeys.length > 0
                            ? upstreamKeys
                            : fileKeys;

                    // 优先从上游节点获取最新的文本数据
                    const ctxUpstreamTexts = ctx?.getAllUpstreamData(
                        "textNode",
                        "texts",
                    ) as string[] | undefined;
                    const text =
                        ctxUpstreamTexts && ctxUpstreamTexts.length > 0
                            ? ctxUpstreamTexts[0]
                            : hasUpstreamTexts
                              ? effectivePrompt
                              : videoPrompt;

                    return [
                        {
                            text,
                            audio: getR2Url(keys[0]),
                        },
                    ];
                },
                onTaskUpdate: handleTaskUpdate,
            }}
        >
            <div className="p-4 space-y-4">
                <NodeModelSelect
                    value={featureName}
                    onValueChange={(value) =>
                        updates(id, { ...data, feature: value })
                    }
                    options={singleModelSelectOptions(DEFAULT_FEATURE, (k) =>
                        t(k as Parameters<typeof t>[0]),
                    )}
                />
                {/* 媒体展示区 */}
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("speechGenVideo.inputContent")}
                        </Label>
                        <div className="flex gap-4">
                            {fileKeys && fileKeys.length > 0 && (
                                <VideoThumbnail
                                    fileKey={fileKeys[0]}
                                    label={t("speechGenVideo.video")}
                                />
                            )}
                        </div>
                        {(!fileKeys || fileKeys.length === 0) && (
                            <p className="text-xs text-red-500">
                                {t("speechGenVideo.connectVideoHint")}
                            </p>
                        )}
                    </div>
                </Card>

                {/* 音频描述输入 - 如果有上游文本，显示预览 */}
                {hasUpstreamTexts ? (
                    <Card className="p-3 bg-muted/50">
                        <div className="space-y-2">
                            <Label className="text-sm font-medium text-muted-foreground">
                                {t("speechGenVideo.audioPromptLabel")}
                                {t("imageEdit.fromUpstream")}
                            </Label>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                                {upstreamTexts.map((text, index) => (
                                    <div
                                        key={index}
                                        className="text-sm text-foreground p-2 bg-background rounded border border-border/50 line-clamp-3"
                                    >
                                        {text}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Card>
                ) : (
                    <NodeTextarea
                        label={t("speechGenVideo.audioPromptLabel")}
                        icon={Wand2}
                        rows={4}
                        placeholder={t("speechGenVideo.audioPromptPlaceholder")}
                        value={videoPrompt}
                        onChange={(value) => setState({ videoPrompt: value })}
                    />
                )}
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

SpeechGenVideoNode.displayName = "SpeechGenVideoNode";

export default memo(SpeechGenVideoNode);
