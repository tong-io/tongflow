/**
 * File upload API - simplified for open-source version.
 * Uploads directly to local server storage.
 */
import { apiClient } from "@/utils/api-client";
import {
    validateFile,
    UploadValidationError,
    type FileValidationResult,
} from "@/lib/upload-validation";

export interface PresignedUrlResponse {
    uploadUrl: string;
    fileKey: string;
    url: string;
    expiresIn: number;
    maxFileSize: number;
    tier: string;
}

export class AuthenticationError extends Error {
    public readonly status: number;
    constructor(message: string, status: number = 401) {
        super(message);
        this.name = "AuthenticationError";
        this.status = status;
    }
}

export { UploadValidationError, type FileValidationResult };

/**
 * Upload file to local server.
 * Returns a response compatible with the presigned URL interface.
 */
export async function getPresignedUploadUrl(
    file: File,
    tier: string = "free",
): Promise<PresignedUrlResponse> {
    // Client-side pre-validation
    const validation = await validateFile(file, tier);
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
        maxFileSize: 100 * 1024 * 1024, // 100MB
        tier: "free",
    };
}

export async function validateUploadFile(
    file: File,
    tier: string,
): Promise<FileValidationResult> {
    return validateFile(file, tier);
}
