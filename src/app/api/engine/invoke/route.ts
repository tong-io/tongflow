import type { NextRequest } from "next/server";
import { remoteInvokeResponse } from "@/lib/task/remote-invoke.server";

/**
 * POST /api/engine/invoke
 *
 * Remote executor (`createHttpRemoteExecutor` in `tongflow/engine`): run one
 * Python node of a browser-run workflow. Body `{pluginId, nodeSlot, prompt,
 * model?, _params?}` with the prompt already materialized; the response is an
 * SSE stream of `started` / `progress` / `result` | `error` frames, or a JSON
 * error when the call is refused. See docs/edge-runtime.md.
 */
export function POST(request: NextRequest) {
    return remoteInvokeResponse(request);
}
