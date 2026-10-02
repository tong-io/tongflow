import type { EngineInterface, Register } from "claude-code";
import { atom, read, update } from "claude-code";
import type {
    TongflowPanel,
    TongflowProject,
    TongflowRow,
    TongflowStudio,
} from "../types";

/**
 * TongFlow inside Claude Code, in what its surfaces can draw.
 *
 * The Studio is a web page (a canvas, image and video previews) and no
 * surface here embeds one. So the panel is the part that is plain text: the
 * projects and the folder tree of the one in work. A file or a workflow is a
 * link — the page opens on it only when someone wants to look.
 *
 * And the billing checkpoint: `tongflow_workflow_run` and `tongflow_perceive`
 * refuse a paid plugin until the call carries `user_confirmed: true`, which
 * the model is told to set only after the user said yes. Here that becomes a
 * dialog the user answers: a call carrying the flag is always put to the
 * permission prompt, even when the tool is allow-listed.
 */

const PANE = "tongflow";
/** The studio's tools, under any MCP server prefix. */
const STUDIO = /__tongflow_/;
/** The two that spend the user's money. */
const PAID = /__tongflow_(workflow_run|perceive)$/;
const RUN = /__tongflow_workflow_run$/;
const PAGE = /__tongflow_studio_page$/;

const panel = atom(
    { plugin: "tongflow", key: "panel" } as const,
    {
        projects: [],
        rows: [],
        running: 0,
    } as TongflowPanel,
);
const hasOpened = atom(
    { plugin: "tongflow", key: "hasOpened" } as const,
    false,
);

type TreeNode = {
    key: string;
    label: string;
    kind: TongflowRow["kind"];
    children?: TreeNode[];
};

/** What the call is about, for the dialog and the status line. */
function target(input: unknown): string {
    const { workflow, ref } = (input ?? {}) as Record<string, unknown>;
    if (typeof workflow === "string") return workflow;
    if (typeof ref === "string") return ref;
    return "this call";
}

/** The studio's page for this session: asked of its own MCP server, which hands out the link. */
async function findStudio(
    $: EngineInterface,
): Promise<TongflowStudio | undefined> {
    const link = await $.mcp.connect("studio");
    if (!link.isConnected) return undefined;
    const answer = await $.mcp.call(link.server, "tongflow_studio_page", {});
    const text = answer.content.find((block) => block.type === "text")?.text;
    if (answer.isError || !text) return undefined;
    const url = new URL((JSON.parse(text) as { url: string }).url);
    const token = url.searchParams.get("token");
    if (!token) return undefined;
    return {
        port: url.port,
        token,
        session: url.searchParams.get("session") ?? "",
    };
}

async function get<T>(
    $: EngineInterface,
    studio: TongflowStudio,
    path: string,
): Promise<T> {
    const res = await $.http.fetch(
        `http://127.0.0.1:${studio.port}/tongflow${path}`,
        { headers: { authorization: `Bearer ${studio.token}` } },
    );
    if (!res.ok) throw new Error(`studio answered ${res.status}`);
    return JSON.parse(res.text) as T;
}

function flatten(tree: TreeNode[], depth = 0): TongflowRow[] {
    return tree.flatMap((node) => [
        { key: node.key, label: node.label, kind: node.kind, depth },
        ...flatten(node.children ?? [], depth + 1),
    ]);
}

/**
 * Read the studio again. `pick` is a project the person chose; without one
 * the panel keeps its project, and moves only when the agent's project
 * changes — so a pick is not undone by the next refresh.
 */
async function refresh($: EngineInterface, pick?: string): Promise<void> {
    const now = await read($, panel);
    try {
        const studio = now.studio ?? (await findStudio($));
        if (!studio)
            throw new Error("the studio's MCP server is not connected");
        const projects = (
            await get<TongflowProject[]>($, studio, "/projects")
        ).map(({ id, title }) => ({ id, title }));
        const followed = studio.session
            ? ((
                  await get<{ project: string | null }>(
                      $,
                      studio,
                      `/session/${studio.session}/project`,
                  )
              ).project ?? undefined)
            : undefined;
        const moved = followed !== now.followed ? followed : undefined;
        const wanted = pick ?? moved ?? now.project ?? followed;
        const project = projects.some((p) => p.id === wanted)
            ? wanted
            : projects[0]?.id;
        const rows = project
            ? flatten(await get<TreeNode[]>($, studio, `/p/${project}/tree`))
            : [];
        const running = project
            ? (
                  await get<{ status: string }[]>(
                      $,
                      studio,
                      `/p/${project}/runs`,
                  )
              ).filter((r) => r.status === "running" || r.status === "queued")
                  .length
            : 0;
        await update($, panel, () => ({
            studio,
            projects,
            rows,
            running,
            ...(project ? { project } : {}),
            ...(followed ? { followed } : {}),
        }));
    } catch (error) {
        // A studio that restarted serves on a new port with a new token: drop
        // the old address so the next refresh asks for it again.
        await update($, panel, (p) => ({
            projects: p.projects,
            rows: p.rows,
            running: 0,
            ...(p.project ? { project: p.project } : {}),
            error: error instanceof Error ? error.message : String(error),
        }));
    }
}

/**
 * The Studio page, opened on a project and a file. `localhost`, not the
 * address the server prints: a link drawn here must be https or localhost.
 */
function pageLink(
    studio: TongflowStudio,
    project?: string,
    file?: string,
): string {
    const query = new URLSearchParams({ token: studio.token });
    if (studio.session) query.set("session", studio.session);
    if (project) query.set("project", project);
    if (project && file) query.set("file", file);
    return `http://localhost:${studio.port}/?${query}`;
}

const MARK: Record<TongflowRow["kind"], string> = {
    folder: "▸",
    workflow: "◆",
    output: "└",
    file: "·",
};

export const register: Register = (on) => {
    on("session.start", async ($, e, next) => {
        await $.command.register({
            name: "tongflow",
            description:
                "Show the TongFlow panel: projects and the folder tree of the one in work",
        });
        return next(e);
    });

    on("command.run", { command: "tongflow" }, async ($) => {
        await refresh($);
        await update($, hasOpened, () => true);
        await $.ui.open({ id: PANE, title: "TongFlow", columns: 46 });
        const { projects, project, error } = await read($, panel);
        return {
            text: error
                ? `TongFlow panel: ${error}.`
                : `TongFlow panel opened: ${projects.length} project(s)${project ? `, showing ${project}` : ""}.`,
        };
    });

    // The panel asks the studio for its page link through the same tool the
    // model uses, and a tool call is put to the permission prompt. The link
    // changes nothing and opens on this machine only: always allowed, so
    // opening the panel never raises a dialog.
    on("tool.check", { tool: PAGE }, () => ({ decision: "allow" }));

    on("tool.check", { tool: PAID }, async (_$, e, next) => {
        const verdict = await next(e);
        const input = (e.input ?? {}) as Record<string, unknown>;
        // An unconfirmed call spends nothing (the studio answers
        // needs_confirmation), and a deny beneath stays a deny.
        if (input.user_confirmed !== true || verdict.decision !== "allow")
            return verdict;
        return {
            decision: "ask",
            // The flag says the model holds the user's yes, not what the run
            // costs: only the studio knows which plugins a workflow uses.
            reason: `TongFlow: run ${target(input)}? A paid plugin (an API key or Modal GPU time) bills you.`,
        };
    });

    on("tool.call", { tool: STUDIO }, async ($, e, next) => {
        const isRun = RUN.test(String(e.tool));
        if (isRun) $.ui.status(`TongFlow: running ${target(e)}`);
        try {
            return await next(e);
        } finally {
            if (isRun) $.ui.status(undefined);
            // The call may have made a project, a workflow, an output: show
            // it. The panel is a view; it must never fail the call it follows.
            try {
                await refresh($);
                if (!(await read($, hasOpened))) {
                    await update($, hasOpened, () => true);
                    await $.ui.open({
                        id: PANE,
                        title: "TongFlow",
                        columns: 46,
                    });
                }
            } catch {
                // nothing to show
            }
        }
    });

    on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
        const ui = $.ui.resolve(e);
        const { Box, Text, Button, Link } = ui;
        const Select = "Select" in ui ? ui.Select : undefined;
        const now = await read($, panel);
        const { studio, project } = now;
        // Header, picker, footer and the "more" line take five rows.
        const room = Math.max(3, (e.viewport?.rows ?? 30) - 5);
        const shown = now.rows.slice(0, room);
        const title =
            now.projects.find((p) => p.id === project)?.title ?? project;

        // One line per row: a folder is a heading, anything else a link that
        // opens the Studio page on it. A loop, not a map: these are not React
        // elements, and `key` here is an element's address, not a list key.
        const lines = [];
        for (const row of shown) {
            const lead = `${"  ".repeat(row.depth)}${MARK[row.kind]} `;
            lines.push(
                row.kind === "folder" || !studio ? (
                    <Text dimColor={row.kind === "folder"} wrap="truncate-end">
                        {lead}
                        {row.label}
                    </Text>
                ) : (
                    <Box flexDirection="row">
                        <Text dimColor>{lead}</Text>
                        <Link
                            href={pageLink(studio, project, row.key)}
                            label={row.label}
                        />
                    </Box>
                ),
            );
        }

        return (
            <Box flexDirection="column">
                <Box flexDirection="row" gap={1}>
                    <Text bold>TongFlow</Text>
                    {now.running > 0 && (
                        <Text color="yellow">● {now.running} running</Text>
                    )}
                    {studio && (
                        <Link
                            href={pageLink(studio, project)}
                            label="Studio ↗"
                        />
                    )}
                    <Button
                        key="refresh"
                        plain
                        label="↻"
                        onPress={() => void refresh($)}
                    />
                </Box>
                {now.error && <Text color="red">{now.error}</Text>}
                {Select && now.projects.length > 0 ? (
                    <Select
                        key="project"
                        label="Project"
                        value={project}
                        options={now.projects.map((p) => ({
                            value: p.id,
                            label: `${p.title} · ${p.id}`,
                        }))}
                        onSelect={(value: string) => void refresh($, value)}
                    />
                ) : (
                    <Text dimColor>{title ?? "No project yet."}</Text>
                )}
                {lines}
                {now.rows.length > shown.length && (
                    <Text dimColor>
                        … {now.rows.length - shown.length} more in the Studio
                    </Text>
                )}
                {project && now.rows.length === 0 && !now.error && (
                    <Text dimColor>Empty project.</Text>
                )}
            </Box>
        );
    });
};
