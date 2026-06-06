/**
 * Client file validation utilities
 *
 * Validate file size before upload
 */

import { getClientTranslator } from "@/i18n/client";
import type { ValidationResult } from "@/lib/upload/limits";

export type { ValidationResult } from "@/lib/upload/limits";

// ============================================================================
// File metadata reading
// ============================================================================

/**
 * Read image dimensions
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
            reject(new Error(getClientTranslator("Upload")("readImageFailed")));
        };

        img.src = url;
    });
}

/**
 * Read video metadata
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
            reject(new Error(getClientTranslator("Upload")("readVideoFailed")));
        };

        video.src = url;
    });
}

// ============================================================================
// File type checks
// ============================================================================

export function isImageFile(file: File): boolean {
    return file.type.startsWith("image/");
}

export function isVideoFile(file: File): boolean {
    return file.type.startsWith("video/");
}

// ============================================================================
// Combined validation function
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
 * Validate whether the file meets upload limits
 */
export async function validateFile(file: File): Promise<FileValidationResult> {
    // Unified 50MB file size limit
    const MAX_FILE_SIZE = 50 * 1024 * 1024;

    if (file.size > MAX_FILE_SIZE) {
        return {
            allowed: false,
            message: getClientTranslator("Upload")("sizeLimit50MB"),
            maxAllowed: MAX_FILE_SIZE,
            fileInfo: { size: file.size },
        };
    }

    // Read media file information (only to return metadata, not for limits)
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
// Custom error class
// ============================================================================

export class UploadValidationError extends Error {
    code = "UPLOAD_VALIDATION_ERROR";
    maxAllowed?: number;
    fileInfo?: FileValidationResult["fileInfo"];

    constructor(result: FileValidationResult) {
        super(result.message || "File does not meet upload requirements");
        this.maxAllowed = result.maxAllowed;
        this.fileInfo = result.fileInfo;
    }
}
