import type Database from "better-sqlite3";

import { canonicalizeNodeSlot } from "@/lib/legacy-slot-map";

export const KEBAB_SLOT_DATA_VERSION = 2;

function tableExists(db: Database.Database, name: string): boolean {
    const row = db
        .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        )
        .get(name) as { name: string } | undefined;
    return !!row;
}

function migrateCanvasNodes(nodes: unknown): boolean {
    if (!Array.isArray(nodes)) return false;
    let changed = false;
    for (const n of nodes) {
        if (!n || typeof n !== "object") continue;
        const node = n as Record<string, unknown>;
        const data = node.data;
        if (!data || typeof data !== "object") continue;
        const d = data as Record<string, unknown>;
        if (typeof d.feature === "string") {
            const c = canonicalizeNodeSlot(d.feature);
            if (c !== d.feature) {
                d.feature = c;
                changed = true;
            }
        }
        if (typeof d.nodeSlot === "string") {
            const c = canonicalizeNodeSlot(d.nodeSlot);
            if (c !== d.nodeSlot) {
                d.nodeSlot = c;
                changed = true;
            }
        }
    }
    return changed;
}

function migrateExecutableWorkflow(root: Record<string, unknown>): boolean {
    let changed = false;
    const executableNodes = root.executableNodes;
    if (Array.isArray(executableNodes)) {
        for (const en of executableNodes) {
            if (!en || typeof en !== "object") continue;
            const row = en as Record<string, unknown>;
            if (typeof row.feature === "string") {
                const c = canonicalizeNodeSlot(row.feature);
                if (c !== row.feature) {
                    row.feature = c;
                    changed = true;
                }
            }
        }
    }
    return changed;
}

function migrateStoredFlowJson(text: string): string | null {
    try {
        const root = JSON.parse(text) as Record<string, unknown>;
        let changed = migrateCanvasNodes(root.nodes);

        const flow = root.flow;
        if (flow && typeof flow === "object") {
            const f = flow as Record<string, unknown>;
            if (migrateCanvasNodes(f.nodes)) changed = true;
        }

        if (migrateExecutableWorkflow(root)) changed = true;

        const orig = root.originalFlow;
        if (orig && typeof orig === "object") {
            const o = orig as Record<string, unknown>;
            if (migrateCanvasNodes(o.nodes)) changed = true;
        }

        return changed ? JSON.stringify(root) : null;
    } catch {
        return null;
    }
}

/**
 * One-shot migration for tasks/workflows saved with pre-kebab `feature` / flow JSON.
 */
export function runKebabSlotDataMigration(db: Database.Database): void {
    const current = Number(
        (db.prepare("PRAGMA user_version").get() as { user_version: number })
            .user_version,
    );
    if (current >= KEBAB_SLOT_DATA_VERSION) return;

    if (!tableExists(db, "tasks") || !tableExists(db, "workflows")) {
        db.exec(`PRAGMA user_version = ${KEBAB_SLOT_DATA_VERSION}`);
        return;
    }

    const taskRows = db
        .prepare("SELECT id, feature, prompt FROM tasks")
        .all() as { id: string; feature: string; prompt: string }[];

    const updTask = db.prepare(
        "UPDATE tasks SET feature = @feature, prompt = @prompt WHERE id = @id",
    );

    for (const row of taskRows) {
        const feature = canonicalizeNodeSlot(row.feature);
        let promptStr = row.prompt;
        try {
            const p = JSON.parse(row.prompt) as Record<string, unknown>;
            if (typeof p.nodeSlot === "string") {
                const ns = canonicalizeNodeSlot(p.nodeSlot);
                if (ns !== p.nodeSlot) {
                    p.nodeSlot = ns;
                    promptStr = JSON.stringify(p);
                }
            }
        } catch {
            /* keep prompt as-is */
        }
        if (feature !== row.feature || promptStr !== row.prompt) {
            updTask.run({ id: row.id, feature, prompt: promptStr });
        }
    }

    const wfRows = db
        .prepare("SELECT id, flow, executable FROM workflows")
        .all() as {
        id: number;
        flow: string;
        executable: string | null;
    }[];

    const updFlowOnly = db.prepare(
        "UPDATE workflows SET flow = @flow WHERE id = @id",
    );
    const updExecutableOnly = db.prepare(
        "UPDATE workflows SET executable = @executable WHERE id = @id",
    );
    const updBoth = db.prepare(
        "UPDATE workflows SET flow = @flow, executable = @executable WHERE id = @id",
    );

    for (const w of wfRows) {
        let flow = w.flow;
        const nf = migrateStoredFlowJson(flow);
        if (nf) flow = nf;

        let executable = w.executable;
        if (executable) {
            const ne = migrateStoredFlowJson(executable);
            if (ne) executable = ne;
        }

        const flowChanged = flow !== w.flow;
        const exeChanged = (executable ?? null) !== (w.executable ?? null);
        if (!flowChanged && !exeChanged) continue;

        if (flowChanged && exeChanged) {
            updBoth.run({
                id: w.id,
                flow,
                executable: executable ?? null,
            });
        } else if (flowChanged) {
            updFlowOnly.run({ id: w.id, flow });
        } else {
            updExecutableOnly.run({
                id: w.id,
                executable: executable ?? null,
            });
        }
    }

    db.exec(`PRAGMA user_version = ${KEBAB_SLOT_DATA_VERSION}`);
}
