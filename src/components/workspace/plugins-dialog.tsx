"use client";

import {
    ArrowUpCircle,
    Blocks,
    Check,
    Download,
    Loader2,
    RefreshCw,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { refreshPluginsRegistry } from "@/hooks/use-plugins-registry";
import { apiGet, apiPost } from "@/lib/api/client";
import { logger } from "@/lib/logger";

const navBtnClass =
    "h-10 w-10 rounded-xl bg-white border border-gray-100 hover:bg-gray-50 text-gray-500 hover:text-gray-900 dark:bg-zinc-800 dark:border-zinc-700 dark:text-gray-400 dark:hover:text-white dark:hover:bg-zinc-700 transition-all duration-200";

interface OfficialPlugin {
    id: string;
    installed: boolean;
}

interface OfficialResponse {
    org: string;
    plugins: OfficialPlugin[];
}

interface InstallResult {
    id: string;
    action: "cloned" | "updated";
    recognized: boolean;
}

interface PluginUpdateInfo {
    id: string;
    // null when the remote couldn't be read (offline / private repo) — the
    // result is then inconclusive and must not be shown as "up to date".
    remoteCommit: string | null;
    hasUpdate: boolean;
}

interface UpdatesResponse {
    updates: PluginUpdateInfo[];
}

export function PluginsDialog() {
    const t = useTranslations("Plugins");
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [org, setOrg] = useState("");
    const [plugins, setPlugins] = useState<OfficialPlugin[]>([]);
    // Per-plugin in-flight state, keyed by plugin id.
    const [busy, setBusy] = useState<Record<string, boolean>>({});
    // Per-plugin update status: true = newer commit upstream, false = up to date,
    // undefined = not checked yet / check failed.
    const [updates, setUpdates] = useState<Record<string, boolean>>({});
    const [checking, setChecking] = useState(false);

    const [gitUrl, setGitUrl] = useState("");
    const [cloning, setCloning] = useState(false);

    const fetchOfficial = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiGet<OfficialResponse>(
                "/api/plugins/official",
            );
            setOrg(data.org);
            setPlugins(data.plugins);
        } catch (error) {
            logger.error("Failed to load official plugins:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    // Compare local vs remote HEAD for installed plugins (one ls-remote each).
    const checkUpdates = useCallback(async () => {
        setChecking(true);
        try {
            const data = await apiGet<UpdatesResponse>(
                "/api/plugins/check-updates",
            );
            const map: Record<string, boolean> = {};
            for (const u of data.updates) {
                // Only record a conclusive result. An unreadable remote stays
                // "unknown" (undefined) so the button remains a clickable
                // manual-pull fallback rather than a disabled "up to date".
                if (u.remoteCommit !== null) map[u.id] = u.hasUpdate;
            }
            setUpdates(map);
        } catch (error) {
            logger.error("Failed to check plugin updates:", error);
        } finally {
            setChecking(false);
        }
    }, []);

    useEffect(() => {
        if (!open) return;
        void fetchOfficial().then(() => checkUpdates());
    }, [open, fetchOfficial, checkUpdates]);

    const reportResult = useCallback(
        (result: InstallResult) => {
            const msg =
                result.action === "updated"
                    ? t("updateSuccess", { id: result.id })
                    : t("installSuccess", { id: result.id });
            if (result.recognized) {
                toast.success(msg);
                // The node-facing registry store caches the registry once on
                // load; refresh it so newly installed/updated plugins appear in
                // node pickers without a full app reload.
                void refreshPluginsRegistry();
            } else {
                toast(t("notRecognized", { id: result.id }), { icon: "⚠️" });
            }
        },
        [t],
    );

    const installOfficial = useCallback(
        async (id: string) => {
            setBusy((b) => ({ ...b, [id]: true }));
            try {
                const result = await apiPost<InstallResult>(
                    "/api/plugins/install",
                    { id },
                    { timeout: 180000 },
                );
                reportResult(result);
                await fetchOfficial();
                await checkUpdates();
            } catch (error) {
                logger.error("Plugin install failed:", error);
            } finally {
                setBusy((b) => ({ ...b, [id]: false }));
            }
        },
        [reportResult, fetchOfficial, checkUpdates],
    );

    const installCustom = useCallback(async () => {
        const url = gitUrl.trim();
        if (!url) return;
        setCloning(true);
        try {
            const result = await apiPost<InstallResult>(
                "/api/plugins/install",
                { gitUrl: url },
                { timeout: 180000 },
            );
            reportResult(result);
            setGitUrl("");
            await fetchOfficial();
        } catch (error) {
            logger.error("Plugin clone failed:", error);
        } finally {
            setCloning(false);
        }
    }, [gitUrl, reportResult, fetchOfficial]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <DialogTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={navBtnClass}
                            aria-label={t("title")}
                        >
                            <Blocks className="h-5 w-5" />
                        </Button>
                    </DialogTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t("title")}</TooltipContent>
            </Tooltip>

            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t("title")}</DialogTitle>
                    <DialogDescription>{t("description")}</DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="official" className="mt-2">
                    <TabsList className="w-full">
                        <TabsTrigger value="official" className="flex-1">
                            {t("official")}
                        </TabsTrigger>
                        <TabsTrigger value="custom" className="flex-1">
                            {t("custom")}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="official">
                        <div className="mb-1.5 flex justify-end">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={checking || loading}
                                onClick={checkUpdates}
                                className="h-7 text-xs text-muted-foreground"
                            >
                                <RefreshCw
                                    className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`}
                                />
                                <span className="ml-1">
                                    {t("checkUpdates")}
                                </span>
                            </Button>
                        </div>
                        <div className="max-h-[55vh] space-y-1.5 overflow-y-auto pr-1">
                            {loading ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                </div>
                            ) : plugins.length === 0 ? (
                                <div className="py-8 text-center text-sm text-muted-foreground">
                                    {t("emptyOfficial")}
                                </div>
                            ) : (
                                plugins.map((p) => (
                                    <div
                                        key={p.id}
                                        className="flex items-center gap-2 rounded-lg border px-3 py-2"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <a
                                                href={`${org}/${p.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title={t("openRepo")}
                                                className="block truncate text-sm font-medium hover:text-primary hover:underline"
                                            >
                                                {p.id}
                                            </a>
                                        </div>
                                        {p.installed ? (
                                            updates[p.id] === false ? (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled
                                                    className="text-green-600 dark:text-green-500"
                                                >
                                                    <Check className="h-4 w-4" />
                                                    <span className="ml-1">
                                                        {t("upToDate")}
                                                    </span>
                                                </Button>
                                            ) : (
                                                <Button
                                                    type="button"
                                                    variant={
                                                        updates[p.id]
                                                            ? "default"
                                                            : "ghost"
                                                    }
                                                    size="sm"
                                                    disabled={busy[p.id]}
                                                    onClick={() =>
                                                        installOfficial(p.id)
                                                    }
                                                    className={
                                                        updates[p.id]
                                                            ? "bg-amber-500 text-white hover:bg-amber-600"
                                                            : "text-green-600 dark:text-green-500"
                                                    }
                                                >
                                                    {busy[p.id] ||
                                                    (checking &&
                                                        updates[p.id] ===
                                                            undefined) ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : updates[p.id] ? (
                                                        <ArrowUpCircle className="h-4 w-4" />
                                                    ) : (
                                                        <Check className="h-4 w-4" />
                                                    )}
                                                    <span className="ml-1">
                                                        {t("update")}
                                                    </span>
                                                </Button>
                                            )
                                        ) : (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                disabled={busy[p.id]}
                                                onClick={() =>
                                                    installOfficial(p.id)
                                                }
                                            >
                                                {busy[p.id] ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Download className="h-4 w-4" />
                                                )}
                                                <span className="ml-1">
                                                    {t("install")}
                                                </span>
                                            </Button>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="custom">
                        <div className="space-y-3 py-2">
                            <p className="text-sm text-muted-foreground">
                                {t("customHint")}
                            </p>
                            <Input
                                value={gitUrl}
                                onChange={(e) => setGitUrl(e.target.value)}
                                placeholder="https://github.com/org/tongflow-api-foo.git"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !cloning)
                                        void installCustom();
                                }}
                            />
                            <Button
                                type="button"
                                className="w-full"
                                disabled={cloning || !gitUrl.trim()}
                                onClick={installCustom}
                            >
                                {cloning ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Download className="mr-2 h-4 w-4" />
                                )}
                                {t("cloneButton")}
                            </Button>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
