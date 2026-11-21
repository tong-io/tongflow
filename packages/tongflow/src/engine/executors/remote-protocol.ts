/**
 * Wire protocol of the remote executor: how a browser-run workflow hands one
 * `runtime: python` node to a TongFlow backend (Studio or the Next app).
 *
 *   POST {base}/api/engine/invoke        {@link RemoteInvokeRequest}
 *     → 200 `text/event-stream` of {@link RemoteInvokeFrame}s:
 *       `started` once, `progress` any number of times, then exactly one
 *       `result` or `error`.
 *     → 4xx/5xx JSON {@link RemoteInvokeErrorBody} when the call is refused
 *       before it starts (bad request, browser plugin, not installed,
 *       billing confirmation needed, missing API key, auth).
 *   POST {base}/api/engine/invoke/stop   `{invocationId}` → `{status, wasRunning}`
 *
 * The prompt is already materialized (assets are `{bytesBase64, filename?,
 * mime?}`, ADR 0001) and the result is the raw ABI output with assets as
 * `bytesBase64`, so the browser's asset store keeps the file keys.
 * Shared by the executor and both hosts; platform neutral.
 */

export const REMOTE_INVOKE_PATH = "/api/engine/invoke";
export const REMOTE_STOP_PATH = "/api/engine/invoke/stop";

/** Body of `POST {base}/api/engine/invoke`. */
export interface RemoteInvokeRequest {
    pluginId: string;
    nodeSlot: string;
    /** Materialized ABI input, without the reserved `_params` key. */
    prompt: Record<string, unknown>;
    model?: string;
    /** The node's advanced params (`TONGFLOW_SLOT_PARAMS`), as the engine's `_params`. */
    _params?: Record<string, unknown>;
    /**
     * The user agreed to this run's billing. A host that asks before paid
     * runs (Studio) refuses a paid plugin without it (`needs_confirmation`).
     */
    confirmed?: boolean;
}

/** One SSE `data:` frame of the invoke stream. */
export type RemoteInvokeFrame =
    | { type: "started"; invocationId: string }
    | { type: "progress"; message: string; percent?: number }
    | { type: "result"; output: Record<string, unknown> }
    | { type: "error"; error: string; code?: RemoteErrorCode };

export type RemoteErrorCode =
    | "invalid_request"
    | "browser_plugin"
    | "plugin_not_installed"
    | "needs_confirmation"
    | "missing_api_key"
    | "unknown_invocation"
    | "cancelled"
    | "failed";

/** What the user is asked before a paid server-side run. */
export interface RemoteConfirmation {
    pluginId: string;
    nodeSlot: string;
    /** How the plugin is billed (`api`, `modal`, …). */
    billing: string;
    /** Plain-language billing note to show the user. */
    note: string;
}

/** JSON body of a refused invoke (non-2xx). */
export interface RemoteInvokeErrorBody {
    error: string;
    code?: RemoteErrorCode | string;
    /** Set with `code: "needs_confirmation"`. */
    confirmation?: RemoteConfirmation;
    /** Set with `code: "missing_api_key"`. */
    key?: string;
    url?: string;
}

/** Body of `POST {base}/api/engine/invoke/stop`. */
export interface RemoteStopRequest {
    invocationId: string;
}

/** Encode one frame as an SSE event. */
export function encodeRemoteFrame(frame: RemoteInvokeFrame): string {
    return `data: ${JSON.stringify(frame)}\n\n`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Read an invoke body as hosts receive it. Returns the request, or the
 * message for a 400 `invalid_request`.
 */
export function parseRemoteInvokeRequest(
    body: unknown,
): { request: RemoteInvokeRequest } | { error: string } {
    if (!isRecord(body)) return { error: "request body must be a JSON object" };
    const pluginId =
        typeof body.pluginId === "string" ? body.pluginId.trim() : "";
    const nodeSlot =
        typeof body.nodeSlot === "string" ? body.nodeSlot.trim() : "";
    if (!pluginId) return { error: "pluginId is required" };
    if (!nodeSlot) return { error: "nodeSlot is required" };
    if (!isRecord(body.prompt)) return { error: "prompt must be an object" };
    if (body.model !== undefined && typeof body.model !== "string")
        return { error: "model must be a string" };
    if (body._params !== undefined && !isRecord(body._params))
        return { error: "_params must be an object" };
    const model = typeof body.model === "string" ? body.model.trim() : "";
    const params =
        isRecord(body._params) && Object.keys(body._params).length > 0
            ? body._params
            : undefined;
    return {
        request: {
            pluginId,
            nodeSlot,
            prompt: body.prompt,
            ...(model ? { model } : {}),
            ...(params ? { _params: params } : {}),
            ...(body.confirmed === true ? { confirmed: true } : {}),
        },
    };
}
