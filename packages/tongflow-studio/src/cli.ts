#!/usr/bin/env node
/**
 * `tongflow-studio mcp` — the studio as an MCP server on stdio, for any agent
 * host that speaks MCP. Configuration comes from the environment:
 *
 *   TONGFLOW_STUDIO_ROOT          data root (default ~/.tongflow/studio)
 *   TONGFLOW_STUDIO_PYTHON        Python ≥ 3.10 for the studio venv (default: auto-detected)
 *   TONGFLOW_STUDIO_SDK_SPEC      pip requirement of the TongFlow SDK
 *   TONGFLOW_STUDIO_AUTO_INSTALL  "0" to not clone the official plugins at start
 *   TONGFLOW_STUDIO_LOCALE        language of new projects (default en)
 */
import { join } from "node:path";
import pkg from "../package.json" with { type: "json" };
import { StudioApi } from "./api.ts";
import { type StudioConfig, studioConfig } from "./config.ts";
import { STUDIO_LANGUAGE, STUDIO_RULES } from "./instructions.ts";
import { serveMcp } from "./mcp/server.ts";
import { Studio } from "./studio.ts";

const USAGE = `tongflow-studio ${pkg.version}

Usage:
  tongflow-studio mcp     serve the tongflow_* tools as an MCP server on stdio
`;

/** What the user of an MCP host sees: files on disk, no studio panel; and where plugin API keys go. */
function mcpView(studio: Studio): string {
    return (
        "What the user sees: this host has no studio panel. A project is a plain folder on the user's disk (tongflow_project_list gives each project's root), so point at a result by its path inside the project, e.g. characters/mei/mei_ref.02.png, and never claim a panel or a canvas is showing it. " +
        `Plugin API keys: the user sets them, not you — as environment variables of this server, or in ${join(studio.paths.root, "env.json")} ({ "KEY": "value" }). When a key is missing, name it and say where it goes; never ask for a key in chat and never write one yourself.`
    );
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

async function mcp(): Promise<void> {
    const log = (line: string) => process.stderr.write(`${line}\n`);
    const studio = new Studio({ config: configFromEnv(process.env), log });
    await studio.init();
    await serveMcp({
        env: { studio, api: new StudioApi(studio) },
        name: pkg.name,
        version: pkg.version,
        instructions: `${STUDIO_RULES}\n${mcpView(studio)}\n${STUDIO_LANGUAGE}`,
        log,
    });
}

const command = process.argv[2];
if (command === "mcp") {
    await mcp();
    // Running engines were cancelled as the input closed; do not wait on their pipes.
    process.exit(0);
} else {
    process.stdout.write(USAGE);
    process.exit(command === undefined || command === "--help" ? 0 : 1);
}
