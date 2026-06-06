import type { Edge } from "@xyflow/react";
import { useNodeId, useNodesData, useStore } from "@xyflow/react";
import { Clock, Maximize2, Music, Tag, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useAbiForm } from "@/hooks/use-abi-form";
import { handle } from "@/lib/abi/sources";
import { coerceBaseNodeData } from "@/lib/workflow/flow-node-data";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";

function buildLanguageOptions(tLang: (key: string) => string) {
    return [
        { value: "zh", label: tLang("zh") },
        { value: "en", label: tLang("en") },
        { value: "cantonese", label: tLang("yue") },
        { value: "ja", label: tLang("ja") },
        { value: "ko", label: tLang("ko") },
        { value: "fr", label: tLang("fr") },
        { value: "es", label: tLang("es") },
    ];
}

function buildBpmOptions(autoLabel: string) {
    return [
        { value: "auto", label: autoLabel },
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
}

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

const DEFAULT_BPM = 140;
const DEFAULT_KEYSCALE = "C minor";

interface FullScreenEditorProps {
    title: string;
    value: string;
    readOnly: boolean;
    placeholder?: string;
    onClose: () => void;
    onSave: (next: string) => void;
}

const FullScreenEditor = ({
    title,
    value,
    readOnly,
    placeholder,
    onClose,
    onSave,
}: FullScreenEditorProps) => {
    const [mounted, setMounted] = useState(false);
    const [draft, setDraft] = useState(value);

    useEffect(() => {
        setMounted(true);
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "unset";
        };
    }, []);

    useEffect(() => {
        if (readOnly) setDraft(value);
    }, [readOnly, value]);

    if (!mounted) return null;

    const handleClose = () => {
        if (!readOnly && draft !== value) onSave(draft);
        onClose();
    };

    return createPortal(
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl w-11/12 h-5/6 max-h-screen flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {title}
                    </h2>
                    <Button size="sm" variant="ghost" onClick={handleClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>
                <div className="flex-1 overflow-hidden p-6 bg-gray-50 dark:bg-slate-800">
                    <textarea
                        className="w-full h-full resize-none rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 p-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 whitespace-pre-wrap break-words"
                        value={draft}
                        readOnly={readOnly}
                        placeholder={placeholder}
                        onChange={(e) => setDraft(e.target.value)}
                    />
                </div>
            </div>
        </div>,
        document.body,
    );
};

type TextGenMusicNodeProps = TongflowPluginNodeProps<
    "gen-music",
    "textGenMusicNode"
>;

const TextGenMusicNode = ({ selected, data }: TextGenMusicNodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const tModal = useTranslations("Workspace.nodes.modal");
    const tLang = useTranslations("Languages");
    const LANGUAGE_OPTIONS = buildLanguageOptions(tLang);
    const BPM_OPTIONS = buildBpmOptions(t("music.auto"));
    const form = useAbiForm("gen-music", {
        // Both `tags` and `lyrics` are scalar strings that may be fed from
        // upstream textNodes via the auto-rendered `in:tags` / `in:lyrics`
        // handles. AbiHandles renders one handle per ABI input, so the user
        // connects each upstream textNode to the handle they want to fill.
        tags: handle({ nodeType: "textNode", path: "texts[0]" }),
        lyrics: handle({ nodeType: "textNode", path: "texts[0]" }),
    });

    const nodeId = useNodeId();
    const edges = useStore((state) => state.edges as Edge[]);

    const { tagsSourceId, lyricsSourceId } = useMemo(() => {
        if (!nodeId) return { tagsSourceId: null, lyricsSourceId: null };
        let tagsSrc: string | null = null;
        let lyricsSrc: string | null = null;
        for (const e of edges) {
            if (e.target !== nodeId) continue;
            if (e.targetHandle === "in:tags") tagsSrc = e.source;
            else if (e.targetHandle === "in:lyrics") lyricsSrc = e.source;
        }
        return { tagsSourceId: tagsSrc, lyricsSourceId: lyricsSrc };
    }, [edges, nodeId]);

    const upstreamIds = useMemo(
        () => [tagsSourceId, lyricsSourceId].filter((v): v is string => !!v),
        [tagsSourceId, lyricsSourceId],
    );
    const upstreamNodes = useNodesData(upstreamIds);

    const tagsUpstream = useMemo(() => {
        if (!tagsSourceId) return null;
        const n = upstreamNodes.find((u) => u.id === tagsSourceId);
        if (!n || n.type !== "textNode") return null;
        return coerceBaseNodeData(n.data).texts?.[0] ?? "";
    }, [tagsSourceId, upstreamNodes]);

    const lyricsUpstream = useMemo(() => {
        if (!lyricsSourceId) return null;
        const n = upstreamNodes.find((u) => u.id === lyricsSourceId);
        if (!n || n.type !== "textNode") return null;
        return coerceBaseNodeData(n.data).texts?.[0] ?? "";
    }, [lyricsSourceId, upstreamNodes]);

    const tagsLocal = (form.state.tags as string | undefined) ?? "";
    const lyricsLocal = (form.state.lyrics as string | undefined) ?? "";
    const tagsDisplay = tagsUpstream !== null ? tagsUpstream : tagsLocal;
    const lyricsDisplay =
        lyricsUpstream !== null ? lyricsUpstream : lyricsLocal;
    const language = (form.state.language as string | undefined) ?? "zh";
    const keyscale =
        (form.state.keyscale as string | undefined) ?? DEFAULT_KEYSCALE;
    const bpm =
        form.state.bpm == null ? String(DEFAULT_BPM) : String(form.state.bpm);
    const duration = (form.state.duration as number | undefined) ?? 30;

    // Persist non-ABI-required defaults so the workflow exporter / runtime
    // sees the same values the user sees in the UI.
    useEffect(() => {
        if (form.state.bpm == null) form.set("bpm", DEFAULT_BPM);
    }, [form.state.bpm, form.set]);
    useEffect(() => {
        if (form.state.keyscale == null) form.set("keyscale", DEFAULT_KEYSCALE);
    }, [form.state.keyscale, form.set]);

    const [tagsExpanded, setTagsExpanded] = useState(false);
    const [lyricsExpanded, setLyricsExpanded] = useState(false);

    const canExecute =
        !!tagsDisplay.trim() ||
        !!lyricsDisplay.trim() ||
        !!(data.texts?.[0] && String(data.texts[0]).trim());

    return (
        <AbiNodeShell
            feature="gen-music"
            sourceSpec={{
                tags: handle({ nodeType: "textNode", path: "texts[0]" }),
                lyrics: handle({ nodeType: "textNode", path: "texts[0]" }),
            }}
            form={form}
            selected={selected}
            className="min-w-[520px]"
            data={data}
            title={t("titles.textGenMusic")}
            icon={<Music className="h-5 w-5" />}
            executeLabel={t("actions.generateMusic")}
            executeDisabled={!canExecute}
        >
            <div className="p-4 space-y-4">
                <Card className="p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                        <Label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Tag className="h-4 w-4" />
                            {t("music.styleSettings")}
                        </Label>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => setTagsExpanded(true)}
                            title={tModal("fullScreenPreview")}
                        >
                            <Maximize2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                    <Textarea
                        placeholder={
                            tagsUpstream !== null
                                ? t("music.fromUpstreamReadonly")
                                : t("music.tagsPlaceholder")
                        }
                        value={tagsDisplay}
                        onChange={(e) => form.set("tags", e.target.value)}
                        readOnly={tagsUpstream !== null}
                        rows={2}
                        className="max-h-[80px] resize-none text-xs whitespace-pre-wrap break-words overflow-auto"
                    />
                    <p className="text-xs text-muted-foreground mt-1.5">
                        {t("music.tagsHint")}
                    </p>
                </Card>

                <Card className="p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("music.inputLyrics")}
                        </Label>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => setLyricsExpanded(true)}
                            title={tModal("fullScreenPreview")}
                        >
                            <Maximize2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                    <Textarea
                        placeholder={
                            lyricsUpstream !== null
                                ? t("music.fromUpstreamReadonly")
                                : t("music.lyricsPlaceholder")
                        }
                        value={lyricsDisplay}
                        onChange={(e) => form.set("lyrics", e.target.value)}
                        readOnly={lyricsUpstream !== null}
                        className="min-h-[120px] max-h-[180px] resize-none text-xs overflow-auto whitespace-pre-wrap break-words"
                    />
                </Card>

                <Card className="p-3">
                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">
                                {t("music.language")}
                            </Label>
                            <Select
                                value={language}
                                onValueChange={(v) => form.set("language", v)}
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
                                onValueChange={(v) => form.set("keyscale", v)}
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
                                {t("music.bpm")}
                            </Label>
                            <Select
                                value={bpm}
                                onValueChange={(v) =>
                                    form.set(
                                        "bpm",
                                        v === "auto" ? undefined : Number(v),
                                    )
                                }
                            >
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue
                                        placeholder={t("music.auto")}
                                    />
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
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                <Clock className="h-4 w-4" />
                                {t("music.audioDuration")}
                            </Label>
                            <span className="text-xs font-medium">
                                {duration >= 60
                                    ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`
                                    : `${duration}s`}
                            </span>
                        </div>
                        <Slider
                            value={[duration]}
                            onValueChange={([v]) => {
                                const snapPoint = Math.round(v / 30) * 30;
                                const snapped =
                                    Math.abs(v - snapPoint) <= 5
                                        ? snapPoint
                                        : v;
                                form.set(
                                    "duration",
                                    Math.max(30, Math.min(240, snapped)),
                                );
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

            {tagsExpanded && (
                <FullScreenEditor
                    title={t("music.styleSettings")}
                    value={tagsDisplay}
                    readOnly={tagsUpstream !== null}
                    placeholder={t("music.tagsPlaceholder")}
                    onClose={() => setTagsExpanded(false)}
                    onSave={(next) => form.set("tags", next)}
                />
            )}
            {lyricsExpanded && (
                <FullScreenEditor
                    title={t("music.inputLyrics")}
                    value={lyricsDisplay}
                    readOnly={lyricsUpstream !== null}
                    placeholder={t("music.lyricsPlaceholder")}
                    onClose={() => setLyricsExpanded(false)}
                    onSave={(next) => form.set("lyrics", next)}
                />
            )}
        </AbiNodeShell>
    );
};

TextGenMusicNode.displayName = "TextGenMusicNode";

export default memo(TextGenMusicNode);
