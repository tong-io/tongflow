import { Clock, Music, Tag } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";

const LANGUAGE_OPTIONS = [
    { value: "zh", label: "中文" },
    { value: "en", label: "English" },
    { value: "cantonese", label: "粤语" },
    { value: "ja", label: "日本語" },
    { value: "ko", label: "한국어" },
    { value: "fr", label: "Français" },
    { value: "es", label: "Español" },
];

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

type TextGenMusicNodeProps = TongflowPluginNodeProps<
    "gen-music",
    "textGenMusicNode"
>;

const TextGenMusicNode = ({ selected, data }: TextGenMusicNodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("gen-music", {
        // Both `tags` and `lyrics` are scalar strings that may be fed from
        // upstream textNodes via the auto-rendered `in:tags` / `in:lyrics`
        // handles. AbiHandles renders one handle per ABI input, so the user
        // connects each upstream textNode to the handle they want to fill.
        tags: handle({ nodeType: "textNode", path: "texts[0]" }),
        lyrics: handle({ nodeType: "textNode", path: "texts[0]" }),
    });

    const songTitle = (form.state.songTitle as string | undefined) ?? "";
    const tags = (form.state.tags as string | undefined) ?? "";
    const lyrics = (form.state.lyrics as string | undefined) ?? "";
    const language = (form.state.language as string | undefined) ?? "zh";
    const keyscale = (form.state.keyscale as string | undefined) ?? "C major";
    const bpm = form.state.bpm == null ? "auto" : String(form.state.bpm);
    const duration = (form.state.duration as number | undefined) ?? 30;

    const canExecute =
        !!songTitle.trim() ||
        !!tags.trim() ||
        !!lyrics.trim() ||
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
                    </div>
                    <Input
                        placeholder={t("music.tagsPlaceholder")}
                        value={tags}
                        onChange={(e) => form.set("tags", e.target.value)}
                        className="h-8 text-xs"
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
                    </div>
                    <Textarea
                        placeholder={t("music.lyricsPlaceholder")}
                        value={lyrics}
                        onChange={(e) => form.set("lyrics", e.target.value)}
                        className="min-h-[120px] resize-none text-xs"
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
                                BPM
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
                                form.set("songTitle", e.target.value)
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
        </AbiNodeShell>
    );
};

TextGenMusicNode.displayName = "TextGenMusicNode";

export default memo(TextGenMusicNode);
