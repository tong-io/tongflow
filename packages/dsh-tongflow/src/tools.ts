/**
 * The studio's tongflow_* tools on dsh's tool registry. The tools themselves
 * are host-neutral (`tongflow-studio`); this file gives each call what dsh
 * has to offer: the agent's session and cwd, the attachment store for images,
 * the llm runtime's model catalog, and the job registry for background runs.
 */
import type { Context } from "@deepseek-ai/cordis";
import type {
    AttachmentStore,
    ImageAttachmentRef,
} from "@deepseek-ai/dsh-attachment";
import type { JobHandle, JobRegistry, JobSpec } from "@deepseek-ai/dsh-jobs";
import type { ContentBlock, LlmRuntime } from "@deepseek-ai/dsh-llm";
import {
    defineTool,
    type ParameterSchemaSpec,
    type ToolDefinition,
    type ToolRunContext,
} from "@deepseek-ai/dsh-tools";
import type { JsonValue } from "@deepseek-ai/dsh-util-values";
import {
    allTools,
    formatEvent,
    type RunRecord,
    runResult,
    type ToolCall,
    type ToolEnv,
    type ToolSpec,
} from "tongflow-studio";

declare module "@deepseek-ai/dsh-jobs" {
    interface JobKindMap {
        tongflow: "tongflow";
    }
}

/**
 * Whether the model this call runs under accepts image content. Mirrors the
 * llm runtime's own predicate: it only projects images away for a model that
 * *declares* modalities without "image", so an undeclared catalog stays
 * image-capable here too. Unknown agent or absent llm service means "assume it
 * takes images" — the runtime degrades gracefully either way, and guessing the
 * other direction would spend a plugin run on every look.
 */
export async function modelTakesImages(
    ctx: Context,
    exec: ToolRunContext,
): Promise<boolean> {
    const llm = ctx.get("llm") as LlmRuntime | undefined;
    const { provider, model } = exec.agent?.options ?? {};
    if (!llm || !provider || !model) return true;
    try {
        const info = await llm.resolveModelInfo(provider, model, exec.signal);
        return (
            info.inputModalities === undefined ||
            info.inputModalities.includes("image")
        );
    } catch {
        return true;
    }
}

/**
 * Background job spec for a workflow run, valid on both job APIs we support.
 * dsh >= 0.1.7 keys ownership by session id, passes a JobHandle to `run` for
 * streaming output, and returns the final value as `result`. dsh 0.1.5 took
 * the live Agent as owner, pulled `readOutput()`, and read `output`. The newer
 * registry is the one exposing `events` (0.1.5 had `onJobDone`).
 */
function backgroundJobSpec(
    jobs: JobRegistry,
    agent: ToolRunContext["agent"],
    workflow: string,
    record: RunRecord,
): JobSpec {
    const modern = "events" in jobs;
    const owner = agent ? { owner: modern ? agent.id : agent } : {};
    return {
        kind: "tongflow",
        label: `tongflow ${workflow}`,
        ...owner,
        run: (job?: JobHandle) => {
            let stop = () => {};
            if (job) {
                const append = (text: string) => {
                    if (text) job.append(`${text}\n`);
                };
                append(record.readOutput());
                stop = record.subscribe((event) => append(formatEvent(event)));
            }
            return {
                cancel: (reason?: string) => record.cancel(reason),
                done: record.done.then((r) => {
                    stop();
                    const final = JSON.stringify(runResult(r), null, 2);
                    return {
                        status:
                            r.summary.status === "completed"
                                ? ("completed" as const)
                                : r.summary.status === "cancelled"
                                  ? ("killed" as const)
                                  : ("failed" as const),
                        ...(r.error ? { detail: r.error } : {}),
                        result: final,
                        output: final,
                    };
                }),
                readOutput: () => record.readOutput(),
            };
        },
    } as JobSpec;
}

/** One dsh execution as the neutral tools see it; absent services stay absent so the tools degrade. */
function toolCall(ctx: Context, exec: ToolRunContext): ToolCall {
    const attachments = ctx.get("attachments") as AttachmentStore | undefined;
    const jobs = ctx.get("jobs") as JobRegistry | undefined;
    const cwd = exec.agent?.session.header.cwd;
    return {
        signal: exec.signal,
        ...(exec.agent?.id ? { sessionId: String(exec.agent.id) } : {}),
        ...(cwd ? { cwd } : {}),
        takesImages: () => modelTakesImages(ctx, exec),
        ...(attachments
            ? {
                  showImage: async (image) => {
                      const attachment = await attachments.saveImage(image);
                      return {
                          attachment: attachment as unknown as JsonValue,
                          width: attachment.width,
                          height: attachment.height,
                      };
                  },
              }
            : {}),
        ...(jobs
            ? {
                  startBackground: (workflow, record) =>
                      String(
                          jobs.start(
                              backgroundJobSpec(
                                  jobs,
                                  exec.agent,
                                  workflow,
                                  record,
                              ),
                          ),
                      ),
              }
            : {}),
    };
}

function text(value: unknown): ContentBlock[] {
    return [
        {
            type: "text",
            text:
                typeof value === "string"
                    ? value
                    : JSON.stringify(value, null, 2),
        },
    ];
}

/** Text for the model, plus the image when the value carries one (tongflow_look). */
function render(_args: unknown, value: JsonValue): ContentBlock[] {
    const val = value as {
        attachment?: ImageAttachmentRef;
        summary?: string;
    } | null;
    if (!val || typeof val !== "object" || !val.attachment) return text(value);
    return [
        ...text(val.summary ?? JSON.stringify(value)),
        { type: "image", attachment: val.attachment },
    ];
}

function dshTool(ctx: Context, spec: ToolSpec): ToolDefinition {
    return defineTool({
        name: spec.name,
        description: spec.description,
        parameters: spec.parameters as ParameterSchemaSpec,
        output: {
            schema: { type: spec.returns === "string" ? "string" : "json" },
            render,
        },
        execute: (args, exec) =>
            spec.execute(args as never, toolCall(ctx, exec)) as Promise<never>,
    });
}

/** Register every tongflow_* tool on ctx.tools; registrations are effects (disposed on unload). */
export function registerTools(ctx: Context, env: ToolEnv): void {
    for (const spec of allTools(env)) {
        const tool = dshTool(ctx, spec);
        ctx.effect(
            () => ctx.tools.register(tool),
            `dsh-tongflow: tool ${tool.name}`,
        );
    }
}
