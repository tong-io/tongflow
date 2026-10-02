import "./studio.css";
import {
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { ProjectSummary, TreeNode } from "../shared/types.ts";
import { studio } from "./api.ts";
import { Drawer, Modal, TContext, useAsync, useT } from "./common.tsx";
import { RecentRuns, RunPanel, useActiveRuns } from "./InspectorPane.tsx";
import { makeT } from "./i18n.ts";
import { PluginsDialog } from "./PluginsDialog.tsx";
import { PreviewPane } from "./PreviewPane.tsx";
import { TreePane } from "./TreePane.tsx";

/**
 * The Studio: project selector, folder tree, preview / editor / canvas and
 * the runs drawer. What a host adds is optional — a chat column, the session
 * whose agent the Studio follows, a way to open a project in a session.
 */
export interface StudioShellProps {
    locale: string;
    /** The host session: the Studio follows the project its agent works in. */
    sessionId?: string;
    /** Open on this project instead of the last one; a destination someone asked for is not followed away from. */
    project?: string;
    /** Open this file or workflow of `project` (a project key) once its tree has loaded. */
    file?: string;
    /** The session's working directory: inside a project folder, that project is selected. */
    cwd?: string;
    /** A chat column, drawn left of the tree. */
    chat?: ReactNode;
    /** Open a project folder in a session of the host; without it the button is not drawn. */
    openProject?: (root: string) => Promise<void>;
    /** Height in pixels when the host's layout cannot give the Studio a sized box; absent, it fills its container. */
    height?: number;
    onClose?: () => void;
}

const LS_KEY = "tongflow-studio:project";

type DrawerState =
    | { kind: "run"; workflowKey: string }
    | { kind: "runs" }
    | undefined;

export function StudioShell(props: StudioShellProps) {
    const t = useMemo(() => makeT(props.locale), [props.locale]);
    return (
        <TContext.Provider value={t}>
            <StudioBody {...props} />
        </TContext.Provider>
    );
}

function StudioBody(props: StudioShellProps) {
    const t = useT();
    const { openProject, locale, cwd, chat, onClose } = props;
    const projects = useAsync(() => studio.projects(), []);
    const health = useAsync(() => studio.health(), []);
    const pinned = props.project;
    const [pid, setPid] = useState<string | undefined>(
        () => pinned ?? localStorage.getItem(LS_KEY) ?? undefined,
    );
    const [selected, setSelected] = useState<TreeNode | undefined>();
    const [drawer, setDrawer] = useState<DrawerState>(undefined);
    const [refresh, setRefresh] = useState(0);
    const [dialog, setDialog] = useState<"new" | "plugins" | undefined>();
    const bump = useCallback(() => setRefresh((n) => n + 1), []);
    const fileInput = useRef<HTMLInputElement>(null);
    const [uploadMsg, setUploadMsg] = useState<string | undefined>();

    /** Folder uploads go to: the selected folder, or the folder of the selected file, else uploads/. */
    const uploadDir = (): string => {
        if (!selected) return "uploads";
        if (selected.kind === "folder") return selected.key;
        const i = selected.key.lastIndexOf("/");
        return i < 0 ? "uploads" : selected.key.slice(0, i);
    };
    const doUpload = async (files: FileList | File[], dir = uploadDir()) => {
        if (!pid || files.length === 0) return;
        setUploadMsg(t("uploading"));
        try {
            const done = await studio.upload(pid, dir, files);
            setUploadMsg(t("uploaded", { n: done.length, dir: dir || "/" }));
            bump();
            const first = done[0];
            if (first)
                setSelected({
                    id: first.key,
                    label: first.key.split("/").pop() ?? first.key,
                    kind: "file",
                    key: first.key,
                });
        } catch (e) {
            setUploadMsg(
                `${t("uploadFailed")}: ${e instanceof Error ? e.message : String(e)}`,
            );
        }
        setTimeout(() => setUploadMsg(undefined), 4000);
    };

    // Follow the session's workspace when it is a studio project.
    useEffect(() => {
        if (pinned || !cwd || !projects.data) return;
        const match = projects.data.find(
            (p) => cwd === p.root || cwd.startsWith(`${p.root}/`),
        );
        if (match && match.id !== pid) setPid(match.id);
    }, [pinned, cwd, projects.data]);
    useEffect(() => {
        if (pid) localStorage.setItem(LS_KEY, pid);
    }, [pid]);
    useEffect(() => {
        if (!pid && projects.data && projects.data.length > 0)
            setPid(projects.data[0].id);
    }, [projects.data, pid]);

    const project = useMemo(
        () => projects.data?.find((p) => p.id === pid),
        [projects.data, pid],
    );
    const tree = useAsync(
        () => (pid ? studio.tree(pid) : Promise.resolve([] as TreeNode[])),
        [pid, refresh],
    );
    useEffect(() => {
        const timer = setInterval(() => {
            if (document.visibilityState === "visible") tree.reload();
        }, 6000);
        return () => clearInterval(timer);
    }, [tree.reload]);
    const activeRuns = useActiveRuns(pid ?? "", refresh);

    // Follow the project the session's agent is working in (its tool calls set it).
    const sessionId = props.sessionId;
    useEffect(() => {
        if (pinned || !sessionId) return;
        let alive = true;
        const check = () =>
            studio
                .sessionProject(sessionId)
                .then((r) => {
                    if (!alive || !r.project) return;
                    setPid((cur) => {
                        if (cur === r.project) return cur;
                        setSelected(undefined);
                        setDrawer(undefined);
                        projects.reload();
                        return r.project ?? cur;
                    });
                })
                .catch(() => undefined);
        check();
        const timer = setInterval(() => {
            if (document.visibilityState === "visible") check();
        }, 3000);
        return () => {
            alive = false;
            clearInterval(timer);
        };
    }, [pinned, sessionId, projects.reload]);

    // Open the file the link asked for, once: after that the selection is the user's.
    const wanted = useRef(props.file);
    useEffect(() => {
        if (!wanted.current || !tree.data) return;
        const node = findNode(tree.data, wanted.current);
        wanted.current = undefined;
        if (node) setSelected(node);
    }, [tree.data]);

    const onSelect = (n: TreeNode) => {
        setSelected(n);
        if (drawer?.kind === "run" && n.key !== drawer.workflowKey)
            setDrawer(undefined);
    };

    return (
        <div
            className="tfs-root"
            style={props.height ? { height: props.height } : undefined}
        >
            <div className="tfs-header">
                <h1>{t("studio")}</h1>
                <select
                    className="tfs-select"
                    value={pid ?? ""}
                    onChange={(e) => {
                        setPid(e.target.value || undefined);
                        setSelected(undefined);
                        setDrawer(undefined);
                    }}
                >
                    {!projects.data?.length ? (
                        <option value="">{t("noProjects")}</option>
                    ) : null}
                    {(projects.data ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                            {p.title} · {p.id}
                        </option>
                    ))}
                </select>
                <button className="tfs-btn" onClick={() => setDialog("new")}>
                    {t("newProject")}
                </button>
                {project && openProject ? (
                    <button
                        className="tfs-btn"
                        title={project.root}
                        onClick={() => openProject(project.root)}
                    >
                        {t("openInSession")}
                    </button>
                ) : null}
                {pid ? (
                    <>
                        <button
                            className="tfs-btn"
                            title={t("uploadHint", { dir: uploadDir() })}
                            onClick={() => fileInput.current?.click()}
                        >
                            {t("upload")}
                        </button>
                        <input
                            ref={fileInput}
                            type="file"
                            multiple
                            style={{ display: "none" }}
                            onChange={(e) => {
                                if (e.target.files)
                                    void doUpload(e.target.files);
                                e.target.value = "";
                            }}
                        />
                    </>
                ) : null}
                {uploadMsg ? (
                    <span className="tfs-muted">{uploadMsg}</span>
                ) : null}
                <span className="tfs-spacer" />
                {health.data && !health.data.ok ? (
                    <span className="tfs-error" title={health.data.error}>
                        {t("engineNotReady")}
                    </span>
                ) : null}
                {pid ? (
                    <button
                        className={`tfs-btn${activeRuns ? " busy" : ""}`}
                        onClick={() =>
                            setDrawer((d) =>
                                d?.kind === "runs"
                                    ? undefined
                                    : { kind: "runs" },
                            )
                        }
                    >
                        {activeRuns
                            ? `● ${t("runs")} (${activeRuns})`
                            : t("runs")}
                    </button>
                ) : null}
                <button className="tfs-btn" onClick={bump} title={t("refresh")}>
                    ↻
                </button>
                <button
                    className="tfs-btn"
                    onClick={() => setDialog("plugins")}
                >
                    {t("pluginsKeys")}
                </button>
                {onClose ? (
                    <button
                        className="tfs-btn"
                        onClick={onClose}
                        title={t("close")}
                    >
                        ✕
                    </button>
                ) : null}
            </div>
            <div className={`tfs-body${chat ? " with-chat" : ""}`}>
                {chat ? <div className="tfs-pane">{chat}</div> : null}
                <div className="tfs-pane">
                    {tree.error ? (
                        <div className="tfs-error" style={{ padding: 10 }}>
                            {tree.error}
                        </div>
                    ) : null}
                    {pid && tree.data ? (
                        <TreePane
                            tree={tree.data}
                            selectedId={selected?.id}
                            onSelect={onSelect}
                        />
                    ) : (
                        <div className="tfs-empty">{t("createToStart")}</div>
                    )}
                </div>
                <div className="tfs-pane tfs-main">
                    {pid ? (
                        <PreviewPane
                            pid={pid}
                            node={selected}
                            locale={locale}
                            refreshToken={refresh}
                            onChanged={bump}
                            onCanvasSave={(s) => {
                                if (s === "saved") tree.reload();
                            }}
                            onRun={(key) =>
                                setDrawer({ kind: "run", workflowKey: key })
                            }
                            onOpen={(n) => {
                                setSelected(n);
                                setDrawer(undefined);
                            }}
                            onDropFiles={(files, dir) => doUpload(files, dir)}
                        />
                    ) : (
                        <div className="tfs-empty">
                            <p>{t("noProjectYet")}</p>
                            <button
                                className="tfs-btn primary"
                                onClick={() => setDialog("new")}
                            >
                                {t("createProject")}
                            </button>
                        </div>
                    )}
                    {pid && drawer ? (
                        <Drawer
                            title={
                                drawer.kind === "run"
                                    ? t("run").replace("▶ ", "")
                                    : t("runs")
                            }
                            onClose={() => setDrawer(undefined)}
                        >
                            {drawer.kind === "run" ? (
                                <RunPanel
                                    pid={pid}
                                    workflowKey={drawer.workflowKey}
                                    refreshToken={refresh}
                                    onChanged={bump}
                                />
                            ) : (
                                <RecentRuns
                                    pid={pid}
                                    refreshToken={refresh}
                                    onChanged={bump}
                                />
                            )}
                        </Drawer>
                    ) : null}
                </div>
            </div>
            {dialog === "new" ? (
                <NewProjectDialog
                    locale={locale}
                    onClose={() => setDialog(undefined)}
                    onCreated={async (p) => {
                        setDialog(undefined);
                        projects.reload();
                        setPid(p.id);
                        setSelected(undefined);
                        await openProject?.(p.root).catch(() => undefined);
                    }}
                />
            ) : null}
            {dialog === "plugins" ? (
                <PluginsDialog onClose={() => setDialog(undefined)} />
            ) : null}
        </div>
    );
}

function findNode(nodes: TreeNode[], key: string): TreeNode | undefined {
    for (const node of nodes) {
        if (node.key === key && node.kind !== "folder") return node;
        const inside = node.children && findNode(node.children, key);
        if (inside) return inside;
    }
    return undefined;
}

function NewProjectDialog({
    locale,
    onClose,
    onCreated,
}: {
    locale: string;
    onClose: () => void;
    onCreated: (p: ProjectSummary) => void;
}) {
    const t = useT();
    const [title, setTitle] = useState("");
    const [brief, setBrief] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | undefined>();
    return (
        <Modal title={t("newProjectTitle")} onClose={onClose}>
            <div className="tfs-form">
                <div>
                    <div className="tfs-label">{t("title")}</div>
                    <input
                        className="tfs-input"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={t("titlePlaceholder")}
                    />
                </div>
                <div>
                    <div className="tfs-label">{t("brief")}</div>
                    <textarea
                        className="tfs-textarea"
                        style={{ minHeight: 90 }}
                        value={brief}
                        onChange={(e) => setBrief(e.target.value)}
                        placeholder={t("briefPlaceholder")}
                    />
                    <div className="tfs-muted" style={{ marginTop: 4 }}>
                        {t("briefHint")}
                    </div>
                </div>
                {err ? <div className="tfs-error">{err}</div> : null}
                <div className="tfs-row">
                    <button
                        className="tfs-btn primary"
                        disabled={!title.trim() || busy}
                        onClick={async () => {
                            setBusy(true);
                            setErr(undefined);
                            try {
                                const p = await studio.createProject({
                                    title: title.trim(),
                                    locale,
                                    ...(brief.trim()
                                        ? { brief: brief.trim() }
                                        : {}),
                                });
                                onCreated(p);
                            } catch (e) {
                                setErr(
                                    e instanceof Error ? e.message : String(e),
                                );
                            } finally {
                                setBusy(false);
                            }
                        }}
                    >
                        {t("create")}
                    </button>
                    <button className="tfs-btn" onClick={onClose}>
                        {t("cancel")}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
