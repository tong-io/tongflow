import {
    Handle,
    Position,
    useNodeId,
    useNodesData,
    type NodeProps,
} from "@xyflow/react";
import { memo, useMemo, useCallback } from "react";
import { Video, Sparkles } from "lucide-react";
import { BaseNode } from "../base/base-node";
import {
    upstreamParam,
    configParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useNodeState } from "@/hooks/use-node-data";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NodeTextarea } from "../base/node-textarea";
import { useR2AsyncLoader } from "@/hooks/use-r2-async-loader";
import { getR2Url } from "@/lib/r2-utils";
import { useTranslations } from "next-intl";
import useFlow from "@/hooks/use-flow";
import { clampToAllowedModel } from "@/utils/node-model-feature";
import { NodeModelSelect } from "../base/node-model-select";
import { multiModelSelectOptions } from "@/utils/node-model-select-label";

const MOVE_FEATURES = [
    "video_image_move",
    "video_image_move_muti",
    "video_image_move_animal",
    "video_image_move_animal_muti",
] as const;

const DEFAULT_MOVE_FEATURE = "video_image_move";

function moveFeature(isAnimal: boolean, isMulti: boolean): string {
    const base = isAnimal ? "video_image_move_animal" : "video_image_move";
    return isMulti ? `${base}_muti` : base;
}

// 媒体缩略图组件
const MediaThumbnail = memo(
    ({
        fileKey,
        label,
        type,
        loadingText,
    }: {
        fileKey?: string;
        label: string;
        type: "image" | "audio" | "video";
        loadingText: string;
    }) => {
        const { url } = useR2AsyncLoader(fileKey, { priority: "high" });

        return (
            <div className="flex flex-col items-center gap-1.5">
                <div className="relative w-16 h-16 rounded-md border-2 border-gray-300 overflow-hidden bg-gray-100 transition-colors">
                    {type === "image" ? (
                        url ? (
                            <img
                                src={url}
                                alt={label}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full w-full">
                                <div className="text-xs text-gray-400">
                                    {loadingText}
                                </div>
                            </div>
                        )
                    ) : type === "video" ? (
                        url ? (
                            <video
                                src={url}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full w-full">
                                <div className="text-xs text-gray-400">
                                    {loadingText}
                                </div>
                            </div>
                        )
                    ) : (
                        <div className="flex items-center justify-center h-full w-full bg-blue-50">
                            <div className="text-xs text-blue-600 font-semibold">
                                🎵
                            </div>
                        </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 transition-colors" />
                </div>
                <div
                    className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                        type === "image"
                            ? "bg-purple-100 text-purple-700"
                            : type === "video"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-blue-100 text-blue-700"
                    }`}
                >
                    {label}
                </div>
            </div>
        );
    },
);

MediaThumbnail.displayName = "MediaThumbnail";

// 工作流执行配置
const workflowConfig = {
    feature: DEFAULT_MOVE_FEATURE,
    label: "视频图片混合生成视频",
    outputType: "videoNode",
    outputField: "fileKeys" as const,
    supportsBatch: false,
    paramMappings: {
        image: {
            sources: [upstreamParam("imageNode", "fileKeys[0]")],
            required: true,
        },
        video: {
            sources: [upstreamParam("videoNode", "fileKeys[0]")],
            required: true,
        },
        text: {
            sources: [configParam("videoPrompt")],
        },
    },
};

const VideoImageGenVideoMoveNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const updates = useFlow((s) => s.updates);
    const id = useNodeId()!;
    const { ids } = data as { ids: string[] };
    const fromNodes = useNodesData(ids);

    const featureName = clampToAllowedModel(
        (data as { feature?: string }).feature,
        MOVE_FEATURES,
        DEFAULT_MOVE_FEATURE,
    );

    const isAnimal = featureName.includes("animal");
    const isMulti = featureName.endsWith("_muti");

    const setMoveFeature = useCallback(
        (nextAnimal: boolean, nextMulti: boolean) => {
            updates(id, {
                ...data,
                feature: moveFeature(nextAnimal, nextMulti),
            });
        },
        [data, id, updates],
    );

    // 获取图片和视频数据
    const image = fromNodes.find((node) => node.type === "imageNode");
    const video = fromNodes.find((node) => node.type === "videoNode");

    const imageFileKey = (image?.data as any)?.fileKeys?.[0];
    const videoFileKey = (video?.data as any)?.fileKeys?.[0];

    // 使用新的Hook来管理状态持久化
    const [state, setState] = useNodeState(
        {
            videoPrompt: "",
        },
        data,
    );
    const { videoPrompt } = state;

    // 补充 outputType 和 outputField 用于 BaseNode 自动处理任务完成
    const dataWithOutput = useMemo(
        () => ({
            ...data,
            outputType: "videoNode",
            outputField: "fileKeys",
        }),
        [data],
    );

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={dataWithOutput}
            workflowConfig={useMemo(
                () => ({
                    ...workflowConfig,
                    feature: featureName,
                    title: t("titles.videoImageMove"),
                    icon: <Video className="h-5 w-5" />,
                    executeLabel: t("actions.generateVideo"),
                    executeDisabled: !imageFileKey || !videoFileKey,
                    getPrompts: (ctx?: GetPromptsContext) => {
                        const upstreamImage = ctx?.getUpstreamData(
                            "imageNode",
                            "fileKeys[0]",
                        );
                        const upstreamVideo = ctx?.getUpstreamData(
                            "videoNode",
                            "fileKeys[0]",
                        );
                        const finalImage = upstreamImage || imageFileKey;
                        const finalVideo = upstreamVideo || videoFileKey;
                        return finalImage && finalVideo
                            ? [
                                  {
                                      image: getR2Url(finalImage),
                                      video: getR2Url(finalVideo),
                                      text: videoPrompt,
                                  },
                              ]
                            : [];
                    },
                }),
                [imageFileKey, videoFileKey, videoPrompt, featureName, t],
            )}
        >
            <div className="p-4 space-y-4">
                <NodeModelSelect
                    value={featureName}
                    onValueChange={(v) =>
                        updates(id, { ...data, feature: v })
                    }
                    options={multiModelSelectOptions(MOVE_FEATURES, (k) =>
                        t(k as Parameters<typeof t>[0]),
                    )}
                />
                {/* 人物/动物 & 单人/多人 选择 */}
                <div className="space-y-3">
                    <div>
                        <Label className="text-sm font-medium text-muted-foreground mb-2 block">
                            {t("options.human")}/{t("options.animal")}
                        </Label>
                        <div className="flex gap-4 nodrag">
                            <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                                <input
                                    type="radio"
                                    name="subjectType"
                                    checked={!isAnimal}
                                    onChange={() => setMoveFeature(false, isMulti)}
                                    className="accent-primary"
                                />
                                {t("options.human")}
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                                <input
                                    type="radio"
                                    name="subjectType"
                                    checked={isAnimal}
                                    onChange={() => setMoveFeature(true, isMulti)}
                                    className="accent-primary"
                                />
                                {t("options.animal")}
                            </label>
                        </div>
                    </div>
                    <div>
                        <Label className="text-sm font-medium text-muted-foreground mb-2 block">
                            {t("options.single")}/{t("options.multi")}
                        </Label>
                        <div className="flex gap-4 nodrag">
                            <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                                <input
                                    type="radio"
                                    name="countType"
                                    checked={!isMulti}
                                    onChange={() =>
                                        setMoveFeature(isAnimal, false)
                                    }
                                    className="accent-primary"
                                />
                                {t("options.single")}
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                                <input
                                    type="radio"
                                    name="countType"
                                    checked={isMulti}
                                    onChange={() =>
                                        setMoveFeature(isAnimal, true)
                                    }
                                    className="accent-primary"
                                />
                                {t("options.multi")}
                            </label>
                        </div>
                    </div>
                </div>

                {/* 媒体展示区 */}
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("compose.mediaFiles")}
                        </Label>
                        <div className="flex gap-4">
                            {imageFileKey && (
                                <MediaThumbnail
                                    fileKey={imageFileKey}
                                    label={t("compose.image")}
                                    type="image"
                                    loadingText={t("compose.loading")}
                                />
                            )}
                            {videoFileKey && (
                                <MediaThumbnail
                                    fileKey={videoFileKey}
                                    label={t("compose.video")}
                                    type="video"
                                    loadingText={t("compose.loading")}
                                />
                            )}
                        </div>
                        {(!imageFileKey || !videoFileKey) && (
                            <p className="text-xs text-red-500">
                                {t("compose.connectImageVideo")}
                            </p>
                        )}
                    </div>
                </Card>

                {/* 提示词输入 */}
                <NodeTextarea
                    label={t("compose.generatePromptLabel")}
                    icon={Sparkles}
                    placeholder={t("compose.generatePromptPlaceholder")}
                    value={videoPrompt}
                    onChange={(value) => setState({ videoPrompt: value })}
                    rows={4}
                />
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

export default memo(VideoImageGenVideoMoveNode);
