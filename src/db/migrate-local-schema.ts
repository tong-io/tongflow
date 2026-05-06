import type Database from "better-sqlite3";

const LOCAL_SCHEMA_VERSION = 1;

type TableInfoRow = { name: string };

export function tableExists(db: Database.Database, name: string): boolean {
    const row = db
        .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        )
        .get(name) as { name: string } | undefined;
    return !!row;
}

function tableHasColumn(
    db: Database.Database,
    table: string,
    column: string,
): boolean {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as TableInfoRow[];
    return rows.some((r) => r.name === column);
}

/**
 * Upgrade legacy SQLite DBs (multi-user / share columns) to local-first schema.
 * Safe no-op if already migrated or DB is empty.
 */
export function runLocalSchemaMigrations(db: Database.Database): void {
    const current = Number(
        (db.prepare("PRAGMA user_version").get() as { user_version: number })
            .user_version,
    );
    if (current >= LOCAL_SCHEMA_VERSION) return;

    if (!tableExists(db, "workflows")) {
        db.pragma(`user_version = ${LOCAL_SCHEMA_VERSION}`);
        return;
    }

    // New schema has no user_id on workflows
    if (!tableHasColumn(db, "workflows", "user_id")) {
        db.pragma(`user_version = ${LOCAL_SCHEMA_VERSION}`);
        return;
    }

    db.exec("PRAGMA foreign_keys=OFF");
    db.exec("BEGIN");
    try {
        if (tableHasColumn(db, "tasks", "share_id")) {
            db.exec("ALTER TABLE tasks DROP COLUMN share_id");
        }
        if (tableHasColumn(db, "materials", "share_id")) {
            db.exec("ALTER TABLE materials DROP COLUMN share_id");
        }
        if (tableExists(db, "shares")) {
            db.exec("DROP TABLE shares");
        }
        if (tableHasColumn(db, "workflows", "current_share_id")) {
            db.exec("ALTER TABLE workflows DROP COLUMN current_share_id");
        }
        if (tableHasColumn(db, "workflows", "is_public")) {
            db.exec("ALTER TABLE workflows DROP COLUMN is_public");
        }
        if (tableHasColumn(db, "workflows", "user_id")) {
            db.exec("ALTER TABLE workflows DROP COLUMN user_id");
        }
        if (tableHasColumn(db, "tasks", "user_id")) {
            db.exec("ALTER TABLE tasks DROP COLUMN user_id");
        }
        if (tableHasColumn(db, "materials", "user_id")) {
            db.exec("ALTER TABLE materials DROP COLUMN user_id");
        }
        if (tableHasColumn(db, "materials", "is_shared")) {
            db.exec("ALTER TABLE materials DROP COLUMN is_shared");
        }
        db.exec(`PRAGMA user_version = ${LOCAL_SCHEMA_VERSION}`);
        db.exec("COMMIT");
    } catch (e) {
        db.exec("ROLLBACK");
        throw e;
    } finally {
        db.exec("PRAGMA foreign_keys=ON");
    }
}
