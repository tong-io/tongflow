/**
 * Shared voice + language picker for text-gen-speech-* nodes.
 *
 * Owns its own `voiceLang` UI state (not part of any ABI input) and exposes
 * the selected `voice` (a file_key string) via `value` / `onChange` so it
 * can be wired straight into `useAbiForm.bind("audio")` / similar.
 */

"use client";

import { Ear } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    crawledVoiceOptions,
    type VoiceLanguage,
} from "@/constants/voice-options";
import { getFileUrl } from "@/lib/file/url";
import { logger } from "@/lib/logger";

import {
    getDefaultVoice,
    getVoiceLangLabels,
    getVoiceOptions,
} from "../transfer/text-gen-speech-shared";

export interface VoiceLangSelectProps {
    value: string | undefined;
    onChange: (voice: string) => void;
    /** Initial language to seed the dropdown. Defaults to "zh". */
    defaultLang?: VoiceLanguage;
    /** Optional preview button visibility (defaults to true). */
    showPreview?: boolean;
    /** Optional extra speakers appended to the language list. */
    extraSpeakers?: { label: string; value: string }[];
    /** Optional aria/test id. */
    id?: string;
    className?: string;
}

export function VoiceLangSelect({
    value,
    onChange,
    defaultLang = "zh",
    showPreview = true,
    extraSpeakers = [],
    id = "voice-select",
    className,
}: VoiceLangSelectProps) {
    const t = useTranslations("Workspace.nodes");
    const tLang = useTranslations("Languages");
    const langLabels = useMemo(() => getVoiceLangLabels(tLang), [tLang]);
    const [voiceLang, setVoiceLang] = useState<VoiceLanguage>(defaultLang);

    const voiceOptions = useMemo(
        () => [...getVoiceOptions(voiceLang, t), ...extraSpeakers],
        [voiceLang, t, extraSpeakers],
    );

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const playPreview = useCallback(() => {
        if (!value || value === "default") return;
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        const audio = new Audio(getFileUrl(value));
        audioRef.current = audio;
        audio.play().catch((err) => {
            logger.error("Failed to play audio:", err);
        });
    }, [value]);

    return (
        <div className={`flex flex-wrap items-center gap-3 ${className ?? ""}`}>
            <Select
                value={voiceLang}
                onValueChange={(v) => {
                    const lang = v as VoiceLanguage;
                    setVoiceLang(lang);
                    onChange(getDefaultVoice(lang));
                }}
            >
                <SelectTrigger className="w-28 h-9">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {(Object.keys(crawledVoiceOptions) as VoiceLanguage[]).map(
                        (lang) => (
                            <SelectItem key={lang} value={lang}>
                                {langLabels[lang]}
                            </SelectItem>
                        ),
                    )}
                </SelectContent>
            </Select>
            <label
                htmlFor={id}
                className="text-sm text-muted-foreground whitespace-nowrap"
            >
                {t("common.voice")}
            </label>
            <Select value={value} onValueChange={onChange}>
                <SelectTrigger id={id} className="w-36 h-9">
                    <SelectValue placeholder={t("common.selectVoice")} />
                </SelectTrigger>
                <SelectContent>
                    {voiceOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {showPreview && (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="ml-1"
                    title={t("common.previewVoice")}
                    onClick={playPreview}
                    disabled={!value || value === "default"}
                >
                    <Ear className="w-5 h-5 text-primary" />
                </Button>
            )}
        </div>
    );
}
