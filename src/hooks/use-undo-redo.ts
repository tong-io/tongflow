"use client";

/**
 * Canvas undo/redo: keyboard shortcuts (Cmd/Ctrl+Z, Cmd+Shift+Z / Ctrl+Y)
 * plus canUndo/canRedo selectors for toolbar buttons. Also tracks global
 * focus changes so form-edit history entries split per focus session.
 */

import { useEffect } from "react";
import { useFlow } from "@/hooks/use-flow";
import { bumpFocusGeneration } from "@/lib/workflow/flow-history";

// Inside editable elements Cmd/Ctrl+Z must stay native text undo.
const EDITABLE_SELECTOR = "input, textarea, select, [contenteditable]";

export function useUndoRedo() {
    const canUndo = useFlow((s) => s.historyPast.length > 0);
    const canRedo = useFlow((s) => s.historyFuture.length > 0);
    const undo = useFlow((s) => s.undo);
    const redo = useFlow((s) => s.redo);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!(e.metaKey || e.ctrlKey) || e.altKey || e.isComposing) return;
            const target = e.target as HTMLElement | null;
            if (target?.closest(EDITABLE_SELECTOR)) return;

            const key = e.key.toLowerCase();
            const { undo, redo } = useFlow.getState();
            if (key === "z") {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
            } else if (key === "y" && !e.shiftKey) {
                e.preventDefault();
                redo();
            }
        };

        // New focus target → next form edit opens a fresh history entry
        const handleFocusIn = () => bumpFocusGeneration();

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("focusin", handleFocusIn);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("focusin", handleFocusIn);
        };
    }, []);

    return { undo, redo, canUndo, canRedo };
}
