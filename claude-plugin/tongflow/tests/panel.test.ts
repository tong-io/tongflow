import type { HttpResponse, On } from "claude-code";
import { expect, test } from "claude-code/testing";

/**
 * The panel is a view of the studio, read over the studio's own HTTP routes.
 * These tests stand a studio up beneath the plugin — its MCP server, which
 * hands out the page link, and the routes behind it — and check what the
 * panel draws from it and where its links lead.
 */

const TREE = {
    "smoke-plain": [
        {
            key: "hero",
            label: "hero",
            kind: "folder",
            children: [
                {
                    key: "hero/hero_shot.tongflow.json",
                    label: "hero_shot",
                    kind: "workflow",
                    children: [
                        {
                            key: "hero/hero_shot.01.jpg",
                            label: "01.jpg",
                            kind: "output",
                        },
                    ],
                },
            ],
        },
    ],
    mv: [{ key: "plan.md", label: "plan.md", kind: "file" }],
} as const;

type Studio = { followed: string | null; isConnected: boolean };

/**
 * A studio with two projects, standing beneath the plugin. `followed` is the
 * project its agent works in; `isConnected` whether its MCP server is up.
 */
function studio(on: On): Studio {
    const state: Studio = { followed: null, isConnected: true };
    const answer = (
        status: number,
        body: unknown,
    ): { value: HttpResponse } => ({
        value: {
            status,
            ok: status === 200,
            headers: {},
            text: JSON.stringify(body),
        },
    });
    on("mcp.connect", () => ({
        value: state.isConnected
            ? { isConnected: true, server: "plugin:tongflow:studio" }
            : {
                  isConnected: false,
                  reason: "failed" as never,
                  message: "not running",
              },
    }));
    on("mcp.call", () => ({
        value: {
            isError: false,
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        url: "http://127.0.0.1:4555/?token=tok&session=s1",
                    }),
                },
            ],
        },
    }));
    on("http.fetch", (_$, e) => {
        const path = new URL(e.url).pathname.replace("/tongflow", "");
        if (e.init?.headers?.authorization !== "Bearer tok")
            return answer(401, {});
        if (path === "/projects")
            return answer(200, [
                { id: "smoke-plain", title: "Smoke Plain" },
                { id: "mv", title: "MV" },
            ]);
        if (path === "/session/s1/project")
            return answer(200, { project: state.followed });
        const tree = /^\/p\/([^/]+)\/tree$/.exec(path);
        if (tree) return answer(200, TREE[tree[1] as keyof typeof TREE]);
        if (/\/runs$/.test(path)) return answer(200, [{ status: "running" }]);
        return answer(404, {});
    });
    on("ui.open", () => ({ value: { isPlaced: true } }));
    return state;
}

const PANE = {
    plugin: "tongflow",
    component: "Pane",
    requestId: "tongflow",
    props: {
        title: "TongFlow",
        isFocused: false,
        bodyColumns: 46,
        placement: "dock",
        scroll: { offset: 0, bodyRows: 30 },
        view: {},
    },
} as const;

/** `/tongflow`, as the person types it; the engine stamps the rest of the input. */
const OPEN = { command: "tongflow", args: "" } as never;

test("the panel lists the projects and the tree of the first one, each file a link to the Studio", async ($, on) => {
    studio(on);
    await $.command.run(OPEN);
    for (const surface of ["terminal", "desktop", "vscode"] as const) {
        const ui = await $.ui.mount({ ...PANE, surface });
        const picker = await ui.find({ type: "Select", key: "project" });
        expect(picker?.props.value).toBe("smoke-plain");
        expect(
            (picker?.props.options as { value: string }[]).map((o) => o.value),
        ).toEqual(["smoke-plain", "mv"]);
        const links = (await ui.findAll({ type: "Link" })).map(
            (l) => l.props.href,
        );
        expect(links).toContain(
            "http://localhost:4555/?token=tok&session=s1&project=smoke-plain&file=hero%2Fhero_shot.tongflow.json",
        );
        expect(links).toContain(
            "http://localhost:4555/?token=tok&session=s1&project=smoke-plain&file=hero%2Fhero_shot.01.jpg",
        );
        // A folder is not a destination.
        expect(links.some((href) => String(href).endsWith("file=hero"))).toBe(
            false,
        );
        expect(await ui.find({ text: /1 running/ })).toBeDefined();
        await ui.unmount();
    }
});

test("picking a project shows its tree, and a refresh does not undo the pick", async ($, on) => {
    studio(on);
    await $.command.run(OPEN);
    const ui = await $.ui.mount({ ...PANE, surface: "desktop" });
    await ui.select({ key: "project", value: "mv" });
    expect(await ui.find({ type: "Link", text: "plan.md" })).toBeDefined();
    await ui.press({ key: "refresh" });
    expect(
        (await ui.find({ type: "Select", key: "project" }))?.props.value,
    ).toBe("mv");
    await ui.unmount();
});

test("the panel follows the agent when its project changes", async ($, on) => {
    const state = studio(on);
    on("tool.call", () => ({ result: {} }) as never);
    await $.command.run(OPEN);
    const ui = await $.ui.mount({ ...PANE, surface: "desktop" });
    state.followed = "mv";
    await $.tool.call({
        tool: "mcp__plugin_tongflow_studio__tongflow_project_open",
        project: "mv",
    } as never);
    expect(
        (await ui.find({ type: "Select", key: "project" }))?.props.value,
    ).toBe("mv");
    await ui.unmount();
});

test("a studio that cannot be reached is said, not thrown", async ($, on) => {
    studio(on).isConnected = false;
    await $.command.run(OPEN);
    const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
    expect(await ui.find({ text: /not connected/ })).toBeDefined();
    await ui.unmount();
});
