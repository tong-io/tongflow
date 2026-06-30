"use client";

/**
 * Workspace top-right corner: theme toggle, language selector, community links
 */

import { Globe, Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { PluginsDialog } from "@/components/workspace/plugins-dialog";
import { SettingsDialog } from "@/components/workspace/settings-dialog";

const LOCALE_OPTIONS = [
    { code: "zh", label: "中文" },
    { code: "en", label: "English" },
    { code: "ja", label: "日本語" },
    { code: "ko", label: "한국어" },
] as const;

const navBtnClass =
    "h-10 w-10 rounded-xl bg-white border border-gray-100 hover:bg-gray-50 text-gray-500 hover:text-gray-900 dark:bg-zinc-800 dark:border-zinc-700 dark:text-gray-400 dark:hover:text-white dark:hover:bg-zinc-700 transition-all duration-200";

// Discord SVG Icon
const DiscordIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
);

function ThemeToggleButton() {
    const t = useTranslations("Navigation");
    const [mounted, setMounted] = useState(false);
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        setMounted(true);
        setIsDark(document.documentElement.classList.contains("dark"));
        const observer = new MutationObserver(() => {
            setIsDark(document.documentElement.classList.contains("dark"));
        });
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
        });
        return () => observer.disconnect();
    }, []);

    const toggle = () => {
        const nextDark = !document.documentElement.classList.contains("dark");
        if (nextDark) {
            document.documentElement.classList.add("dark");
            localStorage.setItem("theme", "dark");
        } else {
            document.documentElement.classList.remove("dark");
            localStorage.setItem("theme", "light");
        }
        setIsDark(nextDark);
    };

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={toggle}
                    className={navBtnClass}
                    aria-label={t("toggleTheme")}
                >
                    {!mounted ? (
                        <Moon className="h-5 w-5 opacity-40" />
                    ) : isDark ? (
                        <Sun className="h-5 w-5" />
                    ) : (
                        <Moon className="h-5 w-5" />
                    )}
                </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("toggleTheme")}</TooltipContent>
        </Tooltip>
    );
}

function LocaleMenu() {
    const t = useTranslations("Navigation");
    const locale = useLocale();
    const router = useRouter();

    const setLocale = (next: string) => {
        if (next === locale) return;
        // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API not available in all target browsers
        document.cookie = `NEXT_LOCALE=${next};path=/;max-age=31536000;SameSite=Lax`;
        router.refresh();
    };

    return (
        <DropdownMenu>
            <Tooltip>
                <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={navBtnClass}
                            aria-label={t("language")}
                        >
                            <Globe className="h-5 w-5" />
                        </Button>
                    </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t("language")}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="min-w-[140px]">
                {LOCALE_OPTIONS.map((opt) => (
                    <DropdownMenuItem
                        key={opt.code}
                        className="cursor-pointer"
                        onClick={() => setLocale(opt.code)}
                    >
                        <span className="flex-1">{opt.label}</span>
                        {locale === opt.code ? (
                            <span className="text-primary">✓</span>
                        ) : null}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function WorkspaceNav() {
    const t = useTranslations("Navigation");
    return (
        <div className="flex items-center gap-2">
            <PluginsDialog />
            <SettingsDialog />
            <ThemeToggleButton />
            <LocaleMenu />
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                            window.open(
                                "https://discord.gg/K7V8az94Zf",
                                "_blank",
                            )
                        }
                        className={navBtnClass}
                        aria-label={t("community")}
                    >
                        <DiscordIcon className="h-5 w-5" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t("community")}</TooltipContent>
            </Tooltip>
        </div>
    );
}
