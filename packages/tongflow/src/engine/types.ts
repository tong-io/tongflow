/**
 * Public types of the TypeScript workflow engine (`tongflow/engine`).
 *
 * The engine is a port of the Python engine in `sdk/tongflow/engine/`: it
 * runs an exported `ExecutableWorkflow` level by level, fans a node out over
 * its `batchField`, materializes `$ref: Asset` inputs from an injectable
 * {@link AssetStore}, stores binary outputs back into it, and projects every
 * node's output into the ABI output view its downstream nodes read. Who runs a
 * node is the injectable {@link NodeExecutor}'s concern.
 */

/** A binary input in ABI form: what a plugin receives for a `$ref: Asset` field. */
export interface AssetPayload {
    bytesBase64: string;
    filename?: string;
    mime?: string;
}

/** A stored binary in ABI ref form (`FileRef` / `ImageRef` / …): what downstream nodes see. */
export interface FileRefPayload {
    file_key: string;
    mime?: string;
    filename?: string;
}

/** Metadata handed to {@link AssetStore.put}. `ext` is derived from mime, then filename, else `bin`. */
export interface AssetPutMeta {
    mime?: string;
    filename?: string;
    ext: string;
}

/**
 * Where a node's binary outputs live between and after nodes, and where
 * `$ref: Asset` inputs are read from. Mirrors the Python `AssetStore`
 * protocol (`sdk/tongflow/engine/store.py`), made async for browser storage.
 */
export interface AssetStore {
    /** Store bytes and return the ref downstream nodes carry. `mime` / `filename` are echoed when set. */
    put(bytes: Uint8Array, meta: AssetPutMeta): Promise<FileRefPayload>;
    /** Bytes for a key, or `null` when the store does not know it. */
    get(fileKey: string): Promise<Uint8Array | null>;
    /**
     * True when `fileKey` is a handle this store issued (`mem://…`, `opfs://…`).
     * {@link inlineAssets} resolves only these, like Python's inline mode
     * resolves only `mem://` handles.
     */
    owns(fileKey: string): boolean;
}

/** Progress a node reports while it runs. */
export type ExecutorProgress =
    | {
          kind: "progress";
          message: string;
          /** 0–100, like the Python progress protocol. */
          percent?: number;
      }
    | {
          /** Model weights being fetched (first run of an edge plugin). */
          kind: "model-download";
          model?: string;
          file?: string;
          loaded: number;
          total?: number;
      };

/** One plugin invocation, as the engine hands it to a {@link NodeExecutor}. */
export interface InvokeRequest {
    pluginId: string;
    nodeSlot: string;
    /**
     * Materialized ABI input (assets are `{bytesBase64, filename?, mime?}`).
     * When the node carries advanced params they ride under the reserved
     * `_params` key, exactly as the Python engine hands them to its invoker.
     */
    prompt: Record<string, unknown>;
    /** The node's chosen model, when set. */
    model?: string;
    signal: AbortSignal;
    onProgress: (progress: ExecutorProgress) => void;
}

/** The plugin invocation targeted by a run, before any input is resolved. */
export interface InvokeTarget {
    pluginId: string;
    nodeSlot: string;
}

/**
 * Runs one plugin call. The engine never cares where: in a Web Worker
 * (edge executor), on a TongFlow backend (remote executor) or in a test fake.
 */
export interface NodeExecutor {
    /** Returns the raw ABI output (`bytesBase64` in ref fields is fine; the engine stores it). */
    invoke(request: InvokeRequest): Promise<Record<string, unknown>>;
    /**
     * Optional preflight, called before the node's inputs are resolved. Throw
     * to fail the node early (e.g. "no remote executor configured"), matching
     * where the Python engine raises its plugin lookup errors.
     */
    check?(target: InvokeTarget): void;
}

/**
 * A remote executor dispatches a node to a TongFlow backend (the Python
 * runtime) and returns its raw ABI output. Same contract as any
 * {@link NodeExecutor}: the prompt arrives materialized, so assets cross to
 * the server only for nodes the graph explicitly runs there. Implemented by a
 * host, or `createHttpRemoteExecutor` for a Studio or Next backend; the engine
 * only routes to it (see `createCompositeExecutor`).
 */
export type RemoteExecutor = NodeExecutor;

/** A workflow input value: `{texts|fileKeys}`, a list, or one string (same as Python). */
export type WorkflowInputValue =
    | { texts?: string[]; fileKeys?: string[] }
    | string[]
    | string;

/**
 * Live control over a run, created with `createRunController()` and passed as
 * {@link RunWorkflowOptions.controller}. Every method is synchronous, may be
 * called from an `onEvent` handler, and returns whether it changed anything
 * (`false` for an unknown node, a request the node's state does not allow,
 * or when no run is attached).
 */
export interface RunController {
    /** True between `pause()` and `resume()`. */
    readonly paused: boolean;
    /** True while a run is attached and has not ended. */
    readonly active: boolean;
    /**
     * No new node starts; running nodes finish. Emits `workflow_paused`. A
     * paused run does not end even when nothing is left to run, so a failed
     * or finished node can still be replaced. Allowed before the run starts
     * (it then starts paused).
     */
    pause(): boolean;
    /** Emits `workflow_resumed`; scheduling continues. */
    resume(): boolean;
    /**
     * Skip a node that has not started (`pending`) or is `running` (its
     * executor signal is aborted). Its whole downstream closure is skipped
     * as well, including nodes that have other, satisfied inputs.
     */
    skipNode(nodeId: string): boolean;
    /**
     * Switch a node to another implementation of its slot. Before the node
     * starts: it will run with `impl`. After it `completed` or `failed`: it
     * runs again with `impl`, every downstream node that already ran (or is
     * running) becomes stale and runs again, and nodes skipped because of it
     * (`upstream failed` / `upstream skipped`) are un-skipped when nothing
     * else blocks them. Refused while the node runs or once it is skipped.
     * Advanced params are kept only when `pluginId` does not change.
     */
    replaceImplementation(nodeId: string, impl: NodeImplementation): boolean;
    /** The node's state in the attached run; `undefined` when unknown or no run is attached. */
    nodeStatus(nodeId: string): NodeRunStatus | undefined;
}

/** Events, named and shaped like the Python engine's `on_progress` events. */
export type EngineEvent =
    | { type: "workflow_started"; totalNodes: number; levels: number }
    | {
          type: "node_started";
          nodeId: string;
          /** 1-based level index. */
          level: number;
          feature: string;
          label: string;
      }
    | {
          type: "plugin_progress";
          nodeId: string;
          /** Absent on the engine's own `batch i/N` messages. */
          pluginId?: string;
          message: string;
          percent?: number;
      }
    | {
          /** TypeScript engine only: model weights being fetched. */
          type: "model_download";
          nodeId: string;
          pluginId: string;
          model?: string;
          file?: string;
          loaded: number;
          total?: number;
      }
    | {
          type: "node_completed";
          nodeId: string;
          output: Record<string, unknown>;
          label: string;
      }
    | { type: "node_failed"; nodeId: string; error: string; label: string }
    | {
          /**
           * TypeScript engine only: a running node stopped by cancellation, by
           * a sibling's failure (`abort` policy) or because an upstream rerun
           * made it stale (it starts again later).
           */
          type: "node_cancelled";
          nodeId: string;
          label: string;
      }
    | {
          /**
           * TypeScript engine only: the node will not run (or stopped
           * running). `reason` is {@link SKIP_REASONS}`.user` for a
           * `skipNode` target, `.upstreamSkipped` / `.upstreamFailed` for its
           * downstream closure.
           */
          type: "node_skipped";
          nodeId: string;
          reason: string;
          label: string;
      }
    | {
          /** TypeScript engine only: `RunController.pause()` / `resume()`. */
          type: "workflow_paused" | "workflow_resumed";
      }
    | {
          /**
           * `workflow_completed` carries `success` or `partial`,
           * `workflow_failed` carries `failed`, `workflow_cancelled`
           * carries `cancelled`.
           */
          type: "workflow_completed" | "workflow_failed" | "workflow_cancelled";
          status: RunStatus;
          outputs: Record<string, Record<string, unknown>>;
          errors: string[];
      };

/**
 * How a run ended; see `runWorkflow` for the exact rules. `partial` (some
 * nodes failed or were skipped, at least one completed) only occurs with the
 * `branch` failure policy or after a `skipNode`.
 */
export type RunStatus = "success" | "partial" | "failed" | "cancelled";

/** The `reason` values of `node_skipped`. */
export const SKIP_REASONS = {
    /** The node itself was skipped with `RunController.skipNode`. */
    user: "skipped by user",
    /** An upstream node was skipped. */
    upstreamSkipped: "upstream skipped",
    /** An upstream node failed (`branch` policy). */
    upstreamFailed: "upstream failed",
} as const;

/**
 * What the engine does when a node fails:
 *  - `abort` (default, the Python engine's semantics): the run fails, running
 *    siblings are cancelled and no later level starts;
 *  - `branch`: only the failed node's downstream closure is skipped
 *    (`upstream failed`); unrelated branches keep running.
 */
export type FailurePolicy = "abort" | "branch";

/** A node's state within a run, as `RunController.nodeStatus` reports it. */
export type NodeRunStatus =
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "skipped"
    | "cancelled";

/** The implementation `RunController.replaceImplementation` switches a node to. */
export interface NodeImplementation {
    pluginId: string;
    /** Absent = the plugin's default model. */
    model?: string;
}

export interface NodeFailure {
    nodeId: string;
    summary: string;
}

export interface NodeSkip {
    nodeId: string;
    reason: string;
}

/** Result of {@link runWorkflow}; Python's result with camelCase keys. */
export interface RunResult {
    status: RunStatus;
    /** Node id → raw plugin output, asset fields as `{file_key}` refs into the store. */
    outputs: Record<string, Record<string, unknown>>;
    /** Workflow output name → values (texts or file keys). */
    outputsByName: Record<string, string[]>;
    errors: string[];
    failures: NodeFailure[];
    /** Nodes that ended skipped, in level order. */
    skipped: NodeSkip[];
}

/** A slot's input/output JSON Schemas, as in `ABI_NODES`. */
export interface AbiSlotSchemas {
    readonly inputs: unknown;
    readonly outputs: unknown;
}

export interface RunWorkflowOptions {
    executor: NodeExecutor;
    store: AssetStore;
    /** Workflow inputs keyed by `WorkflowInput.name`; omitted ones fall back to `staticData`. */
    inputs?: Record<string, WorkflowInputValue>;
    /** Abort to cancel: running nodes are stopped and the run ends `cancelled`. */
    signal?: AbortSignal;
    /** Default `abort` (Python semantics). See {@link FailurePolicy}. */
    failurePolicy?: FailurePolicy;
    /**
     * Pause / resume the run, skip a node or switch its implementation while
     * it runs. Create one with `createRunController()`; one controller drives
     * one run at a time.
     */
    controller?: RunController;
    onEvent?: (event: EngineEvent) => void;
    /**
     * How many nodes of one level run at once. Default: all of them. `1`
     * reproduces the Python engine's sequential order exactly (including
     * event order); outputs are identical either way.
     */
    concurrency?: number;
    /** Per-slot ABI schemas. Default: the bundled `ABI_NODES`. */
    abi?: Readonly<Record<string, AbiSlotSchemas>>;
    /** Reads `http(s)` asset references. Default: `globalThis.fetch`. */
    fetch?: (url: string) => Promise<Response>;
}
