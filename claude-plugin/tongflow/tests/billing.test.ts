import { expect, test } from "claude-code/testing";

const RUN = "mcp__plugin_tongflow_studio__tongflow_workflow_run";
const PERCEIVE = "mcp__plugin_tongflow_studio__tongflow_perceive";

test("a confirmed run is put to the user even when the engine would allow it", async ($, on) => {
    on("tool.check", () => ({ decision: "allow" }));
    const verdict = await $.tool.check({
        tool: RUN,
        input: { workflow: "characters/mei/mei_ref", user_confirmed: true },
    });
    expect(verdict.decision).toBe("ask");
    expect(verdict.reason).toContain("characters/mei/mei_ref");
});

test("a confirmed perceive is put to the user too", async ($, on) => {
    on("tool.check", () => ({ decision: "allow" }));
    const verdict = await $.tool.check({
        tool: PERCEIVE,
        input: { ref: "ep01/sh010/i2v.01.mp4", user_confirmed: true },
    });
    expect(verdict.decision).toBe("ask");
});

test("an unconfirmed call keeps the engine's verdict: it spends nothing", async ($, on) => {
    on("tool.check", () => ({ decision: "allow" }));
    const verdict = await $.tool.check({
        tool: RUN,
        input: { workflow: "characters/mei/mei_ref" },
    });
    expect(verdict.decision).toBe("allow");
});

test("a deny beneath stays a deny", async ($, on) => {
    on("tool.check", () => ({ decision: "deny", reason: "blocked by rule" }));
    const verdict = await $.tool.check({
        tool: RUN,
        input: { workflow: "a/b", user_confirmed: true },
    });
    expect(verdict.decision).toBe("deny");
});

test("the studio's other tools are left alone", async ($, on) => {
    on("tool.check", () => ({ decision: "allow" }));
    const verdict = await $.tool.check({
        tool: "mcp__plugin_tongflow_studio__tongflow_project_list",
        input: { user_confirmed: true },
    });
    expect(verdict.decision).toBe("allow");
});

test("the page link is always allowed: opening the panel never raises a dialog", async ($, on) => {
    on("tool.check", () => ({ decision: "ask" }));
    const verdict = await $.tool.check({
        tool: "mcp__plugin_tongflow_studio__tongflow_studio_page",
        input: {},
    });
    expect(verdict.decision).toBe("allow");
});
