/**
 * Shared single-select emotion picker.
 *
 * Options come from `buildEmotionOptions(t)` (i18n keys); the "none" option
 * maps to `undefined` on the wire. Multi-select usage (chip group) lives in
 * the preset node and is intentionally separate.
 */

"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import { buildEmotionOptions } from "../transfer/text-gen-speech-shared";

export interface EmotionSelectProps {
    value: string | undefined;
    onChange: (value: string | undefined) => void;
    id?: string;
    className?: string;
    disabled?: boolean;
}

export function EmotionSelect({
    value,
    onChange,
    id = "emotion-select",
    className,
    disabled,
}: EmotionSelectProps) {
    const t = useTranslations("Workspace.nodes");
    const options = useMemo(() => buildEmotionOptions(t), [t]);

    return (
        <Select
            value={value ?? "none"}
            onValueChange={(v) => onChange(v === "none" ? undefined : v)}
            disabled={disabled}
        >
            <SelectTrigger id={id} className={`h-9 ${className ?? "w-full"}`}>
                <SelectValue placeholder={t("compose.selectEmotion")} />
            </SelectTrigger>
            <SelectContent>
                {options.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
