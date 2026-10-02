/**
 * dsh-tongflow — host (Node) half.
 *
 * A Cordis plugin mounted by the dsh Loader. It stands up the Studio (paths,
 * python bootstrap, plugin registry, run manager) and registers, as effects:
 * the tongflow_* agent tools, packaged skills, a short system-prompt section
 * and the HTTP routes the embedded canvas / studio UI talk to.
 */

import { join } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-host-webserver";
import type {} from "@deepseek-ai/dsh-skill";
import type {} from "@deepseek-ai/dsh-system-prompt";
import type {} from "@deepseek-ai/dsh-tools";
import {
    createRouteHandler,
    routePrefix,
    STUDIO_LANGUAGE,
    STUDIO_RULES,
    Studio,
    StudioApi,
} from "tongflow-studio";
import { installActivation } from "./activation.ts";
import { Config, resolveDshHome } from "./config.ts";

export const name = "dsh-tongflow";

/** The tool registry and agent registry are the hard requirements; other seams attach when they mount. */
export const inject = ["tools", "agents"];

export { Config };
export type { Config as TongflowConfig } from "./config.ts";

export function apply(ctx: Context, config: Config): void {
    const log = (line: string) => ctx.logger?.info?.(line);
    const studio = new Studio({
        config: {
            ...config,
            studioRoot:
                config.studioRoot?.trim() || join(resolveDshHome(), "tongflow"),
        },
        log,
    });
    const api = new StudioApi(studio);
    void studio.init().catch((error: unknown) => {
        ctx.logger?.warn?.(
            `dsh-tongflow: studio init failed: ${error instanceof Error ? error.message : String(error)}`,
        );
    });

    // Tools / prompt / skills attach per agent, only for studio sessions
    // (first message starts with "@tongflow", or the cwd is a studio project).
    installActivation(ctx, {
        studio,
        env: { studio, api },
        systemSection: SYSTEM_SECTION,
    });

    ctx.inject(["webServer"], (webCtx) => {
        const handler = createRouteHandler({
            studio,
            api,
            prefix: config.httpPrefix,
        });
        webCtx.effect(
            () =>
                webCtx.webServer.register({
                    kind: "prefix",
                    path: routePrefix(config.httpPrefix),
                    handler,
                }),
            "dsh-tongflow: http routes",
        );
    });
}

const SYSTEM_SECTION = `${STUDIO_RULES} Load the "tongflow-studio" skill for the full method.
What the user sees (say this, never invent panels): the Studio panel next to the chat shows a project selector, the project's folder tree (a workflow row expands to the files it generated) and a preview area — clicking any file previews or edits it, clicking a .tongflow.json opens it on the canvas. To point at a result say e.g. "在右侧面板:characters → mei → mei_ref.02.png" (the panel follows the project you work in). Never give absolute file paths as the way to view something.
${STUDIO_LANGUAGE}`;
