/**
 * File upload API - simplified for open-source version.
 * Uploads directly to local server storage.
 */

import {
    type FileValidationResult,
    UploadValidationError,
    validateFile,
} from "@/lib/upload/validation";
import { apiClient } from "./client";

export interface PresignedUrlResponse {
    uploadUrl: string;
    fileKey: string;
    url: string;
    expiresIn: number;
}

export { UploadValidationError, type FileValidationResult };

/**
 * Upload file to local server.
 * Returns a response compatible with the presigned URL interface.
 */
export async function getPresignedUploadUrl(
    file: File,
): Promise<PresignedUrlResponse> {
    // Client-side pre-validation
    const validation = await validateFile(file);
    if (!validation.allowed) {
        throw new UploadValidationError(validation);
    }

    const formData = new FormData();
    formData.append("file", file);

    const data = await apiClient<{ fileKey: string; url: string }>(
        "/api/upload",
        { method: "POST", body: formData } as RequestInit,
    );

    return {
        uploadUrl: "", // Not used in local upload
        fileKey: data.fileKey,
        url: data.url,
        expiresIn: 0,
    };
}
