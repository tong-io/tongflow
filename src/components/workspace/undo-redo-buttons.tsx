"use client";

/**
 * Undo/redo button pair shown next to the workspace left nav.
 */

import { Redo2, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUndoRedo } from "@/hooks/use-undo-redo";

const BUTTON_CLASS =
    "h-10 w-10 rounded-xl bg-white border border-gray-100 hover:bg-gray-50 disabled:opacity-40 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-700 transition-all duration-200";

export function UndoRedoButtons() {
    const t = useTranslations("Navigation");
    const { undo, redo, canUndo, canRedo } = useUndoRedo();

    return (
        <div className="flex items-center gap-2">
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={undo}
                        disabled={!canUndo}
                        aria-label={t("undo")}
                        className={BUTTON_CLASS}
                    >
                        <Undo2 className="h-5 w-5 text-gray-600 dark:text-gray-200" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t("undo")}</TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={redo}
                        disabled={!canRedo}
                        aria-label={t("redo")}
                        className={BUTTON_CLASS}
                    >
                        <Redo2 className="h-5 w-5 text-gray-600 dark:text-gray-200" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t("redo")}</TooltipContent>
            </Tooltip>
        </div>
    );
}
