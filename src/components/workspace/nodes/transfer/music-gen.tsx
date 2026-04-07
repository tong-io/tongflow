import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo, useCallback } from "react";
import { BaseNode } from "../base/base-node";
import useFlow from "@/hooks/use-flow";
import { useNodeState } from "@/hooks/use-node-data";
import { Card } from "@/components/ui/card";
import { Atom } from "lucide-react";
import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    SelectValue,
} from "@/components/ui/select";
import {
    upstreamParam,
    configParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";

const voiceOptions = [
    { key: "female", value: "female vocal" },
    { key: "male", value: "male vocal" },
    { key: "instrumental", value: "no vocal" },
];

const styleOptions = [
    {
        key: "pop",
        value: "Pop vibrant Piano R&B Uplifting Drums Guitar full Inspiring Mandarin",
    },
    {
        key: "soul",
        value: "romantic keyboard soul emotional bright airy blues classic rock guitar bass drums",
    },
    { key: "jazz", value: "blues airy bright piano sad romantic guitar jazz" },
    {
        key: "rap",
        value: "rap piano street tough piercing hip-hop synthesizer clear vocal",
    },
    {
        key: "lyrical",
        value: "Sad varied Country Folk full rich Piano Serious",
    },
    {
        key: "country",
        value: "mellow Guitar Piano Country dark Blues introspective Sad",
    },
    {
        key: "indie",
        value: "indie rock guitar electric guitar full mellow romantic dream pop emotional keyboard drums",
    },
    { key: "anime", value: "clear 动画 high-pitched 声乐 有趣 打击乐器 欢乐" },
    { key: "hiphop", value: "hiphop synthesizer tough rap street bass piano" },
    {
        key: "kpop",
        value: "bright R&B Love airy K-pop Dance Synthesizer Keyboard  Piano",
    },
    {
        key: "cantonese",
        value: "Cantonese Melancholic Classical airy Piano bright Pop Nostalgic Violin",
    },
    {
        key: "rock",
        value: "full mellow electric guitar rock energetic Mandarin rebellious drums clear range vocal",
    },
    {
        key: "metal",
        value: "Bass Metalcore Thrash Metal Furious bright Angry aggressive Guitar",
    },
];

const MusicGenNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const { texts } = data as { texts: string[] };

    const expands = useFlow((s) => s.expands);

    // 使用新的Hook来管理状态持久化
    const [state, setState] = useNodeState(
        {
            voice: voiceOptions[0]!.value,
            style: styleOptions[0]!.value,
        },
        data,
    );
    const { voice, style } = state;

    // 自定义任务更新处理 - 因为返回 output_files 数组
    const handleTaskUpdate = useCallback(
        (task: any) => {
            if (task?.status === "COMPLETED") {
                const audioKeys = task?.data?.output_files as string[];
                if (audioKeys && audioKeys.length > 0) {
                    expands("", [
                        { type: "audioNode", data: { fileKeys: audioKeys } },
                    ]);
                }
                return true; // 已处理，跳过默认逻辑
            }
            return false;
        },
        [expands],
    );

    const workflowConfig = {
        feature: "generate_music",
        label: "视频配乐",
        outputType: "audioNode",
        outputField: "fileKeys" as const,
        supportsBatch: true,
        batchParam: "lyrics",
        paramMappings: {
            lyrics: {
                sources: [upstreamParam("textNode", "texts")],
                required: true,
            },
            genre: {
                sources: [configParam("genre")],
            },
        },
    };

    return (
        <BaseNode
            selected={selected}
            data={data}
            workflowConfig={{
                ...workflowConfig,
                title: t("titles.musicGen"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: t("actions.generateMusic"),
                executeDisabled: !texts?.length,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamTexts = ctx?.getAllUpstreamData(
                        "textNode",
                        "texts",
                    ) as string[] | undefined;
                    const inputTexts =
                        upstreamTexts && upstreamTexts.length > 0
                            ? upstreamTexts
                            : texts;
                    return (
                        inputTexts?.map((text) => ({
                            lyrics: text,
                            genre: [style, voice].join(" "),
                        })) || []
                    );
                },
                onTaskUpdate: handleTaskUpdate,
            }}
        >
            <Card
                className="p-5 nodrag"
                onPointerDown={(e) => e.stopPropagation()}
            >
                {/* 选择音色的下拉按钮 */}
                <div className="mb-4 flex flex-wrap items-center gap-3">
                    <label
                        htmlFor="voice-select"
                        className="text-sm text-muted-foreground whitespace-nowrap"
                    >
                        {t("musicGen.singer")}
                    </label>
                    <Select
                        value={voice}
                        onValueChange={(value) => setState({ voice: value })}
                    >
                        <SelectTrigger id="voice-select" className="w-36 h-9">
                            <SelectValue
                                placeholder={t("musicGen.selectVoice")}
                            />
                        </SelectTrigger>
                        <SelectContent>
                            {voiceOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {t(`musicGen.${opt.key}`)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                    <label
                        htmlFor="voice-select"
                        className="text-sm text-muted-foreground whitespace-nowrap"
                    >
                        {t("musicGen.genre")}
                    </label>
                    <Select
                        value={style}
                        onValueChange={(value) => setState({ style: value })}
                    >
                        <SelectTrigger id="voice-select" className="w-36 h-9">
                            <SelectValue
                                placeholder={t("musicGen.selectStyle")}
                            />
                        </SelectTrigger>
                        <SelectContent>
                            {styleOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {t(`musicGen.${opt.key}`)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </Card>
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

export default memo(MusicGenNode);
