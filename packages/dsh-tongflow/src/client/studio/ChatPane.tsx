/**
 * Compact chat column inside the Studio tab: renders the session's
 * conversation (user / assistant text, tool calls, streaming partial). dsh's
 * own composer below the view sends to the same session, so no second
 * composer is drawn; the full-featured chat stays one tab away.
 */

import type {} from "@deepseek-ai/dsh-client-ui-chat/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import type {} from "@deepseek-ai/dsh-client-ui-session/client";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { useEffect, useMemo, useRef } from "react";
import { useT } from "tongflow-studio/client";

export type ChatPaneProps = Pick<
    PropsRuntime<"conversation.view">,
    "useSession" | "useChat" | "inputActions" | "useInput" | "sessionId"
>;

interface Row {
    key: string;
    role: "user" | "assistant" | "tool" | "system" | "error";
    title?: string;
    text: string;
    ok?: boolean;
    running?: boolean;
}

function textOf(content: readonly unknown[]): string {
    const parts: string[] = [];
    for (const b of content as {
        type?: string;
        text?: string;
        name?: string;
    }[]) {
        if (b?.type === "text" && b.text) parts.push(b.text);
        else if (b?.type === "image") parts.push("[image]");
        else if (b?.type === "tool-call" && b.name) parts.push(`⚙ ${b.name}`);
    }
    return parts.join("\n");
}

function shortArgs(raw: string): string {
    try {
        const o = JSON.parse(raw) as Record<string, unknown>;
        const keys = [
            "workflow",
            "path",
            "id",
            "owner",
            "pass",
            "ref",
            "title",
            "episode",
            "runId",
            "name",
        ];
        const picks = keys
            .filter((k) => o[k] !== undefined)
            .map((k) => `${k}=${String(o[k]).slice(0, 40)}`);
        return picks.join(" ") || raw.slice(0, 80);
    } catch {
        return raw.slice(0, 80);
    }
}

export function ChatPane({ useSession, useChat }: ChatPaneProps) {
    const t = useT();
    // The transcript lives on the Chat target (ui-chat); the session snapshot
    // keeps only lifecycle state.
    const nodes = useChat((s) => s.legacy.nodes);
    const partial = useChat((s) => s.legacy.partial);
    const runningCalls = useChat((s) => s.legacy.runningCalls);
    const running = useSession((s) => s.running);
    const listRef = useRef<HTMLDivElement>(null);

    const rows = useMemo<Row[]>(() => {
        const out: Row[] = [];
        for (const n of nodes as unknown as Record<string, unknown>[]) {
            const kind = n.kind as string;
            const seq = String(n.seq);
            if (kind === "user")
                out.push({
                    key: seq,
                    role: "user",
                    text: textOf(n.content as unknown[]),
                });
            else if (kind === "assistant") {
                const blocks = n.blocks as {
                    kind: string;
                    text?: string;
                    name?: string;
                    argsRaw?: string;
                }[];
                const text = blocks
                    .filter((b) => b.kind === "text")
                    .map((b) => b.text ?? "")
                    .join("\n")
                    .trim();
                if (text)
                    out.push({ key: `${seq}-t`, role: "assistant", text });
                for (const b of blocks) {
                    if (b.kind === "tool-call")
                        out.push({
                            key: `${seq}-${b.name}-${Math.random()}`,
                            role: "tool",
                            title: b.name,
                            text: shortArgs(b.argsRaw ?? ""),
                        });
                }
            } else if (kind === "tool-result") {
                const call = n.call as { name: string } | null;
                const isError = Boolean(n.isError);
                const text = textOf(n.content as unknown[]);
                out.push({
                    key: seq,
                    role: "tool",
                    title: `${call?.name ?? "tool"} ${isError ? "✗" : "✓"}`,
                    text: text.length > 240 ? `${text.slice(0, 240)}…` : text,
                    ok: !isError,
                });
            } else if (kind === "turn-error")
                out.push({
                    key: seq,
                    role: "error",
                    text: String(n.message ?? "error"),
                });
            // context / steering injections are noise here; the full chat tab shows them.
        }
        if (partial) {
            const blocks = (
                partial as unknown as {
                    blocks: { kind: string; text?: string }[];
                }
            ).blocks;
            const text = blocks
                .filter((b) => b.kind === "text")
                .map((b) => b.text ?? "")
                .join("");
            if (text)
                out.push({
                    key: "partial",
                    role: "assistant",
                    text,
                    running: true,
                });
        }
        for (const c of runningCalls as unknown as {
            callId: string;
            name: string;
            argsRaw: string;
        }[]) {
            out.push({
                key: `run-${c.callId}`,
                role: "tool",
                title: `${c.name} …`,
                text: shortArgs(c.argsRaw),
                running: true,
            });
        }
        return out;
    }, [nodes, partial, runningCalls]);

    useEffect(() => {
        const el = listRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [rows.length, partial]);

    return (
        <div className="tfs-chat">
            <div className="tfs-chat-list" ref={listRef}>
                {rows.length === 0 ? (
                    <div className="tfs-muted" style={{ padding: 12 }}>
                        {t("chatEmpty")}
                    </div>
                ) : null}
                {running ? (
                    <div className="tfs-muted" style={{ padding: "0 8px" }}>
                        {t("working")}
                    </div>
                ) : null}
                {rows.map((r) => (
                    <div
                        key={r.key}
                        className={`tfs-msg ${r.role}${r.running ? " running" : ""}${r.ok === false ? " err" : ""}`}
                    >
                        {r.title ? (
                            <div className="tfs-msg-title">{r.title}</div>
                        ) : null}
                        <div className="tfs-msg-text">{r.text}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
