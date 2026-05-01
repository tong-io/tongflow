import toast from "react-hot-toast";

/**
 * API response type
 */
interface ApiResponse<T = unknown> {
    success?: boolean;
    error?: string;
    message?: string;
    data?: T;
    [key: string]: unknown;
}

/**
 * Request configuration options
 */
interface FetchOptions extends Omit<RequestInit, "body"> {
    /**
     * Whether to show an error toast, defaults to true
     */
    showErrorToast?: boolean;
    /**
     * Whether to show a success toast, defaults to false
     */
    showSuccessToast?: boolean;
    /**
     * Custom success message
     */
    successMessage?: string;
    /**
     * Custom error message
     */
    errorMessage?: string;
    /**
     * Whether to automatically parse JSON, defaults to true
     */
    parseJson?: boolean;
    /**
     * Response timeout in milliseconds, defaults to 30000
     */
    timeout?: number;
}

/**
 * Get error message
 */
function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === "string") {
        return error;
    }
    if (
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof (error as Record<string, unknown>).message === "string"
    ) {
        return (error as Record<string, unknown>).message as string;
    }
    return "未知错误";
}

/**
 * Extract error information from an API response
 * Priority: error > errorMessage > message
 */
function extractErrorFromResponse(data: unknown): string | null {
    if (typeof data !== "object" || data === null) {
        return null;
    }

    const response = data as Record<string, unknown>;

    // Try to extract the error message from common error fields (by priority)
    // 1. error field (common error format)
    if (typeof response.error === "string" && response.error.trim()) {
        return response.error.trim();
    }

    // 2. errorMessage field
    if (
        typeof response.errorMessage === "string" &&
        response.errorMessage.trim()
    ) {
        return response.errorMessage.trim();
    }

    // 3. message field (only when it clearly indicates an error)
    if (
        typeof response.message === "string" &&
        response.message.trim() &&
        !response.success
    ) {
        return response.message.trim();
    }

    return null;
}

/**
 * Unified fetch wrapper function
 *
 * @example
 * // Simple GET request
 * const data = await apiClient('/api/users');
 *
 * @example
 * // POST request with success message
 * const result = await apiClient('/api/users', {
 *   method: 'POST',
 *   body: JSON.stringify({ name: 'John' }),
 *   showSuccessToast: true,
 *   successMessage: 'Created successfully!',
 * });
 *
 * @example
 * // Custom error handling
 * const data = await apiClient('/api/users', {
 *   errorMessage: 'Failed to load users',
 * });
 */
export async function apiClient<T = unknown>(
    url: string,
    options: FetchOptions = {},
): Promise<T> {
    const {
        showErrorToast = true,
        showSuccessToast = false,
        successMessage,
        errorMessage,
        parseJson = true,
        timeout = 30000,
        ...fetchOptions
    } = options;

    let errorToastShown = false; // Track whether an error toast has already been shown

    try {
        // Create a fetch request with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        let response: Response;
        try {
            response = await fetch(url, {
                ...fetchOptions,
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timeoutId);
        }

        // Handle response
        let data: unknown;
        if (parseJson) {
            try {
                data = await response.json();
            } catch {
                data = null;
            }
        } else {
            data = await response.text();
        }

        // Check HTTP status
        if (!response.ok) {
            // Handle authentication errors: 401 (unauthenticated) and 403 (forbidden)
            if (response.status === 401 || response.status === 403) {
                const authErrorMsg =
                    response.status === 401
                        ? "未授权访问"
                        : "拒绝访问";
                if (showErrorToast) {
                    toast.error(authErrorMsg);
                    errorToastShown = true;
                }
                const error = new Error(authErrorMsg);
                (error as Error & { status?: number }).status = response.status;
                throw error;
            }

            // Priority: custom error message > backend error > default error message
            const backendError = extractErrorFromResponse(data);
            const errorMsg =
                errorMessage ||
                backendError ||
                `请求失败: ${response.status} ${response.statusText}`;

            if (showErrorToast) {
                // Backend error message is automatically shown in the toast
                toast.error(errorMsg);
                errorToastShown = true; // Mark as shown
            }

            const error = new Error(errorMsg);
            (error as Error & { status?: number }).status = response.status;
            throw error;
        }

        // Show success message
        if (showSuccessToast) {
            const message = successMessage || "操作成功";
            toast.success(message);
        }

        return data as T;
    } catch (error) {
        // Handle network errors and other errors
        if (error instanceof Error && error.name === "AbortError") {
            const msg = errorMessage || "请求超时，请重试";
            if (showErrorToast && !errorToastShown) {
                toast.error(msg);
                errorToastShown = true;
            }
            throw new Error(msg);
        }

        // If an error toast has already been shown, just rethrow without showing again
        if (errorToastShown) {
            throw error;
        }

        // Show a generic error message (only when no toast has been shown yet)
        const msg = errorMessage || getErrorMessage(error);
        if (showErrorToast) {
            toast.error(msg);
        }

        throw error;
    }
}

/**
 * Convenience method: GET request
 */
export async function apiGet<T = unknown>(
    url: string,
    options: Omit<FetchOptions, "method" | "body"> = {},
): Promise<T> {
    return apiClient<T>(url, {
        ...options,
        method: "GET",
    });
}

/**
 * Convenience method: POST request
 */
export async function apiPost<T = unknown>(
    url: string,
    body?: unknown,
    options: Omit<FetchOptions, "method"> = {},
): Promise<T> {
    return apiClient<T>(url, {
        ...options,
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...options.headers,
        },
        body: typeof body === "string" ? body : JSON.stringify(body),
    } as RequestInit & FetchOptions);
}

/**
 * Convenience method: PUT request
 */
export async function apiPut<T = unknown>(
    url: string,
    body?: unknown,
    options: Omit<FetchOptions, "method"> = {},
): Promise<T> {
    return apiClient<T>(url, {
        ...options,
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            ...options.headers,
        },
        body: typeof body === "string" ? body : JSON.stringify(body),
    } as RequestInit & FetchOptions);
}

/**
 * Convenience method: DELETE request
 */
export async function apiDelete<T = unknown>(
    url: string,
    options: Omit<FetchOptions, "method"> = {},
): Promise<T> {
    return apiClient<T>(url, {
        ...options,
        method: "DELETE",
    });
}

/**
 * Convenience method: PATCH request
 */
export async function apiPatch<T = unknown>(
    url: string,
    body?: unknown,
    options: Omit<FetchOptions, "method"> = {},
): Promise<T> {
    return apiClient<T>(url, {
        ...options,
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            ...options.headers,
        },
        body: typeof body === "string" ? body : JSON.stringify(body),
    } as RequestInit & FetchOptions);
}
