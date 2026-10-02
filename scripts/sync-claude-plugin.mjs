#!/usr/bin/env node
/**
 * Copy the studio skill into the Claude Code plugin.
 *
 * The method is written once, in packages/dsh-tongflow/skills/ (the dsh plugin
 * ships that folder). A Claude Code plugin wants `skills/<name>/SKILL.md` with
 * its own front matter, and is installed as a copy of its folder, so it cannot
 * point outside it: this script writes the copy, and
 * packages/tongflow-studio/test/claude-plugin.test.ts fails when it is stale.
 *
 *   node scripts/sync-claude-plugin.mjs
 */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "packages/dsh-tongflow/skills");
const target = join(root, "claude-plugin/tongflow/skills/tongflow-studio");

const skill = await readFile(join(source, "tongflow-studio.md"), "utf8");
const front = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(skill);
if (!front) throw new Error("tongflow-studio.md lacks front matter");
const field = (name) =>
    new RegExp(`^${name}:\\s*(.*)$`, "m").exec(front[1])?.[1].trim() ?? "";

// Claude Code reads one `description` to decide when to load the skill.
const description = `${field("description")} ${field("whenToUse")}`.trim();

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await writeFile(
    join(target, "SKILL.md"),
    // JSON is YAML: quoting keeps a colon in the text from reading as a key.
    `---\nname: ${field("name")}\ndescription: ${JSON.stringify(description)}\n---\n${skill.slice(front[0].length)}`,
);
await cp(join(source, "references"), join(target, "references"), {
    recursive: true,
});
console.log(`synced ${target}`);
