import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const workflows = sqliteTable("workflows", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull().default("default-user"),
    name: text("name").notNull(),
    description: text("description"),
    flow: text("flow").notNull(), // JSON string
    executable: text("executable"), // 可执行工作流 JSON string
    cover: text("cover"), // 代表作图片 URL
    currentShareId: integer("current_share_id"),
    isPublic: integer("is_public", { mode: "boolean" })
        .default(false)
        .notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
        .defaultNow()
        .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
        .defaultNow()
        .$onUpdate(() => new Date())
        .notNull(),
    deleted: integer("deleted", { mode: "boolean" }).default(false).notNull(),
});

export const shares = sqliteTable("shares", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull().default("default-user"),
    workflowId: integer("workflow_id").references(() => workflows.id, {
        onDelete: "set null",
    }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    cover: text("cover"),
    flow: text("flow").notNull(), // JSON string
    execute: text("execute").notNull(), // JSON string
    version: integer("version").default(1).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
        .defaultNow()
        .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
        .defaultNow()
        .$onUpdate(() => new Date())
        .notNull(),
    deleted: integer("deleted", { mode: "boolean" }).default(false).notNull(),
});

export const tasks = sqliteTable("tasks", {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().default("default-user"),
    workflowId: integer("workflow_id").references(() => workflows.id, {
        onDelete: "set null",
    }),
    shareId: integer("share_id").references(() => shares.id, {
        onDelete: "set null",
    }),
    nodeId: text("node_id").notNull(),
    feature: text("feature").notNull(),
    prompt: text("prompt").notNull(), // JSON string
    status: text("status").notNull().default("pending"),
    progress: integer("progress").default(0).notNull(),
    chargedAmount: integer("charged_amount").default(0).notNull(),
    result: text("result"), // JSON string
    error: text("error"),
    createdAt: integer("created_at", { mode: "timestamp" })
        .defaultNow()
        .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
        .defaultNow()
        .$onUpdate(() => new Date())
        .notNull(),
});

export const materials = sqliteTable("materials", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull().default("default-user"),
    taskId: text("task_id"),
    workflowId: integer("workflow_id").references(() => workflows.id, {
        onDelete: "set null",
    }),
    shareId: integer("share_id").references(() => shares.id, {
        onDelete: "set null",
    }),
    name: text("name").notNull(),
    type: text("type").notNull(),
    content: text("content").notNull(), // JSON string
    thumbnail: text("thumbnail"),
    isFavorite: integer("is_favorite", { mode: "boolean" })
        .default(false)
        .notNull(),
    isShared: integer("is_shared", { mode: "boolean" })
        .default(false)
        .notNull(),
    isCover: integer("is_cover", { mode: "boolean" }).default(false).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
        .defaultNow()
        .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
        .defaultNow()
        .$onUpdate(() => new Date())
        .notNull(),
    deleted: integer("deleted", { mode: "boolean" }).default(false).notNull(),
});
