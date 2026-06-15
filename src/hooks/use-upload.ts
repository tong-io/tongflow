/**
 * File upload hook - simplified for open-source version
 * Uploads files directly to local server
 */

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { showErrorToast } from "@/components/ui/error-toast";
import { getPresignedUploadUrl, UploadValidationError } from "@/lib/api/upload";
import { logger } from "@/lib/logger";

// -------------------- Type definitions --------------------

export interface UploadResponse {
    url: string;
    key: string;
    size: number;
}

export interface UploadState {
    isUploading: boolean;
    progress: number;
    error: Error | null;
    uploadedFiles: UploadResponse[];
}

export interface UseUploadOptions {
    onSuccess?: (response: UploadResponse) => void;
    onError?: (error: Error) => void;
    onProgress?: (progress: number) => void;
}

export interface UseMultipleUploadOptions {
    onSuccess?: (responses: UploadResponse[]) => void;
    onError?: (error: Error) => void;
    onProgress?: (progress: number) => void;
    onFileComplete?: (response: UploadResponse, index: number) => void;
}

// -------------------- Single-file upload hook --------------------

export function useUpload(options?: UseUploadOptions) {
    const t = useTranslations("Upload");
    const [state, setState] = useState<UploadState>({
        isUploading: false,
        progress: 0,
        error: null,
        uploadedFiles: [],
    });

    const upload = useCallback(
        async (file: File): Promise<UploadResponse | null> => {
            setState({
                isUploading: true,
                progress: 0,
                error: null,
                uploadedFiles: [],
            });

            try {
                setState((prev) => ({ ...prev, progress: 30 }));
                const data = await getPresignedUploadUrl(file);
                setState((prev) => ({ ...prev, progress: 100 }));

                const response: UploadResponse = {
                    url: data.url,
                    key: data.fileKey,
                    size: file.size,
                };

                setState((prev) => ({
                    ...prev,
                    isUploading: false,
                    progress: 100,
                    uploadedFiles: [response],
                }));

                options?.onSuccess?.(response);
                return response;
            } catch (err) {
                const error =
                    err instanceof Error ? err : new Error("Upload failed");
                setState((prev) => ({ ...prev, isUploading: false, error }));

                if (err instanceof UploadValidationError) {
                    showErrorToast({ message: err.message });
                } else {
                    showErrorToast({ message: t("failed") });
                }

                options?.onError?.(error);
                return null;
            }
        },
        [options, t],
    );

    const reset = useCallback(() => {
        setState({
            isUploading: false,
            progress: 0,
            error: null,
            uploadedFiles: [],
        });
    }, []);

    return { ...state, upload, reset };
}

// -------------------- Multi-file upload hook --------------------

export function useMultipleUpload(options?: UseMultipleUploadOptions) {
    const t = useTranslations("Upload");
    const [state, setState] = useState<UploadState>({
        isUploading: false,
        progress: 0,
        error: null,
        uploadedFiles: [],
    });

    const upload = useCallback(
        async (files: File[]): Promise<UploadResponse[]> => {
            if (files.length === 0) return [];

            setState({
                isUploading: true,
                progress: 0,
                error: null,
                uploadedFiles: [],
            });

            try {
                const results: UploadResponse[] = [];
                let completed = 0;

                for (const file of files) {
                    try {
                        const data = await getPresignedUploadUrl(file);
                        const response: UploadResponse = {
                            url: data.url,
                            key: data.fileKey,
                            size: file.size,
                        };
                        results.push(response);
                        options?.onFileComplete?.(response, completed);
                    } catch (err) {
                        logger.error(
                            `Failed to upload file ${file.name}:`,
                            err,
                        );
                    }

                    completed++;
                    const progress = Math.round(
                        (completed / files.length) * 100,
                    );
                    setState((prev) => ({ ...prev, progress }));
                    options?.onProgress?.(progress);
                }

                setState((prev) => ({
                    ...prev,
                    isUploading: false,
                    progress: 100,
                    uploadedFiles: results,
                }));

                options?.onSuccess?.(results);
                return results;
            } catch (err) {
                const error =
                    err instanceof Error ? err : new Error("Upload failed");
                setState((prev) => ({ ...prev, isUploading: false, error }));

                if (err instanceof UploadValidationError) {
                    showErrorToast({ message: err.message });
                } else {
                    showErrorToast({ message: t("partialFailed") });
                }

                options?.onError?.(error);
                return [];
            }
        },
        [options, t],
    );

    const reset = useCallback(() => {
        setState({
            isUploading: false,
            progress: 0,
            error: null,
            uploadedFiles: [],
        });
    }, []);

    return { ...state, upload, reset };
}

// -------------------- Drag-and-drop upload hook --------------------

export function useDropzone(options?: {
    onDrop?: (files: File[]) => void;
    accept?: string;
    maxSize?: number;
    maxFiles?: number;
}) {
    const tUpload = useTranslations("Upload");
    const [isDragActive, setIsDragActive] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const validateFiles = useCallback(
        (files: File[]): File[] => {
            setError(null);
            if (options?.maxFiles && files.length > options.maxFiles) {
                setError(
                    tUpload("maxFilesExceeded", { max: options.maxFiles }),
                );
                return [];
            }
            const validFiles: File[] = [];
            for (const file of files) {
                if (options?.maxSize && file.size > options.maxSize) {
                    setError(
                        tUpload("fileTooLarge", {
                            name: file.name,
                            max: Math.round(options.maxSize / 1024 / 1024),
                        }),
                    );
                    continue;
                }
                if (options?.accept) {
                    const acceptedTypes = options.accept
                        .split(",")
                        .map((t) => t.trim());
                    const isAccepted = acceptedTypes.some((type) => {
                        if (type.endsWith("/*"))
                            return file.type.startsWith(
                                `${type.split("/")[0]}/`,
                            );
                        return type === file.type;
                    });
                    if (!isAccepted) {
                        setError(
                            tUpload("fileTypeNotAccepted", {
                                name: file.name,
                            }),
                        );
                        continue;
                    }
                }
                validFiles.push(file);
            }
            return validFiles;
        },
        [options, tUpload],
    );

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(true);
    }, []);
    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);
    }, []);
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);
    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragActive(false);
            const files = Array.from(e.dataTransfer.files);
            const validFiles = validateFiles(files);
            if (validFiles.length > 0) options?.onDrop?.(validFiles);
        },
        [validateFiles, options],
    );
    const handleFileInput = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const files = Array.from(e.target.files || []);
            const validFiles = validateFiles(files);
            if (validFiles.length > 0) options?.onDrop?.(validFiles);
        },
        [validateFiles, options],
    );

    return {
        isDragActive,
        error,
        handleDragEnter,
        handleDragLeave,
        handleDragOver,
        handleDrop,
        handleFileInput,
        getRootProps: () => ({
            onDragEnter: handleDragEnter,
            onDragLeave: handleDragLeave,
            onDragOver: handleDragOver,
            onDrop: handleDrop,
        }),
        getInputProps: () => ({
            type: "file" as const,
            onChange: handleFileInput,
            accept: options?.accept,
            multiple: (options?.maxFiles ?? 1) > 1,
        }),
    };
}
