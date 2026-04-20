import {
    Handle,
    Position,
    useNodeId,
    useNodesData,
    type NodeProps,
} from "@xyflow/react";
import { memo, useMemo } from "react";
import { Atom, Type, Music } from "lucide-react";
import { getR2Url } from "@/lib/r2-utils";

import { BaseNode } from "../base/base-node";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    SelectValue,
} from "@/components/ui/select";
import { useNodeState } from "@/hooks/use-node-data";
import { upstreamParam, configParam } from "@/utils/node-execution-config";
import { useR2AsyncLoader } from "@/hooks/use-r2-async-loader";
import { useTranslations } from "next-intl";
import useFlow from "@/hooks/use-flow";
import { clampToAllowedModel } from "@/utils/node-model-feature";
import { NodeModelSelect } from "../base/node-model-select";
import { multiModelSelectOptions } from "@/utils/node-model-select-label";

const TEXT_AUDIO_SPEECH_FEATURES = [
    "text_gen_speech_clone",
    "text_gen_speech_emotion",
    "text_gen_speech_style",
] as const;

function resolveFeatureFromEmotionStyle(
    emotion: string,
    style: string,
): (typeof TEXT_AUDIO_SPEECH_FEATURES)[number] {
    if (style) return "text_gen_speech_style";
    if (emotion) return "text_gen_speech_emotion";
    return "text_gen_speech_clone";
}

// 情感/风格选项 (使用 "none" 代替空字符串，因为 Select 组件不支持空值)
const emotionOptions = [
    { label: "无", value: "none" },
    { label: "开心", value: "happy", desc: "Expressing happiness" },
    { label: "生气", value: "angry", desc: "Expressing anger" },
    { label: "伤心", value: "sad", desc: "Expressing sadness" },
    { label: "恐惧", value: "fear", desc: "Expressing fear" },
    { label: "惊讶", value: "surprised", desc: "Expressing surprise" },
    { label: "困惑", value: "confusion", desc: "Expressing confusion" },
    {
        label: "共情",
        value: "empathy",
        desc: "Expressing empathy and understanding",
    },
    { label: "尴尬", value: "embarrass", desc: "Expressing embarrassment" },
    {
        label: "兴奋",
        value: "excited",
        desc: "Expressing excitement and enthusiasm",
    },
    {
        label: "氮丧",
        value: "depressed",
        desc: "Expressing a depressed or discouraged mood",
    },
    {
        label: "敬佩",
        value: "admiration",
        desc: "Expressing admiration or respect",
    },
    {
        label: "冷淡",
        value: "coldness",
        desc: "Expressing coldness and indifference",
    },
];

// 风格选项 (使用 "none" 代替空字符串)
const styleOptions = [
    { label: "无", value: "none" },
    {
        label: "严肃",
        value: "serious",
        desc: "Speaking in a serious or solemn manner",
    },
    {
        label: "傲慢",
        value: "arrogant",
        desc: "Speaking in an arrogant manner",
    },
    { label: "童声", value: "child", desc: "Speaking in a childlike manner" },
    {
        label: "老年",
        value: "older",
        desc: "Speaking in an elderly-sounding manner",
    },
    {
        label: "少女",
        value: "girl",
        desc: "Speaking in a light, youthful feminine manner",
    },
    {
        label: "纯真",
        value: "pure",
        desc: "Speaking in a pure, innocent manner",
    },
    {
        label: "御姐",
        value: "sister",
        desc: "Speaking in a mature, confident feminine manner",
    },
    {
        label: "甜美",
        value: "sweet",
        desc: "Speaking in a sweet, lovely manner",
    },
    {
        label: "夸张",
        value: "exaggerated",
        desc: "Speaking in an exaggerated, dramatic manner",
    },
    {
        label: "空灵",
        value: "ethereal",
        desc: "Speaking in a soft, airy, dreamy manner",
    },
    {
        label: "耳语",
        value: "whisper",
        desc: "Speaking in a whispering, very soft manner",
    },
    {
        label: "豪爽",
        value: "generous",
        desc: "Speaking in a hearty, outgoing, and straight-talking manner",
    },
    {
        label: "朗诵",
        value: "recite",
        desc: "Speaking in a clear, well-paced, poetry-reading manner",
    },
    {
        label: "撒娇",
        value: "act_coy",
        desc: "Speaking in a sweet, playful, and endearing manner",
    },
    {
        label: "温暖",
        value: "warm",
        desc: "Speaking in a warm, friendly manner",
    },
    { label: "害羞", value: "shy", desc: "Speaking in a shy, timid manner" },
    {
        label: "安慰",
        value: "comfort",
        desc: "Speaking in a comforting, reassuring manner",
    },
    {
        label: "权威",
        value: "authority",
        desc: "Speaking in an authoritative, commanding manner",
    },
    {
        label: "闲聊",
        value: "chat",
        desc: "Speaking in a casual, conversational manner",
    },
    {
        label: "电台",
        value: "radio",
        desc: "Speaking in a radio-broadcast manner",
    },
    {
        label: "深情",
        value: "soulful",
        desc: "Speaking in a heartfelt, deeply emotional manner",
    },
    {
        label: "温柔",
        value: "gentle",
        desc: "Speaking in a gentle, soft manner",
    },
    {
        label: "故事",
        value: "story",
        desc: "Speaking in a narrative, audiobook-style manner",
    },
    {
        label: "生动",
        value: "vivid",
        desc: "Speaking in a lively, expressive manner",
    },
    {
        label: "主持",
        value: "program",
        desc: "Speaking in a show-host/presenter manner",
    },
    {
        label: "新闻",
        value: "news",
        desc: "Speaking in a news broadcasting manner",
    },
    {
        label: "广告",
        value: "advertising",
        desc: "Speaking in a polished, high-end commercial voiceover manner",
    },
    {
        label: "咆哮",
        value: "roar",
        desc: "Speaking in a loud, deep, roaring manner",
    },
    { label: "低语", value: "murmur", desc: "Speaking in a quiet, low manner" },
    {
        label: "呐喊",
        value: "shout",
        desc: "Speaking in a loud, sharp, shouting manner",
    },
    {
        label: "低沉",
        value: "deeply",
        desc: "Speaking in a deep and low-pitched tone",
    },
    {
        label: "高亢",
        value: "loudly",
        desc: "Speaking in a loud and high-pitched tone",
    },
];

// 媒体缩略图组件
const MediaThumbnail = memo(
    ({ fileKey, label }: { fileKey?: string; label: string }) => {
        const { url } = useR2AsyncLoader(fileKey, { priority: "high" });

        return (
            <div className="flex flex-col items-center gap-1.5">
                <div className="relative w-16 h-16 rounded-md border-2 border-gray-300 overflow-hidden bg-gray-100 transition-colors">
                    <div className="flex items-center justify-center h-full w-full bg-blue-50">
                        <div className="text-xs text-blue-600 font-semibold">
                            🎵
                        </div>
                    </div>
                    <div className="absolute inset-0 bg-black/0 transition-colors" />
                </div>
                <div className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                    {label}
                </div>
            </div>
        );
    },
);

MediaThumbnail.displayName = "MediaThumbnail";

const TextAudioGenSpeechNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const updates = useFlow((s) => s.updates);
    const id = useNodeId()!;
    const { ids = [] } = data as { ids?: string[] };
    const fromNodes = useNodesData(ids);

    // 获取上游文本数据
    const textNode = fromNodes.find((node) => node.type === "textNode");
    const texts = (textNode?.data as any)?.texts as string[] | undefined;

    // 获取上游音频数据作为reference
    const audio = fromNodes.find((node) => node.type === "audioNode");
    const audioFileKey = (audio?.data as any)?.fileKeys?.[0];

    // 使用新的Hook来管理状态持久化
    const [state, setState] = useNodeState(
        {
            emotion: "",
            style: "",
        },
        data,
    );
    const { emotion, style } = state;

    const resolvedFromEmotionStyle = resolveFeatureFromEmotionStyle(emotion, style);
    const featureName = clampToAllowedModel(
        (data as { feature?: string }).feature,
        TEXT_AUDIO_SPEECH_FEATURES,
        resolvedFromEmotionStyle,
    );

    // 补充 outputType 和 outputField 用于 BaseNode 自动处理任务完成
    const dataWithOutput = useMemo(
        () => ({
            ...data,
            outputType: "audioNode",
            outputField: "fileKeys",
        }),
        [data],
    );

    // 工作流执行配置
    const workflowConfig = {
        feature: featureName,
        label: "文本音频生成语音",
        outputType: "audioNode",
        outputField: "fileKeys" as const,
        supportsBatch: true,
        batchParam: "text",
        paramMappings: {
            text: {
                sources: [upstreamParam("textNode", "texts")],
                required: true,
            },
            audio: {
                sources: [upstreamParam("audioNode", "fileKeys[0]")],
                required: true,
            },
            emotion: {
                sources: [configParam("emotion", "")],
                required: false,
            },
            style: {
                sources: [configParam("style", "")],
                required: false,
            },
        },
    };

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={dataWithOutput}
            workflowConfig={useMemo(
                () => ({
                    ...workflowConfig,
                    feature: featureName,
                    title: t("titles.textAudioGenSpeech"),
                    icon: <Atom className="h-5 w-5" />,
                    executeLabel: t("actions.generateSpeech"),
                    executeDisabled: !texts?.length || !audioFileKey,
                    getPrompts: () =>
                        texts && texts.length > 0 && audioFileKey
                            ? texts.map((text) => ({
                                  audio: getR2Url(audioFileKey),
                                  text: text,
                                  emotion: emotion || undefined,
                                  style: style || undefined,
                              }))
                            : [],
                }),
                [audioFileKey, texts, emotion, style, featureName, t],
            )}
        >
            <div className="p-4 space-y-4">
                <NodeModelSelect
                    value={featureName}
                    onValueChange={(v) => {
                        if (v === "text_gen_speech_clone") {
                            setState({ emotion: "", style: "" });
                            updates(id, { ...data, feature: v });
                            return;
                        }
                        if (v === "text_gen_speech_emotion") {
                            setState({
                                style: "",
                                emotion: emotion || "happy",
                            });
                            updates(id, {
                                ...data,
                                feature: v,
                            });
                            return;
                        }
                        setState({
                            emotion: "",
                            style: style || "serious",
                        });
                        updates(id, { ...data, feature: v });
                    }}
                    options={multiModelSelectOptions(
                        TEXT_AUDIO_SPEECH_FEATURES,
                        (k) => t(k as Parameters<typeof t>[0]),
                    )}
                />
                {/* 媒体展示区 */}
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("compose.inputData")}
                        </Label>
                        <div className="flex gap-4">
                            {/* 文本图标 */}
                            <div className="flex flex-col items-center gap-1.5">
                                <div className="relative w-16 h-16 rounded-md border-2 border-gray-300 overflow-hidden bg-gray-100 transition-colors">
                                    <div className="flex items-center justify-center h-full w-full bg-green-50">
                                        <Type className="w-6 h-6 text-green-600" />
                                    </div>
                                </div>
                                <div className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                                    {t("compose.text")}
                                </div>
                            </div>
                            {/* 音频图标 */}
                            <div className="flex flex-col items-center gap-1.5">
                                <div className="relative w-16 h-16 rounded-md border-2 border-gray-300 overflow-hidden bg-gray-100 transition-colors">
                                    <div className="flex items-center justify-center h-full w-full bg-blue-50">
                                        <Music className="w-6 h-6 text-blue-600" />
                                    </div>
                                </div>
                                <div className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                                    {t("compose.audio")}
                                </div>
                            </div>
                        </div>
                        {(!texts?.length || !audioFileKey) && (
                            <p className="text-xs text-red-500">
                                {t("compose.connectTextAudioNode")}
                            </p>
                        )}
                    </div>
                </Card>

                <Card
                    className="p-3 nodrag"
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    {/* 情感选择框 */}
                    <div className="mb-4 flex items-center gap-3">
                        <label
                            htmlFor="emotion-select"
                            className="text-sm text-muted-foreground whitespace-nowrap"
                        >
                            {t("compose.emotion")}
                        </label>
                        <Select
                            value={emotion || "none"}
                            onValueChange={(value) => {
                                const nextEmotion = value === "none" ? "" : value;
                                setState({
                                    emotion: nextEmotion,
                                    style: "",
                                });
                                const nextFeature =
                                    resolveFeatureFromEmotionStyle(nextEmotion, "");
                                updates(id, {
                                    ...data,
                                    feature: nextFeature,
                                });
                            }}
                        >
                            <SelectTrigger
                                id="emotion-select"
                                className="w-full h-9"
                            >
                                <SelectValue
                                    placeholder={t("compose.selectEmotion")}
                                />
                            </SelectTrigger>
                            <SelectContent>
                                {emotionOptions.map((opt) => (
                                    <SelectItem
                                        key={opt.value}
                                        value={opt.value}
                                    >
                                        <span>{opt.label}</span>
                                        {opt.desc && (
                                            <span className="ml-2 text-xs text-muted-foreground">
                                                {opt.desc}
                                            </span>
                                        )}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {/* 风格选择框 */}
                    <div className="flex items-center gap-3">
                        <label
                            htmlFor="style-select"
                            className="text-sm text-muted-foreground whitespace-nowrap"
                        >
                            {t("compose.style")}
                        </label>
                        <Select
                            value={style || "none"}
                            onValueChange={(value) => {
                                const nextStyle = value === "none" ? "" : value;
                                setState({
                                    style: nextStyle,
                                    emotion: "",
                                });
                                const nextFeature = resolveFeatureFromEmotionStyle(
                                    "",
                                    nextStyle,
                                );
                                updates(id, {
                                    ...data,
                                    feature: nextFeature,
                                });
                            }}
                        >
                            <SelectTrigger
                                id="style-select"
                                className="w-full h-9"
                            >
                                <SelectValue
                                    placeholder={t("compose.selectStyle")}
                                />
                            </SelectTrigger>
                            <SelectContent>
                                {styleOptions.map((opt) => (
                                    <SelectItem
                                        key={opt.value}
                                        value={opt.value}
                                    >
                                        <span>{opt.label}</span>
                                        {opt.desc && (
                                            <span className="ml-2 text-xs text-muted-foreground">
                                                {opt.desc}
                                            </span>
                                        )}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </Card>
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

TextAudioGenSpeechNode.displayName = "TextAudioGenSpeechNode";

export default memo(TextAudioGenSpeechNode);
