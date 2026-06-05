"use client";

import { Eye, EyeOff, Loader2, Plus, Settings, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiGet, apiPut } from "@/lib/api/client";
import { logger } from "@/lib/logger";

const navBtnClass =
    "h-10 w-10 rounded-xl bg-white border border-gray-100 hover:bg-gray-50 text-gray-500 hover:text-gray-900 dark:bg-zinc-800 dark:border-zinc-700 dark:text-gray-400 dark:hover:text-white dark:hover:bg-zinc-700 transition-all duration-200";

interface EnvResponse {
    env: Record<string, string>;
}

interface Row {
    key: string;
    value: string;
}

function toRows(env: Record<string, string>): Row[] {
    const rows = Object.entries(env).map(([key, value]) => ({ key, value }));
    return rows.length > 0 ? rows : [{ key: "", value: "" }];
}

export function SettingsDialog() {
    const t = useTranslations("Settings");
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [rows, setRows] = useState<Row[]>([{ key: "", value: "" }]);
    const [revealed, setRevealed] = useState<Record<number, boolean>>({});

    const fetchEnv = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiGet<EnvResponse>("/api/settings/env");
            setRows(toRows(data.env ?? {}));
            setRevealed({});
        } catch (error) {
            logger.error("Failed to load settings:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open) void fetchEnv();
    }, [open, fetchEnv]);

    const updateRow = (index: number, patch: Partial<Row>) => {
        setRows((prev) =>
            prev.map((r, i) => (i === index ? { ...r, ...patch } : r)),
        );
    };

    const addRow = () => setRows((prev) => [...prev, { key: "", value: "" }]);

    const removeRow = (index: number) => {
        setRows((prev) => {
            const next = prev.filter((_, i) => i !== index);
            return next.length > 0 ? next : [{ key: "", value: "" }];
        });
    };

    const save = useCallback(async () => {
        // Collapse rows into a map; last non-empty key wins, blank keys dropped.
        const env: Record<string, string> = {};
        for (const { key, value } of rows) {
            const k = key.trim();
            if (k) env[k] = value;
        }
        setSaving(true);
        try {
            const data = await apiPut<EnvResponse>("/api/settings/env", {
                env,
            });
            setRows(toRows(data.env ?? {}));
            setRevealed({});
            toast.success(t("saved"));
        } catch (error) {
            logger.error("Failed to save settings:", error);
        } finally {
            setSaving(false);
        }
    }, [rows, t]);

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
                            <Settings className="h-5 w-5" />
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

                {loading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
                        {rows.map((row, index) => (
                            <div
                                key={index}
                                className="flex items-center gap-2"
                            >
                                <Input
                                    value={row.key}
                                    placeholder={t("keyPlaceholder")}
                                    spellCheck={false}
                                    autoComplete="off"
                                    className="flex-1 font-mono text-xs"
                                    onChange={(e) =>
                                        updateRow(index, {
                                            key: e.target.value,
                                        })
                                    }
                                />
                                <Input
                                    value={row.value}
                                    placeholder={t("valuePlaceholder")}
                                    type={revealed[index] ? "text" : "password"}
                                    spellCheck={false}
                                    autoComplete="off"
                                    className="flex-1 font-mono text-xs"
                                    onChange={(e) =>
                                        updateRow(index, {
                                            value: e.target.value,
                                        })
                                    }
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 shrink-0 text-muted-foreground"
                                    aria-label={t("toggleReveal")}
                                    onClick={() =>
                                        setRevealed((r) => ({
                                            ...r,
                                            [index]: !r[index],
                                        }))
                                    }
                                >
                                    {revealed[index] ? (
                                        <EyeOff className="h-4 w-4" />
                                    ) : (
                                        <Eye className="h-4 w-4" />
                                    )}
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-red-600"
                                    aria-label={t("removeRow")}
                                    onClick={() => removeRow(index)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}

                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={addRow}
                        >
                            <Plus className="mr-1 h-4 w-4" />
                            {t("addRow")}
                        </Button>
                    </div>
                )}

                <DialogFooter>
                    <Button
                        type="button"
                        disabled={saving || loading}
                        onClick={save}
                    >
                        {saving ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        {t("save")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
