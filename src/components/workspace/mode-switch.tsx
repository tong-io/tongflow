"use client";

import { Switch } from "@/components/ui/switch";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Sparkles, Play } from "lucide-react";
import { useEffect, useState } from "react";
import {
    useTaskStore,
    type WorkspaceMode,
    WORKSPACE_MODE_KEY,
} from "@/hooks/use-task";
import { useTranslations } from "next-intl";

interface ModeSwitchProps {
    onChange?: (mode: WorkspaceMode) => void;
}

/**
 * Mode switch component
 * Creation mode / Execution mode
 * Available to all users (credit top-up system, no tier restrictions)
 */
export function ModeSwitch({ onChange }: ModeSwitchProps) {
    const t = useTranslations("Workspace.modeSwitch");
    const workspaceMode = useTaskStore((state) => state.workspaceMode);
    const setWorkspaceMode = useTaskStore((state) => state.setWorkspaceMode);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const savedMode = localStorage.getItem(
            WORKSPACE_MODE_KEY,
        ) as WorkspaceMode | null;
        if (savedMode && (savedMode === "create" || savedMode === "execute")) {
            setWorkspaceMode(savedMode);
        }
    }, [setWorkspaceMode]);

    const handleModeChange = (checked: boolean) => {
        const newMode: WorkspaceMode = checked ? "execute" : "create";
        setWorkspaceMode(newMode);
        onChange?.(newMode);
    };

    if (!mounted) {
        return (
            <div className="flex items-center gap-1.5 p-2 rounded-xl bg-background/80 backdrop-blur-md border border-border/50 dark:border-gray-500/60">
                <div className="w-16 h-6" />
            </div>
        );
    }

    const isExecuteMode = workspaceMode === "execute";

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 p-2 rounded-xl bg-background/80 backdrop-blur-md border border-border/50 dark:border-gray-500/60 transition-all duration-300 hover:border-border dark:hover:border-gray-400/70 cursor-pointer">
                    <Sparkles
                        className={`size-4 transition-all duration-200 ${
                            !isExecuteMode
                                ? "text-violet-500 scale-110"
                                : "text-muted-foreground scale-100"
                        }`}
                    />

                    <Switch
                        checked={isExecuteMode}
                        onCheckedChange={handleModeChange}
                        className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-violet-500 dark:data-[state=unchecked]:bg-violet-500 data-[state=checked]:dark:bg-emerald-500"
                    />

                    <Play
                        className={`size-4 transition-all duration-200 ${
                            isExecuteMode
                                ? "text-emerald-500 scale-110"
                                : "text-muted-foreground scale-100"
                        }`}
                    />
                </div>
            </TooltipTrigger>
            <TooltipContent side="top">
                {isExecuteMode ? t("executeMode") : t("createMode")}
            </TooltipContent>
        </Tooltip>
    );
}
