/**
 * Wrap one canvas node execution (`POST /api/task/create` body from
 * `tongflow/canvas`) into a one-node executable workflow the engine can run.
 * Every prompt field becomes a static binding; the slot's ABI output routes
 * become workflow outputs keyed by their source field.
 */
import {
    type ExecutableWorkflow,
    getAbiNodeBySlot,
    getAbiOutputRoutesBySlot,
} from "tongflow";
import { expandTemplate, hasTemplateRefs } from "../project/refs.ts";
import type { WorkflowDocument } from "../project/workflow-file.ts";

export interface CanvasTaskBody {
    feature: string;
    pluginId: string;
    model?: string;
    prompt: Record<string, unknown>;
    nodeId: string;
    workflowId?: number;
}

export async function singleNodeDocument(
    projectRoot: string,
    body: CanvasTaskBody,
): Promise<WorkflowDocument> {
    const abi = getAbiNodeBySlot(body.feature);
    if (!abi) throw new Error(`unknown ABI slot "${body.feature}"`);
    if (!body.pluginId) throw new Error("pluginId is required");
    const routes = getAbiOutputRoutesBySlot(body.feature);
    const prompt = await resolvePromptRefs(projectRoot, body.prompt ?? {});
    const bindings: ExecutableWorkflow["executableNodes"][number]["bindings"] =
        {};
    for (const [field, value] of Object.entries(prompt)) {
        if (value === undefined || value === null) continue;
        bindings[field] = { kind: "static", value };
    }
    const nodeId = body.nodeId || "node";
    const workflow: ExecutableWorkflow = {
        name: `canvas:${body.feature}`,
        version: "1.0",
        exportedAt: new Date().toISOString(),
        inputs: [],
        outputs: routes.map((r) => ({
            name: r.sourceField,
            type: outputType(r.nodeType),
            nodeId,
            // Keyed by source field so the engine's output view resolves it.
            field: r.sourceField,
        })),
        dataNodes: [],
        executableNodes: [
            {
                id: nodeId,
                type: `${body.feature}`,
                feature: body.feature,
                pluginId: body.pluginId,
                ...(body.model ? { model: body.model } : {}),
                label: body.feature,
                bindings,
                outputs: routes.map((r) => ({
                    sourceField: r.sourceField,
                    nodeType: r.nodeType,
                    dataField: r.dataField,
                    expandEach: r.expandEach,
                    ...(r.itemValuePath
                        ? { itemValuePath: r.itemValuePath }
                        : {}),
                    ...(r.isArrayOfArrays ? { isArrayOfArrays: true } : {}),
                })),
                dependencies: [],
                level: 0,
            },
        ],
        executionLevels: [[nodeId]],
        dataNodeEdges: [],
        originalFlow: { nodes: [], edges: [] },
    } as ExecutableWorkflow;
    return {
        name: workflow.name,
        flow: { nodes: [], edges: [] },
        executable: workflow,
        meta: {},
    };
}

function outputType(
    nodeType: string,
): ExecutableWorkflow["outputs"][number]["type"] {
    if (nodeType === "textNode") return "text";
    return nodeType.replace(
        /Node$/,
        "",
    ) as ExecutableWorkflow["outputs"][number]["type"];
}

/** Deep-walk the prompt: `{{file}}` includes inside strings are expanded (canvas prompts are otherwise passed through). */
async function resolvePromptRefs(
    projectRoot: string,
    value: unknown,
): Promise<Record<string, unknown>> {
    const walk = async (v: unknown): Promise<unknown> => {
        if (typeof v === "string") {
            if (hasTemplateRefs(v))
                return expandTemplate(projectRoot, projectRoot, v);
            return v;
        }
        if (Array.isArray(v)) {
            const out: unknown[] = [];
            for (const item of v) out.push(await walk(item));
            return out;
        }
        if (v && typeof v === "object") {
            const out: Record<string, unknown> = {};
            for (const [k, item] of Object.entries(
                v as Record<string, unknown>,
            ))
                out[k] = await walk(item);
            return out;
        }
        return v;
    };
    return (await walk(value)) as Record<string, unknown>;
}
