/** One studio project, as the panel's picker lists it. */
export type TongflowProject = { id: string; title: string };

/** One line of the project's folder tree, flattened for a list. */
export type TongflowRow = {
    key: string;
    label: string;
    kind: "folder" | "file" | "workflow" | "output";
    depth: number;
};

/** Where this session's studio serves its page, read off the link the server hands out. */
export type TongflowStudio = { port: string; token: string; session: string };

/** What the panel draws. */
export type TongflowPanel = {
    studio?: TongflowStudio;
    projects: TongflowProject[];
    /** The project shown. */
    project?: string;
    /** The project the session's agent last worked in; the panel follows it when it changes. */
    followed?: string;
    rows: TongflowRow[];
    /** Runs in progress in the project shown. */
    running: number;
    error?: string;
};

declare module "claude-code" {
    interface PluginState {
        tongflow: { panel: TongflowPanel; hasOpened: boolean };
    }
}
