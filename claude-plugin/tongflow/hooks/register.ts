import type { Register } from "claude-code";

/**
 * The studio's billing checkpoint, held by the host instead of by the model.
 *
 * `tongflow_workflow_run` and `tongflow_perceive` refuse a paid plugin until
 * the call carries `user_confirmed: true`, and the model is told to set it
 * only after the user said yes. That is a promise the model keeps; this makes
 * it a dialog the user answers: a call that carries the flag is always put to
 * the permission prompt, even when the tool is allow-listed.
 */

/** The two studio tools that spend the user's money, under any MCP server prefix. */
const PAID = /__tongflow_(workflow_run|perceive)$/;
const RUN = /__tongflow_workflow_run$/;

/** What the call is about, for the dialog and the status line. */
function target(input: unknown): string {
    const { workflow, ref } = (input ?? {}) as Record<string, unknown>;
    if (typeof workflow === "string") return workflow;
    if (typeof ref === "string") return ref;
    return "this call";
}

export const register: Register = (on) => {
    on("tool.check", { tool: PAID }, async (_$, e, next) => {
        const verdict = await next(e);
        const input = (e.input ?? {}) as Record<string, unknown>;
        // An unconfirmed call spends nothing (the studio answers
        // needs_confirmation), and a deny beneath stays a deny.
        if (input.user_confirmed !== true || verdict.decision !== "allow")
            return verdict;
        return {
            decision: "ask",
            reason: `TongFlow: ${target(input)} runs a paid plugin (an API key or Modal GPU time) and bills you.`,
        };
    });

    on("tool.call", { tool: RUN }, async ($, e, next) => {
        $.ui.status(`TongFlow: running ${target(e)}`);
        try {
            return await next(e);
        } finally {
            $.ui.status(undefined);
        }
    });
};
