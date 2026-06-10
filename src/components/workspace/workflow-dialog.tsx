"use client";

import type { Edge, Node } from "@xyflow/react";
import {
    Box,
    Download,
    File as FileIcon,
    Image,
    Loader2,
    Play,
    RefreshCw,
    Video,
    Workflow as WorkflowIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { showErrorToast } from "@/components/ui/error-toast";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Waterfall } from "@/components/ui/waterfall";
import { useFlow } from "@/hooks/use-flow";
import { listWorkflows, type Workflow } from "@/lib/api/workspace";
import { getFileUrl } from "@/lib/file/url";
import { logger } from "@/lib/logger";
import { formatDate } from "@/utils/date-utils";

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

const WorkflowCard = memo(function WorkflowCard({
    data,
    onLoad,
}: {
    index: number;
    data: Workflow;
    width: number;
    onLoad: (workflow: Workflow) => void;
}) {
    const t = useTranslations("Workspace.dialog");
    const [isPlaying, setIsPlaying] = useState(false);
    const cover = data.cover;
    const coverUrl = cover ? getFileUrl(cover) : "";
    const coverType = cover ? inferMediaType(cover) : null;

    const renderPreview = () => {
        if (!cover) {
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
                                    type="button"
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
            {renderPreview()}

            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3 group-hover:opacity-0 transition-opacity pointer-events-none">
                <h3 className="font-medium text-white text-sm truncate">
                    {data.name}
                </h3>
            </div>

            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
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

                <Button
                    size="sm"
                    variant="secondary"
                    className="w-full"
                    onClick={(e) => {
                        e.stopPropagation();
                        onLoad(data);
                    }}
                >
                    <Download className="h-4 w-4 mr-1" />
                    {t("open")}
                </Button>
            </div>

            {cover && coverType && (
                <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm rounded-full p-1.5 pointer-events-none">
                    <span className="text-white">{getTypeIcon()}</span>
                </div>
            )}
        </div>
    );
});

interface WorkflowDialogProps {
    trigger?: React.ReactNode;
    /** Optional tooltip shown when hovering the (custom) trigger. */
    tooltip?: string;
}

export function WorkflowDialog({ trigger, tooltip }: WorkflowDialogProps) {
    const t = useTranslations("Workspace.dialog");
    const [open, setOpen] = useState(false);
    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const fetchWorkflows = useCallback(async () => {
        setLoading(true);
        setPage(1);
        try {
            const { workflows: data, pagination } = await listWorkflows(1, 12);
            setWorkflows(data);
            setHasMore(pagination?.hasMore ?? false);
        } catch (error) {
            logger.error("Failed to load workflows:", error);
            showErrorToast({ message: t("loadFailed") });
        } finally {
            setLoading(false);
        }
    }, [t]);

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
            logger.error("Failed to load more workflows:", error);
        } finally {
            setLoadingMore(false);
        }
    }, [loadingMore, hasMore, page]);

    const handleScroll = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const { scrollTop, scrollHeight, clientHeight } = container;
        if (scrollHeight - scrollTop - clientHeight < 100) {
            loadMore();
        }
    }, [loadMore]);

    useEffect(() => {
        if (open) {
            fetchWorkflows();
        }
    }, [open, fetchWorkflows]);

    const handleLoad = useCallback(
        (workflow: Workflow) => {
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
                setOpen(false);

                toast.success(t("loadSuccess"));
            } catch (error) {
                logger.error("Failed to load workflow:", error);
                showErrorToast({ message: t("loadFailed") });
            }
        },
        [t],
    );

    const renderWorkflowCard = useCallback(
        (props: { index: number; data: Workflow; width: number }) => (
            <WorkflowCard {...props} onLoad={handleLoad} />
        ),
        [handleLoad],
    );

    const getItemKey = useCallback((item: Workflow) => item.id, []);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {trigger ? (
                tooltip ? (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <DialogTrigger asChild>{trigger}</DialogTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">{tooltip}</TooltipContent>
                    </Tooltip>
                ) : (
                    <DialogTrigger asChild>{trigger}</DialogTrigger>
                )
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
    );
}
