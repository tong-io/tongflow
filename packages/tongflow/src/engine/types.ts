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
          /** TypeScript engine only: a running node stopped by cancellation or by a sibling's failure. */
          type: "node_cancelled";
          nodeId: string;
          label: string;
      }
    | {
          type: "workflow_completed" | "workflow_failed" | "workflow_cancelled";
          status: RunStatus;
          outputs: Record<string, Record<string, unknown>>;
          errors: string[];
      };

export type RunStatus = "success" | "failed" | "cancelled";

export interface NodeFailure {
    nodeId: string;
    summary: string;
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
