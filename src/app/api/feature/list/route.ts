import { NextResponse } from "next/server";
import {
    getAllFeatures,
    getFeatureRegistryAliases,
} from "@/lib/plugins/feature-registry.server";

/**
 * GET /api/feature/list
 * Retrieve the feature list (public endpoint, no authentication required)
 */
export async function GET() {
    return NextResponse.json({
        features: getAllFeatures(),
        aliases: getFeatureRegistryAliases(),
    });
}
