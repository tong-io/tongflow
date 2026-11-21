/**
 * Embeds `tongflow/canvas` for one workflow file. The canvas talks to our
 * canvas-compat routes (`/tongflow/p/<pid>/api/...`) through its host config,
 * shows assets via `/tongflow/p/<pid>/files/<key>` (the host hands it a copy
 * whose `./x` refs are rewritten to project keys), and the document is
 * synced file ↔ canvas: load on open, debounced
 * save on change (the host re-exports the executable on save).
 *
 * With a browser edge plugin installed, the canvas also runs workflows in the
 * browser ("Run workflow", and "Run" on an edge node): see `edge-runtime.ts`.
 */
import "@xyflow/react/dist/style.css";
import "tongflow/canvas.css";
import { ReactFlowProvider } from "@xyflow/react";
import {
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    CanvasProvider,
    FlowCanvas,
    type FlowCanvasHandle,
    httpTaskTransport,
    useFlow,
} from "tongflow/canvas";
import { canvasMessages, isCanvasLocale } from "tongflow/canvas/messages";
import { IntlProvider } from "use-intl";
import { fileUrl, PREFIX, studio, type WorkflowDoc } from "./api.ts";
import { Modal, useT } from "./common.tsx";
import {
    loadStudioEdgeRuntime,
    type StudioEdgeRuntime,
} from "./edge-runtime.ts";

export interface CanvasPaneProps {
    pid: string;
    workflowKey: string;
    locale: string;
    /** Bumped when the file changed outside the canvas (agent patch, run) to reload. */
    reloadToken: number;
    onSaved?: (state: "saving" | "saved" | "error", detail?: string) => void;
}

const SAVE_DEBOUNCE_MS = 1000;

export function CanvasPane({
    pid,
    workflowKey,
    locale,
    reloadToken,
    onSaved,
}: CanvasPaneProps) {
    const handle = useRef<FlowCanvasHandle>(null);
    const [doc, setDoc] = useState<WorkflowDoc | undefined>();
    const [error, setError] = useState<string | undefined>();
    const loadedKey = useRef<string | undefined>(undefined);
    const suppressSave = useRef(false);
    const lang = isCanvasLocale(locale) ? locale : "en";
    const messages = useMemo(() => canvasMessages[lang], [lang]);
    const resolveAssetUrl = useCallback(
        (fileKey: string) => fileUrl(pid, fileKey),
        [pid],
    );
    const edge = useEdgeRuntime(pid);

    // Load the file into the (singleton) canvas store.
    useEffect(() => {
        let alive = true;
        setError(undefined);
        studio
            .workflow(pid, workflowKey)
            .then((d) => {
                if (!alive) return;
                suppressSave.current = true;
                const st = useFlow.getState();
                st.setNodes(d.flow.nodes as never);
                st.setEdges(d.flow.edges as never);
                st.setWorkflowName(d.name);
                if (d.description !== undefined)
                    useFlow.setState({
                        workflowDescription: d.description,
                    } as never);
                loadedKey.current = workflowKey;
                setDoc(d);
                setTimeout(() => {
                    suppressSave.current = false;
                    handle.current?.fitView();
                }, 50);
            })
            .catch(
                (e: unknown) =>
                    alive &&
                    setError(e instanceof Error ? e.message : String(e)),
            );
        return () => {
            alive = false;
        };
    }, [pid, workflowKey, reloadToken]);

    // Save on user edits: mark dirty on any change; a 1 s ticker flushes the
    // latest snapshot (never more than one PUT in flight, always eventually
    // saved even while the canvas keeps re-measuring nodes).
    const dirty = useRef(false);
    const saving = useRef(false);
    const onSavedRef = useRef(onSaved);
    onSavedRef.current = onSaved;
    useEffect(() => {
        const unsub = useFlow.subscribe((state, prev) => {
            if (suppressSave.current || loadedKey.current !== workflowKey)
                return;
            if (
                state.nodes === prev.nodes &&
                state.edges === prev.edges &&
                state.workflowName === prev.workflowName
            )
                return;
            if (!dirty.current) onSavedRef.current?.("saving");
            dirty.current = true;
        });
        const flush = () => {
            if (
                !dirty.current ||
                saving.current ||
                loadedKey.current !== workflowKey
            )
                return;
            dirty.current = false;
            saving.current = true;
            const s = useFlow.getState();
            const next: WorkflowDoc = {
                name: s.workflowName || doc?.name || workflowKey,
                ...(s.workflowDescription
                    ? { description: s.workflowDescription }
                    : {}),
                flow: {
                    nodes: s.nodes as unknown[],
                    edges: s.edges as unknown[],
                },
                meta: doc?.meta ?? {},
            };
            studio
                .saveWorkflow(pid, workflowKey, next)
                .then(() => {
                    if (!dirty.current) onSavedRef.current?.("saved");
                })
                .catch((e: unknown) =>
                    onSavedRef.current?.(
                        "error",
                        e instanceof Error ? e.message : String(e),
                    ),
                )
                .finally(() => {
                    saving.current = false;
                });
        };
        const timer = setInterval(flush, SAVE_DEBOUNCE_MS);
        return () => {
            unsub();
            clearInterval(timer);
            flush();
        };
    }, [pid, workflowKey, doc]);

    if (error) return <div className="tfs-empty tfs-error">{error}</div>;
    return (
        <div className="tfs-canvas-host">
            <div className="tfs-canvas-wrap">
                <IntlProvider locale={lang} messages={messages}>
                    <CanvasProvider
                        apiBaseUrl={`${PREFIX}/p/${pid}`}
                        resolveAssetUrl={resolveAssetUrl}
                        locale={lang}
                        // Both stay undefined without a browser plugin: the
                        // canvas then runs every node on the server, as before.
                        workflowRunner={edge.runtime?.runner}
                        taskTransport={edge.runtime?.taskTransport}
                    >
                        <ReactFlowProvider>
                            <FlowCanvas ref={handle} />
                        </ReactFlowProvider>
                    </CanvasProvider>
                </IntlProvider>
            </div>
            {edge.dialog}
        </div>
    );
}

interface Question {
    title: string;
    body: string;
    answer: (ok: boolean) => void;
}

/**
 * The project's browser edge runtime (`null` until loaded, and when no
 * browser plugin is installed) and the confirmation dialog it asks through:
 * a paid server node (the studio's billing checkpoint) or a large model
 * download. Questions are shown one at a time.
 */
function useEdgeRuntime(pid: string): {
    runtime: StudioEdgeRuntime | null;
    dialog: ReactNode;
} {
    const t = useT();
    const tRef = useRef(t);
    tRef.current = t;
    const [runtime, setRuntime] = useState<StudioEdgeRuntime | null>(null);
    const [questions, setQuestions] = useState<Question[]>([]);

    useEffect(() => {
        let alive = true;
        let loaded: StudioEdgeRuntime | null = null;
        const ask = (title: string, body: string, signal?: AbortSignal) =>
            new Promise<boolean>((resolve) => {
                let done = false;
                const q: Question = {
                    title,
                    body,
                    answer: (ok) => {
                        if (done) return;
                        done = true;
                        setQuestions((all) => all.filter((x) => x !== q));
                        resolve(ok);
                    },
                };
                signal?.addEventListener("abort", () => q.answer(false), {
                    once: true,
                });
                setQuestions((all) => [...all, q]);
            });
        loadStudioEdgeRuntime({
            pid,
            fallbackTransport: httpTaskTransport,
            confirmPaid: (c) => {
                const tr = tRef.current;
                const billing = tr(
                    c.billing === "modal" ? "billingModal" : "billingApi",
                );
                return ask(
                    tr("confirmPaidTitle"),
                    `${tr("confirmPaidBody", { slot: c.nodeSlot, plugin: c.pluginId, billing })}\n\n${c.note}`,
                );
            },
            confirmDownload: (r, signal) => {
                const tr = tRef.current;
                return ask(
                    tr("confirmDownloadTitle"),
                    tr("confirmDownloadBody", {
                        slot: r.nodeSlot,
                        label: r.label,
                    }),
                    signal,
                );
            },
        })
            .then((rt) => {
                if (!alive) return rt?.dispose();
                loaded = rt;
                setRuntime(rt);
            })
            .catch(() => alive && setRuntime(null));
        return () => {
            alive = false;
            loaded?.dispose();
            setRuntime(null);
        };
    }, [pid]);

    const q = questions[0];
    const dialog = q ? (
        <Modal title={q.title} onClose={() => q.answer(false)}>
            <p style={{ whiteSpace: "pre-wrap", margin: "0 0 12px" }}>
                {q.body}
            </p>
            <div className="tfs-row">
                <button
                    className="tfs-btn primary"
                    onClick={() => q.answer(true)}
                >
                    {t("allow")}
                </button>
                <button className="tfs-btn" onClick={() => q.answer(false)}>
                    {t("decline")}
                </button>
            </div>
        </Modal>
    ) : null;
    return { runtime, dialog };
}
