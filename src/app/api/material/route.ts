import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-stub";
import { getDb } from "@/db";
import { materials, tasks } from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";

export type MaterialType =
    | "image"
    | "video"
    | "audio"
    | "text"
    | "file"
    | "model";

interface CreateMaterialRequest {
    name: string;
    type: MaterialType;
    content: Record<string, unknown>; // { fileKeys: string[] } or { texts: string[] }
    thumbnail?: string;
}

/**
 * GET /api/material
 * 获取用户的素材列表
 * Query params: type - 筛选素材类型
 */
export async function GET(request: NextRequest) {
    try {
        const user = await requireAuth();

        const { searchParams } = new URL(request.url);
        const type = searchParams.get("type") as MaterialType | null;

        const db = await getDb();

        let query = db
            .select()
            .from(materials)
            .where(
                and(
                    eq(materials.userId, user.id),
                    eq(materials.deleted, false),
                ),
            );

        // 如果指定了类型，添加类型筛选
        if (type) {
            query = db
                .select()
                .from(materials)
                .where(
                    and(
                        eq(materials.userId, user.id),
                        eq(materials.deleted, false),
                        eq(materials.type, type),
                    ),
                );
        }

        const result = await query.orderBy(desc(materials.createdAt));

        return NextResponse.json({
            materials: result.map((m) => {
                const content = JSON.parse(m.content) as {
                    fileKeys?: string[];
                };
                return {
                    ...m,
                    content,
                };
            }),
        });
    } catch (error) {
        console.error("Error listing materials:", error);

        if (
            error instanceof Error &&
            error.message === "Authentication required"
        ) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }

        return NextResponse.json(
            { error: "Failed to list materials" },
            { status: 500 },
        );
    }
}

/**
 * POST /api/material
 * 创建新素材
 */
export async function POST(request: NextRequest) {
    try {
        const user = await requireAuth();

        const body = (await request.json()) as CreateMaterialRequest;
        const { name, type, content, thumbnail } = body;

        if (!name || !type || !content) {
            return NextResponse.json(
                { error: "Missing required fields: name, type, content" },
                { status: 400 },
            );
        }

        const db = await getDb();

        const result = await db
            .insert(materials)
            .values({
                userId: user.id,
                name,
                type,
                content: JSON.stringify(content),
                thumbnail,
            })
            .returning({ id: materials.id });

        return NextResponse.json({
            materialId: result[0].id,
        });
    } catch (error) {
        console.error("Error creating material:", error);

        if (
            error instanceof Error &&
            error.message === "Authentication required"
        ) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }

        return NextResponse.json(
            { error: "Failed to create material" },
            { status: 500 },
        );
    }
}

/**
 * DELETE /api/material
 * 删除素材（软删除）
 */
export async function DELETE(request: NextRequest) {
    try {
        const user = await requireAuth();

        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json(
                { error: "Missing material id" },
                { status: 400 },
            );
        }

        const db = await getDb();

        await db
            .update(materials)
            .set({ deleted: true })
            .where(
                and(
                    eq(materials.id, parseInt(id)),
                    eq(materials.userId, user.id),
                ),
            );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting material:", error);

        if (
            error instanceof Error &&
            error.message === "Authentication required"
        ) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }

        return NextResponse.json(
            { error: "Failed to delete material" },
            { status: 500 },
        );
    }
}

/**
 * PATCH /api/material
 * 切换素材收藏状态
 */
export async function PATCH(request: NextRequest) {
    try {
        const user = await requireAuth();

        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json(
                { error: "Missing material id" },
                { status: 400 },
            );
        }

        const db = await getDb();

        // 先获取当前状态
        const existing = await db
            .select({ isFavorite: materials.isFavorite })
            .from(materials)
            .where(
                and(
                    eq(materials.id, parseInt(id)),
                    eq(materials.userId, user.id),
                ),
            )
            .limit(1);

        if (existing.length === 0) {
            return NextResponse.json(
                { error: "Material not found" },
                { status: 404 },
            );
        }

        const newFavoriteStatus = !existing[0].isFavorite;

        // 更新状态
        await db
            .update(materials)
            .set({ isFavorite: newFavoriteStatus })
            .where(
                and(
                    eq(materials.id, parseInt(id)),
                    eq(materials.userId, user.id),
                ),
            );

        return NextResponse.json({ isFavorite: newFavoriteStatus });
    } catch (error) {
        console.error("Error toggling favorite:", error);

        if (
            error instanceof Error &&
            error.message === "Authentication required"
        ) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }

        return NextResponse.json(
            { error: "Failed to toggle favorite" },
            { status: 500 },
        );
    }
}
