import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

let db: BetterSQLite3Database<typeof schema> | null = null;

export async function getDb() {
    if (!db) {
        const dbDir = path.resolve(process.cwd(), "data");
        mkdirSync(dbDir, { recursive: true });

        const dbPath = path.join(dbDir, "tongflow.db");
        const sqlite = new Database(dbPath);
        sqlite.pragma("journal_mode = WAL");
        db = drizzle(sqlite, { schema });
    }
    return db;
}

export * from "./schema";
