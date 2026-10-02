import { useEffect, useMemo, useRef, useState } from "react";
import type {
    PluginConfirmation,
    RunEvent,
    RunSummary,
} from "tongflow-studio/shared";
import { studio, subscribeRun } from "../api.ts";
import { useAsync, useT } from "./common.tsx";

/* ---------------- run panel ---------------- */

export function RunPanel({
    pid,
    workflowKey,
    refreshToken,
    onChanged,
}: {
    pid: string;
    workflowKey: string;
    refreshToken: number;
    onChanged: () => void;
}) {
    const t = useT();
    const { data: summary, error } = useAsync(
        () => studio.workflowSummary(pid, workflowKey),
        [pid, workflowKey, refreshToken],
    );
    // Billing checkpoint: paid plugins this run would use — confirmed by the user every time.
    const confirmations = useAsync(
        () => studio.workflowConfirmations(pid, workflowKey),
        [pid, workflowKey, refreshToken],
    );
    const pending = confirmations.data ?? [];
    const [bindings, setBindings] = useState<Record<string, string>>({});
    const [note, setNote] = useState("");
    const [run, setRun] = useState<RunSummary | undefined>();
    const [log, setLog] = useState<string[]>([]);
    const unsub = useRef<(() => void) | undefined>(undefined);
    useEffect(() => {
        if (!summary) return;
        const next: Record<string, string> = {};
        for (const i of summary.inputs) next[i.name] = "";
        setBindings(next);
    }, [summary]);
    useEffect(() => () => unsub.current?.(), []);
    const start = async () => {
        if (!summary) return;
        setLog([]);

        const inputs: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(bindings))
            if (v.trim())
                inputs[k] = v.includes(", ")
                    ? v.split(", ").map((s) => s.trim())
                    : v.trim();
        try {
            const s = await studio.startRun(pid, {
                workflowKey: summary.key,
                inputs,
                ...(note ? { note } : {}),
            });
            setRun(s);
            unsub.current?.();
            unsub.current = subscribeRun(
                s.runId,
                ({ event, summary: sum }) => {
                    setRun({ ...sum });
                    const line = describeEvent(event);
                    if (line) setLog((l) => [...l.slice(-200), line]);
                    if (event.type === "ingested" || event.type === "error")
                        onChanged();
                },
                () => onChanged(),
            );
        } catch (e) {
            setLog([`✗ ${e instanceof Error ? e.message : String(e)}`]);
        }
    };
    if (error) return <div className="tfs-card tfs-error">{error}</div>;
    if (!summary) return <div className="tfs-card tfs-muted">…</div>;
    return (
        <div className="tfs-card">
            <h3>{t("runTitle", { name: summary.name })}</h3>
            {summary.inputs.length === 0 ? (
                <div className="tfs-muted">{t("noInputs")}</div>
            ) : null}
            <div className="tfs-form">
                {summary.inputs.map((i) => (
                    <div key={i.name}>
                        <div className="tfs-label">
                            {i.name}{" "}
                            <span className="tfs-muted">
                                ({i.type}
                                {i.required ? `, ${t("required")}` : ""})
                            </span>
                        </div>
                        <input
                            className="tfs-input"
                            placeholder={t("inputPlaceholder")}
                            value={bindings[i.name] ?? ""}
                            onChange={(e) =>
                                setBindings({
                                    ...bindings,
                                    [i.name]: e.target.value,
                                })
                            }
                        />
                    </div>
                ))}
                <div>
                    <div className="tfs-label">{t("note")}</div>
                    <input
                        className="tfs-input"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder={t("notePlaceholder")}
                    />
                </div>
                {pending.length > 0 ? (
                    <div className="tfs-billing">
                        <div className="tfs-label">{t("billingTitle")}</div>
                        {pending.map((p) => (
                            <BillingRow key={p.pluginId} p={p} />
                        ))}
                    </div>
                ) : null}
                <div className="tfs-row">
                    <button
                        className="tfs-btn primary"
                        onClick={start}
                        disabled={
                            run?.status === "running" ||
                            run?.status === "queued"
                        }
                    >
                        {pending.length > 0 ? t("confirmAndRun") : t("run")}
                    </button>
                    {run &&
                    (run.status === "running" || run.status === "queued") ? (
                        <button
                            className="tfs-btn"
                            onClick={() => studio.cancelRun(run.runId)}
                        >
                            {t("cancel")}
                        </button>
                    ) : null}
                    {run ? (
                        <span className={`tfs-status ${run.status}`}>
                            {run.status}
                        </span>
                    ) : null}
                </div>
            </div>
            {run ? <RunNodes run={run} /> : null}
            {log.length > 0 ? (
                <div className="tfs-log" style={{ marginTop: 8 }}>
                    {log.join("\n")}
                </div>
            ) : null}
            {run?.files.length ? (
                <div style={{ marginTop: 6 }}>
                    {t("outputs")}:{" "}
                    {run.files.map((f) => f.fileName).join(", ")}
                </div>
            ) : null}
        </div>
    );
}

function BillingRow({ p }: { p: PluginConfirmation }) {
    const t = useT();
    const missing = p.env.filter((e) => e.required && !e.set);
    return (
        <div className="tfs-billing-row">
            <div>
                <strong>{p.name ?? p.pluginId}</strong>{" "}
                <span className="tfs-muted">
                    · {p.slots.join(", ")} ·{" "}
                    {t(
                        p.billing === "modal"
                            ? "billingModal"
                            : p.billing === "api"
                              ? "billingApi"
                              : "billingLocal",
                    )}
                </span>
            </div>
            {p.models.length > 0 ? (
                <div className="tfs-muted">
                    {t("model")}: {p.models.join(", ")}
                </div>
            ) : null}
            {missing.length > 0 ? (
                <div className="tfs-error">
                    {t("missingKeys", {
                        keys: missing.map((e) => e.key).join(", "),
                    })}
                </div>
            ) : null}
        </div>
    );
}

function RunNodes({ run }: { run: RunSummary }) {
    const entries = Object.entries(run.nodes);
    if (entries.length === 0) return null;
    return (
        <div style={{ marginTop: 6 }}>
            {entries.map(([id, n]) => (
                <div key={id} className="tfs-row">
                    <span className={`tfs-status ${n.status}`}>{n.status}</span>
                    <span>{n.label ?? id.slice(0, 8)}</span>
                    {n.percent !== undefined ? (
                        <span className="tfs-muted">
                            {Math.round(n.percent)}%
                        </span>
                    ) : null}
                    {n.message ? (
                        <span className="tfs-muted">{n.message}</span>
                    ) : null}
                </div>
            ))}
        </div>
    );
}

export function describeEvent(e: RunEvent): string {
    switch (e.type) {
        case "log":
            return e.message ? `· ${e.message}` : "";
        case "workflow_started":
            return `▶ started (${e.totalNodes ?? "?"} nodes)`;
        case "node_started":
            return `▶ ${e.label ?? e.nodeId ?? ""}`;
        case "plugin_progress":
            return `… ${e.message ?? ""}${e.percent !== undefined ? ` ${Math.round(e.percent)}%` : ""}`;
        case "node_completed":
            return `✓ ${e.label ?? e.nodeId ?? ""}`;
        case "node_failed":
            return `✗ ${e.label ?? e.nodeId ?? ""}: ${e.error ?? ""}`;
        case "workflow_completed":
            return "✓ workflow completed";
        case "workflow_failed":
            return `✗ workflow failed: ${e.error ?? ""}`;
        case "ingested":
            return e.files?.length
                ? `★ ${e.files.map((f) => f.fileName).join(", ")}`
                : "";
        case "error":
            return `✗ ${e.error ?? ""}`;
        default:
            return "";
    }
}

/* ---------------- recent runs ---------------- */

export function RecentRuns({
    pid,
    refreshToken,
    onChanged,
}: {
    pid: string;
    refreshToken: number;
    onChanged: () => void;
}) {
    const t = useT();
    const { data, reload } = useAsync(
        // No project selected yet: the header mounts before the project list
        // resolves, and `/p//runs` would 404.
        () => (pid === "" ? Promise.resolve([]) : studio.runs(pid)),
        [pid, refreshToken],
    );
    const live = useMemo(
        () =>
            (data ?? []).some(
                (r) => r.status === "running" || r.status === "queued",
            ),
        [data],
    );
    useEffect(() => {
        if (!live) return;
        const timer = setInterval(reload, 2500);
        return () => clearInterval(timer);
    }, [live, reload]);
    if (!data || data.length === 0) return <div className="tfs-muted">—</div>;
    return (
        <div className="tfs-card">
            <h3>{t("recentRuns")}</h3>
            {data.slice(0, 12).map((r) => (
                <div
                    key={r.runId}
                    className="tfs-row"
                    style={{
                        justifyContent: "space-between",
                        padding: "3px 0",
                    }}
                >
                    <span
                        style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: 190,
                        }}
                        title={r.workflow}
                    >
                        {r.workflow}
                    </span>
                    <span className="tfs-row">
                        <span className={`tfs-status ${r.status}`}>
                            {r.status}
                        </span>
                        {r.status === "running" || r.status === "queued" ? (
                            <button
                                className="tfs-btn small"
                                onClick={() =>
                                    studio.cancelRun(r.runId).then(onChanged)
                                }
                            >
                                ✕
                            </button>
                        ) : null}
                    </span>
                </div>
            ))}
        </div>
    );
}

/** Live count of active runs for the header button. */
export function useActiveRuns(pid: string, refreshToken: number): number {
    const { data, reload } = useAsync(
        // No project selected yet: the header mounts before the project list
        // resolves, and `/p//runs` would 404.
        () => (pid === "" ? Promise.resolve([]) : studio.runs(pid)),
        [pid, refreshToken],
    );
    const n = (data ?? []).filter(
        (r) => r.status === "running" || r.status === "queued",
    ).length;
    useEffect(() => {
        if (n === 0) return;
        const timer = setInterval(reload, 3000);
        return () => clearInterval(timer);
    }, [n, reload]);
    return n;
}
