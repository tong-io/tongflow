/**
 * Validates config/features.default.json (and optional second path) against Zod.
 * Usage: pnpm exec tsx scripts/validate-features.ts [path/to/features.json]
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateFeatureRegistryBundle } from "../src/lib/feature-registry-schema";

function main() {
    const arg = process.argv[2];
    const path = arg
        ? join(process.cwd(), arg)
        : join(process.cwd(), "config/features.default.json");

    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    validateFeatureRegistryBundle(raw);
    console.log(`OK: ${path}`);
}

main();
