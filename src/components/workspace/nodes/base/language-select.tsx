"use client";

import { useTranslations } from "next-intl";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

// Qwen3-TTS `language` parameter values (English names).
// Plugin defaults: clone → "Auto", preset/instruct → "Chinese".
const LANGUAGES: { value: string; tKey: string }[] = [
    { value: "Auto", tKey: "auto" },
    { value: "Chinese", tKey: "zh" },
    { value: "English", tKey: "en" },
    { value: "Japanese", tKey: "ja" },
    { value: "Korean", tKey: "ko" },
    { value: "German", tKey: "de" },
    { value: "French", tKey: "fr" },
    { value: "Russian", tKey: "ru" },
    { value: "Portuguese", tKey: "pt" },
    { value: "Spanish", tKey: "es" },
    { value: "Italian", tKey: "it" },
];

export interface LanguageSelectProps {
    value: string | undefined;
    onChange: (lang: string) => void;
    id?: string;
    className?: string;
}

export function LanguageSelect({
    value,
    onChange,
    id = "language-select",
    className,
}: LanguageSelectProps) {
    const tLang = useTranslations("Languages");

    return (
        <Select value={value ?? ""} onValueChange={onChange}>
            <SelectTrigger
                id={id}
                className={`w-32 h-9 ${className ?? ""}`.trim()}
            >
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                        {tLang(lang.tKey)}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
