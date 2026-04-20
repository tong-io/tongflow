import { NextResponse } from "next/server";
import {
    getAllFeatures,
    getFeatureRegistryAliases,
} from "@/lib/feature-registry.server";

/**
 * GET /api/feature/list
 * 获取功能列表（公开接口，不需要认证）
 */
export async function GET() {
    return NextResponse.json({
        features: getAllFeatures(),
        aliases: getFeatureRegistryAliases(),
    });
}
