"use client";

import { Blocks, Check, Download, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Badge } from "@/components/ui/badge";
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
import { apiGet, apiPost } from "@/lib/api/client";
import { logger } from "@/lib/logger";

const navBtnClass =
    "h-10 w-10 rounded-xl bg-white border border-gray-100 hover:bg-gray-50 text-gray-500 hover:text-gray-900 dark:bg-zinc-800 dark:border-zinc-700 dark:text-gray-400 dark:hover:text-white dark:hover:bg-zinc-700 transition-all duration-200";

type Runner = "modal" | "api";

interface OfficialPlugin {
    id: string;
    runner: Runner;
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

export function PluginsDialog() {
    const t = useTranslations("Plugins");
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [org, setOrg] = useState("");
    const [plugins, setPlugins] = useState<OfficialPlugin[]>([]);
    // Per-plugin in-flight state, keyed by plugin id.
    const [busy, setBusy] = useState<Record<string, boolean>>({});

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

    useEffect(() => {
        if (open) void fetchOfficial();
    }, [open, fetchOfficial]);

    const reportResult = useCallback(
        (result: InstallResult) => {
            const msg =
                result.action === "updated"
                    ? t("updateSuccess", { id: result.id })
                    : t("installSuccess", { id: result.id });
            if (result.recognized) {
                toast.success(msg);
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
            } catch (error) {
                logger.error("Plugin install failed:", error);
            } finally {
                setBusy((b) => ({ ...b, [id]: false }));
            }
        },
        [reportResult, fetchOfficial],
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
                                        <Badge variant="secondary">
                                            {p.runner}
                                        </Badge>
                                        {p.installed ? (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                disabled={busy[p.id]}
                                                onClick={() =>
                                                    installOfficial(p.id)
                                                }
                                                className="text-green-600 dark:text-green-500"
                                            >
                                                {busy[p.id] ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Check className="h-4 w-4" />
                                                )}
                                                <span className="ml-1">
                                                    {t("update")}
                                                </span>
                                            </Button>
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
                                placeholder="https://github.com/org/tongflow-modal-foo.git"
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
