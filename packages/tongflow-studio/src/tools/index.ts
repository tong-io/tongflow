/** Every tongflow_* tool, host-neutral; a host adapts the list to its own registry. */
import { projectTools } from "./project-tools.ts";
import { runTools } from "./run-tools.ts";
import type { ToolSpec } from "./spec.ts";
import type { ToolEnv } from "./support.ts";
import { workflowTools } from "./workflow-tools.ts";

export function allTools(env: ToolEnv): ToolSpec[] {
    return [...projectTools(env), ...workflowTools(env), ...runTools(env)];
}
