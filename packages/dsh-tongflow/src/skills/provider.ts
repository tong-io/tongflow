/**
 * Packaged skills: the studio working method, shipped as markdown under
 * `<package>/skills/`.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Context } from "@deepseek-ai/cordis";
import type {
    SkillCandidate,
    SkillDefinition,
    SkillProvider,
} from "@deepseek-ai/dsh-skill";

const PROVIDER = "dsh-tongflow";
/** Below user/project skills (100–500) so a project can override the packaged method. */
const RANK = 620;

async function isDir(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

async function skillsRoot(): Promise<string> {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const candidate of [
        join(here, "..", "skills"),
        join(here, "..", "..", "skills"),
    ]) {
        if (await isDir(candidate)) return candidate;
    }
    throw new Error("dsh-tongflow: skills directory not found");
}

interface Front {
    name: string;
    description: string;
    whenToUse?: string;
}

/** Minimal front matter parser: `--- key: value ... ---` at the top of the file. */
function parseFront(text: string): { front: Front; body: string } {
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
    if (!m) throw new Error("skill file lacks front matter");
    const front: Record<string, string> = {};
    for (const line of m[1].split(/\r?\n/)) {
        const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
        if (kv) front[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
    }
    if (!front.name || !front.description)
        throw new Error("skill front matter needs name and description");
    return {
        front: {
            name: front.name,
            description: front.description,
            ...(front.whenToUse ? { whenToUse: front.whenToUse } : {}),
        },
        body: text.slice(m[0].length),
    };
}

async function candidates(): Promise<SkillCandidate[]> {
    const root = await skillsRoot();
    const out: SkillCandidate[] = [];
    for (const name of (await readdir(root))
        .filter((n) => n.endsWith(".md"))
        .sort()) {
        const path = join(root, name);
        const { front } = parseFront(await readFile(path, "utf8"));
        out.push({
            name: front.name,
            description: front.description,
            ...(front.whenToUse ? { whenToUse: front.whenToUse } : {}),
            invocation: { modelInvocable: true, userInvocable: true },
            source: "bundled",
            provider: PROVIDER,
            resourceBase: { kind: "directory", path: root },
            rank: RANK,
            locator: path,
            path,
        });
    }
    return out;
}

export function registerSkills(ctx: Context): void {
    const provider: SkillProvider = {
        name: PROVIDER,
        list: () => candidates(),
        async get(candidate): Promise<SkillDefinition | undefined> {
            const path = candidate.locator;
            if (typeof path !== "string") return undefined;
            const { front, body } = parseFront(await readFile(path, "utf8"));
            return {
                ...candidate,
                name: front.name,
                description: front.description,
                content: body,
            };
        },
    };
    ctx.effect(
        () => ctx.skills.registerProvider(() => provider),
        "dsh-tongflow: skills",
    );
}
