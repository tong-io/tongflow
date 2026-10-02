/**
 * Execution & perception tools: run a workflow (foreground or in the
 * background), look at a generated image (handed to the host as an image when
 * the session's model takes images, otherwise described through TongFlow's own
 * image-describe slot), perceive video/audio through TongFlow's own
 * describe / transcribe slots, and manage plugins.
 */
import { execFile as execFileCb } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import type { RunRecord } from "../engine/runs.ts";
import { formatEvent } from "../engine/runs.ts";
import { modalityOfExt } from "../shared/types.ts";
import {
    type Json,
    type ToolCall,
    type ToolImage,
    type ToolSpec,
    tool,
} from "./spec.ts";
import {
    compact,
    errorMessage,
    PROJECT_PARAM,
    resolveProjectId,
    type ToolEnv,
} from "./support.ts";

const execFile = promisify(execFileCb);

/**
 * The clone URL as something a person or `web_fetch` can open: git remotes
 * carry a `.git` suffix and sometimes an `scp`-style host, neither of which
 * belongs in a link. A non-GitHub or already-clean URL passes through.
 */
export function browsableRepo(gitUrl: string): string {
    return gitUrl.replace(/^git@([^:]+):/, "https://$1/").replace(/\.git$/, "");
}

/**
 * A plugin's own README, when the clone shipped one. Only the path travels in
 * the catalog: the agent reads the file when it needs to choose between
 * plugins, set an unfamiliar model, or understand a failure. An installed
 * plugin is not a new trust surface — its code already runs on this machine.
 */
export async function pluginReadme(
    pluginsDir: string,
    id: string,
): Promise<{ readme?: string }> {
    const path = join(pluginsDir, id, "README.md");
    try {
        if ((await stat(path)).isFile()) return { readme: path };
    } catch {
        // Not every plugin ships one; absence is normal, not an error.
    }
    return {};
}

/** One TongFlow describe/transcribe slot run over a local media file. */
interface SlotDescription {
    ok: boolean;
    feature: string;
    pluginId?: string;
    answer?: string;
    error?: string;
    log?: string[];
    raw?: unknown;
    /** Set instead of running when the slot's plugin bills the user. */
    needs_confirmation?: true;
    billing?: string;
    note?: string;
}

/**
 * What `tongflow_look` says when this session's model cannot see the asset.
 * A free plugin has already described it; a billing one has not run, and the
 * agent is told to ask the user and go through `tongflow_perceive`, the one
 * tool that carries the confirmation flag.
 */
function blindSummary(
    head: string,
    kind: "image" | "video",
    described: SlotDescription,
): string {
    const blind = `${head}. This session's model does not take images`;
    if (described.ok)
        return `${blind}, so it was described by ${described.pluginId} instead of shown:\n${described.answer}`;
    if (described.needs_confirmation)
        return `${blind}, and describing it would run ${described.pluginId}, which bills you (${described.billing}: ${described.note}). Tell the user what it costs, ask, and then call tongflow_perceive with user_confirmed=true — or switch this session to a vision-capable model.`;
    return `${blind} and it could not be described (${described.error}). Switch to a vision-capable model, or install a plugin for the ${kind}-describe slot.`;
}

/**
 * Understand a media file through TongFlow's own describe / transcribe slots.
 * Shared by `tongflow_perceive` and by `tongflow_look`'s fallback for a model
 * that does not take images.
 */
export async function describeViaSlot(
    env: ToolEnv,
    pid: string,
    feature: string,
    prompt: Record<string, unknown>,
    pluginId?: string,
    confirmed?: boolean,
): Promise<SlotDescription> {
    const { registry } = await env.api.registry();
    const chosen = pluginId ?? registry.nodePluginMap[feature]?.[0];
    if (!chosen)
        return {
            ok: false,
            feature,
            error: `no installed plugin implements ${feature}; install one (e.g. tongflow-api-gemini or tongflow-modal-qwen38) with tongflow_plugins_install`,
        };
    // Understanding a file is a plugin run like any other: when it bills the
    // user, it needs their yes first, exactly like tongflow_workflow_run.
    if (!confirmed) {
        const { billing, note } = await env.api.pluginBilling(chosen);
        if (billing !== "local")
            return {
                ok: false,
                feature,
                pluginId: chosen,
                needs_confirmation: true,
                billing,
                note,
            };
    }
    const record = await env.api.startCanvasRun(pid, {
        feature,
        pluginId: chosen,
        prompt,
        nodeId: "perceive",
    });
    await record.done;
    if (record.summary.status !== "completed")
        return {
            ok: false,
            feature,
            pluginId: chosen,
            error: record.error ?? "perception run failed",
            log: record.events.slice(-10).map(formatEvent),
        };
    const texts = record.outcome?.texts ?? {};
    const answer = Object.values(texts).flat().join("\n").trim();
    return {
        ok: true,
        feature,
        pluginId: chosen,
        answer: answer || "(empty answer)",
        raw: record.outcome?.result.outputs,
    };
}

const WORKFLOW_PARAM = {
    type: "string",
    required: true,
    description:
        "Workflow file, project-relative, e.g. 'characters/mei/mei_ref' or 'characters/mei/mei_ref.tongflow.json'.",
} as const;

const IMAGE_MIME: Record<string, ToolImage["mediaType"]> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
};

/** A finished (or failed) run as the agent reads it. */
export function runResult(record: RunRecord): Json {
    const s = record.summary;
    return compact({
        runId: s.runId,
        status: s.status,
        ...(s.error ? { error: s.error } : {}),
        no: record.outcome?.no ?? 0,
        files: s.files.map((f) => f.key),
        texts: record.outcome?.texts ?? {},
        loose: record.outcome?.loose ?? [],
        nodes: s.nodes,
        log: record.events.slice(-30).map(formatEvent).filter(Boolean),
    });
}

export function runTools(env: ToolEnv): ToolSpec[] {
    const { api, studio } = env;
    return [
        tool({
            name: "tongflow_workflow_run",
            description:
                "Execute a workflow file with the TongFlow engine. Its outputs land next to the file as <name>.NN.<ext> (NN = this run's number; a run never overwrites earlier outputs) and the run is logged in <name>.runs.json. " +
                "Media generation takes seconds to minutes; use run_in_background for long jobs (video, batches) and continue working — check on it with tongflow_run_status. " +
                "After a run, inspect the result with tongflow_look (images) or tongflow_perceive (video/audio) before moving on; if it is off, fix the workflow and run again. " +
                "BILLING CHECKPOINT: a run that uses a paid plugin (API key billing or Modal GPU time) needs the user's yes EVERY time. Without user_confirmed=true this tool does not run — it returns needs_confirmation with the plugins, how each is billed, whether keys are set, available models and alternatives. Tell the user in plain words what will run and what it costs, ask, and only after they agree in this conversation call again with user_confirmed=true. Never set it on your own; nothing is remembered between runs.",
            parameters: {
                project: PROJECT_PARAM,
                workflow: WORKFLOW_PARAM,
                inputs: {
                    type: "object",
                    additionalProperties: true,
                    description:
                        "input name → text | file path (relative to the workflow file or the project root) | URL | array of those. Only for workflows that left inputs open.",
                },
                note: {
                    type: "string",
                    description:
                        "Why this run / what changed (recorded in provenance).",
                },
                run_in_background: {
                    type: "boolean",
                    description:
                        "Return immediately with the run id; poll with tongflow_run_status (a host with a job runtime also returns a job id and notifies you when it completes).",
                },
                user_confirmed: {
                    type: "boolean",
                    description:
                        "Set to true ONLY after the user explicitly agreed, in this conversation, to this run and its billing (the plugins / models listed in the needs_confirmation answer). Required whenever the workflow uses a paid plugin.",
                },
            },
            async execute(args, call) {
                const pid = await resolveProjectId(env, call, args.project);
                if (!args.user_confirmed) {
                    const paid = await api.paidPlugins(pid, args.workflow);
                    if (paid.length > 0) {
                        return compact({
                            ok: false,
                            needs_confirmation: true,
                            plugins: paid,
                            hint: "This run costs money. Tell the user which plugin(s) / model(s) will run and how they are billed (mention alternatives when there are any, and missing API keys), ask whether to go ahead, and only after they say yes call again with user_confirmed=true. Ask every time; do not assume a previous yes still holds.",
                        });
                    }
                }
                const record = await api.startRun({
                    projectId: pid,
                    workflowKey: args.workflow,
                    ...(args.inputs
                        ? { inputs: args.inputs as Record<string, unknown> }
                        : {}),
                    ...(args.note ? { note: args.note } : {}),
                });
                if (args.run_in_background) {
                    const runId = record.summary.runId;
                    if (call.startBackground)
                        return compact({
                            kind: "background",
                            jobId: call.startBackground(args.workflow, record),
                            runId,
                            hint: "poll with job_output or wait for the completion notice; then tongflow_look the new file",
                        });
                    return compact({
                        kind: "background",
                        runId,
                        hint: `poll with tongflow_run_status({ runId: "${runId}" }) until it is no longer running; then tongflow_look the new file`,
                    });
                }
                const stop = call.progress
                    ? record.subscribe((event) => {
                          const line = formatEvent(event);
                          if (line) call.progress?.(line);
                      })
                    : () => {};
                const finished = await Promise.race([
                    record.done,
                    new Promise<never>((_, reject) =>
                        call.signal.addEventListener(
                            "abort",
                            () => reject(new Error("cancelled")),
                            { once: true },
                        ),
                    ),
                ])
                    .catch((error) => {
                        record.cancel(errorMessage(error));
                        throw error;
                    })
                    .finally(stop);
                return runResult(finished);
            },
        }),
        tool({
            name: "tongflow_run_status",
            description:
                "Status, node progress and log of a run (or the recent runs of a project).",
            parameters: {
                project: PROJECT_PARAM,
                runId: {
                    type: "string",
                    description:
                        "Run id from tongflow_workflow_run; omit to list recent runs.",
                },
            },
            async execute(args, call) {
                if (args.runId) {
                    const r = api.getRun(args.runId);
                    if (!r)
                        return {
                            ok: false,
                            error: `unknown run ${args.runId}`,
                        };
                    return runResult(r);
                }
                const pid = await resolveProjectId(env, call, args.project);
                return compact(api.listRuns(pid).slice(0, 20));
            },
        }),
        tool({
            name: "tongflow_look",
            description:
                "Look at an asset. Images come back as an image you can see, videos as a contact sheet of sampled frames plus duration/resolution. " +
                "When this session's model does not take images, both are routed through TongFlow's describe slots instead and come back as text, saying so — so a look is never silently blind. " +
                "Audio returns metadata only — use tongflow_perceive for content. Takes a project-relative path (e.g. 'characters/mei/mei_ref.02.png').",
            parameters: {
                project: PROJECT_PARAM,
                ref: {
                    type: "string",
                    required: true,
                    description: "Project-relative path of the file.",
                },
                frames: {
                    type: "integer",
                    description:
                        "Frames in the video contact sheet (default 9, max 16).",
                },
            },
            async execute(args, call) {
                const pid = await resolveProjectId(env, call, args.project);
                const path = await resolveToFile(env, pid, args.ref);
                const ext = extname(path).slice(1).toLowerCase();
                const modality = modalityOfExt(ext);
                const st = await stat(path);
                if (modality === "image") {
                    const mime = IMAGE_MIME[ext];
                    if (!mime)
                        return compact({
                            summary: `${args.ref}: ${ext} image (${st.size} bytes) — unsupported for inline viewing (png/jpg/webp/gif only)`,
                        });
                    if (!call.showImage)
                        return compact({
                            summary: `${args.ref}: image ${st.size} bytes at ${path} (this host cannot show images inline)`,
                        });
                    if (!(await takesImages(call))) {
                        const described = await describeViaSlot(
                            env,
                            pid,
                            "image-describe",
                            {
                                image: path,
                                text: "Describe this image in detail.",
                            },
                        );
                        return compact({
                            ...described,
                            summary: blindSummary(
                                `${args.ref}: ${st.size} bytes`,
                                "image",
                                described,
                            ),
                            path,
                        });
                    }
                    const shown = await call.showImage({
                        data: new Uint8Array(await readFile(path)),
                        mediaType: mime,
                        name: path.split("/").pop(),
                    });
                    const size =
                        shown.width && shown.height
                            ? `, ${shown.width}×${shown.height}`
                            : "";
                    return compact({
                        summary: `${args.ref} → ${st.size} bytes${size}`,
                        attachment: shown.attachment,
                        path,
                    });
                }
                if (modality === "video") {
                    const probe = await ffprobe(path).catch((e) => ({
                        error: errorMessage(e),
                    }));
                    if (!call.showImage)
                        return compact({
                            summary: `${args.ref}: video ${st.size} bytes`,
                            probe,
                        });
                    if (!(await takesImages(call))) {
                        const described = await describeViaSlot(
                            env,
                            pid,
                            "video-describe",
                            {
                                video: path,
                                text: "Describe this video in detail: subjects, action, camera, continuity issues.",
                            },
                        );
                        return compact({
                            ...described,
                            summary: blindSummary(
                                `${args.ref}: video ${st.size} bytes; ${JSON.stringify(probe)}`,
                                "video",
                                described,
                            ),
                            probe,
                        });
                    }
                    try {
                        const sheet = await contactSheet(
                            path,
                            Math.min(Math.max(args.frames ?? 9, 1), 16),
                            studio.paths.tmp,
                        );
                        const shown = await call.showImage({
                            data: new Uint8Array(await readFile(sheet)),
                            mediaType: "image/jpeg",
                            name: "contact-sheet.jpg",
                        });
                        return compact({
                            summary: `${args.ref}: video ${st.size} bytes; ${JSON.stringify(probe)}. Contact sheet of ${args.frames ?? 9} frames follows (left→right, top→bottom).`,
                            probe,
                            attachment: shown.attachment,
                        });
                    } catch (error) {
                        return compact({
                            summary: `${args.ref}: video ${st.size} bytes; ${JSON.stringify(probe)}. (contact sheet unavailable: ${errorMessage(error)}; use tongflow_perceive)`,
                            probe,
                        });
                    }
                }
                if (modality === "audio") {
                    const probe = await ffprobe(path).catch((e) => ({
                        error: errorMessage(e),
                    }));
                    return compact({
                        summary: `${args.ref}: audio ${st.size} bytes; ${JSON.stringify(probe)}. Use tongflow_perceive to transcribe / describe.`,
                        probe,
                    });
                }
                if (modality === "text") {
                    const body = await readFile(path, "utf8");
                    return compact({
                        summary:
                            body.length > 8000
                                ? `${body.slice(0, 8000)}\n… (${body.length} chars)`
                                : body,
                    });
                }
                return compact({
                    summary: `${args.ref}: ${modality} file, ${st.size} bytes at ${path}`,
                });
            },
        }),
        tool({
            name: "tongflow_perceive",
            description:
                "Understand a video, audio or image through TongFlow's describe/transcribe slots (video-describe, audio-describe / transcribe, image-describe) using an installed plugin — this is how you review generated media the chat model cannot ingest directly. " +
                "Ask a concrete question: continuity with the reference, lip sync, motion quality, whether the line was spoken correctly, etc. " +
                "BILLING CHECKPOINT: this runs a plugin. When that plugin bills the user, the call returns needs_confirmation instead of running — tell the user which plugin will describe the file and how it is billed, ask, and only after they agree call again with user_confirmed=true. Ask every time. A plugin that runs locally needs no confirmation.",
            parameters: {
                project: PROJECT_PARAM,
                ref: {
                    type: "string",
                    required: true,
                    description: "Project-relative path of the media file.",
                },
                question: {
                    type: "string",
                    description:
                        "What to look/listen for. Default: a detailed description (or transcript for audio).",
                },
                mode: {
                    type: "string",
                    enum: ["describe", "transcribe"],
                    description:
                        "For audio: 'transcribe' (default) or 'describe'.",
                },
                pluginId: {
                    type: "string",
                    description:
                        "Force a specific plugin (default: the first installed one for the slot).",
                },
                user_confirmed: {
                    type: "boolean",
                    description:
                        "Set to true ONLY after the user explicitly agreed, in this conversation, to this plugin running and its billing. Never set it on your own; nothing is remembered between calls.",
                },
            },
            async execute(args, call) {
                const pid = await resolveProjectId(env, call, args.project);
                const path = await resolveToFile(env, pid, args.ref);
                const modality = modalityOfExt(extname(path).slice(1));
                let feature: string;
                let prompt: Record<string, unknown>;
                const question = args.question ?? "";
                if (modality === "video") {
                    feature = "video-describe";
                    prompt = {
                        video: path,
                        text:
                            question ||
                            "Describe this video in detail: subjects, action, camera, continuity issues.",
                        userPrompt: question,
                    };
                } else if (modality === "audio") {
                    if ((args.mode ?? "transcribe") === "transcribe") {
                        feature = "transcribe";
                        prompt = {
                            audio: path,
                            ...(question ? { context: question } : {}),
                        };
                    } else {
                        feature = "audio-describe";
                        prompt = {
                            audio: path,
                            text: question || "Describe this audio.",
                            userPrompt: question,
                        };
                    }
                } else if (modality === "image") {
                    feature = "image-describe";
                    prompt = {
                        image: path,
                        text: question || "Describe this image in detail.",
                        userPrompt: question,
                    };
                } else {
                    return {
                        ok: false,
                        error: `${args.ref} is not a video/audio/image`,
                    };
                }
                return compact(
                    await describeViaSlot(
                        env,
                        pid,
                        feature,
                        prompt,
                        args.pluginId,
                        args.user_confirmed,
                    ),
                );
            },
        }),
        tool({
            name: "tongflow_plugins_list",
            description:
                "Installed TongFlow plugins (id, name, ABI slots they implement, required env keys, the path of the plugin's own README, and its source repo) and the official plugins that can be installed, each with its repo. " +
                "A plugin's README is written by whoever wrote the plugin: which models it offers and which is the default, what each env key does, resolutions and aspect ratios it accepts, and its quirks. For an INSTALLED plugin read the local `readme` — it is the clone's own file, costs nothing and is already trusted, since that plugin's code runs on this machine. " +
                "For an official plugin that is NOT installed there is no local file: fetch its README at <repo>/blob/main/README.md (raw: replace github.com with raw.githubusercontent.com and drop /blob) to see what it does before suggesting the user install it. Never recommend an install from the id alone.",
            parameters: {},
            async execute() {
                const { registry, meta } = await api.registry();
                const OFFICIAL_PLUGINS = await studio.registry.officialIds();
                const installed = await Promise.all(
                    Object.entries(registry.plugins).map(async ([id, p]) => ({
                        id,
                        name: (p as { name?: string }).name ?? id,
                        slots: Object.keys(
                            (
                                p as {
                                    methodsByNodeSlot: Record<string, unknown>;
                                }
                            ).methodsByNodeSlot,
                        ),
                        env: (meta[id]?.env ?? []).map(
                            (e) => `${e.key}${e.required ? "*" : ""}`,
                        ),
                        // The path only; the file is read on demand, never
                        // pulled into the catalog. Together the installed
                        // READMEs run to thousands of lines.
                        ...(await pluginReadme(studio.paths.plugins, id)),
                        repo: browsableRepo(studio.registry.gitUrlFor(id)),
                    })),
                );
                return compact({
                    installed,
                    // Not installed: no local README, so the repo is the only
                    // way to find out what it does before suggesting an install.
                    official: OFFICIAL_PLUGINS.filter(
                        (id) => !registry.plugins[id],
                    ).map((id) => ({
                        id,
                        repo: browsableRepo(studio.registry.gitUrlFor(id)),
                    })),
                    errors: registry.errors ?? [],
                });
            },
        }),
        tool({
            name: "tongflow_plugins_install",
            description:
                "Install a TongFlow plugin by official id (e.g. tongflow-api-gemini, tongflow-modal-qwen38) or git URL. Plugins run in their own Python env; API keys go into the tongflow settings.",
            parameters: { idOrUrl: { type: "string", required: true } },
            async execute(args) {
                const r = await api.installPlugin(args.idOrUrl);
                const { meta } = await api.registry();
                return compact({ ...r, env: meta[r.id]?.env ?? [] });
            },
        }),
        tool({
            name: "tongflow_plugins_uninstall",
            description: "Remove an installed TongFlow plugin.",
            parameters: { id: { type: "string", required: true } },
            async execute(args) {
                await api.uninstallPlugin(args.id);
                return { ok: true };
            },
        }),
    ];
}

/** Absent means "assume it takes images": guessing the other way would spend a plugin run on every look. */
async function takesImages(call: ToolCall): Promise<boolean> {
    return call.takesImages ? call.takesImages() : true;
}

async function resolveToFile(
    env: ToolEnv,
    projectId: string,
    ref: string,
): Promise<string> {
    return env.api.filePath(projectId, ref);
}

async function ffprobe(path: string): Promise<Json> {
    const { stdout } = await execFile("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels",
        "-of",
        "json",
        path,
    ]);
    const parsed = JSON.parse(stdout) as {
        format?: { duration?: string };
        streams?: Record<string, unknown>[];
    };
    return compact({
        duration: parsed.format?.duration
            ? Number(Number(parsed.format.duration).toFixed(2))
            : undefined,
        streams: (parsed.streams ?? []).map((s) =>
            Object.fromEntries(
                Object.entries(s).filter(([, v]) => v !== undefined),
            ),
        ),
    });
}

/** Sample `n` frames evenly across the video and tile them into one JPEG. */
async function contactSheet(
    path: string,
    n: number,
    tmpDir: string,
): Promise<string> {
    const cols = n <= 4 ? 2 : n <= 9 ? 3 : 4;
    const rows = Math.ceil(n / cols);
    const out = join(
        tmpDir,
        `sheet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`,
    );
    const probe = (await ffprobe(path)) as { duration?: number };
    const duration = probe.duration && probe.duration > 0 ? probe.duration : 1;
    const fps = n / duration;
    await execFile("ffmpeg", [
        "-v",
        "error",
        "-y",
        "-i",
        path,
        "-vf",
        `fps=${fps},scale=480:-2,tile=${cols}x${rows}`,
        "-frames:v",
        "1",
        "-q:v",
        "4",
        out,
    ]);
    return out;
}
