import { defineConfig } from "drizzle-kit";

export default defineConfig({
    schema: "./src/db/schema.ts",
    out: "./src/drizzle",
    dialect: "sqlite",
    dbCredentials: {
        url: "./data/tongflow.db",
    },
});
