/**
 * Shared single-select style picker.
 *
 * Options come from `buildStyleOptions(t)` (i18n keys); the "none" option
 * maps to `undefined` on the wire.
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

import { buildStyleOptions } from "../transfer/text-gen-speech-shared";

export interface StyleSelectProps {
    value: string | undefined;
    onChange: (value: string | undefined) => void;
    id?: string;
    className?: string;
    disabled?: boolean;
}

export function StyleSelect({
    value,
    onChange,
    id = "style-select",
    className,
    disabled,
}: StyleSelectProps) {
    const t = useTranslations("Workspace.nodes");
    const options = useMemo(() => buildStyleOptions(t), [t]);

    return (
        <Select
            value={value ?? "none"}
            onValueChange={(v) => onChange(v === "none" ? undefined : v)}
            disabled={disabled}
        >
            <SelectTrigger id={id} className={`h-9 ${className ?? "w-full"}`}>
                <SelectValue placeholder={t("compose.selectStyle")} />
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
