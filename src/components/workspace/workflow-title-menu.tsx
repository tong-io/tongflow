"use client";

import { useState, useEffect, useRef } from "react";
import type { ChangeEvent } from "react";
import toast from "react-hot-toast";
import {
    ChevronDown,
    Save,
    FilePlus2,
    Trash2,
    Loader2,
    Download,
    FileUp,
} from "lucide-react";
import { useFlow } from "@/hooks/use-flow";
import { useShallow } from "zustand/react/shallow";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    saveWorkflow,
    updateWorkflow,
    SaveWorkflowRequest,
} from "@/lib/api/workspace";
import {
    exportWorkflow,
    parseWorkflowImportJson,
    type ParsedWorkflowImport,
    WORKFLOW_IMPORT_NO_CANVAS,
} from "@/utils/workflow-exporter";
import { useTranslations } from "next-intl";

function safeWorkflowFileName(name: string): string {
    const s = name.replace(/[/\\?%*:|"<>]/g, "_").trim();
    return s || "workflow";
}

const selector = (state: any) => ({
    nodes: state.nodes,
    edges: state.edges,
    workflowName: state.workflowName,
    workflowId: state.workflowId,
    workflowDescription: state.workflowDescription,
    setWorkflowName: state.setWorkflowName,
    setWorkflowId: state.setWorkflowId,
    setWorkflowDescription: state.setWorkflowDescription,
    setCurrentShareId: state.setCurrentShareId,
    setNodes: state.setNodes,
    setEdges: state.setEdges,
});

export function WorkflowTitleMenu() {
    const {
        nodes,
        edges,
        workflowName,
        workflowId,
        workflowDescription,
        setWorkflowName,
        setWorkflowId,
        setWorkflowDescription,
        setCurrentShareId,
        setNodes,
        setEdges,
    } = useFlow(useShallow(selector));

    const t = useTranslations("Workspace.menu");
    const tIndex = useTranslations("Index");

    const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
    const [isSaveAsMode, setIsSaveAsMode] = useState(false);
    const [tempName, setTempName] = useState(workflowName);
    const [tempDescription, setTempDescription] = useState(
        workflowDescription || "",
    );
    const [saving, setSaving] = useState(false);

    const importFileRef = useRef<HTMLInputElement>(null);

    // 下拉菜单悬停状态
    const [menuOpen, setMenuOpen] = useState(false);
    const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // 处理鼠标移入
    const handleMenuMouseEnter = () => {
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
        setMenuOpen(true);
    };

    // 处理鼠标移出（延迟关闭防止闪烁）
    const handleMenuMouseLeave = () => {
        closeTimeoutRef.current = setTimeout(() => {
            setMenuOpen(false);
        }, 150);
    };

    // 同步名称
    useEffect(() => {
        setTempName(workflowName);
    }, [workflowName]);

    useEffect(() => {
        setTempDescription(workflowDescription || "");
    }, [workflowDescription]);

    // 保存工作流
    const handleSave = async () => {
        if (!tempName.trim()) {
            toast.error(t("enterName"));
            return;
        }

        setSaving(true);
        try {
            // 前端生成 executable（因为需要运行时注册表中的配置）
            const executable = exportWorkflow(nodes, edges, {
                name: tempName,
                description: tempDescription || "",
                includeOriginalFlow: false,
            });

            const workflowData: Partial<SaveWorkflowRequest> = {
                name: tempName,
                description: tempDescription,
                flow: { nodes, edges },
                executable: executable as unknown as Record<string, unknown>,
            };

            if (workflowId && !isSaveAsMode) {
                await updateWorkflow(workflowId, workflowData);
                toast.success(t("saveSuccess"));
            } else {
                const result = await saveWorkflow(
                    workflowData as SaveWorkflowRequest,
                );
                setWorkflowId(result.workflowId);
                toast.success(t("saveSuccess"));
            }

            setWorkflowName(tempName);
            setWorkflowDescription(tempDescription);
            setIsSaveDialogOpen(false);
            setIsSaveAsMode(false);
        } catch (error) {
            console.error("保存失败:", error);
            toast.error(t("saveFailed"));
        } finally {
            setSaving(false);
        }
    };

    // 打开保存对话框
    const openSaveDialog = () => {
        setIsSaveAsMode(false);
        setTempName(workflowName);
        setTempDescription(workflowDescription || "");
        setIsSaveDialogOpen(true);
    };

    // 打开另存为对话框
    const openSaveAsDialog = () => {
        setIsSaveAsMode(true);
        setTempName(workflowName);
        setTempDescription(workflowDescription || "");
        setIsSaveDialogOpen(true);
    };

    // 清空工作流
    const handleClear = () => {
        if (confirm(t("confirmClear"))) {
            setNodes([]);
            setEdges([]);
            setWorkflowName(tIndex("title"));
            setWorkflowDescription("");
            setWorkflowId(null);
            setCurrentShareId(null);
            toast.success(t("cleared"));
        }
    };

    const handleExportJson = () => {
        setMenuOpen(false);
        try {
            const executable = exportWorkflow(nodes, edges, {
                name: workflowName,
                description: workflowDescription || "",
                includeOriginalFlow: true,
            });
            const text = JSON.stringify(executable, null, 2);
            const blob = new Blob([text], {
                type: "application/json;charset=utf-8",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${safeWorkflowFileName(workflowName)}.workflow.json`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success(t("exportJsonSuccess"));
        } catch (e) {
            console.error(e);
            toast.error(t("exportJsonFailed"));
        }
    };

    const openImportJsonPicker = () => {
        setMenuOpen(false);
        importFileRef.current?.click();
    };

    const handleImportJsonFile = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        try {
            const text = await file.text();
            let parsed: unknown;
            try {
                parsed = JSON.parse(text);
            } catch {
                toast.error(t("importJsonInvalid"));
                return;
            }
            let result: ParsedWorkflowImport;
            try {
                result = parseWorkflowImportJson(parsed);
            } catch (err) {
                const msg = err instanceof Error ? err.message : "";
                if (msg === WORKFLOW_IMPORT_NO_CANVAS) {
                    toast.error(t("importJsonNoCanvas"));
                } else {
                    toast.error(t("importJsonInvalid"));
                }
                return;
            }
            setNodes(result.nodes);
            setEdges(result.edges);
            if (result.name?.trim()) {
                setWorkflowName(result.name);
            }
            if (result.description !== undefined) {
                setWorkflowDescription(result.description);
            }
            setWorkflowId(null);
            setCurrentShareId(null);
            toast.success(
                t("importJsonSuccess", {
                    nodes: result.nodes.length,
                    edges: result.edges.length,
                }),
            );
        } catch {
            toast.error(t("importJsonReadFailed"));
        }
    };

    return (
        <>
            <div
                className="relative"
                onMouseEnter={handleMenuMouseEnter}
                onMouseLeave={handleMenuMouseLeave}
            >
                <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 px-4 h-10 rounded-xl bg-white border border-gray-100 hover:bg-gray-50 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-700 transition-all duration-200"
                >
                    <span className="max-w-[200px] truncate font-medium text-gray-700 dark:text-gray-200">
                        {workflowName}
                    </span>
                    <ChevronDown className="size-4 text-gray-500" />
                </Button>

                {menuOpen && (
                    <div className="absolute top-full left-0 mt-1 z-50 w-48 bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 overflow-hidden py-1">
                        <div
                            onClick={openSaveDialog}
                            className="flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800"
                        >
                            <Save className="mr-2 h-4 w-4" />
                            {t("save")}
                            {workflowId && (
                                <span className="ml-auto text-xs text-muted-foreground">
                                    ({t("update")})
                                </span>
                            )}
                        </div>
                        <div
                            onClick={openSaveAsDialog}
                            className="flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800"
                        >
                            <FilePlus2 className="mr-2 h-4 w-4" />
                            {t("saveAs")}
                        </div>
                        <div
                            onClick={handleExportJson}
                            className="flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800"
                        >
                            <Download className="mr-2 h-4 w-4" />
                            {t("exportJson")}
                        </div>
                        <div
                            onClick={openImportJsonPicker}
                            className="flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800"
                        >
                            <FileUp className="mr-2 h-4 w-4" />
                            {t("importJson")}
                        </div>
                        <div className="h-px bg-gray-200 dark:bg-zinc-700 my-1" />
                        <div
                            onClick={handleClear}
                            className="flex items-center px-3 py-2 text-sm cursor-pointer text-red-600 hover:bg-gray-100 dark:hover:bg-zinc-800"
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t("clear")}
                        </div>
                    </div>
                )}
            </div>

            {/* 保存对话框 */}
            <Dialog
                open={isSaveDialogOpen}
                onOpenChange={(open) => {
                    setIsSaveDialogOpen(open);
                    if (!open) setIsSaveAsMode(false);
                }}
            >
                <DialogContent aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>
                            {isSaveAsMode
                                ? t("saveAsNew")
                                : workflowId
                                  ? t("saveWorkflow")
                                  : t("saveNew")}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="workflow-name">{t("name")}</Label>
                            <Input
                                id="workflow-name"
                                value={tempName}
                                onChange={(e) => setTempName(e.target.value)}
                                placeholder={t("enterName")}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="workflow-description">
                                {t("descOptional")}
                            </Label>
                            <Textarea
                                id="workflow-description"
                                value={tempDescription}
                                onChange={(e) =>
                                    setTempDescription(e.target.value)
                                }
                                placeholder={t("enterDesc")}
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline">{t("cancel")}</Button>
                        </DialogClose>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {t("saving")}
                                </>
                            ) : (
                                t("save")
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <input
                ref={importFileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleImportJsonFile}
            />
        </>
    );
}
