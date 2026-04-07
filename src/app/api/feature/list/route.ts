import { NextResponse } from "next/server";
import { getAllFeatures } from "@/lib/feature-registry";

/**
 * GET /api/feature/list
 * 获取功能列表（公开接口，不需要认证）
 */
export async function GET() {
    return NextResponse.json({
        features: getAllFeatures(),
    });
}
