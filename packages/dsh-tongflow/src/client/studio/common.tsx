import { createContext, useContext, useEffect, useState } from "react";
import type { Modality } from "tongflow-studio/shared";
import { fileUrl } from "../api.ts";
import { makeT, type T } from "../i18n.ts";

export const TContext = createContext<T>(makeT("en"));
export function useT(): T {
    return useContext(TContext);
}

export function useAsync<T>(
    fn: () => Promise<T>,
    deps: unknown[],
): {
    data: T | undefined;
    error: string | undefined;
    loading: boolean;
    reload: () => void;
} {
    const [state, setState] = useState<{
        data?: T;
        error?: string;
        loading: boolean;
    }>({ loading: true });
    const [tick, setTick] = useState(0);
    useEffect(() => {
        let alive = true;
        setState((s) => ({ ...s, loading: true }));
        fn().then(
            (data) => alive && setState({ data, loading: false }),
            (error: unknown) =>
                alive &&
                setState({
                    error:
                        error instanceof Error ? error.message : String(error),
                    loading: false,
                }),
        );
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, tick]);
    return {
        data: state.data,
        error: state.error,
        loading: state.loading,
        reload: () => setTick((t) => t + 1),
    };
}

/** Small media thumbnail for a project file (image / video inline, a glyph otherwise). */
export function Thumb({
    pid,
    fileKey,
    modality,
}: {
    pid: string;
    fileKey: string;
    modality: Modality;
}) {
    const url = fileUrl(pid, fileKey);
    if (modality === "image")
        return <img src={url} alt={fileKey} loading="lazy" />;
    if (modality === "video")
        return <video src={url} muted preload="metadata" />;
    return (
        <span className="glyph">
            {modality === "audio"
                ? "♪"
                : modality === "model"
                  ? "◈"
                  : modality === "text"
                    ? "¶"
                    : "▤"}
        </span>
    );
}

export function fmtBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function fmtTime(iso: string | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function Modal({
    title,
    onClose,
    children,
    wide,
}: {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    wide?: boolean;
}) {
    return (
        <div className="tfs-modal-backdrop" onClick={onClose}>
            <div
                className={`tfs-modal${wide ? " wide" : ""}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    className="tfs-row"
                    style={{ justifyContent: "space-between", marginBottom: 8 }}
                >
                    <h2>{title}</h2>
                    <button className="tfs-btn small" onClick={onClose}>
                        ✕
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

/** Right-side drawer inside the studio root (details, run, takes). */
export function Drawer({
    title,
    onClose,
    children,
}: {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
}) {
    return (
        <div className="tfs-drawer">
            <div className="tfs-drawer-head">
                <h2>{title}</h2>
                <button className="tfs-btn small" onClick={onClose}>
                    ✕
                </button>
            </div>
            <div className="tfs-drawer-body">{children}</div>
        </div>
    );
}
