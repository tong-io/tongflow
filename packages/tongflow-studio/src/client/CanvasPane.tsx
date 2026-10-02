/**
 * Embeds `tongflow/canvas` for one workflow file. The canvas talks to our
 * canvas-compat routes (`/tongflow/p/<pid>/api/...`) through its host config,
 * shows assets via `/tongflow/p/<pid>/files/<key>` (the host hands it a copy
 * whose `./x` refs are rewritten to project keys), and the document is
 * synced file ↔ canvas: load on open, debounced
 * save on change (the host re-exports the executable on save).
 */
import "@xyflow/react/dist/style.css";
import "tongflow/canvas.css";
import { ReactFlowProvider } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    CanvasProvider,
    FlowCanvas,
    type FlowCanvasHandle,
    useFlow,
} from "tongflow/canvas";
import { canvasMessages, isCanvasLocale } from "tongflow/canvas/messages";
import { IntlProvider } from "use-intl";
import { fileUrl, PREFIX, studio, type WorkflowDoc } from "./api.ts";

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
                    >
                        <ReactFlowProvider>
                            <FlowCanvas ref={handle} />
                        </ReactFlowProvider>
                    </CanvasProvider>
                </IntlProvider>
            </div>
        </div>
    );
}
