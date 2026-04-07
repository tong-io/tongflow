"use client";

import { useState, useEffect, useCallback, useRef, memo } from "react";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogClose,
    DialogHeader,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Waterfall } from "@/components/ui/waterfall";
import {
    listWorkflows,
    publishWorkflow,
    type Workflow,
} from "@/lib/api/workspace";
import { getR2Url } from "@/lib/r2-utils";
import {
    Workflow as WorkflowIcon,
    Download,
    Loader2,
    RefreshCw,
    Image,
    Video,
    Box,
    Play,
    Upload,
    File as FileIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import { useFlow } from "@/hooks/use-flow";
import type { Node, Edge } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { formatDate } from "@/utils/date-utils";

/**
 * 根据 fileKey 推断素材类型
 */
function inferMediaType(
    fileKey: string,
): "image" | "video" | "model" | "other" {
    const ext = fileKey.split(".").pop()?.toLowerCase() || "";

    if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext)) {
        return "image";
    }
    if (["mp4", "webm", "mov", "avi", "mkv", "flv", "wmv"].includes(ext)) {
        return "video";
    }
    if (["glb", "gltf", "obj", "fbx", "stl"].includes(ext)) {
        return "model";
    }
    return "other";
}

// 工作流卡片组件 - 使用 memo 避免父组件状态变化时重新渲染
const WorkflowCard = memo(function WorkflowCard({
    data,
    onLoad,
    onShare,
}: {
    index: number;
    data: Workflow;
    width: number;
    onLoad: (workflow: Workflow) => void;
    onShare: (workflow: Workflow) => void;
}) {
    const t = useTranslations("Workspace.dialog");
    const [isPlaying, setIsPlaying] = useState(false);
    const cover = data.cover;
    const coverUrl = cover ? getR2Url(cover) : "";
    const coverType = cover ? inferMediaType(cover) : null;

    // 渲染预览内容
    const renderPreview = () => {
        if (!cover) {
            // 没有代表作时，显示工作流图标
            return (
                <div className="aspect-video bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
                    <WorkflowIcon className="size-16 text-muted-foreground/50" />
                </div>
            );
        }

        switch (coverType) {
            case "image":
                return (
                    <img
                        src={coverUrl}
                        alt={data.name}
                        className="w-full h-auto object-cover"
                        loading="lazy"
                    />
                );

            case "video":
                return (
                    <div className="relative group/video">
                        {isPlaying ? (
                            <video
                                src={coverUrl}
                                className="w-full h-auto"
                                controls
                                autoPlay
                                onEnded={() => setIsPlaying(false)}
                            />
                        ) : (
                            <>
                                <video
                                    src={coverUrl}
                                    className="w-full h-auto object-cover"
                                    muted
                                    preload="metadata"
                                />
                                <button
                                    className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover/video:opacity-100 transition-opacity"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsPlaying(true);
                                    }}
                                >
                                    <div className="size-12 rounded-full bg-white/90 flex items-center justify-center">
                                        <Play className="size-6 text-primary ml-1" />
                                    </div>
                                </button>
                            </>
                        )}
                    </div>
                );

            case "model":
                return (
                    <div className="aspect-video bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center">
                        <Box className="size-16 text-primary/50" />
                    </div>
                );

            default:
                return (
                    <div className="aspect-video bg-muted flex items-center justify-center">
                        <FileIcon className="size-16 text-muted-foreground" />
                    </div>
                );
        }
    };

    // 获取素材类型图标
    const getTypeIcon = () => {
        if (!coverType) return null;
        switch (coverType) {
            case "image":
                return <Image className="size-4" />;
            case "video":
                return <Video className="size-4" />;
            case "model":
                return <Box className="size-4" />;
            default:
                return <FileIcon className="size-4" />;
        }
    };

    return (
        <div className="relative rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
            {/* 预览图 */}
            {renderPreview()}

            {/* 始终显示的名称（在没有悬浮时） */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3 group-hover:opacity-0 transition-opacity pointer-events-none">
                <h3 className="font-medium text-white text-sm truncate">
                    {data.name}
                </h3>
            </div>

            {/* 悬浮覆盖层 */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
                {/* 工作流名称和描述 */}
                <div className="mb-3">
                    <h3 className="font-semibold text-white text-lg truncate">
                        {data.name}
                    </h3>
                    {data.description && (
                        <p className="text-white/70 text-sm line-clamp-2 mt-1">
                            {data.description}
                        </p>
                    )}
                    <p className="text-white/50 text-xs mt-1">
                        {formatDate(data.updatedAt)}
                    </p>
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1"
                        onClick={(e) => {
                            e.stopPropagation();
                            onLoad(data);
                        }}
                    >
                        <Download className="h-4 w-4 mr-1" />
                        {t("open")}
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 bg-white/10 border-white/20 text-white hover:bg-white/20"
                        onClick={(e) => {
                            e.stopPropagation();
                            onShare(data);
                        }}
                    >
                        <Upload className="h-4 w-4 mr-1" />
                        {data.currentShareId ? t("update") : t("publish")}
                    </Button>
                </div>
            </div>

            {/* 素材类型标识 */}
            {cover && coverType && (
                <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm rounded-full p-1.5 pointer-events-none">
                    <span className="text-white">{getTypeIcon()}</span>
                </div>
            )}
        </div>
    );
});

// 发布对话框内容组件 - 提取为独立组件避免输入时触发父组件重渲染
function PublishDialogContent({
    workflow,
    initialDescription,
    onPublish,
    onClose,
}: {
    workflow: Workflow;
    initialDescription: string;
    onPublish: (description: string) => Promise<void>;
    onClose: () => void;
}) {
    const t = useTranslations("Workspace.dialog");
    const [description, setDescription] = useState(initialDescription);
    const [publishing, setPublishing] = useState(false);

    const handleSubmit = async () => {
        if (!description.trim()) {
            toast.error(t("enterPublishDesc"));
            return;
        }

        setPublishing(true);
        try {
            await onPublish(description);
        } finally {
            setPublishing(false);
        }
    };

    return (
        <DialogContent className="max-w-md" aria-describedby={undefined}>
            <DialogHeader>
                <DialogTitle>
                    {workflow.currentShareId
                        ? t("updatePublish")
                        : t("publishWorkflow")}
                    {workflow ? ` - ${workflow.name}` : ""}
                </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
                <p className="text-sm text-muted-foreground">
                    {t("coverHint")}
                </p>
                {/* 发布描述 */}
                <div className="space-y-2">
                    <Label htmlFor="publish-description">
                        {t("publishDesc")}
                    </Label>
                    <Textarea
                        id="publish-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={t("publishDescPlaceholder")}
                        rows={3}
                    />
                </div>
            </div>
            <DialogFooter>
                <DialogClose asChild>
                    <Button variant="outline" onClick={onClose}>
                        {t("cancel")}
                    </Button>
                </DialogClose>
                <Button onClick={handleSubmit} disabled={publishing}>
                    {publishing ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {t("publishing")}
                        </>
                    ) : (
                        <>
                            <Upload className="mr-2 h-4 w-4" />
                            {workflow.currentShareId
                                ? t("update")
                                : t("publish")}
                        </>
                    )}
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}

interface WorkflowDialogProps {
    trigger?: React.ReactNode;
}

export function WorkflowDialog({ trigger }: WorkflowDialogProps) {
    const t = useTranslations("Workspace.dialog");
    const tMenu = useTranslations("Workspace.menu");
    const [open, setOpen] = useState(false);
    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // 发布相关状态
    const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
    const [publishingWorkflow, setPublishingWorkflow] =
        useState<Workflow | null>(null);

    // 加载工作流列表
    const fetchWorkflows = useCallback(async () => {
        setLoading(true);
        setPage(1);
        try {
            const { workflows: data, pagination } = await listWorkflows(1, 12);
            setWorkflows(data);
            setHasMore(pagination?.hasMore ?? false);
        } catch (error) {
            console.error("加载工作流失败:", error);
            toast.error("加载工作流失败");
        } finally {
            setLoading(false);
        }
    }, []);

    // 加载更多
    const loadMore = useCallback(async () => {
        if (loadingMore || !hasMore) return;

        setLoadingMore(true);
        try {
            const nextPage = page + 1;
            const { workflows: data, pagination } = await listWorkflows(
                nextPage,
                12,
            );
            setWorkflows((prev) => [...prev, ...data]);
            setPage(nextPage);
            setHasMore(pagination?.hasMore ?? false);
        } catch (error) {
            console.error("加载更多失败:", error);
        } finally {
            setLoadingMore(false);
        }
    }, [loadingMore, hasMore, page]);

    // 滚动加载更多
    const handleScroll = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const { scrollTop, scrollHeight, clientHeight } = container;
        if (scrollHeight - scrollTop - clientHeight < 100) {
            loadMore();
        }
    }, [loadMore]);

    // 打开时加载
    useEffect(() => {
        if (open) {
            fetchWorkflows();
        }
    }, [open, fetchWorkflows]);

    // 加载工作流到画布
    const handleLoad = useCallback((workflow: Workflow) => {
        try {
            const flowData = JSON.parse(workflow.flow) as {
                nodes: Node[];
                edges: Edge[];
            };

            useFlow.getState().setNodes(flowData.nodes);
            useFlow.getState().setEdges(flowData.edges);
            useFlow.getState().setWorkflowName(workflow.name);
            useFlow
                .getState()
                .setWorkflowDescription(workflow.description || "");
            useFlow.getState().setWorkflowId(workflow.id);
            useFlow
                .getState()
                .setCurrentShareId(workflow.currentShareId || null);
            setOpen(false);

            toast.success(t("loadSuccess"));
        } catch (error) {
            console.error("加载工作流失败:", error);
            toast.error(t("loadFailed"));
        }
    }, []);

    // 打开发布对话框
    const openPublishDialog = useCallback((workflow: Workflow) => {
        setPublishingWorkflow(workflow);
        setIsPublishDialogOpen(true);
    }, []);

    // 发布工作流
    const handlePublish = useCallback(
        async (description: string) => {
            if (!publishingWorkflow) return;

            const result = await publishWorkflow({
                workflowId: publishingWorkflow.id,
                description: description,
            });

            toast.success(
                result.isUpdate ? t("updatePublish") : t("publishWorkflow"),
            );
            setIsPublishDialogOpen(false);
            setPublishingWorkflow(null);
            // 刷新工作流列表
            fetchWorkflows();
        },
        [publishingWorkflow, fetchWorkflows, t],
    );

    // 稳定化 Waterfall 的 render 函数，避免父组件状态变化时重新渲染瀑布流
    const renderWorkflowCard = useCallback(
        (props: { index: number; data: Workflow; width: number }) => (
            <WorkflowCard
                {...props}
                onLoad={handleLoad}
                onShare={openPublishDialog}
            />
        ),
        [handleLoad, openPublishDialog],
    );

    // 稳定化 itemKey 函数
    const getItemKey = useCallback((item: Workflow) => item.id, []);

    return (
        <>
            <Dialog open={open} onOpenChange={setOpen}>
                {trigger ? (
                    <DialogTrigger asChild>{trigger}</DialogTrigger>
                ) : (
                    <DialogTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="hover:bg-gray-200 dark:hover:bg-gray-700"
                        >
                            <WorkflowIcon className="h-4 w-4" />
                        </Button>
                    </DialogTrigger>
                )}
                <DialogContent
                    className="!max-w-[95vw] !w-[95vw] h-[85vh] flex flex-col p-0"
                    aria-describedby={undefined}
                >
                    <div className="flex items-center gap-4 px-4 py-3 border-b shrink-0">
                        <DialogTitle className="text-lg shrink-0">
                            {t("myWorkflows")}
                        </DialogTitle>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={fetchWorkflows}
                            disabled={loading}
                            className="shrink-0 size-8"
                        >
                            <RefreshCw
                                className={`size-4 ${loading ? "animate-spin" : ""}`}
                            />
                        </Button>
                    </div>

                    <div
                        ref={scrollContainerRef}
                        onScroll={handleScroll}
                        className="flex-1 overflow-auto px-6 py-4"
                    >
                        {loading ? (
                            <div className="h-full flex items-center justify-center">
                                <Loader2 className="size-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : workflows.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center gap-2">
                                <WorkflowIcon className="size-16 text-muted-foreground" />
                                <p className="text-muted-foreground">
                                    {t("noWorkflows")}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    {t("savedWorkflowsHint")}
                                </p>
                            </div>
                        ) : (
                            <>
                                <Waterfall
                                    items={workflows}
                                    render={renderWorkflowCard}
                                    columnWidth={280}
                                    columnGutter={16}
                                    rowGutter={16}
                                    itemKey={getItemKey}
                                    className="min-h-full"
                                />
                                {loadingMore && (
                                    <div className="flex items-center justify-center py-4">
                                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                                    </div>
                                )}
                                {!hasMore && workflows.length > 0 && (
                                    <div className="text-center text-muted-foreground text-sm py-4">
                                        {t("noMore")}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* 发布对话框 */}
            <Dialog
                open={isPublishDialogOpen}
                onOpenChange={(open) => {
                    setIsPublishDialogOpen(open);
                    if (!open) {
                        setPublishingWorkflow(null);
                    }
                }}
            >
                {publishingWorkflow && (
                    <PublishDialogContent
                        workflow={publishingWorkflow}
                        initialDescription={
                            publishingWorkflow.description || ""
                        }
                        onPublish={handlePublish}
                        onClose={() => setIsPublishDialogOpen(false)}
                    />
                )}
            </Dialog>
        </>
    );
}
