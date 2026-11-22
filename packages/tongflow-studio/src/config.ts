/** Studio configuration: a plain object every host fills in its own way (dsh's cordis.yml row, the CLI's env). */
import { DEFAULT_TONGFLOW_SDK_VERSION } from "./engine/bootstrap.ts";
import { OFFICIAL_ORG } from "./engine/registry.ts";
import { DEFAULT_EDGE_MODEL_BASE } from "./http/plugin-files.ts";

export interface StudioConfig {
    /** Studio data root (projects, venv, plugins, data); see `resolveStudioRoot` for the default. */
    studioRoot?: string;
    /** Python ≥ 3.10 used to create the studio venv; auto-detected when empty. */
    pythonPath?: string;
    /** pip requirement installed into the studio venv (e.g. `tongflow==1.1.1` or `-e /path/to/sdk`). */
    sdkSpec: string;
    /** Git organisation official plugins are cloned from. */
    pluginOrg: string;
    /** Plugin id → git URL overrides (community / private plugins). */
    pluginGitUrls: Record<string, string>;
    /** Environment passed to every plugin process (API keys, Modal tokens). Prefer credentials over literal values. */
    env: Record<string, string>;
    /** Upper bound on simultaneously running workflows. */
    maxConcurrentRuns: number;
    /** URL prefix the studio's HTTP routes mount under. */
    httpPrefix: string;
    /** UI locale for the embedded canvas (en / zh / ja / ko). */
    locale: string;
    /** Clone every official plugin at start so the canvas offers the full catalog (shallow clones; keys / deploys only at run time). */
    autoInstallOfficial: boolean;
    /**
     * Where browser edge plugins download model weights from (`?modelBase=`
     * of the plugin entry). Default `$TONGFLOW_EDGE_MODEL_BASE`, else the
     * public base {@link DEFAULT_EDGE_MODEL_BASE}.
     */
    edgeModelBase?: string;
    /**
     * Serve the Studio page cross-origin isolated (COOP / COEP), so edge
     * plugins run multi-threaded wasm. Default `$TONGFLOW_CROSS_ORIGIN_ISOLATION`
     * (`1` / `true`), else off. Only the studio's own web server applies it.
     */
    crossOriginIsolation?: boolean;
}

/** The model base edge plugins are pointed at. */
export function edgeModelBase(
    config: Pick<StudioConfig, "edgeModelBase">,
): string {
    return (
        config.edgeModelBase?.trim() ||
        process.env.TONGFLOW_EDGE_MODEL_BASE?.trim() ||
        DEFAULT_EDGE_MODEL_BASE
    );
}

/** Whether the studio page is served with COOP / COEP. */
export function crossOriginIsolation(
    config: Pick<StudioConfig, "crossOriginIsolation">,
): boolean {
    if (config.crossOriginIsolation !== undefined)
        return config.crossOriginIsolation;
    return /^(1|true|yes|on)$/i.test(
        process.env.TONGFLOW_CROSS_ORIGIN_ISOLATION?.trim() ?? "",
    );
}

/** A complete config: the defaults with `overrides` on top. */
export function studioConfig(
    overrides: Partial<StudioConfig> = {},
): StudioConfig {
    return {
        sdkSpec: `tongflow==${DEFAULT_TONGFLOW_SDK_VERSION}`,
        pluginOrg: OFFICIAL_ORG,
        pluginGitUrls: {},
        env: {},
        maxConcurrentRuns: 2,
        httpPrefix: "/tongflow",
        locale: "en",
        autoInstallOfficial: true,
        ...overrides,
    };
}
