"use client";

/**
 * Workspace left-side navigation button group
 * Contains: workflow list, task list, portfolio
 */

import { FolderOpen, Loader2, Workflow, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { PortfolioDialog } from "@/components/workspace/portfolio-dialog";
import { WorkflowDialog } from "@/components/workspace/workflow-dialog";
import { listTasks, type Task } from "@/lib/api/task";
import { logger } from "@/lib/logger";
import { formatStoredTaskErrorForDisplay } from "@/lib/task/error-format";

export function WorkspaceLeftNav() {
    const t = useTranslations("Navigation");

    // Task list state
    const [isTaskSheetOpen, setIsTaskSheetOpen] = useState(false);
    const [taskList, setTaskList] = useState<Task[]>([]);
    const [taskLoading, setTaskLoading] = useState(false);
    const [taskLoadingMore, setTaskLoadingMore] = useState(false);
    const [taskPage, setTaskPage] = useState(1);
    const [taskHasMore, setTaskHasMore] = useState(true);
    const taskScrollContainerRef = useRef<HTMLDivElement>(null);

    // Load the task list (initial load or refresh)
    const loadTasks = async () => {
        setTaskLoading(true);
        setTaskPage(1);
        try {
            const { tasks } = await listTasks(1, 20);
            setTaskList(tasks);
            setTaskHasMore(tasks.length >= 20);
        } catch (error) {
            logger.error("Failed to load task list:", error);
        } finally {
            setTaskLoading(false);
        }
    };

    // Load more tasks
    const loadMoreTasks = async () => {
        if (taskLoadingMore || !taskHasMore) return;

        setTaskLoadingMore(true);
        try {
            const nextPage = taskPage + 1;
            const { tasks } = await listTasks(nextPage, 20);
            setTaskList((prev) => [...prev, ...tasks]);
            setTaskPage(nextPage);
            setTaskHasMore(tasks.length >= 20);
        } catch (error) {
            logger.error("Failed to load more tasks:", error);
        } finally {
            setTaskLoadingMore(false);
        }
    };

    // Load more tasks when the task list is scrolled to the bottom
    const handleTaskScroll = useCallback(() => {
        const container = taskScrollContainerRef.current;
        if (!container) return;

        const { scrollTop, scrollHeight, clientHeight } = container;
        if (scrollHeight - scrollTop - clientHeight < 50) {
            loadMoreTasks();
        }
    }, [taskLoadingMore, taskHasMore, taskPage]);

    // Load tasks when the task list sheet opens
    useEffect(() => {
        if (isTaskSheetOpen) {
            void loadTasks();
        }
    }, [isTaskSheetOpen]);

    return (
        <>
            <div className="flex items-center gap-2">
                {/* Workflow button */}
                <WorkflowDialog
                    tooltip={t("workflows")}
                    trigger={
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t("workflows")}
                            className="h-10 w-10 rounded-xl bg-white border border-gray-100 hover:bg-gray-50 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-700 transition-all duration-200"
                        >
                            <Workflow className="h-5 w-5 text-gray-600 dark:text-gray-200" />
                        </Button>
                    }
                />

                {/* Task button */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsTaskSheetOpen(true)}
                            aria-label={t("tasks")}
                            className="h-10 w-10 rounded-xl bg-white border border-gray-100 hover:bg-gray-50 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-700 transition-all duration-200"
                        >
                            <Zap className="h-5 w-5 text-gray-600 dark:text-gray-200" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{t("tasks")}</TooltipContent>
                </Tooltip>

                {/* Portfolio button */}
                <PortfolioDialog
                    tooltip={t("portfolio")}
                    trigger={
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t("portfolio")}
                            className="h-10 w-10 rounded-xl bg-white border border-gray-100 hover:bg-gray-50 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-700 transition-all duration-200"
                        >
                            <FolderOpen className="h-5 w-5 text-gray-600 dark:text-gray-200" />
                        </Button>
                    }
                />
            </div>

            {/* Task list sidebar */}
            <Sheet open={isTaskSheetOpen} onOpenChange={setIsTaskSheetOpen}>
                <SheetContent side="left" className="flex flex-col">
                    <SheetHeader>
                        <SheetTitle>{t("myTasks")}</SheetTitle>
                    </SheetHeader>
                    <div
                        ref={taskScrollContainerRef}
                        onScroll={handleTaskScroll}
                        className="mt-4 flex-1 overflow-y-auto space-y-2 pr-1"
                    >
                        {taskLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : taskList.length === 0 ? (
                            <div className="text-center text-muted-foreground py-8">
                                {t("noTasks")}
                            </div>
                        ) : (
                            <>
                                {taskList.map((task) => (
                                    <div
                                        key={task.id}
                                        className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="font-medium text-sm">
                                                {task.feature}
                                            </div>
                                            <span
                                                className={`text-xs px-2 py-0.5 rounded-full ${
                                                    (task.status as string) ===
                                                    "COMPLETED"
                                                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                                        : (task.status as string) ===
                                                            "PROCESSING"
                                                          ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                                          : (task.status as string) ===
                                                              "failed"
                                                            ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                                            : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                                                }`}
                                            >
                                                {(task.status as string) ===
                                                "COMPLETED"
                                                    ? t("taskStatus.completed")
                                                    : (task.status as string) ===
                                                        "PROCESSING"
                                                      ? t(
                                                            "taskStatus.processing",
                                                        )
                                                      : (task.status as string) ===
                                                          "FAILED"
                                                        ? t("taskStatus.failed")
                                                        : t(
                                                              "taskStatus.pending",
                                                          )}
                                            </span>
                                        </div>
                                        {task.progress > 0 &&
                                            task.progress < 100 && (
                                                <div className="mt-2">
                                                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-primary transition-all duration-300"
                                                            style={{
                                                                width: `${task.progress}%`,
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="text-xs text-muted-foreground mt-1">
                                                        {task.progress}%
                                                    </div>
                                                </div>
                                            )}
                                        {task.error && (
                                            <div className="text-xs text-red-500 mt-1 line-clamp-2">
                                                {formatStoredTaskErrorForDisplay(
                                                    task.error,
                                                )}
                                            </div>
                                        )}
                                        <div className="text-xs text-muted-foreground mt-1">
                                            {new Date(
                                                task.createdAt,
                                            ).toLocaleString()}
                                        </div>
                                    </div>
                                ))}
                                {taskLoadingMore && (
                                    <div className="flex items-center justify-center py-4">
                                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                    </div>
                                )}
                                {!taskHasMore && taskList.length > 0 && (
                                    <div className="text-center text-muted-foreground text-sm py-4">
                                        {t("noMore")}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
}
