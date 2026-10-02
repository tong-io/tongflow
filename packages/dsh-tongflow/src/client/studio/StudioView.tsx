import "./studio.css";
import type {} from "@deepseek-ai/dsh-client-ui-chat/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import type {} from "@deepseek-ai/dsh-client-ui-session/client";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectSummary, TreeNode } from "tongflow-studio/shared";
import { studio } from "../api.ts";
import { makeT } from "../i18n.ts";
import { ChatPane } from "./ChatPane.tsx";
import { Drawer, Modal, TContext, useAsync, useT } from "./common.tsx";
import { RecentRuns, RunPanel, useActiveRuns } from "./InspectorPane.tsx";
import { PluginsDialog } from "./PluginsDialog.tsx";
import { PreviewPane } from "./PreviewPane.tsx";
import { TreePane } from "./TreePane.tsx";

/** Host-provided actions injected at registration time. */
export interface StudioInjected {
    /** Register the project folder as a dsh workspace and open a session in it. */
    openWorkspace: (path: string) => Promise<void>;
    locale: string;
}

/** The Studio as the session's conversation view (session kit present → chat column shown). */
export type StudioViewProps = Pick<
    PropsRuntime<"conversation.view">,
    "useSessions"
> &
    Partial<
        Pick<
            PropsRuntime<"conversation.view">,
            "useSession" | "useChat" | "inputActions" | "useInput" | "sessionId"
        >
    > &
    StudioInjected & { onClose?: () => void };

const LS_KEY = "dsh-tongflow:project";

type DrawerState =
    | { kind: "run"; workflowKey: string }
    | { kind: "runs" }
    | undefined;

export function StudioView(props: StudioViewProps) {
    const t = useMemo(() => makeT(props.locale), [props.locale]);
    return (
        <TContext.Provider value={t}>
            <StudioBody {...props} />
        </TContext.Provider>
    );
}

/**
 * dsh's view area grows with content (flex: 1 0 auto inside a scrolling
 * body); the studio wants a fixed frame with internally scrolling panes, so
 * it sizes itself to the nearest scrolling ancestor's viewport.
 */
function useFillScrollport(
    ref: React.RefObject<HTMLDivElement | null>,
): number | undefined {
    const [height, setHeight] = useState<number | undefined>();
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        let scroller: HTMLElement | null = el.parentElement;
        while (
            scroller &&
            !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)
        )
            scroller = scroller.parentElement;
        if (!scroller) return;
        const target = scroller;
        // dsh floats its composer over the bottom of the scroll body; stop above it.
        const composer = () =>
            target.parentElement?.querySelector<HTMLElement>(
                '[class*="composerStack"]',
            ) ?? undefined;
        const apply = () => {
            const bar = composer();
            const top = target.getBoundingClientRect().top;
            const bottom = bar
                ? bar.getBoundingClientRect().top
                : target.getBoundingClientRect().bottom;
            const h = Math.max(240, Math.floor(bottom - top));
            setHeight(h);
        };
        apply();
        const ro = new ResizeObserver(apply);
        ro.observe(target);
        const bar = composer();
        if (bar) ro.observe(bar);
        window.addEventListener("resize", apply);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", apply);
        };
    }, [ref]);
    return height;
}

function StudioBody(props: StudioViewProps) {
    const t = useT();
    const { openWorkspace, locale, useSessions, onClose } = props;
    const hasChat = Boolean(
        props.useSession &&
            props.useChat &&
            props.inputActions &&
            props.useInput &&
            props.sessionId,
    );
    const cwd = useSessions((s) =>
        props.sessionId ? s.byId[props.sessionId]?.cwd : undefined,
    );
    const rootRef = useRef<HTMLDivElement>(null);
    const fillHeight = useFillScrollport(rootRef);
    const projects = useAsync(() => studio.projects(), []);
    const health = useAsync(() => studio.health(), []);
    const [pid, setPid] = useState<string | undefined>(
        () => localStorage.getItem(LS_KEY) ?? undefined,
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

    // Sync dark mode for the embedded canvas (dsh marks dark on body[data-ds-dark-theme]).
    useEffect(() => {
        const apply = () =>
            document.documentElement.classList.toggle(
                "dark",
                document.body.hasAttribute("data-ds-dark-theme"),
            );
        apply();
        const obs = new MutationObserver(apply);
        obs.observe(document.body, {
            attributes: true,
            attributeFilter: ["data-ds-dark-theme"],
        });
        return () => obs.disconnect();
    }, []);

    // Follow the session's workspace when it is a studio project.
    useEffect(() => {
        if (!cwd || !projects.data) return;
        const match = projects.data.find(
            (p) => cwd === p.root || cwd.startsWith(`${p.root}/`),
        );
        if (match && match.id !== pid) setPid(match.id);
    }, [cwd, projects.data]);
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
        if (!sessionId) return;
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
    }, [sessionId, projects.reload]);

    const onSelect = (n: TreeNode) => {
        setSelected(n);
        if (drawer?.kind === "run" && n.key !== drawer.workflowKey)
            setDrawer(undefined);
    };

    return (
        <div
            className="tfs-root"
            ref={rootRef}
            style={fillHeight ? { height: fillHeight } : undefined}
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
                {project ? (
                    <button
                        className="tfs-btn"
                        title={project.root}
                        onClick={() => openWorkspace(project.root)}
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
            <div className={`tfs-body${hasChat ? " with-chat" : ""}`}>
                {hasChat ? (
                    <div className="tfs-pane">
                        <ChatPane
                            useSession={props.useSession!}
                            useChat={props.useChat!}
                            inputActions={props.inputActions!}
                            useInput={props.useInput!}
                            sessionId={props.sessionId!}
                        />
                    </div>
                ) : null}
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
                        await openWorkspace(p.root).catch(() => undefined);
                    }}
                />
            ) : null}
            {dialog === "plugins" ? (
                <PluginsDialog onClose={() => setDialog(undefined)} />
            ) : null}
        </div>
    );
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
