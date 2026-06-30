/**
 * Client-side translator for non-React contexts (utilities, lib code,
 * thrown errors that surface via toast). React components should keep
 * using `useTranslations()` instead.
 *
 * Locale is read from the `NEXT_LOCALE` cookie set by next-intl. When the
 * cookie is missing or invalid we fall back to "zh", matching the SSR
 * default in `src/i18n/request.ts`.
 */

import { createTranslator } from "next-intl";

import enMessages from "@/i18n/messages/en.json";
import jaMessages from "@/i18n/messages/ja.json";
import koMessages from "@/i18n/messages/ko.json";
import zhMessages from "@/i18n/messages/zh.json";

type AppLocale = "en" | "zh" | "ja" | "ko";

// Loose typing: createTranslator's strict shape inference collapses to `never`
// across our locale union, so we surface a looser `(key, vars?) => string`
// signature via ClientTranslator below.
const messagesByLocale: Record<AppLocale, Record<string, unknown>> = {
    en: enMessages,
    zh: zhMessages,
    ja: jaMessages,
    ko: koMessages,
};

function readCookieLocale(): AppLocale {
    if (typeof document === "undefined") return "zh";
    const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
    if (!match) return "zh";
    const value = decodeURIComponent(match[1]) as AppLocale;
    return value in messagesByLocale ? value : "zh";
}

export type ClientTranslator = (
    key: string,
    values?: Record<string, string | number>,
) => string;

export function getClientTranslator(namespace?: string): ClientTranslator {
    const locale = readCookieLocale();
    const t = createTranslator({
        locale,
        messages: messagesByLocale[locale],
        namespace,
    });
    return t as unknown as ClientTranslator;
}
