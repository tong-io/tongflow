#!/usr/bin/env node
/**
 * `tongflow-studio mcp`   — the studio as an MCP server on stdio, for any
 *                           agent host that speaks MCP; it also serves the
 *                           Studio web page on a loopback port.
 * `tongflow-studio serve` — the Studio web page alone.
 *
 * Configuration comes from the environment:
 *
 *   TONGFLOW_STUDIO_ROOT          data root (default ~/.tongflow/studio)
 *   TONGFLOW_STUDIO_PYTHON        Python ≥ 3.10 for the studio venv (default: auto-detected)
 *   TONGFLOW_STUDIO_SDK_SPEC      pip requirement of the TongFlow SDK
 *   TONGFLOW_STUDIO_AUTO_INSTALL  "0" to not clone the official plugins at start
 *   TONGFLOW_STUDIO_LOCALE        language of new projects (default en)
 *   TONGFLOW_STUDIO_PORT          port of the Studio web page (default: a free one)
 *   TONGFLOW_STUDIO_HTTP          "0" for `mcp` without the Studio web page
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "../package.json" with { type: "json" };
import { StudioApi } from "./api.ts";
import { type StudioConfig, studioConfig } from "./config.ts";
import { STUDIO_LANGUAGE, STUDIO_RULES } from "./instructions.ts";
import { mcpSessionId, serveMcp } from "./mcp/server.ts";
import { serveStudio } from "./serve.ts";
import { Studio } from "./studio.ts";
import { type ToolSpec, tool } from "./tools/spec.ts";
import type { ToolEnv } from "./tools/support.ts";

const USAGE = `tongflow-studio ${pkg.version}

Usage:
  tongflow-studio mcp     serve the tongflow_* tools as an MCP server on stdio (and the Studio web page)
  tongflow-studio serve   serve the Studio web page and print its link
`;

/** Where the built Studio page sits: `web/` next to this file once built. */
const WEB_DIR = fileURLToPath(new URL("./web", import.meta.url));

/** What the user of an MCP host sees, and where plugin API keys go. Kept short: hosts cap a server's instructions. */
function mcpView(studio: Studio, hasPage: boolean): string {
    const keys = `Plugin API keys are the user's to set, never yours and never in chat: ${hasPage ? "in the Studio page's Plugins & keys dialog, or " : ""}as environment variables of this server, or in ${join(studio.paths.root, "env.json")}.`;
    return hasPage
        ? `What the user sees: this host has no studio panel; the Studio is a web page (folder tree, previews, the workflow canvas, runs, plugin keys) whose link tongflow_studio_page returns — give it when the user wants to look at results or edit a workflow, and otherwise point at files by their path inside the project. ${keys}`
        : `What the user sees: this host has no studio panel. A project is a plain folder on the user's disk (tongflow_project_list gives each root): point at a result by its path inside the project, and never claim a panel or a canvas is showing it. ${keys}`;
}

/** The one tool that belongs to this server rather than to the studio: the link to its own web page. */
function pageTool(url: string): ToolSpec {
    return tool({
        name: "tongflow_studio_page",
        description:
            "The Studio web page of this studio: the project's folder tree with previews, the workflow canvas (edit and run a node by hand), the runs drawer, and the Plugins & keys dialog. Returns its link, which follows the project you are working in. " +
            "Give the link to the user when they want to look at results, edit a workflow on the canvas, upload files or set an API key. The link opens on this machine only and carries an access token: pass it on as it is.",
        parameters: {},
        async execute() {
            return { url };
        },
    });
}

function configFromEnv(env: NodeJS.ProcessEnv): StudioConfig {
    const set = (value: string | undefined) => value?.trim() || undefined;
    const overrides: Partial<StudioConfig> = {};
    const root = set(env.TONGFLOW_STUDIO_ROOT);
    if (root) overrides.studioRoot = root;
    const python = set(env.TONGFLOW_STUDIO_PYTHON);
    if (python) overrides.pythonPath = python;
    const sdkSpec = set(env.TONGFLOW_STUDIO_SDK_SPEC);
    if (sdkSpec) overrides.sdkSpec = sdkSpec;
    const locale = set(env.TONGFLOW_STUDIO_LOCALE);
    if (locale) overrides.locale = locale;
    if (set(env.TONGFLOW_STUDIO_AUTO_INSTALL) === "0")
        overrides.autoInstallOfficial = false;
    return studioConfig(overrides);
}

function start(): {
    studio: Studio;
    env: ToolEnv;
    log: (line: string) => void;
} {
    const log = (line: string) => process.stderr.write(`${line}\n`);
    const studio = new Studio({ config: configFromEnv(process.env), log });
    return { studio, env: { studio, api: new StudioApi(studio) }, log };
}

function portFromEnv(): number {
    const port = Number(process.env.TONGFLOW_STUDIO_PORT);
    return Number.isInteger(port) && port > 0 ? port : 0;
}

async function mcp(): Promise<void> {
    const { studio, env, log } = start();
    await studio.init();
    const sessionId = mcpSessionId();
    // The page is a convenience: the tools work without it, so a port that
    // cannot be bound is reported and the server carries on.
    const page =
        process.env.TONGFLOW_STUDIO_HTTP === "0"
            ? undefined
            : await serveStudio({ env, webDir: WEB_DIR, port: portFromEnv() })
                  .then((server) => server.url({ session: sessionId }))
                  .catch((error: unknown) => {
                      log(
                          `tongflow-studio: Studio page not served: ${error instanceof Error ? error.message : String(error)}`,
                      );
                      return undefined;
                  });
    await serveMcp({
        env,
        name: pkg.name,
        version: pkg.version,
        instructions: `${STUDIO_RULES}\n${mcpView(studio, page !== undefined)}\n${STUDIO_LANGUAGE}`,
        sessionId,
        ...(page ? { extraTools: [pageTool(page)] } : {}),
        log,
    });
}

async function serve(): Promise<void> {
    const { studio, env } = start();
    await studio.init();
    const server = await serveStudio({
        env,
        webDir: WEB_DIR,
        port: portFromEnv(),
    });
    process.stdout.write(`TongFlow Studio: ${server.url()}\n`);
}

const command = process.argv[2];
if (command === "mcp") {
    await mcp();
    // Running engines were cancelled as the input closed; do not wait on their pipes.
    process.exit(0);
} else if (command === "serve") {
    // Runs until interrupted: the listening server keeps the process alive.
    await serve();
} else {
    process.stdout.write(USAGE);
    process.exit(command === undefined || command === "--help" ? 0 : 1);
}
