"use client";

import {
    ChevronDown,
    Download,
    FilePlus2,
    FileUp,
    Loader2,
    Save,
    Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { showErrorToast } from "@/components/ui/error-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FlowState } from "@/hooks/use-flow";
import { useFlow } from "@/hooks/use-flow";
import {
    type SaveWorkflowRequest,
    saveWorkflow,
    updateWorkflow,
} from "@/lib/api/workspace";
import { logger } from "@/lib/logger";
import {
    exportWorkflow,
    type ParsedWorkflowImport,
    parseWorkflowImportJson,
    WORKFLOW_IMPORT_NO_CANVAS,
} from "@/lib/workflow/exporter";

function safeWorkflowFileName(name: string): string {
    const s = name.replace(/[/\\?%*:|"<>]/g, "_").trim();
    return s || "workflow";
}

const selector = (state: FlowState) => ({
    nodes: state.nodes,
    edges: state.edges,
    workflowName: state.workflowName,
    workflowId: state.workflowId,
    workflowDescription: state.workflowDescription,
    setWorkflowName: state.setWorkflowName,
    setWorkflowId: state.setWorkflowId,
    setWorkflowDescription: state.setWorkflowDescription,
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

    // Dropdown menu hover state
    const [menuOpen, setMenuOpen] = useState(false);
    const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Handle mouse enter
    const handleMenuMouseEnter = () => {
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
        setMenuOpen(true);
    };

    // Handle mouse leave (delayed close to prevent flickering)
    const handleMenuMouseLeave = () => {
        closeTimeoutRef.current = setTimeout(() => {
            setMenuOpen(false);
        }, 150);
    };

    // Sync name
    useEffect(() => {
        setTempName(workflowName);
    }, [workflowName]);

    useEffect(() => {
        setTempDescription(workflowDescription || "");
    }, [workflowDescription]);

    // Save the workflow
    const handleSave = async () => {
        if (!tempName.trim()) {
            showErrorToast({ message: t("enterName") });
            return;
        }

        setSaving(true);
        try {
            // Generate the executable on the frontend (requires runtime registry configuration)
            const executable = exportWorkflow(nodes, edges, {
                name: tempName,
                description: tempDescription || "",
                includeOriginalFlow: false,
            });

            const workflowData: Partial<SaveWorkflowRequest> = {
                name: tempName,
                description: tempDescription,
                flow: { nodes, edges },
                executable,
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
            logger.error("Save failed:", error);
            showErrorToast({ message: t("saveFailed") });
        } finally {
            setSaving(false);
        }
    };

    // Open the save dialog
    const openSaveDialog = () => {
        setIsSaveAsMode(false);
        setTempName(workflowName);
        setTempDescription(workflowDescription || "");
        setIsSaveDialogOpen(true);
    };

    // Open the "save as" dialog
    const openSaveAsDialog = () => {
        setIsSaveAsMode(true);
        setTempName(workflowName);
        setTempDescription(workflowDescription || "");
        setIsSaveDialogOpen(true);
    };

    // Clear the workflow
    const handleClear = () => {
        if (confirm(t("confirmClear"))) {
            setNodes([]);
            setEdges([]);
            setWorkflowName(tIndex("title"));
            setWorkflowDescription("");
            setWorkflowId(null);
            toast.success(t("cleared"));
        }
    };

    // Export two flavors:
    //  - workflow:   includes `originalFlow` (the canvas) so it can be
    //    re-imported and edited. File suffix `.workflow.json`.
    //  - executable: omits `originalFlow` — a lean execution plan for the
    //    Python SDK `run_workflow`. File suffix `.executable.json`.
    const exportToFile = (includeOriginalFlow: boolean, suffix: string) => {
        setMenuOpen(false);
        try {
            const executable = exportWorkflow(nodes, edges, {
                name: workflowName,
                description: workflowDescription || "",
                includeOriginalFlow,
            });
            const text = JSON.stringify(executable, null, 2);
            const blob = new Blob([text], {
                type: "application/json;charset=utf-8",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${safeWorkflowFileName(workflowName)}.${suffix}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success(t("exportJsonSuccess"));
        } catch (e) {
            logger.error(e);
            showErrorToast({ message: t("exportJsonFailed") });
        }
    };

    const handleExportWorkflow = () => exportToFile(true, "workflow");
    const handleExportExecutable = () => exportToFile(false, "executable");

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
                showErrorToast({ message: t("importJsonInvalid") });
                return;
            }
            let result: ParsedWorkflowImport;
            try {
                result = parseWorkflowImportJson(parsed);
            } catch (err) {
                const msg = err instanceof Error ? err.message : "";
                if (msg === WORKFLOW_IMPORT_NO_CANVAS) {
                    showErrorToast({ message: t("importJsonNoCanvas") });
                } else {
                    showErrorToast({ message: t("importJsonInvalid") });
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
            toast.success(
                t("importJsonSuccess", {
                    nodes: result.nodes.length,
                    edges: result.edges.length,
                }),
            );
        } catch {
            showErrorToast({ message: t("importJsonReadFailed") });
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
                            onClick={handleExportWorkflow}
                            className="flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800"
                        >
                            <Download className="mr-2 h-4 w-4" />
                            {t("exportWorkflow")}
                        </div>
                        <div
                            onClick={handleExportExecutable}
                            className="flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800"
                        >
                            <Download className="mr-2 h-4 w-4" />
                            {t("exportExecutable")}
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

            {/* Save dialog */}
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
