/**
 * Per-session activation. The plugin stays dormant for ordinary sessions:
 * its tools, prompt section and skills are registered into an agent's own
 * scoped context only when that session is a *studio session*: its first
 * user message starts with `@tongflow`. Everything else (HTTP routes for the
 * UI) is global and cheap.
 */
import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type {} from "@deepseek-ai/dsh-skill";
import type {} from "@deepseek-ai/dsh-system-prompt";
import type { Studio, ToolEnv } from "tongflow-studio";
import { registerSkills } from "./skills/provider.ts";
import { registerTools } from "./tools.ts";

export const TRIGGER = "@tongflow";

export function isTriggerText(text: string | undefined): boolean {
    return (
        typeof text === "string" &&
        text.trimStart().toLowerCase().startsWith(TRIGGER)
    );
}

function firstText(
    content: readonly unknown[] | undefined,
): string | undefined {
    for (const b of content ?? []) {
        const block = b as { type?: string; text?: string };
        if (block?.type === "text" && typeof block.text === "string")
            return block.text;
    }
    return undefined;
}

/** First user message already in the durable log (restored / continued sessions). */
function firstLoggedUserText(agent: Agent): string | undefined {
    for (const e of agent.session.snapshotEvents() as readonly {
        type: string;
        data?: unknown;
    }[]) {
        if (e.type === "user/message") {
            const msg = e.data as { content?: readonly unknown[] } | undefined;
            return firstText(msg?.content);
        }
    }
    return undefined;
}

export interface ActivationOptions {
    studio: Studio;
    env: ToolEnv;
    systemSection: string;
}

/**
 * Wire the activation waterfall. Returns nothing; registrations ride the
 * agent's scoped context and unwind when the agent is disposed.
 */
export function installActivation(
    ctx: Context,
    options: ActivationOptions,
): void {
    const activated = new WeakSet<Agent>();
    const decided = new WeakSet<Agent>();

    const activate = (agent: Agent) => {
        if (activated.has(agent)) return;
        activated.add(agent);
        const actx = agent.ctx;
        registerTools(actx, options.env);
        actx.inject(["systemPrompt"], (pctx) => {
            pctx.effect(
                () =>
                    pctx.systemPrompt.section({
                        name: "tool:tongflow",
                        order: 150,
                        text: options.systemSection,
                    }),
                "dsh-tongflow: system prompt section (agent scope)",
            );
        });
        actx.inject(["skills"], (sctx) => registerSkills(sctx));
        options.studio.log(
            `dsh-tongflow: studio mode on for session ${agent.id}`,
        );
    };

    const isStudioSession = (
        agent: Agent,
        incoming: readonly { content?: readonly unknown[] }[],
    ): boolean => {
        const logged = firstLoggedUserText(agent);
        if (logged !== undefined) return isTriggerText(logged);
        return isTriggerText(firstText(incoming[0]?.content));
    };

    // Decide once, on the first step of an agent (before the model request assembles tools).
    ctx.on("agent/pre-step", async (payload, next) => {
        const agent = payload.agent;
        if (!decided.has(agent)) {
            let studio = false;
            try {
                studio = isStudioSession(agent, payload.messages);
            } catch {
                studio = false;
            }
            if (studio) {
                decided.add(agent);
                activate(agent);
            } else if (
                payload.messages.length > 0 ||
                firstLoggedUserText(agent) !== undefined
            ) {
                // A first message exists and did not trigger: this session stays plain.
                decided.add(agent);
            }
        }
        return next();
    });
}
