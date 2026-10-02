/** Plugin configuration (cordis.yml row `config`), validated by schemastery at load. */
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import z from "@deepseek-ai/schemastery";
import {
    DEFAULT_TONGFLOW_SDK_VERSION,
    OFFICIAL_ORG,
    type StudioConfig,
} from "tongflow-studio";

/** The studio's own config; `studioRoot` defaults to `<DSH_HOME>/tongflow` here. */
export type Config = StudioConfig;

/** `$DSH_HOME`, else `~/.dsh` (mirrors dsh's own resolution). */
export function resolveDshHome(): string {
    const env = process.env.DSH_HOME;
    return env?.trim() ? resolve(env) : join(homedir(), ".dsh");
}

export const Config: z<Config> = z.object({
    studioRoot: z.string(),
    pythonPath: z.string(),
    sdkSpec: z.string().default(`tongflow==${DEFAULT_TONGFLOW_SDK_VERSION}`),
    pluginOrg: z.string().default(OFFICIAL_ORG),
    pluginGitUrls: z.dict(z.string()).default({}),
    env: z.dict(z.string()).default({}),
    maxConcurrentRuns: z.number().default(2),
    httpPrefix: z.string().default("/tongflow"),
    locale: z.string().default("en"),
    autoInstallOfficial: z.boolean().default(true),
});
