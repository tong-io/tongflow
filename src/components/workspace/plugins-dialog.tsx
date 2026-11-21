"use client";

import {
    ArrowUpCircle,
    Blocks,
    Check,
    Download,
    Loader2,
    RefreshCw,
    Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { logger } from "tongflow";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    apiGet,
    apiPost,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    Input,
    refreshPluginsRegistry,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "tongflow/canvas";

const navBtnClass =
    "h-10 w-10 rounded-xl bg-white border border-gray-100 hover:bg-gray-50 text-gray-500 hover:text-gray-900 dark:bg-zinc-800 dark:border-zinc-700 dark:text-gray-400 dark:hover:text-white dark:hover:bg-zinc-700 transition-all duration-200";

/** Plugin icon with a monogram fallback on missing/broken src. */
function PluginCardIcon({ icon, label }: { icon?: string; label: string }) {
    const [failed, setFailed] = useState(false);
    const letter = label.trim().charAt(0).toUpperCase() || "?";
    if (!icon || failed) {
        return (
            <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground"
                style={{ width: 28, height: 28 }}
            >
                {letter}
            </span>
        );
    }
    return (
        // Explicit width/height attributes: SVG icons have no intrinsic size,
        // so they must never rely on CSS alone to stay small.
        <img
            src={icon}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 shrink-0 rounded-md object-contain"
            onError={() => setFailed(true)}
        />
    );
}

interface OfficialPlugin {
    id: string;
    installed: boolean;
    name?: string;
    description?: string;
    icon?: string;
    /** Run by the browser edge runtime instead of a Python process. */
    runtime?: "browser";
}

interface OfficialResponse {
    org: string;
    plugins: OfficialPlugin[];
    /** Installed community plugins (custom git clones outside the manifest). */
    community: string[];
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
    const [community, setCommunity] = useState<string[]>([]);
    // Plugin id awaiting uninstall confirmation, or null when closed.
    const [confirmUninstall, setConfirmUninstall] = useState<string | null>(
        null,
    );
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
            setCommunity(data.community ?? []);
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

    const uninstall = useCallback(
        async (id: string) => {
            setBusy((b) => ({ ...b, [id]: true }));
            try {
                await apiPost("/api/plugins/uninstall", { id });
                toast.success(t("uninstallSuccess", { id }));
                // Drop the plugin from node pickers without a full app reload.
                void refreshPluginsRegistry();
                await fetchOfficial();
            } catch (error) {
                logger.error("Plugin uninstall failed:", error);
            } finally {
                setBusy((b) => ({ ...b, [id]: false }));
            }
        },
        [t, fetchOfficial],
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
                                        <PluginCardIcon
                                            icon={p.icon}
                                            label={p.name || p.id}
                                        />
                                        <div className="min-w-0 flex-1">
                                            <a
                                                href={`${org}/${p.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title={t("openRepo")}
                                                className="block truncate text-sm font-medium hover:text-primary hover:underline"
                                            >
                                                {p.name || p.id}
                                            </a>
                                            {p.runtime === "browser" ? (
                                                <span className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                                    {t("runsInBrowser")}
                                                </span>
                                            ) : null}
                                            {p.description ? (
                                                <p className="text-xs text-muted-foreground leading-snug">
                                                    {p.description}
                                                </p>
                                            ) : null}
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
                                        {p.installed && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                disabled={busy[p.id]}
                                                onClick={() =>
                                                    setConfirmUninstall(p.id)
                                                }
                                                title={t("uninstall")}
                                                aria-label={t("uninstall")}
                                                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-500"
                                            >
                                                <Trash2 className="h-4 w-4" />
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

                            {community.length > 0 && (
                                <div className="space-y-1.5 pt-2">
                                    <p className="text-xs font-medium text-muted-foreground">
                                        {t("installedCommunity")}
                                    </p>
                                    <div className="max-h-[35vh] space-y-1.5 overflow-y-auto pr-1">
                                        {community.map((id) => (
                                            <div
                                                key={id}
                                                className="flex items-center gap-2 rounded-lg border px-3 py-2"
                                            >
                                                <div className="min-w-0 flex-1 truncate text-sm font-medium">
                                                    {id}
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    disabled={busy[id]}
                                                    onClick={() =>
                                                        setConfirmUninstall(id)
                                                    }
                                                    title={t("uninstall")}
                                                    aria-label={t("uninstall")}
                                                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-500"
                                                >
                                                    {busy[id] ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="h-4 w-4" />
                                                    )}
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </TabsContent>
                </Tabs>

                <AlertDialog
                    open={confirmUninstall !== null}
                    onOpenChange={(isOpen) => {
                        if (!isOpen) setConfirmUninstall(null);
                    }}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                {t("uninstallConfirmTitle")}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                {t("uninstallConfirmDescription", {
                                    id: confirmUninstall ?? "",
                                })}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                            <AlertDialogAction
                                className="bg-red-500 text-white hover:bg-red-600"
                                onClick={() => {
                                    const id = confirmUninstall;
                                    setConfirmUninstall(null);
                                    if (id) void uninstall(id);
                                }}
                            >
                                {t("uninstall")}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </DialogContent>
        </Dialog>
    );
}
