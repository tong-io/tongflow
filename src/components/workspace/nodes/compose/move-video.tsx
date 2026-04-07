import { Handle, Position, useNodesData, type NodeProps } from "@xyflow/react";
import { memo, useMemo, useState } from "react";
import { Atom } from "lucide-react";
import { Label } from "@/components/ui/label";
import { BaseNode } from "../base/base-node";
import {
    upstreamParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";

// 工作流执行配置
const workflowConfig = {
    feature: "move_video",
    label: "动作迁移",
    outputType: "videoNode",
    outputField: "fileKeys" as const,
    supportsBatch: true,
    batchParam: "video",
    paramMappings: {
        image: {
            sources: [upstreamParam("imageNode", "fileKeys")],
            required: true,
        },
        video: {
            sources: [upstreamParam("videoNode", "fileKeys")],
            required: true,
        },
    },
};

const MoveVideoNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const { ids, feature } = data as { ids: string[]; feature: string };
    const [subjectType, setSubjectType] = useState<"human" | "animal">("human");
    const [countType, setCountType] = useState<"single" | "multi">("single");
    const fromNodes = useNodesData(ids);
    const images = fromNodes.find((node) => node.type === "imageNode")?.data
        ?.fileKeys as string[];
    const videos = fromNodes.find((node) => node.type === "videoNode")?.data
        ?.fileKeys as string[];

    const baseFeature =
        subjectType === "animal" ? "move_video_animal" : "move_video";
    const currentFeature =
        countType === "multi" ? `${baseFeature}_muti` : baseFeature;

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
            data={dataWithOutput}
            workflowConfig={useMemo(
                () => ({
                    ...workflowConfig,
                    feature: currentFeature,
                    title: t("titles.moveVideo"),
                    icon: <Atom className="h-5 w-5" />,
                    executeLabel: t("actions.startMigration"),
                    executeDisabled: !images || !videos,
                    getPrompts: (ctx?: GetPromptsContext) => {
                        const upstreamImages = ctx?.getAllUpstreamData(
                            "imageNode",
                            "fileKeys",
                        );
                        const upstreamVideos = ctx?.getAllUpstreamData(
                            "videoNode",
                            "fileKeys",
                        );
                        const finalImages = upstreamImages?.length
                            ? upstreamImages
                            : images;
                        const finalVideos = upstreamVideos?.length
                            ? upstreamVideos
                            : videos;
                        return finalImages && finalVideos
                            ? finalVideos.map((video, index) => ({
                                  image: finalImages[index],
                                  video: video,
                                  duration: 25,
                              }))
                            : [];
                    },
                }),
                [images, videos, currentFeature],
            )}
        >
            <div className="px-4 py-2">
                <Label className="text-sm font-medium text-muted-foreground mb-2 block">
                    {t("options.human")}/{t("options.animal")}
                </Label>
                <div className="flex gap-4 nodrag">
                    <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                        <input
                            type="radio"
                            name="subjectType"
                            checked={subjectType === "human"}
                            onChange={() => setSubjectType("human")}
                            className="accent-primary"
                        />
                        {t("options.human")}
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                        <input
                            type="radio"
                            name="subjectType"
                            checked={subjectType === "animal"}
                            onChange={() => setSubjectType("animal")}
                            className="accent-primary"
                        />
                        {t("options.animal")}
                    </label>
                </div>
                <Label className="text-sm font-medium text-muted-foreground mb-2 mt-3 block">
                    {t("options.single")}/{t("options.multi")}
                </Label>
                <div className="flex gap-4 nodrag">
                    <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                        <input
                            type="radio"
                            name="countType"
                            checked={countType === "single"}
                            onChange={() => setCountType("single")}
                            className="accent-primary"
                        />
                        {t("options.single")}
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                        <input
                            type="radio"
                            name="countType"
                            checked={countType === "multi"}
                            onChange={() => setCountType("multi")}
                            className="accent-primary"
                        />
                        {t("options.multi")}
                    </label>
                </div>
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

export default memo(MoveVideoNode);
