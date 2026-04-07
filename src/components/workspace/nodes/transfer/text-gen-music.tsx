import {
    Handle,
    Position,
    useNodeId,
    useNodesData,
    useStore,
    type Edge,
    type NodeProps,
} from "@xyflow/react";
import { memo, useMemo } from "react";
import { Clock, Music, Tag } from "lucide-react";

import { BaseNode } from "../base/base-node";
import { useNodeState } from "@/hooks/use-node-data";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    upstreamParam,
    configParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { TEXT_GEN_MUSIC_HANDLES } from "@/utils/connection-rules";
import { useTranslations } from "next-intl";

// 语言选项
const LANGUAGE_OPTIONS = [
    { value: "zh", label: "中文" },
    { value: "en", label: "English" },
    { value: "cantonese", label: "粤语" },
    { value: "ja", label: "日本語" },
    { value: "ko", label: "한국어" },
    { value: "fr", label: "Français" },
    { value: "es", label: "Español" },
];

// BPM 选项
const BPM_OPTIONS = [
    { value: "auto", label: "Auto" },
    { value: "60", label: "60" },
    { value: "80", label: "80" },
    { value: "90", label: "90" },
    { value: "100", label: "100" },
    { value: "110", label: "110" },
    { value: "120", label: "120" },
    { value: "130", label: "130" },
    { value: "140", label: "140" },
    { value: "160", label: "160" },
    { value: "180", label: "180" },
];

// 调式选项
const KEYSCALE_OPTIONS = [
    "C major",
    "C minor",
    "D major",
    "D minor",
    "E major",
    "E minor",
    "F major",
    "F minor",
    "G major",
    "G minor",
    "A major",
    "A minor",
    "B major",
    "B minor",
];

interface MusicNodeState {
    songTitle: string;
    tags: string;
    /** 未连接 in:lyric 时的本地歌词 */
    lyrics: string;
    selectedDuration: string;
    language: string;
    keyscale: string;
    bpm: string;
}

interface TextGenMusicNodeProps extends NodeProps {
    data: {
        texts?: string[];
        selectedDuration?: string;
        lyrics?: string;
    } & Partial<MusicNodeState>;
}

// 工作流执行配置
const workflowConfig = {
    feature: "gen_music",
    label: "文本生成音乐",
    outputType: "audioNode",
    outputField: "fileKeys" as const,
    paramMappings: {
        prompt: {
            sources: [configParam("prompt")],
        },
        styleTags: {
            sources: [
                upstreamParam("textNode", "texts[0]", {
                    targetHandle: TEXT_GEN_MUSIC_HANDLES.style,
                }),
                configParam("tags"),
            ],
        },
        lyricsFromUpstream: {
            sources: [
                upstreamParam("textNode", "texts[0]", {
                    targetHandle: TEXT_GEN_MUSIC_HANDLES.lyric,
                }),
            ],
        },
    },
};

function firstTextFromTextNodeData(
    nodesData: Array<{ data?: unknown }> | null | undefined,
): string {
    if (!nodesData?.[0]?.data) return "";
    const texts = (nodesData[0].data as { texts?: string[] }).texts;
    return Array.isArray(texts) && texts[0] != null ? String(texts[0]) : "";
}

/**
 * 直接从 edges 解析曲风/歌词入边（含 targetHandle 为空时的 loose 边）。
 * 显式 in:style / in:lyric 优先；剩余 loose 按顺序先补曲风、再补歌词，
 * 避免「已连歌词后再连一条无 handle 的曲风边」时曲风被丢掉。
 */
function resolveMusicIncomingEdges(
    edges: Edge[],
    nodeId: string,
    nodeLookup: Map<string, { type?: string | null }>,
): { styleSourceId: string | null; lyricSourceId: string | null } {
    const incoming = edges.filter((e) => {
        if (e.target !== nodeId) return false;
        const src = nodeLookup.get(e.source);
        return src?.type === "textNode";
    });

    let styleEdge: Edge | undefined;
    let lyricEdge: Edge | undefined;
    const loose: Edge[] = [];

    for (const e of incoming) {
        const th = e.targetHandle;
        if (th === TEXT_GEN_MUSIC_HANDLES.style) {
            styleEdge = e;
        } else if (th === TEXT_GEN_MUSIC_HANDLES.lyric) {
            lyricEdge = e;
        } else if (th == null || th === "") {
            loose.push(e);
        }
    }

    // 未标明 handle 的边按顺序补全缺的一侧：常见情况是「曲风=null + 歌词=in:lyric」
    const unassigned = [...loose];
    if (!styleEdge && unassigned.length >= 1) {
        styleEdge = unassigned.shift();
    }
    if (!lyricEdge && unassigned.length >= 1) {
        lyricEdge = unassigned.shift();
    }

    return {
        styleSourceId: styleEdge?.source ?? null,
        lyricSourceId: lyricEdge?.source ?? null,
    };
}

function useMusicUpstreamResolved(nodeId: string | null) {
    const edges = useStore((s) => s.edges) as Edge[];
    const nodeLookup = useStore((s) => s.nodeLookup);

    const { styleSourceId, lyricSourceId } = useMemo(
        () => resolveMusicIncomingEdges(edges, nodeId ?? "", nodeLookup),
        [edges, nodeId, nodeLookup],
    );

    const styleDataIds = useMemo(
        () => (styleSourceId ? [styleSourceId] : []),
        [styleSourceId],
    );
    const lyricDataIds = useMemo(
        () => (lyricSourceId ? [lyricSourceId] : []),
        [lyricSourceId],
    );

    const styleNodesData = useNodesData(styleDataIds);
    const lyricNodesData = useNodesData(lyricDataIds);

    const styleText = firstTextFromTextNodeData(styleNodesData);
    const lyricText = firstTextFromTextNodeData(lyricNodesData);

    return {
        styleSourceId,
        lyricSourceId,
        styleText,
        lyricText,
        hasStyleUpstream: styleSourceId != null,
        hasLyricUpstream: lyricSourceId != null,
    };
}

const TextGenMusicNode = ({ selected, data }: TextGenMusicNodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const { texts = [] } = data;
    const nodeId = useNodeId();

    const { styleText, lyricText, hasStyleUpstream, hasLyricUpstream } =
        useMusicUpstreamResolved(nodeId ?? null);

    const styleConnected = hasStyleUpstream;
    const lyricConnected = hasLyricUpstream;

    const [state, setState] = useNodeState<MusicNodeState>(
        {
            songTitle: "",
            tags: "",
            lyrics: "",
            selectedDuration: "30",
            language: "zh",
            keyscale: "C major",
            bpm: "auto",
        },
        data,
    );

    const {
        songTitle,
        tags,
        lyrics,
        selectedDuration,
        language,
        keyscale,
        bpm,
    } = state;

    const canExecute =
        !!songTitle.trim() ||
        !!tags.trim() ||
        !!lyrics.trim() ||
        !!(texts[0] && String(texts[0]).trim()) ||
        styleConnected ||
        lyricConnected;

    return (
        <BaseNode
            selected={selected}
            className="min-w-[520px]"
            data={data}
            workflowConfig={{
                ...workflowConfig,
                title: t("titles.textGenMusic"),
                icon: <Music className="h-5 w-5" />,
                executeLabel: t("actions.generateMusic"),
                executeDisabled: !canExecute,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamTexts = ctx?.getAllUpstreamData(
                        "textNode",
                        "texts",
                    ) as string[] | undefined;
                    const inputTexts =
                        upstreamTexts && upstreamTexts.length > 0
                            ? upstreamTexts
                            : texts;

                    const localTags = tags.trim();
                    const effectiveTags = hasStyleUpstream
                        ? String(styleText).trim()
                        : localTags;

                    const baseParams = {
                        tags: effectiveTags,
                        ...(bpm && bpm !== "auto" ? { bpm: Number(bpm) } : {}),
                        duration: Number(selectedDuration),
                        language,
                        keyscale,
                    };

                    const instrumentalLyrics =
                        songTitle.trim() || "[Instrumental]";

                    if (hasStyleUpstream && hasLyricUpstream) {
                        return [
                            {
                                ...baseParams,
                                tags: String(styleText).trim(),
                                lyrics: String(lyricText).trim(),
                            },
                        ];
                    }

                    if (hasStyleUpstream && !hasLyricUpstream) {
                        return [
                            {
                                ...baseParams,
                                tags: String(styleText).trim(),
                                lyrics: instrumentalLyrics,
                            },
                        ];
                    }

                    if (!hasStyleUpstream && hasLyricUpstream) {
                        return [
                            {
                                ...baseParams,
                                lyrics: String(lyricText).trim(),
                            },
                        ];
                    }

                    const manualLyrics =
                        lyrics.trim() ||
                        (texts[0] ? String(texts[0]).trim() : "");
                    if (manualLyrics) {
                        return [{ ...baseParams, lyrics: manualLyrics }];
                    }
                    return inputTexts.map((text) => ({
                        ...baseParams,
                        lyrics: text,
                    }));
                },
            }}
        >
            <div className="p-4 space-y-4">
                <Card className="p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                        <Label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Tag className="h-4 w-4" />
                            {t("music.styleSettings")}
                        </Label>
                        {styleConnected && (
                            <span className="text-[10px] text-muted-foreground shrink-0">
                                {t("music.fromUpstreamReadonly")}
                            </span>
                        )}
                    </div>
                    {styleConnected ? (
                        <Textarea
                            readOnly
                            value={styleText}
                            placeholder="—"
                            className="min-h-[72px] resize-none text-xs bg-muted/50 cursor-default border-dashed"
                        />
                    ) : (
                        <>
                            <Input
                                placeholder={t("music.tagsPlaceholder")}
                                value={tags}
                                onChange={(e) =>
                                    setState({ tags: e.target.value })
                                }
                                className="h-8 text-xs"
                            />
                            <p className="text-xs text-muted-foreground mt-1.5">
                                {t("music.tagsHint")}
                            </p>
                        </>
                    )}
                </Card>

                <Card className="p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("music.inputLyrics")}
                        </Label>
                        {lyricConnected && (
                            <span className="text-[10px] text-muted-foreground shrink-0">
                                {t("music.fromUpstreamReadonly")}
                            </span>
                        )}
                    </div>
                    {lyricConnected ? (
                        <Textarea
                            readOnly
                            value={lyricText}
                            placeholder="—"
                            className="min-h-[120px] resize-none text-xs bg-muted/50 cursor-default border-dashed"
                        />
                    ) : (
                        <Textarea
                            placeholder={t("music.lyricsPlaceholder")}
                            value={lyrics}
                            onChange={(e) =>
                                setState({ lyrics: e.target.value })
                            }
                            className="min-h-[120px] resize-none text-xs"
                        />
                    )}
                </Card>

                <Card className="p-3">
                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">
                                {t("music.language")}
                            </Label>
                            <Select
                                value={language}
                                onValueChange={(v) => setState({ language: v })}
                            >
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {LANGUAGE_OPTIONS.map((opt) => (
                                        <SelectItem
                                            key={opt.value}
                                            value={opt.value}
                                            className="text-xs"
                                        >
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">
                                {t("music.keyscale")}
                            </Label>
                            <Select
                                value={keyscale}
                                onValueChange={(v) => setState({ keyscale: v })}
                            >
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {KEYSCALE_OPTIONS.map((opt) => (
                                        <SelectItem
                                            key={opt}
                                            value={opt}
                                            className="text-xs"
                                        >
                                            {opt}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">
                                BPM
                            </Label>
                            <Select
                                value={bpm}
                                onValueChange={(v) => setState({ bpm: v })}
                            >
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Auto" />
                                </SelectTrigger>
                                <SelectContent>
                                    {BPM_OPTIONS.map((opt) => (
                                        <SelectItem
                                            key={opt.value}
                                            value={opt.value}
                                            className="text-xs"
                                        >
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </Card>

                <Card className="p-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                            {t("music.songTitle")}
                        </Label>
                        <Input
                            placeholder={t("music.songTitlePlaceholder")}
                            value={songTitle}
                            onChange={(e) =>
                                setState({
                                    songTitle: e.target.value,
                                })
                            }
                            className="h-8 text-xs"
                        />
                    </div>
                </Card>

                <Card className="p-3">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                <Clock className="h-4 w-4" />
                                {t("music.audioDuration")}
                            </Label>
                            <span className="text-xs font-medium">
                                {Number(selectedDuration) >= 60
                                    ? `${Math.floor(Number(selectedDuration) / 60)}:${String(Number(selectedDuration) % 60).padStart(2, "0")}`
                                    : `${selectedDuration}s`}
                            </span>
                        </div>
                        <Slider
                            value={[Number(selectedDuration)]}
                            onValueChange={([v]) => {
                                const snapPoint = Math.round(v / 30) * 30;
                                const snapped =
                                    Math.abs(v - snapPoint) <= 5
                                        ? snapPoint
                                        : v;
                                setState({
                                    selectedDuration: String(
                                        Math.max(30, Math.min(240, snapped)),
                                    ),
                                });
                            }}
                            min={30}
                            max={240}
                            step={1}
                            className="w-full"
                        />
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>0:30</span>
                            <span>1:00</span>
                            <span>1:30</span>
                            <span>2:00</span>
                            <span>2:30</span>
                            <span>3:00</span>
                            <span>3:30</span>
                            <span>4:00</span>
                        </div>
                    </div>
                </Card>
            </div>

            <div className="pointer-events-none absolute left-1 top-0 z-[1] h-full w-14">
                <span
                    className="absolute text-[10px] text-muted-foreground whitespace-nowrap"
                    style={{ top: "28%", transform: "translateY(-50%)" }}
                >
                    {t("music.handleStyle")}
                </span>
                <span
                    className="absolute text-[10px] text-muted-foreground whitespace-nowrap"
                    style={{ top: "52%", transform: "translateY(-50%)" }}
                >
                    {t("music.handleLyric")}
                </span>
            </div>
            <Handle
                type="target"
                position={Position.Left}
                id={TEXT_GEN_MUSIC_HANDLES.style}
                isConnectable={true}
                className="!z-[30]"
                style={{ top: "28%" }}
            />
            <Handle
                type="target"
                position={Position.Left}
                id={TEXT_GEN_MUSIC_HANDLES.lyric}
                isConnectable={true}
                className="!z-[30]"
                style={{ top: "52%" }}
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

TextGenMusicNode.displayName = "TextGenMusicNode";

export default memo(TextGenMusicNode);
