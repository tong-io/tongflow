import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The Claude Code plugin (claude-plugin/tongflow) is installed as a copy of
 * its folder, so it carries its own copy of the studio skill and names the
 * MCP server by an exact npm version. Both are derived facts; these checks
 * fail when one falls behind its source.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const plugin = join(root, "claude-plugin/tongflow");
const skills = join(root, "packages/dsh-tongflow/skills");
const read = (path: string) => readFileSync(path, "utf8");
const body = (text: string) =>
    text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");

const STALE = "run `node scripts/sync-claude-plugin.mjs`";

describe("claude-plugin/tongflow", () => {
    it("carries the studio skill as written in packages/dsh-tongflow/skills", () => {
        expect(
            body(read(join(plugin, "skills/tongflow-studio/SKILL.md"))),
            STALE,
        ).toBe(body(read(join(skills, "tongflow-studio.md"))));
    });

    it("carries every method reference, unchanged", () => {
        const target = join(plugin, "skills/tongflow-studio/references");
        const names = readdirSync(join(skills, "references")).sort();
        expect(readdirSync(target).sort(), STALE).toEqual(names);
        for (const name of names)
            expect(read(join(target, name)), STALE).toBe(
                read(join(skills, "references", name)),
            );
    });

    it("starts the MCP server at this package's version", () => {
        const { version } = JSON.parse(
            read(join(root, "packages/tongflow-studio/package.json")),
        );
        const { mcpServers } = JSON.parse(read(join(plugin, ".mcp.json")));
        expect(mcpServers.studio.args).toContain(`tongflow-studio@${version}`);
    });
});
