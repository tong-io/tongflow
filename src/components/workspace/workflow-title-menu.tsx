"use client";

import { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import {
    ChevronDown,
    Save,
    FilePlus2,
    Trash2,
    Loader2,
    Upload,
} from "lucide-react";
import { useFlow } from "@/hooks/use-flow";
import { useShallow } from "zustand/react/shallow";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
    publishWorkflow,
    SaveWorkflowRequest,
} from "@/lib/api/workspace";
import { exportWorkflow } from "@/utils/workflow-exporter";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const selector = (state: any) => ({
    nodes: state.nodes,
    edges: state.edges,
    workflowName: state.workflowName,
    workflowId: state.workflowId,
    workflowDescription: state.workflowDescription,
    currentShareId: state.currentShareId,
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
        currentShareId,
        setWorkflowName,
        setWorkflowId,
        setWorkflowDescription,
        setCurrentShareId,
        setNodes,
        setEdges,
    } = useFlow(useShallow(selector));

    const t = useTranslations("Workspace.menu");
    const tIndex = useTranslations("Index");
    const td = useTranslations("Workspace.dialog");

    const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
    const [isSaveAsMode, setIsSaveAsMode] = useState(false);
    const [tempName, setTempName] = useState(workflowName);
    const [tempDescription, setTempDescription] = useState(
        workflowDescription || "",
    );
    const [saving, setSaving] = useState(false);

    // 发布相关状态
    const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
    const [publishDescription, setPublishDescription] = useState("");
    const [publishing, setPublishing] = useState(false);

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

    // 打开发布对话框（三阶段检查）
    const openPublishDialog = () => {
        // 1. 检查工作流是否已保存
        if (!workflowId) {
            toast.error(t("saveFirst"));
            // 自动打开保存对话框
            setIsSaveAsMode(false);
            setTempName(workflowName);
            setTempDescription(workflowDescription || "");
            setIsSaveDialogOpen(true);
            return;
        }

        // 2. 封面检查由后端处理，前端直接打开发布对话框
        // 如果没有封面，后端会返回错误，前端再提示用户
        setPublishDescription(workflowDescription || "");
        setIsPublishDialogOpen(true);
    };

    // 发布工作流
    const handlePublish = async () => {
        if (!workflowId) return;

        if (!publishDescription.trim()) {
            toast.error(td("enterPublishDesc"));
            return;
        }

        setPublishing(true);
        try {
            const result = await publishWorkflow({
                workflowId: workflowId,
                description: publishDescription,
                // cover 不传，后端自动使用 workflow.cover（最新执行结果）
            });

            if (result.noChanges) {
                toast.success(t("alreadyLatest"));
            } else {
                toast.success(
                    result.isUpdate
                        ? td("updatePublish")
                        : td("publishWorkflow"),
                );
            }
            setCurrentShareId(result.shareId);
            setIsPublishDialogOpen(false);
            setPublishDescription("");
        } catch (error) {
            console.error("发布失败:", error);
            toast.error(td("publishFailed"));
        } finally {
            setPublishing(false);
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
                            onClick={openPublishDialog}
                            className="flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800"
                        >
                            <Upload className="mr-2 h-4 w-4" />
                            {currentShareId ? t("upgrade") : t("publish")}
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

            {/* 发布对话框 */}
            <Dialog
                open={isPublishDialogOpen}
                onOpenChange={(open) => {
                    setIsPublishDialogOpen(open);
                    if (!open) {
                        setPublishDescription("");
                    }
                }}
            >
                <DialogContent
                    className="max-w-md"
                    aria-describedby={undefined}
                >
                    <DialogHeader>
                        <DialogTitle>
                            {currentShareId
                                ? td("updatePublish")
                                : td("publishWorkflow")}
                            {workflowName ? ` - ${workflowName}` : ""}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <p className="text-sm text-muted-foreground">
                            {td("coverHint")}
                        </p>
                        {/* 发布描述 */}
                        <div className="space-y-2">
                            <Label htmlFor="publish-description">
                                {td("publishDesc")}
                            </Label>
                            <Textarea
                                id="publish-description"
                                value={publishDescription}
                                onChange={(e) =>
                                    setPublishDescription(e.target.value)
                                }
                                placeholder={td("publishDescPlaceholder")}
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline">{td("cancel")}</Button>
                        </DialogClose>
                        <Button onClick={handlePublish} disabled={publishing}>
                            {publishing ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {td("publishing")}
                                </>
                            ) : (
                                <>
                                    <Upload className="mr-2 h-4 w-4" />
                                    {currentShareId
                                        ? td("update")
                                        : td("publish")}
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
