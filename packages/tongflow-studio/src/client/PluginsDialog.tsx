import { useState } from "react";
import { studio } from "./api.ts";
import { Modal, useAsync, useT } from "./common.tsx";

interface EnvRow {
    key: string;
    plugins: string[];
    required: boolean;
    description?: string;
    url?: string;
    set: boolean;
    source?: string;
}

async function getEnv(): Promise<{ keys: EnvRow[] }> {
    const res = await fetch("/tongflow/env", { credentials: "same-origin" });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
}

async function putEnv(patch: Record<string, string | null>): Promise<void> {
    const res = await fetch("/tongflow/env", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
        credentials: "same-origin",
    });
    if (!res.ok) throw new Error(`${res.status}`);
}

export function PluginsDialog({ onClose }: { onClose: () => void }) {
    const t = useT();
    const plugins = useAsync(() => studio.plugins(), []);
    const env = useAsync(getEnv, []);
    const [installing, setInstalling] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | undefined>();
    const [edits, setEdits] = useState<Record<string, string>>({});
    const installed = plugins.data
        ? Object.keys(plugins.data.registry.plugins).sort()
        : [];
    const official =
        plugins.data?.official.filter(
            (id) => !plugins.data?.registry.plugins[id],
        ) ?? [];
    return (
        <Modal title={t("pluginsTitle")} onClose={onClose} wide>
            {err ? <div className="tfs-error">{err}</div> : null}
            <h3 style={{ margin: "8px 0 4px" }}>{t("installed")}</h3>
            {installed.length === 0 ? (
                <div className="tfs-muted">{t("noneInstall")}</div>
            ) : null}
            <table className="tfs-table">
                <tbody>
                    {installed.map((id) => {
                        const p = plugins.data!.registry.plugins[id];
                        return (
                            <tr key={id}>
                                <td>
                                    <b>{p.name ?? id}</b>
                                    <div className="tfs-muted">{id}</div>
                                </td>
                                <td className="tfs-muted">
                                    {Object.keys(p.methodsByNodeSlot).join(
                                        ", ",
                                    )}
                                </td>
                                <td>
                                    <button
                                        className="tfs-btn small danger"
                                        disabled={busy}
                                        onClick={async () => {
                                            if (
                                                !confirm(
                                                    t("removeConfirm", { id }),
                                                )
                                            )
                                                return;
                                            setBusy(true);
                                            try {
                                                await studio.uninstallPlugin(
                                                    id,
                                                );
                                                plugins.reload();
                                                env.reload();
                                            } finally {
                                                setBusy(false);
                                            }
                                        }}
                                    >
                                        {t("remove")}
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            <h3 style={{ margin: "12px 0 4px" }}>{t("install")}</h3>
            <div className="tfs-row">
                <select
                    className="tfs-select"
                    value={installing}
                    onChange={(e) => setInstalling(e.target.value)}
                >
                    <option value="">{t("officialPlugin")}</option>
                    {official.map((id) => (
                        <option key={id} value={id}>
                            {id}
                        </option>
                    ))}
                </select>
                <input
                    className="tfs-input"
                    style={{ flex: 1 }}
                    placeholder={t("orGitUrl")}
                    value={installing.startsWith("http") ? installing : ""}
                    onChange={(e) => setInstalling(e.target.value)}
                />
                <button
                    className="tfs-btn primary"
                    disabled={!installing || busy}
                    onClick={async () => {
                        setBusy(true);
                        setErr(undefined);
                        try {
                            await studio.installPlugin(installing);
                            setInstalling("");
                            plugins.reload();
                            env.reload();
                        } catch (e) {
                            setErr(e instanceof Error ? e.message : String(e));
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    {busy ? "…" : t("install")}
                </button>
            </div>
            <h3 style={{ margin: "12px 0 4px" }}>{t("apiKeys")}</h3>
            <div className="tfs-muted" style={{ marginBottom: 6 }}>
                {t("apiKeysHint")}
            </div>
            <table className="tfs-table">
                <tbody>
                    {(env.data?.keys ?? []).map((k) => (
                        <tr key={k.key}>
                            <td>
                                <b>{k.key}</b>
                                {k.required ? (
                                    <span className="tfs-error"> *</span>
                                ) : null}
                                <div className="tfs-muted">
                                    {k.description ?? ""}{" "}
                                    {k.plugins.length
                                        ? `(${k.plugins.join(", ")})`
                                        : ""}{" "}
                                    {k.url ? (
                                        <a
                                            href={k.url}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            {t("getKey")}
                                        </a>
                                    ) : null}
                                </div>
                            </td>
                            <td style={{ width: 90 }}>
                                {k.set ? (
                                    <span style={{ color: "var(--tfs-ok)" }}>
                                        {t("set")} ({k.source})
                                    </span>
                                ) : (
                                    <span className="tfs-muted">
                                        {t("notSet")}
                                    </span>
                                )}
                            </td>
                            <td style={{ width: 260 }}>
                                <input
                                    className="tfs-input"
                                    type="password"
                                    placeholder={
                                        k.set
                                            ? "•••••• (replace)"
                                            : "paste value"
                                    }
                                    value={edits[k.key] ?? ""}
                                    onChange={(e) =>
                                        setEdits({
                                            ...edits,
                                            [k.key]: e.target.value,
                                        })
                                    }
                                />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="tfs-row" style={{ marginTop: 8 }}>
                <input
                    className="tfs-input"
                    style={{ width: 200 }}
                    placeholder="CUSTOM_KEY"
                    value={edits.__newKey ?? ""}
                    onChange={(e) =>
                        setEdits({
                            ...edits,
                            __newKey: e.target.value.toUpperCase(),
                        })
                    }
                />
                <input
                    className="tfs-input"
                    style={{ flex: 1 }}
                    type="password"
                    placeholder="value"
                    value={edits.__newVal ?? ""}
                    onChange={(e) =>
                        setEdits({ ...edits, __newVal: e.target.value })
                    }
                />
                <button
                    className="tfs-btn primary"
                    disabled={busy}
                    onClick={async () => {
                        const patch: Record<string, string | null> = {};
                        for (const [k, v] of Object.entries(edits))
                            if (!k.startsWith("__") && v) patch[k] = v;
                        if (edits.__newKey && edits.__newVal)
                            patch[edits.__newKey] = edits.__newVal;
                        if (Object.keys(patch).length === 0) return;
                        setBusy(true);
                        try {
                            await putEnv(patch);
                            setEdits({});
                            env.reload();
                        } catch (e) {
                            setErr(e instanceof Error ? e.message : String(e));
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    {t("saveKeys")}
                </button>
            </div>
        </Modal>
    );
}
