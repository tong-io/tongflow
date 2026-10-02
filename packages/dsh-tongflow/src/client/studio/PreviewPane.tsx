import { useEffect, useRef, useState } from "react";
import type { OutputInfo, TreeNode } from "tongflow-studio/shared";
import { modalityOfExt } from "tongflow-studio/shared";
import { fileUrl, studio } from "../api.ts";
import { CanvasPane } from "./CanvasPane.tsx";
import { fmtBytes, fmtTime, Modal, Thumb, useAsync, useT } from "./common.tsx";

export interface PreviewProps {
    pid: string;
    node: TreeNode | undefined;
    locale: string;
    refreshToken: number;
    onChanged: () => void;
    onCanvasSave: (
        state: "saving" | "saved" | "error",
        detail?: string,
    ) => void;
    /** Open the run drawer for the current workflow. */
    onRun: (workflowKey: string) => void;
    /** Select a file / workflow in the tree. */
    onOpen: (node: TreeNode) => void;
    /** Files dropped on (or picked for) a folder view. */
    onDropFiles: (files: File[], dir: string) => void;
}

export function PreviewPane(p: PreviewProps) {
    const t = useT();
    const { node } = p;
    if (!node) return <div className="tfs-empty">{t("selectHint")}</div>;
    switch (node.kind) {
        case "workflow":
            return (
                <WorkflowView key={node.key} {...p} workflowKey={node.key} />
            );
        case "file":
        case "output":
            return <FileView key={node.key} {...p} fileKey={node.key} />;
        case "folder":
            return <FolderView key={node.key} {...p} folder={node} />;
        default:
            return <div className="tfs-empty">{node.label}</div>;
    }
}

/* ---------------- folder ---------------- */

/** A folder: its media as thumbnails, other files as a list — click to open. */
function FolderView({
    pid,
    folder,
    onOpen,
    onDropFiles,
}: PreviewProps & { folder: TreeNode }) {
    const t = useT();
    const [over, setOver] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const flat: TreeNode[] = [];
    const walk = (nodes: TreeNode[]) => {
        for (const n of nodes) {
            if (n.kind === "folder") continue;
            flat.push(n);
            if (n.children) walk(n.children);
        }
    };
    walk(folder.children ?? []);
    const media = flat.filter((n) => {
        const m = n.meta?.modality;
        return m === "image" || m === "video";
    });
    const others = flat.filter((n) => !media.includes(n));
    const subfolders = (folder.children ?? []).filter(
        (n) => n.kind === "folder",
    );
    return (
        <div
            className={`tfs-preview${over ? " tfs-dropping" : ""}`}
            onDragOver={(e) => {
                if (e.dataTransfer.types.includes("Files")) {
                    e.preventDefault();
                    setOver(true);
                }
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                const files = Array.from(e.dataTransfer.files);
                if (files.length > 0) onDropFiles(files, folder.key);
            }}
        >
            <div className="tfs-preview-head">
                <h2>{folder.key || "/"}</h2>
                <span className="tfs-muted">
                    {t("folderCount", {
                        folders: subfolders.length,
                        files: flat.length,
                    })}
                </span>
                <span className="tfs-spacer" />
                <button
                    className="tfs-btn small"
                    onClick={() => input.current?.click()}
                >
                    {t("upload")}
                </button>
                <input
                    ref={input}
                    type="file"
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => {
                        if (e.target.files?.length)
                            onDropFiles(Array.from(e.target.files), folder.key);
                        e.target.value = "";
                    }}
                />
            </div>
            <div className="tfs-preview-body">
                {over ? (
                    <div className="tfs-drop-hint">{t("dropHere")}</div>
                ) : null}
                {media.length > 0 ? (
                    <div className="tfs-tiles">
                        {media.map((n) => (
                            <div
                                key={n.key}
                                className="tfs-take"
                                onClick={() => onOpen(n)}
                                title={n.key}
                            >
                                <div className="tfs-tile-thumb">
                                    <Thumb
                                        pid={pid}
                                        fileKey={n.key}
                                        modality={n.meta?.modality ?? "file"}
                                    />
                                </div>
                                <div className="tfs-tile-foot">
                                    <span>{n.label}</span>
                                    <span className="tfs-muted">
                                        {fmtBytes(n.meta?.size ?? 0)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : null}
                {subfolders.length > 0 || others.length > 0 ? (
                    <div className="tfs-list">
                        {subfolders.map((n) => (
                            <div
                                key={n.key}
                                className="tfs-list-row"
                                onClick={() => onOpen(n)}
                            >
                                <span>📁 {n.label}/</span>
                                <span className="tfs-muted">
                                    {n.children?.length ?? 0}
                                </span>
                            </div>
                        ))}
                        {others.map((n) => (
                            <div
                                key={n.key}
                                className="tfs-list-row"
                                onClick={() => onOpen(n)}
                            >
                                <span>
                                    {n.kind === "workflow" ? "🧩 " : ""}
                                    {n.kind === "workflow"
                                        ? `${n.label}.tongflow.json`
                                        : n.label}
                                </span>
                                <span className="tfs-muted">
                                    {fmtBytes(n.meta?.size ?? 0)}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : null}
                {flat.length === 0 && subfolders.length === 0 ? (
                    <div className="tfs-muted">{t("emptyFolder")}</div>
                ) : null}
            </div>
        </div>
    );
}

/* ---------------- workflow ---------------- */

/** Files a workflow generated, newest first, with the run note. */
function OutputsStrip({
    pid,
    workflowKey,
    refreshToken,
    onOpen,
}: {
    pid: string;
    workflowKey: string;
    refreshToken: number;
    onOpen: (node: TreeNode) => void;
}) {
    const t = useT();
    const { data } = useAsync(
        () => studio.workflowOutputs(pid, workflowKey),
        [pid, workflowKey, refreshToken],
    );
    if (!data || data.length === 0) return null;
    const newestFirst = [...data].reverse();
    const toNode = (o: OutputInfo): TreeNode => ({
        id: o.key,
        label: o.fileName,
        kind: "output",
        key: o.key,
        meta: {
            size: o.size,
            mtime: o.mtime,
            modality: modalityOfExt(o.ext),
            no: o.no,
        },
    });
    return (
        <div className="tfs-outputs">
            <div className="tfs-label">
                {t("outputs")} ({data.length})
            </div>
            <div className="tfs-tiles">
                {newestFirst.map((o) => (
                    <div
                        key={o.key}
                        className="tfs-take"
                        onClick={() => onOpen(toNode(o))}
                        title={`${o.fileName}\n${fmtTime(o.mtime)}${o.record?.note ? `\n${o.record.note}` : ""}`}
                    >
                        <div className="tfs-tile-thumb">
                            <Thumb
                                pid={pid}
                                fileKey={o.key}
                                modality={modalityOfExt(o.ext)}
                            />
                        </div>
                        <div className="tfs-tile-foot">
                            <span>
                                #{o.no}
                                {o.output ? ` ${o.output}` : ""}
                            </span>
                            <span className="tfs-muted">
                                {fmtBytes(o.size)}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function WorkflowView({
    pid,
    workflowKey,
    locale,
    refreshToken,
    onCanvasSave,
    onRun,
    onOpen,
}: PreviewProps & { workflowKey: string }) {
    const t = useT();
    const [state, setState] = useState<string>("");
    return (
        <div className="tfs-preview">
            <div className="tfs-preview-head">
                <h2>{workflowKey}</h2>
                <span className="tfs-muted">{state}</span>
                <span className="tfs-spacer" />
                <button
                    className="tfs-btn primary small"
                    onClick={() => onRun(workflowKey)}
                >
                    {t("run")}
                </button>
                <a
                    className="tfs-btn small"
                    href={fileUrl(pid, workflowKey)}
                    target="_blank"
                    rel="noreferrer"
                >
                    {t("json")}
                </a>
            </div>
            <CanvasPane
                pid={pid}
                workflowKey={workflowKey}
                locale={locale}
                reloadToken={refreshToken}
                onSaved={(s, detail) => {
                    setState(
                        s === "saving"
                            ? t("saving")
                            : s === "saved"
                              ? t("saved")
                              : `${t("saveFailed")}: ${detail ?? ""}`,
                    );
                    onCanvasSave(s, detail);
                }}
            />
            <OutputsStrip
                pid={pid}
                workflowKey={workflowKey}
                refreshToken={refreshToken}
                onOpen={onOpen}
            />
        </div>
    );
}

/* ---------------- file ---------------- */

function FileView({
    pid,
    fileKey,
    node,
    refreshToken,
    onChanged,
}: PreviewProps & { fileKey: string }) {
    const t = useT();
    const modality = modalityOfExt(fileKey.split(".").pop() ?? "");
    const url = fileUrl(pid, fileKey);
    const [text, setText] = useState<string | undefined>();
    const [dirty, setDirty] = useState(false);
    const [err, setErr] = useState<string | undefined>();
    useEffect(() => {
        if (modality !== "text") return;
        setText(undefined);
        studio
            .readText(pid, fileKey)
            .then(setText, (e: unknown) =>
                setErr(e instanceof Error ? e.message : String(e)),
            );
    }, [pid, fileKey, modality, refreshToken]);
    const [big, setBig] = useState(false);
    return (
        <div className="tfs-preview">
            <div className="tfs-preview-head">
                <h2>{node?.label ?? fileKey}</h2>
                <span className="tfs-spacer" />
                {modality === "text" && dirty ? (
                    <button
                        className="tfs-btn small primary"
                        onClick={async () => {
                            await studio.writeText(pid, fileKey, text ?? "");
                            setDirty(false);
                            onChanged();
                        }}
                    >
                        {t("save")}
                    </button>
                ) : null}
                <a
                    className="tfs-btn small"
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                >
                    {t("open")}
                </a>
            </div>
            <div className="tfs-preview-body">
                {err ? <div className="tfs-error">{err}</div> : null}
                {modality === "image" ? (
                    <div className="tfs-media" onClick={() => setBig(true)}>
                        <img src={url} alt={fileKey} />
                    </div>
                ) : modality === "video" ? (
                    <div className="tfs-media">
                        <video src={url} controls playsInline />
                    </div>
                ) : modality === "audio" ? (
                    <div className="tfs-media">
                        <audio src={url} controls />
                    </div>
                ) : modality === "text" ? (
                    text === undefined ? (
                        <div className="tfs-muted">…</div>
                    ) : (
                        <textarea
                            className="tfs-textarea"
                            style={{ minHeight: "70vh" }}
                            value={text}
                            onChange={(e) => {
                                setText(e.target.value);
                                setDirty(true);
                            }}
                        />
                    )
                ) : (
                    <div className="tfs-muted">
                        {t("modality", { modality })}
                    </div>
                )}
            </div>
            {big ? (
                <Modal title={fileKey} onClose={() => setBig(false)} wide>
                    <img src={url} alt={fileKey} style={{ maxWidth: "100%" }} />
                </Modal>
            ) : null}
        </div>
    );
}
