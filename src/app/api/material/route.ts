import { and, desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { materials } from "@/db/schema";
import { logger } from "@/lib/logger";
import { safeJsonParse } from "@/utils/json-utils";

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
 * Material list (local single-user database)
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get("type") as MaterialType | null;

        const db = await getDb();

        let query = db
            .select()
            .from(materials)
            .where(eq(materials.deleted, false));

        if (type) {
            query = db
                .select()
                .from(materials)
                .where(
                    and(eq(materials.deleted, false), eq(materials.type, type)),
                );
        }

        const result = await query.orderBy(desc(materials.createdAt));

        return NextResponse.json({
            materials: result.map((m) => ({
                ...m,
                content: safeJsonParse<{ fileKeys?: string[] }>(m.content, {}),
            })),
        });
    } catch (error) {
        logger.error("Error listing materials:", error);

        return NextResponse.json(
            { error: "Failed to list materials" },
            { status: 500 },
        );
    }
}

/**
 * POST /api/material
 * Create a new material
 */
export async function POST(request: NextRequest) {
    try {
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
        logger.error("Error creating material:", error);

        return NextResponse.json(
            { error: "Failed to create material" },
            { status: 500 },
        );
    }
}

/**
 * DELETE /api/material
 * Soft delete
 */
export async function DELETE(request: NextRequest) {
    try {
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
            .where(eq(materials.id, parseInt(id, 10)));

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("Error deleting material:", error);

        return NextResponse.json(
            { error: "Failed to delete material" },
            { status: 500 },
        );
    }
}

/**
 * PATCH /api/material
 * Toggle favorite
 */
export async function PATCH(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json(
                { error: "Missing material id" },
                { status: 400 },
            );
        }

        const db = await getDb();

        const existing = await db
            .select({ isFavorite: materials.isFavorite })
            .from(materials)
            .where(eq(materials.id, parseInt(id, 10)))
            .limit(1);

        if (existing.length === 0) {
            return NextResponse.json(
                { error: "Material not found" },
                { status: 404 },
            );
        }

        const newFavoriteStatus = !existing[0].isFavorite;

        await db
            .update(materials)
            .set({ isFavorite: newFavoriteStatus })
            .where(eq(materials.id, parseInt(id, 10)));

        return NextResponse.json({ isFavorite: newFavoriteStatus });
    } catch (error) {
        logger.error("Error toggling favorite:", error);

        return NextResponse.json(
            { error: "Failed to toggle favorite" },
            { status: 500 },
        );
    }
}
