"use client";

/**
 * Workspace 右侧导航按钮组
 * Open-source version: Discord community link only
 */

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Link2, Loader2 } from "lucide-react";

// Discord SVG Icon
const DiscordIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
);

export function WorkspaceNav() {
    const t = useTranslations("Workspace.workspaceNav");
    const isDesktop = typeof window !== "undefined" && !!window.openflowDesktop;

    const [open, setOpen] = useState(false);
    const [profile, setProfile] = useState("");
    const [running, setRunning] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [logs, setLogs] = useState<string[]>([]);

    const canStart = isDesktop && !running;

    const trimmedProfile = useMemo(() => {
        const p = profile.trim();
        return p.length ? p : null;
    }, [profile]);

    useEffect(() => {
        if (!isDesktop) return;
        const api = window.openflowDesktop;
        if (!api) return;
        return api.onModalSetupEvent((evt) => {
            const e = evt as
                | { type: "starting" }
                | { type: "already_configured"; path: string }
                | { type: "auth_url"; url: string }
                | { type: "log"; line: string }
                | { type: "done"; path: string };

            if (e.type === "starting") {
                setRunning(true);
                setStatus(t("statusStarting"));
                setLogs([]);
            } else if (e.type === "already_configured") {
                setRunning(false);
                setStatus(t("statusAlreadyConnected", { path: e.path }));
            } else if (e.type === "auth_url") {
                setStatus(t("statusAuth", { url: e.url }));
            } else if (e.type === "log") {
                setLogs((prev) => {
                    const next = [...prev, e.line];
                    return next.length > 300 ? next.slice(next.length - 300) : next;
                });
            } else if (e.type === "done") {
                setRunning(false);
                setStatus(t("statusDone", { path: e.path }));
            }
        });
    }, [isDesktop, t]);

    async function start() {
        const api = window.openflowDesktop;
        if (!api) return;
        setOpen(true);
        setRunning(true);
        setStatus(t("statusStarting"));
        setLogs([]);

        const res = await api.setupModal({ profile: trimmedProfile });
        if (!res.ok) {
            setRunning(false);
            setStatus(t("statusFailed", { error: res.error }));
        }
    }

    return (
        <div className="flex items-center gap-2">
            {isDesktop ? (
                <>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={start}
                        disabled={!canStart}
                        title={t("connectModal")}
                        className="h-10 w-10 rounded-xl bg-white border border-gray-100 hover:bg-gray-50 text-gray-500 hover:text-gray-900 dark:bg-zinc-800 dark:border-zinc-700 dark:text-gray-400 dark:hover:text-white dark:hover:bg-zinc-700 transition-all duration-200"
                    >
                        {running ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <Link2 className="h-5 w-5" />
                        )}
                    </Button>

                    <Dialog open={open} onOpenChange={setOpen}>
                        <DialogContent aria-describedby={undefined}>
                            <DialogHeader>
                                <DialogTitle>{t("title")}</DialogTitle>
                            </DialogHeader>

                            <div className="space-y-3">
                                <div className="text-sm text-muted-foreground">
                                    {t("desc")}
                                </div>

                                <div className="space-y-2">
                                    <div className="text-xs text-muted-foreground">
                                        {t("profileLabel")}
                                    </div>
                                    <Input
                                        value={profile}
                                        onChange={(e) => setProfile(e.target.value)}
                                        placeholder={t("profilePlaceholder")}
                                        disabled={running}
                                    />
                                </div>

                                {status ? (
                                    <div className="text-sm whitespace-pre-wrap">
                                        {status}
                                    </div>
                                ) : null}

                                <div className="h-40 w-full rounded-md border p-3 overflow-auto">
                                    <pre className="text-xs leading-5 whitespace-pre-wrap">
                                        {logs.length
                                            ? logs.join("\n")
                                            : t("logsPlaceholder")}
                                    </pre>
                                </div>
                            </div>

                            <DialogFooter className="mt-2">
                                <Button
                                    variant="secondary"
                                    onClick={() => setOpen(false)}
                                    disabled={running}
                                >
                                    {t("close")}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </>
            ) : null}

            <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                    window.open("https://discord.gg/K7V8az94Zf", "_blank")
                }
                className="h-10 w-10 rounded-xl bg-white border border-gray-100 hover:bg-gray-50 text-gray-500 hover:text-gray-900 dark:bg-zinc-800 dark:border-zinc-700 dark:text-gray-400 dark:hover:text-white dark:hover:bg-zinc-700 transition-all duration-200"
            >
                <DiscordIcon className="h-5 w-5" />
            </Button>
        </div>
    );
}
