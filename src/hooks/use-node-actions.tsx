"use client";

/**
 * Node action menu hook
 *
 * Produces the contextual action toolbar (e.g. "split", "generate video",
 * "fuse images") shown above selected nodes. Splits its output into two render
 * slots:
 *  - `comboActions`: for multi-select / combo-mode combinations (N→1 etc.)
 *  - `singleActions`: for a single selected node
 *
 * The caller (smart-island) decides which slot to render based on `comboMode`.
 * Returns `null` for both when no actionable combination applies.
 *
 * Which ABI nodes a selection can reach is derived from the ABI itself by
 * `nodeActionsForSelection` — this file only turns those candidates into
 * buttons and keeps the handful of actions the ABI knows nothing about
 * (grouping several nodes into one, splitting a group back apart).
 */

import type { Node } from "@xyflow/react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import {
    type BaseNodeData,
    isModalityNode,
    type NodeActionCandidate,
    nodeActionsForSelection,
    type SelectionCounts,
} from "tongflow";
import { cn } from "tongflow/canvas";

interface ButtonConfig {
    text: string;
    onClick: () => void;
    id?: string;
    nodeType?: string;
}

function ActionContainer({ children }: { children: ReactNode }) {
    return (
        <div className="flex items-center justify-center gap-2 border border-white/20 dark:border-gray-500/30 bg-white dark:bg-zinc-800/90 h-[48px] w-max rounded-full px-4">
            {children}
        </div>
    );
}

function TextButton({ text, onClick }: { text: string; onClick?: () => void }) {
    return (
        <div
            className={cn(
                "px-3 py-1.5 cursor-pointer rounded-full text-sm font-medium flex items-center gap-1",
                "bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700/50",
                "transition-colors duration-200",
                "active:scale-95",
                "text-gray-600 dark:text-gray-200",
                "whitespace-nowrap",
            )}
            onClick={onClick}
        >
            {text}
        </div>
    );
}

function ActionItem({ buttons }: { buttons: ButtonConfig[] }) {
    return (
        <ActionContainer>
            {buttons.map((b, i) => (
                <TextButton key={i} text={b.text} onClick={b.onClick} />
            ))}
        </ActionContainer>
    );
}

// Read `data` as BaseNodeData. React Flow types `Node["data"]` as
// `Record<string, unknown>`, so this small helper centralizes the narrowing.
function asBaseData(data: unknown): BaseNodeData {
    return (data as BaseNodeData | undefined) ?? {};
}

// Section tags ("[Verse]", "[Chorus]") or several lines mark a text as lyrics
// rather than a one-line style prompt.
function looksLikeLyrics(text: string): boolean {
    if (/^\s*\[[^\]\n]+\]\s*$/m.test(text)) return true;
    return text.split("\n").filter((line) => line.trim()).length >= 4;
}

/** A grouped node holds several files (or several texts) in one node. */
function isGroup(data: BaseNodeData): boolean {
    return (data.fileKeys?.length ?? 0) > 1 || (data.texts?.length ?? 0) > 1;
}

function tally(nodes: Node[]): SelectionCounts {
    const counts: SelectionCounts = {};
    for (const node of nodes) {
        if (!isModalityNode(node.type)) continue;
        const key = node.type as keyof SelectionCounts;
        counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
}

/**
 * Several node types share one label — `image-gen-video`, `audio-image-gen-video`
 * and `speech-text-gen-video` all read as "generate video". Keep the
 * lowest-ordered one so the toolbar doesn't show the same word three times.
 */
function dedupeByLabel(
    candidates: NodeActionCandidate[],
): NodeActionCandidate[] {
    const seen = new Set<string>();
    return candidates.filter((c) => {
        if (seen.has(c.label)) return false;
        seen.add(c.label);
        return true;
    });
}

interface UseNodeActionsArgs {
    nodes: Node[];
    selectedNodes: Node[];
    comboMode: boolean;
    comboSelectedIds: Set<string>;
    expands: (
        nodeId: string | null,
        possibleNodes: Array<{ type: string; data?: Record<string, unknown> }>,
    ) => string[];
    compose: (newNode: {
        type: string;
        data: unknown;
        sourceOrder?: string[];
    }) => string;
    t: (key: string) => string;
}

export interface UseNodeActionsResult {
    comboActions: ReactNode | null;
    singleActions: ReactNode | null;
}

export function useNodeActions(args: UseNodeActionsArgs): UseNodeActionsResult {
    const { nodes, selectedNodes, comboSelectedIds, expands, compose, t } =
        args;

    const comboActions = useMemo<ReactNode | null>(() => {
        const ids = Array.from(comboSelectedIds);
        const selected = ids
            .map((id) => nodes.find((n) => n.id === id))
            .filter((n): n is Node => !!n && isModalityNode(n.type));
        if (selected.length < 2) return null;

        const counts = tally(selected);
        const buttons: ButtonConfig[] = [];

        // Not an ABI action: fold same-modality nodes into one grouped node.
        const distinctTypes = new Set(selected.map((n) => n.type));
        if (distinctTypes.size === 1) {
            const type = selected[0]?.type;
            const isText = type === "textNode";
            buttons.push({
                text: t("mergeGroup"),
                id: "merge-group",
                onClick: () =>
                    compose({
                        type: type as string,
                        data: isText
                            ? {
                                  texts: selected.flatMap(
                                      (n) => asBaseData(n.data).texts ?? [],
                                  ),
                              }
                            : {
                                  fileKeys: selected.flatMap(
                                      (n) => asBaseData(n.data).fileKeys ?? [],
                                  ),
                              },
                    }),
            });
        }

        // An audio reference plus a style prompt and lyrics: which text is
        // which is read from content, so click order doesn't matter, and
        // sourceOrder then wires each text to the matching handle.
        const musicOrder = musicSourceOrder(selected);

        for (const candidate of dedupeByLabel(
            nodeActionsForSelection(counts),
        )) {
            buttons.push({
                text: t(candidate.label),
                id: candidate.nodeType,
                nodeType: candidate.nodeType,
                onClick: () =>
                    compose({
                        type: candidate.nodeType,
                        data: { ids },
                        sourceOrder: musicOrder?.[candidate.nodeType],
                    }),
            });
        }

        return buttons.length > 0 ? <ActionItem buttons={buttons} /> : null;
    }, [nodes, comboSelectedIds, compose, t]);

    const singleActions = useMemo<ReactNode | null>(() => {
        if (selectedNodes.length !== 1) return null;
        const node = selectedNodes[0];
        if (!node?.type || !isModalityNode(node.type)) return null;
        const { type, id } = node;
        const data = asBaseData(node.data);
        const group = isGroup(data);

        const buttons: ButtonConfig[] = [];

        // Not an ABI action: break a grouped node back into one node per file.
        if (group) {
            const parts: Array<{
                type: string;
                data: Record<string, unknown>;
            }> =
                type === "textNode"
                    ? (data.texts ?? []).map((text) => ({
                          type,
                          data: { texts: [text] },
                      }))
                    : (data.fileKeys ?? []).map((fileKey) => ({
                          type,
                          data: { fileKeys: [fileKey] },
                      }));
            buttons.push({
                text: t("split"),
                id: "split",
                onClick: () => expands(id, parts),
            });
        }

        const candidates = dedupeByLabel(
            nodeActionsForSelection({ [type]: 1 } as SelectionCounts, {
                group,
            }),
        );
        for (const candidate of candidates) {
            buttons.push({
                text: t(candidate.label),
                id: candidate.nodeType,
                nodeType: candidate.nodeType,
                onClick: () =>
                    expands(id, [{ type: candidate.nodeType, data }]),
            });
        }

        return buttons.length > 0 ? <ActionItem buttons={buttons} /> : null;
    }, [selectedNodes, expands, t]);

    return { comboActions, singleActions };
}

/**
 * For an audio node plus a style prompt and lyrics, the per-node-type
 * `sourceOrder` that wires each selected node to the right handle (fields are
 * matched in ABI order). `undefined` when the selection isn't that shape.
 */
function musicSourceOrder(
    selected: Node[],
): Record<string, string[]> | undefined {
    const audios = selected.filter((n) => n.type === "audioNode");
    const texts = selected.filter((n) => n.type === "textNode");
    if (audios.length !== 1 || texts.length !== 2) return undefined;
    if (selected.length !== 3) return undefined;

    const textOf = (node: Node) =>
        (asBaseData(node.data).texts ?? []).join("\n");
    const lyricsIndex =
        looksLikeLyrics(textOf(texts[1] as Node)) &&
        !looksLikeLyrics(textOf(texts[0] as Node))
            ? 1
            : 0;
    const audioId = (audios[0] as Node).id;
    const lyricsId = (texts[lyricsIndex] as Node).id;
    const styleId = (texts[1 - lyricsIndex] as Node).id;

    return {
        // music-cover order: audio, ref_audio, text, lyrics
        musicCoverNode: [audioId, styleId, lyricsId],
        // gen-music order: lyrics, tags, ..., ref_audio
        textGenMusicNode: [lyricsId, styleId, audioId],
    };
}
