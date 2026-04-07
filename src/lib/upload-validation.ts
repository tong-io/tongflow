/**
 * 客户端文件验证工具
 *
 * 在上传前验证文件大小
 */

import { type ValidationResult } from "@/lib/upload-limits";

export { type ValidationResult } from "@/lib/upload-limits";

// ============================================================================
// 文件元数据读取
// ============================================================================

/**
 * 读取图片分辨率
 */
export function getImageDimensions(
    file: File,
): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("无法读取图片信息"));
        };

        img.src = url;
    });
}

/**
 * 读取视频元数据
 */
export function getVideoMetadata(
    file: File,
): Promise<{ width: number; height: number; duration: number }> {
    return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        const url = URL.createObjectURL(file);

        video.preload = "metadata";

        video.onloadedmetadata = () => {
            URL.revokeObjectURL(url);
            resolve({
                width: video.videoWidth,
                height: video.videoHeight,
                duration: video.duration,
            });
        };

        video.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("无法读取视频信息"));
        };

        video.src = url;
    });
}

// ============================================================================
// 文件类型判断
// ============================================================================

export function isImageFile(file: File): boolean {
    return file.type.startsWith("image/");
}

export function isVideoFile(file: File): boolean {
    return file.type.startsWith("video/");
}

// ============================================================================
// 综合验证函数
// ============================================================================

export interface FileValidationResult extends ValidationResult {
    fileInfo?: {
        size: number;
        width?: number;
        height?: number;
        duration?: number;
    };
}

/**
 * 验证文件是否符合上传限制
 *
 * @param file 要验证的文件
 * @param _tier 用户等级（已弃用，保留参数兼容性）
 * @returns 验证结果
 */
export async function validateFile(
    file: File,
    _tier?: string,
): Promise<FileValidationResult> {
    // 统一 50MB 文件大小限制
    const MAX_FILE_SIZE = 50 * 1024 * 1024;

    if (file.size > MAX_FILE_SIZE) {
        return {
            allowed: false,
            message: `文件大小超过限制。最大允许 50MB`,
            maxAllowed: MAX_FILE_SIZE,
            fileInfo: { size: file.size },
        };
    }

    // 读取媒体文件信息（仅用于返回元数据，不做限制）
    if (isImageFile(file)) {
        try {
            const { width, height } = await getImageDimensions(file);
            return {
                allowed: true,
                fileInfo: { size: file.size, width, height },
            };
        } catch {
            return { allowed: true, fileInfo: { size: file.size } };
        }
    }

    if (isVideoFile(file)) {
        try {
            const { width, height, duration } = await getVideoMetadata(file);
            return {
                allowed: true,
                fileInfo: { size: file.size, width, height, duration },
            };
        } catch {
            return { allowed: true, fileInfo: { size: file.size } };
        }
    }

    return {
        allowed: true,
        fileInfo: { size: file.size },
    };
}

// ============================================================================
// 自定义错误类
// ============================================================================

export class UploadValidationError extends Error {
    code = "UPLOAD_VALIDATION_ERROR";
    requiredTier?: string;
    maxAllowed?: number;
    fileInfo?: FileValidationResult["fileInfo"];

    constructor(result: FileValidationResult) {
        super(result.message || "文件不符合上传要求");
        this.requiredTier = result.requiredTier;
        this.maxAllowed = result.maxAllowed;
        this.fileInfo = result.fileInfo;
    }
}
