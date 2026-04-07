/**
 * 文件工具函数
 *
 * 替代 R2，将文件保存到本地 data/uploads/ 目录。
 */

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";

const UPLOADS_DIR = path.resolve(process.cwd(), "data", "uploads");

/**
 * 将字节数据保存到本地，返回 fileKey
 */
export async function saveFile(
    data: Buffer | Uint8Array,
    ext: string,
    taskId?: string,
): Promise<string> {
    const dir = taskId ? path.join(UPLOADS_DIR, "tasks", taskId) : UPLOADS_DIR;

    await mkdir(dir, { recursive: true });

    const filename = `${nanoid()}.${ext}`;
    const filePath = path.join(dir, filename);

    await writeFile(filePath, data);

    // 返回相对于 uploads 根目录的路径作为 fileKey
    return path.relative(UPLOADS_DIR, filePath);
}

/**
 * 从 URL 下载文件并保存到本地
 */
export async function downloadAndSave(
    url: string,
    ext: string,
    taskId?: string,
): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(
            `Download failed: ${response.status} ${response.statusText}`,
        );
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return saveFile(buffer, ext, taskId);
}

/**
 * 获取文件的公开访问 URL（相对路径）
 */
export function getFileUrl(fileKey: string): string {
    return `/api/uploads/${fileKey}`;
}
